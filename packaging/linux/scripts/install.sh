#!/bin/bash
echo "=========================================="
echo "    STARTING SPATIALSHOT INSTALLER"
echo "=========================================="
echo ""
set -e

# --- Paths ---
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/cache"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/app"
INSTALLER_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot-installer"
ENGINE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/engine"
APP_ICO="$APP_DIR/resources/app/assets/icons/light/512.png"
ICO_DIR="$HOME/.icons/applications/spatialshot"

# --- Artifact URLs ---
RELEASES_URL="https://github.com/a7mddra/spatialshot/releases"
LATEST_URL="${RELEASES_URL}/latest/download"
INSTALLERS_URL="${RELEASES_URL}/download/installers"
EXEC_SUFFIX="-linux-x64.zip"
ENGINE_URL="${LATEST_URL}/engine${EXEC_SUFFIX}"
ORCHESTRATOR_URL="${LATEST_URL}/orchestrator${EXEC_SUFFIX}"
SPATIALSHOT_URL="${LATEST_URL}/spatialshot${EXEC_SUFFIX}"
INSTALLER_URL="${INSTALLERS_URL}/spatialshot-installer${EXEC_SUFFIX}"

echo "Creating directories..."
mkdir -p "$APP_DIR"
mkdir -p "$ICO_DIR"
mkdir -p "$ENGINE_DIR"
mkdir -p "$CACHE_DIR"
mkdir -p "$INSTALLER_DIR"
echo "  > Directories created."

echo "Downloading components..."
echo "  > Downloading spatialshot installer..."
wget -q --show-progress -L -O "$CACHE_DIR/installer.zip" "$INSTALLER_URL"
echo "  > Downloading engine..."
wget -q --show-progress -L -O "$CACHE_DIR/engine.zip" "$ENGINE_URL"
echo "  > Downloading orchestrator..."
wget -q --show-progress -L -O "$CACHE_DIR/orchestrator.zip" "$ORCHESTRATOR_URL"
echo "  > Downloading spatialshot..."
wget -q --show-progress -L -O "$CACHE_DIR/spatialshot.zip" "$SPATIALSHOT_URL"
echo "  > Downloads complete."

echo "Installing files..."
unzip -o "$CACHE_DIR/orchestrator.zip" -d "$APP_DIR"
unzip -o "$CACHE_DIR/spatialshot.zip" -d "$APP_DIR"
unzip -o "$CACHE_DIR/engine.zip" -d "$ENGINE_DIR"
unzip -o "$CACHE_DIR/installer.zip" -d "$INSTALLER_DIR"

chmod +x "$INSTALLER_DIR/spatialshot-installer"
chmod +x "$APP_DIR/spatialshot-orchestrator"
chmod +x "$APP_DIR/spatialshot"

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
