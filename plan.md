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

### Phase 1: New Rust Module — `gemini_files.rs`

Create `app/src/commands/gemini_files.rs` with:

1. **`upload_file_to_gemini(api_key, file_path, mime_type, display_name) → GeminiFileRef`**
   - Reads file from disk (CAS path)
   - Performs two-step resumable upload to Gemini File API
   - Returns `{ file_uri, mime_type, state }`

2. **`poll_file_status(api_key, file_name) → FileState`**
   - Checks if uploaded file is `ACTIVE`
   - Used for large files that need processing time

3. **`GeminiFileRef` struct** stored in `AppState`:

   ```rust
   pub struct GeminiFileRef {
       pub file_uri: String,
       pub mime_type: String,
       pub display_name: String,
   }
   ```

4. **File URI cache** in `AppState`:
   ```rust
   // Map CAS hash → Gemini fileUri (avoids re-uploading same file)
   pub gemini_file_cache: Mutex<HashMap<String, GeminiFileRef>>
   ```

### Phase 2: Update `gemini.rs` Structs

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

### Phase 3: Refactor Gemini Commands to Accept Paths

Change all 4 Gemini commands to accept a **file path** instead of base64:

| Command                 | Current params                                                    | New params                                      |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| `stream_gemini_chat_v2` | `image_base64: Option<String>`, `image_mime_type: Option<String>` | `image_path: Option<String>` (CAS path on disk) |
| `start_chat_sync`       | `image_base64: String`, `image_mime_type: String`                 | `image_path: String`                            |
| `generate_chat_title`   | `image_base64: String`, `image_mime_type: String`                 | `image_path: String`                            |
| `stream_gemini_chat`    | `contents: Vec<GeminiContent>` (pre-built with inlineData)        | Keep as-is or migrate                           |

Inside each command, Rust will:

1. Check `gemini_file_cache` for an existing `fileUri` for this CAS hash
2. If not cached: upload file → get `fileUri` → cache it
3. Build `GeminiPart` with `file_data` instead of `inline_data`
4. Send request

### Phase 4: Refactor the UI Gemini Client

**`ui/src/lib/api/gemini/client.ts`** — This is a 492-line file that manages the Gemini session state. Major changes:

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

### Phase 5: Refactor `useChat.ts`

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

### Phase 6: Handle Chat Attachments via File API

When a user sends a chat message with `{{/path/to/file}}` attachments:

1. UI sends the message text (with `{{path}}` tokens) to Rust
2. Rust extracts the paths from `{{...}}` tokens
3. For each path: upload to Gemini File API → get `fileUri`
4. Build `GeminiContent` with mixed `text` + `fileData` parts
5. Send to Gemini

This means the `sendMessage` / `stream_gemini_chat_v2` command needs to:

- Accept the raw message text containing `{{path}}` tokens
- Parse out the paths
- Upload each file
- Build the multi-part request

### Phase 7: Cleanup Dead Code

After migration, remove:

- `read_file_base64` command from `image.rs` and `lib.rs`
- `process_image_bytes` command (if no longer used)
- `store_image_bytes` command (if no longer called from UI)
- `cleanBase64()` from `client.ts`
- All `fetch() → blob → FileReader` patterns from `useChat.ts`
- The `isFilePath` flag from `startupImage` type (everything is a path now)

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
- **Solution**: When a Gemini request fails with a stale URI error, re-upload from CAS (file is still on disk) and retry

Implementation:

```rust
// In gemini_file_cache, store upload timestamp
pub struct GeminiFileRef {
    pub file_uri: String,
    pub mime_type: String,
    pub uploaded_at: chrono::DateTime<chrono::Utc>,
}

// Before using a cached URI, check if it's older than 47 hours
fn is_uri_expired(ref: &GeminiFileRef) -> bool {
    chrono::Utc::now() - ref.uploaded_at > chrono::Duration::hours(47)
}
```

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

### Challenge 5: Chat Attachment Paths in Messages

Chat messages contain inline attachment references as `{{/path/to/cas/file}}`. When sending to Gemini:

1. Rust must **parse** the message text to extract `{{...}}` paths
2. **Upload** each referenced file to Gemini File API
3. **Build** a multi-part request: the text (with `{{...}}` stripped) + `fileData` parts
4. **Send** to Gemini

```rust
// Pseudocode for parsing attachments from message text
fn extract_attachments(text: &str) -> (String, Vec<String>) {
    let re = Regex::new(r"\{\{([^}]+)\}\}").unwrap();
    let paths: Vec<String> = re.captures_iter(text)
        .map(|c| c[1].to_string())
        .collect();
    let clean_text = re.replace_all(text, "").to_string();
    (clean_text.trim().to_string(), paths)
}
```

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
