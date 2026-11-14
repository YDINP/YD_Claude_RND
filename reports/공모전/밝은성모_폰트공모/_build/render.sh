# usage: render.sh <html> <w> <h> <out.png>
d=$(cd "$(dirname "$1")" && pwd)
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="C:/Users/parkk/AppData/Local/Temp/claude/0658710aec011c66/a87b3668-3db8-47a1-8103-297eed64a583/scratchpad/chr_bs" --window-size=$2,$3 --virtual-time-budget=3000 --screenshot="$(cygpath -w "$4")" "file:///$(cygpath -m "$d")/$(basename "$1")" 2>/dev/null
