#!/bin/bash

echo "=========================================="
echo "    STARTING SPATIALSHOT UNINSTALLER"
echo "=========================================="
set -e

APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot"
TMP_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/tmp"
DESKTOP_FILE="$HOME/.local/share/applications/spatialshot.desktop"
CLI_WRAPPER="$HOME/.local/bin/spatialshot"

echo "Removing application files..."
rm -rf "$APP_DIR"
rm -rf "$TMP_DIR"

echo "Removing desktop entry..."
rm -f "$DESKTOP_FILE"

if [ -f "$CLI_WRAPPER" ]; then
    echo "Removing CLI wrapper..."
    rm -f "$CLI_WRAPPER"
fi

echo "Removing hotkey..."
echo "  > Note: Hotkeys in GNOME/KDE often persist until manually cleared,"
echo "    but the binary link is gone."

echo "UNINSTALLATION COMPLETE!"
