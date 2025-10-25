TARGET = squiggle
TEMPLATE = app

CONFIG += c++17

QT += core gui widgets

macx {
    OBJECTIVE_SOURCES += src/MainWindow.cpp
    
    LIBS += -framework Cocoa
} else {
    SOURCES += src/MainWindow.cpp
}

SOURCES += \
    src/main.cpp

HEADERS += \
    src/MainWindow.h

win32 {
    LIBS += -ldwmapi
}
