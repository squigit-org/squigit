TARGET = squiggle
TEMPLATE = app

# Use C++17 and configure for a static build
CONFIG += c++17 static

QT += core gui widgets

# --- Statically Link Plugins ---
# We need the PNG image format plugin on all platforms
QTPLUGIN += qpng

# Platform-specific plugins and settings
win32 {
    LIBS += -ldwmapi
    QTPLUGIN += qwindows
}

macx {
    LIBS += -framework Cocoa
    
    # Force Objective-C++ compilation for all files
    # This fixes the Cocoa.h compilation errors
    QMAKE_CXXFLAGS += -x objective-c++
    
    # macOS platform plugin
    QTPLUGIN += qcocoa
}

linux {
    # Linux platform plugin
    QTPLUGIN += qxcb
}
# -----------------------------

SOURCES += \
    src/main.cpp \
    src/MainWindow.cpp

HEADERS += \
    src/MainWindow.h

