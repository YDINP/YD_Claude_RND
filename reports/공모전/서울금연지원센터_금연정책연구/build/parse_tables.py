"""2025 지역사회 건강통계(서울특별시) 통계표 구별 표 파싱 -> data/gu_tables.json"""
import fitz, json, re, sys
from pathlib import Path
HERE = Path(__file__).parent
pdf = fitz.open(HERE.parent / '원본' / '참고_2025_지역사회건강통계_서울특별시.pdf')
PAGES = {'현재흡연율': 326, '궐련형전자담배': 329, '액상형전자담배': 330, '담배제품사용률': 331, '직장실내간접흡연': 333}
YEARS = [2021, 2022, 2023, 2024, 2025]
out = {}
for key, pno in PAGES.items():
    t = pdf[pno - 1].get_text()
    title = re.search(r'<표 \d+>[^\n]*', t)
    flat = re.sub(r'\s+', ' ', t)
    rows = {}
    num = r'(\d+) ([\d.]+|-)\(([\d.]+|-)\) ([\d.]+|-)\(([\d.]+|-)\)'
    pat = re.compile(r'(서울특별시|[가-힣]{1,4}구) ' + ' '.join([num]*5))
    for m in pat.finditer(flat):
        g = m.groups(); rec = {}
        for k, y in enumerate(YEARS):
            n, c, cse, sd, sse = g[1+5*k:6+5*k]
            fl = lambda v: None if v == '-' else float(v)
            rec[y] = {'N': int(n), 'crude': fl(c), 'crude_se': fl(cse), 'std': fl(sd), 'std_se': fl(sse)}
        rows[g[0]] = rec
    out[key] = {'title': title.group(0) if title else '', 'page_pdf': pno, 'rows': rows}
    print(key, out[key]['title'], len(rows))
(HERE / 'data' / 'gu_tables.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
