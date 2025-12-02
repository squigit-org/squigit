## 📦 Installation & Setup

SpatialShot is designed to be lightweight and non-intrusive. We provide automated installers that handle dependencies, binary placement, and hotkey registration.

### 🐧 Linux

**Installation**

1. Download the latest **`spatialshot-installer-linux`** binary from [Releases](https://www.google.com/search?q=%23).
2. Make the file executable and run it (or double-click it in your file manager):

    ```bash
    chmod +x spatialshot-installer-linux
    ./spatialshot-installer-linux
    ```
3. The installer will:
      * Download the latest engine components.
      * Register the global hotkey (**Super+Shift+A**).
      * Install the `spatialshot` CLI tool.

**Uninstallation**
To remove the application, artifacts, and CLI wrappers, simply run:

```bash
spatialshot uninstall
```

-----

### 🍎 macOS

**Installation**

1. Download **`spatialshot-installer.dmg`** from [Releases](https://www.google.com/search?q=%23).
2. Open the DMG and double-click **"Install SpatialShot.app"**.
3. **Gatekeeper Note:** Since this is an open-source tool, macOS may prevent it from opening. To bypass this:
    * **Right-click** the installer and select **Open**.
      * Click **Open** in the confirmation dialog.
4. The installer will set up the application and create a System Service for the hotkey.

**Activating the Hotkey**
The installer attempts to register **Cmd+Shift+A** automatically. If it does not work immediately:

1. Go to **System Settings** \> **Keyboard** \> **Keyboard Shortcuts...**
2. Select **Services** in the sidebar.
3. Expand **General** and ensure **"SpatialShot Capture"** is checked.
4. Double-click the "none" area next to it to manually assign **Cmd+Shift+A** (or your preferred key).

**Uninstallation**
We provide a dedicated cleanup script that removes the app, the background service, and all cached data.

1. Press `Cmd + Space` to open Spotlight.
2. Type **"Uninstall SpatialShot"** and press Enter.
3. A terminal window will open, remove all files, and close automatically.

*(Alternatively, you can find the uninstaller at `~/Library/Application Support/spatialshot/Uninstall SpatialShot.command`)*
