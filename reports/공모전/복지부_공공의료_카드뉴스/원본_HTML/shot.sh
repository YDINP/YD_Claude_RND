CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
D="$(cd "$(dirname "$0")" && pwd -W)"
for i in 1 2 3 4 5 6; do
 "$CH" --headless=new --disable-gpu --user-data-dir="$D/prof" --hide-scrollbars --force-device-scale-factor=1 --window-size=1080,1080 --screenshot="$D/card$i.png" "file:///$D/card$i.html" 2>/dev/null
done
