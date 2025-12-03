cmake_minimum_required(VERSION 3.16)

if(APPLE)
    project(CAPKIT LANGUAGES CXX OBJCXX)
else()
    project(CAPKIT LANGUAGES CXX)
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets)
if(UNIX AND NOT APPLE)
    find_package(Qt6 REQUIRED COMPONENTS DBus)
endif()

configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/config.h.in"
    "${CMAKE_CURRENT_BINARY_DIR}/generated/config.h"
    @ONLY
)
include_directories("${CMAKE_CURRENT_BINARY_DIR}/generated")

set(SOURCES 
    src/main.cpp 
    src/Capture.h
)

if(WIN32)
    list(APPEND SOURCES src/Capture_Win.cpp src/Window.cpp)
    set(PLATFORM_LIBS dwmapi gdiplus user32 gdi32 Shcore)
elseif(APPLE)
    list(APPEND SOURCES src/Capture_Mac.mm src/Window.mm)
    find_library(FOUNDATION_LIB Foundation)
    find_library(COREGRAPHICS_LIB CoreGraphics)
    find_library(COCOA_LIB Cocoa)
    find_library(APPKIT_LIB AppKit)
    if(NOT FOUNDATION_LIB OR NOT COREGRAPHICS_LIB OR NOT COCOA_LIB OR NOT APPKIT_LIB)
        message(FATAL_ERROR "Required macOS frameworks not found")
    endif()
    set(PLATFORM_LIBS ${FOUNDATION_LIB} ${COREGRAPHICS_LIB} ${COCOA_LIB} ${APPKIT_LIB})
elseif(UNIX AND NOT APPLE)
    list(APPEND SOURCES src/Capture_Unix.cpp src/Window.cpp)
    set(PLATFORM_LIBS Qt6::DBus)
endif()

list(APPEND SOURCES 
    src/DrawView.cpp 
    src/DrawView.h 
    src/Window.h
)

add_executable(capturekit WIN32 MACOSX_BUNDLE ${SOURCES})

target_include_directories(capturekit PRIVATE 
    src/engine 
    src/interface
)

target_link_libraries(capturekit PRIVATE 
    Qt6::Core Qt6::Gui Qt6::Widgets 
    ${PLATFORM_LIBS}
)

if(UNIX AND NOT APPLE)
    set_target_properties(capturekit PROPERTIES
        OUTPUT_NAME "capturekit-bin"
        INSTALL_RPATH "$ORIGIN/../libs"
        BUILD_WITH_INSTALL_RPATH TRUE
    )
endif()

if(APPLE)
    set_target_properties(capturekit PROPERTIES
        MACOSX_BUNDLE TRUE
        MACOSX_BUNDLE_GUI_IDENTIFIER "com.capturekit.app"
        MACOSX_BUNDLE_BUNDLE_NAME "CaptureKit"
        MACOSX_BUNDLE_INFO_STRING "CaptureKit Screen Capture"
    )
endif()