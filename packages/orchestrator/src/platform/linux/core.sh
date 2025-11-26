#!/bin/bash

arg="$1"
shift

case "$arg" in
  grab-screen)
    tmp_dir="${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/tmp"
    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"
    
    wrapper="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/capkit/scgrabber"
    
    "$wrapper" "$@"

    count=$(find "$tmp_dir" -type f -name "*.png" | wc -l | tr -d ' ')
    
    echo "${count:-0}"
    ;;
  
  draw-view)
    wrapper="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/capkit/drawview"
    
    exec "$wrapper" "$@"
    ;;
  
  spatialshot)
    app="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/app/spatialshot"
    
    exec "$app" --no-sandbox "$@"
    ;;
  
  *)
    echo "Invalid argument: $arg. Valid options: grab-screen, draw-view, spatialshot"
    exit 1
    ;;
esac
