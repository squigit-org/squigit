#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

BINARY_ARG="${1:-spatialshot}"
USER_KEYS="${2:-}"
SHORTCUT_NAME="${3:-Spatialshot}"

DEFAULT_KEYS_GNOME="<Super><Shift>A"
DEFAULT_KEYS_XFCE="<Super><Shift>a"
DEFAULT_KEYS_KDE="Meta+Shift+A"

KEY_GNOME="${USER_KEYS:-$DEFAULT_KEYS_GNOME}"
KEY_XFCE="${USER_KEYS:-$DEFAULT_KEYS_XFCE}"
KEY_KDE="${USER_KEYS:-$DEFAULT_KEYS_KDE}"

log()   { echo -e "\033[0;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[0;32m[OK]\033[0m    $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
err()   { echo -e "\033[0;31m[ERR]\033[0m   $*"; }

has_cmd() { command -v "$1" &>/dev/null; }
generate_id() {
    if has_cmd uuidgen; then
        uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1
    else
        date +%s%N | sha1sum | cut -c1-8
    fi
}
escape_for_single_quote() { printf "%s" "$1" | sed "s/'/'\"'\"'/g"; }

BINARY_RAW="$BINARY_ARG"
HOME_DIR="${HOME:-$(getent passwd $(whoami) | cut -d: -f6)}"
EXEC_CMD=""
CHECK_PATH=""

if [ -z "$BINARY_RAW" ] || [ "$BINARY_RAW" = "spatialshot" ]; then
    EXEC_CMD="spatialshot"
    CHECK_PATH="$(command -v spatialshot || true)"
else
    if [[ "$BINARY_RAW" == "~"* ]]; then
        EXPANDED="${BINARY_RAW/#\~/$HOME_DIR}"
        CHECK_PATH="$EXPANDED"
        EXEC_CMD="$CHECK_PATH"
    elif [[ "$BINARY_RAW" == /.local/* || "$BINARY_RAW" == "/.local"* ]]; then
        CHECK_PATH="$HOME_DIR$BINARY_RAW"
        esc=$(escape_for_single_quote "$BINARY_RAW")
        EXEC_CMD="bash -lc '\$HOME${esc}'"
    elif [[ "$BINARY_RAW" == /* ]]; then
        CHECK_PATH="$BINARY_RAW"
        EXEC_CMD="$CHECK_PATH"
    else
        # command name or relative path
        if has_cmd readlink; then
            CHECK_PATH="$(readlink -f -- "$BINARY_RAW" 2>/dev/null || true)"
        fi
        if [ -z "$CHECK_PATH" ]; then
            CHECK_PATH="$(command -v "$BINARY_RAW" || true)"
            if [ -n "$CHECK_PATH" ]; then
                EXEC_CMD="$BINARY_RAW"
            else
                EXEC_CMD="$BINARY_RAW"
            fi
        else
            EXEC_CMD="$CHECK_PATH"
        fi
    fi
fi

if [ -n "$CHECK_PATH" ] && [ ! -x "$CHECK_PATH" ]; then
    warn "Binary not executable or not found at: $CHECK_PATH"
fi

log "Target (raw arg): $BINARY_RAW"
log "Check path: ${CHECK_PATH:-(not resolved)}"
log "Command registered with DE as: $EXEC_CMD"
log "Shortcut Name: $SHORTCUT_NAME"
log "Requested Keys: $KEY_GNOME / $KEY_XFCE / $KEY_KDE"

# ---------- GNOME-style ----------
setup_gnome_style() {
    local SCHEMA="org.gnome.settings-daemon.plugins.media-keys"
    local KEYNAME="custom-keybindings"
    local BASE_PATH="/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings"
    local ID="$(generate_id)"
    local CUSTOM_PATH="$BASE_PATH/spatialshot-$ID/"

    if ! has_cmd gsettings; then
        err "gsettings not found — cannot configure GNOME-style keybindings."
        return 1
    fi
    if ! gsettings list-schemas | grep -q "^$SCHEMA$"; then
        warn "GNOME schema $SCHEMA not found. This DE might not use gsettings."
        return 1
    fi

    log "Registering GNOME custom keybinding path: $CUSTOM_PATH"
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" name "$SHORTCUT_NAME" || { err "Failed to set name"; return 1; }
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" command "$EXEC_CMD" || { err "Failed to set command"; return 1; }
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" binding "$KEY_GNOME" || { err "Failed to set binding"; return 1; }

    local CURRENT_LIST
    CURRENT_LIST="$(gsettings get "$SCHEMA" "$KEYNAME")" || CURRENT_LIST="[]"

    if has_cmd python3; then
        NEW_LIST="$(python3 - "$CURRENT_LIST" "$CUSTOM_PATH" <<'PY'
import sys, ast
raw=sys.argv[1]
path=sys.argv[2]
try:
    arr=ast.literal_eval(raw)
except Exception:
    arr=[]
if path not in arr:
    arr.append(path)
print(repr(arr))
PY
)"
    else
        if [[ "$CURRENT_LIST" == *"$CUSTOM_PATH"* ]]; then
            NEW_LIST="$CURRENT_LIST"
        else
            if [[ "$CURRENT_LIST" == "@as []" || "$CURRENT_LIST" == "[]" ]]; then
                NEW_LIST="['$CUSTOM_PATH']"
            else
                NEW_LIST="$(echo "$CURRENT_LIST" | sed "s/]$/, '$CUSTOM_PATH']/")"
            fi
        fi
    fi

    gsettings set "$SCHEMA" "$KEYNAME" "$NEW_LIST" && ok "Appended/updated GNOME custom-keybindings." || warn "Failed to update GNOME custom-keybindings list."
    ok "GNOME-style shortcut configured: $KEY_GNOME -> $EXEC_CMD"
    return 0
}

# ---------- Cinnamon ----------
setup_cinnamon() {
    local SCHEMA="org.cinnamon.desktop.keybindings"
    local KEYNAME="custom-list"
    local REL_PATH="custom-keybindings/spatialshot-$1/"
    local CUSTOM_PATH="/org/cinnamon/desktop/keybindings/$REL_PATH"

    if ! has_cmd gsettings; then
        err "gsettings not found — cannot configure Cinnamon keybindings."
        return 1
    fi
    if ! gsettings list-schemas | grep -q "^$SCHEMA$"; then
        warn "Cinnamon schema $SCHEMA not present."
        return 1
    fi

    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" name "$SHORTCUT_NAME" || { err "Failed to set cinnamon name"; return 1; }
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" command "$EXEC_CMD" || { err "Failed to set cinnamon command"; return 1; }
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" binding "$KEY_GNOME" || { err "Failed to set cinnamon binding"; return 1; }

    local CURRENT_LIST
    CURRENT_LIST="$(gsettings get "$SCHEMA" "$KEYNAME")" || CURRENT_LIST="[]"

    if has_cmd python3; then
        NEW_LIST="$(python3 - "$CURRENT_LIST" "$REL_PATH" <<'PY'
import sys, ast
raw=sys.argv[1]
rel=sys.argv[2]
try:
    arr=ast.literal_eval(raw)
except Exception:
    arr=[]
if rel not in arr:
    arr.append(rel)
print(repr(arr))
PY
)"
    else
        if [[ "$CURRENT_LIST" == *"$REL_PATH"* ]]; then
            NEW_LIST="$CURRENT_LIST"
        else
            if [[ "$CURRENT_LIST" == "@as []" || "$CURRENT_LIST" == "[]" ]]; then
                NEW_LIST="['$REL_PATH']"
            else
                NEW_LIST="$(echo "$CURRENT_LIST" | sed "s/]$/, '$REL_PATH']/")"
            fi
        fi
    fi

    gsettings set "$SCHEMA" "$KEYNAME" "$NEW_LIST" && ok "Appended/updated Cinnamon custom-list." || warn "Failed to update Cinnamon custom-list."
    ok "Cinnamon shortcut configured."
    return 0
}

# ---------- MATE ----------
setup_mate() {
    local SCHEMA="org.mate.SettingsDaemon.plugins.media-keys"
    if ! has_cmd gsettings; then
        err "gsettings not found — cannot configure MATE-style keybindings."
        return 1
    fi
    if gsettings list-schemas | grep -q "^$SCHEMA$"; then
        setup_gnome_style
    else
        warn "MATE schema not found; skipping MATE automated setup."
        return 1
    fi
}

# ---------- XFCE ----------
setup_xfce() {
    if ! has_cmd xfconf-query; then
        err "xfconf-query not found — cannot set XFCE keybinding."
        return 1
    fi
    local prop="/commands/custom/$KEY_XFCE"
    if xfconf-query --channel xfce4-keyboard-shortcuts --property "$prop" --create --type string --set "$EXEC_CMD" 2>/dev/null; then
        ok "XFCE shortcut set ($KEY_XFCE -> $EXEC_CMD)."
    else
        if xfconf-query --channel xfce4-keyboard-shortcuts --property "$prop" --set "$EXEC_CMD" 2>/dev/null; then
            ok "XFCE shortcut updated."
        else
            warn "Failed to set XFCE shortcut via xfconf-query. You may need to run this while your XFCE session is active."
            return 1
        fi
    fi
    return 0
}

# ---------- KDE ----------
setup_kde() {
    local KCONF="$HOME/.config/khotkeysrc"
    if ! has_cmd kwriteconfig5 && ! has_cmd qdbus; then
        warn "Neither kwriteconfig5 nor qdbus found. Automated KDE configuration unavailable."
        echo ""
        echo "Manual KDE steps:"
        echo "1) System Settings -> Shortcuts -> Custom Shortcuts"
        echo "2) Add a new Global Shortcut -> Command/URL"
        echo "   Name: $SHORTCUT_NAME"
        echo "   Trigger: $KEY_KDE"
        echo "   Action: $EXEC_CMD"
        return 1
    fi

    if [ -f "$KCONF" ]; then
        local bk="$KCONF.bak.$(date +%s)"
        cp "$KCONF" "$bk"
        ok "Backed up existing KDE hotkeys file to $bk"
    fi

    cat >> "$KCONF" <<EOF

[Data/spatialshot-$(generate_id)]
Comment=$SHORTCUT_NAME
Name=$SHORTCUT_NAME
Type=Command Url
Action=Execute
Action/Command=$EXEC_CMD

[Options/spatialshot-$(generate_id)]
Trigger=Meta+Shift+A
EOF

    ok "Appended template entry to $KCONF (KDE). You may need to restart Plasma or reload shortcuts in System Settings."
    warn "KDE automation is best-effort — verify in System Settings -> Shortcuts -> Custom Shortcuts."
    return 0
}

manual_instructions() {
    echo ""
    log "Unable to automatically configure your desktop environment."
    echo "Manual instructions (generic):"
    echo "1) Open your DE's Keyboard/Shortcuts settings and create a new global shortcut:"
    echo "   Command: $EXEC_CMD"
    echo "   Keys:    Super+Shift+A (or pick your preferred combo)"
    echo ""
    log "If you'd like, re-run the script with a different key string as the second argument."
}

detect_desktop() {
    local detectors=(
        "${XDG_CURRENT_DESKTOP:-}"
        "${DESKTOP_SESSION:-}"
        "${GDMSESSION:-}"
        "${XDG_SESSION_DESKTOP:-}"
    )
    for v in "${detectors[@]}"; do
        if [ -n "${v:-}" ]; then
            echo "$v"
            return
        fi
    done
    if pgrep -x xfce4-session >/dev/null 2>&1; then echo "XFCE"; return; fi
    if pgrep -x cinnamon >/dev/null 2>&1; then echo "Cinnamon"; return; fi
    if pgrep -x gnome-shell >/dev/null 2>&1; then echo "GNOME"; return; fi
    if pgrep -x plasma-desktop >/dev/null 2>&1 || pgrep -x plasmashell >/dev/null 2>&1; then echo "KDE"; return; fi
    echo ""
}

DESKTOP_RAW="$(detect_desktop)"
DESKTOP="$(echo "$DESKTOP_RAW" | tr '[:upper:]' '[:lower:]' || true)"
log "Detected Desktop Environment: ${DESKTOP_RAW:-unknown}"

case "$DESKTOP" in
    *gnome*|*ubuntu*|*unity*|*budgie*)
        setup_gnome_style || warn "GNOME-style setup failed."
        ;;
    *cinnamon*)
        setup_cinnamon "$(generate_id)" || warn "Cinnamon setup failed."
        ;;
    *mate*)
        setup_mate || warn "MATE setup failed."
        ;;
    *xfce*)
        setup_xfce || warn "XFCE setup failed."
        ;;
    *kde*|*plasma*)
        setup_kde || warn "KDE best-effort setup attempted."
        ;;
    "")
        if has_cmd gsettings; then
            warn "DE not detected, but gsettings present — trying GNOME-style setup."
            setup_gnome_style || warn "GNOME-style failed."
        elif has_cmd xfconf-query; then
            warn "DE not detected, but xfconf-query present — trying XFCE setup."
            setup_xfce || warn "XFCE-style failed."
        else
            manual_instructions
        fi
        ;;
    *)
        warn "DE '$DESKTOP_RAW' not explicitly supported by automatic installer."
        manual_instructions
        ;;
esac

echo ""
ok "Setup process complete."
