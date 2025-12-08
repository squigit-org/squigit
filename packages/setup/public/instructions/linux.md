# 🐧 Spatialshot for Linux: Setup & Privacy

Welcome, Linux user! We know you usually have to fight your OS to get cool tools working. Not today.

* **Executable Permissions:** We already ran `chmod +x`.
* **Wayland Support:** Native. We use XDG Desktop Portals, so no black screens and no root access needed.
* **Dependencies:** None. It's a self-contained binary.

---

## 1. ⌨️ The Hotkey (Super + Shift + A)

The installer has attempted to automatically register the global hotkey for your specific Desktop Environment (Gnome, KDE, XFCE, or Cinnamon).

### **Try it now: Press `Super ❖` + `Shift ⇧` + `A`**

*Note: The "Super" key is usually the one with the Windows logo.*

### **"It didn't work!" (Manual Setup)**
Linux is diverse. If our script couldn't penetrate your specific window manager configuration (looking at you, KDE Plasma), simply add it manually:

1.  Open your **System Settings** -> **Keyboard Shortcuts**.
2.  Add a **Custom Shortcut**.
3.  **Name:** `Spatialshot`
4.  **Command:** Browse to where you installed the app (e.g., `~/Spatialshot/spatialshot`)
5.  **Binding:** Set it to `Super+Shift+A` (or whatever you prefer).

---

## 2. 🚀 How to Use

1.  **Trigger:** Press the hotkey.
2.  **Portal:** You will see your system's native "Screen Share" or "Screenshot" dialog. This is a security feature (Portals). Select the monitor or region you want to capture.
3.  **Chat:** The AI window appears instantly.

**Where is the icon?**
We have automatically created a `.desktop` file. You can find **Spatialshot** in your application launcher menu like any other app.

---

## 3. 🛡️ Privacy & BYOK (Bring Your Own Key)

Spatialshot follows a **Local-First, Zero-Trust** philosophy.

* **You hold the Keys:** You must provide your own Google Gemini API Key. It is stored **encrypted on your disk**. We never see it.
* **Direct Connection:** The app talks directly to Google (`generativelanguage.googleapis.com`). There is no middleman server.
* **Google Lens:** If you use the "Lens" feature, images are temporarily uploaded to **ImgBB** to create a public link. For sensitive data, use the standard Chat instead.

---

## 4. 🚑 Under the Hood (For the curious)



If you are wondering how we handle the hotkey without a daemon constantly polling your keyboard (which is bad for security), we register the shortcut directly with your Compositor (Mutter, KWin, Xfwm).

When you press the keys, **your OS** launches the app. The app takes the shot, sends it to the AI, and then closes. Zero background resource usage.

---

*By installing this software, you agree to the [Apache 2.0 License](https://github.com/a7mddra/spatialshot?tab=Apache-2.0-1-ov-file#readme).*
