# Quick Start

## 1. System Requirements and Pre-Execution Configuration

To guarantee instantaneous capture capabilities, Squigit relies on background execution. The application must remain active in your system's background to ensure rapid response times.

Squigit attempts to automatically register a global shortcut with the host operating system upon installation. Testing the assigned shortcut is recommended to verify successful configuration.

- **Windows:** `Win+Shift+A` (Runs in the System Tray)
- **macOS:** `Cmd+Shift+A` (Runs in the Menu Bar)
- **Linux:** `Super+Shift+A` (Runs in the System Tray)

---

### Operating System Specific Configurations

Users operating on macOS or specific Linux distributions must verify the following configurations prior to initial execution. Windows users may bypass this section and proceed directly to Authentication.

#### macOS: Required Permissions

macOS security architecture necessitates explicit permissions for background keyboard detection and screen pixel reading.

1. **Accessibility:** Upon initial execution, a system prompt will request Accessibility permissions to enable the global shortcut. This must be granted.
2. **Screen Recording:** During the initial capture attempt, Squigit will prompt for Screen & System Audio Recording permissions.

**Troubleshooting a Blank Black Screen on macOS:**
If explicit Screen Recording permission is granted but the capture engine returns a blank black screen, it is likely due to a known macOS permission caching bug. To resolve this:

1. Navigate to **System Settings -> Privacy & Security -> Screen & System Audio Recording**.
2. Locate **Squigit Capture**, highlight the entry, and select the minus (**-**) button to forcefully remove it from the permissions list.
3. Trigger a new capture utilizing the global shortcut (`Cmd+Shift+A`). Squigit will automatically request permission and reopen the settings interface.
4. Toggle the permission to **ON**.
5. **System Restart:** A full restart of the Mac hardware is strictly required to flush the system permission cache.

#### Linux: Manual Shortcut Configuration

Due to the structural variability of Linux environments, automated shortcut registration may fail, particularly on Wayland display servers. If the default `Super+Shift+A` binding is unresponsive, manual configuration via the desktop environment's shortcut manager is required.

**Command Execution String:**

```bash
/bin/sh -lc 'dbus-send --session --type=method_call --dest=com.squigit.app /com/squigit/app com.squigit.app.Capture >/dev/null 2>&1 || busctl --user call com.squigit.app /com/squigit/app com.squigit.app Capture >/dev/null 2>&1 || gdbus call --session --dest com.squigit.app --object-path /com/squigit/app --method com.squigit.app.Capture >/dev/null 2>&1'
```

**Steps for Manual Binding:**

1. Navigate to the system shortcut manager (e.g., **Settings -> Keyboard -> View and Customize Shortcuts**).
2. Instantiate a new custom shortcut.
3. Paste the D-Bus command string above into the execution/command field.
4. Assign the preferred key binding (e.g., `Super+Shift+A`).

_Note: Third-party daemon utilities such as `sxhkd` or `input-remapper` may also be utilized to bind this command. The use of `xbindkeys` is not recommended due to reliability issues under Wayland._

---

## 2. Authentication

Following the initial setup and acceptance of the application guidelines, the primary authentication interface will activate. Authentication via Google is required to instantiate the local user profile and establish the environment state.

---

## 3. Core Functionality and Interface Overview

Once authenticated, the following core modules are available for utilization:

- **Capture & Upload:** Image ingestion is initiated via the assigned global shortcut, clipboard pasting (`Ctrl+V` on Windows/Linux, `Cmd+V` on macOS), or direct drag-and-drop operations into the application window.
- **On-Device OCR:** Squigit performs optical character recognition entirely locally on the host machine. Base models are included; supplementary language modules can be provisioned via **Settings -> Models**.
- **AI & Reverse Search:** Advanced capabilities, including AI overviews and reverse image querying, require integration with a third-party LLM provider. This Bring Your Own Key (BYOK) architecture must be configured under **Settings -> API Keys**.
- **System Personalization:** The behavior, tone, and specific constraints of the integrated AI outputs can be modified through the parameters located in **Settings -> Personalization**.
