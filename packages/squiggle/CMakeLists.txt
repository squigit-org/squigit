cmake_minimum_required(VERSION 3.16)
project(squiggle VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_INCLUDE_CURRENT_DIR ON)

set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 COMPONENTS Widgets REQUIRED)
if(QT_STATIC_BUILD)
    find_package(Qt6 COMPONENTS XcbQpa REQUIRED)
endif()

add_executable(squiggle
    src/main.cpp
    src/MainWindow.cpp
)

target_link_libraries(squiggle PRIVATE Qt6::Widgets)
if(QT_STATIC_BUILD)
    if(UNIX AND NOT APPLE)
        target_link_libraries(squiggle PRIVATE Qt6::XcbQpa -static-libgcc -static-libstdc++)
    elseif(WIN32)
        target_link_libraries(squiggle PRIVATE dwmapi)
    endif()
endif()

install(TARGETS squiggle RUNTIME DESTINATION bin)