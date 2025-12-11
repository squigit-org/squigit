# Architectural blueprint

## 1\. Windows Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: %LOCALAPPDATA%\Programs\Spatialshot\
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
    ├── spatialshot.exe         <-- [APP CORE] The UI Host
    ├── {DLLs & Locales}        <-- Electron Dependencies
    └── resources\
        └── app.asar            <-- [SOURCE] Bundled Source


[ UPDATE/SETUP STAGING ]
Path: %APPDATA%\Spatialshot\updates\
│
└── Spatialshot-Setup.exe       <-- [TAURI] The Updater/Bootstrapper


[ USER DATA DIRECTORY ]
Path: %APPDATA%\Spatialshot\
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
└── spatial_capture.png
````

-----

## 2\. macOS Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: /Applications/Spatialshot.app
(Read Only / Signed Bundle / Hybrid Structure)
│
└── Contents/
    ├── Info.plist              <-- Points to 'Spatialshot' (The Core)
    ├── Frameworks/             <-- Chromium Dylibs
    │
    ├── MacOS/
    │   ├── Spatialshot         <-- [APP CORE] Main Binary
    │   └── daemon              <-- [BACKGROUND SERVICE] Injected Rust Binary
    │
    └── Resources/
        ├── Capture/            <-- [CONTAINER] Injected Qt6 Mach-O
        │   └── capture
        └── app.asar


[ UPDATE/SETUP STAGING ]
Path: ~/Library/Application Support/Spatialshot/updates/
│
└── Spatialshot-Setup.dmg       <-- [TAURI] The Updater (Mounts & Copies)


[ LAUNCH AGENT ]
Path: ~/Library/LaunchAgents/com.spatialshot.daemon.plist
(Triggers ../Contents/MacOS/daemon at Login)


[ USER DATA DIRECTORY ]
Path: ~/Library/Application Support/Spatialshot/
(Read + Write / Sandboxed Safe)
│
├── preferences.json
├── gemini_key.json
├── imgbb_key.json
├── profile.json
└── session.json
```

-----

## 3\. Linux Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: $HOME/.local/share/spatialshot/
(Read Only / XDG Compliant)
│
├── daemon                      <-- [ORCHESTRATOR] Rust Binary
│
├── capture/                    <-- [CONTAINER] Qt6 ELF
│   ├── capture
│   └── {Qt Libs}
│
└── app/                        <-- [CONTAINER] Electron Dist
    ├── spatialshot             <-- [APP CORE] Main Binary
    ├── libffmpeg.so
    └── resources/
        └── app.asar


[ UPDATE/SETUP STAGING ]
Path: $HOME/.config/spatialshot/updates/
│
└── Spatialshot-Setup           <-- [TAURI] The Updater Binary


[ DESKTOP ENTRY ]
Path: $HOME/.local/share/applications/spatialshot.desktop
(Points to .../app/spatialshot)


[ USER DATA DIRECTORY ]
Path: $HOME/.config/spatialshot/
(Read + Write)
│
├── preferences.json
├── gemini_key.json
├── imgbb_key.json
├── profile.json
└── session.json
```
