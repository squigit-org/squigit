# This script is run by the GitHub Actions runner
Write-Host "--- Compiling Windows Installer ---"
makensis "packaging/windows/installer.nsi"
Write-Host "--- Windows Installer Compiled ---"