#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
XDG_BIN_HOME="${XDG_BIN_HOME:-$HOME/.local/bin}"

APP_DIR="$XDG_DATA_HOME/spatialshot/app"
CAPKIT_DIR="$XDG_DATA_HOME/spatialshot/capkit"
TARGET_BIN="$XDG_BIN_HOME/spatialshot-orchestrator-linux-x64"
SYMLINK="$XDG_BIN_HOME/spatialshot"
DESKTOP_FILE="$HOME/.local/share/applications/spatialshot.desktop"

echo "This will remove Spatialshot files installed in your home directory."
read -p "Are you sure? [y/N] " ans
case "$ans" in
  y|Y)
    echo "Removing app directory: $APP_DIR"
    rm -rf "$APP_DIR" || true
    echo "Removing capkit directory: $CAPKIT_DIR"
    rm -rf "$CAPKIT_DIR" || true
    echo "Removing orchestrator binary: $TARGET_BIN"
    rm -f "$TARGET_BIN" || true
    echo "Removing symlink: $SYMLINK"
    rm -f "$SYMLINK" || true
    echo "Removing desktop entry: $DESKTOP_FILE"
    rm -f "$DESKTOP_FILE" || true
    echo "Uninstallation finished."
    ;;
  *)
    echo "Aborted."
    exit 1
    ;;
esac
