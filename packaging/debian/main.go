/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */
 
package main

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"text/template"
)

func findTerminal() (string, string) {
	terminals := map[string]string{
		"gnome-terminal": "-e",
		"konsole":        "-e",
		"xfce4-terminal": "-e",
		"terminator":     "-e",
		"xterm":          "-e",
		"tilix":          "-e",
	}

	for term, arg := range terminals {
		if _, err := exec.LookPath(term); err == nil {
			return term, arg
		}
	}
	return "xterm", "-e"
}

func main() {
	terminal, execArg := findTerminal()

	installScriptTmplBytes, err := ioutil.ReadFile("packaging/debian/installer.sh")
	if err != nil {
		fmt.Printf("Failed to read installer script template: %v\n", err)
		return
	}

	uninstallScriptBytes, err := ioutil.ReadFile("packaging/debian/uninstall.sh")
	if err != nil {
		fmt.Printf("Failed to read uninstall script: %v\n", err)
		return
	}

	tmpl, err := template.New("installScript").Parse(string(installScriptTmplBytes))
	if err != nil {
		fmt.Printf("Failed to parse install script template: %v\n", err)
		return
	}

	var scriptBuf bytes.Buffer
	err = tmpl.Execute(&scriptBuf, struct{ UninstallScript string }{UninstallScript: string(uninstallScriptBytes)})
	if err != nil {
		fmt.Printf("Failed to execute install script template: %v\n", err)
		return
	}

	tmpFile, err := ioutil.TempFile(os.TempDir(), "install_spatialshot_*.sh")
	if err != nil {
		fmt.Printf("Failed to create temp file: %v\n", err)
		return
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write(scriptBuf.Bytes()); err != nil {
		fmt.Printf("Failed to write script: %v\n", err)
		return
	}
	tmpFile.Close()

	if err := os.Chmod(tmpFile.Name(), 0755); err != nil {
		fmt.Printf("Failed to chmod script: %v\n", err)
		return
	}

	scriptPath, _ := filepath.Abs(tmpFile.Name())
	cmdString := fmt.Sprintf("bash %s", scriptPath)

	cmd := exec.Command(terminal, execArg, cmdString)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		fmt.Printf("Failed to launch terminal: %v\n", err)
	}
}
