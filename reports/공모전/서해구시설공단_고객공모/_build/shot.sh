#!/bin/bash
# usage: shot.sh in.svg out.png
P="D:/Temp/claude/chromeprof_$$"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --user-data-dir="$P" --window-size=800,1130 --hide-scrollbars --screenshot="$2" "file:///$1" >/dev/null 2>&1
rm -rf "$P"
