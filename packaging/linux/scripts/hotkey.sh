#!/bin/bash

BINARY_PATH="$1"
SHORTCUT_NAME="Spatialshot"

KEY_GNOME="<Super><Shift>A"
KEY_XFCE="<Super><Shift>a"
KEY_KDE="Meta+Shift+A"

log_info() { echo -e "\033[0;34m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[0;32m[OK]\033[0m $1"; }
log_warn() { echo -e "\033[1;33m[WARN]\033[0m $1"; }
log_err() { echo -e "\033[0;31m[ERR]\033[0m $1"; }

if [ -z "$BINARY_PATH" ]; then
    log_err "No binary path provided to hotkey script."
    exit 1
fi

FULL_BIN_PATH="$(readlink -f "$BINARY_PATH")"
log_info "Setting up hotkey for: $FULL_BIN_PATH"

setup_gnome_style() {
    local SCHEMA="org.gnome.settings-daemon.plugins.media-keys"
    local KEY="custom-keybindings"
    local PATH_ID="spatialshot" 
    local CUSTOM_PATH="/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/$PATH_ID/"

    log_info "Attempting GNOME configuration..."

    if ! command -v gsettings &> /dev/null; then
        log_err "gsettings not found. Cannot configure GNOME."
        return 1
    fi

    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" name "$SHORTCUT_NAME"
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" command "$FULL_BIN_PATH"
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" binding "$KEY_GNOME"

    local CURRENT_LIST
    CURRENT_LIST=$(gsettings get "$SCHEMA" "$KEY")

    if [[ "$CURRENT_LIST" == *"spatialshot"* ]]; then
        log_warn "Hotkey entry already exists in the list. Updated the definition."
    else
        if [ "$CURRENT_LIST" == "@as []" ] || [ "$CURRENT_LIST" == "[]" ]; then
            NEW_LIST="['$CUSTOM_PATH']"
        else
            NEW_LIST=$(echo "$CURRENT_LIST" | sed "s/]$/, '$CUSTOM_PATH']/")
        fi
        gsettings set "$SCHEMA" "$KEY" "$NEW_LIST"
        log_success "Appended to GNOME keybindings list."
    fi
}

setup_cinnamon() {
    local SCHEMA="org.cinnamon.desktop.keybindings"
    local KEY="custom-list"
    local PATH_ID="custom0"
    
    local CUSTOM_PATH="/org/cinnamon/desktop/keybindings/custom-keybindings/spatialshot/"
    local REL_PATH="custom-keybindings/spatialshot/"

    log_info "Attempting Cinnamon configuration..."
    
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" name "$SHORTCUT_NAME"
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" command "$FULL_BIN_PATH"
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" binding "$KEY_GNOME"

    local CURRENT_LIST
    CURRENT_LIST=$(gsettings get "$SCHEMA" "$KEY")

    if [[ "$CURRENT_LIST" == *"spatialshot"* ]]; then
        log_warn "Entry already in Cinnamon list."
    else
        if [ "$CURRENT_LIST" == "@as []" ] || [ "$CURRENT_LIST" == "[]" ]; then
            NEW_LIST="['$REL_PATH']"
        else
            NEW_LIST=$(echo "$CURRENT_LIST" | sed "s/]$/, '$REL_PATH']/")
        fi
        gsettings set "$SCHEMA" "$KEY" "$NEW_LIST"
        log_success "Appended to Cinnamon keybindings."
    fi
}

setup_xfce() {
    log_info "Attempting XFCE configuration..."
    
    if ! command -v xfconf-query &> /dev/null; then
        log_err "xfconf-query not found."
        return 1
    fi
    
    xfconf-query --channel xfce4-keyboard-shortcuts \
                 --property "/commands/custom/$KEY_XFCE" \
                 --create \
                 --type string \
                 --set "$FULL_BIN_PATH"

    if [ $? -eq 0 ]; then
        log_success "XFCE shortcut set ($KEY_XFCE -> $FULL_BIN_PATH)."
    else
        log_err "Failed to set XFCE shortcut."
    fi
}

setup_kde() {
    log_info "Attempting KDE Plasma configuration..."
    log_warn "KDE scripting is complex. This attempts to write to khotkeysrc."
    
    local KCONF_FILE="$HOME/.config/khotkeysrc"
    
    if [ ! -f "$KCONF_FILE" ]; then
        log_warn "$KCONF_FILE not found. Is this definitely KDE?"
    fi

    echo "----------------------------------------------------"
    log_warn "AUTOMATED KDE CONFIGURATION IS EXPERIMENTAL"
    echo "To set this manually in KDE:"
    echo "1. Open System Settings -> Shortcuts -> Custom Shortcuts"
    echo "2. Right Click -> New -> Global Shortcut -> Command/URL"
    echo "3. Name: $SHORTCUT_NAME"
    echo "4. Trigger: Meta+Shift+A"
    echo "5. Action/Command: $FULL_BIN_PATH"
    echo "----------------------------------------------------"
    
    if command -v kwriteconfig5 &> /dev/null; then
         true
    fi
}

log_info "Target Binary: $FULL_BIN_PATH"

CURRENT_DESKTOP=${XDG_CURRENT_DESKTOP:-""}

if [ -z "$CURRENT_DESKTOP" ]; then
    if [ -f /etc/linuxmint/info ]; then
         DESKTOP_SESSION=${DESKTOP_SESSION:-""}
         if [[ "$DESKTOP_SESSION" == *"cinnamon"* ]]; then CURRENT_DESKTOP="Cinnamon"; fi
         if [[ "$DESKTOP_SESSION" == *"xfce"* ]]; then CURRENT_DESKTOP="XFCE"; fi
    fi
fi

log_info "Detected Desktop Environment: $CURRENT_DESKTOP"

case "$CURRENT_DESKTOP" in
    *GNOME*|*gnome*|*Ubuntu*)
        setup_gnome_style
        ;;
    *Cinnamon*|*X-Cinnamon*)
        setup_cinnamon
        ;;
    *XFCE*|*xfce*)
        setup_xfce
        ;;
    *KDE*|*Plasma*)
        setup_kde
        ;;
    *MATE*)
        SCHEMA="org.mate.SettingsDaemon.plugins.media-keys"
        if gsettings list-schemas | grep -q "$SCHEMA"; then
             setup_gnome_style
        else
             log_err "MATE detected but schema not found."
        fi
        ;;
    *)
        log_err "Could not detect a supported Desktop Environment (GNOME, KDE, XFCE, Cinnamon)."
        log_warn "Please set the shortcut manually:"
        echo "   Command: $FULL_BIN_PATH"
        echo "   Keys:    Super+Shift+A"
        ;;
esac

echo ""
log_info "Setup process complete."
