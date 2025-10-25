QT += core gui dbus
CONFIG += c++17 console
CONFIG -= app_bundle
TARGET = unixcaptool
SOURCES += src/main.cpp \
    src/shell.cpp \
    src/audiomanager.cpp \
    src/utils.cpp \
    src/receiver.cpp \
    src/darwinplugins.cpp
HEADERS += src/shell.h \
    src/audiomanager.h \
    src/utils.h \
    src/receiver.h

LIBS += $$[QT_INSTALL_PLUGINS]/platforms/libqcocoa.a
LIBS += $$[QT_INSTALL_PLUGINS]/imageformats/libqpng.a
