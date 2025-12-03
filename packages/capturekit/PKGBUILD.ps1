#!/usr/bin/env pwsh

param(
    [switch]$CI = $false
)

$QtVersion = "6.6.0"
$QtVariant = "win64_msvc2019_64"
$QtArch    = "msvc2019_64"
$QtBaseDir = "C:\Qt"
$QtPath    = "$QtBaseDir\$QtVersion\$QtArch"

$SourceDir = "src"
$BuildDir  = "build"
$DistDir   = "dist"

function Write-Succ { param($msg) Write-Host "✓ $msg"  -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "! $msg"  -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "ⓘ $msg" -ForegroundColor Cyan }
function Write-Errr { param($msg) Write-Host "⟳ $msg" -ForegroundColor Red }

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    if (-not (Get-Command cl -ErrorAction SilentlyContinue)) {
        throw "MSVC Compiler (cl.exe) not found. Please run this script from 'x64 Native Tools Command Prompt' or ensure Visual Studio environment is loaded."
    }

    $prereqs = @(
        @{ Name = "CMake";  Command = "cmake";  Install = "winget install Kitware.CMake" },
        @{ Name = "Ninja";  Command = "ninja";  Install = "winget install Ninja-build.Ninja" },
        @{ Name = "Python"; Command = "python"; Install = "Install from python.org" }
    )
    
    foreach ($prereq in $prereqs) {
        if (Get-Command $prereq.Command -ErrorAction SilentlyContinue) {
            Write-Succ "$($prereq.Name) found"
        } else {
            if ($CI) {
                throw "$($prereq.Name) not found. Required for build."
            } else {
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
    
    Write-Warn "Qt not found. Installing via aqt..."
    
    try {
        python -m pip install aqtinstall --quiet
        Write-Succ "aqtinstall check passed"
        
        Write-Info "Downloading Qt $QtVersion ($QtVariant)..."

        python -m aqt install-qt windows desktop $QtVersion $QtVariant --outputdir $QtBaseDir
        
        if (Test-Path $QtPath) {
            Write-Succ "Qt installed successfully"
            return $true
        } else {
            throw "Qt installation failed - path not found: $QtPath"
        }
    } catch {
        throw "Qt installation failed: $_"
    }
}

function Build-DrawView-Qt {
    Write-Info "--- Building DrawView ---"
    
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
    
    Write-Info "Compiling DrawView..."
    & cmake --build $BuildDir --config Release --target drawview
    if ($LASTEXITCODE -ne 0) { throw "DrawView build failed" }
    
    Write-Succ "DrawView compiled"
}

function Build-SCGrabber-Native {
    Write-Info "--- Building SCGrabber ---"
    
    
    $GrabberSrc = "$SourceDir/sc-grabber/win32.cpp"
    if (-not (Test-Path $GrabberSrc)) {
        if (Test-Path "$SourceDir/win32.cpp") { $GrabberSrc = "$SourceDir/win32.cpp" }
        else { throw "Could not find scgrabber win32.cpp" }
    }

    $OutExe = "$BuildDir/scgrabber.exe"

    Write-Info "Compiling $GrabberSrc with /MT (Static Link)..."
    
    
    
    & cl.exe /nologo /EHsc /O2 /std:c++17 /MT $GrabberSrc `
             /link /SUBSYSTEM:WINDOWS /OUT:$OutExe `
             user32.lib gdi32.lib gdiplus.lib shell32.lib ole32.lib shlwapi.lib

    if ($LASTEXITCODE -ne 0) { throw "SCGrabber compilation failed" }
    
    if (Test-Path $OutExe) {
        Write-Succ "SCGrabber compiled ($OutExe)"
    } else {
        throw "SCGrabber binary not created"
    }
}

function Create-Distribution {
    Write-Info "--- Packaging Distribution ---"
    
    if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    
    $grabberExe = "$BuildDir/scgrabber.exe"
    if (Test-Path $grabberExe) {
        Copy-Item $grabberExe $DistDir
        Write-Succ "Copied scgrabber.exe (Standalone)"
    } else {
        throw "Missing scgrabber.exe"
    }

    $drawviewExe = "$BuildDir/drawview.exe"
    if (-not (Test-Path $drawviewExe)) { $drawviewExe = "$BuildDir/Release/drawview.exe" } 
    
    if (Test-Path $drawviewExe) {
        Copy-Item $drawviewExe $DistDir
        Write-Succ "Copied drawview.exe"
        
        Write-Info "Running windeployqt for DrawView..."
        $env:PATH = "$QtPath\bin;$env:PATH"
        
        Push-Location $DistDir
        & windeployqt drawview.exe --release --compiler-runtime --no-translations --no-opengl-sw
        if ($LASTEXITCODE -ne 0) { throw "windeployqt failed" }
        Pop-Location
    } else {
        throw "Missing drawview.exe"
    }
    
    Write-Succ "Distribution Ready at $DistDir"
    Get-ChildItem $DistDir *.exe | ForEach-Object { 
        Write-Host " -> $($_.Name) ($([math]::Round($_.Length/1KB)) KB)" -ForegroundColor Gray 
    }
}

try {
    if (-not (Test-Path "src")) {
        throw "Run this script from packages/capturekit directory."
    }
    
    if (-not (Test-Prerequisites)) { exit 1 }
    
    Install-Qt
    
    New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
    
    Build-DrawView-Qt
    Build-SCGrabber-Native
    
    Create-Distribution
    
    Write-Host "`n[SUCCESS] Windows Build Completed." -ForegroundColor Green
    
} catch {
    Write-Errr $_.Exception.Message
    exit 1
}