# 🍎 macOS Configuration & Privacy Policy

Spatialshot requires specific system permissions to capture screen data and process global hotkeys. Please review the following configuration steps and privacy protocols.

## 1. Installation Verification

Due to Apple's security policies for open-source software, macOS may flag the application as "damaged" upon first launch.

* **Action:** If launch fails, open **Terminal** and execute:

```bash
xattr -cr /Applications/Spatialshot.app
```

## 2\. Essential Permissions

To prevent "black screen" captures and ensure hotkey responsiveness, you must grant the following in **System Settings \> Privacy & Security**:

1. **Input Monitoring** (Required)
      * *Enable for:* **Spatialshot**
      * *Function:* Allows the background daemon to detect the `Cmd+Shift+A` trigger.
      * *Note:* You may need to restart the app after enabling this.
2. **Screen Recording** (Critical)
      * *Enable for:* **Spatialshot**
      * *Function:* Grants the capture engine access to display pixels. **Failure to enable this will result in black/empty screenshots.**
3. **Automation** (Optional)
      * *Enable for:* **Spatialshot \> System Events**
      * *Function:* Allows the application to silence the system shutter sound during capture.

## 3\. Usage

* **Trigger:** Press `Cmd ⌘` + `Shift ⇧` + `A`.
* **Analysis:** Draw a region to instantly capture and analyze.

## 4\. Zero-Trust Architecture

* **Local-First:** Application logic and encryption occur locally on your device.
* **Direct Connection:** API requests are sent directly to Google (`generativelanguage.googleapis.com`). No intermediate servers are used.
* **Lens Feature:** This optional feature uses ImgBB as a temporary bridge. Do not use "Lens" mode for sensitive personal data.

-----

*By installing this software, you agree to the [**Apache 2.0 License**](https://github.com/a7mddra/spatialshot?tab=Apache-2.0-1-ov-file#readme).*
