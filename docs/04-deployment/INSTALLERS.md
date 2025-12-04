# Installer Architecture and Deployment Strategy

## 1\. Distribution Philosophy

Unlike monolithic application distributions (e.g., AppImage, MSI), the Spatialshot deployment strategy treats the application as a modular ecosystem comprising three distinct runtime components: the Electron frontend, the Rust Orchestrator, and the C++ CaptureKit.

The installers function as **thin-client bootstrap loaders**. They do not bundle the application binaries directly. Instead, they perform a **dynamic ingestion** of the latest artifacts from the remote repository at runtime. This ensures that the installation process always yields the most current release version, decoupling the installer version from the application version.

The installation process initializes a user-space environment similar to a development setup, ensuring that binaries, configuration files, and inter-process communication (IPC) bridges are established in writable directories without requiring root privileges (except where necessary for global system integration).

-----

## 2\. Linux Deployment Mechanism

**Source:** `packaging/linux/`
**Technology:** Go (Golang) with Embedded Assets

The Linux installer is compiled as a standalone Go binary (`main.go`). This approach was selected to eliminate shell compatibility issues and ensure atomic execution of the installation logic. The binary utilizes the `embed` package to contain the necessary shell scripts (`install.sh`, `hotkey.sh`, `uninstall.sh`) within the executable itself.

### 2.1 Installation Routine

1. **Environment Resolution:** The binary resolves standard XDG directories (`XDG_DATA_HOME`, `XDG_CACHE_HOME`) to ensure compliance with Linux filesystem standards.
2. **Artifact Retrieval:** The embedded `install.sh` script utilizes `wget` to download zipped artifacts for the Orchestrator, CaptureKit, and the main Electron binary from the GitHub Releases `latest` endpoint.
3. **Permissions Management:** Executable bits (`chmod +x`) are applied to the downloaded binaries immediately after extraction.

### 2.2 Desktop Environment Heuristics (Hotkeys)

**Script:** `packaging/linux/scripts/hotkey.sh`

Spatialshot requires a global hotkey (`Super+Shift+A`) to trigger the capture engine. As Linux lacks a unified input registry, the installer implements a heuristic engine to detect the running Desktop Environment (DE) and inject the appropriate configuration.

-----

## 3\. macOS Deployment Mechanism

**Source:** `packaging/macos/`
**Technology:** Platypus (Shell wrapper) & Automator

The macOS installer is packaged using **Platypus**, which wraps a bash script (`installer.sh`) into a native macOS Application Bundle (`.app`). This allows for a standard graphical launch experience while executing shell-level provisioning.

### 3.1 Gatekeeper and Quarantine Management

Due to the ad-hoc nature of the binary ingestion, macOS Gatekeeper will flag the downloaded binaries. The installer actively manages this by recursively applying the `xattr -cr` command to the downloaded bundles (`Spatialshot.app` and `capkit` binaries) to clear the quarantine attributes, effectively bypassing signature enforcement for the local machine.

### 3.2 System Service Injection

macOS does not natively allow background applications to intercept global key events without Accessibility permissions. To circumvent the need for invasive permission prompts, the installer creates a **System Service**:

1. **Workflow Compilation:** It compiles an Automator workflow (`.workflow`) using `osacompile`. This workflow executes the `orchestrator-macos` binary.
2. **PBS Registration:** It directly modifies the `pbs.plist` (PbxSystemServices) preferences file to map `Cmd+Shift+A` to the created service.
3. **Service Flush:** It kills `cfprefsd` and `pbs` to force the system to reload the service registry immediately.

-----

## 4\. Windows Deployment Mechanism

**Source:** `packaging/windows/`
**Technology:** NSIS (Nullsoft Scriptable Install System) & PowerShell

The Windows installer is built using NSIS (`installer.nsi`), providing a standard Wizard interface. The heavy lifting of artifact retrieval and configuration is delegated to embedded PowerShell calls.

### 4.1 Artifact Expansion

The installer utilizes `Invoke-WebRequest` to fetch the ZIP files and `Expand-Archive` to unpack them into `%LOCALAPPDATA%\Spatialshot`. This directory structure mirrors the Linux `~/.local/share` layout, creating a contained environment for the ecosystem.

### 4.2 PowerShell Hotkey Listener

Windows lacks a native "command-line" method to register a global hotkey that launches an executable without that executable already running. The installer solves this by generating a persistent background listener:

1. **P/Invoke Generation:** The installer dynamically writes a PowerShell script (`hotkey_listener.ps1`) that defines a C\# class using `Add-Type`. This class imports `RegisterHotKey` and `GetMessage` from `user32.dll`.
2. **VBScript Wrapper:** To prevent a PowerShell console window from appearing on startup, a VBScript (`launch_hotkey.vbs`) is created to launch the PowerShell listener with `-WindowStyle Hidden`.
3. **Persistence:** A shortcut to the VBScript is placed in the user's `Startup` folder.

-----

## 5\. Artifact Ingestion Strategy

All three installers operate on a "Pull" model. They are hardcoded to fetch resources from specific endpoints:

* **Base URL:** `https://github.com/a7mddra/spatialshot/releases`
* **Resolution:** Uses `/latest/download/` to ensure the installer—regardless of when it was downloaded—always provisions the most up-to-date version of the application components.

This strategy delegates version control entirely to the GitHub Releases API, removing the need for an auto-updater mechanism within the application code itself. The installer effectively acts as both the setup wizard and the updater.
