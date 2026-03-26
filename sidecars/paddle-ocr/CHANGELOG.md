# Changelog

All notable changes to **squigit-ocr** will be documented in this file.

## [Unreleased]

## [1.2.0] - 2026-03-26

### Version Info

**Size**: ~412 MiB (includes runtime + models)

### New Features

- Added `--version` flag for update system integration
- Improved model downloader with better resume + progress reporting
- Support for new PP-OCRv5 CJK model

### Bug Fixes

- Fixed rare JSON parsing edge case on Windows
- Resolved high CPU usage when no models were installed
- Fixed cancellation not always killing the sidecar process

### UI Improvements

- Better error messages when sidecar is missing

## [1.1.0] - 2026-02-15

### New Features

- Initial public release of standalone `squigit-ocr` CLI
- Hybrid packaging (Tauri shell + separate package)

[1.2.0]: https://github.com/a7mddra/squigit/releases/tag/v1.2.0
[1.1.0]: https://github.com/a7mddra/squigit/releases/tag/v1.1.0
