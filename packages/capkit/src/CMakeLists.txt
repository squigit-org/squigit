cmake_minimum_required(VERSION 3.16)

project(src LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets DBus)

# sc-grabber executable
add_executable(scgrabber
    sc-grabber/main.cpp
    sc-grabber/audmgr.cpp
    sc-grabber/audmgr.h
    sc-grabber/receiver.cpp
    sc-grabber/receiver.h
    sc-grabber/helpers.cpp
    sc-grabber/helpers.h
)

target_link_libraries(scgrabber PRIVATE Qt6::Core Qt6::Gui Qt6::DBus)

set_target_properties(scgrabber PROPERTIES
    OUTPUT_NAME "scgrabber-bin"
    INSTALL_RPATH "$ORIGIN/libs"
    BUILD_WITH_INSTALL_RPATH TRUE
)

# draw-view executable
add_executable(drawview
    draw-view/main.cpp
    draw-view/Window.cpp
    draw-view/Window.h
    draw-view/drawview.cpp
    draw-view/drawview.h
)

target_link_libraries(drawview PRIVATE Qt6::Core Qt6::Gui Qt6::Widgets)

set_target_properties(drawview PROPERTIES
    OUTPUT_NAME "drawview-bin"
    INSTALL_RPATH "$ORIGIN/libs"
    BUILD_WITH_INSTALL_RPATH TRUE
)

install(TARGETS scgrabber drawview DESTINATION bin)