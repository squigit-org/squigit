# Release and Update Strategy

## Update Strategy

Squigit is distributed as three distinct components, divided into two primary layers (the application shell and OS-level CLI dependencies), each with its own update lifecycle:
1. **Desktop App**: The main application shell and UI.
2. **Squigit OCR Engine**: A standalone OS-level CLI tool (`squigit-ocr`) distributed via package managers.
3. **Squigit STT Engine**: A standalone OS-level CLI tool (`squigit-stt`) distributed via package managers.

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
