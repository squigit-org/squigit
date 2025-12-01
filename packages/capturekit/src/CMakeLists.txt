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
set(CMAKE_AUTOUIC ON)

set(PACKAGE_JSON_PATH "${CMAKE_CURRENT_SOURCE_DIR}/../package.json")

set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${PACKAGE_JSON_PATH}")

if(EXISTS "${PACKAGE_JSON_PATH}")
    file(READ "${PACKAGE_JSON_PATH}" PACKAGE_JSON_CONTENT)

    string(REGEX MATCH "\"version\":[ \t]*\"([0-9]+\\.[0-9]+\\.[0-9]+)\"" _ ${PACKAGE_JSON_CONTENT})
    if(NOT CMAKE_MATCH_1)
        message(FATAL_ERROR "Could not parse version from ${PACKAGE_JSON_PATH}")
    endif()
    set(APP_VERSION ${CMAKE_MATCH_1})

    string(REGEX MATCH "\"organization\":[ \t]*\"([^\"]+)\"" _ ${PACKAGE_JSON_CONTENT})
    if(NOT CMAKE_MATCH_1)
        message(FATAL_ERROR "Could not parse organization from ${PACKAGE_JSON_PATH}")
    endif()
    set(ORG_NAME ${CMAKE_MATCH_1})
    
    string(REGEX MATCH "\"name\":[ \t]*\"([^\"]+)\"" _ ${PACKAGE_JSON_CONTENT})
    if(NOT CMAKE_MATCH_1)
        message(FATAL_ERROR "Could not parse name from ${PACKAGE_JSON_PATH}")
    endif()
    set(APP_NAME ${CMAKE_MATCH_1})

    message(STATUS "🔗 Monorepo Sync: Configuring ${APP_NAME} v${APP_VERSION} for ${ORG_NAME}")
else()
    message(FATAL_ERROR "Could not find package.json at ${PACKAGE_JSON_PATH}")
endif()

configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/config.h.in"
    "${CMAKE_CURRENT_BINARY_DIR}/generated/config.h"
    @ONLY
)

include_directories("${CMAKE_CURRENT_BINARY_DIR}/generated")

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets)
if(UNIX AND NOT APPLE)
    find_package(Qt6 REQUIRED COMPONENTS DBus)
endif()


#===================================================================
# scgrabber (Linux / macOS)
#===================================================================
if(UNIX)
    add_executable(scgrabber
        sc-grabber/main.cpp
        sc-grabber/audmgr.cpp
        sc-grabber/audmgr.h
        sc-grabber/receiver.cpp
        sc-grabber/receiver.h
        sc-grabber/helpers.cpp
        sc-grabber/helpers.h
    )

    target_include_directories(scgrabber PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/sc-grabber
        "${CMAKE_CURRENT_BINARY_DIR}/generated"
    )

    target_link_libraries(scgrabber PRIVATE
        Qt6::Core
        Qt6::Gui
    )
    
    if(UNIX AND NOT APPLE)
        target_link_libraries(scgrabber PRIVATE Qt6::DBus)
    endif()

    set_target_properties(scgrabber PROPERTIES
        OUTPUT_NAME "scgrabber-bin"
        INSTALL_RPATH "$ORIGIN/libs"
        BUILD_WITH_INSTALL_RPATH TRUE
    )
endif()


#===================================================================
# drawview (All Platforms)
#===================================================================

set(DRAWVIEW_SOURCES
    draw-view/main.cpp
    draw-view/drawview.cpp
    draw-view/drawview.h
    draw-view/Window.h
)
if(APPLE)
    list(APPEND DRAWVIEW_SOURCES draw-view/window.mm)
    set_source_files_properties(draw-view/window.mm PROPERTIES LANGUAGE OBJCXX)
else()
    list(APPEND DRAWVIEW_SOURCES draw-view/Window.cpp)
endif()

if(UNIX AND NOT APPLE)
    list(APPEND DRAWVIEW_SOURCES
        draw-view/watchdog.h
        draw-view/watchdog.cpp
    )
endif()

set(DRAWVIEW_WIN32_FLAG "")
if(WIN32)
    set(DRAWVIEW_WIN32_FLAG WIN32)
endif()

add_executable(drawview ${DRAWVIEW_WIN32_FLAG} ${DRAWVIEW_SOURCES})

set(DRAWVIEW_LIBS
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
)
if(WIN32)
    list(APPEND DRAWVIEW_LIBS dwmapi)
endif()

target_link_libraries(drawview PRIVATE ${DRAWVIEW_LIBS})

target_include_directories(drawview PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/draw-view
    "${CMAKE_CURRENT_BINARY_DIR}/generated"
)

if(UNIX)
    set_target_properties(drawview PROPERTIES
        OUTPUT_NAME "drawview-bin"
        INSTALL_RPATH "$ORIGIN/libs"
        BUILD_WITH_INSTALL_RPATH TRUE
    )
    install(TARGETS scgrabber drawview DESTINATION bin)
endif()