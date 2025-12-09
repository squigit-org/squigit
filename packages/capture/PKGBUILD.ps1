#!/usr/bin/env pwsh

# -----------------------------------------------------------------------------
# Capture Windows Build Script
# -----------------------------------------------------------------------------

param(
    [switch]$CI = $false
)

$QtVersion = "6.6.0"
$QtVariant = "win64_msvc2019_64" 
$QtArch = "msvc2019_64"       
$QtBaseDir = "C:\Qt"
$QtPath = "$QtBaseDir\$QtVersion\$QtArch"

$SourceDir = "." 
$BuildDir = "build"
$DistDir = "dist"

function Write-Succ { param($msg) Write-Host "[OK] $msg"   -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Errr { param($msg) Write-Host "[ERR] $msg"  -ForegroundColor Red }

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    if (-not (Get-Command cl -ErrorAction SilentlyContinue)) {
        throw "MSVC Compiler (cl.exe) not found. Please run this script from 'x64 Native Tools Command Prompt'."
    }

    $prereqs = @(
        @{ Name = "CMake"; Command = "cmake"; Install = "winget install Kitware.CMake" },
        @{ Name = "Ninja"; Command = "ninja"; Install = "winget install Ninja-build.Ninja" },
        @{ Name = "Python"; Command = "python"; Install = "Install from python.org" }
    )
    
    foreach ($prereq in $prereqs) {
        if (Get-Command $prereq.Command -ErrorAction SilentlyContinue) {
            Write-Succ "$($prereq.Name) found"
        }
        else {
            if ($CI) {
                throw "$($prereq.Name) not found. Required for build."
            }
            else {
                Write-Errr "$($prereq.Name) not found. Install with: $($prereq.Install)"
                return $false
            }
        }
    }
    return $true
}

function Install-Qt {
    Write-Info "Checking Qt installation..."
    
    if (Test-Path $QtPath) {
        Write-Succ "Qt $QtVersion found at $QtPath"
        return $true
    }
    
    Write-Warn "Qt not found. Attempting auto-installation via aqtinstall..."
    
    try {
        Write-Info "Installing aqtinstall..."
        python -m pip install aqtinstall --upgrade --quiet
        
        Write-Info "Downloading Qt $QtVersion ($QtVariant) to $QtBaseDir..."
        python -m aqt install-qt windows desktop $QtVersion $QtVariant --outputdir $QtBaseDir --archives qtbase qttools icu
        
        if (Test-Path $QtPath) {
            Write-Succ "Qt installed successfully"
            return $true
        }
        else {
            throw "Qt installation completed but path not found: $QtPath"
        }
    }
    catch {
        throw "Qt installation failed: $_"
    }
}

function Invoke-Capture {
    Write-Info "--- Building Capture (Unified) ---"
    
    if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
    
    Write-Info "Configuring CMake (Ninja)..."
    
    $cmakeArgs = @(
        "-S", $SourceDir,
        "-B", $BuildDir,
        "-G", "Ninja",
        "-DCMAKE_BUILD_TYPE=Release",
        "-DCMAKE_PREFIX_PATH=$QtPath"
    )
    
    & cmake @cmakeArgs
    if ($LASTEXITCODE -ne 0) { throw "CMake configuration failed" }
    
    Write-Info "Compiling C++ Source..."
    & cmake --build $BuildDir --config Release
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }
    
    Write-Succ "Compilation complete"
}

function Publish-Distribution {
    Write-Info "--- Packaging Distribution ---"
    
    if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    
    $binName = "capture.exe"
    $builtExe = "$BuildDir/$binName"
    
    if (-not (Test-Path $builtExe)) { 
        $builtExe = "$BuildDir/Release/$binName" 
    }

    if (Test-Path $builtExe) {
        Copy-Item $builtExe $DistDir
        Write-Succ "Copied $binName"
        
        Write-Info "Running windeployqt to bundle DLLs..."
        
        $env:PATH = "$QtPath\bin;$env:PATH"
        
        Push-Location $DistDir
        & windeployqt $binName --release --compiler-runtime --no-translations --no-opengl-sw --no-system-d3d-compiler
        if ($LASTEXITCODE -ne 0) { throw "windeployqt failed" }
        Pop-Location

        Write-Info "Bundling Visual C++ Runtime DLLs (System32)..."
        $sys32 = [Environment]::GetFolderPath("System")
        $runtimeDlls = @("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll", "msvcp140_1.dll")
        
        foreach ($dll in $runtimeDlls) {
            $srcPath = Join-Path $sys32 $dll
            if (Test-Path $srcPath) {
                Copy-Item $srcPath $DistDir -Force
                Write-Succ "  Bundled $dll"
            }
            else {
                Write-Warn "  Could not find $dll in System32. User may need VC Redistributable."
            }
        }

    }
    else {
        throw "Could not find compiled executable at $builtExe"
    }
    
    Write-Succ "Distribution Ready at $DistDir"
    Get-ChildItem $DistDir *.exe | ForEach-Object { 
        Write-Host " -> $($_.Name) ($([math]::Round($_.Length/1KB)) KB)" -ForegroundColor Gray 
    }
}

try {
    if (-not (Test-Path "CMakeLists.txt")) {
        throw "Run this script from the packages/capture directory (where CMakeLists.txt is)."
    }
    
    if (-not (Test-Prerequisites)) { exit 1 }

    Install-Qt
    Invoke-Capture
    Publish-Distribution
    
    Write-Host "`n[SUCCESS] Capture Build Completed." -ForegroundColor Green
    
}
catch {
    Write-Errr $_.Exception.Message
    exit 1
}