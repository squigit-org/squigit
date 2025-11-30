; installer.nsi - SpatialShot Windows Installer
; =============================================

!define APP_NAME "SpatialShot"
!define APP_EXE "SpatialShot.exe"
!define ORCHESTRATOR_EXE "orchestrator.exe"

; --- Artifact URLs ---
!define RELEASES_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/"
!define EXEC_SUFFIX="-windows-x64.zip"
CAPKIT_URL="$RELEASES_URL"+"capkit"+"$EXEC_SUFFIX"
ORCHESTRATOR_URL="$RELEASES_URL"+"orchestrator"+"$EXEC_SUFFIX"
SPATIALSHOT_URL="$RELEASES_URL"+"spatialshot"+"$EXEC_SUFFIX"

; --- Setup ---
Name "${APP_NAME}"
OutFile "SpatialShot_Installer.exe"
InstallDir "$LOCALAPPDATA\SpatialShot"
RequestExecutionLevel user

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

  CreateDirectory "$INSTDIR\app"
  CreateDirectory "$INSTDIR\cache"
  CreateDirectory "$INSTDIR\capkit"
  
  SetOutPath "$INSTDIR\cache"

  DetailPrint "Downloading SpatialShot Core..."
  ExecWait "powershell -NoProfile -Command $\"Invoke-WebRequest -Uri ${SPATIALSHOT_URL} -OutFile spatialshot.zip$\""
  
  DetailPrint "Downloading CapKit..."
  ExecWait "powershell -NoProfile -Command $\"Invoke-WebRequest -Uri ${CAPKIT_URL} -OutFile capkit.zip$\""
  
  DetailPrint "Downloading Orchestrator..."
  ExecWait "powershell -NoProfile -Command $\"Invoke-WebRequest -Uri ${ORCHESTRATOR_URL} -OutFile orchestrator.zip$\""

  DetailPrint "Extracting components..."
  SetOutPath $INSTDIR
  ExecWait "powershell -NoProfile -Command $\"Expand-Archive -Path '$INSTDIR\cache\spatialshot.zip' -DestinationPath '$INSTDIR' -Force$\""
  
  SetOutPath "$INSTDIR\capkit"
  ExecWait "powershell -NoProfile -Command $\"Expand-Archive -Path '$INSTDIR\cache\capkit.zip' -DestinationPath '$INSTDIR\capkit' -Force$\""
  
  SetOutPath "$INSTDIR\app"
  ExecWait "powershell -NoProfile -Command $\"Expand-Archive -Path '$INSTDIR\cache\orchestrator.zip' -DestinationPath '$INSTDIR\app' -Force$\""

  Rename "$INSTDIR\app\spatialshot-orchestrator.exe" "$INSTDIR\app\${ORCHESTRATOR_EXE}"

  DetailPrint "Registering Global Hotkey (Win+Shift+A)..."
  FileOpen $0 "$INSTDIR\hotkey_listener.ps1" w
  FileWrite $0 'Add-Type -MemberDefinition "[DllImport(\"user32.dll\")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, int fsModifiers, int vk); [DllImport(\"user32.dll\")] public static extern bool GetMessage(out IntPtr lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);" -Name "Win32" -Namespace Win32$\r$\n'
  
  FileWrite $0 '$MOD_WIN = 0x0008; $MOD_SHIFT = 0x0004; $VK_A = 0x41$\r$\n'
  
  FileWrite $0 '$Result = [Win32.Win32]::RegisterHotKey([IntPtr]::Zero, 1, $MOD_WIN -bor $MOD_SHIFT, $VK_A)$\r$\n'
  FileWrite $0 'if (!$Result) { Write-Host "Hotkey failed"; exit }$\r$\n'
  
  FileWrite $0 '$msg = [IntPtr]::Zero$\r$\n'
  FileWrite $0 'while ([Win32.Win32]::GetMessage([ref]$msg, [IntPtr]::Zero, 0, 0)) {$\r$\n'
  FileWrite $0 '    Start-Process -FilePath "$INSTDIR\app\${ORCHESTRATOR_EXE}" -WindowStyle Hidden$\r$\n'
  FileWrite $0 '}$\r$\n'
  FileClose $0

  FileOpen $0 "$INSTDIR\launch_hotkey.vbs" w
  FileWrite $0 'Set WshShell = CreateObject("WScript.Shell")$\r$\n'
  FileWrite $0 'WshShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""$INSTDIR\hotkey_listener.ps1""", 0$\r$\n'
  FileClose $0

  DetailPrint "Creating shortcuts..."
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe"
  CreateShortcut "$SMSTARTUP\SpatialShot Hotkey.lnk" "$INSTDIR\launch_hotkey.vbs"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" '"$INSTDIR\${APP_NAME}.exe"'

  RmDir /r "$INSTDIR\cache"

  ExecShell "" "$INSTDIR\launch_hotkey.vbs"

SectionEnd

; --- Uninstaller ---
Section "Uninstall"
  ExecWait 'powershell -Command "Stop-Process -Name powershell -Force -ErrorAction SilentlyContinue"'
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMSTARTUP\SpatialShot Hotkey.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd