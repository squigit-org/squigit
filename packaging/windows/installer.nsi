; installer.nsi - SpatialShot Online Installer Script
; This is the "recipe" for your .exe installer.

!define APP_NAME "SpatialShot"
!define ORCHESTRATOR_EXE "orchestrator.exe"
!define NIRCMD_URL "https://www.nirsoft.net/utils/nircmd-x64.zip"
!define NIRCMD_ZIP "nircmd-x64.zip"

; --- GitHub Artifact URLs (REPLACE THESE with your real release links) ---
!define CAPKIT_URL "https://github.com/a7mddra/spatialshot/releases/latest/download/capkit-windows-x64.zip"
!define ORCHESTRATOR_URL "https://github.com/a7mddra/spatialshot/releases/latest/download/spatialshot-orchestrator-windows-x64.exe.zip"
!define SPATIALSHOT_URL "https://github.com/a7mddra/spatialshot/releases/latest/download/spatialshot-windows-x64.zip"

; --- Basic Setup ---
Name "${APP_NAME}"
OutFile "SpatialShot_Installer.exe" ; This is the output file
InstallDir "$PROGRAMFILES\SpatialShot"
RequestExecutionLevel admin

; --- Modern UI 2 ---
!include "MUI2.nsh"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

; --- Installer Section ---
Section "Install"
  SetOutPath $INSTDIR
  ; --- 1. Create Directories (Your pseudo-code logic) ---
  CreateDirectory "$LOCALAPPDATA\Spatialshot"
  CreateDirectory "$LOCALAPPDATA\Spatialshot\app"
  CreateDirectory "$LOCALAPPDATA\Spatialshot\tmp"
  CreateDirectory "$LOCALAPPDATA\Spatialshot\capkit"
  CreateDirectory "$LOCALAPPDATA\Spatialshot\3rdparty"
  
  SetOutPath "$LOCALAPPDATA\Spatialshot\tmp"

  ; --- 2. Download Artifacts (The Online Part) ---
  DetailPrint "Downloading components..."
  NSISdl::download "${SPATIALSHOT_URL}" "spatialshot.zip"
  NSISdl::download "${CAPKIT_URL}" "capkit.zip"
  NSISdl::download "${ORCHESTRATOR_URL}" "orchestrator.zip"
  NSISdl::download "${NIRCMD_URL}" "${NIRCMD_ZIP}"

  ; --- 3. Unzip and Move Files ---
  DetailPrint "Installing files..."
  ; We use PowerShell's built-in 'Expand-Archive' to avoid bundling 'unzip.exe'
  ExecWait '"powershell" -WindowStyle Hidden -Command "Expand-Archive -Path ''$LOCALAPPDATA\Spatialshot\tmp\spatialshot.zip'' -DestinationPath ''$INSTDIR'' -Force"'
  ExecWait '"powershell" -WindowStyle Hidden -Command "Expand-Archive -Path ''$LOCALAPPDATA\Spatialshot\tmp\capkit.zip'' -DestinationPath ''$LOCALAPPDATA\Spatialshot\capkit'' -Force"'
  ExecWait '"powershell" -WindowStyle Hidden -Command "Expand-Archive -Path ''$LOCALAPPDATA\Spatialshot\tmp\${NIRCMD_ZIP}'' -DestinationPath ''$LOCALAPPDATA\Spatialshot\3rdparty'' -Force"'
  ExecWait '"powershell" -WindowStyle Hidden -Command "Expand-Archive -Path ''$LOCALAPPDATA\Spatialshot\tmp\orchestrator.zip'' -DestinationPath ''$LOCALAPPDATA\Spatialshot\app'' -Force"'
  
  ; Rename the orchestrator binary if needed (assuming it's 'spatialshot-orchestrator-windows-x64.exe' in the zip)
  Rename "$LOCALAPPDATA\Spatialshot\app\spatialshot-orchestrator-windows-x64.exe" "$LOCALAPPDATA\Spatialshot\app\${ORCHESTRATOR_EXE}"

  ; --- 4. Setup Launching Methods ---
  DetailPrint "Creating shortcuts..."
  
  ; Desktop Shortcut for the main app
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe"
  
  ; Add Orchestrator to RUN ON STARTUP (to register the hotkey)
  CreateDirectory "$STARTUP\SpatialShot"
  CreateShortcut "$STARTUP\SpatialShot\SpatialShot Hotkey.lnk" "$LOCALAPPDATA\Spatialshot\app\${ORCHESTRATOR_EXE}"

  ; --- 5. Write Uninstaller and Registry ---
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; --- 6. Cleanup ---
  DetailPrint "Cleaning up..."
  Delete "$LOCALAPPDATA\Spatialshot\tmp\spatialshot.zip"
  Delete "$LOCALAPPDATA\Spatialshot\tmp\capkit.zip"
  Delete "$LOCALAPPDATA\Spatialshot\tmp\orchestrator.zip"
  Delete "$LOCALAPPDATA\Spatialshot\tmp\${NIRCMD_ZIP}"
  RmDir "$LOCALAPPDATA\Spatialshot\tmp"

  ; --- 7. Warning ---
  MessageBox MB_OK|MB_ICONINFORMATION "Installation complete! SpatialShot is unsigned. You may need to bypass Windows Defender on first launch."
SectionEnd

; --- Uninstaller Section ---
Section "Uninstall"
  ; Remove files and directories
  RMDir /r "$INSTDIR"
  RMDir /r "$LOCALAPPDATA\Spatialshot"

  ; Remove shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$STARTUP\SpatialShot"

  ; Remove registry keys
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd