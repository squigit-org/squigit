#!/bin/bash

qmake6 squiggle.pro && make && mkdir -p dist && cp squiggle dist && rm squiggle
