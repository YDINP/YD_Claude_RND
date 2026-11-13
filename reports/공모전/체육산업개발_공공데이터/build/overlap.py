"""올림픽공원 공연정보(누리집 = data.go.kr 3037877 LINK 원천)로 같은 날 대형 공연장 시작 시각 겹침 집계."""
import json, re, datetime as dt, collections, sys
S = r"C:/Users/parkk/AppData/Local/Temp/claude/0658710aec011c66/a87b3668-3db8-47a1-8103-297eed64a583/scratchpad"
ev = json.load(open(S + "/ev_all.json", encoding="utf-8"))
WD = "월화수목금토일"


def venue(p):
    p = re.sub(r"\s+", "", p)
    if "," in p or "잔디" in p and "DOME" in p:
        return None
    if "DOME" in p.upper():
        return "KSPO DOME"
    if "핸드볼" in p or "티켓링크" in p:
        return "티켓링크 라이브 아레나"
    if "올림픽홀" in p:
        return "올림픽홀"
    if "우리금융" in p:
        return "우리금융아트홀"
    return None


TIME = r"(오전|오후|저녁|낮)?\s*(\d{1,2})(?::(\d{2})\s*(PM|AM|pm|am)?|\s*시(?:\s*(\d{1,2})\s*분)?|\s*(PM|AM|pm|am))"


def times(seg):
    out = []
    for m in re.finditer(TIME, seg):
        ap, h, mi, pm1, mi2, pm2 = m.groups()
        pm = pm1 or pm2
        h = int(h)
        mi = int(mi or mi2 or 0)
        if (ap in ("오후", "저녁") or (pm or "").lower() == "pm") and h < 12:
            h += 12
        if ap is None and not pm and h <= 9:
            h += 12  # '7:00' 표기 = 저녁
        if 10 <= h <= 23:
            out.append(h * 60 + mi)
    return out


def starts(e, d):
    tm = e["tm"].replace("（", "(").replace("）", ")")
    tm = re.sub(r"\(KST\)|KST", "", tm)
    # 1) 날짜 명시: 'M월 D일' 또는 'M.D'
    md = list(re.finditer(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일|(?<![\d:])(\d{1,2})\.(\d{1,2})(?=\s*\()", tm))
    if md:
        for i, m in enumerate(md):
            mo, da = (int(m.group(1)), int(m.group(2))) if m.group(1) else (int(m.group(3)), int(m.group(4)))
            if (mo, da) == (d.month, d.day):
                seg = tm[m.end(): md[i + 1].start() if i + 1 < len(md) else len(tm)]
                seg = re.sub(r"^\s*\([^)]*\)", "", seg)
                t = times(seg)
                if t:
                    return t
    # 2) 요일 표기: '토 오후 6시', '(토) 18:00'
    w = WD[d.weekday()]
    m = re.search(rf"\(?{w}\)?(?:요일)?\s*[:：]?\s*" + r"([^/|,]*)", tm)
    if m:
        t = times(m.group(1))
        if t:
            return t
    # 3) 단일 시각
    t = times(tm)
    if len(set(t)) == 1 and not md:
        return t
    return None


rows = collections.defaultdict(list)   # date -> [(venue, start, run, title)]
unparsed = 0
for e in ev:
    v = venue(e["plc"])
    if not v:
        continue
    b, en = dt.date.fromisoformat(e["beginDt"]), dt.date.fromisoformat(e["endDt"])
    if (en - b).days > 6:  # 장기 공연(뮤지컬 등)은 제외 — 저녁 대형 단발 공연만
        continue
    run = re.search(r"(\d{2,3})\s*분", e["ndTm"] or "")
    d = b
    while d <= en:
        st = starts(e, d)
        if st:
            for s in st:
                if s >= 15 * 60:
                    rows[d].append((v, s, int(run.group(1)) if run else None, e["title"][:30]))
        else:
            unparsed += 1
        d += dt.timedelta(days=1)

year = sys.argv[1] if len(sys.argv) > 1 else "2025"
days = {d: r for d, r in rows.items() if str(d.year) == year}
multi = {d: r for d, r in days.items() if len({x[0] for x in r}) >= 2}
same = {}
for d, r in multi.items():
    by = collections.defaultdict(set)
    for v, s, *_ in r:
        by[s].add(v)
    if any(len(vs) >= 2 for vs in by.values()):
        same[d] = r
near = {}
for d, r in multi.items():
    ok = False
    for a in r:
        for b in r:
            if a[0] != b[0] and abs(a[1] - b[1]) <= 30:
                ok = True
    if ok:
        near[d] = r
seat = {"KSPO DOME": 15000, "티켓링크 라이브 아레나": 5003, "올림픽홀": 2452, "우리금융아트홀": 1184}
lines = [f"{year}: 저녁(15시 이후 시작) 대형공연 있는 날 {len(days)}일, 2곳 이상 {len(multi)}일, 같은 시각 시작 {len(same)}일, 30분 이내 시작 {len(near)}일, 미해석 공연일 {unparsed}"]
wk = collections.Counter(WD[d.weekday()] for d in same)
lines.append("같은시각 요일분포 " + str(wk))
st = collections.Counter(s for d, r in same.items() for v, s, *_ in r)
lines.append("같은시각 날 시작시각 분포 " + str({f'{k//60}:{k%60:02d}': c for k, c in sorted(st.items())}))
for d in sorted(multi):
    tag = "SAME" if d in same else ("NEAR" if d in near else "    ")
    lines.append(f"{tag} {d} {WD[d.weekday()]} " + " | ".join(f"{v} {s//60}:{s%60:02d} {r or '?'}분" for v, s, r, t in sorted(multi[d], key=lambda x: x[1])))
open(S + f"/overlap_{year}.txt", "w", encoding="utf-8").write("\n".join(lines))
json.dump({str(d): r for d, r in rows.items()}, open(S + "/starts_all.json", "w", encoding="utf-8"), ensure_ascii=False)
