# Development

This catalog is the source of truth for developer workflows that control the Squigit repository.
Terminal help should stay brief; durable workflow detail belongs here.

## xtask

TBD.

### dev

TBD.

### doctor

TBD.

### build

TBD.

### test

TBD.

### clean

TBD.

### bump

TBD.

### release

TBD.

### live

Every live workflow receives an explicit `SQUIGIT_CONFIG_DIR` below the repository's temporary
namespace. Live code must fail when that variable is absent or relative and must never resolve the
installed application's config directory.

The API lifecycle suite shares the isolated auth config:

- `cargo xtask live apis save` encrypts and stores `GEMINI_API_KEY` from the environment or
  repository `.env`.
- `cargo xtask live apis reveal` decrypts the stored key after terminal PIN authorization.
- `cargo xtask live apis models` lists stable Gemini Flash and Flash Lite models.
- `cargo xtask live apis upload` smoke-tests Gemini File API object remotes with
  `test-fileapi.png` and writes the exact remote map to `object-remotes.json`.

### crypto

TBD.
