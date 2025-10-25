#!/bin/bash
set -euo pipefail

# --- Configuration ---
savePath="${SC_SAVE_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/tmp}"
imageFormat="png"
# ---------------------

if [ -z "$savePath" ]; then
  echo "Error: savePath is empty." >&2
  exit 1
fi

if [[ "$savePath" == "/" || "$savePath" == "$HOME" ]]; then
    echo "Error: refusing to remove critical path: '$savePath'." >&2
    exit 1
fi

rm -rf -- "$savePath" && mkdir -p -- "$savePath" || {
  echo "Error: failed to (re)create save path '$savePath'." >&2
  exit 1
}

unixcaptool_fallback="${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/bin/unixcaptool"
if command -v unixcaptool &> /dev/null; then
    exec unixcaptool
elif [ -x "$unixcaptool_fallback" ]; then
    exec "$unixcaptool_fallback"
else
    echo "Error: unixcaptool not found in PATH or at '$unixcaptool_fallback'." >&2
    exit 1
fi
