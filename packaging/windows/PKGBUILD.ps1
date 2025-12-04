# This script is run by the GitHub Actions runner

Write-Host "--- Building Windows Installer ---"

if (-not (Get-Command makensis -ErrorAction SilentlyContinue)) {
    Write-Host "Installing NSIS..."
    choco install nsis -y
    $env:Path += ";C:\Program Files (x86)\NSIS"
}

Set-Location -Path "packaging/windows"

if (-not (Test-Path "installer.nsi")) {
    Write-Error "Error: installer.nsi not found in packaging/windows!"
    exit 1
}

Write-Host "Running makensis..."
makensis installer.nsi

if (Test-Path "Spatialshot_Installer.exe") {
    Write-Host "--- Windows Installer Built Successfully ---"
} else {
    Write-Error "Error: Spatialshot_Installer.exe was not created."
    exit 1
}
