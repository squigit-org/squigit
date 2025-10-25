QT += core gui
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

isEmpty(QT_INSTALL_DIR) {
    QT_PLUGIN_PATH = $$[QT_INSTALL_PLUGINS]
} else {
    QT_PLUGIN_PATH = $${QT_INSTALL_DIR}/plugins
}

LIBS += $${QT_PLUGIN_PATH}/platforms/libqcocoa.a
LIBS += $${QT_PLUGIN_PATH}/imageformats/libqpng.a

LIBS += -framework Cocoa -framework Carbon -framework IOKit
LIBS += -framework OpenGL -framework Metal
