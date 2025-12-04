# Debugging Spatialshot

Debugging a polyglot application like Spatialshot requires a multi-faceted approach. Due to the strict separation of concerns, you can often isolate and debug each component—`CaptureKit` (C++), `Orchestrator` (Rust), and `Spatialshot` (Electron/React)—independently.

This guide provides strategies and tools for troubleshooting each part of the system. For high-level development workflows, refer to the [Development Guide](DEVELOPMENT.md).

## 1\. Core Debugging Philosophy

### Component Isolation

The most effective debugging strategy is to test each component in isolation before testing them together.

1. **`Core` (React UI):** Develop and test the frontend as a standard web application using `npm run dev` in `packages/core`. This allows you to perfect the UI and business logic without the complexity of Electron or the backend services.
2. **`CaptureKit` (C++ Binaries):** Execute `scgrabber` and `drawview` directly from your terminal. Provide them with static image paths or test data to verify their functionality without the `Orchestrator`.
3. **`Orchestrator` (Rust Kernel):** Run the `Orchestrator` via `cargo run`. You can manually create, modify, or delete files in the temporary directory (`/tmp/spatialshot` or similar) to simulate the lifecycle and test its state transitions.

### The File-System as a State Machine

The `Orchestrator` communicates with `CaptureKit` and `Spatialshot` via files. The temporary directory is the single source of truth for the application's state. When debugging, **always inspect the contents of this directory**.

- **Initial Capture:** Does `scgrabber` correctly create `1.png`, `2.png`, etc.?
- **Editing Phase:** Is the `Orchestrator` launching `drawview` with the correct paths?
- **Final Output:** When you save in `drawview`, is a file named `o...png` created? This is the trigger for the `Orchestrator` to launch the main `Spatialshot` window.

## 2\. Logging and Diagnostics

Spatialshot provides several layers of logging. The main log files are typically located in the user's data directory (e.g., `~/.local/share/spatialshot/logs/`).

- **`Spatialshot` (Electron):**
  - **Renderer Process:** Open the Developer Tools with `Ctrl+Shift+I` or by launching the app with the `--dev-tools` flag. All `console.log` messages will appear here. Network requests to Gemini and ImgBB can also be inspected.
  - **Main Process:** Uses `electron-log`. Logs are written to both the console and the log files. Launch the application from the command line to see live output.

- **`Orchestrator` (Rust):**
  - Uses the `env_logger` crate. To see verbose output, set the `RUST_LOG` environment variable before running the binary:

      ```bash
      export RUST_LOG=debug
      ./spatialshot-orchestrator
      ```

- **`CaptureKit` (C++/Qt):**
  - Uses Qt's `qDebug()` statements. You can control the output using the `QT_LOGGING_RULES` environment variable. To see debug messages, set the following:

      ```bash
      export QT_LOGGING_RULES="*.debug=true"
      ./drawview /path/to/image.png
      ```

## 3\. Component-Specific Debugging

### Spatialshot (Electron & React)

- **Location:** `packages/spatialshot/` and `packages/core/`
- **Entry Point:** `npm start` in `packages/spatialshot/`

1. **Main Process Debugging:** To debug the main Electron process (`main.js` and IPC handlers), start the application with the `--inspect` flag:

    ```bash
    npm start -- --inspect
    ```

    Then, open Chrome and navigate to `chrome://inspect` to attach the Node.js debugger.

2. **IPC Communication:** If the UI is not responding to backend events, it's likely an IPC issue.

    - Refer to the [IPC Protocol Reference](../05-api-reference/IPC_PROTOCOL.md).
    - Add `console.log` statements in the preload scripts (`preload.js`, `spaload.js`) and the main process IPC handlers (`source/ipc-handlers/`) to trace messages.

3. **State and Configuration:** If the app isn't remembering settings, check the configuration files in the user data directory. Corrupted `preferences.json` or `session.json` files can cause issues. Deleting them will force the app to regenerate them with default values.

4. **Blank or Stale UI:** The React UI (`Core`) is compiled and injected into the Electron app. If you make UI changes that aren't appearing, you may need to re-run the build:

    ```bash
    cd packages/core
    npm run build
    ```

### Orchestrator (Rust)

- **Location:** `packages/orchestrator/`
- **Entry Point:** `cargo run`

1. **Zombie Processes:** On startup, the Orchestrator runs `kill_running_packages` to terminate any leftover processes from a previous failed session. If the application fails to start, manually check for running `scgrabber`, `drawview`, or `spatialshot` processes and kill them.
2. **Platform-Specific Logic:** The Orchestrator has separate modules for each OS in `src/platform/`. If a bug is OS-specific, this is the first place to look.
3. **File Permissions:** The Orchestrator and its child processes need to be executable. The `setup.py` script handles this automatically, but if you are managing binaries manually, ensure they have the `+x` flag on Linux/macOS.

### CaptureKit (C++/Qt)

- **Location:** `packages/capturekit/`
- **Entry Point:** Build with CMake/Ninja, then run binaries directly.

1. **Linux Library Errors:**

    -**"Shared object not found":** You are likely running the raw binary (e.g., `drawview-bin`) instead of the wrapper script (`drawview`). The wrapper script is essential as it sets `LD_LIBRARY_PATH` to point to the bundled Qt libraries.
    -**"Could not find the Qt platform plugin 'xcb'":** This means the `dist/plugins/platforms/` directory is missing `libqxcb.so` or the `qt.conf` file is incorrect or missing. Refer to the `BUILD.md` troubleshooting section.

2. **Windows DLL Issues:**

    - Use a tool like "Dependencies" (a rewrite of Dependency Walker) to inspect the `.exe` files and check for missing DLLs.
    - Ensure that `windeployqt` was run correctly during the build process.

3. **Wayland Capture Failures (Linux):**

    - `scgrabber` has a complex fallback chain for capturing on Wayland (DBus Portal -> `wlr-randr`/`grim`).
    - Test each mechanism independently to see where it fails. For example, try running `grim` from your terminal to see if it works.
    - Ensure you have `xdg-desktop-portal` and a relevant backend (e.g., `xdg-desktop-portal-wlr`) installed.

## 4\. Integration Testing

The `pytest` suite provides end-to-end testing that mimics the full application lifecycle.

```bash
# Run all integration tests
pytest tests/integration/
```

Running these tests can quickly identify regressions or breakages in the communication chain between the different components.
