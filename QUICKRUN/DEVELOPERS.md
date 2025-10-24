# SpatialShot Development Core

This directory contains the core development launcher for SpatialShot.

## Development Launcher (`launcher.py`)

The `launcher.py` script serves as the primary entry point for developers. It is designed to orchestrate the complete, cross-platform application flow, automating the capture process and launching the user interface for analysis.

This script enables developers to test the full application lifecycle using Python, without needing to compile the final Rust orchestrator.

### How it Works

The launcher executes the entire application workflow in a precise sequence:

1. **Environment Detection:** The script first identifies the host operating system (Windows, macOS, or Linux) and, on Linux, distinguishes between X11 and Wayland display servers.
2. **Directory Management:** It locates the platform-specific temporary directory and clears its contents to ensure a clean state for the current session.
3. **Platform-Specific Capture:** Based on the detected environment, the script executes the appropriate "screen grabber" (screenshot) utility:
      * **Windows:** `sc-grabber.ps1`
      * **macOS:** `sc-grabber.sh`
      * **Linux (X11):** `sc-grabber.sh`
      * **Linux (Wayland):** The [ycaptool](../packages/ycaptool/README.md) binary.
4. **Drawing Interface Launch:** The script monitors the temporary directory for the newly created screenshot(s). Upon detection, it launches the C++/Qt **`squiggle`** application, which provides the drawing interface.
5. **UI Panel Handoff:** After the user completes the drawing, the script waits for `squiggle` to save the final cropped image. Once this file is present, the script launches the Electron **`spatialshot`** application via `npm start`, passing the output image path as an argument for analysis.

### Usage

To run the development launcher, execute the script from your terminal:

```bash
python3 launcher.py #NOTE: we assume you executed setup.py first
```

The script will provide detailed log output to the console for each stage of the process, aiding in debugging and development.
