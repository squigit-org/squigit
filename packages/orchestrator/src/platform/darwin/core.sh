#!/bin/bash

# All monitor counting and watching logic is REMOVED.

arg="$1"
shift

case "$arg" in
  grab-screen)
    tmp_dir="$HOME/Library/Caches/spatialshot/tmp"
    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"
    
    wrapper="$HOME/Library/Application Support/spatialshot/capkit/scgrabber"
    
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
    wrapper="$HOME/Library/Application Support/spatialshot/capkit/drawview"
    
    exec "$wrapper" "$@"
    ;;
  
  spatialshot)
    app="$HOME/Library/Application Support/spatialshot/app/spatialshot"
    
    exec "$app" "$@"
    ;;
  
  *)
    # Updated invalid options
    echo "Invalid argument: $arg. Valid options: grab-screen, draw-view, spatialshot"
    exit 1
    ;;
esac
