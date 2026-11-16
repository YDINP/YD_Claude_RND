#!/bin/bash
# usage: topng.sh file.svg  -> file.png  (Edge headless, isolated profile)
P="$(cygpath -w "$(pwd)/$1")"; O="$(cygpath -w "$(pwd)/${1%.svg}.png")"
PROF="$(cygpath -w "$TEMP")\edge_svg_prof"
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --user-data-dir="$PROF" --hide-scrollbars --window-size=794,1123 --screenshot="$O" "file:///${P//\//}" >/dev/null 2>&1
