# -----------------------------------------------------------------------------
# BUILDER IMAGE (Used by CI/CD)
# -----------------------------------------------------------------------------
FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    python3 \
    python3-pip \
    libglib2.0-0 \
    libgl1-mesa-dev \
    libxkbcommon-x11-0 \
    libxcb-cursor0 \
    libxcb-keysyms1 \
    libxcb-image0 \
    libxcb-shm0 \
    libxcb-icccm4 \
    libxcb-sync1 \
    libxcb-xfixes0 \
    libxcb-shape0 \
    libxcb-randr0 \
    libxcb-render-util0 \
    libxcb-xinerama0 \
    libfontconfig1 \
    libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install aqtinstall && \
    aqt install-qt linux desktop 6.6.0 gcc_64 --outputdir /opt/qt

ENV PATH="/opt/qt/6.6.0/gcc_64/bin:${PATH}"
ENV Qt6_DIR="/opt/qt/6.6.0/gcc_64"
ENV QT_PLUGIN_PATH="/opt/qt/6.6.0/gcc_64/plugins"

WORKDIR /build
CMD ["/bin/bash"]