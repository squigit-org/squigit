#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DpiAwareness {
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    private static readonly IntPtr DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = new IntPtr(-4);
    public static void Set() {
        try { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2); }
        catch { }
    }
}
"@ -ErrorAction SilentlyContinue
try { [DpiAwareness]::Set() } catch {}

# --- Configuration ---
$nircmdFallback = Join-Path $env:LOCALAPPDATA 'spatialshot\bin\nircmd.exe'
$outputFolder   = Join-Path $env:LOCALAPPDATA 'spatialshot\tmp'
$imageExt       = 'png'
# ---------------------

if ([string]::IsNullOrWhiteSpace($outputFolder)) {
    Write-Error "outputFolder is empty. Aborting."
    exit 1
}

try {
    $fullPath = [System.IO.Path]::GetFullPath($outputFolder)
} catch {
    Write-Error "Invalid outputFolder path: '$outputFolder'"
    exit 1
}

$root = [System.IO.Path]::GetPathRoot($fullPath)

if ($fullPath -eq $root -or $fullPath -eq $env:USERPROFILE) {
    Write-Error "Refusing to remove critical path: '$fullPath'"
    exit 1
}

if (Test-Path -LiteralPath $fullPath) {
    try {
        Remove-Item -LiteralPath $fullPath -Recurse -Force -ErrorAction Stop
    } catch {
        Write-Error "Failed to remove existing path '$fullPath': $_"
        exit 1
    }
}

try {
    New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
} catch {
    Write-Error "Failed to create directory '$fullPath': $_"
    exit 1
}

$nircmdCmd = $null
$cmd = Get-Command nircmd -ErrorAction SilentlyContinue
if ($cmd) {
    $nircmdCmd = $cmd.Source
} elseif (Test-Path -LiteralPath $nircmdFallback) {
    $nircmdCmd = $nircmdFallback
}

if (-not $nircmdCmd) {
    Write-Error "nircmd not found in PATH or at '$nircmdFallback'. Aborting."
    exit 1
}

Add-Type -AssemblyName System.Windows.Forms

$screens = [System.Windows.Forms.Screen]::AllScreens | Sort-Object -Property DeviceName
if (-not $screens) {
    Write-Error "No screens detected."
    exit 1
}

$i = 1
$errorsEncountered = $false
foreach ($screen in $screens) {
    $b = $screen.Bounds
    $outFile = Join-Path $fullPath ("$i.$imageExt")

    & $nircmdCmd savescreenshot $outFile $b.X $b.Y $b.Width $b.Height
    
    if ($LASTEXITCODE -ne 0) {
        $exitCodeStr = if ([string]::IsNullOrEmpty($LASTEXITCODE)) { "[blank]" } else { $LASTEXITCODE }
        
        Write-Warning "nircmd reported an issue with screen $i (exit code: $exitCodeStr). Continuing to next screen..."
        $errorsEncountered = $true
    }

    $i++
}

Write-Output "Captured $($i - 1) screen(s) into: $fullPath"

if ($errorsEncountered) {
    Write-Warning "One or more screens may not have been captured correctly."
    exit 1
}

exit 0