# Squigit Architecture Overview

Squigit is designed as a highly decoupled, cross-platform application that spans across multiple environments: a graphical user interface (GUI) available in both **Tauri** and **Electron**, and a headless **Command Line Interface (CLI)**.

To achieve feature parity across all environments without duplicating complex logic, Squigit utilizes a **Clean Architecture** (specifically inspired by Hexagonal Architecture/Ports and Adapters). It separates concerns into three distinct layers:

1. **The UI & Abstract Domain Layer** (TypeScript/React)
2. **The Universal Native Backend** (Rust `ops-*` crates)
3. **The Shell Integration Layer** (Tauri, Electron, CLI)

This document breaks down the stack from top to bottom, highlighting the abstractions that make this multi-target deployment possible.

---

## 1. The UI & Abstract Domain Layer

The uppermost layer represents the frontend codebase. Its primary responsibility is rendering the user interface and handling React state, remaining entirely oblivious to whether it runs in Tauri, Electron, or a web browser.

### `apps/renderer` (The View)
Written in React, TypeScript, and TailwindCSS. This is the pure UI layer. It contains components, animations, and CSS. Because it contains zero native OS calls (like file reading or window management), it can be securely sandboxed and injected into any shell.

### `apps/shared/packages/core` (The Domain & Ports)
This is the platform-agnostic business logic. It handles complex AI conversational state, streaming mechanisms, and prompt generation. Because it is sandboxed TypeScript, it relies on the **"Ports" pattern**:
- Inside `src/ports/`, it defines abstract interfaces (`ProviderPort`, `StoragePort`, `SystemPort`). 
- When the React `renderer` boots up (`initCorePorts.ts`), it resolves an environment-specific alias (`@platform`) driven by Vite (`VITE_PLATFORM`).
- The renderer then maps these abstract ports to concrete Inter-Process Communication (IPC) calls. This is what allows the React app to command the host system to "save a file" or "open a window" without knowing if the host is Tauri or Electron.

---

## 2. The Universal Backend (The Rust Engine)

To guarantee that the CLI, Electron, and Tauri shells all behave identically (and performably), all heavy lifting is pushed into a shared Rust backend. 

### `crates/ops-*` (Business Logic & Core Operations)
Instead of rewriting backend logic in Node.js for Electron/CLI and Rust for Tauri, Squigit shifts all fundamental application logic into a suite of Rust crates:
- **`squigit-brain`**: The Gemini integration and interaction logic.
- **`squigit-memory`**: Database management and file storage operations.
- **`squigit-auth`**: Authentication and profile configurations.
- **`squigit-ocr` & `squigit-stt`**: Media processing capabilities.

### `crates/desktop-runtime` (The Shared GUI Runtime)
While the CLI focuses on headless data processing, Tauri and Electron share "GUI-adjacent" needs—like preparing an image before sending it to the frontend or computing local storage directories. `desktop-runtime` encapsulates this hybrid logic in Rust so it only has to be written once, serving both GUI shells.

---

## 3. The Bridge & IPC Layer

Because the Universal Backend is written in Rust, the different shells need ways to invoke these operations.

### For Tauri (Native Binding)
Since Tauri is fundamentally a Rust framework, its backend resides in the same memory space as the `ops-*` crates. It uses Tauri's `#[tauri::command]` macros to expose the operations directly to the React frontend.

### For Electron & CLI (NAPI-RS Bridge)
Since Electron's main process and the CLI run in a Node.js V8 environment, they cannot call Rust code directly. Squigit solves this via **`crates/napi-bridge`**.
- This crate compiles the Rust backend into a native Node.js Addon (`addon/index.node`).
- When the CLI or Electron requires backend functionality, they import this native bridge, accessing high-performance Rust execution with the convenience of asynchronous JavaScript functions.

---

## 4. The Shell Integration Layer (The Un-Sharable Native Code)

Despite the aggressive sharing of UI components and Rust backend logic, a desktop application must integrate intimately with its host operating system (Windows, macOS, Linux). Squigit recognizes that certain features *cannot* be abstracted without introducing instability or severe UX compromises.

### The Shell Implementations
- **`apps/tauri`**: Uses Tauri's Rust-based windowing libraries (`tao`/`wry`).
- **`apps/electron`**: Uses Electron's C++ backed Node APIs.

Features like **System Tray Icons**, **Global Keyboard Shortcuts**, **Window Transparency**, and **Lifecycle Events** are explicitly duplicated and implemented natively in each respective shell folder. Attempting to manage an Electron Tray Icon via a Rust NAPI bridge is an anti-pattern. By intentionally allowing this thin layer of duplication, Squigit leverages the native strengths of both frameworks.

### The CLI (`apps/cli`)
The CLI entirely bypasses the GUI, the `renderer`, and the `ports` architecture. It is a headless TypeScript application that directly imports the `napi-bridge` to perform operations like `analyzeImage` or `promptChat` straight from the terminal. 

---

## Summary of Data Flow

1. **GUI User Action:** A user clicks a button in `apps/renderer`.
2. **Abstract Port Invocation:** The renderer triggers an action in `apps/shared/packages/core`.
3. **IPC Bridge:** The core invokes a platform port, which Vite maps to either Electron's `ipcRenderer` or Tauri's `@tauri-apps/api`.
4. **Backend Execution:** 
    - If Tauri: The Rust backend handles it natively.
    - If Electron: `apps/electron/src/ipc.ts` catches the IPC event and forwards it through the `napi-bridge` down to the Rust engine.
5. **Result:** The `ops-*` crate performs the native action and bubbles the result back up the chain.

*(In the CLI, the process skips steps 1-3, executing step 4 directly via terminal arguments).*
