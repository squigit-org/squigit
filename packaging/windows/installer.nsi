; installer.nsi - SpatialShot Windows Installer
; =============================================

!define APP_NAME "SpatialShot"
!define APP_EXE "SpatialShot.exe"
!define ORCHESTRATOR_EXE "orchestrator.exe"

; --- Artifact URLs ---
!define CAPKIT_URL "https://github.com/a7mddra/spatialshot/releases/latest/download/capkit-windows-x64.zip"
!define ORCHESTRATOR_URL "https://github.com/a7mddra/spatialshot/releases/latest/download/spatialshot-orchestrator-windows-x64.zip"
!define SPATIALSHOT_URL "https://github.com/a7mddra/spatialshot/releases/latest/download/spatialshot-win-portable.zip"

; --- Setup ---
Name "${APP_NAME}"
OutFile "SpatialShot_Installer.exe"
InstallDir "$LOCALAPPDATA\SpatialShot"
RequestExecutionLevel user ; Install for current user (No Admin/UAC prompts)

; --- UI Settings ---
!include "MUI2.nsh"
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

; --- Main Installation ---
Section "Install"
  SetOutPath $INSTDIR

  ; 1. Create Structure
  CreateDirectory "$INSTDIR\app"
  CreateDirectory "$INSTDIR\cache"
  CreateDirectory "$INSTDIR\capkit"
  
  SetOutPath "$INSTDIR\cache"

  ; 2. Download (Using PowerShell for best TLS/Redirect support)
  DetailPrint "Downloading SpatialShot Core..."
  ExecWait "powershell -NoProfile -Command $\"Invoke-WebRequest -Uri ${SPATIALSHOT_URL} -OutFile spatialshot.zip$\""
  
  DetailPrint "Downloading CapKit..."
  ExecWait "powershell -NoProfile -Command $\"Invoke-WebRequest -Uri ${CAPKIT_URL} -OutFile capkit.zip$\""
  
  DetailPrint "Downloading Orchestrator..."
  ExecWait "powershell -NoProfile -Command $\"Invoke-WebRequest -Uri ${ORCHESTRATOR_URL} -OutFile orchestrator.zip$\""

  ; 3. Unzip
  DetailPrint "Extracting components..."
  SetOutPath $INSTDIR
  ExecWait "powershell -NoProfile -Command $\"Expand-Archive -Path '$INSTDIR\cache\spatialshot.zip' -DestinationPath '$INSTDIR' -Force$\""
  
  SetOutPath "$INSTDIR\capkit"
  ExecWait "powershell -NoProfile -Command $\"Expand-Archive -Path '$INSTDIR\cache\capkit.zip' -DestinationPath '$INSTDIR\capkit' -Force$\""
  
  SetOutPath "$INSTDIR\app"
  ExecWait "powershell -NoProfile -Command $\"Expand-Archive -Path '$INSTDIR\cache\orchestrator.zip' -DestinationPath '$INSTDIR\app' -Force$\""

  ; Rename Orchestrator
  Rename "$INSTDIR\app\spatialshot-orchestrator-windows-x64.exe" "$INSTDIR\app\${ORCHESTRATOR_EXE}"

  ; 4. The "Sophisticated" Hotkey Listener (PowerShell)
  ;    Targets: Win (0x0008) + Shift (0x0004) + A (0x41)
  DetailPrint "Registering Global Hotkey (Win+Shift+A)..."
  FileOpen $0 "$INSTDIR\hotkey_listener.ps1" w
  FileWrite $0 'Add-Type -MemberDefinition "[DllImport(\"user32.dll\")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, int fsModifiers, int vk); [DllImport(\"user32.dll\")] public static extern bool GetMessage(out IntPtr lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);" -Name "Win32" -Namespace Win32$\r$\n'
  
  ; --- CONFIGURATION: WIN + SHIFT + A ---
  FileWrite $0 '$MOD_WIN = 0x0008; $MOD_SHIFT = 0x0004; $VK_A = 0x41$\r$\n'
  
  ; Register Hotkey
  FileWrite $0 '$Result = [Win32.Win32]::RegisterHotKey([IntPtr]::Zero, 1, $MOD_WIN -bor $MOD_SHIFT, $VK_A)$\r$\n'
  FileWrite $0 'if (!$Result) { Write-Host "Hotkey failed"; exit }$\r$\n'
  
  ; Infinite Loop (Waiting for keypress, consumes 0% CPU)
  FileWrite $0 '$msg = [IntPtr]::Zero$\r$\n'
  FileWrite $0 'while ([Win32.Win32]::GetMessage([ref]$msg, [IntPtr]::Zero, 0, 0)) {$\r$\n'
  FileWrite $0 '    Start-Process -FilePath "$INSTDIR\app\${ORCHESTRATOR_EXE}" -WindowStyle Hidden$\r$\n'
  FileWrite $0 '}$\r$\n'
  FileClose $0

  ; 5. VBS Wrapper (To hide the PowerShell window completely)
  FileOpen $0 "$INSTDIR\launch_hotkey.vbs" w
  FileWrite $0 'Set WshShell = CreateObject("WScript.Shell")$\r$\n'
  FileWrite $0 'WshShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""$INSTDIR\hotkey_listener.ps1""", 0$\r$\n'
  FileClose $0

  ; 6. Create Shortcuts
  DetailPrint "Creating shortcuts..."
  
  ; Desktop Icon
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe"
  
  ; Startup Item (Points to VBS -> Points to PowerShell)
  CreateShortcut "$SMSTARTUP\SpatialShot Hotkey.lnk" "$INSTDIR\launch_hotkey.vbs"

  ; 7. Uninstaller Setup
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" '"$INSTDIR\${APP_NAME}.exe"'

  ; 8. Cleanup Cache
  RmDir /r "$INSTDIR\cache"

  ; 9. Launch Listener Immediately (So user doesn't have to reboot)
  ExecShell "" "$INSTDIR\launch_hotkey.vbs"

SectionEnd

; --- Uninstaller ---
Section "Uninstall"
  ; Killing the listener via PowerShell is the cleanest way
  ExecWait 'powershell -Command "Stop-Process -Name powershell -Force -ErrorAction SilentlyContinue"'

  ; Remove Files
  RMDir /r "$INSTDIR"
  
  ; Remove Shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMSTARTUP\SpatialShot Hotkey.lnk"
  
  ; Remove Registry
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd
