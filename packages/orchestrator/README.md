# SPATIALSHOT Orchestrator

The spatialshot-orchestrator is defined as the central Rust-based executable in the SpatialShot utility, responsible for coordinating multi-monitor screenshot capture, processing, and output generation across operating systems.
Its role and goal are to manage resource locking, core affinity, file monitoring, and sequential invocation of platform-specific tools.

## Orchestrator Flow Overview

The core logic in `main.rs` is platform-agnostic: It sets up application paths (e.g., temp dir, spatial dir, core script), acquires an exclusive file lock to prevent multiple instances, writes the platform-specific core script, pins execution to a CPU core for efficiency, runs the initial screenshot grab to detect monitors, spawns a monitoring thread to watch the temp directory for files, invokes drawing/processing tools when ready, and handles errors by killing related processes. The flow diverges in platform modules (`src/platform/{linux,win32,darwin}/mod.rs`) for executing commands, due to differences in scripting (bash vs. PowerShell) and user session handling.

### Linux Flow

- **Core Script Handling**: Writes `core.sh` (a bash wrapper) to the spatial dir and makes it executable.
- **Execution**: Commands like `run_grab_screen` (captures screenshots via a wrapper like `scgrabber`), `run_draw_view` (processes via `drawview`), and `run_spatialshot` (final app invocation) are run synchronously via `bash -c` directly in the user's session—no impersonation needed, assuming the orchestrator runs as the interactive user.
- **Monitoring & Cleanup**: The notify watcher polls the temp dir for PNG files matching the monitor count, then for output files starting with 'o'. Errors trigger process kills using `sysinfo` to terminate tools like `scgrabber-bin` or `spatialshot`.
- **Key Traits**: Simple and direct, leveraging environment vars like `XDG_CACHE_HOME` for paths; works flawlessly in user contexts like hotkeys.

### Windows Flow

- **Native Core Handling**: Implements a dedicated Rust module (`core.rs`) that interfaces directly with the **Win32 API** (GDI & HiDpi). It uses `EnumDisplayMonitors` to calculate precise screen bounds and explicitly sorts displays by device name (e.g., `\\.\DISPLAY1`) to guarantee alignment with the C++ Qt frontend.
- **Execution**: Achieves minimal latency by bypassing shell scripting entirely. The Orchestrator directly spawns `nircmdc.exe` for capturing screenshots and launches `draw-view`/`spatialshot` binaries using `std::process::Command` with `CREATE_NO_WINDOW` flags for a seamless, invisible background execution.
- **Monitoring & Cleanup**: Utilizes robust file watcher logic to coordinate stages; uses `sysinfo` to instantly kill processes like `drawview.exe` on error or timeout. Relies on `%LOCALAPPDATA%` for atomic path management.
- **Key Traits**: Designed for instant feedback on hotkey triggers (`Win+Shift+A`). By utilizing compiled Rust code for hardware enumeration, it ensures zero-latency execution, strictly typed display handling, and eliminates dependencies on system execution policies.

### macOS (Darwin) Flow

- **Core Script Handling**: Writes `core.sh` (bash wrapper) to the spatial dir and sets executable permissions.
- **Execution**: Uses `launchctl asuser` to run `bash core.sh` in the active user's context (queries UID via `stat` and `id`), ensuring graphical access for `grab-screen` (via `scgrabber`), `draw-view`, and `spatialshot`. This impersonation step handles potential non-interactive runs.
- **Monitoring & Cleanup**: Identical temp dir watching; kills tools like `scgrabber-bin` or `spatialshot` on failure using `sysinfo`.
- **Key Traits**: Paths use macOS conventions (e.g., `Library/Caches`); the `launchctl` ensures commands run as the console user for UI-dependent tasks, making it robust for desktop environments.
