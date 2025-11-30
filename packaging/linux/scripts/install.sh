#!/usr/bin/env bash
echo "=========================================="
echo "    STARTING SPATIALSHOT INSTALLER"
echo "=========================================="
echo ""
set -euo pipefail
IFS=$'\n\t'

XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
XDG_BIN_HOME="${XDG_BIN_HOME:-$HOME/.local/bin}"

CACHE_DIR="$XDG_CACHE_HOME/spatialshot/cache"
APP_DIR="$XDG_DATA_HOME/spatialshot/app"
CAPKIT_DIR="$XDG_DATA_HOME/spatialshot/capkit"
BIN_DIR="$XDG_BIN_HOME"
SYMLINK_PATH="$BIN_DIR/spatialshot"

CAPKIT_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/capkit-linux-x64.zip"
ORCHESTRATOR_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/spatialshot-orchestrator-linux-x64.zip"
SPATIALSHOT_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/spatialshot-linux-portable.zip"

for cmd in wget unzip mkdir mv chmod ln rm find readlink; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "[ERROR] Required command not found: $cmd"
        echo "Please install it and re-run (e.g. apt install wget unzip)."
        exit 1
    fi
done

echo "Creating directories..."
mkdir -p "$CACHE_DIR" "$APP_DIR" "$CAPKIT_DIR" "$BIN_DIR"
echo "  > Directories created."

echo "Downloading components..."
wget -q --show-progress -L -O "$CACHE_DIR/capkit.zip" "$CAPKIT_URL"
wget -q --show-progress -L -O "$CACHE_DIR/orchestrator.zip" "$ORCHESTRATOR_URL"
wget -q --show-progress -L -O "$CACHE_DIR/spatialshot.zip" "$SPATIALSHOT_URL"
echo "  > Downloads complete."

echo "Installing app resources..."
unzip -o "$CACHE_DIR/spatialshot.zip" -d "$APP_DIR"
unzip -o "$CACHE_DIR/capkit.zip" -d "$CAPKIT_DIR"

echo "Installing orchestrator into $BIN_DIR..."
TMP_ORCH="$(mktemp -d)"
trap 'rm -rf "$TMP_ORCH"' EXIT
unzip -o "$CACHE_DIR/orchestrator.zip" -d "$TMP_ORCH"

FOUND_BINARY="$(find "$TMP_ORCH" -type f -perm /111 -name 'spatialshot-orchestrator*' -print -quit || true)"
if [ -z "$FOUND_BINARY" ]; then
    FOUND_BINARY="$(find "$TMP_ORCH" -type f -perm /111 -print -quit || true)"
fi

if [ -z "$FOUND_BINARY" ]; then
    echo "[ERROR] Could not find orchestrator binary inside the archive."
    echo "Archive contents:"
    find "$TMP_ORCH" -maxdepth 2 -ls || true
    exit 1
fi

TARGET_BIN_PATH="$BIN_DIR/spatialshot-orchestrator-linux-x64"
echo "  > moving $FOUND_BINARY -> $TARGET_BIN_PATH"
mv -f "$FOUND_BINARY" "$TARGET_BIN_PATH"
chmod +x "$TARGET_BIN_PATH"

if [ -L "$SYMLINK_PATH" ] || [ -f "$SYMLINK_PATH" ]; then
    echo "  > removing existing symlink/file: $SYMLINK_PATH"
    rm -f "$SYMLINK_PATH"
fi
ln -s "$TARGET_BIN_PATH" "$SYMLINK_PATH"
chmod +x "$SYMLINK_PATH"
echo "  > Orchestrator installed and symlink created: $SYMLINK_PATH"

DESKTOP_FILE_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_FILE_DIR"
APP_LAUNCHER="$APP_DIR/spatialshot"
ICON_PATH="$APP_DIR/resources/app/assets/icons/light/128.png"
cat > "$DESKTOP_FILE_DIR/spatialshot.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Spatialshot
Exec=$APP_LAUNCHER --no-sandbox
Icon=$ICON_PATH
Terminal=false
Categories=Utility;
EOF
echo "  > Desktop launcher created: $DESKTOP_FILE_DIR/spatialshot.desktop"

echo "Cleaning up..."
rm -rf "$CACHE_DIR"
echo "  > Cleanup complete."

echo ""
echo "Installation finished."
echo "Make sure '$BIN_DIR' is in your PATH (it usually is)."
echo "Run 'spatialshot' to launch the orchestrator (hotkeys will run the orchestrator)."
