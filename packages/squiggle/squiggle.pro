TARGET = squiggle
TEMPLATE = app

CONFIG += c++17

QT += core gui widgets

# --- Statically Link Plugins ---
# We need the PNG image format plugin on all platforms.
# qmake will automatically add the correct platform plugin (qxcb, qcocoa, qwindows).
QTPLUGIN += qpng

# Platform-specific settings
win32 {
    LIBS += -ldwmapi
    # Platform plugin is added automatically
}

macx {
    LIBS += -framework Cocoa
    
    # Force Objective-C++ compilation for all files
    QMAKE_CXXFLAGS += -x objective-c++
    
    # Platform plugin is added automatically
}

linux {
    # Platform plugin is added automatically
}
# -----------------------------

SOURCES += \
    src/main.cpp \
    src/MainWindow.cpp

HEADERS += \
    src/MainWindow.h

