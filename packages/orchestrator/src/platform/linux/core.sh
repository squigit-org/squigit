#!/bin/bash

# All monitor counting and watching logic is REMOVED.

arg="$1"
shift

case "$arg" in
  grab-screen)
    tmp_dir="${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/tmp"
    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"
    
    wrapper="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/capkit/scgrabber"
    
    # Run the wrapper and wait for it to complete
    # DO NOT use 'exec', as we need to run commands after it finishes.
    "$wrapper" "$@"

    # After wrapper finishes, count the .png files it created
    # Use 'find' and 'wc' for a reliable count.
    count=$(find "$tmp_dir" -type f -name "*.png" | wc -l | tr -d ' ')
    
    # Print *only* the count for Rust to capture
    echo "${count:-0}"
    ;;
  
  # count-monitors REMOVED
  
  # watch-monitors REMOVED
  
  draw-view)
    wrapper="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/capkit/drawview"
    
    exec "$wrapper" "$@"
    ;;
  
  spatialshot)
    app="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/app/spatialshot"
    
    exec "$app" "$@"
    ;;
  
  *)
    # Updated invalid options
    echo "Invalid argument: $arg. Valid options: grab-screen, draw-view, spatialshot"
    exit 1
    ;;
esac
