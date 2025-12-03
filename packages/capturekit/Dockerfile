FROM ubuntu:22.04

COPY dist /app

WORKDIR /app

ENV QT_QPA_PLATFORM=xcb
ENV LD_LIBRARY_PATH=/app/libs
ENV QT_PLUGIN_PATH=/app/plugins
ENV QT_QPA_PLATFORM_PLUGIN_PATH=/app/plugins/platforms

CMD ["/bin/bash"]