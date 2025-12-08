#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

ACTION="${1:-install}"
shift || true

BINARY_PATH="${1:-}"
USER_KEYS="${2:-}"
APP_NAME="${3:-Spatialshot}"
UNIQUE_ID="spatialshot-binding"
WRAPPER_NAME="${UNIQUE_ID}.sh"

KEY_GNOME="${USER_KEYS:-<Super><Shift>A}"
KEY_KDE="${USER_KEYS:-Meta+Shift+A}"
KEY_XFCE="${USER_KEYS:-<Super><Shift>a}"

DRY_RUN=false
VERBOSE=true

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --quiet)   VERBOSE=false ;;
    esac
done

C_BLUE="\033[0;34m"; C_GREEN="\033[0;32m"; C_YELLOW="\033[1;33m"; C_RED="\033[0;31m"; C_RESET="\033[0m"


log()   { [ "$VERBOSE" = true ] && echo -e "${C_BLUE}[INFO]${C_RESET}  $*"; }
ok()    { echo -e "${C_GREEN}[OK]${C_RESET}    $*"; }
warn()  { echo -e "${C_YELLOW}[WARN]${C_RESET}  $*"; }
err()   { echo -e "${C_RED}[ERR]${C_RESET}   $*"; }
dryrun_log() { echo -e "DRY-RUN: $*"; }

has_cmd() { command -v "$1" &>/dev/null; }

run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        dryrun_log "Would execute: $*"
        return 0
    fi
    "$@" || return 1
}

generate_uuid() {
    if has_cmd uuidgen; then
        uuidgen
    else
        cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N | sha1sum | cut -c1-36
    fi
}

setup_wrapper() {
    local absolute_bin_path="$1"
    local bin_dir="$HOME/.local/bin"
    local wrapper_path="$bin_dir/$WRAPPER_NAME"

    if [ "$ACTION" == "uninstall" ]; then
        [ -f "$wrapper_path" ] && run_cmd rm "$wrapper_path"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        dryrun_log "Would create wrapper at $wrapper_path pointing to $absolute_bin_path"
        echo "$wrapper_path"
        return 0
    fi

    mkdir -p "$bin_dir"
    
    cat > "$wrapper_path" <<EOF
#!/usr/bin/env bash
nohup "$absolute_bin_path" >/dev/null 2>&1 &
disown
EOF
    
    chmod +x "$wrapper_path"
    echo "$wrapper_path"
}

setup_gsettings() {
    local schema="$1" list_key="$2" path_prefix="$3" env_name="$4" wrapper_path="$5"
    
    if ! has_cmd gsettings; then warn "gsettings not found, skipping $env_name"; return 1; fi
    
    local custom_path="${path_prefix}${UNIQUE_ID}/"
    local current_list
    current_list="$(gsettings get "$schema" "$list_key" 2>/dev/null || echo "[]")"

    if [[ "$ACTION" == "uninstall" ]]; then
        if [[ "$current_list" != *"$custom_path"* ]]; then return 0; fi
        
        log "Removing from $env_name configuration..."
        local new_list
        if has_cmd python3; then
            new_list="$(python3 -c "import sys, ast; l=ast.literal_eval(sys.argv[1]); l.remove(sys.argv[2]) if sys.argv[2] in l else None; print(str(l))" "$current_list" "$custom_path")"
        else
            new_list="$(echo "$current_list" | sed -E "s/,? '$custom_path'//; s/'$custom_path',? //")"
        fi
        
        run_cmd gsettings set "$schema" "$list_key" "$new_list"
        run_cmd gsettings reset-recursively "$schema.custom-keybinding:$custom_path" || true
        ok "$env_name binding removed."
        return 0
    fi

    run_cmd gsettings set "$schema.custom-keybinding:$custom_path" name "$APP_NAME"
    run_cmd gsettings set "$schema.custom-keybinding:$custom_path" command "$wrapper_path"
    run_cmd gsettings set "$schema.custom-keybinding:$custom_path" binding "$KEY_GNOME"

    if [[ "$current_list" == *"$custom_path"* ]]; then
        ok "$env_name binding updated."
        return 0
    fi

    log "Registering in $env_name keybinding list..."
    local new_list
    if has_cmd python3; then
        new_list="$(python3 -c "import sys, ast; l=ast.literal_eval(sys.argv[1]); l.append(sys.argv[2]) if sys.argv[2] not in l else None; print(str(l))" "$current_list" "$custom_path")"
    else
        if [[ "$current_list" == "@as []" || "$current_list" == "[]" ]]; then new_list="['$custom_path']"; else new_list="${current_list%]}, '$custom_path']"; fi
    fi
    
    run_cmd gsettings set "$schema" "$list_key" "$new_list"
    ok "$env_name binding registered."
}

