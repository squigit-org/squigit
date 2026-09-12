# Machine Store Architecture

Squigit has one machine-wide store shared by every shell. Electron and the CLI are interfaces over the same Rust infrastructure.

```text
{squigit application root}/
├── auth.json
├── config.toml
├── install-ocr.sh
├── keys.json
├── keys.lock
├── profiles.json
├── RULES.md
├── version.json
├── version.lock
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

TBD: explain the purpose of each file.
