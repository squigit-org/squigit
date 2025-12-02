# SpatialShot Application Architecture

**SpatialShot** is the user-facing terminal of the utility. It is a "Circle to Search" clone designed for desktop environments. It serves as the bridge between the local screenshot captured by the kernel and the cloud-based AI models (Gemini) or OCR services (Google Lens).

## 1. High-Level Architecture: The "Shell + View" Model

SpatialShot does not use a standard Electron architecture (a single `BrowserWindow` loading a URL). Instead, it implements a **Shell + View** composite architecture to ensure maximum performance and security isolation.

| Component | Path | Technology | Role |
 | ----- | ----- | ----- | ----- |
| **The Shell** | `spatialshot/source/renderer` | HTML/Vanilla JS | The "frame" of the window. Handles traffic lights, window dragging, and the login state. Lightweight and instant-loading. |
| **The View** | `packages/core` | React 19 + Vite | The heavy "Brain". Loaded inside a `BrowserView` (a separate process). Contains the Chat Engine and Gemini Logic. |

````mermaid
graph TD
    %% Styles
    classDef container fill:#ffffff,stroke:#333,stroke-width:2px,color:black;
    classDef node fill:#ffffff,stroke:#666,stroke-width:1px,color:black;
    classDef bridge fill:#f9f9f9,stroke:#666,stroke-width:1px,stroke-dasharray: 5 5,color:black;

    subgraph SpatialShot [SpatialShot Application]
        direction TB

        %% Main Process Components
        Main([source/main.js<br/>Orchestrator]):::node
        IPC[IPC Handlers]:::node
        Auth[Local OAuth Server]:::node

        %% Shell Components
        Shell[renderer/index.html<br/>The Shell]:::node
        Preload{{source/preload.js<br/>Bridge}}:::bridge

        %% View Components
        React[packages/core<br/>The View]:::node
        Chat[Chat Engine]:::node
        SpaLoad{{source/spaload.js<br/>Bridge}}:::bridge

        %% External Services (Now Inside)
        Cloud((External Services<br/>Gemini & Lens)):::node

        %% Orchestration
        Main -->|Creates| Shell
        Main -->|Embeds| React
        
        %% Bridge Connections
        Shell -.-> Preload
        React -.-> SpaLoad
        
        Preload <==>|Window Controls| IPC
        SpaLoad <==>|System Logic| IPC
        
        %% Internal Logic
        React --- Chat
        IPC --- Auth

        %% Data Flow
        Chat -.->|Direct Stream| Cloud
        IPC -.->|Proxy Upload| Cloud
    end

    class SpatialShot container
````

## 2\. The Core (Frontend Intelligence)

The intelligence resides in `packages/core`. This is a pure React application bundled by Vite.

### The Chat Engine (`useChatEngine.ts`)

This hook manages the conversational state. It abstracts the complexity of streaming responses from Google Gemini.

1. **Initialization:** Accepts an `apiKey` and `startupImage`.

2. **Streaming:** Uses `startNewChatStream` to open a socket-like connection to Gemini.

3. **Fallback Logic:** If Gemini 2.5 Flash hits a `429` (Rate Limit) or `503` (Overloaded), the engine automatically downgrades to **Gemini Flash Lite** to ensure the user gets *some* answer.

### System Synchronization (`useSystemSync.ts`)

Since React is stateless regarding the file system, this hook binds React state to Electron's persistent JSON store.

* Listens for `ipc.onThemeChanged`.

* Syncs API Keys, User Profiles, and Prompts from disk on mount.

## 3\. The Backend (Electron Logic)

The `source/main.js` entry point orchestrates the application lifecycle. To maintain maintainability, logic is split into modular **IPC Handlers** in `source/ipc-handlers/`.

### 🔐 Security & BYOK (Bring Your Own Key)

SpatialShot operates on a zero-trust model regarding API keys.

1. **Clipboard Watcher (`ipc-handlers/byok.js`):**

      * When the user clicks "Setup", the app polls the clipboard.

      * It regex-matches for Google Keys (`AIzaS...`) or ImgBB keys (32-char hex).

    ***UX Benefit:** The user never has to paste sensitive keys; the app grabs them, encrypts them, and clears them from memory.

2. **Encryption (`utilities.js`):**

      * Keys are **never** stored in plain text.

      * We derive a key using **PBKDF2** (using the OS Home Directory as a stable salt component).

      * Data is encrypted using **AES-256-GCM**.

### 📸 Dynamic Window Sizing (`utilities.js`)

Unlike standard apps with fixed sizes, SpatialShot attempts to mimic a native OS overlay.

* **Logic:** `getDynamicDims` calculates the window size relative to the monitor's work area. It creates a window that feels proportional to the screen resolution (approx. 1/13th width ratio), centered perfectly.

## 4\. External Integrations

SpatialShot connects to two primary external services:

### 1\. Google Gemini (Intelligence)

* **Direct SDK:** Uses `@google/genai` directly in the renderer (Core).

* **Prompt Engineering:** Injects a system prompt (`prompt.yml`) that defines the persona as "Friendly, Informal, and Brief".

### 2\. Google Lens (OCR & Visual Search)

Since Google Lens has no public API, SpatialShot implements a clever "Bridge" technique in `ipc-handlers/lens.js`.

1. **Upload:** The local screenshot is uploaded to **ImgBB** (using the user's private key).

2. **Redirect:** The resulting public URL is encoded.

3. **Launch:** The app opens the default browser to `https://lens.google.com/uploadbyurl?url={IMG_URL}`.

## 5\. Authentication Flow

Authentication is handled locally to support Google Sign-In without a backend server.

1. **Local Server:** `auth/index.js` spins up a temporary HTTP server on `localhost:3000`.

2. **OAuth Flow:** Launches the system browser for Google OAuth.

3. **Callback:** The local server catches the callback, extracts the token, fetches the user profile, writes it to `profile.json`, and shuts down.
