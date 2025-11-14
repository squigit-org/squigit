#!/bin/bash
echo "=========================================="
echo "  STARTING SPATIALSHOT INSTALLER"
echo "=========================================="
echo ""
set -e # Exit if any command fails

# --- Paths ---
TMP_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/tmp_install"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/app"
CAPKIT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/capkit"
UNINSTALL_SCRIPT_PATH="$APP_DIR/uninstall.sh"

# --- Artifact URLs (REPLACE THESE) ---
CAPKIT_URL="https://github.com/a7mddra/spatialshot/actions/runs/xxx/artifacts/xxx"
ORCHESTRATOR_URL="https://github.com/a7mddra/spatialshot/actions/runs/xxx/artifacts/xxx"
SPATIALSHOT_URL="https://github.com/a7mddra/spatialshot/actions/runs/xxx/artifacts/xxx"

echo "STEP 1: Creating directories..."
mkdir -p "$TMP_DIR"
mkdir -p "$APP_DIR"
mkdir -p "$CAPKIT_DIR"
echo "  > Directories created."

echo "STEP 2: Downloading components..."
echo "  > Downloading capkit..."
wget -q --show-progress -O "$TMP_DIR/capkit.zip" "$CAPKIT_URL"
echo "  > Downloading orchestrator..."
wget -q --show-progress -O "$TMP_DIR/orchestrator.zip" "$ORCHESTRATOR_URL"
echo "  > Downloading spatialshot..."
wget -q --show-progress -O "$TMP_DIR/spatialshot.zip" "$SPATIALSHOT_URL"
echo "  > Downloads complete."

echo "STEP 3: Installing files..."
unzip -o "$TMP_DIR/spatialshot.zip" -d "$APP_DIR"
unzip -o "$TMP_DIR/capkit.zip" -d "$CAPKIT_DIR"
unzip -o "$TMP_DIR/orchestrator.zip" -d "$APP_DIR"
chmod +x "$APP_DIR/spatialshot-orchestrator-linux-x64"
# ... add other chmod +x as needed ...
echo "  > Files installed."

echo "STEP 4: Setting up launchers and uninstaller..."
# Create .desktop file
echo "[Desktop Entry]
Version=1.0
Type=Application
Name=Spatialshot
Exec=$HOME/.local/share/spatialshot/app/spatialshot
Icon=$HOME/.local/share/spatialshot/app/assets/icons/light/128.png
Terminal=false
Categories=Utility;" > "$HOME/.local/share/applications/spatialshot.desktop"

# Set gsettings hotkey
SCHEMA="org.gnome.settings-daemon.plugins.media-keys"
KEY="custom-keybindings"
gsettings get $SCHEMA $KEY > /dev/null 2>&1
if [ $? -eq 0 ]; then
    CUSTOM_PATH="/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/spatialshot/"
    gsettings set $SCHEMA.custom-keybinding:$CUSTOM_PATH name "Spatialshot"
    gsettings set $SCHEMA.custom-keybinding:$CUSTOM_PATH command "$APP_DIR/spatialshot-orchestrator-linux-x64"
    gsettings set $SCHEMA.custom-keybinding:$CUSTOM_PATH binding "<Super><Shift>A"
    CURRENT_BINDINGS=$(gsettings get $SCHEMA $KEY | sed "s/]$/, '$CUSTOM_PATH']/")
    gsettings set $SCHEMA $KEY "$CURRENT_BINDINGS"
fi

# Create uninstaller
echo "  > Creating uninstaller..."
cat << 'EOF' > "$UNINSTALL_SCRIPT_PATH"
{{.UninstallScript}}
EOF
chmod +x "$UNINSTALL_SCRIPT_PATH"
echo "  > Uninstaller created at $UNINSTALL_SCRIPT_PATH"
echo "  > Launchers created."

echo "STEP 5: Cleaning up..."
rm -rf "$TMP_DIR"
echo "  > Cleanup complete."

echo ""
echo "=========================================="
echo "  INSTALLATION COMPLETE!"
echo "  To uninstall, run: $UNINSTALL_SCRIPT_PATH"
echo "  Press Enter to close this window."
echo "=========================================="
read # Pauses the terminal
