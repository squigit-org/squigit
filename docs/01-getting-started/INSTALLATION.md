# Installation

Welcome to SnapLLM! Our installers are designed to be lightweight "bootstrap loaders." They don't contain the application itself; instead, they automatically download and install the latest version of all components from our GitHub repository. This ensures you always start with the most up-to-date version.

## Download the Installer

You can find the latest installers for all operating systems on our GitHub Releases page.

➡️ **[Download from the Official GitHub Releases Page](https://github.com/a7mddra/snapllm/releases/tag/installers)**

Look for the `.exe` (Windows), `.dmg` (macOS), or the Linux binary file appropriate for your system.

---

## Installation Instructions

### Windows

1. Download the `SnapLLM_Installer.exe` file.
2. Run the downloaded executable to start the setup wizard.
3. Follow the on-screen instructions.

The installer will:

- Download and place the application files in `%LOCALAPPDATA%\SnapLLM`.
- Create a desktop shortcut.
- Set up a global hotkey (**`Win + Shift + A`**) that runs automatically on startup.

**To Uninstall:** Use the "Add or remove programs" feature in Windows Settings, or run the `Uninstall.exe` located in the application's installation directory.

### macOS

1. Download the `snapllm-installer.dmg` file.
2. Open the `.dmg` file to mount it.
3. Run the `Install SnapLLM.app`. A terminal-like window will open to show the installation progress.

The installer will:

- Copy `SnapLLM.app` to your `/Applications` folder.
- Automatically clear the Gatekeeper quarantine flag (`xattr -cr`) to ensure the app can run.
- Create a system-wide service to enable the global hotkey (**`Cmd + Shift + A`**).

**To Uninstall:** An uninstaller script is created during installation. You can find it at: `~/Library/Application Support/snapllm/Uninstall SnapLLM.command`. Double-click this script to remove the application and all related files.

### Linux

1. Download the `snapllm-installer` binary.
2. Open your terminal and make the installer executable:

   ```bash
   chmod +x ./snapllm-installer
   ```

3. Run the installer from your terminal:

   ```bash
   ./snapllm-installer
   ```

The installer will:

- Download and place application files in `~/.local/share/snapllm`.
- Create an application menu entry (`.desktop` file).
- Create a command-line wrapper script at `~/.local/bin/snapllm`.
- Attempt to automatically configure the global hotkey (**`Super + Shift + A`**) for your desktop environment (GNOME, KDE, XFCE, etc.).

**To Uninstall:** Run the command `snapllm uninstall` in your terminal.
