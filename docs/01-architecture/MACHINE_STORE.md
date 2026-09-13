# Machine Store Architecture

Squigit has one machine-wide store shared by every shell. Electron and the CLI call the same `squigit-rs` facade, which delegates persistence to `squigit-storage`.

## Config root

The default root comes from the operating system's application-config directory:

| Platform | Default application root                                 |
| -------- | -------------------------------------------------------- |
| Linux    | `$XDG_CONFIG_HOME/squigit`, normally `~/.config/squigit` |
| macOS    | `~/Library/Application Support/Squigit`                  |
| Windows  | `%APPDATA%\Squigit`                                      |

`SQUIGIT_CONFIG_DIR` replaces that default with an exact application root. The CLI also accepts `--home PATH` and `SQUIGIT_HOME`; it resolves either value to an absolute path and supplies it to the shared facade as `SQUIGIT_CONFIG_DIR`.

Contributor demo sessions use the ignored repository directory `squigit-demo/` unless one of those overrides selects another location.

## Persisted layout

Files are created as their corresponding features are used, so a new installation may contain only part of this tree.

```text
{application root}/
├── auth.json
├── config.toml
├── install-ocr.sh              # Linux and macOS
├── install-ocr.ps1             # Windows
├── keys.json
├── keys.lock
├── profiles.json
├── RULES.md
├── version.json
├── version.lock
├── logs/
├── models/
│   └── {model_id}/
├── document-conversions/
│   └── {hash_prefix}/
│       └── {source_hash}.{docx|xlsx|pptx}.json
├── objects/
│   └── {hash_prefix}/
│       └── {blake3_hash}/
│           ├── manifest.json
│           ├── manifest.lock
│           └── {blake3_hash}.{canonical_ext}
└── threads/
    ├── index.json
    └── {thread_id}/
        ├── attachment_manifest.json
        ├── context_window.json
        ├── messages.json
        └── ocr_annotations.json   # image threads only
```

## Root files

- `auth.json` stores schema-1 active-profile state and metadata about the last successful Google login. It contains no OAuth tokens.
- `profiles.json` maps canonical profile IDs to Google identity and display metadata.
- `keys.json` stores schema-1 encrypted BYOK records and the last trusted reveal time. `keys.lock` serializes key-store transactions across processes.
- `config.toml` stores shared model, effort, OCR settings, and the `[desktop]` shell settings. Persisted keys use snake case.
- `RULES.md` stores the user's shared persona instructions.
- `version.json` caches app, CLI, and OCR release information. `version.lock` serializes version-cache updates.
- `install-ocr.sh` or `install-ocr.ps1` is generated for the current platform from the native OCR installer recipe.
- `logs/` receives harness and Gemini request-boundary logs when logging is enabled. Repository development sessions redirect these logs to the repository `logs/` directory.
- `models/` contains OCR recognition models downloaded independently from the installed OCR executable.

## Thread catalog

`threads/index.json` is the catalog for three collections:

- workspaces, including their canonical directories and image-thread metadata;
- image threads that are not assigned to a workspace;
- `sidechat_threads`, which are text-first conversations shown as ordinary chat threads by the CLI.

Image threads and side chats both use `threads/{thread_id}/`. They share message, context-window, and attachment-manifest formats. Image threads additionally have a core image hash and OCR annotations. Side chats have no OCR state.

`messages.json` stores role-tagged user and assistant messages. User messages carry canonical attachment hashes; assistant messages can carry citations and tool-step metadata. `attachment_manifest.json` holds the thread's current attachment context, while `context_window.json` holds token and compacted-context state.

## Content-addressable objects

Every attachment is stored by BLAKE3 hash. The first two hash characters form the directory prefix. The object directory contains the immutable source bytes and a schema-1 manifest describing:

- whether the object is local text, an image upload, or a document upload;
- cached text content for local-text objects;
- the image tone when applicable;
- credential-bound Gemini remote files and their expiry state;
- the optional ImgBB/Google Lens reverse-image-search result.

`manifest.lock` protects object-manifest updates across processes. Office conversions are cached separately as receipts that bind a source hash and extension to the generated PDF hash and conversion recipe.

## Persistence rules

Security-sensitive data uses private directories and files on Unix. Key, version, and object-manifest mutations use advisory locks where cross-process coordination is required. Storage validates profile IDs, message IDs, object hashes, schema versions, and typed records before accepting them.

The public `0.1.0` data formats begin at schema 1. Unsupported schemas and legacy shapes are rejected; this repository does not carry compatibility readers or automatic migrations.
