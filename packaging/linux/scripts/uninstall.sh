#!/bin/bash

APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot"
TMP_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/tmp"
DESKTOP_FILE="$HOME/.local/share/applications/spatialshot.desktop"
CLI_WRAPPER="$HOME/.local/bin/spatialshot"

SILENT=false

for arg in "$@"; do
    if [ "$arg" == "--silent" ]; then
        SILENT=true
    fi
done

log() {
    if [ "$SILENT" = false ]; then
        echo "$@"
    fi
}

if [ "$SILENT" = false ]; then
    echo "=========================================="
    echo "    STARTING SPATIALSHOT UNINSTALLER"
    echo "=========================================="
    
    echo "This will remove Spatialshot files installed in your home directory."
    read -p "Are you sure? [y/N] " ans
    case "$ans" in
      y|Y) ;;
      *) echo "Aborted."; exit 1 ;;
    esac
fi

log "Removing application files..."
rm -rf "$APP_DIR"
rm -rf "$TMP_DIR"

log "Removing desktop entry..."
rm -f "$DESKTOP_FILE"

if [ -f "$CLI_WRAPPER" ]; then
    log "Removing CLI wrapper..."
    rm -f "$CLI_WRAPPER"
fi

if [ "$SILENT" = false ]; then
    echo "Removing hotkeys..."
    echo "  > Note: Hotkeys in GNOME/KDE might persist in settings,"
    echo "    but the command they point to is gone."
    echo "UNINSTALLATION COMPLETE!"
fi
