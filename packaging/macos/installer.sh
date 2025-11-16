#!/bin/bash
# install-macos.sh - SpatialShot Online Installer
set -e

# --- Artifact URLs (REPLACE THESE) ---
# Note: macOS builds often zip the .app file
CAPKIT_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/capkit-macos.zip"
ORCHESTRATOR_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/spatialshot-orchestrator-macos.zip"
SPATIALSHOT_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/spatialshot-macos.app.zip"

# --- Paths ---
CACHE_DIR="$HOME/Library/Caches/spatialshot/cache"
APP_DIR="$HOME/Library/Application Support/spatialshot/app"
CAPKIT_DIR="$HOME/Library/Application Support/spatialshot/capkit"

echo "Starting SpatialShot installation..."

# --- 1. Create Directories ---
echo "Creating directories..."
mkdir -p "$CACHE_DIR"
mkdir -p "$APP_DIR"
mkdir -p "$CAPKIT_DIR"

# --- 2. Download ---
echo "Downloading components (this may take a moment)..."
curl -L "$SPATIALSHOT_URL" -o "$CACHE_DIR/spatialshot.app.zip"
curl -L "$CAPKIT_URL" -o "$CACHE_DIR/capkit.zip"
curl -L "$ORCHESTRATOR_URL" -o "$CACHE_DIR/orchestrator.zip"

# --- 3. Install ---
echo "Installing files..."

# Unzip and install the .app to /Applications
unzip -o "$CACHE_DIR/spatialshot.app.zip" -d "$CACHE_DIR"
if [ -d "$CACHE_DIR/SpatialShot.app" ]; then
    rm -rf "/Applications/SpatialShot.app"
    mv "$CACHE_DIR/SpatialShot.app" "/Applications/"
else
    echo "Error: SpatialShot.app not found in zip!"
    exit 1
fi

# Install helpers
unzip -o "$CACHE_DIR/capkit.zip" -d "$CAPKIT_DIR"
unzip -o "$CACHE_DIR/orchestrator.zip" -d "$APP_DIR"
chmod +x "$APP_DIR/spatialshot-orchestrator-macos"

# --- 4. Create Uninstaller ---
echo "Creating uninstaller..."
UNINSTALLER_PATH="$APP_DIR/uninstall.sh"
cat << 'EOF' > "$UNINSTALLER_PATH"
#!/bin/bash
echo "=========================================="
echo "  STARTING SPATIALSHOT UNINSTALLER"
echo "=========================================="
echo ""
set -e

APP_PATH="/Applications/SpatialShot.app"
DATA_DIR="$HOME/Library/Application Support/spatialshot"

echo "STEP 1: Removing application..."
if [ -d "$APP_PATH" ]; then
    rm -rf "$APP_PATH"
    echo "  > Application removed from $APP_PATH"
else
    echo "  > Application not found at $APP_PATH"
fi

echo "STEP 2: Removing application data..."
if [ -d "$DATA_DIR" ]; then
    rm -rf "$DATA_DIR"
    echo "  > Application data removed from $DATA_DIR"
else
    echo "  > Application data not found at $DATA_DIR"
fi

echo "STEP 3: Manual Steps..."
echo "  > If you have configured a hotkey for SpatialShot, please remove it manually from 'System Settings' > 'Keyboard' > 'Keyboard Shortcuts...'"

echo ""
echo "=========================================="
echo "  UNINSTALLATION COMPLETE!"
echo "=========================================="
EOF
chmod +x "$UNINSTALLER_PATH"

# --- 5. Cleanup ---
echo "Cleaning up..."
rm -rf "$CACHE_DIR"

# --- 6. Final Instructions ---
echo ""
echo "✅ SpatialShot installation complete!"
echo "The application 'SpatialShot.app' has been installed to /Applications."
echo "To uninstall, run the script located at: $UNINSTALLER_PATH"
echo ""
echo "--- ⚠️ ACTION REQUIRED: Set Your Hotkey ---"
echo "To enable the 'Circle to Search' hotkey, you must set it up manually:"
echo ""
echo "1. Open 'System Settings' > 'Keyboard' > 'Keyboard Shortcuts...'"
echo "2. Go to 'Services' in the sidebar."
echo "3. Find 'SpatialShot' and add your preferred shortcut (e.g., ⌘+Shift+A)."
echo ""
echo "Opening System Settings for you now..."
sleep 3
open "x-apple.systempreferences:com.apple.keyboard.shortcuts"

exit 0
