#!/bin/bash

arg="$1"
shift

case "$arg" in
  grab-screen)
    tmp_dir="$HOME/Library/Caches/spatialshot/tmp"
    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"
    
    wrapper="$HOME/Library/Application Support/spatialshot/capkit/scgrabber"
    
    "$wrapper" "$@"
    
    count=$(find "$tmp_dir" -type f -name "*.png" | wc -l | tr -d ' ')
    
    echo "${count:-0}"
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
    echo "Invalid argument: $arg. Valid options: grab-screen, draw-view, spatialshot"
    exit 1
    ;;
esac
