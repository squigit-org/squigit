#!/bin/bash

qmake6 unixcaptool.pro && make && mkdir -p dist && cp unixcaptool dist && rm unixcaptool
