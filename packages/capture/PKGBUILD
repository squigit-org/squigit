#!/bin/bash
set -e

# -----------------------------------------------------------------------------
# Capture Unified Build Script (Linux & macOS)
# -----------------------------------------------------------------------------

OS=$(uname)
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUILD_DIR="$DIR/build"
DIST_DIR="$DIR/dist"
QT_VERSION="6.6.0"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO] $1${NC}"; }
warn() { echo -e "${YELLOW}[WARN] $1${NC}"; }
err() { echo -e "${RED}[ERR] $1${NC}"; }

if [ "$1" == "clean" ]; then
    log "Cleaning build and dist directories..."
    rm -rf "$BUILD_DIR" "$DIST_DIR"
    log "Clean finished."
    exit 0
fi

log "Detecting Qt configuration..."
QT_PLUGIN_SRC=""
QT_LIB_SRC=""

if [ "$OS" == "Darwin" ]; then
    if ! command -v qmake &> /dev/null; then
        err "qmake not found. Ensure Qt is in your PATH."
        exit 1
    fi
    QMAKE_CMD="qmake"
else
    if command -v qmake6 &> /dev/null; then
        QMAKE_CMD="qmake6"
    elif command -v qmake &> /dev/null; then
        QMAKE_CMD="qmake"
    elif [ -d "$HOME/Qt/$QT_VERSION/gcc_64/bin" ]; then
        QMAKE_CMD="$HOME/Qt/$QT_VERSION/gcc_64/bin/qmake"
    else
        err "Qt not found. Please install Qt6 or run 'aqt install-qt linux desktop 6.6.0 gcc_64'."
        exit 1
    fi
fi

QT_PLUGIN_SRC=$($QMAKE_CMD -query QT_INSTALL_PLUGINS)
QT_LIB_SRC=$($QMAKE_CMD -query QT_INSTALL_LIBS)
QT_BIN_PATH=$($QMAKE_CMD -query QT_INSTALL_BINS)

log "Using Qt Plugins: $QT_PLUGIN_SRC"

log "--- Starting Build ---"
mkdir -p "$BUILD_DIR"

cmake -S "$DIR" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_PREFIX_PATH="$($QMAKE_CMD -query QT_INSTALL_PREFIX)"

cmake --build "$BUILD_DIR" --config Release --parallel

log "--- Build Finished ---"

log "--- Staging Distribution ---"
mkdir -p "$DIST_DIR"
mkdir -p "$DIST_DIR/bin"
mkdir -p "$DIST_DIR/libs"
mkdir -p "$DIST_DIR/plugins"

if [ "$OS" == "Darwin" ]; then
    APP_BUNDLE="$BUILD_DIR/capture.app"
    if [ ! -d "$APP_BUNDLE" ]; then err "App bundle not found!"; exit 1; fi
else
    BIN_NAME="capture-bin"
    SRC_BIN="$BUILD_DIR/$BIN_NAME"
    
    if [ ! -f "$SRC_BIN" ]; then SRC_BIN="$BUILD_DIR/capture"; fi
    if [ ! -f "$SRC_BIN" ]; then err "Compiled binary not found at $SRC_BIN"; exit 1; fi

    cp "$SRC_BIN" "$DIST_DIR/bin/$BIN_NAME"
    chmod +x "$DIST_DIR/bin/$BIN_NAME"
fi

if [ "$OS" == "Darwin" ]; then
    log "Running macdeployqt..."
    MACDEPLOYQT="$QT_BIN_PATH/macdeployqt"
    
    cp -R "$APP_BUNDLE" "$DIST_DIR/"
    "$MACDEPLOYQT" "$DIST_DIR/capture.app" -dmg -always-overwrite -verbose=1
    
    log "macOS Deployment Complete."

