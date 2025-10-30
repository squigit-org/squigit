cmake_minimum_required(VERSION 3.16)
project(CAPKIT LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

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
)

if(UNIX)
    set_target_properties(drawview PROPERTIES
        OUTPUT_NAME "drawview-bin"
        INSTALL_RPATH "$ORIGIN/libs"
        BUILD_WITH_INSTALL_RPATH TRUE
    )
    install(TARGETS scgrabber drawview DESTINATION bin)
endif()