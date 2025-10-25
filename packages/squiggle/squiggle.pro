TARGET = squiggle
TEMPLATE = app

# Use C++17
CONFIG += c++17

QT += core gui widgets

# --- FIX FOR MACOS BUILD ---
# Check if we are building on macOS
macx {
    # On macOS, MainWindow.cpp includes Cocoa.h, so it must be compiled
    # as Objective-C++. Using OBJECTIVE_SOURCES tells qmake to do this.
    OBJECTIVE_SOURCES += src/MainWindow.cpp
    
    # Link the Cocoa framework
    LIBS += -framework Cocoa
} else {
    # On all other platforms (Linux, Windows),
    # compile it as a normal C++ file.
    SOURCES += src/MainWindow.cpp
}
# -------------------------

# Add all other source files here
SOURCES += \
    src/main.cpp

HEADERS += \
    src/MainWindow.h

# Windows-specific libraries
win32 {
    LIBS += -ldwmapi
}

