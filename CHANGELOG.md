# Changelog

All notable changes to this project will be documented in this file.

This log tracks repo-level changes using CalVer (`YY.MM.DD`).

## [26.07.05] - 2026-07-05

### Changed

- Reverted workspace crates to baseline version `0.1.0`, rolling back the `0.2.0` release workflow smoke test.

## [26.07.03] - 2026-07-03

### Changed

- Rebuilt xtask around component-local manifests with production `dev` and `bump` workflows.

## [26.06.26] - 2026-06-26

### Changed

- Reworked `cargo xtask version` around split shell, renderer, repo, OCR, and STT version pumping.

## [26.05.29] - 2026-05-29

### Changed

- Migrated desktop shell architecture from Tauri to Electron

### Fixed

- Hardcoded workspace crate versions to prevent leakage from higher workspace versions when built as an archive

## [25.10.02] - 2025-10-02

### Added

- Initial release of Squigit.
