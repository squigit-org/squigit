/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

package main

import (
	"embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

//go:embed scripts/*
var scriptFS embed.FS

const (
	AppDirName  = "spatialshot"
	WrapperName = "spatialshot"
	BinName     = "spatialshot-orchestrator"

	ColorReset  = "\033[0m"
	ColorGreen  = "\033[32m"
	ColorYellow = "\033[33m"
	ColorBlue   = "\033[34m"
	ColorCyan   = "\033[36m"
	ColorBold   = "\033[1m"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "uninstall" {
		fmt.Println("Uninstalling Spatialshot...")
		runEmbeddedScript("scripts/uninstall.sh", nil)
		return
	}

	if !isTerminal() {
		launchInTerminal()
		return
	}

	// ---------------------------------------------------------
	// PRE-INSTALL: Silent Cleanup
	// ---------------------------------------------------------
	runEmbeddedScript("scripts/uninstall.sh", []string{"--silent"})

	fmt.Println(ColorBold + "Starting Spatialshot Setup..." + ColorReset)

	homeDir, _ := os.UserHomeDir()
	localShare := filepath.Join(homeDir, ".local", "share")
	localBin := filepath.Join(homeDir, ".local", "bin")
	targetAppDir := filepath.Join(localShare, AppDirName, "app")
	wrapperPath := filepath.Join(localBin, WrapperName)

	// ---------------------------------------------------------
	// STEP 1: Install Files
	// ---------------------------------------------------------
	fmt.Println("\n" + ColorBlue + "[1/3] Downloading and Installing..." + ColorReset)
	if err := runEmbeddedScript("scripts/install.sh", nil); err != nil {
		fatal("Installation script failed.")
	}

	// ---------------------------------------------------------
	// STEP 1.5: Extract Uninstaller to Disk
	// ---------------------------------------------------------
	destUninstallPath := filepath.Join(targetAppDir, "uninstall.sh")
	fmt.Println("      > Extracting uninstaller to " + destUninstallPath)
	if err := extractEmbeddedFile("scripts/uninstall.sh", destUninstallPath); err != nil {
		fmt.Println(ColorYellow + "Warning: Could not save uninstaller script to disk." + ColorReset)
	}

	// ---------------------------------------------------------
	// STEP 2: Create CLI Wrapper
	// ---------------------------------------------------------
	fmt.Println("\n" + ColorBlue + "[2/3] Creating CLI Wrapper..." + ColorReset)
	createCLIWrapper(localBin, targetAppDir)

	// ---------------------------------------------------------
	// STEP 3: Configure Hotkeys
	// ---------------------------------------------------------
	fmt.Println("\n" + ColorBlue + "[3/3] Configuring Hotkeys..." + ColorReset)
	hotkeyErr := runEmbeddedScript("scripts/hotkey.sh", []string{wrapperPath})

	// ---------------------------------------------------------
	// SUMMARY
	// ---------------------------------------------------------
	printSummary(hotkeyErr == nil)

	fmt.Println("Press [Enter] to exit...")
	var input string
	fmt.Scanln(&input)
}

func extractEmbeddedFile(srcEmbedPath, destPath string) error {
	content, err := scriptFS.ReadFile(srcEmbedPath)
	if err != nil {
		return err
	}
	return os.WriteFile(destPath, content, 0755)
}

func runEmbeddedScript(scriptName string, args []string) error {
	scriptContent, err := scriptFS.ReadFile(scriptName)
	if err != nil {
		fatal("Could not read embedded script: " + scriptName)
	}

	tmpFile, err := os.CreateTemp("", "spatialshot-*.sh")
	if err != nil {
		fatal("Could not create temp file")
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write(scriptContent); err != nil {
		fatal("Could not write to temp file")
	}
	tmpFile.Close()
	os.Chmod(tmpFile.Name(), 0755)

	cmd := exec.Command("/bin/bash", append([]string{tmpFile.Name()}, args...)...)

	isSilent := false
	for _, arg := range args {
		if arg == "--silent" {
			isSilent = true
		}
	}

	if !isSilent {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
	}

	return cmd.Run()
}

func createCLIWrapper(binDir, appDir string) {
	os.MkdirAll(binDir, 0755)

	wrapperPath := filepath.Join(binDir, WrapperName)

	scriptContent := fmt.Sprintf(`#!/bin/bash
APP_BIN="%s/%s"
UNINSTALLER="%s/uninstall.sh"

if [ "$1" == "uninstall" ]; then
    if [ -f "$UNINSTALLER" ]; then
        exec "$UNINSTALLER"
    else
        echo "Error: Uninstaller not found at $UNINSTALLER"
        exit 1
    fi
else
    exec "$APP_BIN" "$@"
fi
`, appDir, BinName, appDir)

	err := os.WriteFile(wrapperPath, []byte(scriptContent), 0755)
	if err != nil {
		fmt.Println(ColorYellow + "    Warning: Could not create CLI wrapper." + ColorReset)
	} else {
		fmt.Println("    > Installed 'spatialshot' command to " + wrapperPath)
	}
}

func printSummary(hotkeySuccess bool) {
	fmt.Println("\n" + ColorGreen + "========================================")
	fmt.Println("      INSTALLATION COMPLETE!")
	fmt.Println("========================================" + ColorReset)

	fmt.Println("\n" + ColorBold + "Spatialshot is now ready." + ColorReset)
	fmt.Println("Here is how to use it:")

	fmt.Printf("\n1. %sFrom your Dock/Menu:%s\n", ColorCyan, ColorReset)
	fmt.Println("   Open 'Spatialshot' to upload a local photo or manage settings.")
	fmt.Println("")

	fmt.Printf("2. %sUsing the Hotkey:%s\n", ColorCyan, ColorReset)
	if hotkeySuccess {
		fmt.Printf("   Press %sSuper + Shift + A%s to instantly capture via drawing.\n", ColorGreen, ColorReset)
		fmt.Println("   (The app will open automatically)")
	} else {
		fmt.Printf("   %sWarning:%s We couldn't set the hotkey automatically.\n", ColorYellow, ColorReset)
		fmt.Println("   Please set a shortcut manually to run: spatialshot")
	}

	fmt.Println("")
}

func isTerminal() bool {
	fileInfo, _ := os.Stdout.Stat()
	return (fileInfo.Mode() & os.ModeCharDevice) != 0
}

func launchInTerminal() {
	self, err := os.Executable()
	if err != nil {
		return
	}

	terminals := []string{"gnome-terminal", "konsole", "xfce4-terminal", "xterm", "terminator", "tilix"}

	for _, term := range terminals {
		path, err := exec.LookPath(term)
		if err == nil {
			var args []string
			switch term {
			case "gnome-terminal", "terminator", "tilix":
				args = []string{"--", self}
			default:
				args = []string{"-e", self}
			}
			exec.Command(path, args...).Start()
			os.Exit(0)
		}
	}
}

func fatal(msg string) {
	fmt.Println("\n" + "\033[0;31m" + "FATAL ERROR: " + msg + "\033[0m")
	fmt.Println("Press [Enter] to exit...")
	var input string
	fmt.Scanln(&input)
	os.Exit(1)
}
