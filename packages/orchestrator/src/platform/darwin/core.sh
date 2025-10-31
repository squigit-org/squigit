#!/bin/bash

arg="$1"
shift

case "$arg" in
  grab-screen)
    tmp_dir="$HOME/Library/Caches/spatialshot/tmp"
    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"
    
    wrapper="$HOME/Library/Application Support/spatialshot/capkit/scgrabber"
    
    exec "$wrapper" "$@"
    ;;
  
  count-monitors)
    probe_system_profiler() {
        if ! command -v system_profiler >/dev/null 2>&1; then
            return 1
        fi
        
        count=$(system_profiler SPDisplaysDataType 2>/dev/null | grep -c "Display Type:")
        
        if [[ $count =~ ^[0-9]+$ ]] && [ "$count" -ge 1 ]; then
            echo "$count"
            return 0
        fi
        
        return 1
    }

    probe_system_profiler || echo 1
    ;;
  
  draw-view)
    wrapper="$HOME/Library/Application Support/spatialshot/capkit/drawview"
    
    exec "$wrapper" "$@"
    ;;
  
  spatialshot)
    app="$HOME/Library/Application Support/spatialshot/app/spatialshot"
    
    exec "$app" "$@"
    ;;
  
  *)
    echo "Invalid argument: $arg. Valid options: grab-screen, count-monitors, draw-view, spatialshot"
    exit 1
    ;;
esac