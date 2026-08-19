# Machine Store Architecture

Squigit has one machine-wide store shared by every shell. Electron and the CLI are interfaces over the same Rust infrastructure.

```text
{squigit application root}/
├── auth.json
├── config.toml
├── First Run
├── history.jsonl
├── keys.json
├── keys.lock
├── profiles.json
├── RULES.md
├── version.json
├── Chromium/
│   ├── Local Storage/leveldb/
│   ├── Cookies
│   └── caches…
├── models/pp-ocr-{model_id}/
├── objects/{hash_prefix}/{blake3_hash}/
│   ├── manifest.json
│   ├── manifest.lock
│   └── {blake3_hash}.{canonical_ext}
└── threads/
    ├── index.json
    └── {thread_id}/
        ├── attachment_manifest.json
        ├── context_window.json
        ├── messages.json
        └── ocr_annotations.json
```

Rust's `StorePaths` is the only shared-path resolver. TypeScript never constructs thread, account, object, or model paths. Electron sets `sessionData` to `Chromium/` before readiness so Chromium cannot own or clear Squigit's `Local Storage/`.

TBD: explain the purpose of each file after the sqlite3 migration.
