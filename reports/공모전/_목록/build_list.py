"""공모전 제출 완료 목록 생성기.

README.md(현황 표) + _목록/entries.json(수기 보정) + 각 공모 폴더의 실제 파일을 읽어
  - reports/공모전/제출완료목록.md
  - reports/공모전/_목록/제출완료목록.html
  - reports/공모전/제출완료목록.pdf  (Chrome headless --print-to-pdf)
를 다시 만든다. 썸네일은 _목록/thumbs/ 에 캐시(원본이 더 새로우면 다시 그림).

새 공모 추가: README 표에 행을 넣고, entries.json 에 같은 key(README '공모' 칸의 고유 문자열)로
항목을 추가한 뒤 `python _목록/build_list.py` 실행. README 에 ✅/📨 인데 entries.json 에 없으면 경고가 뜬다.
옵션: --no-pdf (md/html만), --chrome <경로>
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent          # reports/공모전/_목록
ROOT = HERE.parent                               # reports/공모전
THUMBS = HERE / "thumbs"
PDFCRAFT = Path(r"D:/park/artcraft-apps/pdfcraft/pdfcraft-0.9.0-windows-x64-portable/pdfcraft-cli.exe")
WORDCRAFT = Path(r"D:/park/artcraft-apps/wordcraft/wordcraft-0.8.0-windows-x64-portable/wordcraft-cli.exe")
CHROMES = [r"C:/Program Files/Google/Chrome/Application/chrome.exe",
           r"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]
STATUS_MARKS = ["🏆", "📨", "✅", "⏳", "⏭", "⚠️", "⏸"]
DONE_MARKS = {"🏆", "📨", "✅"}
IMG_EXT = {".png", ".jpg", ".jpeg"}


# ---------------------------------------------------------------- README
def parse_readme() -> list[dict]:
    rows = []
    for line in (ROOT / "README.md").read_text(encoding="utf-8").splitlines():
        if not line.startswith("|") or line.startswith("|---"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3 or cells[0] == "마감":
            continue
        status = cells[2]
        mark = ""
        for m in STATUS_MARKS:
            if m in status:
                mark = m
                break
        todo = cells[3] if len(cells) > 3 else ""
        if "패스" in status + todo:
            mark = "⏭"
        elif mark == "✅" and "📨" in todo:
            mark = "📨"
        elif mark == "✅" and "⏳" in todo:
            mark = "⏳"   # 문안만 완성, 폼 오픈 대기
        rows.append({"deadline": cells[0].replace("*", ""), "name": cells[1], "status": status,
                     "mark": mark, "todo": cells[3] if len(cells) > 3 else ""})
    return rows


def strip_md(s: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = s.replace("`", "")
    s = re.sub(r"\(?\b0\d{1,2}-\d{3,4}-\d{4}\b\)?", "", s)   # 전화번호 제거
    s = s.replace("☎", "")
    return s.strip()


def pending_text(r: dict) -> str:
    st = strip_md(r["status"])
    for m in STATUS_MARKS:
        st = st.replace(m, "")
    todo = strip_md(r["todo"])
    for m in STATUS_MARKS:
        todo = todo.replace(m, "")
    txt = f"{r['mark']} {st.strip()}" + (f" — {todo.strip()}" if todo.strip() not in ("", "—", "-") else "")
    return txt.replace("|", "/")[:150]


# ---------------------------------------------------------------- 파일 정보
def human_size(n: int) -> str:
    if n >= 1024 * 1024:
        return f"{n / 1024 / 1024:.1f}MB"
    return f"{max(1, round(n / 1024))}KB"


def zip_names(p: Path) -> list[str]:
    out = []
    with zipfile.ZipFile(p) as z:
        for i in z.infolist():
            n = i.filename
            if not i.flag_bits & 0x800:
                try:
                    n = n.encode("cp437").decode("cp949")
                except (UnicodeEncodeError, UnicodeDecodeError):
                    pass
            if not n.endswith("/"):
                out.append(n)
    return out


def file_info(rel: str, private: bool = False) -> dict:
    p = (ROOT / rel).resolve()
    info = {"rel": rel, "name": Path(rel).name, "ext": Path(rel).suffix.lower().lstrip("."),
            "exists": p.exists(), "detail": ""}
    if private:
        info["detail"] = "비공개"
        return info
    if not p.exists():
        info["detail"] = "파일 없음"
        return info
    size = p.stat().st_size
    ext = info["ext"]
    detail = []
    try:
        if ext == "pdf":
            from pypdf import PdfReader
            r = PdfReader(str(p))
            n = len(r.pages)
            box = r.pages[0].mediabox
            w_mm, h_mm = float(box.width) * 25.4 / 72, float(box.height) * 25.4 / 72
            paper = ""
            for nm, (a, b) in {"A4": (210, 297), "A3": (297, 420), "A1": (594, 841)}.items():
                if abs(min(w_mm, h_mm) - a) < 6 and abs(max(w_mm, h_mm) - b) < 6:
                    paper = " " + nm
            detail.append(f"{n}쪽{paper}")
        elif ext in ("png", "jpg", "jpeg"):
            from PIL import Image
            with Image.open(p) as im:
                detail.append(f"{im.width}×{im.height}px")
        elif ext == "pptx":
            with zipfile.ZipFile(p) as z:
                n = len([x for x in z.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", x)])
            detail.append(f"{n}장")
        elif ext == "docx" and WORDCRAFT.exists():
            out = subprocess.run([str(WORDCRAFT), "info", str(p)], capture_output=True, timeout=60)
            j = json.loads(out.stdout.decode("utf-8", "replace"))
            pages = j.get("pages") or j.get("pageCount")
            if pages:
                detail.append(f"{pages}쪽")
        elif ext == "zip":
            detail.append(f"{len(zip_names(p))}개 파일")
    except Exception as ex:  # 정보 일부를 못 읽어도 목록은 만든다
        print(f"  [warn] {rel}: {ex}", file=sys.stderr)
    detail.append(human_size(size))
    info["detail"] = " · ".join(detail)
    return info


# ---------------------------------------------------------------- 썸네일
def thumb_for(rel: str) -> Path | None:
    src = (ROOT / rel).resolve()
    if not src.exists():
        return None
    ext = src.suffix.lower()
    out = THUMBS / (hashlib.sha1(rel.encode("utf-8")).hexdigest()[:12] + ".png")
    if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
        return out
    THUMBS.mkdir(parents=True, exist_ok=True)
    try:
        if ext == ".pdf":
            subprocess.run([str(PDFCRAFT), "render", str(src), "--page", "1", "--dpi", "40", "--out", str(out)],
                           check=True, capture_output=True, timeout=120)
        elif ext in IMG_EXT:
            from PIL import Image
            with Image.open(src) as im:
                im = im.convert("RGB")
                im.thumbnail((360, 360))
                im.save(out, optimize=True)
        elif ext == ".docx":
            subprocess.run([str(WORDCRAFT), "render", str(src), str(out), "--page", "1", "--scale", "0.4"],
                           check=True, capture_output=True, timeout=120)
        else:
            return None
    except Exception as ex:
        print(f"  [warn] 썸네일 실패 {rel}: {ex}", file=sys.stderr)
        return None
    # PDF 렌더(특히 A1 포스터)가 크면 줄인다
    try:
        from PIL import Image
        with Image.open(out) as im:
            if max(im.size) > 420:
                im = im.convert("RGB")
                im.thumbnail((420, 420))
                im.save(out, optimize=True)
    except Exception:
        pass
    return out if out.exists() else None


# ---------------------------------------------------------------- 조립
def fmt_date(iso: str) -> str:
    if not iso:
        return ""
    y, m, d = (int(x) for x in iso.split("-"))
    wd = "월화수목금토일"[date(y, m, d).weekday()]
    return f"{m}/{d}({wd})" if y == 2026 else f"{iso}({wd})"


def build_model() -> dict:
    data = json.loads((HERE / "entries.json").read_text(encoding="utf-8"))
    rows = parse_readme()
    entries = sorted(data["entries"], key=lambda e: (e["deadline"], e["name"]))
    used = set()
    for e in entries:
        row = next((r for r in rows if e["key"] in r["name"]), None)
        if row is None:
            print(f"  [warn] README에서 '{e['key']}' 행을 찾지 못함", file=sys.stderr)
        else:
            used.add(id(row))
        e["mark"] = row["mark"] if row else ""
        e["readme_status"] = strip_md(row["status"]) if row else ""
        e["file_rows"] = []
        thumbs = list(e.get("thumbs", []))
        for f in e.get("files", []):
            fi = file_info(f["path"], f.get("private", False))
            fi["role"] = f.get("role", "")
            fi["private"] = f.get("private", False)
            fi["children"] = []
            for c in f.get("contains", []):
                ci = file_info(c)
                fi["children"].append(ci)
                if f.get("thumb") and Path(c).suffix.lower() in IMG_EXT | {".pdf"}:
                    thumbs.append(c)
            if f.get("thumb") and not f.get("private") and not f.get("contains"):
                thumbs.append(f["path"])
            e["file_rows"].append(fi)
        e["thumb_imgs"] = []
        for t in thumbs:
            tp = thumb_for(t)
            if tp:
                e["thumb_imgs"].append({"src": tp, "label": Path(t).name})
    missing = [r for r in rows if id(r) not in used and r["mark"] in DONE_MARKS]
    pending = [r for r in rows if id(r) not in used and r["mark"] not in DONE_MARKS]
    for r in missing:
        print(f"  [warn] README ✅/📨 인데 entries.json 미등록: {strip_md(r['name'])}", file=sys.stderr)
    works = sum(e.get("works", 1) for e in entries)
    by_route = {}
    for e in entries:
        by_route[e["route_type"]] = by_route.get(e["route_type"], 0) + 1
    files_n = sum(len(e["file_rows"]) for e in entries)
    return {"entries": entries, "pending": pending, "missing": missing, "works": works,
            "by_route": by_route, "files_n": files_n,
            "unconfirmed": sum(1 for e in entries if e.get("unconfirmed")),
            "today": date.today().isoformat()}


# ---------------------------------------------------------------- Markdown
def file_line_md(fi: dict, indent: str = "") -> str:
    if fi.get("private"):
        return f"{indent}- {fi.get('role') or '등본(비공개, 미커밋)'} — `{fi['name']}`"
    role = f" — {fi['role']}" if fi.get("role") else ""
    return f"{indent}- `{fi['rel']}` ({fi['ext'].upper()} · {fi['detail']}){role}"


def render_md(m: dict) -> str:
    L = ["# 공모전 제출 완료 목록", "",
         f"> 생성: {m['today']} · `_목록/build_list.py` 가 README.md + `_목록/entries.json` + 폴더 파일을 읽어 자동 생성. 직접 고치지 말고 entries.json 을 고친 뒤 다시 실행.",
         "> PDF판: `제출완료목록.pdf` (썸네일 포함)", "",
         "## 요약", "",
         f"- 공모 **{len(m['entries'])}건** · 응모작 **{m['works']}편** · 제출 파일 {m['files_n']}개(묶음 zip은 1개로 셈)",
         "- 경로: " + " · ".join(f"{k} {v}건" for k, v in sorted(m["by_route"].items())),
         f"- 이 중 {m['unconfirmed']}건은 서류만 완성돼 있고 실제 제출 기록이 저장소에 없음(⚠ 표시, 사용자 확인 필요)", ""]
    L += ["| # | 마감 | 공모 | 응모작 | 경로 | 제출일 |", "|---|---|---|---|---|---|"]
    for i, e in enumerate(m["entries"], 1):
        sub = fmt_date(e["submitted"]) or "⚠ 미기록"
        L.append(f"| {i} | {fmt_date(e['deadline'])} | {e['mark']} {e['name']} | {e['title']} | {e['route_type']} | {sub} |")
    L.append("")
    for i, e in enumerate(m["entries"], 1):
        L += [f"## {i}. {e['name']}", "",
              f"- **주최** {e['org']} · **상금** {e['prize']} · **마감** {fmt_date(e['deadline'])}",
              f"- **제출** {fmt_date(e['submitted']) or '⚠ 제출 기록 없음(확인 필요)'} · {e['route']}",
              f"- **응모작** {e['title']}",
              f"- **요지** {e['summary']}",
              f"- **결과 발표** {e.get('result') or '—'}", "", "**낸 파일**", ""]
        if not e["file_rows"]:
            L.append(f"- 파일 없음 (폼 문안: `{e.get('form_text', '—')}`)")
        else:
            for fi in e["file_rows"]:
                L.append(file_line_md(fi))
                for c in fi["children"]:
                    L.append(file_line_md(c, "  "))
            if e.get("form_text"):
                L.append(f"- 폼 문안: `{e['form_text']}`")
        if e.get("note"):
            L.append(f"- 참고: {e['note']}")
        L.append("")
    L += ["## 대기 / 보류 (README 기준, 제출 전)", "", "| 마감 | 공모 | 상태 |", "|---|---|---|"]
    for r in m["pending"]:
        L.append(f"| {strip_md(r['deadline'])} | {strip_md(r['name'])} | {pending_text(r)} |")
    if m["missing"]:
        L += ["", "## ⚠ entries.json 미등록 (README에는 제출로 표시)", ""]
        L += [f"- {strip_md(r['name'])}" for r in m["missing"]]
    L.append("")
    return "\n".join(L)


# ---------------------------------------------------------------- HTML
CSS = """
@page { size: A4; margin: 13mm 12mm 14mm; }
* { box-sizing: border-box; }
body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9.2pt; color:#1d1d1f; background:#fff; margin:0; line-height:1.45; }
h1 { font-size: 18pt; margin: 0 0 2mm; }
.sub { color:#666; font-size:8.5pt; margin-bottom:4mm; }
.kpis { display:flex; gap:3mm; margin:3mm 0 4mm; }
.kpi { flex:1; border:1px solid #d9dce3; border-radius:2mm; padding:2.5mm 3mm; }
.kpi b { display:block; font-size:16pt; color:#1b4f9c; }
.kpi span { color:#555; font-size:8.3pt; }
table { border-collapse:collapse; width:100%; }
.overview th, .overview td, .pending th, .pending td { border-bottom:1px solid #e3e5ea; padding:1.2mm 1.5mm; text-align:left; vertical-align:top; font-size:8.3pt; }
.overview th, .pending th { background:#f1f3f7; font-weight:700; }
.overview tr, .pending tr { page-break-inside: avoid; }
td.n { width:7mm; color:#888; } td.d { width:20mm; white-space:nowrap; } td.r { width:13mm; white-space:nowrap; } td.s { width:18mm; white-space:nowrap; }
h2 { font-size:12pt; margin:6mm 0 2mm; border-bottom:2px solid #1b4f9c; padding-bottom:1mm; }
.card { border:1px solid #d9dce3; border-radius:2mm; padding:3mm 3.5mm; margin:0 0 3.5mm; page-break-inside: avoid; break-inside: avoid; }
.card h3 { font-size:10.5pt; margin:0 0 1.5mm; }
.card h3 .no { color:#1b4f9c; margin-right:1.5mm; }
.mark { font-size:9pt; }
.meta { display:grid; grid-template-columns: 17mm 1fr; gap:0.6mm 2mm; margin-bottom:2mm; }
.meta dt { color:#666; } .meta dd { margin:0; overflow-wrap:anywhere; }
.files { width:100%; margin-top:1mm; table-layout:fixed; }
.files td { border-top:1px solid #eef0f3; padding:0.9mm 1.2mm; font-size:8pt; vertical-align:top; overflow-wrap:anywhere; }
.files td.ext { width:11mm; font-weight:700; color:#1b4f9c; }
.files td.det { width:30mm; color:#555; }
.files td.role { width:52mm; color:#333; }
.files tr.child td.fn { padding-left:5mm; color:#444; }
.files tr.child td.fn:before { content:'└ '; color:#aaa; }
.path { font-family: Consolas, monospace; font-size:7.4pt; color:#333; }
.thumbs { display:flex; flex-wrap:wrap; gap:2mm; margin-top:2mm; }
.body { display:flex; gap:3mm; align-items:flex-start; }
.body .main { flex:1; min-width:0; }
.body .side { flex:none; max-width:95mm; }
.side .thumbs { margin-top:0; flex-wrap:nowrap; }
.side .thumbs img { height:30mm; max-width:44mm; }
.thumbs figure { margin:0; text-align:center; }
.thumbs img { height:34mm; max-width:60mm; border:1px solid #ccd; object-fit:contain; background:#fafafa; display:block; }
.thumbs.many img { height:24mm; }
.thumbs figcaption { font-size:6.4pt; color:#777; max-width:40mm; overflow-wrap:anywhere; }
.warn { color:#b0471b; font-weight:700; }
.none { color:#555; font-style:italic; }
.note { color:#555; font-size:8pt; margin-top:1mm; }
"""


def esc(s) -> str:
    return html.escape(str(s or ""))


def file_rows_html(fi: dict, child: bool = False) -> str:
    cls = ' class="child"' if child else ""
    if fi.get("private"):
        return (f"<tr{cls}><td class='ext'>{esc(fi['ext'].upper())}</td><td class='fn'>{esc(fi.get('role') or '등본(비공개, 미커밋)')}</td>"
                f"<td class='det'>비공개 · 썸네일 없음</td><td class='role'>git 제외 폴더</td></tr>")
    return (f"<tr{cls}><td class='ext'>{esc(fi['ext'].upper())}</td><td class='fn'><span class='path'>{esc(fi['name'] if child else fi['rel'])}</span></td>"
            f"<td class='det'>{esc(fi['detail'])}</td><td class='role'>{esc(fi.get('role', ''))}</td></tr>")


def render_html(m: dict) -> str:
    H = ["<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>공모전 제출 완료 목록</title>",
         f"<style>{CSS}</style></head><body>",
         "<h1>공모전 제출 완료 목록</h1>",
         f"<div class='sub'>생성 {m['today']} · README.md + _목록/entries.json + 폴더 실파일 기준 · 파일 경로는 reports/공모전/ 기준</div>",
         "<div class='kpis'>",
         f"<div class='kpi'><b>{len(m['entries'])}</b><span>공모</span></div>",
         f"<div class='kpi'><b>{m['works']}</b><span>응모작</span></div>"]
    for k, v in sorted(m["by_route"].items()):
        H.append(f"<div class='kpi'><b>{v}</b><span>{esc(k)} 제출</span></div>")
    H.append(f"<div class='kpi'><b>{m['unconfirmed']}</b><span>제출 기록 없음(확인 필요)</span></div></div>")
    H.append("<table class='overview'><tr><th>#</th><th>마감</th><th>공모</th><th>응모작</th><th>경로</th><th>제출일</th></tr>")
    for i, e in enumerate(m["entries"], 1):
        sub = esc(fmt_date(e["submitted"])) or "<span class='warn'>미기록</span>"
        H.append(f"<tr><td class='n'>{i}</td><td class='d'>{esc(fmt_date(e['deadline']))}</td><td>{esc(e['mark'])} {esc(e['name'])}</td>"
                 f"<td>{esc(e['title'])}</td><td class='r'>{esc(e['route_type'])}</td><td class='s'>{sub}</td></tr>")
    H.append("</table><h2>공모별 상세</h2>")
    for i, e in enumerate(m["entries"], 1):
        side = 0 < len(e["thumb_imgs"]) <= 3
        sub = esc(fmt_date(e["submitted"])) if e["submitted"] else "<span class='warn'>제출 기록 없음 — 확인 필요</span>"
        meta = ("<dl class='meta'>"
                f"<dt>주최·상금</dt><dd>{esc(e['org'])} · {esc(e['prize'])}</dd>"
                f"<dt>마감</dt><dd>{esc(fmt_date(e['deadline']))}</dd>"
                f"<dt>제출</dt><dd>{sub} · {esc(e['route'])}</dd>"
                f"<dt>응모작</dt><dd><b>{esc(e['title'])}</b></dd>"
                f"<dt>요지</dt><dd>{esc(e['summary'])}</dd>"
                f"<dt>결과</dt><dd>{esc(e.get('result') or '—')}</dd></dl>")
        thumbs = ""
        if e["thumb_imgs"]:
            many = " many" if len(e["thumb_imgs"]) > 3 else ""
            figs = []
            for t in e["thumb_imgs"]:
                rel = os.path.relpath(t["src"], HERE).replace("\\", "/")
                figs.append(f"<figure><img src='{esc(rel)}' alt=''><figcaption>{esc(t['label'])}</figcaption></figure>")
            thumbs = f"<div class='thumbs{many}'>" + "".join(figs) + "</div>"
        H.append(f"<div class='card'><h3><span class='no'>{i}</span><span class='mark'>{esc(e['mark'])}</span> {esc(e['name'])}</h3>")
        if side:
            H.append(f"<div class='body'><div class='main'>{meta}</div><div class='side'>{thumbs}</div></div>")
        else:
            H.append(meta)
        if not e["file_rows"]:
            H.append(f"<div class='none'>파일 없음 (폼 문안: <span class='path'>{esc(e.get('form_text', '—'))}</span>)</div>")
        else:
            H.append("<table class='files'>")
            for fi in e["file_rows"]:
                H.append(file_rows_html(fi))
                for c in fi["children"]:
                    H.append(file_rows_html(c, True))
            H.append("</table>")
            if e.get("form_text"):
                H.append(f"<div class='note'>폼 문안: <span class='path'>{esc(e['form_text'])}</span></div>")
        if e.get("note"):
            H.append(f"<div class='note'>참고: {esc(e['note'])}</div>")
        if not side and thumbs:
            H.append(thumbs)
        H.append("</div>")
    H.append("<h2>대기 / 보류 (제출 전)</h2><table class='pending'><tr><th>마감</th><th>공모</th><th>상태</th></tr>")
    for r in m["pending"]:
        H.append(f"<tr><td class='d'>{esc(strip_md(r['deadline']))}</td><td>{esc(strip_md(r['name']))}</td><td>{esc(pending_text(r))}</td></tr>")
    H.append("</table>")
    if m["missing"]:
        H.append("<h2>entries.json 미등록</h2><ul>" + "".join(f"<li>{esc(strip_md(r['name']))}</li>" for r in m["missing"]) + "</ul>")
    H.append("</body></html>")
    return "\n".join(H)


def print_pdf(html_path: Path, pdf_path: Path, chrome: str | None) -> None:
    exe = chrome or next((c for c in CHROMES if Path(c).exists()), None)
    if not exe:
        raise SystemExit("Chrome/Edge 를 찾지 못함 (--chrome 으로 지정)")
    with tempfile.TemporaryDirectory(prefix="contest_pdf_") as prof:
        subprocess.run([exe, "--headless=new", "--disable-gpu", f"--user-data-dir={prof}", "--no-first-run",
                        "--no-pdf-header-footer", "--allow-file-access-from-files",
                        f"--print-to-pdf={pdf_path}", html_path.as_uri()],
                       check=True, capture_output=True, timeout=180)


def main() -> None:
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-pdf", action="store_true")
    ap.add_argument("--chrome")
    a = ap.parse_args()
    m = build_model()
    (ROOT / "제출완료목록.md").write_text(render_md(m), encoding="utf-8", newline="\n")
    hp = HERE / "제출완료목록.html"
    hp.write_text(render_html(m), encoding="utf-8", newline="\n")
    if not a.no_pdf:
        print_pdf(hp, ROOT / "제출완료목록.pdf", a.chrome)
    print(f"공모 {len(m['entries'])}건 · 응모작 {m['works']}편 · 경로 {m['by_route']} · 대기/보류 {len(m['pending'])}건")


if __name__ == "__main__":
    main()
