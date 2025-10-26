TARGET = squiggle
TEMPLATE = app

CONFIG += c++17

#
# --- THIS IS THE FIX ---
#
# Tell qmake to NOT auto-generate a plugin manifest.
# The "smart" auto-generation is broken for this static build
# and adds object files (.o) to the linker command that do not exist.
#
CONFIG += no_plugin_manifest

QT += core gui widgets

#
# Now that we've disabled the broken auto-plugin feature,
# we must MANUALLY add all the plugins we need.
#
QTPLUGIN += qpng

win32 {
    LIBS += -ldwmapi
    QTPLUGIN += qwindows
}

macx {
    LIBS += -framework Cocoa
    
    # Force Objective-C++ compilation for all files
    QMAKE_CXXFLAGS += -x objective-c++
    
    # Manually add the macOS platform plugin
    QTPLUGIN += qcocoa

    #
    # --- THIS IS THE REAL FIX ---
    # The static qmake build is broken and adds a list of
    # non-existent resource object (.o) files to the linker.
    # This line manually clears that broken list.
    #
    QMAKE_LIBS_RESOURCES = 
}

linux {
    # Manually add the Linux platform plugin
    QTPLUGIN += qxcb
}
# -----------------------------

SOURCES += \
    src/main.cpp \
    src/MainWindow.cpp

HEADERS += \
    src/MainWindow.h