else
    
    log "Copying Qt Plugins..."
    PLUGIN_LIST=("platforms" "imageformats" "xcbglintegrations" "platformthemes" "wayland-decoration-client" "wayland-graphics-integration-client")
    
    for p in "${PLUGIN_LIST[@]}"; do
        if [ -d "$QT_PLUGIN_SRC/$p" ]; then
            cp -rL "$QT_PLUGIN_SRC/$p" "$DIST_DIR/plugins/"
        else
            warn "Plugin category '$p' not found."
        fi
    done

    log "Creating Runner Script..."
    cat << EOF > "$DIST_DIR/capture"
#!/bin/bash
DIR="\$( cd "\$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
export LD_LIBRARY_PATH="\$DIR/libs:\$DIR/lib:\$LD_LIBRARY_PATH"
export QT_PLUGIN_PATH="\$DIR/plugins"
export QT_QPA_PLATFORM_PLUGIN_PATH="\$DIR/plugins/platforms"
export QML2_IMPORT_PATH="\$DIR/qml"

# Force XCB if needed, or let Qt decide
# export QT_QPA_PLATFORM=xcb 

exec "\$DIR/bin/$BIN_NAME" "\$@"
EOF
    chmod +x "$DIST_DIR/capture"

    log "Resolving Shared Libraries (ldd)..."

    export LD_LIBRARY_PATH="$QT_LIB_SRC:$LD_LIBRARY_PATH"

    SKIP_LIBS="linux-vdso|libstdc++|libgcc_s|libc.so|libm.so|ld-linux|libpthread|librt|libdl"

    copy_deps() {
        local file="$1"
        if [ ! -f "$file" ]; then return; fi
        
        ldd "$file" | grep "=>" | awk '{print $3}' | while read -r lib; do
            if [ -n "$lib" ] && [ -f "$lib" ]; then
                local lib_name=$(basename "$lib")
                
                if echo "$lib_name" | grep -qE "$SKIP_LIBS"; then continue; fi
                
                if [ ! -f "$DIST_DIR/libs/$lib_name" ]; then
                    echo "  Bundling: $lib_name"
                    cp -L "$lib" "$DIST_DIR/libs/"
                fi
            fi
        done
    }

    copy_deps "$DIST_DIR/bin/$BIN_NAME"

    find "$DIST_DIR/plugins" -name "*.so" | while read -r plugin; do
        copy_deps "$plugin"
    done

    log "Scanning for extra XCB dependencies..."
    
    XCB_DIR=""
    if [ -f "/usr/lib/x86_64-linux-gnu/libxcb-cursor.so.0" ]; then
        XCB_DIR="/usr/lib/x86_64-linux-gnu"
    elif [ -f "/usr/lib64/libxcb-cursor.so.0" ]; then
        XCB_DIR="/usr/lib64"
    fi

    if [ -n "$XCB_DIR" ]; then
        EXTRA_LIBS=(
            "libxcb-cursor.so.0" "libxcb-icccm.so.4" "libxcb-image.so.0" 
            "libxcb-keysyms.so.1" "libxcb-randr.so.0" "libxcb-render-util.so.0"
            "libxcb-shm.so.0" "libxcb-sync.so.1" "libxcb-xinerama.so.0"
            "libxcb-xkb.so.1" "libxkbcommon-x11.so.0"
        )
        for lib in "${EXTRA_LIBS[@]}"; do
            if [ -f "$XCB_DIR/$lib" ] && [ ! -f "$DIST_DIR/libs/$lib" ]; then
                 cp -L "$XCB_DIR/$lib" "$DIST_DIR/libs/"
            fi
        done
    fi

    echo "[Paths]" > "$DIST_DIR/qt.conf"
    echo "Prefix = ." >> "$DIST_DIR/qt.conf"
    echo "Plugins = plugins" >> "$DIST_DIR/qt.conf"

    mkdir -p "$DIST_DIR/fonts"
    if [ -f /etc/fonts/fonts.conf ]; then
        cp /etc/fonts/fonts.conf "$DIST_DIR/fonts/"
    fi

    log "Linux Distribution Ready at $DIST_DIR"
    log "Run with: ./dist/capture"
fi