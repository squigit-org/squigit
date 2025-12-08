# 🍎 Spatialshot for macOS: Setup & Privacy

Welcome to the future of screen intelligence! Because Spatialshot uses native code to "see" your screen and listen for shortcuts, macOS requires you to grant a few special permissions.

**Don't worry—your data never leaves your device.**

---

## 1. 🚧 First Hurdle: "App is Damaged"

If you open the app and macOS says: *"Spatialshot is damaged and can't be opened"* (Apple's way of saying "I don't know this developer yet"), do this:

1.  Open **Terminal** (Cmd + Space, type `Terminal`).
2.  Paste this magic command and hit **Enter**:
    ```bash
    xattr -cr /Applications/Spatialshot.app
    ```
    *(Make sure you've moved the app to your Applications folder first!)*

---

## 2. Granting Permissions (The Big Three)

For the AI to see your screen and hear your hotkey, you need to toggle three switches in **System Settings** -> **Privacy & Security**.

### A. Enable the Hotkey (Input Monitoring)
*Allows the app to listen for `Cmd + Shift + A` even when minimized.*
1.  Go to **Privacy & Security** > **Input Monitoring**.
2.  Click `+`, add **Spatialshot**, and toggle it **ON**.
3.  *If asked to "Quit & Reopen", click **Quit & Reopen**.*

### B. Enable Vision (Screen Recording)
*Allows the engine to capture the pixels you select. Without this, the AI sees a black screen.*
1.  Go to **Privacy & Security** > **Screen Recording**.
2.  Toggle **Spatialshot** to **ON**.

### C. Enable Silent Mode (Automation)
*Allows the app to momentarily mute the system shutter sound.*
1.  Go to **Privacy & Security** > **Automation**.
2.  Expand **Spatialshot** and make sure **System Events** is toggled **ON**.

---

## 3. 🚀 How to Use

Once installed, Spatialshot runs quietly in the background.

### **Press `Cmd ⌘` + `Shift ⇧` + `A`**

1.  **Select:** Draw a box around anything on your screen (code, error logs, memes).
2.  **Ask:** Chat with the AI about what you captured.

---

## 4. 🛡️ Privacy & BYOK (Bring Your Own Key)

Spatialshot follows a **Local-First, Zero-Trust** philosophy.

* **You hold the Keys:** You must provide your own Google Gemini API Key. It is stored **encrypted on your disk**. We never see it.
* **Direct Connection:** The app talks directly to Google (`generativelanguage.googleapis.com`). There is no middleman server.
* **Google Lens:** If you use the "Lens" feature, images are uploaded to **ImgBB** to generate a public link for Google. If your image is sensitive, please use the standard Chat feature instead.

---

## 5. 🚑 Troubleshooting

**"I press the hotkey and nothing happens!"**
macOS permissions can get "stuck."
1.  Go to **Input Monitoring**.
2.  Select **Spatialshot** and click the minus (`-`) button to remove it.
3.  Add it back again.

**"The AI says it sees a black screen."**
1.  Check **Screen Recording** permissions.
2.  Restart the app.

---

*By installing this software, you agree to the [Apache 2.0 License](https://github.com/a7mddra/spatialshot?tab=Apache-2.0-1-ov-file#readme).*
