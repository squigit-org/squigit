QT += core gui dbus
CONFIG += c++17 console
TARGET = unixcaptool
SOURCES += src/main.cpp \
    src/shell.cpp \
    src/audiomanager.cpp \
    src/utils.cpp \
    src/receiver.cpp \
    src/linuxplugins.cpp
HEADERS += src/shell.h \
    src/audiomanager.h \
    src/utils.h \
    src/receiver.h
LIBS += $$[QT_INSTALL_PLUGINS]/platforms/libqxcb.a \
        $$[QT_INSTALL_PLUGINS]/platforms/libqwayland-generic.a \
        $$[QT_INSTALL_PLUGINS]/platforms/libqwayland-egl.a \
        $$[QT_INSTALL_PLUGINS]/wayland-shell-integration/libxdg-shell.a \
        $$[QT_INSTALL_PLUGINS]/imageformats/libqpng.a

LIBS += -lwayland-client -lwayland-cursor -lwayland-egl
