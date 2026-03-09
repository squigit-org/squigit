# Squigit CLI Blueprint

Date: 2026-03-09  
Status: Draft for implementation

## 1. Purpose

This document defines the architecture and implementation plan for the Squigit terminal application, distributed as an npm package (`npm install squigit`), built with Ink, and designed as a first-class product rather than a thin desktop wrapper.

The CLI must:

- Provide a complete image-to-chat workflow in terminal mode.
- Reuse existing Squigit backend and storage contracts where possible.
- Interoperate with desktop chat history and media storage safely.
- Support handoff from terminal to desktop (`/squigt`).

## 2. Scope

Included in scope:

- CLI application architecture (Ink frontend + Rust backend core).
- Shared storage behavior across desktop and CLI.
- Capture/OCR/Gemini orchestration in terminal mode.
- Sidecar provisioning for npm distribution.
- Desktop handoff strategy.

Out of scope for v1:

- Full multi-language OCR model management in CLI.
- Whisper speech support in CLI.
- Large desktop UI refactors unrelated to shared logic extraction.

## 3. Current System Contracts (Must Be Preserved)

## 3.1 Backend command and service flow

Current desktop logic is implemented through:

- Tauri command registration in `apps/desktop/src/lib.rs`.
- Chat/image storage commands in `apps/desktop/src/commands/chat.rs`.
- Gemini streaming/title commands in `apps/desktop/src/commands/gemini.rs`.
- Gemini file upload and attachment handling in `apps/desktop/src/commands/gemini_files.rs`.
- OCR sidecar lifecycle in `apps/desktop/src/commands/ocr.rs`.
- Capture sidecar lifecycle in `apps/desktop/src/services/capture.rs`.

## 3.2 Storage format

Storage is profile-aware and must remain compatible:

- Profile base: `~/.config/squigit/Local Storage/`
- Chat base (per profile): `Local Storage/{profile_id}/chats`
- Chat artifacts:
  - `index.json`
  - `{chat_id}/meta.json`
  - `{chat_id}/messages.md`
  - `{chat_id}/ocr_frame.json`
  - `{chat_id}/imgbb_url.txt` (optional)
  - `objects/{prefix}/{hash}.{ext}` (CAS)

`messages.md` is the canonical chat transcript format:

- Role headings: `## User` / `## Assistant`
- Timestamp comment: `<!-- RFC3339 -->`
- Markdown message body

## 3.3 OCR frame constraints

- OCR frame keys are restricted to supported OCR model IDs and reserved metadata keys.
- Reserved key currently used by desktop: `__meta_auto_ocr_disabled__`.

## 3.4 Attachment contract

- Message-level attachment references use `{{path}}` tokens.
- Backend Gemini request preparation already resolves these tokens and uploads files when required.

## 4. Architecture Decisions

## 4.1 Repository structure

Keep the current repository layout and introduce shared core extraction:

- Keep:
  - `apps/desktop`
  - `apps/cli` (npm root)
- Add:
  - `crates/ops-cli-core` (shared runtime orchestration)

This avoids disruptive renaming while enabling high-quality code sharing.

## 4.2 Product model

The CLI is an independent application, not a desktop launcher.

- `npm install squigit` installs a complete TUI product.
- `/squigt` provides optional continuation in desktop mode.

## 4.3 Data interoperability

Desktop and CLI share the same storage contract (`ops-profile-store` + `ops-chat-storage`) to enable:

- Shared chat history
- Shared media objects
- Reliable desktop handoff

No format changes are required for v1.

## 5. Target Architecture

## 5.1 CLI package (`apps/cli`)

Proposed structure:

```text
apps/cli/
  .gitkeep
  package.json
  tsconfig.json
  src/
    bin.ts
    app.tsx
    commands/
    screens/
    state/
    markdown/
    services/
      bridge.ts
      sidecar-installer.ts
      desktop-detect.ts
  scripts/
```

Responsibilities:

- Ink UI rendering and interaction model.
- Slash-command routing.
- Attachment path references (`@...`) and input preprocessing.
- Markdown rendering for terminal output.
- RPC/event bridge to Rust core.

## 5.2 Shared backend core (`crates/ops-cli-core`)

Responsibilities:

- Active profile bootstrap and validation.
- Chat/session management via existing storage crates.
- Capture sidecar orchestration and protocol parsing.
- OCR sidecar orchestration (English default for v1).
- Gemini orchestration for:
  - initial image analysis
  - follow-up chat
  - attachment-aware requests
- Settings and key management parity with desktop storage.
- Sidecar path resolution and installation management.
- Desktop handoff orchestration for `/squigt`.

