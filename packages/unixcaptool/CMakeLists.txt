cmake_minimum_required(VERSION 3.16)
project(unixcaptool LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui DBus)
set(QT_STATIC_PLUGINS ON)

add_subdirectory(src)