setup_kde() {
    local wrapper_path="$1"
    local khotkeys_file="$HOME/.config/khotkeysrc"
    
    if [[ "$ACTION" == "uninstall" ]]; then
        warn "KDE Uninstall: Please manually remove '$APP_NAME' from System Settings -> Shortcuts -> Custom Shortcuts."
        return 0
    fi

    if [ "$DRY_RUN" = false ] && [ -f "$khotkeys_file" ]; then
        cp "$khotkeys_file" "$khotkeys_file.bak.$(date +%s)"
    fi

    local import_file="/tmp/${UNIQUE_ID}.khotkeys"
    local uuid
    uuid="$(generate_uuid)"

    cat > "$import_file" <<EOF
[Data]
DataCount=1
[Data_1]
Comment=$APP_NAME
Enabled=true
Name=$APP_NAME
Type=SIMPLE_ACTION_DATA
[Data_1Actions]
ActionsCount=1
[Data_1Actions0]
CommandURL=$wrapper_path
Type=COMMAND_URL
[Data_1Triggers]
TriggersCount=1
[Data_1Triggers0]
Key=$KEY_KDE
Type=SHORTCUT
Uuid={$uuid}
EOF

    if [ "$DRY_RUN" = true ]; then
        dryrun_log "Would generate KDE import file at $import_file"
        return 0
    fi

    if has_cmd qdbus; then
        if qdbus org.kde.kded5 /modules/khotkeys org.kde.khotkeys.import_shortcuts_list "$import_file" 2>/dev/null; then
            ok "KDE: Imported via kded5."
        elif qdbus org.kde.kglobalaccel /kglobalaccel org.kde.kglobalaccel.Component.importLegacyShortcuts "$import_file" 2>/dev/null; then
            ok "KDE: Imported via kglobalaccel."
        else
             warn "KDE DBus import failed. Import this file manually in System Settings: $import_file"
        fi
    else
        warn "qdbus not found. Import this file manually in System Settings: $import_file"
    fi
}

setup_xfce() {
    local wrapper_path="$1"
    if ! has_cmd xfconf-query; then return 1; fi

    local channel="xfce4-keyboard-shortcuts"
    local prop="/commands/custom/$KEY_XFCE"

    if [[ "$ACTION" == "uninstall" ]]; then
        run_cmd xfconf-query --channel "$channel" --property "$prop" --reset
        ok "XFCE binding removed."
        return 0
    fi
    
    local existing
    existing="$(xfconf-query --channel "$channel" --property "$prop" 2>/dev/null || true)"
    if [ -n "$existing" ] && [ "$existing" != "$wrapper_path" ]; then
         warn "Overwriting XFCE key $KEY_XFCE (was: $existing)"
    fi

    run_cmd xfconf-query --channel "$channel" --property "$prop" --create --type string --set "$wrapper_path"
    ok "XFCE binding set."
}

