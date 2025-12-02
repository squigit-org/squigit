# CaptureKit Architecture

**CaptureKit** is the high-performance visual layer of SpatialShot, written in **C++17** using the **Qt6** framework. It consists of two distinct binaries that perform the heavy lifting for screen capturing and image manipulation.

## 1. The Two Binaries

Unlike the Orchestrator (which manages *process* flow), CaptureKit handles *pixels*.

| Binary | Platforms | Role |
 | ----- | ----- | ----- |
| **`scgrabber`** | Linux, macOS | Captures screenshots of all monitors simultaneously. (Windows uses `nircmd` via Orchestrator). |
| **`drawview`** | All Platforms | Creates a fullscreen, frameless overlay for selecting, cropping, and drawing on the screenshot. |

## 2. scgrabber: The Camera (Linux/macOS)

`scgrabber` is designed to be invisible. It launches, captures, saves files, and exits immediately. It handles the complexity of modern display servers.

### The Wayland Challenge

On X11 and macOS, we can capture screens directly using Qt (`screen->grabWindow(0)`). On Wayland, this is forbidden for security reasons. `scgrabber` implements a complex fallback chain:

````mermaid
graph TD
    A[Start Capture] --> B{Platform?}
    B -- macOS/X11 --> C[Direct Qt Capture]
    B -- Wayland --> D{DBus Portal?}
    
    D -- Yes --> E[Request org.freedesktop.portal.Screenshot]
    E --> F[Receive Full Desktop Composite URI]
    F --> G[Logic: Split Composite Image]
    G --> H[Save 1.png, 2.png...]
    
    D -- No --> I{Wlroots Fallback?}
    I -- Yes --> J[Exec: wlr-randr + grim]
    J --> H
    
    I -- No --> K[Error]

````

* **The Splitter Logic (`helpers.cpp`):** When using the Portal, we receive one giant image containing all monitors. `scgrabber` calculates the logical geometry of every monitor vs. the physical geometry of the image and "slices" the giant image back into individual monitor feeds (`processFullPixmap`).

### Audio Suppression (`audmgr`)

To prevent the OS from playing a loud "shutter" sound, `scgrabber` temporarily mutes the system audio stream before capturing and restores it immediately after.

* **Linux:** Detects `pactl`, `wpctl`, or `amixer`.

* **macOS:** Uses `osascript` to mute output volume.

## 3\. drawview: The Canvas (Cross-Platform)

`drawview` is a specialized **frameless window** (`Qt::FramelessWindowHint`) that sits on top of every other window (`Qt::WindowStaysOnTopHint`).

### Rendering Pipeline

1. **Input:** Receives the path to the raw screenshot (from `scgrabber` or Orchestrator).

2. **Composition:**

      * Layer 1: The Background Image (The screenshot).

      * Layer 2: A dark gradient overlay (opacity animated on entry).

      * Layer 3: The Drawing Path (`QPainterPath` with Glow Effect).

3. **The Glow:** The brush isn't just a white line. It renders 5 layers of varying opacity and width using `QPainter::CompositionMode_Screen` to simulate a neon light effect.

### Cropping Logic

When the user releases the mouse after drawing:

1. Calculates the bounding box of the drawn stroke.

2. Crops the original background image to that rect.

3. Saves the result starting with `o` (e.g., `o1.png`) to signal the Orchestrator that the user is done.

## 4\. The Watchdog (Linux Specific)

On Linux, if a user unplugs a monitor while `drawview` is open, the overlay might crash or cover the wrong area. To solve this, `drawview` spawns a **Watchdog** thread (`watchdog.cpp`).

* **Embedded Script:** It runs an embedded Bash script that polls `xrandr`, `swaymsg`, `kscreen-doctor`, or `drm/sysfs` every second.

* **Trigger:** If the monitor count changes, the Watchdog force-quits `drawview` to prevent zombie overlays.
