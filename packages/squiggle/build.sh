#!/bin/bash
set -eo pipefail

# Default variables
BUILD_TYPE="Release"
GENERATOR="Ninja"
TARGET_DIR="dist"

# Platform-specific configuration
if [[ "$(uname)" == "Darwin" ]]; then
    # macOS (dynamic build for debugging)
    echo "Configuring for macOS (dynamic build)"
    if ! command -v brew &> /dev/null; then
        echo "Homebrew not found. Please install Homebrew."
        exit 1
    fi
    if ! brew ls --versions qt6 &> /dev/null; then
        echo "Qt6 not found. Please install it via 'brew install qt6'."
        exit 1
    fi
    QT_PATH=$(brew --prefix qt6)
    CMAKE_ARGS=(
        "-DCMAKE_BUILD_TYPE=${BUILD_TYPE}"
        "-G" "${GENERATOR}"
        "-CMAKE_PREFIX_PATH=${QT_PATH}"
        "-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64"
    )
elif [[ "$(uname)" == "Linux" ]]; then
    # Linux (dynamic build for debugging)
    echo "Configuring for Linux (dynamic build)"
    if ! pkg-config --modversion Qt6Widgets &> /dev/null; then
        echo "Qt6 not found. Please install it via 'sudo apt install qt6-base-dev'."
        exit 1
    fi
    QT_PATH=$(pkg-config --variable=prefix Qt6Widgets)
    CMAKE_ARGS=(
        "-DCMAKE_BUILD_TYPE=${BUILD_TYPE}"
        "-G" "${GENERATOR}"
        "-CMAKE_PREFIX_PATH=${QT_PATH}"
    )
else
    echo "Unsupported platform: $(uname). Use GitHub Actions for Windows static builds."
    exit 1
fi

# Build the project
rm -rf build "${TARGET_DIR}"
cmake -B build -S . "${CMAKE_ARGS[@]}"
cmake --build build
cmake --install build --prefix "${TARGET_DIR}"

echo "Dynamic build finished. Binary is in '${TARGET_DIR}/bin/squiggle'."
