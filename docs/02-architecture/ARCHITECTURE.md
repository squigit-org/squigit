# Spatialshot Architecture

Spatialshot is built on a **modular, polyglot architecture**. Its core principle is **separation of concerns**: independent components communicate through simple interfaces (files & IPC), allowing deep specialization without system-wide expertise.

## Primary Flow: Global Hotkey Capture

This is the main "Circle to Search" flow, triggered by `Super/Cmd/Win + Shift + A`.

```ascii
┌─────────────┐     ┌───────────────────┐     ┌────────────────────┐
│   User      │     │ Rust Orchestrator │     │     CaptureKit     │
│  Presses    │────▶│  (Main Kernel)    │────▶│  (C++/Qt6 Engine)  │
│   Hotkey    │     │                   │     │                    │
└─────────────┘     └───────────────────┘     └──────────┬─────────┘
         │               │                               │
         │               ├───────Creates Lock───────────▶│
         │               │                               │
         │               │        ┌──────────────┐       │
         │               │        │     tmp/     │       │
         │               │        │ 1.png, 2.png │◀──────┼──Captures All Screens
         │               │        └──────────────┘       │   (scgrabber/nircmd)
         │               │               │               │
         │               │               │               │
         │               │Detects Files◀─┘               │
         │               │               │               │
         │               │               └───────┐       │
         │               │                       ▼       │
         │               │          Launches `drawview`──┘
         │               │               │               │
         │               │               ▼               │
         │               │       ┌──────────────────┐    │
         │               │       │ Desktop Frozen,  │    │
         │               │       │ User Draws Area  │    │
         │               │       └────────┬─────────┘    │
         │               │                │              │
         │               │                │Saves Crop    │
         │               │                ▼              │
         │               │        ┌──────────────┐       │
         │               │        │     tmp/     │       │
         │      Detects  │        │    o1.png    │       │
         │      File ◀───┼────────┼──────────────┘       │
         │               │        │                      │
         │               │        │                      │
         └───────────────┼────────┼──────────────────────┘
                         ▼        ▼
               ┌─────────────────────────────────┐     ┌──────────────────┐
               │      Spatialshot (Electron)     │────▶│   Core (React)   │
               │                                 │     │                  │
               │  Launches with `/tmp/o1.png`    │     │ Image converted  │
               │       as startup argument       │     │  to Base64, AI   │
               │                                 │     │ analysis begins. │
               └─────────────────────────────────┘     └──────────────────┘
```

## Direct Application Launch

When the user opens Spatialshot directly to analyze an existing image file.

```ascii
┌─────────────┐     ┌─────────────────────────────────┐     ┌────────────────────┐
│    User     │     │      Spatialshot (Electron)     │     │   Core (React)     │
│  Opens App  │────▶│                                 │────▶│                    │
│  or Drags   │     │  Shows upload screen. User      │     │ Image converted    │
│   Image     │     │  provides image via drag-drop   │     │ to Base64, ready   │
│             │     │  or file dialog.                │     │ for chat.          │
└─────────────┘     └─────────────────────────────────┘     └────────────────────┘
```

---

## Data & Configuration Flow

How the application manages state, credentials, and external services.

### Local State & User Data

```ascii
           ┌──────────────────────────────────────────────────────┐
           │         User's Local Application Directory           │
           │      (~/.local/share/spatialshot or equivalent)      │
           ├──────────────────────────────────────────────────────┤
 App       │ ► session.json    - Tracks current image for re-use. │
 Startup───│ ► profile.json    - User info from Google OAuth.     │
           │ ► gemini_key.json - Encrypted (AES-256) API key.     │
           │ ► imgbb_key.json  - Encrypted (AES-256) API key.     │
           └──────────────────────────────────────────────────────┘
```

### External Service Integration

```ascii
┌─────────────┐    Uploads Image     ┌─────────────┐     Injects URL    ┌───────────────────┐
│             │─────────────────────▶│    ImgBB    │───────────────────▶│  lens.google.com  │
│ Spatialshot │                      │    (API)    │                    │  (User's Browser) │
│     App     │                      └─────────────┘                    └───────────────────┘
│             │
│             │    Sends Prompt +    ┌──────────────┐
│             │    Image Context     │ Google GenAI │
└─────────────┘─────────────────────▶│   (Gemini)   │
                                     └──────────────┘
```
