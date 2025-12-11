# 📦️ Spatiashot setup wizard

## --- Artifact URLs ---

```bash
RELEASES_URL="https://github.com/a7mddra/spatialshot/releases"
LATEST_URL="${RELEASES_URL}/latest/download"
INSTALLERS_URL="${RELEASES_URL}/download/installers"
EXEC_SUFFIX="-{win | mac | linux}-{x64 | arm64}.zip"
```

-----

## --- PKGS ---

PKGS={ "daemon", "capture", "app", "setup" }

-----

## --- BLUEPRINTS ---

### 1\. Windows Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: %LOCALAPPDATA%\Programs\Spatialshot\
(Read Only / User Scope)
│
├── daemon.exe                  <-- [BACKGROUND SERVICE] Rust Orchestrator
├── unins000.exe                <-- Uninstaller
│
├── Capture\                    <-- [CONTAINER] Qt6 Native Tool
│   ├── capture.exe
│   └── {Qt DLLs}
│
└── App\                        <-- [CONTAINER] Electron Dist
    ├── spatialshot.exe         <-- [APP CORE] The UI Host
    ├── {DLLs & Locales}        <-- Electron Dependencies
    └── resources\
        └── app.asar            <-- [SOURCE] Bundled Source


[ UPDATE/SETUP STAGING ]
Path: %APPDATA%\Spatialshot\updates\
│
└── Spatialshot-Setup.exe       <-- [TAURI] The Updater/Bootstrapper
```

-----

### 2\. macOS Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: /Applications/Spatialshot.app
(Read Only / Signed Bundle / Hybrid Structure)
│
└── Contents/
    ├── Info.plist              <-- Points to 'Spatialshot' (The Core)
    ├── Frameworks/             <-- Chromium Dylibs
    │
    ├── MacOS/
    │   ├── Spatialshot         <-- [APP CORE] Main Binary
    │   └── daemon              <-- [BACKGROUND SERVICE] Injected Rust Binary
    │
    └── Resources/
        ├── Capture/            <-- [CONTAINER] Injected Qt6 Mach-O
        │   └── capture
        └── app.asar


[ UPDATE/SETUP STAGING ]
Path: ~/Library/Application Support/Spatialshot/updates/
│
└── Spatialshot-Setup.dmg       <-- [TAURI] The Updater (Mounts & Copies)


[ LAUNCH AGENT ]
Path: ~/Library/LaunchAgents/com.spatialshot.daemon.plist
(Triggers ../Contents/MacOS/daemon at Login)
```

-----

## 3\. Linux Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: $HOME/.local/share/spatialshot/
(Read Only / XDG Compliant)
│
├── daemon                      <-- [ORCHESTRATOR] Rust Binary
│
├── capture/                    <-- [CONTAINER] Qt6 ELF
│   ├── capture
│   └── {Qt Libs}
│
└── app/                        <-- [CONTAINER] Electron Dist
    ├── spatialshot             <-- [APP CORE] Main Binary
    ├── libffmpeg.so
    └── resources/
        └── app.asar


[ UPDATE/SETUP STAGING ]
Path: $HOME/.config/spatialshot/updates/
│
└── Spatialshot-Setup           <-- [TAURI] The Updater Binary


