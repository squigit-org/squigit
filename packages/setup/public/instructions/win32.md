# ⚠ Spatialshot for Windows: Setup & Privacy

Welcome! On Windows, Spatialshot is designed to be invisible until you need it. We use a tiny **145KiB Rust daemon** that sits quietly in the background, waiting for your command.

---

## 1. 🛡️ The "Blue Screen" (SmartScreen)

When you first run the installer or the app, you might see a bright blue window saying **"Windows protected your PC"**.

This happens because Spatialshot is an open-source indie project and isn't "digitally signed" by a corporation. **It is safe.**

**To continue:**
1.  Click **<u>More info</u>** (under the text).
2.  Click the **Run anyway** button that appears.

---

## 2. ⌨️ How to Use

Once installed, you won't see a window pop up. The app lives in your system tray area, using almost zero RAM.

### **Press `Win ⊞` + `Shift ⇧` + `A`**

1.  **Freeze:** The screen will freeze instantly.
2.  **Select:** Draw a box around the code, error, or image you want to analyze.
3.  **Chat:** The AI window opens immediately.

---

## 3. 🖥️ Multi-Monitor & 4K Ready

Hate it when screenshot tools zoom in weirdly or get blurry on 4K screens?
* **No "Zombie" Zoom:** We handle Windows High-DPI scaling natively (Qt6).
* **Crystal Clear:** Your captures remain pixel-perfect, ensuring the AI can read even the smallest text.

---

## 4. 🛡️ Privacy & BYOK (Bring Your Own Key)

Spatialshot follows a **Local-First, Zero-Trust** philosophy.

* **You hold the Keys:** You must provide your own Google Gemini API Key. It is stored **encrypted on your disk**. We never see it.
* **Direct Connection:** The app talks directly to Google (`generativelanguage.googleapis.com`). There is no middleman server.
* **Google Lens:** If you use the "Lens" feature, images are temporarily uploaded to **ImgBB** to create a public link. For sensitive data, use the standard Chat instead.

---

*By installing this software, you agree to the [Apache 2.0 License](https://github.com/a7mddra/spatialshot?tab=Apache-2.0-1-ov-file#readme).*
