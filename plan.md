# SnapLLM: Gemini File API Migration Plan

> **For the next model**: Read this entire document before writing a single line of code. Every section builds on the previous one. I've written this as if you're a new team member inheriting the codebase.

---

## Table of Contents

1. [Context: What SnapLLM Is](#1-context-what-snapllm-is)
2. [The Old Architecture (Base64 Model)](#2-the-old-architecture-base64-model)
3. [The New Architecture (Path-Only Model) — Already Done](#3-the-new-architecture-path-only-model--already-done)
4. [What You Are Building: Gemini File API Migration](#4-what-you-are-building-gemini-file-api-migration)
5. [Gemini File API — How It Works](#5-gemini-file-api--how-it-works)
6. [The Migration: Step by Step](#6-the-migration-step-by-step)
7. [File-by-File Breakdown](#7-file-by-file-breakdown)
8. [Edge Cases and Challenges](#8-edge-cases-and-challenges)
9. [Verification Checklist](#9-verification-checklist)

---

## 1. Context: What SnapLLM Is

SnapLLM is a **Tauri desktop app** (Rust backend + React/TypeScript frontend). It started as a **screen analyzer** — user captures a screenshot, the app sends it to Google Gemini for instant analysis, and also runs local OCR (PaddleOCR sidecar) on the image.

The key design advantage: **we are NOT a web app**. We run on the user's machine. We have direct filesystem access via Rust. This is a superpower that web apps don't have.

The app uses **BYOK (Bring Your Own Key)** — users provide their own Gemini API key.

### Core user flows

1. **Screen Capture → Analyze** — User hits global shortcut, selects screen area, image is analyzed by Gemini
2. **Drag & Drop / Paste image** — User drops or pastes an image for analysis
3. **Chat** — After the initial analysis, user can continue chatting with Gemini about the image
4. **Chat Attachments** — User can attach files (images, code, PDFs, etc.) to chat messages

---

## 2. The Old Architecture (Base64 Model)

### How it worked — the web-app way

```
┌─────────────────────────────────────────────────────────────┐
│ OLD FLOW (what we're migrating FROM)                        │
│                                                             │
│ User drops image → UI reads bytes → UI converts to base64   │
│ → UI stores base64 string in React state                    │
│ → UI sends base64 string to Rust → Rust wraps in            │
│   GeminiPart { inlineData: { data: base64 } }               │
│ → Rust POSTs to Gemini API                                  │
│                                                             │
│ On EVERY subsequent chat turn, the ~5MB base64 string       │
│ is re-sent in the request body.                             │
└─────────────────────────────────────────────────────────────┘
```

### Why it's bad

| Problem                                                            | Impact                                   |
| ------------------------------------------------------------------ | ---------------------------------------- |
| UI converts image → base64 (via `fetch()` → `blob` → `FileReader`) | **Spinner/lag** on the UI thread         |
| Base64 string stored in React module state (`storedImageBase64`)   | **Memory bloat** in the renderer process |
| Base64 string re-sent on every chat turn                           | **Slow requests**, wasted bandwidth      |
| Base64 can't handle large files (PDFs, videos)                     | **20MB limit** on inline data            |
| Attachments (code files, PDFs) have no path to reach Gemini        | **Feature gap**                          |

### Where the base64 conversion happens (current code)

The pattern appears in **4 places** in `useChat.ts`:

```typescript
// useChat.ts — THIS PATTERN APPEARS 4 TIMES:
let finalBase64 = startupImage.base64; // actually an asset:// URL
if (startupImage.isFilePath) {
  const res = await fetch(startupImage.base64); // fetch via Tauri asset protocol
  const blob = await res.blob();
  finalBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob); // convert to data:image/...;base64,...
  });
}
```

This pattern exists in:

- `startSession()` — line ~214
- Stream path for retrySession — line ~372
- `handleRetry()` — line ~710
- `handleEdit()` — line ~834

---

## 3. The New Architecture (Path-Only Model) — Already Done

We already refactored the **UI input layer** to be path-only. Here's what was changed:

### Files already refactored ✅

| File                                                         | What changed                                                                                                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/src/features/onboarding/components/Welcome/Welcome.tsx`  | Removed `handleFileProcess` (arrayBuffer fallback), hidden `<input type="file">`, `ALLOWED_TYPES`. Now uses only `tauri://drag-drop` (paths) and `read_clipboard_image` (Rust CAS).                             |
| `ui/src/features/chat/components/ChatInput/ChatInput.tsx`    | Replaced HTML5 D&D with `tauri://drag-drop` event listener. Both image and non-image files now go through `store_image_from_path` or `store_file_from_path` Rust commands. Ctrl+V calls `read_clipboard_image`. |
| `ui/src/features/chat/components/ChatInput/InputActions.tsx` | Replaced hidden `<input type="file">` with `@tauri-apps/plugin-dialog` native `open()` dialog. Returns absolute paths.                                                                                          |
| `ui/src/features/chat/components/ChatBubble/ChatBubble.tsx`  | Fixed edit-save bug: regex for extracting attachment paths was wrong (`[Attachment:]()` format) — changed to `{{path}}` format.                                                                                 |
| `crates/ops-chat-storage/src/storage.rs`                     | Added `store_file()` and `store_file_from_path()` — CAS storage that preserves original file extensions (not hardcoded `.png`).                                                                                 |
| `app/src/commands/chat.rs`                                   | Added `store_file_from_path` Tauri command.                                                                                                                                                                     |
| `app/src/lib.rs`                                             | Registered `store_file_from_path` in invoke handler.                                                                                                                                                            |

### The new input flow

```
┌─────────────────────────────────────────────────────────────┐
│ NEW INPUT FLOW (already implemented)                        │
│                                                             │
│ D&D → tauri://drag-drop → OS gives absolute path            │
│ Paperclip → native dialog → OS gives absolute path          │
│ Ctrl+V → invoke("read_clipboard_image") → Rust reads        │
│          clipboard pixels → writes to CAS → returns path    │
│ Capture → backend writes to CAS → emits event with path     │
│                                                             │
│ ALL inputs now produce a CAS path. UI never touches bytes.  │
└─────────────────────────────────────────────────────────────┘
```

### CAS (Content Addressable Storage) structure

```
~/.config/snapllm/profiles/<profile_id>/chats/objects/
├── ab/
│   ├── ab1234...hash.png       ← image stored by store_image()
│   └── ab5678...hash.py        ← file stored by store_file() (preserves extension)
├── cd/
│   └── cd9012...hash.pdf
```

All files are hashed with **BLAKE3**. Deduplication is automatic. The CAS path is what gets stored in chat messages as `{{/path/to/cas/object}}`.

---

## 4. What You Are Building: Gemini File API Migration

### The goal

Replace `inlineData` (base64) with `fileData` (fileUri) everywhere in the Gemini API integration.

```
┌─────────────────────────────────────────────────────────────┐
│ TARGET FLOW (what you're building)                          │
│                                                             │
│ CAS path on disk → Rust reads file from CAS                 │
│ → Rust uploads binary to Gemini File API                    │
│ → Gemini returns a fileUri string                           │
│ → Rust stores fileUri in AppState                           │
│ → On chat turn: Rust sends GeminiPart { fileData:           │
│     { fileUri: "...", mimeType: "..." } }                   │
│                                                             │
│ UI SENDS: just a path string (or nothing for the main       │
│           image, since Rust already has it)                  │
│ UI RECEIVES: streaming tokens via Tauri events              │
│ UI NEVER TOUCHES: file bytes, base64, or fileUri            │
└─────────────────────────────────────────────────────────────┘
```

### Why the File API

| Feature                 | `inlineData` (current)       | `fileData` (target)                         |
| ----------------------- | ---------------------------- | ------------------------------------------- |
| Max file size           | 20MB                         | **2GB**                                     |
| Re-upload on every turn | Yes (full base64 every time) | **No** (tiny URI string)                    |
| Token cost              | Same                         | **Same** (charged by content, not delivery) |
| File hosting cost       | N/A                          | **Free** (48-hour TTL)                      |
| Supported types         | Images only                  | **Images, PDF, code, audio, video**         |
| UI memory               | Holds ~5MB base64 string     | **Holds nothing**                           |

---

## 5. Gemini File API — How It Works

### Step 1: Upload a file

```
POST https://generativelanguage.googleapis.com/upload/v1beta/files?key=API_KEY

Headers:
  X-Goog-Upload-Protocol: resumable
  X-Goog-Upload-Command: start
  X-Goog-Upload-Header-Content-Length: <file_size_bytes>
  X-Goog-Upload-Header-Content-Type: <mime_type>
  Content-Type: application/json

Body: { "file": { "display_name": "<filename>" } }

Response Header: X-Goog-Upload-URL → use this for the actual upload
```

Then upload the raw bytes:

```
PUT <upload_url>

Headers:
  X-Goog-Upload-Offset: 0
  X-Goog-Upload-Command: upload, finalize
  Content-Length: <file_size_bytes>

Body: <raw file bytes>

Response: {
  "file": {
    "name": "files/abc123",
    "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc123",
    "mimeType": "image/png",
    "sizeBytes": "123456",
    "state": "ACTIVE"
  }
}
```

### Step 2: Poll for processing (if state != ACTIVE)

```
GET https://generativelanguage.googleapis.com/v1beta/files/<file_id>?key=API_KEY
```

Wait until `state` is `"ACTIVE"`. For images this is instant. For videos/large PDFs it may take seconds.

### Step 3: Use in generateContent

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "fileData": {
            "mimeType": "image/png",
            "fileUri": "https://generativelanguage.googleapis.com/v1beta/files/abc123"
          }
        },
        {
          "text": "Describe this image"
        }
      ]
    }
  ]
}
```

### Step 4: File expires after 48 hours automatically

No cleanup needed. Google deletes it. If the user resumes a chat after 48h, you just re-upload from CAS (the file is still on disk).

---

## 6. The Migration: Step by Step

> **IMPORTANT**: This migration uses a **phased rollout** strategy. Each phase is independently deployable and testable. Do NOT skip ahead. Complete and verify each phase before starting the next.

---

### Phase A: Backend Infrastructure (Zero UI Changes)

**Goal**: Make the Rust backend File-API-capable while keeping full backward compatibility. The UI continues to send base64 — nothing breaks.

#### A.1: Create `app/src/commands/gemini_files.rs`

```rust
pub struct GeminiFileRef {
    pub file_uri: String,
    pub mime_type: String,
    pub display_name: String,
    pub uploaded_at: chrono::DateTime<chrono::Utc>,
}
```

Functions to implement:

1. **`upload_file_to_gemini(api_key, file_path, mime_type, display_name) → GeminiFileRef`**
   - Reads file from disk (CAS path)
   - Performs two-step resumable upload to Gemini File API
   - Returns `{ file_uri, mime_type, state }`

2. **`poll_file_status(api_key, file_name) → FileState`**
   - Checks if uploaded file is `ACTIVE`
   - Only needed for video/audio files (images and code are instant)

3. **`ensure_file_uploaded(api_key, cas_path, cache) → GeminiFileRef`**
   - Checks the `gemini_file_cache` for an existing non-expired `fileUri`
   - If cached and fresh (<47h): return cached ref
   - If expired or missing: upload → cache → return
   - This is the main entry point other commands will call

#### A.2: Add `gemini_file_cache` to `AppState` (`state.rs`)

```rust
// Map CAS hash → Gemini fileUri (avoids re-uploading same file)
pub gemini_file_cache: Mutex<HashMap<String, GeminiFileRef>>
```

#### A.3: Update `gemini.rs` structs

Add `fileData` support to the existing `GeminiPart`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(rename = "inlineData", skip_serializing_if = "Option::is_none")]
    inline_data: Option<GeminiInlineData>,
    #[serde(rename = "fileData", skip_serializing_if = "Option::is_none")]
    file_data: Option<GeminiFileData>,      // ← NEW
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiFileData {
    #[serde(rename = "mimeType")]
    mime_type: String,
    #[serde(rename = "fileUri")]
    file_uri: String,
}
```

#### A.4: Make Gemini commands accept BOTH base64 AND path

Do NOT remove `image_base64` yet. Add `image_path` as an **additional** optional parameter:

| Command                 | Keep (for now)                                                    | Add                          |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------- |
| `stream_gemini_chat_v2` | `image_base64: Option<String>`, `image_mime_type: Option<String>` | `image_path: Option<String>` |
| `start_chat_sync`       | `image_base64: String`, `image_mime_type: String`                 | `image_path: Option<String>` |
| `generate_chat_title`   | `image_base64: String`, `image_mime_type: String`                 | `image_path: Option<String>` |

Inside each command, the logic:

```rust
if let Some(path) = image_path {
    // NEW: Upload via File API → use fileData
    let file_ref = ensure_file_uploaded(&api_key, &path, &cache).await?;
    parts.push(GeminiPart {
        file_data: Some(GeminiFileData {
            mime_type: file_ref.mime_type,
            file_uri: file_ref.file_uri,
        }),
        ..Default::default()
    });
} else if let Some(b64) = image_base64 {
    // OLD: Fallback to inlineData (still works while UI migrates)
    parts.push(GeminiPart {
        inline_data: Some(GeminiInlineData {
            mime_type: image_mime_type.unwrap_or_default(),
            data: b64,
        }),
        ..Default::default()
    });
}
```

#### A.5: Verify Phase A

The UI is unchanged. Everything still works exactly as before because the UI is still passing `imageBase64`. But now if you manually invoke the command with `imagePath`, it uses the File API. Test both paths.

---

### Phase B: Switch UI to Pass Paths (Remove Base64 from UI)

**Goal**: The UI stops converting images to base64 entirely and sends CAS paths to the backend.

#### B.1: Refactor `client.ts`

1. **Remove** `storedImageBase64` and `storedMimeType` module variables
2. **Add** `storedImagePath: string | null` — just the CAS path
3. **Remove** `cleanBase64()` helper function
4. **Update** all `invoke()` calls to pass `imagePath` instead of `imageBase64`/`imageMimeType`

Functions to change:

| Function               | Current                                     | New                        |
| ---------------------- | ------------------------------------------- | -------------------------- |
| `startNewChatSync()`   | Sends `imageBase64`, `imageMimeType`        | Send `imagePath`           |
| `startNewChatStream()` | Sends `imageBase64`, `imageMimeType`        | Send `imagePath`           |
| `sendMessage()`        | Re-sends stored base64 on first user turn   | Send `storedImagePath`     |
| `retryFromMessage()`   | Accepts `fallbackImage.base64`              | Accept `fallbackImagePath` |
| `editUserMessage()`    | Accepts `fallbackImage.base64`              | Accept `fallbackImagePath` |
| `restoreSession()`     | Accepts `savedImageBase64`, `savedMimeType` | Accept `savedImagePath`    |

#### B.2: Refactor `useChat.ts`

This 954-line hook is where the worst base64 patterns live. Changes:

1. **Delete all 4 instances** of the `fetch() → blob → FileReader → base64` pattern
2. **Change** `startupImage.base64` references to pass the CAS path directly
3. **Change** `fallbackImage` type from `{ base64, mimeType }` to `string` (just a path)
4. **Remove** calls to `invoke("read_file_base64", ...)` in `restoreState()`

The `startupImage` type that flows through the app:

```typescript
// CURRENT (confusing: `.base64` actually holds an asset:// URL when isFilePath=true)
startupImage: {
  base64: string;           // asset://localhost/path or actual base64 string
  mimeType: string;
  isFilePath?: boolean;
  fromHistory?: boolean;
}

// TARGET (clean: always a CAS path)
startupImage: {
  path: string;             // /home/user/.config/snapllm/.../objects/ab/hash.png
  mimeType: string;
  imageId: string;          // the CAS hash
  fromHistory?: boolean;
}
```

> **WARNING**: Changing the `startupImage` type is a **deep refactor**. It flows through `useShell.ts` → `useChat.ts` → `ImageShell.tsx` → `useSystemSync.ts`. Touch carefully.

#### B.3: Verify Phase B

- All startup flows work (capture, D&D, paste, CLI)
- Chat works (initial analysis, follow-up messages, retry, edit)
- `grep -r "FileReader\|readAsDataURL" ui/src/features/chat/` returns zero results
- `grep -r "storedImageBase64" ui/src/` returns zero results

---

### Phase C: Chat Attachment File API Migration

**Goal**: When a user sends a chat message with `{{/path/to/file}}` attachments, each file is uploaded to the Gemini File API.

#### C.1: Interleaved attachment parsing

> **CRITICAL**: Do NOT strip `{{path}}` tokens and append `fileData` parts at the end. Gemini understands **interleaved** multimodal content. Preserve the user's ordering.

If the user types: _"Compare `{{/path/img1.png}}` on the left with `{{/path/img2.png}}` on the right"_

The request must be:

```json
[
  { "text": "Compare " },
  { "fileData": { "mimeType": "image/png", "fileUri": "..." } },
  { "text": " on the left with " },
  { "fileData": { "mimeType": "image/png", "fileUri": "..." } },
  { "text": " on the right" }
]
```

Rust implementation:

```rust
/// Parse message text with {{path}} tokens into interleaved GeminiParts.
/// Splits by regex, alternating between text chunks and file references.
async fn build_interleaved_parts(
    text: &str,
    api_key: &str,
    cache: &Mutex<HashMap<String, GeminiFileRef>>,
) -> Result<Vec<GeminiPart>, String> {
    let re = Regex::new(r"\{\{([^}]+)\}\}").unwrap();
    let mut parts = Vec::new();
    let mut last_end = 0;

    for cap in re.captures_iter(text) {
        let full_match = cap.get(0).unwrap();
        let path = &cap[1];

        // Text before this token
        let before = &text[last_end..full_match.start()];
        if !before.trim().is_empty() {
            parts.push(GeminiPart { text: Some(before.to_string()), ..Default::default() });
        }

        // Upload file and add fileData part
        let file_ref = ensure_file_uploaded(api_key, path, cache).await?;
        parts.push(GeminiPart {
            file_data: Some(GeminiFileData {
                mime_type: file_ref.mime_type,
                file_uri: file_ref.file_uri,
            }),
            ..Default::default()
        });

        last_end = full_match.end();
    }

    // Remaining text after last token
    let remaining = &text[last_end..];
    if !remaining.trim().is_empty() {
        parts.push(GeminiPart { text: Some(remaining.to_string()), ..Default::default() });
    }

    Ok(parts)
}
```

#### C.2: Concurrent file uploads

If a message references multiple files, upload them **concurrently** using `tokio::join!` or `FuturesUnordered`.

Do NOT upload sequentially — that would be `N × upload_latency` instead of `max(upload_latency)`.

```rust
use futures::future::join_all;

// Collect all paths first, then upload concurrently
let paths: Vec<String> = extract_paths_from_message(&text);
let upload_futures = paths.iter().map(|p| {
    ensure_file_uploaded(&api_key, p, &cache)
});
let results = join_all(upload_futures).await;
```

Then build the interleaved parts with the resolved `fileUri` values.

#### C.3: Verify Phase C

- User attaches image via paperclip → AI sees it
- User attaches PDF via paperclip → AI reads it
- User attaches .py file → AI sees code
- User drags file into chat → AI sees it
- Multiple attachments in one message work
- Attachment ordering is preserved in AI understanding

---

### Phase D: Delete Dead Code

**Goal**: Remove all base64 remnants. Only do this AFTER Phases A–C are proven stable.

1. **Remove** `inlineData` fallback from Gemini commands (the `else if let Some(b64)` branch)
2. **Remove** `image_base64` and `image_mime_type` parameters from all Gemini commands
3. **Remove** `read_file_base64` command from `image.rs` and `lib.rs`
4. **Remove** `process_image_bytes` command if no longer used
5. **Remove** `store_image_bytes` command if no longer called from UI
6. **Remove** `cleanBase64()` from `client.ts` (if not already removed in Phase B)
7. **Remove** the `isFilePath` flag from `startupImage` type
8. **Remove** `GeminiInlineData` struct from `gemini.rs` if fully unused

#### D.1: Verify Phase D

```bash
# All of these should return zero results:
grep -r "base64" ui/src/lib/api/gemini/
grep -r "inlineData\|inline_data" app/src/commands/gemini.rs
grep -r "FileReader\|readAsDataURL" ui/src/features/chat/
grep -r "storedImageBase64" ui/src/
```

---

## 7. File-by-File Breakdown

### Files to CREATE

| File                               | Purpose                           |
| ---------------------------------- | --------------------------------- |
| `app/src/commands/gemini_files.rs` | Gemini File API upload/poll logic |

### Files to HEAVILY MODIFY

| File                                    | Lines | What changes                                                                                                                    |
| --------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| `app/src/commands/gemini.rs`            | 456   | Add `GeminiFileData` struct, change all 4 commands from `image_base64` → `image_path`, use `file_data` instead of `inline_data` |
| `ui/src/lib/api/gemini/client.ts`       | 492   | Remove all base64 state, change all functions to pass paths, remove `cleanBase64`                                               |
| `ui/src/features/chat/hooks/useChat.ts` | 954   | Delete 4 fetch→blob→base64 patterns, change `startupImage` type, remove `read_file_base64` calls                                |

### Files to MODERATELY MODIFY

| File                            | What changes                                                        |
| ------------------------------- | ------------------------------------------------------------------- |
| `app/src/lib.rs`                | Register new `gemini_files` commands, remove dead commands          |
| `app/src/state.rs`              | Add `gemini_file_cache: Mutex<HashMap<String, GeminiFileRef>>`      |
| `app/src/commands/image.rs`     | Remove `read_file_base64`, `process_image_bytes` if dead            |
| `app/src/services/image.rs`     | Remove `process_bytes_internal` if dead                             |
| `ui/src/shell/useShell.ts`      | Update `startupImage` type if it changes, update `handleImageReady` |
| `ui/src/hooks/useSystemSync.ts` | Update `startupImage` construction if type changes                  |

### Files already correct (DO NOT TOUCH)

| File                                                         | Why                                        |
| ------------------------------------------------------------ | ------------------------------------------ |
| `ui/src/features/chat/components/ChatInput/ChatInput.tsx`    | Already path-only                          |
| `ui/src/features/chat/components/ChatInput/InputActions.tsx` | Already uses native dialog                 |
| `ui/src/features/chat/components/ChatBubble/ChatBubble.tsx`  | Already handles `{{path}}` tokens          |
| `ui/src/features/onboarding/components/Welcome/Welcome.tsx`  | Already path-only                          |
| `crates/ops-chat-storage/src/storage.rs`                     | Already has `store_file_from_path`         |
| `app/src/commands/chat.rs`                                   | Already has `store_file_from_path` command |
| `app/src/commands/ocr.rs`                                    | Already accepts paths                      |

---

## 8. Edge Cases and Challenges

### Challenge 1: File URI Expiration (48h TTL)

Gemini File API files expire after 48 hours. If a user resumes a chat after 2 days:

- The cached `fileUri` is stale
- **Solution — two layers of defense**:

**Layer 1: Local clock check (optimization)**

```rust
pub struct GeminiFileRef {
    pub file_uri: String,
    pub mime_type: String,
    pub uploaded_at: chrono::DateTime<chrono::Utc>,
}

fn is_uri_expired(file_ref: &GeminiFileRef) -> bool {
    chrono::Utc::now() - file_ref.uploaded_at > chrono::Duration::hours(47)
}
```

If >47h old, proactively re-upload before even trying the request.

**Layer 2: Error-based retry (safety net)**

Google can also invalidate files early (quota, key revocation, internal cleanup). The local clock is NOT sufficient alone. You MUST also catch request failures:

```rust
// Pseudocode for the retry wrapper
async fn send_with_retry(request, api_key, cache, cas_path) -> Result<Response> {
    match send_to_gemini(request).await {
        Ok(response) => Ok(response),
        Err(e) if is_stale_file_error(&e) => {
            // Invalidate cache, re-upload from CAS, rebuild request, retry ONCE
            cache.remove(&cas_hash);
            let new_ref = upload_file_to_gemini(&api_key, &cas_path).await?;
            cache.insert(cas_hash, new_ref);
            let new_request = rebuild_request_with_new_uri(...);
            send_to_gemini(new_request).await  // if this also fails, bubble error
        }
        Err(e) => Err(e),  // non-file error, don't retry
    }
}
```

The retry is **idempotent** — re-uploading the same CAS file always produces a valid new URI.

### Challenge 2: MIME Type Detection

When the CAS stores a file, we preserve the extension. But we need the MIME type for the File API upload.

**Solution**: Use the extension to determine MIME type in Rust:

```rust
fn mime_from_extension(ext: &str) -> &str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
        "py" => "text/x-python",
        "js" | "jsx" => "text/javascript",
        "ts" | "tsx" => "text/typescript",
        "rs" => "text/x-rust",
        "css" => "text/css",
        "html" => "text/html",
        "md" => "text/markdown",
        "txt" => "text/plain",
        "json" => "application/json",
        "csv" => "text/csv",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        _ => "application/octet-stream",
    }
}
```

### Challenge 3: The `startupImage` Type Transition

The current `startupImage` type is:

```typescript
{
  base64: string;       // CONFUSING: holds asset:// URL when isFilePath=true
  mimeType: string;
  isFilePath?: boolean;
  fromHistory?: boolean;
  imageId?: string;
}
```

This type flows through 6+ files. Changing it requires updating:

- `useShell.ts` — where `handleImageReady` creates it
- `useSystemSync.ts` — where it's restored from history
- `useChat.ts` — where it's consumed
- `ImageShell.tsx` — where it's displayed
- `Welcome.tsx` — where `onImageReady` callback produces it

**Recommended approach**: Rename `base64` field to `path`, remove `isFilePath` flag, do it as a single coordinated change across all files.

### Challenge 4: Clipboard Images Have No Disk Path Initially

When user pastes from clipboard (Ctrl+V), the image only exists as pixel data in the clipboard — there's no file on disk.

**Already solved**: The `read_clipboard_image` Rust command reads clipboard pixels → encodes as PNG → stores in CAS → returns `{ hash, path }`. So by the time the UI receives it, it's already a CAS path. This works unchanged with the File API — Rust just uploads from that CAS path.

### Challenge 5: Chat Attachment Paths in Messages (Interleaved Multimodal)

Chat messages contain inline attachment references as `{{/path/to/cas/file}}`. When sending to Gemini:

> **CRITICAL**: Do NOT strip all `{{path}}` tokens and append files at the end. Gemini is a multimodal model that understands **interleaved** text and media. If the user writes _"Compare `{{img1}}` with `{{img2}}`"_, the text and files must stay in the user's original order.

1. Rust must **split** the message text by `{{...}}` boundaries
2. For each segment: create a `text` part or upload + create a `fileData` part
3. **Preserve ordering** — the output `Vec<GeminiPart>` alternates text and fileData in the same sequence the user wrote them
4. **Upload concurrently** — if multiple files exist, use `tokio::join!` / `join_all` to upload them in parallel, not sequentially

See Phase C.1 and C.2 in Section 6 for the full implementation.

---

## 9. Verification Checklist

After migration, verify ALL of these work:

### Startup flows

- [ ] Open app → screen capture → image analyzed by Gemini (path, not base64)
- [ ] Open app → paste image (Ctrl+V) → analyzed
- [ ] Open app → drag & drop image → analyzed
- [ ] CLI: `snapllm /path/to/image.png` → analyzed

### Chat flows

- [ ] Initial AI response streams correctly
- [ ] User sends follow-up text message → AI responds
- [ ] User attaches image via paperclip → AI sees it
- [ ] User attaches PDF via paperclip → AI reads it
- [ ] User attaches .py file → AI sees code
- [ ] User drags file into chat → AI sees it
- [ ] Retry (regenerate) works for initial response
- [ ] Retry works for subsequent responses
- [ ] Edit message works
- [ ] Chat title is generated correctly

### Session management

- [ ] Switching between chats restores session (without base64 in memory)
- [ ] Loading a chat from history works
- [ ] Resuming after 48h+ re-uploads file and works

### No base64 anywhere

- [ ] `grep -r "base64" ui/src/lib/api/gemini/` returns zero results (except maybe imports)
- [ ] `grep -r "inlineData\|inline_data" app/src/commands/gemini.rs` returns zero results
- [ ] `grep -r "FileReader\|readAsDataURL" ui/src/features/chat/` returns zero results
- [ ] `grep -r "storedImageBase64" ui/src/` returns zero results

### Performance

- [ ] No spinner when attaching files in ChatInput
- [ ] No spinner when starting a new chat (file upload happens in Rust background)
- [ ] Memory usage in renderer process is stable (no multi-MB strings in React state)

---

## Quick Reference: Key File Locations

```
snapllm/
├── app/src/
│   ├── commands/
│   │   ├── gemini.rs          ← HEAVY MODIFY (base64→fileUri)
│   │   ├── gemini_files.rs    ← NEW (File API upload/poll)
│   │   ├── chat.rs            ← Already has store_file_from_path ✅
│   │   ├── image.rs           ← CLEANUP (remove dead base64 commands)
│   │   └── clipboard.rs       ← Already path-only ✅
│   ├── services/
│   │   └── image.rs           ← CLEANUP (remove process_bytes_internal if dead)
│   ├── state.rs               ← ADD gemini_file_cache
│   └── lib.rs                 ← Register new commands, remove dead ones
├── crates/
│   └── ops-chat-storage/src/
│       ├── storage.rs          ← Already has store_file_from_path ✅
│       └── types.rs            ← Already has StoredImage type ✅
└── ui/src/
    ├── lib/api/gemini/
    │   ├── client.ts           ← HEAVY MODIFY (remove all base64 state)
    │   └── types.ts            ← Minor (if type changes needed)
    ├── features/chat/hooks/
    │   └── useChat.ts          ← HEAVY MODIFY (delete 4 fetch→base64 patterns)
    ├── shell/
    │   └── useShell.ts         ← MODERATE (update startupImage type)
    └── hooks/
        └── useSystemSync.ts    ← MODERATE (update startupImage construction)
```
