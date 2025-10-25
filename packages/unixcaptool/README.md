# unixcaptool

`unixcaptool` is a lightweight, standalone screenshot utility for Unix-like environments (Linux Wayland/X11, macOS), tailored for developers needing automated, multi-monitor captures.

## Features

- **Platform-Agnostic Capture:** Uses Qt for direct capture on X11 and macOS; falls back to xdg-desktop-portal or `grim`/`wlr-randr` on Wayland.
- **Multi-Monitor Support:** Automatically detects and captures each display, saving as `1.png`, `2.png`, etc., with consistent sorting by screen name.
- **Silent Operation:** Temporarily mutes system audio to suppress shutter sounds during capture, restoring original state afterward.

## Requirements

- Qt 6 (with Core, Gui, and DBus modules)
- Wayland/X11/macOS session
- For Wayland wlroots fallback: `grim` and `wlr-randr` installed
- Audio muting: On Linux, one of `pactl` (PulseAudio), `wpctl` (PipeWire), or `amixer` (ALSA); on macOS, osascript.

## Building

Ensure Qt6 development packages are installed (e.g., `sudo apt install qt6-base-dev libqt6dbus6` on Debian-based systems).

Run the build script:

```bash
./build.sh
```

This compiles the tool, installs `unixcaptool` to `/dist`, and cleans up the local binary.

For static builds on Linux (advanced): Use a statically compiled Qt6; modify qmake invocation accordingly. Note: Static Qt6 building is complex and platform-specific.

## Usage

Run `unixcaptool` in a terminal. Screenshots are saved to `$SC_SAVE_PATH` if set, or platform-appropriate cache dir (`~/.cache/spatialshot/tmp` on Linux, `~/Library/Caches/spatialshot/tmp` on macOS).

Example:
```bash
SC_SAVE_PATH=/tmp/screenshots unixcaptool
```

Output files: `1.png`, `2.png`, etc., one per monitor. The directory is recreated fresh each run.
