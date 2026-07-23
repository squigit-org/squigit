# Machine Store Architecture

Squigit has one machine-wide store shared by every shell. Electron and the CLI are interfaces over the same Rust infrastructure.

```text
{squigit application root}/
├── config.toml
├── First Run
├── Local Storage/
│   ├── index.json
│   ├── session.json
│   ├── persona.json
│   ├── threads/
│   │   ├── threads.sqlite3
│   │   └── {thread_uuid}/ocr/{model_id}.json
│   ├── objects/{hash_prefix}/{blake3_hash}/
│   │   ├── manifest.json
│   │   └── {blake3_hash}.{canonical_ext}
│   ├── accounts/{account_uuid}/
│   │   ├── account.json
│   │   └── keys/
│   └── models/ocr/{model_id}/
└── Chromium/
    ├── Local Storage/leveldb/
    ├── Cookies
    └── caches…
```

Rust's `StorePaths` is the only shared-path resolver. TypeScript never constructs thread, account, object, or model paths. Electron sets `sessionData` to `Chromium/` before readiness so Chromium cannot own or clear Squigit's `Local Storage/`.

`index.json` contains only `store_id`, `schema_version`, and `created_at`. `session.json` contains guest or active-account state. `persona.json` contains the machine-wide prompt and soul filename. Electron's root preferences are shell-only.

`threads/threads.sqlite3` is authoritative for thread metadata, ordered messages, object references, rolling state, and FTS5 search. WAL mode, foreign keys, a busy timeout, UUID thread IDs, `user_version`, and transactional compound writes support simultaneous shells. OCR results remain thread-scoped files; OCR model binaries are global.

Objects are immutable BLAKE3-addressed files. Accounts and threads only reference hashes. Deleting an account or thread removes references and metadata, never potentially shared object bytes. Avatars are objects referenced by accounts.

Manifest, session, persona, and account writes use cross-process locking, atomic replacement, validated UUID paths, and restrictive permissions. Object writes are bounded, magic-validated for images, immutable, and deduplicated.

There is no storage-domain `workspace/`, `threads/`, `profiles/`, or `identities/`, and there is no compatibility storage branch.
