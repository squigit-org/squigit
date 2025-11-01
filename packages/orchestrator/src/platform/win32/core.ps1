#!/usr/bin/env pwsh

$arg = $args[0]
$remainingArgs = $args[1..($args.Length - 1)]

switch ($arg) {
    "grab-screen" {
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

        $nircmd   = Join-Path $env:LOCALAPPDATA 'spatialshot\3rdparty\nircmd.exe'
        $savePath = Join-Path $env:LOCALAPPDATA 'spatialshot\tmp'
        $imageExt = 'png'

        if ([string]::IsNullOrWhiteSpace($savePath)) {
            Write-Error "savePath is empty. Aborting."
            exit 1
        }

        try {
            $fullPath = [System.IO.Path]::GetFullPath($savePath)
        } catch {
            Write-Error "Invalid savePath path: '$savePath'"
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
        } elseif (Test-Path -LiteralPath $nircmd) {
            $nircmdCmd = $nircmd
        }

        if (-not $nircmdCmd) {
            Write-Error "nircmd not found in PATH or at '$nircmd'. Aborting."
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

        Write-Output ($i - 1)

        if ($errorsEncountered) {
            Write-Warning "One or more screens may not have been captured correctly."
            exit 1
        }

        exit 0
    }
    
    "draw-view" {
        $exe = Join-Path $env:LOCALAPPDATA 'spatialshot\capkit\drawview.exe'
        
        if (Test-Path $exe) {
            & $exe @remainingArgs
        } else {
            Write-Error "drawview.exe not found at '$exe'. Aborting."
            exit 1
        }
    }
    
    "spatialshot" {
        $exe = Join-Path $env:LOCALAPPDATA 'spatialshot\app\spatialshot.exe'
        
        if (Test-Path $exe) {
            & $exe @remainingArgs
        } else {
            Write-Error "spatialshot.exe not found at '$exe'. Aborting."
            exit 1
        }
    }
    
    default {
        Write-Error "Invalid argument: $arg. Valid options: grab-screen, draw-view, spatialshot"
        exit 1
    }
}
