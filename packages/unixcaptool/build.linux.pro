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

isEmpty(QT_INSTALL_DIR) {
    QT_PLUGIN_PATH = $$[QT_INSTALL_PLUGINS]
} else {
    QT_PLUGIN_PATH = $${QT_INSTALL_DIR}/plugins
}

LIBS += $${QT_PLUGIN_PATH}/platforms/libqxcb.a
LIBS += $${QT_PLUGIN_PATH}/platforms/libqwayland-generic.a
LIBS += $${QT_PLUGIN_PATH}/platforms/libqwayland-egl.a
LIBS += $${QT_PLUGIN_PATH}/wayland-shell-integration/libxdg-shell.a
LIBS += $${QT_PLUGIN_PATH}/imageformats/libqpng.a

CONFIG += link_pkgconfig
PKGCONFIG += xcb xcb-glx xcb-image xcb-icccm xcb-sync xcb-xfixes
PKGCONFIG += xcb-shape xcb-randr xcb-render xcb-shm xcb-keysyms
PKGCONFIG += xcb-xinerama xcb-xkb xkbcommon xkbcommon-x11
PKGCONFIG += fontconfig freetype2
PKGCONFIG += wayland-client wayland-cursor wayland-egl
PKGCONFIG += dbus-1 glib-2.0 egl
