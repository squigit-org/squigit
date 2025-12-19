#!/bin/bash
set -e

OS=$(uname)
if [ "$OS" != "Linux" ]; then
    echo "Error: This script must be run on Linux."
    exit 1
fi

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DIST_DIR="$DIR/dist"

if [ ! -d "$DIST_DIR" ]; then
    echo "Error: 'dist' directory not found."
    echo "Please run './PKGBUILD' (or use the Docker builder) first."
    exit 1
fi

echo "--- Building Runtime Docker Image (Dockerfile.test) ---"
sudo docker build -f "$DIR/Dockerfile.test" -t capture-test "$DIR"
echo "--- Docker build finished ---"

echo "--- Authorizing X11 Access ---"
xhost +SI:localuser:root

echo "--- Running Capture (Watch your screen!) ---"
echo "Note: If successful, the screen will freeze. Draw a rect to exit."

sudo docker run --rm --net=host \
    -e DISPLAY="$DISPLAY" \
    -v /tmp/.X11-unix:/tmp/.X11-unix:ro \
    capture-test

xhost -SI:localuser:root
echo "--- Smoketest Finished ---"
exit 0