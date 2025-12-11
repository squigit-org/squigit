# 🐧 Linux Configuration & Privacy Policy

Spatialshot is designed as a self-contained, XDG-compliant application with native Wayland support via Desktop Portals.

## 1. Global Shortcut Configuration

The installer attempts to automatically register `Super+Shift+A` with your desktop environment (GNOME, KDE, XFCE, etc.).

* **Manual Setup:** If the hotkey does not trigger:
    1. Navigate to **System Settings > Keyboard > Shortcuts**.
    2. Add a **Custom Shortcut**.
    3. **Command:** Point to the daemon binary at `~/.local/share/spatialshot/daemon`.
    4. **Binding:** Set to `Super+Shift+A` (or preferred combination).

## 2. Operational Flow & Portals

Unlike traditional X11 tools, this application respects Wayland security protocols.

* **Trigger:** Press the hotkey to launch the capture instance.
* **Portal Interaction:** A system-level "Screen Share" dialog will appear. This is a mandatory OS security feature. Select your monitor or region to proceed.
* **Analysis:** The AI interface launches immediately post-capture.

## 3. Application Architecture

* **On-Demand Execution:** Spatialshot does not run a persistent background daemon on Linux. The shortcut triggers the application directly via your Compositor (Mutter/KWin), ensuring zero idle resource usage.
* **Desktop Integration:** An entry is automatically created at `~/.local/share/applications/spatialshot.desktop` for launcher access.

## 4. Zero-Trust Architecture

* **Local-First:** Application logic and encryption occur locally.
* **Direct Connection:** API requests are sent directly to Google (`generativelanguage.googleapis.com`).
* **Lens Feature:** This optional feature uses ImgBB as a temporary bridge. Do not use "Lens" mode for sensitive personal data.

---

*By installing this software, you agree to the [**Apache 2.0 License**](https://github.com/a7mddra/spatialshot?tab=Apache-2.0-1-ov-file#readme).*
