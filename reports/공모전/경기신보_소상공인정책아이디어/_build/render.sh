#!/bin/bash
# PPT 생성 → 검증 → PDF·이미지 렌더 (LibreOffice 관리자 설치본 D:/tmp/lo/inst 사용)
set -e
SP="C:/Users/parkk/AppData/Local/Temp/claude/0658710aec011c66/a87b3668-3db8-47a1-8103-297eed64a583/scratchpad"
SK="C:/Users/parkk/AppData/Roaming/orca/claude-profiles/3916818f-b4ad-431a-a42d-44ec239c4efa/home/skills/synced/298c0c3e-b0a9-4d03-b9cd-f1ce6acf76cf_77552506-f33c-4731-89f5-c574a2aa1e06/pptx"
B="$(cd "$(dirname "$0")" && pwd)"
OUTDIR="$SP/render"; mkdir -p "$OUTDIR"
export NODE_PATH="$SP/pptbuild/node_modules" APPLY_THEME="$SK/scripts/apply_theme.js"
node "$B/make_ppt.js" "$OUTDIR/deck.pptx"
python "$SK/scripts/office/validate.py" "$OUTDIR/deck.pptx" || true
cd "$OUTDIR" && rm -f deck.pdf slide-*.png
"D:/tmp/lo/inst/program/soffice.exe" -env:UserInstallation=file:///D:/tmp/lo/profile --headless --convert-to pdf deck.pptx >/dev/null
python -c "
import fitz;d=fitz.open('deck.pdf');print('pages',len(d))
for i,p in enumerate(d): p.get_pixmap(dpi=110).save(f'slide-{i:02d}.png')"
