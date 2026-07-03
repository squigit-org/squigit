# Release and Update Strategy

Squigit is distributed through four update surfaces:

1. **Shell**: The Electron shell: Chromium, `qt-capture` sidecar, and `napi-bridge` crate.
2. **Renderer**: The React UI bundle: HTML, CSS, and JavaScript.
3. **Squigit OCR Engine**: The standalone `squigit-ocr` CLI.
4. **Squigit STT Engine**: The standalone `squigit-stt` CLI.

Every registered app, package, crate, and sidecar owns its version independently. The root repo also has CalVer metadata in `VERSION` and `CHANGELOG.md`; it represents the day's repository work, not a shipped runtime component.

## 1. Releases

Run `cargo xtask release` inside a releasable component, or pass its path from the repository root. Root invocations also accept case-insensitive target names such as `Squigit`, `Renderer`, `OCR`, and `STT`. The command accepts no version: it reads the component version automatically. Release requires a clean Git tree and a local version strictly newer than the latest matching tag on `origin`, then creates an annotated tag and pushes it.

- Squigit: `v<version>`
- Renderer: `renderer-v<calver>`
- Paddle OCR: `ocr-v<version>`
- Whisper STT: `stt-v<version>`

CLI release is listed in its component context but currently reports `coming soon` without creating a tag.

Renderer follows the same local contract as every other component: xtask pushes its source tag to this repository. Its CI lane must build the renderer ZIP from that tag, then use `PACKAGES_GITHUB_TOKEN` to create the matching release in `squigit-org/squigit-packages`. The PAT belongs only in GitHub Actions; local release commands never need it.

## 2. Version Bumping

Run `bump` inside the context whose version should change:

```bash
cargo xtask bump

cd apps/renderer
cargo xtask bump

cd apps/desktop
cargo xtask bump 0.3.0
```

The repository root and Renderer accept no version argument. Every SemVer component requires one explicit version. From the repository root, a component path can replace `cd`, for example `cargo xtask bump apps/desktop 0.3.0`.

### Repository

The root bump updates `VERSION` and `CHANGELOG.md` to today's `YY.MM.DD` CalVer and adds the documented `TBD` scaffold. Repeating it on the same day reuses the existing section.

### Renderer

Renderer uses an independent daily sequence:

- First bump of the day: `YY.MM.DD`
- Later bumps: `YY.MM.DD.1`, `YY.MM.DD.2`, and so on

It updates `apps/renderer/package.json` and adds a heading to `apps/renderer/CHANGELOG.md` without `TBD` sections. Renderer bumps do not touch root version metadata.

### Applications

Desktop uses explicit SemVer and updates:

- `apps/desktop/package.json`
- `apps/desktop/CHANGELOG.md`

CLI uses explicit SemVer and updates its `package.json` and `package-lock.json`. It has no component changelog yet.

### Packages and Crates

Packages and crates use explicit SemVer and update their internal package or Cargo manifest. N-API Bridge additionally synchronizes:

- `crates/napi-bridge/package.json`
- Generated version guards in `crates/napi-bridge/index.js`

### Sidecars

Paddle OCR uses explicit SemVer and updates:

- `sidecars/paddle-ocr/src/__init__.py`
- `sidecars/paddle-ocr/CHANGELOG.md`

Whisper STT uses explicit SemVer and updates:

- `sidecars/whisper-stt/CMakeLists.txt`
- `sidecars/whisper-stt/CHANGELOG.md`

Qt Capture uses explicit SemVer and updates its Cargo and native CMake project versions. It has no changelog.

Every component bump except Renderer also updates root `VERSION` and `CHANGELOG.md` for today's repository CalVer. If several components are bumped on one day, xtask reuses one root heading and one documented scaffold.

## 3. Update Strategy

Squigit has three update layers.

### Shell Updates

Shell updates require reinstalling the app through the platform installer or package manager, such as NSIS, DMG, APT, or DNF.

The shell contains Electron, Chromium, `qt-capture`, and `napi-bridge`. The app checks shell release notes from `apps/desktop/CHANGELOG.md`. The local shell version comes from `platform.app.getVersion()`.

### Renderer Updates

Renderer updates are intended to be handled inside the app. The renderer is versioned with CalVer and checked against `apps/renderer/CHANGELOG.md`.

The OTA flow is:

1. Check `apps/renderer/CHANGELOG.md`.
2. If a newer renderer version exists, download the new JS/CSS bundle into user data.
3. Rewrite the local renderer `index.html` reference to point at the downloaded bundle.
4. Apply the new bundle on the next app launch.
5. Fall back to the bundled renderer if the downloaded bundle is removed or invalid.

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

SemVer component changelogs use headings such as:

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

Include `**Size**: ...` under `### Version Info` when the UI should display a download size.

## 5. Help and About Versions

`HelpSettings.tsx` shows different sources intentionally:

- **Squigit**: Renderer version from `apps/renderer/package.json` in CalVer form.
- **Shell**: Shell version from `await platform.app.getVersion()` in SemVer form.
- **Runtime**: Electron or Tauri runtime version.
- **React**: React version from `@types/react/index.d.ts`.
- **Engines**: OCR/STT versions read from their `--version` output.
- **Commit**: `COMMIT_SHA`, or `Development Mode` locally.
