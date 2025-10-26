add_executable(unixcaptool
    main.cpp
    audiomanager.cpp
    receiver.cpp
    shell.cpp
    utils.cpp
)

if(APPLE)
    target_sources(unixcaptool PRIVATE darwinplugins.cpp)
else()
    target_sources(unixcaptool PRIVATE linuxplugins.cpp)
endif()

target_link_libraries(unixcaptool PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::DBus
)

install(TARGETS unixcaptool DESTINATION .)