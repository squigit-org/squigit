# 🍎 Spatialshot for macOS: Setup Guide

Because Spatialshot integrates deeply with your system to listen for global hotkeys and capture your screen, macOS requires you to grant specific permissions.

If the app appears "broken" or doesn't respond to the hotkey, it is almost certainly a permission issue. Please follow these steps.

## 1\. The "Damaged" App Fix (Gatekeeper)

If you see a message saying *"Spatialshot is damaged and can't be opened"* or *"Apple cannot check it for malicious software"*, run this command in Terminal.

1.  Open **Terminal** (Cmd+Space, type "Terminal").
2.  Paste the following command and hit Enter:
    ```bash
    xattr -cr /Applications/Spatialshot.app
    ```
    *(Note: Ensure you have moved the app to the Applications folder first).*

-----

## 2\. Granting Permissions

On the first launch (or the first time you press the hotkey), macOS should prompt you. If you missed the prompts, check these settings manually:

### A. Enable Hotkeys (Critical)

To let Spatialshot listen for **Cmd+Shift+A** even when it's in the background:

1.  Open **System Settings** -\> **Privacy & Security**.
2.  Find **Input Monitoring** in the list.
3.  Click the `+` button and add **Spatialshot**.
4.  *If prompted to "Quit & Reopen", click **Quit & Reopen**.*

### B. Enable Screen Capture

To let the engine actually see your screen (otherwise screenshots will be black/purple):

1.  Go to **System Settings** -\> **Privacy & Security**.
2.  Find **Screen Recording**.
3.  Toggle the switch **ON** for **Spatialshot**.

### C. Enable "Silent Shutter" (Audio Control)

To let Spatialshot mute your system audio momentarily during capture:

1.  Go to **System Settings** -\> **Privacy & Security**.
2.  Find **Automation**.
3.  Expand **Spatialshot** and ensure **System Events** is checked.
      * *Note: You may see a popup saying "Spatialshot wants to control System Events". Click **OK**.*

-----

## 3\. Troubleshooting

**"I press Cmd+Shift+A and nothing happens."**

1.  Open **Activity Monitor** and search for `kernel`. If it's not running, launch the Spatialshot app again.
2.  If permissions are checked but it still fails, macOS might have "stale" permissions. Remove Spatialshot from the **Input Monitoring** list using the `-` button, then add it back again.

-----

### Part 2: Brainstorming UX Bugs (macOS Specific)

Even with your "Promax" code, macOS is hostile to background utilities. Here are the specific UX friction points you will face.

#### 1\. The "Silent Fail" (The \#1 Killer)

  * **The Bug:** If the user Denies "Input Monitoring" on the first prompt, your Kernel keeps running, but `rdev` stops receiving events.
  * **The UX:** The user presses `Cmd+Shift+A` repeatedly. Nothing happens. No error message. No UI. They think your app is trash and uninstall it.
  * **The Fix:** You need a startup check. If `rdev` fails to initialize (or if you can detect missing permissions via AppleScript), pop a dialog box saying: *"Hotkeys disabled. Please grant Input Monitoring."*

#### 2\. The "Purple Screen" of Death

  * **The Bug:** The user grants Input Monitoring but Denies "Screen Recording" (privacy paranoia).
  * **The UX:** The hotkey works\! The C++ Engine launches\! But the resulting screenshot passed to the AI is just a solid color (usually desktop wallpaper or black). The AI analyzes nothing.
  * **The Fix:** The C++ Engine should detect if it returned a blank buffer and exit with a specific error code (e.g., `EXIT_NO_PERM`). The Kernel should catch this and launch Electron with a specific "Permission Denied" help page instead of the captured image.

#### 3\. The "Ghost" Process (Update Friction)

  * **The Bug:** You release `v1.1.0`. The user replaces the `.app`. macOS resets the permissions because the binary signature changed (or it considers it a new app).
  * **The UX:** It worked yesterday. It doesn't work today. The user doesn't know they need to re-add it to "Input Monitoring."
  * **The Fix:** Hard to fix programmatically. Requires a "Health Check" button in your Electron UI that verifies if the Kernel is actually receiving input.

#### 4\. The Audio "Pong"

  * **The Bug:** `osascript` is an external process. Spawning it takes \~100-200ms.
  * **The UX:** User presses hotkey -\> OS Shutter Sound plays -\> *Then* the system mutes -\> *Then* the screenshot happens.
  * **The Result:** You failed to mute the shutter sound because the `osascript` spawn time was slower than the Engine startup time.
  * **The Fix:** In `capture.rs`, verify the mute command finished *before* calling `launcher::run_engine`. (Your code effectively does this, but `osascript` latency varies by system load).

#### 5\. The "Zombie" Lock

  * **The Bug:** The Kernel crashes hard (panic) and doesn't run the `Drop` trait for `AudioGuard`.
  * **The UX:** The user is permanently muted. They have to figure out why their sound isn't working.
  * **The Fix:** This is rare now that you removed the double-logger panic, but if power cuts out, it happens. A generic "startup" routine in the kernel that ensures volume is unmuted on launch (just in case) is a good safety net.

#### 6\. The "System Events" Nag

  * **The Bug:** The first time you try to mute, macOS throws a modal dialog: *"Spatialshot wants to control System Events."*
  * **The UX:** This dialog might appear *under* other windows or be invisible if the app is purely background. If the user doesn't click OK, the script hangs or fails, and the capture might timeout.
