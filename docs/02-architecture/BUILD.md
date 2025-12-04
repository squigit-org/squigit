# Build Architecture and Deployment Procedures

## 1\. System Overview

The **Spatialshot** application utilizes a polyglot Monorepo architecture designed to optimize performance across specific operational layers. The system is composed of three distinct subsystems, each requiring a specialized build environment and compilation strategy:

1. **CaptureKit (C++/Qt6):** A high-performance, low-level engine responsible for frame buffering, screen geometry calculations, and rendering overlays.
2. **Orchestrator (Rust):** A systems-programming middleware that manages global input hooks, OS-level event propagation, and Inter-Process Communication (IPC).
3. **Presentation Layer (TypeScript/Electron):** The user-facing application container combining a Vite-bundled React frontend (`Core`) with an Electron backend (`Spatialshot`).

To mitigate the complexity of cross-compilation and dependency management across these heterogenous environments, a unified Python-based build orchestrator (`setup.py`) has been developed. This script abstracts the underlying platform-specific logic, ensuring deterministic builds.

-----

## 2\. Automated Build Pipeline

The recommended method for initializing the development environment and producing production-ready binaries is the automated orchestration script.

**Execution:**

```bash
python3 setup.py
```

**Pipeline Operations:**
The orchestrator performs the following sequential operations:

1. **Environment Sanitization:** Scans for and rectifies execution permission bit discrepancies on Unix systems (chmod `+x` on shell scripts) and unblocks PowerShell execution policies on Windows.
2. **Native Compilation:** Triggers the platform-specific build routines for `CaptureKit` (CMake/Ninja) and `Orchestrator` (Cargo).
3. **Frontend Bundling:** Compiles the `Core` React application via Vite.
4. **Artifact Injection:** Transplants the compiled `Core` distribution assets into the `Spatialshot` Electron renderer directory.
5. **Integration Testing:** Executes the `pytest` suite to validate component interoperability.

-----

## 3\. Subsystem: CaptureKit

**Location:** `packages/capturekit/`

CaptureKit represents the most complex component of the build chain due to its reliance on the Qt6 framework. To avoid the significant binary size overhead and licensing constraints of static Qt builds, this project utilizes a **dynamic linking strategy** with a custom packaging implementation.

### 3.1 Linux Build Strategy (Custom PKGBUILD)

Standard tools such as `linuxdeployqt` were deemed insufficient for the granular control required over library bundling. Consequently, a custom `PKGBUILD` bash script was engineered to manage the distribution.

**Build Mechanics:**

1. **Compilation:** Utilizes `CMake` to build the `scgrabber` (Screen Grabber) and `drawview` (Overlay) executables.
2. **Dependency Resolution:** The script iterates through the compiled binaries using `ldd`, recursively identifying and copying shared object (`.so`) dependencies to a local `libs/` directory.
3. **Plugin Management:** Manually replicates the necessary Qt plugin hierarchy (`platforms`, `imageformats`, `generic`) to ensure runtime compatibility without external system dependencies.
4. **Runtime Wrappers:** The build outputs shell wrappers (e.g., `scgrabber`) rather than raw binaries. These wrappers dynamically configure the `LD_LIBRARY_PATH`, `QT_PLUGIN_PATH`, and `qt.conf` at runtime to force the application to utilize the bundled libraries rather than system libraries.

**Dockerized Environment:**
To guarantee libc compatibility and standardize the build environment, a Docker container based on Ubuntu 24.04 is provided.

```bash
# Initialize the build environment
docker build -t capkit packages/capturekit

# Execute the Smoke Test (Validates X11 forwarding and rendering contexts)
./packages/capturekit/SMOKETEST drawview
```

### 3.2 Windows Build Strategy (PowerShell Automation)

The Windows build process is governed by `PKGBUILD.ps1`.

* **Dependency Provisioning:** The script utilizes `aqtinstall` to automatically download and configure a hermetic instance of Qt 6.6.0 (MSVC 2019). This removes the requirement for a pre-existing manual Qt installation.
* **Compilation:** Leverages `Ninja` and `CMake` for accelerated build times.
* **Deployment:** Invokes `windeployqt` to analyze the generated `.exe` files and copy the requisite Dynamic Link Libraries (DLLs) and plugins to the distribution folder.

### 3.3 macOS Build Strategy

The macOS build relies on `macdeployqt` to generate a standard `.app` bundle. This process injects the necessary frameworks, modifies the `Info.plist`, and handles the `install_name_tool` adjustments required for relative path linking.

-----

## 4\. Subsystem: Orchestrator

**Location:** `packages/orchestrator/`

The Orchestrator is built using the Rust toolchain.

**Build Configuration:**

```toml
[profile.release]
lto = true
strip = true
opt-level = 'z'
codegen-units = 1
panic = 'abort'
```

* **Optimization:** The configuration prioritizes binary size (`opt-level = 'z'`) and aggressively strips symbols to ensure a minimal footprint.
* **Windows Subsystem:** The `Cargo.toml` specifies `#![windows_subsystem = "windows"]`. This directive is critical for the integration with Electron; it prevents the spawning of a visible console window when the process is initialized in the background.

-----

## 5\. Subsystem: Presentation Layer (Core & Spatialshot)

**Locations:** `packages/core/` and `packages/spatialshot/`

The frontend architecture separates the UI logic (`Core`) from the desktop container (`Spatialshot`). This requires a strict dependency injection workflow during the build process.

**Integration Workflow:**

1. **Core Compilation:** The `Core` package is built via `vite build`, generating a minified static web application in `packages/core/dist/`.
2. **Asset Migration:** The contents of `dist/` must be physically copied to `packages/spatialshot/source/renderer/view/`. The Electron application is configured to load the User Interface from this directory.
3. **Electron Packaging:** Once the assets are in place, `electron-builder` is invoked to produce the final OS-specific installers (`.exe`, `.dmg`, `.AppImage`).

*Note: The `setup.py` orchestrator automates the directory cleaning and asset migration to prevent stale cache issues.*

-----

## 6\. Troubleshooting and Verification

### 6.1 Library Path Resolution Failures (Linux)

If the CaptureKit binaries fail to execute with "Shared object not found" errors, verify that the wrapper scripts are being executed rather than the binaries suffixed with `-bin`. The wrappers are essential for initializing the `LD_LIBRARY_PATH` to include the relative `libs/` directory.

### 6.2 Qt Platform Plugin Errors

Errors indicating `could not find the Qt platform plugin "xcb"` suggest a malformed distribution directory. Ensure that the `dist/plugins/platforms/` directory contains `libqxcb.so` and that the `qt.conf` file is present in the root of the distribution with the following content:

```ini
[Paths]
Prefix = .
Plugins = plugins
```

### 6.3 Windows Build Failures

If the `PKGBUILD.ps1` fails:

1. Ensure `pwsh` (PowerShell Core) is installed.
2. Verify that `cmake` and `ninja` are present in the system PATH.
3. Check that the script execution policy allows for the running of unsigned scripts (`Set-ExecutionPolicy Unrestricted`).
