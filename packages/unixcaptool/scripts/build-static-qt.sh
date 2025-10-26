#!/bin/bash

set -e

QT_VERSION=6.2.4
QT_ARCHIVE=qt-everywhere-src-${QT_VERSION}.tar.xz
QT_SRC_DIR=qt-everywhere-src-${QT_VERSION}
INSTALL_DIR=$(pwd)/build/.qt

# Get number of cores
if [[ "$(uname)" == "Darwin" ]]; then
    NUM_CORES=$(sysctl -n hw.ncpu)
else
    NUM_CORES=$(nproc)
fi

# Download Qt source code
if [ ! -f "${QT_ARCHIVE}" ]; then
    wget https://download.qt.io/archive/qt/6.2/${QT_VERSION}/single/${QT_ARCHIVE}
fi

# Extract source code
if [ ! -d "${QT_SRC_DIR}" ]; then
    tar -xf ${QT_ARCHIVE}
fi

# Configure Qt for static build
cd ${QT_SRC_DIR}

./configure -static -release -opensource -confirm-license \
    -prefix ${INSTALL_DIR} \
    -nomake examples -nomake tests \
    -skip qtwayland -skip qtwebengine -skip qtquick3d -skip qtlottie -skip qt3d -skip qtdeclarative \
    -no-feature-webengine \
    -no-icu

# Build and install Qt
make -j${NUM_CORES}
make install

cd ..