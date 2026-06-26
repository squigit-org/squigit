# Release and Update Strategy

Squigit is distributed as three distinct components, divided into two primary layers (the application shell and OS-level CLI dependencies):

1. **Desktop App**: The main application shell and UI. This includes `electron`, the `renderer` React app, and the lightweight `qt-capture` screen capture sidecar (which is baked directly into the Electron bundle since it's <50 MiB).
2. **Squigit OCR Engine**: A standalone OS-level CLI tool (`squigit-ocr`) distributed via package managers.
3. **Squigit STT Engine**: A standalone OS-level CLI tool (`squigit-stt`) distributed via package managers.

Because the components are distinct and have different sizes and update lifecycles, they are released and updated independently. However, the Desktop App enforces strict version guards (similar to a `package-lock.json` or `requirements.txt`) to ensure it only runs with compatible versions of the OCR and STT engines.

## 1. Releases

*(TBD: Documentation on DMG, EXE, and APT/DNF release packaging)*

## 2. Version Pumping

To manage the versioning of the repository, Squigit uses a centralized "version pumping" pipeline via a custom Cargo `xtask`.

### How it Works

You can bump versions by specifying the component you want to target (`--app`, `--renderer`, `--ocr`, `--stt`) alongside a bump strategy:
```bash
cargo xtask version --app --bump patch
cargo xtask version --renderer --bump minor
cargo xtask version --stt 1.2.3
# You can also bump multiple components at once:
cargo xtask version --app --renderer --bump patch
```

This pipeline automatically touches all the necessary files across the monorepo depending on the targeted components:

**1. Desktop App Shell (`--app`)**
- **Canonical Source**: Updates the root `VERSION` file.
- **Rust Crates**: Traverses the workspace and updates the `workspace.package.version` and `package.version` in every `Cargo.toml` (including the `qt-capture` Cargo manifest).
- **Node/Electron**: Updates the top-level `"version"` field in `apps/electron/package.json`.
- **C++/CMake Projects**: Updates the `project(... VERSION ...)` declaration in `sidecars/qt-capture/native/CMakeLists.txt`.
- **Changelog**: Automatically scaffolds a new version section in the root `CHANGELOG.md`.

**2. UI/Renderer (`--renderer`)**
- **Canonical Source**: Updates the `"version"` field in `apps/renderer/package.json`.
- **Changelog**: Automatically scaffolds a new version section in `apps/renderer/CHANGELOG.md`. *Note: Unlike other components, this changelog does not generate `TBD` placeholders for features/fixes, as it is designed solely to be read by the background OTA update checker without presenting UI alerts.*

**3. OCR Engine (`--ocr`)**
- **Canonical Source**: Updates `__version__ = "..."` and `@version` in `sidecars/paddle-ocr/src/__init__.py`.
- **Changelog**: Automatically scaffolds a new version section in `sidecars/paddle-ocr/CHANGELOG.md`.

**4. STT Engine (`--stt`)**
- **Canonical Source**: Updates the `project(... VERSION ...)` declaration in `sidecars/whisper-stt/CMakeLists.txt`.
- **Changelog**: Automatically scaffolds a new version section in `sidecars/whisper-stt/CHANGELOG.md`.



### Dependency Version Guards

While the pumper currently bumps everything simultaneously, the runtime enforces specific constraints on the standalone engines (OCR/STT). In `crates/desktop-runtime/src/sidecar.rs` and `crates/squigit-ocr/src/sidecar.rs`, the shell defines requirements (e.g., `>=1.2.0` or strict `1.2.0`). When the app launches, it invokes the standalone engines with the `--version` flag. If the installed CLI doesn't satisfy the lockfile guard, the user is prompted to upgrade it.

## 3. Update Strategy

The application includes a built-in mechanism to detect, parse, and present updates for all three components directly within the user interface (`UpdateNotesRoute.tsx`).

### Update Detection Pipeline

The update detection is handled by the `useUpdateCheck` hook (`apps/renderer/src/hooks/system/useUpdateCheck.ts`).

1. **Version Resolution**:
   - **Desktop**: The local version is read from `apps/renderer/package.json`.
   - **Sidecars (OCR/STT)**: The local version is determined by invoking the sidecar executable with the `--version` flag. This resolution is managed by `crates/desktop-runtime/src/sidecar.rs` and `crates/squigit-ocr/src/sidecar.rs`.

2. **Fetching Changelogs**:
   - The app fetches the raw `CHANGELOG.md` files directly from the GitHub repository for each component:
     - Desktop: Main `CHANGELOG.md`.
     - OCR: `sidecars/paddle-ocr/CHANGELOG.md`.
     - STT: `sidecars/whisper-stt/CHANGELOG.md`.

3. **Comparison and Queuing**:
   - The latest version is extracted from the `## [VERSION]` header in the remote changelog.
   - If the remote version is greater than the local version, the update notes are parsed.
   - The parsed release information is queued in `localStorage` under `pending_updates_queue` and a `squigit-updates-changed` event is dispatched to trigger the UI.

### Formatting Changelogs for the UI

The `UpdateNotesRoute.tsx` component is designed to render release notes attractively using sections and accordions. To ensure your release notes are parsed and displayed correctly in the app, you **must** follow these formatting rules when updating any `CHANGELOG.md`:

#### 1. Version Header
Start the release notes with a level 2 header containing the version in brackets.
```markdown
## [0.2.0] - 2026-05-29
```

#### 2. Version Info (Size)
To display the download size in the UI's footer, include a `### Version Info` section with a `**Size**:` property.
```markdown
### Version Info

**Size**: ~203 MiB
```

#### 3. Categorized Sections
Group your bullet points under specific level 3 headers. The UI explicitly looks for and orders these sections:
- `### New Features` (Defaults to being open in the UI)
- `### Bug Fixes`
- `### UI Improvements`

You can include other custom section headers as well; they will be parsed and rendered below the standard ones.

#### 4. Bullet Points
List the changes using standard Markdown bullet points (`-` or `*`). The parser automatically strips out Markdown formatting like bold (`**`), italic (`*`, `_`), and inline code (`` ` ``) to keep the UI clean.

**Example of a perfect Changelog entry:**

```markdown
## [0.1.0] - 2026-04-18

### Version Info

**Size**: ~196 MiB

### New Features

- Initial release of standalone local Whisper C++ STT engine
- Added support for 12 new languages

### Bug Fixes

- Fixed an issue with audio device disconnection crashes
```

### Presentation and Upgrading

When an update is pending:
- **Desktop Updates**: The UI presents an "Update Now" button (if running in Electron) which triggers the built-in updater.
- **Sidecar Updates**: Because the OCR and STT engines are heavy and distributed as OS-level packages (via Homebrew, APT, DNF, Winget, etc.), they are upgraded purely through external terminal commands (e.g., `apt upgrade squigit-ocr`). The application shell does not execute or manage these engine updates itself. Instead, the UI simply generates the appropriate terminal command using the `usePlatform` hook and displays it for the user to copy, run, and manually confirm by clicking "I've Upgraded".
