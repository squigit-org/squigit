# Quick Start Guide

Welcome to Spatialshot! This guide will walk you through the essential features to get you started.

## First-Time Setup: Bring Your Own Key (BYOK)

Spatialshot uses a [**Bring Your Own Key (BYOK)**](../06-policies/BYOK.md) model. You provide your own API keys for Google Gemini and ImgBB, which means your data is sent directly to them, and you have full control over your usage and privacy.

1. Launch the Spatialshot application.
2. The application will detect that you haven't set it up yet. Click the **"Setup"** or **"Settings"** button.
3. For both Google Gemini (for AI analysis) and ImgBB (for image uploading for the Lens feature), follow this secure process:

    - Click the setup button for the provider (e.g., "Setup Google Key"). This opens the provider's website.
    - On their website, generate and **copy your API key** to the clipboard.
    - Spatialshot will automatically detect the key on your clipboard, save it securely, and confirm. You do **not** need to paste it anywhere.

➡️ **Get Keys:**

- **Google Gemini:** [Google AI Studio](https://aistudio.google.com/app/apikey)
- **ImgBB (for Lens feature):** [ImgBB API](https://api.imgbb.com/)

---

## How to Use Spatialshot

There are two primary ways to use the application.

### Method 1: Instant Capture (Circle-to-Search)

This is the fastest way to analyze anything on your screen.

1. Press the global hotkey for your operating system:
    - **Windows:** `Win + Shift + A`
    - **macOS:** `Cmd + Shift + A`
    - **Linux:** `Super + Shift + A`
2. Your screen will freeze, and an overlay will appear.
3. Click and drag to draw a shape around the content you want to capture and analyze.
4. Release the mouse button.
5. The Spatialshot application will immediately open with your captured screenshot, and the AI will begin analyzing it based on your default prompt.

### Method 2: Use the Main Application Window

You can also use Spatialshot like a traditional application to analyze image files from your computer.

1. Open Spatialshot from your application menu or desktop shortcut.
2. You will see a welcome screen. You can either:
    - **Drag and drop** an image file directly onto the window.
    - **Click the prompt** to open a file dialog and select an image.
3. Once the image is loaded, you can use the chat interface to ask questions or give it commands.

---

## Key Features

- **Chat Interface:** Interact with the Gemini model conversationally. Ask follow-up questions or refine your initial request.
- **Model Selector:** In the settings panel, you can switch between different Gemini models (e.g., Flash for speed, Pro for power) to best suit your needs.
- **Open in Lens:** Click the "Google Lens" icon in the chat interface. Spatialshot will upload your screenshot to ImgBB and open the image in Google Lens in your default browser for a powerful visual search.
