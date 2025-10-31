#!/bin/bash

arg="$1"
shift

case "$arg" in
  grab-screen)
    tmp_dir="${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/tmp"
    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"
    
    wrapper="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/capkit/scgrabber"
    
    exec "$wrapper" "$@"
    ;;
  
  count-monitors)
    is_cmd() {
        command -v "$1" >/dev/null 2>&1
    }

    probe_xrandr_listmonitors() {
        if ! is_cmd xrandr; then return 1; fi

        if output=$(xrandr --listmonitors 2>/dev/null); then
            first_line=$(echo "$output" | head -n 1)
            if [[ $first_line == *"Monitors:"* ]]; then
                count=$(echo "$first_line" | awk '{print $2}')
                if [[ $count =~ ^[0-9]+$ ]] && [ "$count" -ge 1 ]; then
                    echo "$count"
                    return 0
                fi
            fi
        fi
        return 1
    }

    probe_xrandr_grep() {
        if ! is_cmd xrandr; then return 1; fi

        if count=$(xrandr 2>/dev/null | grep -c " connected [0-9]"); then
            if [ "$count" -ge 1 ]; then
                echo "$count"
                return 0
            fi
        fi
        return 1
    }

    probe_swaymsg() {
        if ! is_cmd swaymsg; then return 1; fi

        if count=$(swaymsg -t get_outputs 2>/dev/null | grep -c '"active": true'); then
            if [ "$count" -ge 1 ]; then
                echo "$count"
                return 0
            fi
        fi
        return 1
    }

    probe_kscreen() {
        if ! is_cmd kscreen-doctor; then return 1; fi

        if count=$(kscreen-doctor -o 2>/dev/null | grep -c 'Enabled: yes'); then
            if [ "$count" -ge 1 ]; then
                echo "$count"
                return 0
            fi
        fi
        return 1
    }

    probe_wlr_randr() {
        if ! is_cmd wlr-randr; then return 1; fi

        if count=$(wlr-randr 2>/dev/null | grep -c 'Enabled: yes'); then
            if [ "$count" -ge 1 ]; then
                echo "$count"
                return 0
            fi
        fi
        return 1
    }

    probe_drm_sysfs() {
        count=0
        for status_file in /sys/class/drm/*/status; do
            if [ -f "$status_file" ]; then
                status=$(cat "$status_file" 2>/dev/null | tr -d '[:space:]')
                if [ "$status" = "connected" ]; then
                    count=$((count + 1))
                fi
            fi
        done
        if [ "$count" -ge 1 ]; then
            echo "$count"
            return 0
        fi
        return 1
    }

    main() {
        if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
            probe_swaymsg && return
            probe_kscreen && return
            probe_wlr_randr && return
        fi

        if [ -n "$DISPLAY" ]; then
             probe_xrandr_listmonitors && return
             probe_xrandr_grep && return
        fi
        
        probe_drm_sysfs && return

        echo 1
    }

    main
    ;;
  
  draw-view)
    wrapper="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/capkit/drawview"
    
    exec "$wrapper" "$@"
    ;;
  
  spatialshot)
    app="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/app/spatialshot"
    
    exec "$app" "$@"
    ;;
  
  *)
    echo "Invalid argument: $arg. Valid options: grab-screen, count-monitors, draw-view, spatialshot"
    exit 1
    ;;
esac