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
	BinName     = "spatialshot-orchestrator-linux-x64"
	WrapperName = "spatialshot"

	// ANSI Colors
	ColorReset  = "\033[0m"
	ColorGreen  = "\033[32m"
	ColorYellow = "\033[33m"
	ColorBlue   = "\033[34m"
	ColorCyan   = "\033[36m"
	ColorBold   = "\033[1m"
)

func main() {
	// HANDLE: "spatialshot uninstall" command
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
	// We run the uninstaller silently to ensure a clean slate.
	// We ignore errors here because it might be the first install.
	runEmbeddedScript("scripts/uninstall.sh", []string{"--silent"})

	fmt.Println(ColorBold + "Starting Spatialshot Setup..." + ColorReset)

	homeDir, _ := os.UserHomeDir()
	localShare := filepath.Join(homeDir, ".local", "share")
	localBin := filepath.Join(homeDir, ".local", "bin")
	targetAppDir := filepath.Join(localShare, AppDirName, "app")

	// We target the wrapper for the hotkey, NOT the internal binary.
	// This solves the relative/absolute path issues in different DEs.
	wrapperPath := filepath.Join(localBin, WrapperName)

	// ---------------------------------------------------------
	// STEP 1: Install Files
	// ---------------------------------------------------------
	fmt.Println("\n" + ColorBlue + "[1/3] Downloading and Installing..." + ColorReset)
	runEmbeddedScript("scripts/install.sh", nil)

	// ---------------------------------------------------------
	// STEP 2: Create CLI Wrapper (Moved BEFORE Hotkey)
	// ---------------------------------------------------------
	fmt.Println("\n" + ColorBlue + "[2/3] Creating CLI Wrapper..." + ColorReset)
	createCLIWrapper(localBin, targetAppDir)

	// ---------------------------------------------------------
	// STEP 3: Configure Hotkeys
	// ---------------------------------------------------------
	fmt.Println("\n" + ColorBlue + "[3/3] Configuring Hotkeys..." + ColorReset)
	// We pass the wrapper path. The wrapper handles finding the real app.
	// This makes the command simple: /home/user/.local/bin/spatialshot
	hotkeyErr := runEmbeddedScript("scripts/hotkey.sh", []string{wrapperPath})

	// ---------------------------------------------------------
	// SUMMARY
	// ---------------------------------------------------------
	printSummary(hotkeyErr == nil)

	fmt.Println("Press [Enter] to exit...")
	var input string
	fmt.Scanln(&input)
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

	// If silent arg is present, suppress stdout/stderr
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
TARGET_BIN="%s/%s"

if [ "$1" == "uninstall" ]; then
    # Locate the uninstaller script in the app dir if we want to support 
    # self-uninstallation without the original installer binary.
    # However, since main.go embeds it, we can't easily run it unless
    # we copied the main binary to the install dir. 
    # For now, let's assume standard execution:
    exec "$TARGET_BIN" uninstall
else
    # Forward all args
    exec "$TARGET_BIN" "$@"
fi
`, appDir, BinName)

	err := os.WriteFile(wrapperPath, []byte(scriptContent), 0755)
	if err != nil {
		fmt.Println(ColorYellow + "    Warning: Could not create CLI wrapper." + ColorReset)
	} else {
		fmt.Println("    > Installed 'spatialshot' command to " + wrapperPath)
	}
}

func printSummary(hotkeySuccess bool) {
	fmt.Println("\n" + ColorGreen + "========================================")
	fmt.Println("      INSTALLATION COMPLETE! 🚀")
	fmt.Println("========================================" + ColorReset)

	fmt.Println("\n" + ColorBold + "Spatialshot is now ready." + ColorReset)
	fmt.Println("Here is how to use it:")

	// 1. Manual Launch
	fmt.Printf("\n1. %sFrom your Dock/Menu:%s\n", ColorCyan, ColorReset)
	fmt.Println("   Open 'Spatialshot' to upload a local photo or manage settings.")
	fmt.Println("")

	// 2. Hotkey Launch
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
