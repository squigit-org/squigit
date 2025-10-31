# CaptureKit

CaptureKit is a cross-platform C++/Qt6 toolkit for screen capturing and annotation. It provides the core "capture and draw" functionality for the SpatialShot application.

## Core Components

The package produces two main executables:

1. **`scgrabber`**: A command-line utility that captures screenshots.
    * It saves a PNG image for each connected monitor.
    * It temporarily mutes system audio during capture to suppress shutter sounds.
    * On Windows, this functionality is handled by a PowerShell script in the orchestrator package.

2. **`drawview`**: A graphical application for annotation.
    * It opens a full-screen window on each monitor, displaying the captured screenshot.
    * The user can draw a freehand shape to select an area.
    * The application then crops the screenshot to the bounds of the drawing and saves the result.

## Platform Support

CaptureKit is designed to be cross-platform:

* **Linux**: Supports both **X11** (using native Qt APIs) and **Wayland** (using the Freedesktop portal with a fallback to `grim`/`wlr-randr`).
* **macOS**: Uses native Qt APIs for capture and `macdeployqt` for bundling.
* **Windows**: The `drawview` GUI is built with MSVC and bundled with `windeployqt`.

## Build

The project is built using CMake and Qt6. Platform-specific build and packaging logic is handled by:

* `PKGBUILD`: A shell script for Linux and macOS.
* `PKGBUILD.ps1`: A PowerShell script for Windows.
