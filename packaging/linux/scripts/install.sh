#!/bin/bash
echo "=========================================="
echo "    STARTING SPATIALSHOT INSTALLER"
echo "=========================================="
echo ""
set -e

# --- Paths ---
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/cache"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/app"
CAPKIT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/capkit"
UNINSTALL_SCRIPT_PATH="$APP_DIR/uninstall.sh"

# --- Artifact URLs ---
CAPKIT_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/capkit-linux-x64.zip"
ORCHESTRATOR_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/spatialshot-orchestrator-linux-x64.zip"
SPATIALSHOT_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/spatialshot-linux-portable.zip"

echo "Creating directories..."
mkdir -p "$CACHE_DIR"
mkdir -p "$APP_DIR"
mkdir -p "$CAPKIT_DIR"
echo "  > Directories created."

echo "Downloading components..."
echo "  > Downloading capkit..."
wget -q --show-progress -O "$CACHE_DIR/capkit.zip" "$CAPKIT_URL"
echo "  > Downloading orchestrator..."
wget -q --show-progress -O "$CACHE_DIR/orchestrator.zip" "$ORCHESTRATOR_URL"
echo "  > Downloading spatialshot..."
wget -q --show-progress -O "$CACHE_DIR/spatialshot.zip" "$SPATIALSHOT_URL"
echo "  > Downloads complete."

echo "Installing files..."
unzip -o "$CACHE_DIR/spatialshot.zip" -d "$APP_DIR"
unzip -o "$CACHE_DIR/capkit.zip" -d "$CAPKIT_DIR"
unzip -o "$CACHE_DIR/orchestrator.zip" -d "$APP_DIR"
chmod +x "$APP_DIR/spatialshot-orchestrator-linux-x64"

echo "  > Files installed."

echo "Setting up launchers and uninstaller..."
echo "[Desktop Entry]
Version=1.0
Type=Application
Name=Spatialshot
Exec=$HOME/.local/share/spatialshot/app/spatialshot
Icon=$HOME/.local/share/spatialshot/app/assets/icons/light/128.png
Terminal=false
Categories=Utility;" > "$HOME/.local/share/applications/spatialshot.desktop"

echo "Cleaning up..."
rm -rf "$CACHE_DIR"
echo "  > Cleanup complete."