[ DESKTOP ENTRY ]
Path: $HOME/.local/share/applications/spatialshot.desktop
(Points to .../app/spatialshot)
```

-----

## --- Actions per Platform ---

### Windows

- Kill existing `daemon.exe` process via IPC
- Install to `%TEMP%` during setup, then overwrite `%LOCALAPPDATA%\Programs\Spatialshot\`
- Create/Update `%APPDATA%\Spatialshot\updates\Spatialshot-Setup.exe`
- Create/Update Uninstaller at `%LOCALAPPDATA%\Programs\Spatialshot\unins000.exe`
- Write `HKCU` Registry Key for auto-launch of `daemon.exe` at login
- Spawn `daemon.exe` process manually after setup completes

### macOS

- Kill existing `daemon` process via IPC
- Pop a password prompt for `sudo` for overwriting `/Applications/Spatialshot.app`
- Detect macos architecture (x64 | arm64)
- Install to `/tmp` during setup, then overwrite `/Applications/Spatialshot.app`
- xattr +x /Applications/Spatialshot.app/Contents/MacOS/daemon
- xattr +x /Applications/Spatialshot.app/Contents/MacOS/Spatialshot
- xattr +x /Applications/Spatialshot.app/Contents/Resources/Capture/capture
- Create/Update `~/Library/Application Support/Spatialshot/updates/Spatialshot-Setup.dmg`
- Write `com.spatialshot.daemon.plist` to `~/Library/LaunchAgents/`
- Run `launchctl load -w ~/Library/LaunchAgents/com.spatialshot.daemon.plist` after setup completes
- Spawn `daemon` process manually after setup completes

### linux

- Install to `/tmp` during setup, then overwrite `$HOME/.local/share/spatialshot/`
- Run hotkey.sh to install hotkey listener (OS process, daemon isn't a background service on linux)
- Create/Update `$HOME/.config/spatialshot/updates/Spatialshot-Setup`
- Create/Update `$HOME/.icons/applications/spatialshot/512.png` icon
- Create/Update desktop entry at `$HOME/.local/share/applications/spatialshot.desktop`
- Create `$ spatialshot uninstall` wrapper script to uninstall the app

-----

## --- Directory creation after tmp ---

### windows dirs

- %LOCALAPPDATA%\Programs\Spatialshot\
- %APPDATA%\Spatialshot\updates\
- unzip Spatialshot-win-x64.zip -d %LOCALAPPDATA%\Programs\Spatialshot\APP
- unzip Spatialshot-capture-win-x64.zip -d %LOCALAPPDATA%\Programs\Spatialshot\Capture
- unzip Spatialshot-daemon-win-x64.zip -d %LOCALAPPDATA%\Programs\Spatialshot\
- unzip Spatialshot-setup-win-x64.zip -d %APPDATA%\Spatialshot\updates\Spatialshot-Setup.exe

### macos dirs

- /Applications/Spatialshot.app/
- ~/Library/Application Support/Spatialshot/updates/
- unzip Spatialshot-mac-{arch}.zip -d /Applications/Spatialshot.app
- unzip Spatialshot-capture-mac-{arch}.zip -d /Applications/Spatialshot.app/Contents/Resources/Capture
- unzip Spatialshot-daemon-mac-{arch}.zip -d /Applications/Spatialshot.app/Contents/MacOS
- unzip Spatialshot-setup-mac-{arch}.zip -d ~/Library/Application Support/Spatialshot/updates/Spatialshot-Setup.dmg

### linux dirs

- $HOME/.local/share/spatialshot/
- $HOME/.config/spatialshot/updates/
- $HOME/.icons/applications/spatialshot/
- unzip Spatialshot-linux-x64.zip -d $HOME/.local/share/spatialshot/app
- unzip Spatialshot-capture-linux-x64.zip -d $HOME/.local/share/spatialshot/capture
- unzip Spatialshot-daemon-linux-x64.zip -d $HOME/.local/share/spatialshot/
- unzip Spatialshot-setup-linux-x64.zip -d $HOME/.config/spatialshot/updates/Spatialshot-Setup

-----

## --- User Instructions (client side setup) ---

### windows instructions

````md
# Windows Configuration & Privacy Policy

Spatialshot operates as a lightweight background service designed for minimal resource usage. Please review the installation and privacy protocols below.

## 1. Installation Verification (SmartScreen)

As an open-source project without a commercial EV certificate, Microsoft Defender SmartScreen may flag this installer as unrecognized.

* **Action:** If you see the "Windows protected your PC" prompt:
    1. Click **More info**.
    2. Select **Run anyway**.

## 2. Operational Workflow

* **Global Hotkey:** `Win ⊞` + `Shift ⇧` + `A`
* **Process:** Trigger the hotkey to freeze the screen, draw a region, and immediately launch the AI analysis window.
* **Display Support:** The engine utilizes native Qt6 rendering for pixel-perfect accuracy on High-DPI (4K) and multi-monitor configurations.

## 3. Zero-Trust Architecture

* **Local-First:** Your Google Gemini API Key is stored **encrypted on your local disk**. It is never transmitted to us.
* **Direct Connection:** API requests are sent directly to Google (`generativelanguage.googleapis.com`). No intermediate servers are used.
* **Lens Feature:** This optional feature uses ImgBB as a temporary bridge. **Do not use "Lens" mode for sensitive personal data.**

---

*By installing this software, you agree to the [Apache 2.0 License](https://github.com/a7mddra/spatialshot?tab=Apache-2.0-1-ov-file#readme).*

````

### macOS instructions

````md
# 🍎 macOS Configuration & Privacy Policy

Spatialshot requires specific system permissions to capture screen data and process global hotkeys. Please review the following configuration steps and privacy protocols.

## 1. Installation Verification

Due to Apple's security policies for open-source software, macOS may flag the application as "damaged" upon first launch.

* **Action:** If launch fails, open **Terminal** and execute:

```bash
    `xattr -cr /Applications/Spatialshot.app`
```

## 2. Essential Permissions

To prevent "black screen" captures and ensure hotkey responsiveness, you must grant the following in **System Settings > Privacy & Security**:

1. **Input Monitoring** (Required)
    * *Enable for:* **Spatialshot**
    * *Function:* Allows the background daemon to detect the `Cmd+Shift+A` trigger.
2. **Screen Recording** (Critical)
    * *Enable for:* **Spatialshot**
    * *Function:* Grants the capture engine access to display pixels. **Failure to enable this will result in black/empty screenshots.**
3. **Automation** (Optional)
    * *Enable for:* **Spatialshot > System Events**
    * *Function:* Allows the application to silence the system shutter sound during capture.

## 3. Usage

* **Trigger:** Press `Cmd ⌘` + `Shift ⇧` + `A`.
* **Analysis:** Draw a region to instantly capture and analyze.

## 4. Zero-Trust Architecture

* **Local-First:** Application logic and encryption occur locally on your device.
* **Direct Connection:** API requests are sent directly to Google (`generativelanguage.googleapis.com`). No intermediate servers are used.
* **Lens Feature:** This optional feature uses ImgBB as a temporary bridge. Do not use "Lens" mode for sensitive personal data.

---

*By installing this software, you agree to the [Apache 2.0 License](https://github.com/a7mddra/spatialshot?tab=Apache-2.0-1-ov-file#readme).*

````

### linux instructions

````md
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

*By installing this software, you agree to the [Apache 2.0 License](https://github.com/a7mddra/spatialshot?tab=Apache-2.0-1-ov-file#readme).*

````
