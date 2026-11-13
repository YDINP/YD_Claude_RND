"""공공데이터 분석 — 기획서 수치·그림·시제품 데이터의 유일한 출처.

입력(../데이터):
  - 올림픽공원_공연정보_2024-2026_누리집수집.json : 「한국체육산업개발주식회사_올림픽공원 공연정보」(data.go.kr 3037877, LINK형)의
    연결 원천인 올림픽공원 누리집 공연일정(eventInfoListAjax)을 2024.1~2026.12 월별로 받은 것. 행사명·기간·시간(tm)·장소·소요시간(ndTm)
  - 15138735_..._올림픽공원 입출차 정보_20240731.csv : 2024년 7월 동2문·남2문·북2문 주차구역 입출차 215,528건
출력: analysis.json
실행: python -I build/analysis.py
"""
import collections
import csv
import datetime as dt
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE.parent / "데이터"
WD = "월화수목금토일"
SEAT = {"KSPO DOME": 15000, "티켓링크 라이브 아레나": 5003, "올림픽홀": 2452, "우리금융아트홀": 1184}


# ───────────── 공연정보: 장소·시작 시각 해석 ─────────────
def venue(p):
    p = re.sub(r"\s+", "", p)
    if "," in p or ("잔디" in p and "DOME" in p):
        return None                     # 여러 곳 동시 페스티벌은 제외
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
        pm = (pm1 or pm2 or "").lower()
        h, mi = int(h), int(mi or mi2 or 0)
        if (ap in ("오후", "저녁") or pm == "pm") and h < 12:
            h += 12
        if ap is None and not pm and h <= 9:
            h += 12
        if 10 <= h <= 23:
            out.append(h * 60 + mi)
    return out


