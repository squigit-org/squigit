## Spatialshot — AI assistant instructions

This repository contains multiple components (Node.js UI, Rust orchestrator, and native CaptureKit). The goal of these instructions is to help an AI coding agent be immediately productive when making changes.

Keep the content concise and actionable. Prefer small, well-tested edits and follow the repository conventions.

Key components
- `packages/core` — shared frontend library built with Vite/TypeScript. Run `npm install` and `npm run build` here to produce `dist/` used by the app.
- `packages/spatialshot` — Electron app shell and app-specific srcs in `src/`. This package depends on `core/dist` and contains renderer, preload and main process code.
- `packages/orchestrator` — Rust service built with Cargo. See `packages/orchestrator/Cargo.toml` for dependencies and crate metadata.
- `packages/capturekit` — native packaging/build scripts (PKGBUILD, Dockerfile). Platform-specific: uses `PKGBUILD` on Unix and `PKGBUILD.ps1` on Windows.

Big picture architecture & data flows
- The Electron app in `packages/spatialshot` embeds the UI from `packages/core/dist` by copying it into `src/renderer/view` during the build. See `setup.py` function `build_spatialshot()` for the exact steps.
- The Electron main process uses IPC handlers in `packages/spatialshot/src/ipc-handlers/` (example: `dialogs.js`) to communicate with renderer code. Changes to IPC handlers must be reflected in the renderer `ipcRenderer` calls.
- The orchestrator (Rust) runs as a separate process and is built into `packages/orchestrator/target/`. Integration (how the Electron app talks to it) is documented in `packages/orchestrator/src/` — prefer to inspect `main.rs` and `shared.rs` for protocol details.
- CaptureKit is an external native helper built by platform scripts; treat it as an opaque binary for high-level changes unless making native code fixes in `packages/capturekit/src/`.

Developer workflows (commands to run)
- Full orchestrated build (CI-style): `python3 setup.py` (this script orchestrates setting permissions, building capturekit, building orchestrator, building spatialshot, and running `pytest`).
- Manual frontend build:
  - `cd packages/core && npm ci && npm run build`
  - `cd packages/spatialshot && npm ci && npm run build:linux|mac|win` (scripts follow `setup.py` naming: `build:linux`, `build:mac`, `build:win`)
- Orchestrator (Rust): `cd packages/orchestrator && cargo build --release`
- Run tests: `pytest` from repository root. Unit tests live in `tests/unit`, integration tests in `tests/integration`.

Project-specific conventions and patterns
- The `setup.py` file is the authoritative orchestrator for cross-component builds — consult it before changing build steps.
- The Electron app copies `core/dist` into `packages/spatialshot/src/renderer/view`. Do not edit generated files in that view directory; change src in `packages/core` and rebuild.
- IPC handlers live in `packages/spatialshot/src/ipc-handlers/` and export a function that accepts `ipcMain`. The handler files use `ipcMain.handle(...)` and return an object with higher-level helpers. When adding new IPC channels, update both handler and renderer-side callers in `packages/spatialshot/src/renderer/`.
- Use existing logging patterns: JS modules use `console` or `dialog`/`shell` from Electron; Python `setup.py` uses the `logging` module with a consistent format.

Integration and external dependencies
- Node.js & npm (or pnpm/yarn as the project uses npm by default). `packages/core` and `packages/spatialshot` must be built with compatible Node versions.
- Rust toolchain (cargo) for `packages/orchestrator`.
- Platform scripting tools: Bash on Unix, `pwsh` on Windows for `PKGBUILD.ps1` and script unblocking (see `set_script_permissions` in `setup.py`).
- Tests use `pytest` — keep Python test changes compatible with Python 3.12 (project uses 3.12 in CI metadata)

Examples & quick pointers
- Updating UI shared code: edit `packages/core/src/*`, then run `cd packages/core && npm ci && npm run build`. After successful build, run `cd packages/spatialshot && python3 ../../setup.py` or run the `build_spatialshot` steps in `setup.py` manually.
- Adding an IPC channel: add a handler `ipcMain.handle('my-channel', ...)` in `packages/spatialshot/src/ipc-handlers/yourfile.js`, then call it from renderer via `ipcRenderer.invoke('my-channel', args)` and add tests in `tests/unit` that mock `ipcMain` or test the renderer call using Jest/Electron-mocha as appropriate.
- When touching `packages/capturekit/PKGBUILD` or `PKGBUILD.ps1`, ensure executable bits are set on Unix (see `setup.py:set_script_permissions`) and that `pwsh` is available on Windows.

Editing and PR guidance for the AI
- Keep changes minimal and localized. Respect the generated `view/` directory policy: edit `core` srcs, not `core/dist` copies.
- Run unit tests for small changes (`pytest tests/unit`), and run full `pytest` before proposing larger cross-component updates.
- If a change touches build scripts (`setup.py`, `packages/*/package.json`, or `Cargo.toml`), include updated developer notes in the PR description explaining why the change is necessary and how to test it locally.

Files to consult when working in this repo
- `setup.py` — full build/test orchestrator
- `packages/core/` — shared frontend src and build scripts
- `packages/spatialshot/src/` — Electron app src, IPC handlers, renderer/main/preload
- `packages/orchestrator/src/` — Rust orchestrator
- `packages/capturekit/` — native packaging and build scripts
- `tests/` — unit and integration tests and fixtures

If anything here seems incomplete or you need a deeper pattern description (for example the exact IPC message shapes between renderer and orchestrator), ask for the specific files you want summarized and I'll extract the exact shapes and usages.
