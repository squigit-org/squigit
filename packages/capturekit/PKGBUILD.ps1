#!/usr/bin/env pwsh

param(
    [switch]$CI = $false
)

$QtVersion = "6.6.0"
$QtVariant = "win64_msvc2019_64"
$QtPath = "C:\Qt\$QtVersion\$QtVariant"
$SourceDir = "src"
$BuildDir = "build"
$DistDir = "dist"

function Write-Succ { param($msg) Write-Host "✓ $msg"  -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "! $msg"  -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "ⓘ $msg" -ForegroundColor Cyan }
function Write-Errr { param($msg) Write-Host "⟳ $msg" -ForegroundColor Red }

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    $prereqs = @(
        @{ Name = "CMake"; Command = "cmake"; Install = "winget install Kitware.CMake" },
        @{ Name = "Ninja"; Command = "ninja"; Install = "winget install Ninja-build.Ninja" },
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

        pip install aqtinstall --quiet
        Write-Succ "aqtinstall installed"
        

        Write-Info "Downloading Qt $QtVersion ($QtVariant)..."
        aqt install-qt windows desktop $QtVersion $QtVariant --outputdir C:\Qt
        
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

function Build-Project {
    Write-Info "Building project..."
    
    if (Test-Path $BuildDir) {
        Remove-Item $BuildDir -Recurse -Force
    }
    if (Test-Path $DistDir) {
        Remove-Item $DistDir -Recurse -Force
    }
    
    Write-Info "Configuring with CMake..."
    $cmakeArgs = @(
        "-S", $SourceDir
        "-B", $BuildDir
        "-G", "Ninja"
        "-DCMAKE_BUILD_TYPE=Release"
        "-DCMAKE_PREFIX_PATH=$QtPath"
    )
    
    & cmake @cmakeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "CMake configuration failed"
    }
    
    Write-Info "Building with Ninja..."
    & cmake --build $BuildDir --config Release
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed"
    }
    
    Write-Succ "Build successful"
    return $true
}

function Create-Distribution {
    Write-Info "Creating distribution..."
    
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    
    $exePath = "$BuildDir\Release\drawview.exe"
    if (-not (Test-Path $exePath)) {
        $exePath = "$BuildDir\drawview.exe"
    }
    
    if (Test-Path $exePath) {
        Copy-Item $exePath $DistDir
        Write-Succ "Copied drawview.exe"
    } else {
        throw "drawview.exe not found at any expected location"
    }
    
    Write-Info "Running windeployqt..."
    $env:PATH = "$QtPath\bin;$env:PATH"
    
    Push-Location $DistDir
    & windeployqt drawview.exe --release --compiler-runtime
    if ($LASTEXITCODE -ne 0) {
        throw "windeployqt failed"
    }
    Pop-Location
    
    Write-Succ "Distribution created"
    
    Write-Info "Final distribution contents:"
    Get-ChildItem $DistDir -Recurse | ForEach-Object {
        Write-Host "  $($_.FullName)" -ForegroundColor Gray
    }
    
    return $true
}

try {
    if (-not (Test-Path $SourceDir)) {
        throw "Run this script from packages/capturekit directory. Current: $(Get-Location)"
    }
    
    if (-not (Test-Prerequisites)) { exit 1 }
    if (-not (Install-Qt)) { exit 1 }
    if (-not (Build-Project)) { exit 1 }
    if (-not (Create-Distribution)) { exit 1 }
    
    Write-Host "`n「」 Build completed successfully!" -ForegroundColor Green
    Write-Host "Run '$DistDir\drawview.exe' to test." -ForegroundColor Yellow
    
} catch {
    Write-Errr $_.Exception.Message
    if ($CI) {
        exit 1
    } else {
        Write-Host "`nBuild failed. See errors above." -ForegroundColor Red
    }
}