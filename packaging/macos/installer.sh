#!/bin/bash
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
set -e

APP_NAME="SpatialShot"
SERVICE_NAME="SpatialShot" 

CACHE_DIR="$HOME/Library/Caches/spatialshot/tmp"
DEST_APP_DIR="/Applications"
DATA_DIR="$HOME/Library/Application Support/spatialshot"
BIN_DIR="$DATA_DIR/bin"
CAPKIT_DIR="$DATA_DIR/capkit"

# --- Artifact URLs ---
RELEASES_URL="https://github.com/a7mddra/spatialshot/releases/latest/download/"
EXEC_SUFFIX="-mac-x64.zip"
CAPKIT_URL="$RELEASES_URL+"capturekit"+$EXEC_SUFFIX"
ORCHESTRATOR_URL="$RELEASES_URL+"orchestrator"+$EXEC_SUFFIX"
SPATIALSHOT_URL="$RELEASES_URL+"spatialshot"+$EXEC_SUFFIX"

log_info() { echo "✦ $1"; }
log_warn() { echo "ⓘ $1"; }
log_success() { echo "✓ $1"; }

fix_quarantine() {
    local target="$1"
    if [ -e "$target" ]; then
        log_info "Bypassing Gatekeeper for $(basename "$target")..."
        xattr -cr "$target" 2>/dev/null || true
    fi
}

echo "=========================================="
echo "        INSTALLING SPATIALSHOT"
echo "=========================================="
echo ""

mkdir -p "$CACHE_DIR"
mkdir -p "$BIN_DIR"
mkdir -p "$CAPKIT_DIR"

log_info "Downloading components..."
curl -L -s "$SPATIALSHOT_URL" -o "$CACHE_DIR/spatialshot.app.zip"
curl -L -s "$CAPKIT_URL" -o "$CACHE_DIR/capkit.zip"
curl -L -s "$ORCHESTRATOR_URL" -o "$CACHE_DIR/orchestrator.zip"

log_info "Installing Application..."
unzip -q -o "$CACHE_DIR/spatialshot.app.zip" -d "$CACHE_DIR"

if [ -d "$CACHE_DIR/$APP_NAME.app" ]; then
    rm -rf "$DEST_APP_DIR/$APP_NAME.app"
    mv "$CACHE_DIR/$APP_NAME.app" "$DEST_APP_DIR/"
    fix_quarantine "$DEST_APP_DIR/$APP_NAME.app"
    
    log_success "Installed $APP_NAME.app to $DEST_APP_DIR"
else
    echo "Error: $APP_NAME.app not found in zip."
    exit 1
fi

log_info "Installing Binaries..."
unzip -q -o "$CACHE_DIR/capkit.zip" -d "$CAPKIT_DIR"
fix_quarantine "$CAPKIT_DIR"

unzip -q -o "$CACHE_DIR/orchestrator.zip" -d "$BIN_DIR"

if [ -f "$BIN_DIR/orchestrator" ]; then
    mv "$BIN_DIR/orchestrator" "$BIN_DIR/orchestrator-macos"
fi

ORCH_BIN="$BIN_DIR/orchestrator-macos"
chmod +x "$ORCH_BIN"
fix_quarantine "$ORCH_BIN"

SERVICE_PATH="$HOME/Library/Services/$SERVICE_NAME.workflow"
log_info "Creating System Service for Hotkey support..."

mkdir -p "$HOME/Library/Services"
osacompile -o "$SERVICE_PATH" -e "do shell script \"'$ORCH_BIN'\""

fix_quarantine "$SERVICE_PATH"

KEY_COMBINATION="@\$A" 

log_info "Attempting to register hotkey (Cmd+Shift+A)..."
PBS_PLIST="$HOME/Library/Preferences/pbs.plist"
DOMAIN="NSServicesStatus"

if [ ! -f "$PBS_PLIST" ]; then
    defaults write pbs NSServicesStatus -dict
fi

defaults write pbs NSServicesStatus -dict-add "com.apple.automator.$SERVICE_NAME" "{ 'key_equivalent' = '$KEY_COMBINATION'; 'enabled_context_menu' = 1; 'enabled_services_menu' = 1; }"

killall cfprefsd 2>/dev/null || true
killall pbs 2>/dev/null || true

UNINSTALLER="$DATA_DIR/Uninstall SpatialShot.command"

log_info "Creating Uninstaller at $UNINSTALLER..."

cat << 'EOF' > "$UNINSTALLER"
#!/bin/bash
clear
echo "=========================================="
echo "        UNINSTALLING SPATIALSHOT"
echo "=========================================="
echo ""

echo "Stopping application..."
pkill -f "SpatialShot" 2>/dev/null || true
pkill -f "orchestrator" 2>/dev/null || true

APP_PATH="/Applications/SpatialShot.app"
if [ -d "$APP_PATH" ]; then
    rm -rf "$APP_PATH"
    echo "Removed Application"
else
    echo "Application not found in /Applications"
fi

SERVICE_PATH="$HOME/Library/Services/SpatialShot Capture.workflow"
if [ -d "$SERVICE_PATH" ]; then
    rm -rf "$SERVICE_PATH"
    echo "Removed Keyboard Shortcut Service"
    /System/Library/CoreServices/pbs -flush
else
    echo "Service not found"
fi

DATA_DIR="$HOME/Library/Application Support/spatialshot"
if [ -d "$DATA_DIR" ]; then
    rm -rf "$DATA_DIR"
    echo "Removed Configuration & Binaries"
fi

CACHE_DIR="$HOME/Library/Caches/spatialshot"
if [ -d "$CACHE_DIR" ]; then
    rm -rf "$CACHE_DIR"
    echo "Removed Cache"
fi

echo ""
echo "=========================================="
echo "        UNINSTALLATION COMPLETE"
echo "=========================================="
echo "You may close this window."
exit 0
EOF

chmod +x "$UNINSTALLER"
xattr -cr "$UNINSTALLER" 2>/dev/null || true

rm -rf "$CACHE_DIR"

echo ""
echo "=========================================="
echo "         INSTALLATION COMPLETE"
echo "=========================================="
echo "1. SpatialShot is installed in Applications."
echo "2. A System Service '$SERVICE_NAME' has been created."
echo ""
echo "   IMPORTANT: If the Hotkey (Cmd+Shift+A) does not work immediately:"
echo "   Go to System Settings > Keyboard > Keyboard Shortcuts > Services > General"
echo "   Ensure '$SERVICE_NAME' is checked and the key is set."
echo ""