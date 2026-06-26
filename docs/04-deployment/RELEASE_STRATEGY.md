# Release and Update Strategy

Squigit is distributed as four independently versioned components:

1. **Shell**: The rare-update desktop shell. This is Electron, Chromium, `qt-capture`, and the `napi-bridge` native layer.
2. **Renderer**: The daily-update React UI bundle. This is the app surface shipped as JavaScript, CSS, and static assets.
3. **Squigit OCR Engine**: The standalone `squigit-ocr` CLI distributed through OS package managers.
4. **Squigit STT Engine**: The standalone `squigit-stt` CLI distributed through OS package managers.

These components have different release costs and update channels, so they are versioned separately. The root repo also has its own CalVer metadata in `VERSION` and `CHANGELOG.md`; it represents repo-level work, not a shipped runtime component.

## 1. Releases

_(TBD: Documentation on DMG, EXE, APT, DNF, Homebrew, and Winget release packaging.)_

## 2. Version Pumping

Squigit uses `cargo xtask version` to update component versions and scaffold changelogs. The command supports exactly one target at a time:

```bash
cargo xtask version --shell 0.2.0
cargo xtask version --renderer
cargo xtask version --ocr 0.1.1
cargo xtask version --stt 0.2.1
cargo xtask version --repo
```

There is no `--bump` mode. Shell, OCR, and STT require an explicit SemVer argument. Renderer and repo use today's CalVer in `YY.MM.DD` format.

### Shell (`--shell <semver>`)

The shell is SemVer. Pumping it updates:

- `apps/desktop/package.json`
- `apps/desktop/CHANGELOG.md`
- `sidecars/qt-capture/Cargo.toml`
- `sidecars/qt-capture/native/CMakeLists.txt`
- `crates/napi-bridge/Cargo.toml`
- `crates/napi-bridge/package.json`
- `crates/napi-bridge/index.js`

Because shell work is also repo work, `--shell` also updates root `VERSION` and `CHANGELOG.md` using today's CalVer.

### Renderer (`--renderer`)

The renderer is CalVer. Pumping it updates:

- `apps/renderer/package.json`
- `apps/renderer/CHANGELOG.md`

The renderer changelog is ping-only. It intentionally does not scaffold `TBD` sections because daily UI/CSS changes should not force a full documented release note entry.

### OCR (`--ocr <semver>`)

The OCR engine is SemVer. Pumping it updates:

- `sidecars/paddle-ocr/src/__init__.py`
- `sidecars/paddle-ocr/CHANGELOG.md`

Because sidecar work is also repo work, `--ocr` also updates root `VERSION` and `CHANGELOG.md` using today's CalVer.

### STT (`--stt <semver>`)

The STT engine is SemVer. Pumping it updates:

- `sidecars/whisper-stt/CMakeLists.txt`
- `sidecars/whisper-stt/CHANGELOG.md`

Because sidecar work is also repo work, `--stt` also updates root `VERSION` and `CHANGELOG.md` using today's CalVer.

### Repo (`--repo`)

The root repo version is CalVer. Pumping it updates:

- `VERSION`
- `CHANGELOG.md`

Use this for repo-only work such as restructuring, docs, workflows, or shared maintenance that does not belong to a shipped component changelog.

If multiple commands touch the root changelog on the same day, xtask reuses the existing top CalVer section and ensures the documented scaffold exists. It does not create duplicate same-day root headings.

## 3. Update Strategy

Squigit has three update layers.

### Rare Shell Updates

Shell updates require reinstalling the app through the platform installer or package manager, such as NSIS, DMG, APT, or DNF.

The shell contains Electron, Chromium, `qt-capture`, and `napi-bridge`. The app checks shell release notes from `apps/desktop/CHANGELOG.md`. The local shell version comes from `platform.app.getVersion()`.

### Daily Renderer Updates

Renderer updates are intended to be handled inside the app. The renderer is versioned with CalVer and checked against `apps/renderer/CHANGELOG.md`.

The future OTA flow is:

1. Check `apps/renderer/CHANGELOG.md`.
2. If a newer renderer version exists, download the new JS/CSS bundle into user data.
3. Rewrite the local renderer `index.html` reference to point at the downloaded bundle.
4. Apply the new bundle on the next app launch.
5. Fall back to the bundled renderer if the downloaded bundle is removed or invalid.

This OTA implementation is not built yet.

### OS-Managed Sidecar Updates

OCR and STT are heavy standalone CLIs. They are upgraded through OS package managers such as APT, DNF, Homebrew, and Winget.

The app checks installed versions by running:

```bash
squigit-ocr --version
squigit-stt --version
```

It compares those versions against:

- `sidecars/paddle-ocr/CHANGELOG.md`
- `sidecars/whisper-stt/CHANGELOG.md`

When a sidecar update is available, `UpdateNotesRoute.tsx` shows release notes and an OS-specific package-manager command. The app does not install sidecar updates itself.

## 4. Changelog Format

All component changelogs use level-two version headings:

```markdown
## [0.2.0] - 2026-05-29
```

Renderer and root repo CalVer entries use the same shape:

```markdown
## [26.06.26] - 2026-06-26
```

Documented changelogs use `TBD` scaffolding:

```markdown
### Added

- TBD

### Changed

- TBD

### Fixed

- TBD
```

Ping-only changelogs only add the version heading.

For update notes rendered in the app, prefer these sections:

- `### Version Info`
- `### New Features`
- `### Bug Fixes`
- `### UI Improvements`

Include `**Size**: ...` under `### Version Info` when the UI should display a download size.

## 5. Help and About Versions

`HelpSettings.tsx` shows different sources intentionally:

- **Squigit**: Renderer version from `apps/renderer/package.json` in CalVer form, such as `v26.06.26`.
- **Shell**: Shell version from `await platform.app.getVersion()` in SemVer form.
- **Runtime**: Electron or Tauri runtime version.
- **Engines**: OCR/STT versions read from their `--version` output.
- **Commit**: `VITE_GIT_COMMIT`, or `Development Mode` locally.
