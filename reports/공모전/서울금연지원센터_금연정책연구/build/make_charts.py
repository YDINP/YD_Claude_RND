"""연구포스터 그래프 4종 + 분석 수치(analysis.json) 생성.
자료: data/gu_tables.json (2025 서울특별시 지역사회 건강통계 표 184·187~189·191 파싱),
      data/seoul_series_total.json (서울시 건강격차모니터링 통계표 DT_201004_E050008·E050010)."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

HERE = Path(__file__).parent
OUT = HERE / 'fig'; OUT.mkdir(exist_ok=True)
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False
INK, INK2, MUTED, GRID, SURF = '#1b1b1a', '#52514e', '#8a8984', '#e4e3df', '#ffffff'
BLUE, ORANGE, AQUA, VIOLET, GRAY = '#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#9a9893'

g = json.loads((HERE / 'data/gu_tables.json').read_text(encoding='utf-8'))
s = json.loads((HERE / 'data/seoul_series_total.json').read_text(encoding='utf-8'))
YRS = ['2021', '2022', '2023', '2024', '2025']
SE = '서울특별시'
GUS = [k for k in g['현재흡연율']['rows'] if k != SE]


def v(tbl, area, y, f='std'):
    return g[tbl]['rows'][area][y][f]


def style(ax):
    for sp in ('top', 'right'):
        ax.spines[sp].set_visible(False)
    ax.spines['left'].set_color(GRID); ax.spines['bottom'].set_color(MUTED)
    ax.tick_params(colors=INK2, labelsize=13, length=0, pad=6)
    ax.grid(axis='y', color=GRID, lw=1); ax.set_axisbelow(True)


A = {}
# ---------- 수치 ----------
cig = [v('현재흡연율', SE, y) for y in YRS]
htp = [v('궐련형전자담배', SE, y) for y in YRS]
liq = [v('액상형전자담배', SE, y) for y in YRS]
tot = [v('담배제품사용률', SE, y) for y in YRS]
wrk = [v('직장실내간접흡연', SE, y) for y in YRS]
ecig = [a + b for a, b in zip(htp, liq)]
idx = lambda xs: [round(x / xs[0] * 100, 1) for x in xs]
A['seoul_std'] = dict(years=YRS, cig=cig, htp=htp, liq=liq, ecig_sum=ecig, total=tot, work=wrk,
                      idx_cig=idx(cig), idx_ecig=idx(ecig), idx_total=idx(tot), idx_work=idx(wrk))
A['ratio_work_per_user'] = [round(w / t, 3) for w, t in zip(wrk, tot)]
dE = np.array([v('궐련형전자담배', k, '2025') + v('액상형전자담배', k, '2025') - v('궐련형전자담배', k, '2021') - v('액상형전자담배', k, '2021') for k in GUS])
dW = np.array([v('직장실내간접흡연', k, '2025') - v('직장실내간접흡연', k, '2021') for k in GUS])
dC = np.array([v('현재흡연율', k, '2025') - v('현재흡연율', k, '2021') for k in GUS])
A['gu'] = {k: dict(d_ecig=round(float(a), 1), d_work=round(float(b), 1), d_cig=round(float(c), 1)) for k, a, b, c in zip(GUS, dE, dW, dC)}
A['n_gu'] = len(GUS)
A['n_ecig_up_work_down'] = int(((dE > 0) & (dW < 0)).sum())
A['n_ecig_up'] = int((dE > 0).sum())
A['n_work_down'] = int((dW < 0).sum())
A['r_dwork_decig'] = round(float(np.corrcoef(dW, dE)[0, 1]), 2)
A['r_dwork_dcig'] = round(float(np.corrcoef(dW, dC)[0, 1]), 2)
A['median_d_ecig'] = float(np.median(dE)); A['median_d_work'] = float(np.median(dW))
(HERE / 'data/analysis.json').write_text(json.dumps(A, ensure_ascii=False, indent=1), encoding='utf-8')
print(json.dumps({k: A[k] for k in A if k != 'gu'}, ensure_ascii=False))

# ---------- 그림 1: 2021=100 지수 ----------
fig, ax = plt.subplots(figsize=(9.6, 4.5), dpi=200)
x = np.arange(len(YRS))
series = [('전자담배 사용률\n(궐련형+액상형)', A['seoul_std']['idx_ecig'], ORANGE, 'o'),
          ('담배제품 사용률\n(모든 담배)', A['seoul_std']['idx_total'], INK2, 's'),
          ('일반담배 흡연율', A['seoul_std']['idx_cig'], BLUE, 'D'),
          ('직장실내 간접흡연\n노출률(연기 냄새)', A['seoul_std']['idx_work'], AQUA, '^')]
LBLY = {ORANGE: 157, INK2: 110, BLUE: 89, AQUA: 67}
for name, ys, c, m in series:
    ax.plot(x, ys, color=c, lw=3, marker=m, ms=9, mec=SURF, mew=2, zorder=3)
    ax.annotate(f'{name}  {ys[-1]:.0f}', (x[-1], LBLY[c]), xytext=(14, 0), textcoords='offset points',
                va='center', fontsize=13, color=INK, fontweight='bold' if c in (ORANGE, AQUA) else 'normal')
ax.axhline(100, color=MUTED, lw=1.2, ls=(0, (4, 3)))
ax.set_xticks(x, [f'{y}' for y in YRS]); ax.set_xlim(-0.2, 4.2)
ax.set_ylim(55, 175); ax.set_ylabel('2021년 = 100', color=INK2, fontsize=13)
style(ax)
fig.subplots_adjust(left=0.09, right=0.70, top=0.97, bottom=0.08)
fig.savefig(OUT / 'fig1_index.png'); plt.close(fig)

# ---------- 그림 2: 25개 구 산점도 ----------
fig, ax = plt.subplots(figsize=(9.6, 5.6), dpi=200)
ax.axhline(0, color=MUTED, lw=1.2); ax.axvline(0, color=MUTED, lw=1.2)
ax.fill_between([0, 9.8], -14, 0, color='#fdeee7', zorder=0)
ax.text(9.6, -13.4, f'전자담배 사용 ↑ · 연기 노출 보고 ↓\n{A["n_ecig_up_work_down"]}개 구 / {A["n_gu"]}개 구', ha='right', va='bottom',
        fontsize=14, color='#b2481d', fontweight='bold')
ax.scatter(dE, dW, s=110, color=ORANGE, edgecolor=SURF, lw=2, zorder=3)
lab = {'중랑구','노원구','동대문구','구로구','관악구','용산구','강남구'}
for k, a, b in zip(GUS, dE, dW):
    if k in lab:
        ax.annotate(k, (a, b), xytext=(7, 5), textcoords='offset points', fontsize=12, color=INK2)
ax.set_xlim(-0.6, 9.8); ax.set_ylim(-14, 6)
ax.set_xlabel('전자담배 사용률 변화(%p, 2021→2025, 궐련형+액상형)', color=INK2, fontsize=13)
ax.set_ylabel('직장실내 간접흡연 노출률 변화(%p)', color=INK2, fontsize=13)
style(ax); ax.grid(axis='x', color=GRID, lw=1)
fig.subplots_adjust(left=0.11, right=0.98, top=0.97, bottom=0.12)
fig.savefig(OUT / 'fig2_gu.png'); plt.close(fig)

# ---------- 그림 3: 장소별 노출(2025, 서울, 조율) ----------
place = [('실외 공공장소', 79.5), ('실내 공공장소', 10.8), ('직장 실내', 6.9), ('가정 실내', 1.6)]
fig, ax = plt.subplots(figsize=(9.6, 3.4), dpi=200)
yy = np.arange(len(place))[::-1]
ax.barh(yy, [p[1] for p in place], color=BLUE, height=0.56, zorder=3)
for y_, (n, val) in zip(yy, place):
    ax.text(val + 1.2, y_, f'{val:.1f}%', va='center', fontsize=14, color=INK, fontweight='bold')
ax.set_yticks(yy, [p[0] for p in place]); ax.set_xlim(0, 92)
ax.tick_params(axis='y', labelsize=14)
style(ax); ax.grid(axis='y', visible=False); ax.grid(axis='x', color=GRID)
ax.set_xlabel('최근 1주일 동안 “다른 사람이 피우는 담배연기를 맡은 적”이 있는 담배 미사용자 비율', color=INK2, fontsize=12)
fig.subplots_adjust(left=0.2, right=0.98, top=0.97, bottom=0.2)
fig.savefig(OUT / 'fig3_place.png'); plt.close(fig)

# ---------- 그림 4: 장기 추세 2014~2025 (조율) ----------
yrs = [y for y in sorted(s['DT_201004_E050010']) if int(y) >= 2014]
fig, ax = plt.subplots(figsize=(9.6, 4.6), dpi=200)
xs = [int(y) for y in yrs]
c1 = [float(s['DT_201004_E050008'][y]) for y in yrs]
h1 = [float(s['DT_201004_E050010'][y]) for y in yrs]
ax.plot(xs, c1, color=BLUE, lw=3, marker='D', ms=8, mec=SURF, mew=2)
ax.plot(xs, h1, color=AQUA, lw=3, marker='^', ms=9, mec=SURF, mew=2)
ax.annotate(f'일반담배 흡연율 {c1[0]:.1f}→{c1[-1]:.1f}%', (xs[0], c1[0]), xytext=(0, 12), textcoords='offset points', fontsize=13, color=INK)
ax.annotate(f'가정실내 간접흡연 노출률 {h1[0]:.1f}→{h1[-1]:.1f}%', (xs[0], h1[0]), xytext=(0, 14), textcoords='offset points', fontsize=13, color=INK)
ax.set_xticks(xs, [str(x_)[2:] if x_ not in (2014, 2025) else str(x_) for x_ in xs])
ax.set_ylim(0, 25); ax.set_ylabel('%', color=INK2, fontsize=13)
style(ax)
ax.text(2020, 23.5, '2020년 가정실내 미산출', fontsize=11, color=MUTED, ha='center')
fig.subplots_adjust(left=0.07, right=0.98, top=0.95, bottom=0.1)
fig.savefig(OUT / 'fig4_long.png'); plt.close(fig)
print('ok')