## 5.3 Desktop integration changes (minimal)

Required desktop updates:

1. Add handoff CLI arg support (for example `--chat-id`).
2. Emit `load-chat` when handoff args are received.
3. Ensure startup and single-instance paths both process handoff args.
4. Keep desktop command signatures stable while reusing extracted shared modules.

## 6. CLI Workflow Specification

## 6.1 Launch modes

1. `squigit <path/to/image>`
- Store image in CAS.
- Create chat.
- Run OCR and Gemini overview concurrently.
- Stream Gemini response while OCR data updates.
- Enter follow-up chat loop.

2. `squigit capture`
- Spawn capture sidecar.
- On success, execute the same flow as image-path launch.

3. `squigit`
- Open empty terminal session.
- Wait for user actions (`/capture`, file attachment, or direct chat input).

## 6.2 `/capture` behavior

If chat is empty:

- Capture image.
- Start full OCR + Gemini analysis pipeline.

If chat already contains messages:

- Capture in input-only mode.
- Insert captured CAS file as input attachment reference.
- Do not restart analysis pipeline automatically.

## 6.3 Attachment flow (`@`)

- Resolve local path references.
- Store files in CAS.
- Convert to `{{cas_path}}` tokens in outgoing message text.
- Preserve compatibility with existing Gemini attachment backend behavior.

## 7. Slash Commands

Required commands for v1:

- `/settings`
- `/clear`
- `/capture`
- `/gog-lens`
- `/gog-search`
- `/gog-translate`
- `/squigt`

Rules:

- `/gog-lens`: always uses current image.
- `/gog-search`: always uses OCR text.
- `/gog-translate`: always uses OCR text.
- `/clear`: starts a fresh chat state in CLI session.
- `/squigt`: launches desktop and opens current chat if desktop is available.

## 8. Sidecar Distribution and Security Model

## 8.1 Packaging strategy

The npm package must remain lightweight and must not bundle large AI runtimes.

First-run behavior:

1. Try to resolve usable sidecars from known locations.
2. If not available, download sidecar bundle from official release channel.
3. Verify authenticity and integrity before extraction.
4. Install into shared runtime directory.

## 8.2 Resolution precedence

Recommended sidecar resolution order:

1. `SQUIGIT_SIDECARS_DIR`
2. Shared user runtime cache (`~/.config/squigit/sidecars/{target}`)
3. Desktop-installed runtime paths
4. Development fallback paths

This avoids duplicate 400MB runtime copies when desktop is already installed.

## 8.3 Trust and anti-malware controls

- Signed manifest verification with embedded trust root.
- Strict SHA-256 verification for downloaded artifacts.
- Secure extraction (path traversal protections).
- Restricted download host allowlist.
- User-visible install logs and diagnostics.
- Optional platform signature checks where available.

## 9. Desktop Handoff (`/squigt`)

## 9.1 v1 implementation

Recommended first implementation:

- Pass chat identity via desktop launch argument (`--chat-id`).
- Desktop resolves chat via existing storage APIs.
- If desktop is already running, single-instance event path emits `load-chat`.

## 9.2 fallback behavior

If desktop is not installed:

- Return explicit user-facing error:
  - "Squigit desktop not found. Install from <official URL>."

## 9.3 optional hardening (future)

- Replace raw `chat-id` handoff with signed, time-limited handoff token file.

## 10. Roadmap

## Phase 0: contract locking

- Add regression tests for storage and markdown transcript compatibility.
- Document currently implicit IPC and storage contracts.

## Phase 1: shared core extraction

- Introduce `crates/ops-cli-core`.
- Move reusable orchestration from desktop modules into shared code.

## Phase 2: CLI bootstrap

- Add npm package scaffold in `apps/cli`.
- Add Ink shell + Rust bridge process.

## Phase 3: feature parity (core)

- Implement full capture/OCR/Gemini/chat loop.
- Implement attachment and slash command support.

## Phase 4: desktop handoff

- Implement `/squigt` and desktop arg handling.
- Validate handoff when desktop is running and not running.

## Phase 5: release hardening

- Finalize sidecar installer trust model.
- Add CLI-focused CI smoke matrix.
- Publish npm package.

## 11. Known follow-ups

- Fill currently empty docs in `docs/02-architecture` and `docs/05-api-reference`.
- Resolve or remove unused frontend event paths (`image-path`, `load-chat`) that currently have incomplete backend emitters.
- Add missing backend command for temp-file cleanup or remove stale frontend invocation path.
- Improve Gemini token emission to true incremental stream processing if required by terminal UX.
