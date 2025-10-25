TARGET = squiggle
TEMPLATE = app

# Use C++17
CONFIG += c++17

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
    
    # --- NEW FIX ---
    # Force all C++ compilation to go through the
    # Objective-C++ compiler by adding the '-x objective-c++' flag.
    # This is required because a Qt header in MainWindow.h (like QScreen)
    # includes Cocoa.h, which "taints" any .cpp file that includes it.
    QMAKE_CXXFLAGS += -x objective-c++
}

