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
RELEASES_URL="https://github.com/a7mddra/spatialshot/releases/latest/download"
EXEC_SUFFIX="-linux-x64.zip"
CAPKIT_URL="${RELEASES_URL}/capturekit${EXEC_SUFFIX}"
ORCHESTRATOR_URL="${RELEASES_URL}/orchestrator${EXEC_SUFFIX}"
SPATIALSHOT_URL="${RELEASES_URL}/spatialshot${EXEC_SUFFIX}"

echo "Creating directories..."
mkdir -p "$CACHE_DIR"
mkdir -p "$APP_DIR"
mkdir -p "$CAPKIT_DIR"
echo "  > Directories created."

echo "Downloading components..."
echo "  > Downloading capkit..."
wget -q --show-progress -L -O "$CACHE_DIR/capkit.zip" "$CAPKIT_URL"
echo "  > Downloading orchestrator..."
wget -q --show-progress -L -O "$CACHE_DIR/orchestrator.zip" "$ORCHESTRATOR_URL"
echo "  > Downloading spatialshot..."
wget -q --show-progress -L -O "$CACHE_DIR/spatialshot.zip" "$SPATIALSHOT_URL"
echo "  > Downloads complete."

echo "Installing files..."
unzip -o "$CACHE_DIR/orchestrator.zip" -d "$APP_DIR"
unzip -o "$CACHE_DIR/spatialshot.zip" -d "$APP_DIR"
unzip -o "$CACHE_DIR/capkit.zip" -d "$CAPKIT_DIR"

chmod +x "$APP_DIR/spatialshot-orchestrator"

echo "  > Files installed."

echo "Setting up launchers and uninstaller..."
echo "[Desktop Entry]
Version=1.0
Type=Application
Name=Spatialshot
Exec=$HOME/.local/share/spatialshot/app/spatialshot --no-sandbox
Icon=$HOME/.local/share/spatialshot/app/resources/app/assets/icons/light/512.png 
Terminal=false
Categories=Utility;" > "$HOME/.local/share/applications/spatialshot.desktop"

chmod +x "${XDG_DATA_HOME:-$HOME/.local/share}/applications/spatialshot.desktop"

echo "Cleaning up..."
rm -rf "$CACHE_DIR"
echo "  > Cleanup complete."
