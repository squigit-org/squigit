# Architectural blueprint

## 1\. Windows Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: %LOCALAPPDATA%\Programs\Spatialshot\
(Read Only / Wiped by Updater)
│
├── daemon.exe                  <-- [ENTRY POINT] Rust Orchestrator
├── unins000.exe                <-- Uninstaller
│
├── Capture\                    <-- Qt Folder
│   ├── capture.exe
│   └── {Qt DLLs & Plugins}
│
└── App\                        <-- Electron Folder
    ├── spatialshot.exe
    └── {Electron dependencies}


[ USER DATA DIRECTORY ]
Path: %APPDATA%\Spatialshot\
(Read + Write / Persists forever)
│
├── preferences.json            <-- Theme, Sys prompt
├── gemini_key.json             <-- Encrypted API Key
├── imgbb_key.json              <-- Encrypted API Key
├── profile.json                <-- Login flag
└── session.json                <-- Last state


[ TEMP DIRECTORY ]
Path: %TEMP%\
│
└── spatial_capture.png         <-- Transient screenshot
```

-----

## 2\. macOS Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: /Applications/Spatialshot.app
(Read Only / Signed Bundle)
│
└── Contents/
    ├── Info.plist
    ├── MacOS/
    │   └── daemon              <-- [ENTRY POINT] Rust Orchestrator
    │
    └── Resources/              <-- Assets & Sub-processes
        ├── Capture/
        │   └── {Qt Dist + mach-O}
        │
        └── App/
            └── {Electron Dist + mach-O}


[ USER DATA DIRECTORY ]
Path: ~/Library/Application Support/Spatialshot/
(Read + Write / Sandboxed Safe)
│
├── preferences.json
├── gemini_key.json
├── imgbb_key.json
├── profile.json
└── session.json


[ TEMP DIRECTORY ]
Path: /var/folders/.../T/ (Managed by OS)
│
└── spatial_capture.png
```

-----

## 3\. Linux Blueprint

```text
[ INSTALLATION DIRECTORY ]
Path: $HOME/.local/share/spatialshot/
(Read Only / Managed by Package Manager or Script)
│
├── daemon                      <-- [ENTRY POINT] Rust Orchestrator
│
├── capture/                    <-- Qt Folder
│   └── {Qt Dist + ELF}
│
└── app/                        <-- Electron Folder
    └── {Electron Dist + ELF}


[ USER DATA DIRECTORY ]
Path: $HOME/.config/spatialshot/
(Read + Write / Standard Config Location)
│
├── preferences.json
├── gemini_key.json
├── imgbb_key.json
├── profile.json
└── session.json


[ TEMP DIRECTORY ]
Path: /tmp/
│
└── spatial_capture.png
```