def starts(e, d):
    tm = e["tm"].replace("（", "(").replace("）", ")")
    tm = re.sub(r"\(KST\)|KST", "", tm)
    md = list(re.finditer(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일|(?<![\d:])(\d{1,2})\.(\d{1,2})(?=\s*\()", tm))
    for i, m in enumerate(md):
        mo, da = (int(m.group(1)), int(m.group(2))) if m.group(1) else (int(m.group(3)), int(m.group(4)))
        if (mo, da) == (d.month, d.day):
            seg = tm[m.end(): md[i + 1].start() if i + 1 < len(md) else len(tm)]
            t = times(re.sub(r"^\s*\([^)]*\)", "", seg))
            if t:
                return t
    m = re.search(rf"\(?{WD[d.weekday()]}\)?(?:요일)?\s*[:：]?\s*" + r"([^/|,]*)", tm)
    if m and times(m.group(1)):
        return times(m.group(1))
    t = times(tm)
    if len(set(t)) == 1 and not md:
        return t
    return None


def load_events():
    return json.load(open(DATA / "올림픽공원_공연정보_2024-2026_누리집수집.json", encoding="utf-8"))


def show_days(ev):
    """날짜 → [(공연장, 시작분, 소요분|None, 제목)] — 7일 이하 단기 공연, 15시 이후 시작만."""
    rows = collections.defaultdict(list)
    for e in ev:
        v = venue(e["plc"])
        if not v:
            continue
        b, en = dt.date.fromisoformat(e["beginDt"]), dt.date.fromisoformat(e["endDt"])
        if (en - b).days > 6:
            continue
        run = re.search(r"(\d{2,3})\s*분", e["ndTm"] or "")
        d = b
        while d <= en:
            for s in starts(e, d) or []:
                if s >= 15 * 60:
                    rows[d].append((v, s, int(run.group(1)) if run else None, e["title"]))
            d += dt.timedelta(days=1)
    return rows


def overlap_stats(rows, year):
    days = {d: r for d, r in rows.items() if d.year == year}
    multi = {d: r for d, r in days.items() if len({x[0] for x in r}) >= 2}
    same = {}
    for d, r in multi.items():
        by = collections.defaultdict(set)
        for v, s, *_ in r:
            by[s].add(v)
        if any(len(vs) >= 2 for vs in by.values()):
            same[d] = r
    seats_same = []
    for d, r in same.items():
        by = collections.defaultdict(set)
        for v, s, *_ in r:
            by[s].add(v)
        seats_same.append(max(sum(SEAT[v] for v in vs) for vs in by.values() if len(vs) >= 2))
    wk = collections.Counter(WD[d.weekday()] for d in same)
    return dict(year=year, evening_days=len(days), multi_venue_days=len(multi), same_start_days=len(same),
                same_start_weekend=wk["토"] + wk["일"], same_start_3venues=sum(
                    1 for d, r in same.items() if max(collections.Counter(s for _, s, *_ in {(v, s) for v, s, *_ in r}).values()) >= 3),
                median_seats_same=sorted(seats_same)[len(seats_same) // 2] if seats_same else 0)


# ───────────── 입출차: 10분 단위 출차 ─────────────
def exits_by_10min():
    fn = next(DATA.glob("15138735_*.csv"))
    c = collections.Counter()
    n = 0
    for r in list(csv.reader(open(fn, encoding="cp949")))[1:]:
        try:
            o = dt.datetime.strptime(r[2], "%Y-%m-%d %H:%M")
        except (ValueError, IndexError):
            continue
        n += 1
        c[o.replace(minute=o.minute // 10 * 10)] += 1
    return c, n


def profile(c, day, h0=16, h1=24):
    d = dt.date.fromisoformat(day)
    return [c[dt.datetime.combine(d, dt.time(h, m))] for h in range(h0, h1) for m in range(0, 60, 10)]


def max_window(p, k=6):
    best = max(range(len(p) - k + 1), key=lambda i: sum(p[i:i + k]))
    return sum(p[best:best + k]), best


def subway():
    """역·날짜 → 시각(0~23) 승차 인원. 올림픽공원(5호선·9호선), 한성백제(9), 몽촌토성(8)."""
    st = collections.defaultdict(dict)
    f5 = next(DATA.glob("15048032_*.csv"))
    for r in list(csv.reader(open(f5, encoding="cp949")))[1:]:
        if r[5] != "승차" or not r[1].startswith("2024-07"):
            continue
        name = {"올림픽공원(한국체대)": "올림픽공원역(5호선)", "몽촌토성(평화의문)": "몽촌토성역(8호선)"}.get(r[4])
        if name:
            v = [int(x.replace(",", "") or 0) for x in r[6:26]]   # 06시이전, 06-07 … 23-24, 24시이후
            st[name][r[1]] = {h: v[h - 5] for h in range(6, 24)}
    f9 = next(DATA.glob("15060424_*.csv"))
    raw = open(f9, "rb").read()
    try:
        txt = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        txt = raw.decode("cp949")
    for r in list(csv.reader(txt.splitlines()))[1:]:
        if not r[1].startswith("2024-07") or "승차" not in r[5]:
            continue
        name = {"올림픽공원": "올림픽공원역(9호선)", "한성백제": "한성백제역(9호선)"}.get(r[4])
        if name:
            v = [int(x.replace(",", "") or 0) for x in r[6:30]]
            st[name][r[1]] = {h: v[h] for h in range(24)}
    return st


def subway_summary(st):
    wk = [f"2024-07-{d:02d}" for d in range(1, 32) if dt.date(2024, 7, d).weekday() < 5]
    out = {}
    for day in ("2024-07-13", "2024-07-14", "2024-07-20", "2024-07-21", "2024-07-27", "2024-07-28"):
        park = {h: st["올림픽공원역(5호선)"][day][h] + st["올림픽공원역(9호선)"][day][h] for h in range(16, 24)}
        ph = max(park, key=park.get)
        row = {"peak_hour": ph, "evening_park": sum(park[h] for h in range(18, 24)), "park_by_hour": park}
        for name in ("올림픽공원역(5호선)", "올림픽공원역(9호선)", "한성백제역(9호선)", "몽촌토성역(8호선)"):
            base = sum(st[name][d][ph] for d in wk) / len(wk)
            row[name] = dict(v=st[name][day][ph], weekday_avg=round(base))
        exc = {n: row[n]["v"] - row[n]["weekday_avg"] for n in ("올림픽공원역(5호선)", "올림픽공원역(9호선)", "한성백제역(9호선)", "몽촌토성역(8호선)")}
        pos = sum(max(0, x) for x in exc.values())
        row["park_share_of_excess"] = round(100 * (max(0, exc["올림픽공원역(5호선)"]) + max(0, exc["올림픽공원역(9호선)"])) / pos, 1) if pos else None
        row["excess"] = exc
        out[day] = row
    return out


def main():
    ev = load_events()
    sub = subway_summary(subway())
    rows = show_days(ev)
    c, n = exits_by_10min()
    days = ["2024-07-20", "2024-07-21", "2024-07-27", "2024-07-28", "2024-07-13", "2024-07-14"]
    prof = {d: profile(c, d) for d in days}
    win = {}
    for d in days:
        s, i = max_window(prof[d])
        win[d] = dict(sum60=s, start=f"{16 + i // 6}:{i % 6 * 10:02d}", bins_ge200=sum(1 for x in prof[d] if x >= 200),
                      peak=max(prof[d]))
    # 평일 저녁 기준선(공연 없는 화·수 17~23시 10분 최대값 중앙값)
    base = sorted(max(profile(c, f"2024-07-{dd:02d}", 17, 23)) for dd in (2, 3, 9, 10, 16, 17, 23, 24, 30, 31))
    july = {str(d): r for d, r in rows.items() if d.year == 2024 and d.month == 7}
    up = {str(d): r for d, r in rows.items() if dt.date(2026, 11, 8) <= d <= dt.date(2026, 12, 31)}
    out = dict(
        records_2024_07=n,
        overlap={y: overlap_stats(rows, y) for y in (2024, 2025)},
        profile_start="16:00", profiles=prof, windows=win, weekday_peak_median=base[len(base) // 2],
        july_2024_shows=july, upcoming=up, subway=sub,
        all_days={str(d): r for d, r in sorted(rows.items())},
    )
    json.dump(out, open(HERE / "analysis.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: out[k] for k in ("records_2024_07", "overlap", "windows", "weekday_peak_median")}, ensure_ascii=False, indent=1))
    print("subway", json.dumps(sub, ensure_ascii=False, indent=0))


if __name__ == "__main__":
    main()
