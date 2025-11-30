#!/bin/bash
echo "=========================================="
echo "    STARTING SPATIALSHOT INSTALLER"
echo "=========================================="
echo ""
set -e

# --- Paths ---
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/cache"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/app"
APP_ICO="$APP_DIR/resources/app/assets/icons/light/512.png"
ICO_DIR="$HOME/.icons/applications/spatialshot"
CAPKIT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/capkit"
UNINSTALL_SCRIPT_PATH="$APP_DIR/uninstall.sh"

# --- Artifact URLs ---
RELEASES_URL="https://github.com/a7mddra/spatialshot/releases/latest/download"
EXEC_SUFFIX="-linux-x64.zip"
CAPKIT_URL="${RELEASES_URL}/capturekit${EXEC_SUFFIX}"
ORCHESTRATOR_URL="${RELEASES_URL}/orchestrator${EXEC_SUFFIX}"
SPATIALSHOT_URL="${RELEASES_URL}/spatialshot${EXEC_SUFFIX}"

echo "Creating directories..."
mkdir -p "$APP_DIR"
mkdir -p "$ICO_DIR"
mkdir -p "$CAPKIT_DIR"
mkdir -p "$CACHE_DIR"
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

cp "$APP_ICO" "$ICO_DIR/512.png"

echo "  > Files installed."

echo "Setting up launchers and uninstaller..."
echo "[Desktop Entry]
Version=1.0
Type=Application
Name=Spatialshot
Exec=$HOME/.local/share/spatialshot/app/spatialshot --no-sandbox
Icon=$ICO_DIR/512.png
Terminal=false
Categories=Utility;" > "$HOME/.local/share/applications/spatialshot.desktop"

echo "Cleaning up..."
rm -rf "$CACHE_DIR"
echo "  > Cleanup complete."
