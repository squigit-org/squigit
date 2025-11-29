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
	AppDirName = "spatialshot"
	BinName    = "spatialshot-orchestrator-linux-x64"
)

func main() {
	if !isTerminal() {
		launchInTerminal()
		return
	}

	fmt.Println("Starting Spatialshot Setup...")

	homeDir, _ := os.UserHomeDir()
	localShare := filepath.Join(homeDir, ".local", "share")
	localBin := filepath.Join(homeDir, ".local", "bin")
	targetAppDir := filepath.Join(localShare, AppDirName, "app")
	targetBinPath := filepath.Join(targetAppDir, BinName)

	fmt.Println("\n[1/3] Running Installer...")
	runEmbeddedScript("scripts/install.sh", nil)

	fmt.Println("\n[2/3] Configuring Hotkeys...")
	runEmbeddedScript("scripts/hotkey.sh", []string{targetBinPath})

	fmt.Println("\n[3/3] Creating CLI Wrapper...")
	createCLIWrapper(localBin, targetAppDir)

	fmt.Println("\nInstallation Finished Successfully!")
	fmt.Println("Press [Enter] to exit...")
	var input string
	fmt.Scanln(&input)
}

func runEmbeddedScript(scriptName string, args []string) {
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
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	if err := cmd.Run(); err != nil {
		fatal("Script execution failed: " + scriptName + "\nError: " + err.Error())
	}
}

func createCLIWrapper(binDir, appDir string) {
	os.MkdirAll(binDir, 0755)

	wrapperPath := filepath.Join(binDir, "spatialshot")

	scriptContent := fmt.Sprintf(`#!/bin/bash
if [ "$1" == "uninstall" ]; then
    echo "Running Uninstaller..."
    exec "%s/uninstall.sh"
else
    # Forward all args to the main binary
    exec "%s/%s" "$@"
fi
`, appDir, appDir, BinName)

	err := os.WriteFile(wrapperPath, []byte(scriptContent), 0755)
	if err != nil {
		fmt.Println("   Warning: Could not create CLI wrapper in " + binDir)
		fmt.Println("   Ensure " + binDir + " is in your PATH.")
	} else {
		fmt.Println("   > Installed 'spatialshot' command to " + wrapperPath)
	}
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

	terminals := []string{
		"gnome-terminal",
		"konsole",
		"xfce4-terminal",
		"xterm",
		"terminator",
		"tilix",
	}

	for _, term := range terminals {
		path, err := exec.LookPath(term)
		if err == nil {
			var args []string
			switch term {
			case "gnome-terminal", "terminator", "tilix":
				args = []string{"--", self}
			case "konsole":
				args = []string{"-e", self}
			default:
				args = []string{"-e", self}
			}

			exec.Command(path, args...).Start()
			os.Exit(0)
		}
	}
	// Fallback
	fmt.Println("Could not detect a terminal emulator. Running in background.")
}

func fatal(msg string) {
	fmt.Println("\nFATAL ERROR: " + msg)
	fmt.Println("Press [Enter] to exit...")
	var input string
	fmt.Scanln(&input)
	os.Exit(1)
}
