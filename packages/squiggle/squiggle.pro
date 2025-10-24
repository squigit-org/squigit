TARGET = squiggle
TEMPLATE = app

CONFIG += c++11

QT += core gui widgets

SOURCES += \
    src/main.cpp \
    src/MainWindow.cpp

HEADERS += \
    src/MainWindow.h

win32 {
    LIBS += -ldwmapi
}

macx {
    LIBS += -framework Cocoa
}