setup_xbindkeys() {
    local wrapper_path="$1"
    if [[ "${XDG_SESSION_TYPE:-}" == "wayland" ]]; then return 1; fi
    if ! has_cmd xbindkeys; then return 1; fi

    local cfg="$HOME/.xbindkeysrc"
    local marker=

    if [[ "$ACTION" == "uninstall" ]]; then
        if [ -f "$cfg" ]; then
            run_cmd sed -i -e "/${marker}/,+2d" "$cfg"
            run_cmd pkill -HUP xbindkeys || true
            ok "xbindkeys binding removed."
        fi
        return 0
    fi

    if [ -f "$cfg" ] && grep -qF "$marker" "$cfg"; then
        ok "xbindkeys already configured."
        return 0
    fi

    run_cmd printf "\n%s\n\"%s\"\n    %s\n" "$marker" "$wrapper_path" "$KEY_XFCE" >> "$cfg"
    
    if pgrep -x xbindkeys >/dev/null; then
        run_cmd pkill -HUP xbindkeys
    else
        run_cmd xbindkeys
    fi
    ok "xbindkeys fallback configured."
}

if [[ "$ACTION" == "install" && -z "$BINARY_PATH" ]]; then
    err "Usage: $0 install <binary> [keys] [name]"
    exit 1
fi

ABS_PATH=""
WRAPPER_CMD=""

if [[ "$ACTION" == "install" ]]; then
    if [[ "$BINARY_PATH" != /* ]]; then
        ABS_PATH="$(readlink -f "$BINARY_PATH" 2>/dev/null || echo "$PWD/$BINARY_PATH")"
    else
        ABS_PATH="$BINARY_PATH"
    fi
    
    if [ ! -x "$ABS_PATH" ]; then
        log "Making binary executable..."
        run_cmd chmod +x "$ABS_PATH"
    fi

    WRAPPER_CMD="$(setup_wrapper "$ABS_PATH")"
fi

if [[ "$ACTION" == "uninstall" ]]; then
    setup_wrapper "dummy"
fi

setup_desktop_file() {
    local desktop_dir="$HOME/.local/share/applications"
    local desktop_file="${desktop_dir}/${UNIQUE_ID}.desktop"

    if [[ "$ACTION" == "uninstall" ]]; then
        [ -f "$desktop_file" ] && run_cmd rm "$desktop_file"
        ok ".desktop file removed."
        return 0
    fi

    mkdir -p "$desktop_dir"
    cat > "$desktop_file" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Exec=$WRAPPER_CMD
Terminal=false
NoDisplay=true
Icon=utilities-terminal
EOF
    run_cmd chmod +x "$desktop_file"
    run_cmd update-desktop-database "$desktop_dir" 2>/dev/null || true
    ok ".desktop file created."
}

setup_desktop_file

DE="${XDG_CURRENT_DESKTOP:-${DESKTOP_SESSION:-}}"
DE="${DE,,}"
log "Detected Desktop Environment: $DE"

case "$DE" in
    *gnome*|*ubuntu*|*unity*|*budgie*) 
        setup_gsettings "org.gnome.settings-daemon.plugins.media-keys" "custom-keybindings" "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/" "GNOME" "$WRAPPER_CMD" || setup_xbindkeys "$WRAPPER_CMD"
        ;;
    *cinnamon*) 
        setup_gsettings "org.cinnamon.desktop.keybindings" "custom-list" "custom-keybindings/" "Cinnamon" "$WRAPPER_CMD" || setup_xbindkeys "$WRAPPER_CMD"
        ;;
    *mate*) 
        setup_gsettings "org.mate.settings-daemon.plugins.media-keys" "custom-keybindings" "/org/mate/settings-daemon/plugins/media-keys/custom-keybindings/" "MATE" "$WRAPPER_CMD" || setup_xbindkeys "$WRAPPER_CMD"
        ;;
    *xfce*) 
        setup_xfce "$WRAPPER_CMD" || setup_xbindkeys "$WRAPPER_CMD"
        ;;
    *kde*|*plasma*) 
        setup_kde "$WRAPPER_CMD" || setup_xbindkeys "$WRAPPER_CMD"
        ;;
    *) 
        warn "Unsupported DE. Attempting xbindkeys fallback..."
        setup_xbindkeys "$WRAPPER_CMD" || err "Could not set hotkey."
        ;;
esac

if [[ "$ACTION" == "install" ]]; then
    if command -v notify-send >/dev/null; then
        notify-send -i "utilities-terminal" "$APP_NAME" "Shortcut installed successfully."
    fi
    ok "Script finished successfully."
fi
