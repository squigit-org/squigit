# Orchestrator Architecture

The **Orchestrator** is the Rust-based kernel of SpatialShot. It acts as the central nervous system, managing the lifecycle of a capture session. It does not perform image processing or UI rendering itself; instead, it coordinates independent binaries (`capturekit`, `drawview`, and the main `app`) using a file-system-based state machine.

## 1. Core Philosophy: File-System as State

The Orchestrator is designed around **decoupling**. The screen grabber doesn't know about the editor, and the editor doesn't know about the main app. They communicate solely through files in a temporary directory.

The Orchestrator watches this directory and transitions the state based on file events.

### The Lifecycle Loop

1. **Lock & Init**: Acquires a system-level file lock (`spatialshot-orchestrator.lock`) to ensure only one capture session runs at a time.

2. **Capture Phase**: Triggers the platform-specific screen grabber.

3. **Watch Phase (Input)**: Watches the `tmp` directory for raw screenshots (e.g., `1.png`, `2.png`).

4. **Edit Phase**: Once all monitors are captured, it launches the `draw-view` overlay.

5. **Watch Phase (Output)**: Watches the `tmp` directory for a finalized image (starting with `o...png`).

6. **Handoff**: Once the user saves the edit, it launches the main `spatialshot` Electron app with the resulting image.

## 2. Directory Structure & Paths

The Orchestrator resolves paths dynamically based on the OS standard (XDG for Linux, `Library/` for macOS, `AppData` for Windows).

| Path | Description | 
 | ----- | ----- | 
| **Spatial Dir** | The root config/data folder. Contains the `lock` file. | 
| **Tmp Dir** | The shared bus. Contains raw screenshots and the final output. | 
| **Core Script** | A generated script (`core.sh`) used on Unix systems to normalize execution. | 

## 3. Platform Abstraction Layer

The code is structure into `src/platform/` with modules for `linux`, `darwin` (macOS), and `win32`. These modules expose a unified API:

````rust
pub fn run_grab_screen(paths: &AppPaths) -> Result<u32>;
pub fn run_draw_view(paths: &AppPaths) -> Result<()>;
pub fn run_spatialshot(paths: &AppPaths, img_path: &Path) -> Result<()>;
````

### Linux & macOS (Unix-like)

On Unix systems, the Orchestrator generates a `core.sh` script at runtime.

  * **Why?** It simplifies environment variable injection and binary path resolution.

  * **macOS Specifics:** Uses `launchctl asuser` to ensure spawned processes (like the screen grabber) attach to the correct GUI session and user context.

### Windows (Win32)

On Windows, we do not use shell scripts due to execution policy restrictions and performance.

  * **Screen Grabbing:** Uses `EnumDisplayMonitors` (Win32 API) to calculate geometry, but delegates the actual pixel capture to a bundled `nircmdc.exe` for reliability.

  * **DPI Awareness:** Manually sets `DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2` to ensure multi-monitor coordinates are accurate.

  * **Execution:** Spawns processes directly using `Command::new` with `CREATE_NO_WINDOW` flags to prevent console popups.

## 4\. The Watcher Logic (`src/main.rs`)

We use the `notify` crate to monitor filesystem events efficiently.

### Phase 1: Aggregation

The watcher counts files in `tmp_dir`.

````rust
if files_count >= monitor_count {
    // All screens captured -> Launch Editor
    run_draw_view(paths)?;
}
````

### Phase 2: Completion

The watcher looks for a specific file pattern indicating the user finished editing.

````rust
if filename.starts_with('o') && filename.ends_with(".png") {
    // User saved edit -> Launch Main App
    run_spatialshot(paths, out_path)?;
}
````

## 5\. Error Handling & Cleanup

  * **Panic Handling:** If the monitor thread panics or the process is interrupted, the Orchestrator attempts to run `kill_running_packages`.

  * **Zombie Processes:** On startup, `kill_running_packages` scans the process table (`sysinfo` crate) for `scgrabber`, `drawview`, or `spatialshot` and terminates them to ensure a clean state.
