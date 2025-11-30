#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# The Main Go program now passes the wrapper path here. 
# Example: /home/user/.local/bin/spatialshot
BINARY_PATH="${1:-}"
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

if [ -z "$BINARY_PATH" ]; then
    err "No binary path provided."
    exit 1
fi

# We use the provided path exactly. It should be the absolute path to the wrapper.
FULL_BIN_PATH="$BINARY_PATH"

log "Configuring Hotkey..."
log "Target Command: $FULL_BIN_PATH"
log "Keys: $KEY_GNOME"

has_cmd() { command -v "$1" &>/dev/null; }

generate_id() {
    if has_cmd uuidgen; then
        uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1
    else
        date +%s%N | sha1sum | cut -c1-8
    fi
}

# ---------------------------
# GNOME / Unity / Budgie / Mutter (gsettings)
# ---------------------------
setup_gnome_style() {
    local SCHEMA="org.gnome.settings-daemon.plugins.media-keys"
    local KEYNAME="custom-keybindings"
    local BASE_PATH="/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings"
    local ID="$(generate_id)"
    local CUSTOM_PATH="$BASE_PATH/spatialshot-$ID/"

    if ! has_cmd gsettings; then return 1; fi
    if ! gsettings list-schemas | grep -q "^$SCHEMA$"; then return 1; fi

    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" name "$SHORTCUT_NAME" || return 1
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" command "$FULL_BIN_PATH" || return 1
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" binding "$KEY_GNOME" || return 1

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

    gsettings set "$SCHEMA" "$KEYNAME" "$NEW_LIST"
    ok "GNOME shortcut set."
    return 0
}

# ---------------------------
# Cinnamon
# ---------------------------
setup_cinnamon() {
    local SCHEMA="org.cinnamon.desktop.keybindings"
    local KEYNAME="custom-list"
    local REL_PATH="custom-keybindings/spatialshot-$1/"
    local CUSTOM_PATH="/org/cinnamon/desktop/keybindings/$REL_PATH"

    if ! has_cmd gsettings; then return 1; fi
    if ! gsettings list-schemas | grep -q "^$SCHEMA$"; then return 1; fi

    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" name "$SHORTCUT_NAME" || return 1
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" command "$FULL_BIN_PATH" || return 1
    gsettings set "$SCHEMA.custom-keybinding:$CUSTOM_PATH" binding "$KEY_GNOME" || return 1

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

    gsettings set "$SCHEMA" "$KEYNAME" "$NEW_LIST"
    ok "Cinnamon shortcut set."
    return 0
}

# ---------------------------
# XFCE
# ---------------------------
setup_xfce() {
    if ! has_cmd xfconf-query; then return 1; fi

    local prop="/commands/custom/$KEY_XFCE"
    # Try create
    xfconf-query --channel xfce4-keyboard-shortcuts --property "$prop" --create --type string --set "$FULL_BIN_PATH" 2>/dev/null && { ok "XFCE shortcut set."; return 0; }
    # Try update
    xfconf-query --channel xfce4-keyboard-shortcuts --property "$prop" --set "$FULL_BIN_PATH" 2>/dev/null && { ok "XFCE shortcut updated."; return 0; }
    
    return 1
}

# ---------------------------
# KDE
# ---------------------------
setup_kde() {
    local KCONF="$HOME/.config/khotkeysrc"
    if ! has_cmd kwriteconfig5 && ! has_cmd qdbus; then return 1; fi

    if [ -f "$KCONF" ]; then
        cp "$KCONF" "$KCONF.bak.$(date +%s)"
    fi

    cat >> "$KCONF" <<EOF

[Data/spatialshot-$(generate_id)]
Comment=$SHORTCUT_NAME
Name=$SHORTCUT_NAME
Type=Command Url
Action=Execute
Action/Command=$FULL_BIN_PATH

[Options/spatialshot-$(generate_id)]
Trigger=Meta+Shift+A
EOF
    ok "KDE shortcut appended to configuration."
    return 0
}

# ---------------------------
# Detection & Exec
# ---------------------------
detect_desktop() {
    local detectors=("$XDG_CURRENT_DESKTOP" "$DESKTOP_SESSION" "$GDMSESSION" "$XDG_SESSION_DESKTOP")
    for v in "${detectors[@]}"; do
        if [ -n "${v:-}" ]; then echo "$v"; return; fi
    done
    if pgrep -x xfce4-session >/dev/null 2>&1; then echo "XFCE"; return; fi
    if pgrep -x cinnamon >/dev/null 2>&1; then echo "Cinnamon"; return; fi
    if pgrep -x gnome-shell >/dev/null 2>&1; then echo "GNOME"; return; fi
    if pgrep -x plasma-desktop >/dev/null 2>&1; then echo "KDE"; return; fi
}

DESKTOP_RAW="$(detect_desktop)"
DESKTOP="$(echo "$DESKTOP_RAW" | tr '[:upper:]' '[:lower:]' || true)"

case "$DESKTOP" in
    *gnome*|*ubuntu*|*unity*|*budgie*) setup_gnome_style || exit 1 ;;
    *cinnamon*) setup_cinnamon "$(generate_id)" || exit 1 ;;
    *mate*) setup_gnome_style || exit 1 ;; # Mate often uses gnome schema
    *xfce*) setup_xfce || exit 1 ;;
    *kde*|*plasma*) setup_kde || exit 1 ;;
    *) 
        if has_cmd gsettings; then setup_gnome_style
        elif has_cmd xfconf-query; then setup_xfce
        else exit 1
        fi
        ;;
esac
