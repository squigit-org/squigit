#!/bin/bash
echo "=========================================="
echo "  STARTING SPATIALSHOT UNINSTALLER"
echo "=========================================="
echo ""
set -e

APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot"
DESKTOP_FILE="$HOME/.local/share/applications/spatialshot.desktop"

echo "STEP 1: Removing application files..."
rm -rf "$APP_DIR"
echo "  > Application files removed."

echo "STEP 2: Removing desktop entry..."
rm -f "$DESKTOP_FILE"
echo "  > Desktop entry removed."

echo "STEP 3: Removing hotkey..."
echo "  > Hotkey configuration needs to be manually removed."
echo "  > Please run the following command to find the hotkey settings:"
echo "      gsettings get org.gnome.settings-daemon.plugins.media-keys custom-keybindings"
echo "  > Then, remove the entry for 'spatialshot' from the list."

echo ""
echo "=========================================="
echo "  UNINSTALLATION COMPLETE!"
echo "=========================================="
