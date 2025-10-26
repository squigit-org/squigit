TARGET = squiggle
TEMPLATE = app

CONFIG += c++17
CONFIG += no_plugin_manifest

QT += core gui widgets
QTPLUGIN += qpng

win32 {
    LIBS += -ldwmapi
    QTPLUGIN += qwindows
}

macx {
    LIBS += -framework Cocoa
    QMAKE_CXXFLAGS += -x objective-c++
    QTPLUGIN += qcocoa
    QMAKE_LIBS_RESOURCES = 
}

linux {
    QMAKE_LFLAGS += -static -static-libgcc -static-libstdc++
    QTPLUGIN += qxcb  
}

SOURCES += \
    src/main.cpp \
    src/MainWindow.cpp

HEADERS += \
    src/MainWindow.h
