# Architectural blueprint

## 1\. Windows Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: %LOCALAPPDATA%\Programs\SnapLLM\
(Read Only / User Scope)
│
├── daemon.exe                  <-- [BACKGROUND SERVICE] Rust Orchestrator
├── unins000.exe                <-- Uninstaller
│
├── Capture\                    <-- [CONTAINER] Qt6 Native Tool
│   ├── capture.exe
│   └── {Qt DLLs}
│
└── App\                        <-- [CONTAINER] Electron Dist
    ├── snapllm.exe         <-- [APP CORE] The UI Host
    ├── {DLLs & Locales}        <-- Electron Dependencies
    └── resources\
        └── app.asar            <-- [SOURCE] Bundled Source


[ UPDATE/SETUP STAGING ]
Path: %APPDATA%\SnapLLM\updates\
│
└── SnapLLM-Setup.exe       <-- [TAURI] The Updater/Bootstrapper


[ USER DATA DIRECTORY ]
Path: %APPDATA%\SnapLLM\
(Read + Write / Persists forever)
│
├── preferences.json
├── gemini_key.json
├── imgbb_key.json
├── profile.json
└── session.json


[ TEMP DIRECTORY ]
Path: %TEMP%\
│
└── snapllm_capture.png
```

---

## 2\. macOS Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: /Applications/SnapLLM.app
(Read Only / Signed Bundle / Hybrid Structure)
│
└── Contents/
    ├── Info.plist              <-- Points to 'SnapLLM' (The Core)
    ├── Frameworks/             <-- Chromium Dylibs
    │
    ├── MacOS/
    │   ├── SnapLLM         <-- [APP CORE] Main Binary
    │   └── daemon              <-- [BACKGROUND SERVICE] Injected Rust Binary
    │
    └── Resources/
        ├── Capture/            <-- [CONTAINER] Injected Qt6 Mach-O
        │   └── capture
        └── app.asar


[ UPDATE/SETUP STAGING ]
Path: ~/Library/Application Support/SnapLLM/updates/
│
└── SnapLLM-Setup.dmg       <-- [TAURI] The Updater (Mounts & Copies)


[ LAUNCH AGENT ]
Path: ~/Library/LaunchAgents/com.snapllm.daemon.plist
(Triggers ../Contents/MacOS/daemon at Login)


[ USER DATA DIRECTORY ]
Path: ~/Library/Application Support/SnapLLM/
(Read + Write / Sandboxed Safe)
│
├── preferences.json
├── gemini_key.json
├── imgbb_key.json
├── profile.json
└── session.json
```

---

## 3\. Linux Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: $HOME/.local/share/snapllm/
(Read Only / XDG Compliant)
│
├── daemon                      <-- [ORCHESTRATOR] Rust Binary
│
├── capture/                    <-- [CONTAINER] Qt6 ELF
│   ├── capture
│   └── {Qt Libs}
│
└── app/                        <-- [CONTAINER] Electron Dist
    ├── snapllm             <-- [APP CORE] Main Binary
    ├── libffmpeg.so
    └── resources/
        └── app.asar


[ UPDATE/SETUP STAGING ]
Path: $HOME/.config/snapllm/updates/
│
└── SnapLLM-Setup           <-- [TAURI] The Updater Binary


[ DESKTOP ENTRY ]
Path: $HOME/.local/share/applications/snapllm.desktop
(Points to .../app/snapllm)


[ USER DATA DIRECTORY ]
Path: $HOME/.config/snapllm/
(Read + Write)
│
├── preferences.json
├── gemini_key.json
├── imgbb_key.json
├── profile.json
└── session.json
```
