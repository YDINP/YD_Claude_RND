# volcano-forge (화산 대장간) 기획서

작성일 2026-11-27 · 대상: `tg-slot-hub` 신작 3종 중 하나(5×3 페이라인이 아닌 새 판)
근거 문서: `docs/research/PRAGMATIC_FORMATS.md`(추천 형태 1번), `docs/research/IMMERSION_HOOK_AUDIT.md`, `docs/research/SLOT_MARKET_TRENDS.md` §1.3, `docs/WAVE2_DESIGN.md` §2 #7·§3-2·§3-4·§3-6, `docs/GAME_CATALOG.md` §2 #7·§4, `docs/FEATURE_RESEARCH.md` 2.2·2.4·2.5, `docs/PLAN_candy-cluster-pop.md`(구성 모범)

| 항목 | 값 |
|---|---|
| id / 이름 | `volcano-forge` / 화산 대장간 / Volcano Forge (가제를 그대로 쓴다. 뜻이 바로 보이고 더 쉬운 대안이 없다) |
| 형태 | 6열 × 5행, **위치 무관 지불(같은 그림 8개 이상)** + 낙하 연쇄 |
| 이 게임의 얼굴 | 판 위 **화로 배율 줄**. 연쇄 중 새로 떨어진 칸에서 솟은 **불씨**(배율)가 줄로 날아가 쌓이고, 연쇄가 끝나면 합계를 곱한다 |
| 재미 장치 | **화로 가득 두 배** — 줄의 화로 칸 4개가 다 차면 그때까지의 합계가 두 배 |
| 보너스 | 모루 4개 이상 → 프리스핀 10회. 프리스핀 동안 화로는 꺼지지 않는다(합계가 스핀 사이에 쌓인다) |
| 겹치지 않는 것 | candy-cluster-pop(인접 클러스터·연쇄 사다리·주문 카드), greenhouse-garden(식물·자라는 판), aurora-ice-palace(얼음·빛). 이 게임은 인접 개념이 없고 사다리도 없다. 배율은 오직 판 밖 줄에서 온다 |

---

## A. 재미 장치 결정

### A-1. 후보 3개

모두 «위치 무관 지불 + 연쇄 + 판 밖 배율 줄» 위에 얹는 규칙이다. 상용 게임의 이름·규칙 묶음을 옮긴 것은 없다.

**후보 1 — 화로 가득 두 배**

- **플레이 경험.** 줄에 화로 칸 4개가 있다. 불씨가 하나 들어올 때마다 칸이 하나씩 붉게 달아오른다. 네 번째 칸이 켜지는 순간 풀무가 바람을 불어 넣고 합계가 두 배가 된다. 칸은 다시 비고 합계는 남는다.
- **다르게 느껴지는 점.** «얼마가 나오나»에 더해 **«한 칸만 더»**라는 눈에 보이는 진행이 생긴다. 프리스핀에서 화로가 꺼지지 않으니 라운드 내내 칸 채우기가 이어진다.
- **비용.** 엔진 작음(합계·칸 수 두 정수, 순수 함수 하나). 허브 중간(칸 4개 DOM + 두 배 연출). 렌더러 0(장치 자체. 위치 무관 빛 고리 분기는 §6-2).
- **RTP 위험.** 중간. 두 배가 합계에 겹쳐 꼬리를 늘린다. 합계 상한(300)과 라운드 지급 상한(5,000×)으로 묶는다.

**후보 2 — 담금질 판정**

- **플레이 경험.** 정산 직전 물통이 기울고, 서버 추첨으로 «치익 — 두 배» 또는 «그대로»가 나온다.
- **다르게 느껴지는 점.** 매 정산이 작은 동전 던지기가 된다. 진행이 없어 «다음 판을 누를 이유»는 약하다.
- **비용.** 엔진 작음(추첨 1회), 허브 작음.
- **RTP 위험.** 낮음. 다만 운 판정이 하나 더 붙는 것뿐이라 새로움이 낮고, 두 배 도전(sheriff)과 인상이 겹친다.

**후보 3 — 불씨 달구기**

- **플레이 경험.** 줄에 들어간 불씨가 그 뒤 연쇄가 한 번 이어질 때마다 한 단계씩 커진다(2 → 3 → 5…).
- **다르게 느껴지는 점.** 연쇄 길이가 곧 배율이다. 그러나 «연쇄마다 배율이 오른다»는 candy의 사다리와 같은 문장이 된다.
- **비용.** 엔진 중간(단계별 재계산), 허브 중간.
- **RTP 위험.** 높음. 연쇄 길이와 배율이 곱으로 엮여 분산이 커진다.

### A-2. 점수 (5점 만점)

| 후보 | 재미·새로움 | 430px 판독성 | 구현 비용(높을수록 쌈) | 튜닝 용이 | candy와 구별 | 합계 |
|---|---:|---:|---:|---:|---:|---:|
| 1 화로 가득 두 배 | 5 | 5 | 4 | 3 | 5 | **22** |
| 2 담금질 판정 | 2 | 4 | 5 | 5 | 4 | 20 |
| 3 불씨 달구기 | 4 | 3 | 3 | 2 | 1 | 13 |

### A-3. 선택: 화로 가득 두 배

1. **진행이 보인다(프리스핀에서).** 몰입 점검의 1순위 지적이 «다음 판을 누를 이유가 화면에 없다»였다(IMMERSION §0). 프리스핀에서는 켜진 칸이 스핀 사이에 남아 «한 칸만 더»가 라운드 내내 판 위에 떠 있다. **기본 게임에서는 줄이 스핀마다 비므로** 칸 4개가 한 스핀 안에 다 차는 일은 드물다(수천 판에 한 번 수준의 깜짝 사건). 기본 게임의 «다음 판» 근거는 불씨(약 50판에 한 번 줄이 켜짐)와 모루 칩·프리스핀 빈도 1/160이 맡는다. 기본 게임에서 칸을 스핀 사이에 남기는 안은 베팅을 바꿔 가며 칸을 키우는 악용(칸은 낮은 베팅에서 채우고 마지막 칸 직전에 베팅 올리기)과 RTP가 베팅 전략에 따라 달라지는 문제가 있어 버렸다.
2. **줄이 주인공이 된다.** 공통 조건의 «배율 줄 중심»을 그대로 구현한다. 판 안에는 배율 글자가 남지 않는다(UX 4차 «릴 위 텍스트 금지»).
3. **비용이 작다.** 합계·칸 수 두 정수와 순수 함수 하나다. 렌더러는 손대지 않는다(§6).
4. **candy와 확실히 다르다.** 사다리 없음, 인접 없음, 목표 카드 없음.

---

## 0. 기존 문서와 대조한 결과

| # | 기존 문서 | 이 기획의 결정 | 이유 |
|---|---|---|---|
| O1 | 카탈로그 §2 #7·WAVE2 §2 #7 `olympus-nectar`(6×5 위치 무관 + 배수 오브)는 미착수다 | volcano-forge가 이 자리를 쓴다. 메카닉 계열만 잇고 테마·심볼·이름·연출은 새로. 카탈로그 #7에 «volcano-forge로 대체» 한 줄을 리드가 단다 | 같은 형태 두 벌을 만들 이유가 없다 |
| O2 | 카탈로그 `payModel: { type: 'pay-anywhere' }` / WAVE2 `'anywhere'` | `payModel: 'anywhere'`(문자열 열거, 기존 `'lines'|'ways'|'cluster'`에 덧붙임) | 지금 스키마가 문자열 열거다 |
| O3 | 오브는 리필 칸에서만 생긴다(WAVE2 §2 #7) | **그대로 채택.** 불씨는 리필 칸마다 확률 1회로 생긴다 | RNG 소비 횟수가 결과로 정해지고, «새로 떨어진 칸에서 불씨가 솟는다»는 연출과 맞는다(리필 칸은 기둥 위쪽이다. 터진 자리 그 자체가 아님을 문구·연출 모두에서 지킨다) |
| O4 | 오브가 칸을 차지하는가 — 문서에 없음 | **불씨는 칸을 차지하지 않는다.** 칸의 그림은 그대로이고 불씨는 덧붙어 튀어 나가 줄로 날아간다 | 지불 판정이 불씨와 완전히 분리된다. 연쇄 코드를 거의 안 바꾸고, 기본 판 수학과 배율 수학을 따로 맞출 수 있다 |
| O5 | 오브 최고값 100(카탈로그) → 50(WAVE2) | 불씨 최고값 50 | WAVE2 §3-6: 100 꼬리 하나가 필요 표본을 2.7배로 늘린다 |
| O6 | 합 상한 500(카탈로그) / 300(WAVE2) | **화로 합계 상한 300** | 두 배 장치가 있어 낮은 쪽을 고른다 |
| O7 | `maxCascades` 20(카탈로그) / 12(WAVE2) | 12 | candy와 같은 예산표를 쓴다 |
| O8 | 오브는 릴 좌측 여백에 세로로 쌓는다(카탈로그 UX) | **판 위 가로 줄(허브 DOM)** | 공통 조건이 «판 위쪽 배율 줄»을 지정. 6×5는 폭에 묶여 좌측 여백을 쓰면 셀이 10% 작아진다 |
| O9 | `RoundState.persistMultiplier?`·`orbSum?`(WAVE2 §3-3) | `RoundState.carry.forge`(candy O4와 같은 방식). 새 DB 컬럼 없음 | 스핀 간 상태는 carry 하나로 모은다 |
| O10 | candy는 라운드 누적 상한을 못 건다(`spin.ts` 주석) | `carry.forge.paid`로 라운드 누적 지급을 들고 다녀 **라운드 5,000× 상한**을 건다 | 프리스핀에서 합계가 쌓이므로 라운드 상한이 필요하다 |
| O11 | candy는 연쇄 데이터를 `rounds.cascades` 컬럼에 저장 | 연쇄는 같은 컬럼을 쓰고, 불씨·화로 결과는 **`forgeRail` 피처**로 `rounds.features`에 들어간다. 마이그레이션 없음 | 말판(hanbok)·코인(kraken)과 같은 방식 |
| O12 | 클러스터 강조는 외곽선(candy) | 위치 무관 승리는 **칸마다 빛 고리 + 같은 그림 동시 «한 번 히트»(커졌다 돌아옴) → 짧은 멈춤 → 팝**(사용자 취향 «히트 한 번→딜레이→팝», 반복 맥동 금지). 선을 긋지 않는다 | 사용자 취향 «당첨 선 그리기 금지». 흩어진 칸에 외곽선을 그리면 선처럼 보인다 |
| O13 | 사다리 `multiplierLadder` 필수(candy 스키마) | `[1]`로 둔다(사다리 없음) | 배율 출처를 화로 하나로 둔다 |
| O14 | 카탈로그 §4 종료 규칙 1~3 | §3-5 표로 전부 적용(정수 하드 캡 + 단조 감소 척도 + 지급 캡) | 엔진이 강제해야 한다 |

---

## 1. 한 줄 컨셉과 «왜 재밌나»

> 같은 그림 8개면 어디 있든 터진다. 새로 떨어진 칸에서 불씨가 솟아 판 위 화로로 날아가고, 화로 칸 넷이 차면 합계가 두 배. 모루 넷이면 화로가 꺼지지 않는 프리스핀.

**순간마다 손에 땀을 쥐는 것**

| 순간 | 플레이어가 바라는 것 | 화면이 주는 근거(실제 결과로만) |
|---|---|---|
| 착지 | «검이 7개… 하나만 더» | 같은 그림 개수를 WinStrip 위 작은 숫자 칩으로 보여 주지 않는다(판독 과부하). 대신 8개가 되면 그 그림 전부가 동시에 한 번 히트해 «어디든 된다»가 한눈에 읽힌다 |
| 터지고 떨어질 때 | «불씨 튀어라» | 리필된 칸에서 불씨가 솟아 줄로 날아가며 값(×2~×50)을 보여 준다 |
| 줄이 찰 때 | «한 칸만 더» | 3칸이 켜지면 4번째 칸이 숨 쉬듯 깜박인다. 4칸 → 풀무 바람 → 합계 숫자가 두 배로 굴러 오른다 |
| 모루 3개 | «넷째가 떨어져라» | 줄 오른쪽 «모루 3/4» 칩이 붉게 바뀌고 낮은 북소리. 연쇄 리필로 넷째가 내려올 수 있다(기존 기대감과 같은 원칙: 꾸며낸 니어미스 없음) |
| 정산 | «얼마 곱해지나» | 연쇄 합 → 망치가 줄을 내려치며 «×합계» → 금액이 한 번에 커진다 |
| 프리스핀 | «지금 ×40인데 검 8개만 오면» | 화로가 꺼지지 않는다. 판이 돌 때마다 지금 합계가 줄에 크게 떠 있다. 모루 3개면 +5회 |
| 프리스핀 진입 | «다섯째 모루» | 모루 5개면 화로가 ×5, 6개면 ×10에서 시작한다 |

**몰입 점검 지적을 처음부터 피하는 방법**

| 지적(IMMERSION) | 이 게임의 대응 |
|---|---|
| 기대감 연출(§2.3) | 모루 카운터 칩, 3/4칸 숨쉬기, 불씨 비행 — 전부 서버 결과로만 켠다 |
| 보너스까지 거리(§1.2, §2.5) | 프리스핀 목표 **1/160**(평균 약 9분). 기본 베팅 20이면 잔액 10,000으로 500판, 그 안에 한 번도 못 볼 확률 약 4.4%. 판 밖 줄이 기본 게임에서도 «불씨 → 배율»을 늘 보여 줘 빈 시간을 채운다 |
| 손실 위장 연출(§2.2, A3) | 베팅 미만 당첨에는 줄 연출·소리를 붙이지 않는다(숫자만). 정산 «×합계» 연출은 기본 게임에선 불씨가 있을 때만, 프리스핀에선 합계 > 1이고 당첨이 있을 때만. 어느 쪽이든 **곱한 뒤 금액이 베팅 미만이면 망치 연출·소리 없이 숫자만** |
| 보너스 결과가 초라함(§2.4, C2) | 종료 화면에 «베팅의 ×N», 최종 화로, 두 배 횟수, 최고 한 판 |

---

## 2. 그리드·지불·심볼·배당표

### 2-1. 그리드와 지불

| 항목 | 값 |
|---|---|
| 그리드 | 6릴 × 5행(30칸), 정사각 셀 |
| 지불 | 연쇄 단계마다 판 전체에서 그림별 개수를 센다. 8개 이상이면 그 그림 **전부**가 지급되고 사라진다 |
| 배당 기준 | 총 베팅액 × 배당표 배수(0.05 눈금, 베팅 20에서 정수) |
| 여러 그림 동시 | 한 단계에서 여러 그림이 8개 이상이면 전부 지급하고 함께 사라진다 |
| 와일드 | **없음**. 위치 무관 지불에서는 와일드가 «개수를 채우는 칸»일 뿐이라 화면이 복잡해지고, 개수 판정이 단순한 것이 이 형태의 장점이다(FEATURE_RESEARCH 2.4) |
| 스캐터 | 모루. 터지지 않는다. 연쇄가 끝난 판(`finalGrid`)에서 센다 |
| 빈칸 | **없음**. 스트립은 10종 심볼만 쓴다 |
| 연쇄 | 지워진 칸 위로 남은 그림이 떨어지고 빈자리는 스트립에서 이어 받는다(strip-pull, RNG 0회). 최대 12단계 |
| 사다리 | 없음(`multiplierLadder: [1]`) |
| 베팅 레벨 | 20 / 40 / 100 / 200 / 500 / 1000 (기본 20 — IMMERSION A4 원칙) |
| 셀 크기 | 430px 약 65px, 390px 약 59px(candy 실측과 같은 6×5 창) |

### 2-2. 심볼표 (10종, 빈칸 없음)

| id | 이름(ko / en) | 등급 | 실루엣(58px·28px 구별 기준) |
|---|---|---|---|
| `sword` | 불꽃 검 / Flame Sword | 최상 | 대각선으로 선 긴 칼날, 칼날에 주황 불꽃 결 |
| `hammer` | 대장장이 망치 / Smith Hammer | 상 | 굵은 사각 머리 + 짧은 자루, 머리에 달군 붉은 빛 |
| `shield` | 둥근 방패 / Round Shield | 상 | 원형, 가운데 금속 돌기, 붉은 테 |
| `helmet` | 투구 / Helmet | 중상 | 반구 + 양옆 볼가리개, 쇳빛 |
| `ruby` | 붉은 원석 / Ruby | 하 | 둥근 다면 컷, 진홍 |
| `crystal` | 푸른 수정 / Blue Crystal | 하 | 세로 기둥 결정 3개 묶음, 하늘색 |
| `horseshoe` | 편자 / Horseshoe | 하 | U자, 은색, 못 구멍 |
| `ingot` | 쇠 주괴 / Iron Ingot | 하 | 사다리꼴 막대, 회청색 |
| `coal` | 석탄 / Coal | 최하 | 울퉁불퉁 검은 덩어리, 갈라진 틈마다 주황 빛, 밝은 테두리광 |
| `anvil` | 모루 / Anvil (스캐터) | 특수 | 유일하게 넓고 낮은 실루엣, 위에 작은 불꽃 |

불씨는 심볼이 아니다(칸을 차지하지 않는 덧붙임, §3-1).

### 2-3. 배당표 초안 (총 베팅액 배수)

개수 구간 4단: 8–9 / 10–11 / 12–14 / 15+. 값은 이 게임용으로 새로 정했다(튜닝 때 선형 배율 1회).

| 심볼 | 8–9 | 10–11 | 12–14 | 15+ |
|---|---:|---:|---:|---:|
| sword | 8 | 20 | 40 | 100 |
| hammer | 4 | 10 | 20 | 50 |
| shield | 2.5 | 6 | 12 | 30 |
| helmet | 1.5 | 4 | 8 | 20 |
| ruby | 1 | 2 | 5 | 12 |
| crystal | 0.8 | 1.6 | 4 | 10 |
| horseshoe | 0.6 | 1.2 | 3 | 8 |
| ingot | 0.4 | 1 | 2.5 | 6 |
| coal | 0.3 | 0.75 | 2 | 5 |

| 모루(스캐터) 개수 | 지급 | 덤 |
|---|---:|---|
| 4 | 2 | 프리스핀 10회 |
| 5 | 6 | 프리스핀 10회 + 시작 배율 ×5 |
| 6 이상 | 40 | 프리스핀 10회 + 시작 배율 ×10 |

모루 지급은 화로 배율을 받지 않는다(기본·프리스핀 모두).

### 2-4. 불씨 값표 (가중치 합 1000)

| 값 | ×2 | ×3 | ×4 | ×5 | ×8 | ×10 | ×15 | ×25 | ×50 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 가중치 | 380 | 250 | 150 | 100 | 60 | 35 | 15 | 8 | 2 |

기대값 약 3.97. 기본 게임과 프리스핀이 같은 표를 쓰고, 등장 확률만 다르다(§3-1).

---

## 3. 피처 규칙 전문

### 3-1. 불씨 (기본 게임·프리스핀 공통)

1. 연쇄 단계에서 새로 채워진 칸(리필 칸)마다 불씨 판정을 1번 한다. 처음 착지한 30칸에는 불씨가 없다.
2. 확률은 기본 게임 `chanceBase`, 프리스핀 `chanceFree`(정수 만분율, 초안 45 / 1000).
3. 맞으면 값표에서 값을 1번 뽑는다.
4. 불씨는 칸의 그림을 바꾸지 않는다. 그 칸은 다음 단계 판정에 평소대로 쓰인다.
5. 불씨는 연쇄가 이어지는 동안 차례대로 줄로 들어간다(아래 3-2).
6. 리필은 당첨이 있어야 생기므로 **불씨는 언제나 당첨이 있는 스핀에만 생긴다.** 기본 게임에서 «불씨가 꺼져 버리는» 일이 없다.

### 3-2. 화로 배율 줄과 «화로 가득 두 배»

줄 상태는 두 정수다: **화로 합계** `heat`(0 이상), **켜진 칸 수** `filled`(0~3).

불씨가 하나 들어올 때마다(생긴 순서대로):

1. `heat = min(heatCap, heat + 값)`
2. `filled += 1`
3. `filled == slots(4)`이면 **화로 가득**: `heat = min(heatCap, heat × fullMultiplier(2))`, `filled = 0`, 사건 기록

스핀이 끝나면:

- **기본 게임**: 이번 스핀의 줄은 0에서 시작한다. 불씨가 하나라도 있으면 이번 스핀 연쇄 지급 합 × `heat`. 없으면 ×1. 스핀이 끝나면 줄은 비워진다.
- **프리스핀**: 줄은 라운드 내내 이어진다(`carry.forge`). 그 스핀에 연쇄 지급이 있으면 연쇄 지급 합 × `max(1, heat)`(이번 스핀 불씨까지 더한 값). 지급이 없으면 줄은 그대로 남는다.

정산식(스핀 하나):

```
baseWin   = Σ 연쇄 단계 지급 (배율 전)
mult      = 기본: (불씨 있음 ? heat : 1)   프리스핀: max(1, heatAfter)
boosted   = round(baseWin × mult)
totalWin  = min(capRoom, boosted + scatterWin)
```

`heatCap` 300은 두 배를 포함한 상한이다. 합계가 300이면 이후 불씨는 칸만 채우고 합계는 그대로다(칸 4개가 차도 300 유지).

### 3-3. 프리스핀

| 항목 | 규칙 |
|---|---|
| 진입 | 유료 스핀의 `finalGrid`에 모루 4개 이상 → 10회 |
| 시작 배율 | 모루 5개 → `heat = 5`, 6개 이상 → `heat = 10`, 4개 → 0. `filled = 0` |
| 진입 스핀의 불씨 | 진입 스핀 자신의 불씨는 그 스핀 정산에만 쓴다(프리스핀 화로로 넘어가지 않는다) |
| 진행 | 매 스핀 남은 횟수 −1. 불씨는 `chanceFree`로 생기고 화로에 쌓인다 |
| 추가 스핀 | 프리스핀 중 `finalGrid`에 모루 3개 이상 → +5회. 4개 이상이면 모루 배당표 지급도 함께(배율 없음). 프리스핀 안 모루 5·6개는 시작 배율을 다시 주지 않는다(화로는 그대로). 라운드 총 횟수는 **최대 30회**(넘는 몫은 잘라 `freeSpinsCapped` 기록) |
| 종료 | 남은 횟수 0 또는 라운드 누적 지급이 상한에 닿을 때. `carry`가 사라지며 화로도 함께 사라진다(구조적 리셋) |
| 배율 적용 | 프리스핀 각 스핀의 연쇄 지급 × `max(1, heat)`. 모루 지급은 배율 없음 |

### 3-4. 상한

| 상한 | 값 | 처리 |
|---|---|---|
| 연쇄 | 12단계 | 12단계 뒤 남은 당첨은 미지급(candy와 같음) |
| 화로 합계 | 300 | 넘는 몫은 버림 |
| 프리스핀 총 횟수 | 30 | 넘는 추가 스핀은 버림 + `freeSpinsCapped` |
| 스핀 지급 | 5,000 × 총 베팅 | `round.maxWinCap`. 넘는 몫은 자르고 `winCapped` |
| 라운드 지급 | 5,000 × 총 베팅(진입 스핀 포함 누적) | `carry.forge.paid`로 누적. 닿으면 그 스핀에서 잘라 지급하고 **라운드를 즉시 끝낸다** + `winCapped` |

도움말에 «한 번의 스핀·한 번의 프리스핀 라운드 최대 당첨은 베팅의 5,000배»를 적는다.

### 3-5. 종료·발산 방지 (카탈로그 §4 규칙 1~3 적용)

| 루프 | 하드 캡 | 단조 감소 척도 | `r < 1` 근거 |
|---|---|---|---|
| 연쇄 | `maxCascades = 12` | `12 − 지난 단계 수` | 정적으로 못 구한다. 캡이 유일한 보장이고 `P(지속) ≤ 0.55`·평균 연쇄 ≤ 2.5를 감사에서 잰다 |
| 불씨 | 리필 칸 수 이하(≤ 30 × 12) | 남은 리필 칸 수 | 리필 칸마다 판정 1회, 반복 없음 |
| 화로 가득 | `heatCap = 300` | — | 합계 상한이 곧 캡. 두 배는 불씨 5개마다 1회라 불씨 수로 묶인다 |
| 프리스핀 | `maxRoundSpins = 30` | `30 − freeSpinsTotal`(추가) / `freeSpinsLeft`(소진) | 기존 `count × p < 1` 검사를 추가 스핀(5 × P(모루 3+))에도 적용. 예상 5 × 1/45 ≈ 0.11 |
| 라운드 지급 | 5,000× | `cap − paid` | 닿으면 즉시 종료 |

---

## 4. RNG 소비 순서 · 상태 · 응답 계약 · API

### 4-1. RNG 소비 계약 (provably fair의 전부)

```
릴 정지                 6회 (릴마다 nextInt(strip 길이))
뮤테이션                0회 (이 팩은 뮤테이션 없음)
연쇄 0..n              0회 (strip-pull)
불씨 판정               단계 0부터 차례로, 단계 안에서는 릴 0→5, 릴 안에서는 refill 배열 순서(위→아래)
                        리필 칸마다 nextInt(10000) 1회, 맞으면 값 추첨 pickWeighted 1회
스캐터·프리스핀 판정     0회
[API] 잭팟 판정          1회
```

- 불씨는 지불 판정에 영향이 없으므로 **연쇄를 다 계산한 뒤** 불씨를 판정한다. 연쇄 루프(`runCascades`)는 RNG 없는 그대로 둔다.
- 호출 수 = 6 + Σ리필 칸 + 불씨 수. 결과로 정해진다.
- 재생에 필요한 것: `seedInput + stateBefore + totalBet`(WAVE2 §3-2 공식 문구와 같다). `stateBefore`가 기본/프리스핀 확률과 화로 시작값을 정한다.
- `forge.test.ts`가 호출 수를 고정한다: 당첨 없는 스핀 6회, 리필 k칸·불씨 e개 스핀 6 + k + e회.

### 4-2. 엔진 타입

```ts
// types.ts (추가만)
export interface ForgeCarry { heat: number; filled: number; paid: number; fulls: number; bestSpin: number }
export interface RoundCarry { orders?: OrderRoundCarry; forge?: ForgeCarry }
export interface EmberDrop { step: number; position: GridPosition; value: number }
export interface ForgeRailTrigger {
  type: 'forgeRail'
  embers: EmberDrop[]                 // 생긴 순서
  heatBefore: number; filledBefore: number
  heatAfter: number;  filledAfter: number
  fulls: { afterEmber: number; heatBefore: number; heatAfter: number }[]   // 화로 가득 사건
  multiplier: number                  // 이번 스핀 연쇄 지급에 곱한 값 (1이면 미적용)
  baseWin: number; boostedWin: number
}
// FeatureTrigger 유니온 끝에 | ForgeRailTrigger
// WinLine.payKind 에 'anywhere' 추가, count = 판 전체 개수, positions = 그 그림 전부
```

- 불씨가 없고 프리스핀도 아닌 스핀은 `forgeRail` 피처를 싣지 않는다(응답이 가볍다).
- `WinLine.win`은 **배율 전** 값이다. 배율 몫은 `boostedWin − baseWin`. 감사 분해와 WinStrip이 이 둘을 쓴다.
- 기존 10종에는 `carry.forge` 키가 생기지 않는다.

### 4-3. 상태 흐름

```
유료 스핀 (state 없음)
  ├ 연쇄 → 불씨(chanceBase) → 줄 0에서 시작해 계산 → 정산
  └ 모루 ≥ 4 → features += freeSpins{10} → nextState = { freeSpinsLeft:10, freeSpinsTotal:10, multiplier:1,
                carry:{ forge:{ heat:시작배율, filled:0, paid:이 스핀 totalWin, fulls:0, bestSpin:0 } } }
프리스핀 (state.carry.forge 있음)
  ├ 연쇄 → 불씨(chanceFree) → 줄 = carry에서 이어 계산 → 정산(캡: 5,000×총베팅 − paid)
  ├ 모루 ≥ 3 → +5 (총 30 이내)
  └ left = freeSpinsLeft − 1 + 추가.  left == 0 또는 라운드 캡 도달 → nextState 없음(carry 소멸)
```

### 4-4. 응답 계약 (shared)

| 항목 | 변경 |
|---|---|
| `WinLineSchema` | `payKind`에 `'anywhere'` 추가(preprocess·refine은 candy 때 만든 규칙 그대로) |
| 새 스키마 | `ForgeCarrySchema`, `EmberDropSchema`, `ForgeRailFeatureSchema`(피처 유니온에 추가) |
| `RoundCarrySchema` | `forge: ForgeCarrySchema.optional()` 한 줄 |
| `freeSpinsSummary` | `forgeHeat?`, `forgeFulls?`, `bestSpin?` 선택 필드(종료 화면용) |
| `SpinDebugPresetSchema` | `forgeEmbers`, `forgeFull`, `forgeRetrigger` 끝에 추가 |
| 응답 크기 | 연쇄 12단계 최악 약 12KB(candy 상한 테스트 재사용) + 불씨 목록 약 1KB |

### 4-5. API 경로 (새 엔드포인트 없음)

| 경로 | 동작 |
|---|---|
| `POST /games/volcano-forge/spin` `{ totalBet, idempotencyKey, debug? }` | 엔진 스핀 → `cascades`·`finalGrid`·`features`(forgeRail 포함)·`freeSpins`(carry.forge 포함) |
| `GET /games/volcano-forge/state` | 진행 중 프리스핀의 `FreeSpinsState`(남은 횟수 + `carry.forge`). **새로고침하면 화로 합계·켜진 칸·남은 횟수가 그대로 복원** |
| `GET /rounds/:id/seed` | `seedInput`·`stateBefore` 공개 → 허브 공정성 검증이 `replaySpin(math, bet, rng, stateBefore)`로 stops·승리·불씨·totalWin 일치 확인 |
| 멱등 재전송 | 같은 키 → 저장된 응답 조립. 불씨는 `features` jsonb 안에 있으므로 바이트 동일. 재실행하지 않는다 |
| 서버 권위 | 불씨 판정·값·화로 계산·정산은 엔진만 한다. 허브의 줄 애니메이션은 표시용이며 응답의 `heatAfter`·`filledAfter`로 덮는다 |
| 체험판 | `apps/hub/src/demo/server.ts`가 `games/*`를 빌드 때 묶고 같은 API 앱(`createApp` + `MemoryRepos`)을 탭 안에서 돌린다. 엔진·shared 변경만으로 동작하며 서버 코드 추가 작업 없음. `manifest.status`가 `hidden`인 동안은 디버그 URL로만 확인 |
| API 코드 변경 | `engineSpin.ts toSharedFeature`에 `forgeRail` 명시 분기(미지 피처가 `scatterWin`으로 떨어지지 않게), `debugSpin.ts`에 프리셋 3종 판정, 요약 조립에 선택 필드 3개 |

---

## 5. 수학 목표 · 튜닝 · 감사

### 5-1. 목표

| 지표 | 목표 |
|---|---|
| 기본 RTP(피처 포함) | **94.5%** ±0.5pp, 잭팟 1.5% 별도 → 총 96.0% |
| RTP 구성 | 연쇄 ×1 몫 55.5 + 기본 게임 불씨 배율 몫 10.0 + 모루 지급 2.0 + 프리스핀 27.0 |
| 적중률 | 약 27%(10~60% 게이트) |
| 평균 연쇄(첫 당첨 스핀 기준) | ≤ 1.6, `P(지속) ≤ 0.5` |
| 기본 게임 불씨 등장 | 당첨 스핀의 약 7% |
| 프리스핀 빈도 | **1/160** (허용 1/120~1/250) |
| 프리스핀 평균 지급 | 27.0 × 160 / 100 ≈ **43× 베팅** (목표 30~80×) |
| 프리스핀 라운드당 불씨 | 평균 약 4.5개(튜닝 목표 4~5.5), **화로 가득이 한 번 이상 나오는 라운드 ≥ 60%**(재미 장치가 «보이는» 빈도. 리포트 항목, 게이트 아님) |
| 추가 스핀 발생 | 프리스핀 1회당 약 1/45 |
| 최대 당첨 | 5,000× (스핀·라운드 각각) |
| 변동성 | high, 예상 σ 9~12 |
| 베팅 미만 당첨 비율 | 당첨 중 ≤ 50%(리포트 항목, 게이트 아님) |

### 5-2. 튜닝 손잡이와 순서

| 순서 | 손잡이 | 맞추는 것 | 성질 |
|---|---|---|---|
| 1 | 릴별 심볼 밀도(스트립 120칸 이상) | 적중률 27%, 평균 연쇄, `P(지속)` | 비선형, `tune-cli --strips` |
| 2 | 배당표 선형 배율(0.05 눈금 반올림) | 연쇄 ×1 몫 55.5 | 선형 |
| 3 | `chanceBase` | 기본 불씨 몫 10.0 | 거의 선형(작은 확률) |
| 4 | 모루 밀도 | 프리스핀 1/160, 모루 지급 2.0 | 비선형 |
| 5 | `chanceFree` | 프리스핀 몫 27.0, 라운드당 불씨 4.5, 가득 라운드 ≥ 60% | 단조 증가. 몫이 넘치면 `chanceFree`를 내리지 말고 6번(값표 꼬리)과 모루 지급으로 먼저 깎는다 — 가득 빈도가 재미의 얼굴이다 |
| 6 | 불씨 값표 상위 가중(25·50) | σ 상한 | 기대값 유지하며 꼬리만 깎기 |

1차 근사(감사 전 손계산): 당첨 스핀 평균 리필 칸 R ≈ 13. 기본 불씨 몫 ≈ 55.5 × (R × chanceBase) × (E[값] − 1) ≈ 55.5 × 13 × 0.0045 × 3.0 ≈ 9.7. 긴 연쇄일수록 지급과 리필이 같이 커지는 상관 때문에 실측은 더 크다 → 3단계에서 내린다.

### 5-3. 감사 게이트 (HOWTO §6 + candy M3 계승)

| 관문 | 기준 |
|---|---|
| CI(40만) | `|rtp−target| ≤ max(0.5pp, 3·SE)` + 재현성 + 정밀도 필드 |
| 정식 감사 | `|rtp−target| ≤ 0.5pp` **그리고** ci95 반폭 ≤ 0.2pp, `n ≥ n*` |
| 공통 | 레벨별 ±0.5pp · 적중률 10~60% · 최대 배수 ≥ 50× · 독립 MC 3SE · 분포 합 1 · 잭팟 포함 96.0 ±0.5 |
| 연쇄 | `P(지속) ≤ 0.55`, 평균 연쇄 ≤ 2.5, `maxCascades` 도달 < 0.01% |
| 화로 | 불씨 등장률(기본/프리스핀), 값 분포 실측이 값표와 3SE 안, 화로 가득 빈도, 합계 300 도달률, 분해 «연쇄 ×1 + 불씨 몫 = 기본 연쇄 지급» 등식 |
| 프리스핀 | 라운드 길이 ≤ 30(위반 0건), 진입률, 평균 지급(×베팅), 추가 스핀률 |
| 캡 | 스핀 캡·라운드 캡 도달률과 캡 on/off 차를 명시 |
| 회귀 | 기존 10종 골든 해시 동일(`packages/slot-engine/src/__golden__`) |

### 5-4. 예상 n*와 시간

- 파일럿 5M으로 σ̂를 잰다. `n* = ⌈(1.96·σ̂·1.1/0.002)²⌉`.
- σ̂ 9 → 약 95M, σ̂ 12 → 약 170M. candy는 예상 8에 실측 2.9였으므로 실측이 더 작을 가능성이 크다.
- σ̂ > 12면 불씨 ×50 가중을 2 → 1, ×25를 8 → 6으로 내리고 ×8·×10을 올려 기대값을 맞춘다.
- 시간: candy 정식 감사 실측은 25M 스핀 33.7초(4샤드, 샤드당 스핀 약 5.4µs). forge는 불씨 판정·프리스핀 화로로 약 1.5배 잡아 120M ≈ **4분**, σ̂ 15 상한(n* ≈ 265M)에서도 ≈ 9분. `--shards 4` 이하(자원 제한).
- **σ̂ 상한 15.** 파일럿 σ̂ > 15면 정식 감사 전에 아래 순서로 꼬리를 깎는다: 불씨 ×50 → ×25 가중 → `heatCap` 300 → 200. 최대 당첨 5,000×는 내리지 않는다(도움말 문구 고정).
- `manifest.auditSpins`에는 n*를 1천만 단위로 올림한 값.

### 5-5. 도구 변경 (`tools/rtp-sim`)

| 파일 | 내용 |
|---|---|
| `src/contributions.ts` | `forgeRail` 피처를 읽어 분해: `anywhere ×1 / emberBoost / scatter / freeSpins`. 개수 구간(8–9·10–11·12–14·15+)별 지급, 불씨 값 분포, 화로 가득 횟수 분포, 프리스핀 최종 합계 분포 |
| `src/report.ts` | 위 절 + «화로» 게이트 표 + 라운드 길이 분포(10~30) + 캡 도달률 |
| `src/tune-cli.ts` | 한 화면에 RTP 분해, 적중률, 평균 연쇄, 진입률, 라운드당 불씨, 화로 가득률, σ, n* |
| `src/compute.ts` | `anywhere`도 «총 베팅액 기준» 표기 |

---

## 6. 엔진·공용 패키지 변경 목록 (파일 단위)

원칙: **새 파일 위주. 공용 파일은 끝에 덧붙이는 한두 줄.** 기존 경로는 `math.forgeRail`·`payModel === 'anywhere'`가 없으면 한 글자도 다르게 돌지 않는다(골든 게이트).

### 6-1. 새 파일

| 파일 | 내용 |
|---|---|
| `packages/slot-engine/src/anywhere.ts` | `evaluateAnywhere(grid, math, totalBet, ladder)` → `{ wins, removed }`. 심볼 선언 순서로 비스캐터 개수를 세고 `payoutForCount`로 구간 배당. `positions` = 그 그림 전부(reel,row 정렬), `removed` = 합집합. 순수 함수 |
| `packages/slot-engine/src/forgeSchema.ts` | `AnywhereConfigSchema { minCount }`, `ForgeRailConfigSchema { slots, fullMultiplier, heatCap, spawn{chanceBase, chanceFree}, values, startHeat, retrigger{trigger, spins}, maxRoundSpins }`, `checkForgeRail(math, issue)` |
| `packages/slot-engine/src/forge.ts` | `rollEmbers(math, steps, rng, free)`(4-1 순서), `heatRail(start, embers, cfg)`(순수, 3-2), `resolveForgeSpin(...)`(3-2~3-4 정산·진입·추가·종료·캡) |
| `packages/slot-engine/src/anywhere.test.ts` | 손 그리드: 7개 미지급, 8개 1구간, 15개 최상 구간, 두 그림 동시, 스캐터 비지급, 30칸 한 그림 |
| `packages/slot-engine/src/forge.test.ts` | 불씨 판정 순서·호출 수, 화로 가득 경계(3→4칸), 합계 300 캡, 프리스핀 이월, 시작 배율, 추가 스핀 30 캡, 라운드 캡 즉시 종료, carry 소멸, `foldCascades === finalGrid` 2,000회 |
| `packages/slot-engine/src/forge-schema.test.ts` | 필수 조합(anywhere+cascade+scatter.freeSpins), 금지 조합(orderRound·coinRespin·boardBonus·stageRoulette), 값 키 양의 정수, 확률 0~10000, `heatCap ≥ 최대 값`, `maxRoundSpins ≥ count`, 추가 스핀 `count × p < 1` |
| `apps/hub/src/components/game/ForgeRail.tsx` + `.css` | 줄 DOM: 합계 상자 + 화로 칸 4개 + 모루 칩. 불씨 비행 토큰(DOM 풀 12개 재사용), 화로 가득 연출, 정산 «×N» 내려치기. 서버 값으로 확정 |
| `apps/hub/src/components/game/ForgeHelp.tsx` + `.css` | 도움말 탭 4개(§11) |
| `apps/hub/src/lib/audioForge.ts` | `forge` 효과음 레시피(§9) |
| `apps/hub/src/lib/bgmForge.ts` | `forge` 배경음 기본·프리스핀 변주 |
| `apps/hub/src/lib/forgeRail.test.ts` 등 | 줄 표시 계산이 엔진 `heatRail`과 같은지, 불일치 시 서버 값으로 덮는지 |
| `games/volcano-forge/*` | `manifest.json`(status hidden), `math.json`, `theme/theme.json`, `art/prompts.json`, `art/fx.json`, `README.md`, `CHECKLIST.md`, `thumb.webp` |

### 6-2. 공용 파일 (덧붙임 위주 최소 수정)

| 파일 | 수정 |
|---|---|
| `slot-engine/src/schema.ts` | `payModel` 열거에 `'anywhere'`. `anywhere`·`forgeRail` 선택 필드 2줄. refine: anywhere면 `anywhere`·`cascade` 필수, `paylines`·`ways`·`cluster` 금지, 배당 키 상한 `reels*rows`, 정수 검사 단위 1(총 베팅). `checkForgeRail` 호출 1줄 |
| `slot-engine/src/cascade.ts` | 평가기 선택 1줄: `math.payModel === 'anywhere' ? evaluateAnywhere : evaluateClusters` |
| `slot-engine/src/spin.ts` | `getBetUnit`에 anywhere → `totalBet` 1줄. `resolveSpin` 첫머리에 `if (math.forgeRail) return resolveForgeSpin(...)` 1줄 |
| `slot-engine/src/analytic.ts` | `isAnalytic`: anywhere·forgeRail이면 false |
| `slot-engine/src/types.ts` | §4-2 타입 추가, 유니온 끝에 한 줄 |
| `slot-engine/src/index.ts` | 새 함수·타입 export |
| `shared/src/schemas.ts` | §4-4 |
| `game-sdk/src/manifest.ts`·`validate.ts` | `payModel` 열거 `'anywhere'`, anywhere면 `lines` 0과 비교 |
| `game-sdk/src/theme.ts`·`renderer/src/types.ts` | `SoundPreset`에 `'forge'`(두 곳) |
| `renderer/src/ways.ts` | `betUnitCount`: anywhere도 1 |
| `renderer/src/pixi/cascadeFx.ts` | `payKind === 'anywhere'`면 외곽선 대신 칸별 빛 고리(기존 glow fx 재사용) 한 분기 |
| `apps/api/src/games/engineSpin.ts` | `toSharedFeature`에 `forgeRail` 분기 |
| `apps/api/src/games/debugSpin.ts` | 프리셋 3종 판정. 기본 게임 불씨 2개 스핀은 약 1/2,500이라 기본 한도 5,000회로는 자주 못 찾는다 → forge 3종은 `coinRespinFull` 선례대로 시도 한도 200,000(`FORGE_MAX_TRIES`). (`forgeEmbers`: 불씨 ≥ 2, `forgeFull`: 프리스핀 안 `fulls.length ≥ 1`, `forgeRetrigger`: 프리스핀 안 추가 스핀). 해당 피처 없는 게임은 409 |
| `apps/hub/src/components/game/GameScreen.tsx` | 연쇄 HUD에서 `math.forgeRail ? <ForgeRail/> : <LadderMeter/>` 1곳, `cascadeStep end`에서 `forgeRailRef.launch(step)` 1곳, 정산 직전 `forgeRailRef.settle()` 1곳, 도움말 탭 분기 1곳 |
| `apps/hub/src/components/game/RoundPopup.tsx` | 요약에 `forgeHeat`·`forgeFulls`·`bestSpin`이 있으면 3줄 더 표시 |
| `apps/hub/src/store/game.ts` | `forge: ForgeCarry \| null`을 서버 값(`SpinResponse.freeSpins.carry.forge`, `GET /state`)으로만 갱신 |
| `apps/hub/src/lib/debugPreset.ts` | `presetsFor(math)`: forgeRail 게임에만 3종 노출, `forgeFull`·`forgeRetrigger`는 라운드 밖에서 비활성 |
| `apps/hub/src/lib/audio.ts`·`bgm.ts` | `forge` 프리셋 등록 1줄씩 |
| `apps/hub/src/i18n/ko.ts`·`en.ts` | 사전 끝에 `forge.*`(줄·도움말·요약), `volcanoForge.*`(이름·한 줄 소개) |
| `apps/hub/src/components/GameCard.tsx` | anywhere 라벨 `6×5 · 8개 이상 어디서나` / `6×5 · Pay anywhere 8+` |

렌더러 Pixi 쪽 불씨 그리기는 **없다.** 불씨 토큰·줄·숫자는 전부 허브 DOM이고, 칸 좌표는 기존 `getCellRect`로 받는다(candy 주문 토큰과 같은 경로). 그래서 다른 팀과의 렌더러 충돌면이 `cascadeFx.ts` 한 분기로 줄어든다.

---

## 7. 화면 스토리보드 (390×844 / 430×932, 세로)

### 7-1. 배치 (위 → 아래)

| 띠 | 430px | 390px | 내용 |
|---|---:|---:|---|
| 상단 바 | 기존 | 기존 | 뒤로·제목·설정·지갑 |
| **화로 배율 줄** | 56px | 52px | 왼쪽 합계 상자(`×37`, 글자 26px 굵게) · 가운데 화로 칸 4개(칸당 40/36px 원형) · 오른쪽 모루 칩(`모루 3/4`, 평소 흐림) |
| 프리스핀 카운터 | 기존 WinStrip 카운터(`hub-win-strip__free-spins-counter`) | 같음 | `프리스핀 4/10`. 줄 안에 넣지 않는다(52px 줄 과밀). `FreeSpinsState.multiplier`는 1 고정이라 카운터에 `×N`이 붙지 않고, 화로 합계는 줄에만 보인다(같은 숫자 두 곳 금지) |
| 판(프레임 + 6×5) | 셀 약 65px | 셀 약 59px | 프레임 창 폭이 화면 폭의 약 96% |
| WinStrip(당첨 금액) | 기존 | 기존 | 컨트롤 바로 위(사용자 취향). `연쇄 3 · [검 아이콘 ×9] · 160`, 정산 때 `160 × 12 = 1,920` |
| 컨트롤 | 기존 | 기존 | 베팅·스핀·오토 |

줄 높이는 프리스핀 진입·종료 때 변하지 않는다(캔버스 리사이즈 0). 기본 게임에서도 줄은 늘 보이며 합계 상자는 `×1` 흐림 상태다.

### 7-2. 장면별

| 장면 | 화면 | 시간(normal) |
|---|---|---|
| 기본 꽝 | 릴 회전 → 착지 | 기존 약 1.6s |
| 기본 당첨 단계 | 같은 그림 전부 동시 한 번 히트 + 칸마다 빛 고리 → 짧은 멈춤 → 팝(쇳가루 입자, 코드) → 낙하·리필 | 강조 300 / 팝 180 / 낙하 300 = 780ms, 3단계부터 ×0.78 |
| 불씨 튐 | 리필 칸에서 불씨가 솟아(120ms) 화로 칸으로 날아감(380ms, 다음 단계 강조와 겹침) → 칸 점화(120ms) + 합계 숫자 틱 | 추가 시간 0(겹침). 마지막 단계 뒤에만 +380ms |
| 3칸 켜짐 | 4번째 칸이 숨쉬듯 깜박 | — |
| 화로 가득 | 연쇄 일시정지 → 풀무 그림이 줄 왼쪽에서 바람 → 칸 4개가 합계 상자로 흘러듦 → 합계가 두 배로 굴러 오름 → 칸 비움 | 900ms |
| 정산(기본: 불씨 있을 때, 프리스핀: 합계 > 1 + 당첨. 곱한 금액이 베팅 미만이면 숫자만) | 망치가 줄 합계 상자를 내려침 → WinStrip `160 × 12` → 금액 롤업 | 600ms + 기존 롤업 |
| 모루 3개 | 모루 칩 붉게 + 낮은 북 반복, 남은 릴 감속(기존 기대감, normal·quick만) | 기존 +800ms |
| 프리스핀 진입 | 모루 강조 → 전환 클립(쇳물이 덮음) → 줄이 «꺼지지 않는 화로» 상태(테두리 불꽃 루프, 코드) → 시작 배율이 있으면 합계 상자에 `×5`가 쾅 → 자동 진행 | 강조 1.2s + 클립 3.0s + 0.6s |
| 프리스핀 진행 | 매 스핀 줄 합계가 이어짐. 당첨 스핀은 정산 연출, 꽝 스핀은 합계가 살짝 숨쉼 | 스핀당 약 3~4s |
| 추가 스핀 | 모루 3개 강조 → 카운터 `+5` 튀어 오름 | 900ms |
| 프리스핀 종료 | 전환 클립(망치가 식은 쇠판을 깨뜨림) → 종료 화면: 총 획득, «베팅의 ×43», 최종 화로 ×N, 화로 가득 k회, 최고 한 판 | 클립 3.0s + 화면(탭으로 닫기) |
| 빅윈 | 정산이 다 끝난 뒤 한 번(공용 셀레브레이션, theme 스킨) | 등급별 기존 |

라운드 총 길이 예상: 진입 약 5s + 10스핀 × 3.5s + 종료 약 4s ≈ 45초.

### 7-3. 속도 모드 예산

| 모드 | 강조/팝/낙하 | 단계 | 불씨 비행 | 화로 가득 | 정산 | 12연쇄 + 가득 2회 + 정산 게이트 |
|---|---|---:|---:|---:|---:|---:|
| normal | 300/180/300 | 780ms | 380ms | 900ms | 600ms | ≤ 7.5s |
| quick | 210/120/210 | 540ms | 260ms | 600ms | 400ms | ≤ 5.2s |
| turbo | 130/100/170 | 400ms | 180ms | 400ms | 300ms | ≤ 3.8s |
| 모션 축소 | 100/0/80 | 180ms | 0(칸 숫자만) | 250ms(숫자만) | 250ms | ≤ 3.0s |

### 7-4. 스킵 / STOP

- 릴이 도는 중 STOP: 기존 스냅 착지 → 압축 연쇄.
- 연쇄 중 STOP: 남은 단계는 candy 규칙대로 압축(`max(90, min(220, 1200/남은 수))`ms, 낙하는 위치 트윈, 제자리 텍스처 교체 없음).
- 불씨: 비행 토큰을 즉시 치우고 칸·합계를 서버 `heatAfter`·`filledAfter`로 바로 맞춘다. 화로 가득은 250ms 숫자 연출만, 정산 250ms.
- 두 번째 탭은 무시. 금액은 압축 전후 동일.
- 메모리: 불씨 토큰 DOM 12개 풀 재사용, GSAP 타임라인은 스핀마다 `kill()`, 언마운트 때 전부 정리. `props` 텍스처는 `TextureRegistry` 소유로 렌더러 종료 시 해제, 전환 클립은 기존 지연 로드.

---

## 8. 아트 목록

### 8-1. 컨셉

- **용암 대장간, 밝은 모바일 캐주얼.** 덩어리감 있는 스타일라이즈드 3D, 점토처럼 부드러운 음영. 아래에서 올라오는 용암 테두리광 + 왼쪽 위 부드러운 주광.
- 팔레트: 용암 주황 `#ff7a1a`, 불꽃 노랑 `#ffd23f`, 마그마 빨강 `#e8432e`, 쇳빛 남흑 `#2b2f3a`, 쇠 회색 `#8a94a6`, 크림 하이라이트 `#fff3e0`.
- 금지: 화면을 가로지르는 사선 광택, 실사 사진풍, 글자, 사람·손.
- 릴 뒤판(`reelBackdrop`)은 따뜻한 짙은 고동 `#3a2620` — 석탄(검정)과 쇠(회색)가 묻히지 않는 중간 명도.

### 8-2. 자산표 (생성 20장 + 클립 2편)

| 키 | 종류 | 생성 → 출력 | 프롬프트 초안(공통 앞머리 뒤에 붙는 부분) |
|---|---|---|---|
| `sword` | symbol | 1024² → 512 | a short broad flame sword standing diagonally, blade glowing orange with flowing flame grain, chunky golden crossguard, the most ornate symbol |
| `hammer` | symbol | 1024² → 512 | a blacksmith hammer with a thick square iron head glowing red-hot at the face, short wooden handle wrapped in leather |
| `shield` | symbol | 1024² → 512 | a round iron shield with a raised central boss and a lava-red painted rim with rivets |
| `helmet` | symbol | 1024² → 512 | a rounded steel helmet with cheek guards, warm reflected lava light on the dome |
| `ruby` | symbol | 1024² → 512 | a round faceted ruby gemstone, deep crimson with a warm inner glow |
| `crystal` | symbol | 1024² → 512 | a cluster of three upright pale blue crystal columns on a tiny rock base |
| `horseshoe` | symbol | 1024² → 512 | a silver horseshoe standing upright U-shape with nail holes |
| `ingot` | symbol | 1024² → 512 | a single trapezoid blue-grey iron ingot bar seen from 3/4 |
| `coal` | symbol | 1024² → 512 | a lumpy black coal chunk with glowing orange cracks and a bright warm rim light so it reads on dark backgrounds |
| `anvil` | symbol | 1024² → 512 | a heavy dark iron anvil, the ONLY wide low silhouette, a small bright flame dancing on its flat top |
| `frame` | frame | 1024² → 1080 | 6×5 창 규격(아래 8-3) |
| `bg` | bg | 1024×1536 → 1080 | inside a cheerful volcano forge: warm stone walls, lava rivers glowing far below, hanging chains and racks of finished weapons as soft background silhouettes, low contrast in the centre band where the reels sit |
| `bgFreeSpins` | bg | 1024×1536 → 1080 | the great forge hearth at full blaze: a huge furnace mouth roaring orange, bellows on the side, sparks drifting, brighter and hotter than the base background |
| `thumb` | thumb | 1536×1024 → 640 | a red-hot sword and hammer bursting from a 6×5 board while glowing embers fly up into a row of four lit furnace slots |
| `sword-win` `hammer-win` `anvil-win` (**선택 — D5 여유 시**) | sheet 3×3 @12fps | 1024² → 768 | 각 심볼이 달아올랐다 식는 9프레임(불꽃 결이 흐름). 팝 입자는 코드 |
| `ember` | props | 1024² → 512 | a single glowing ember orb, bright yellow core fading to orange, tiny flame wisps on top, no number |
| `furnace-slot` | props | 1024² → 256 | a small round iron furnace mouth seen front-on, dark inside (켜짐은 CSS 필터·빛으로) |
| `bellows` | props | 1024² → 512 | a leather and wood blacksmith bellows, side view, no hands |

**코드 드로잉이 나은 것(이미지 생성 안 함)**: 불씨 값 숫자(DOM 글자), 화로 칸 켜짐 빛(CSS), 줄 받침대(CSS 그라데이션, 사선 광택 없음), 당첨 칸 빛 고리(렌더러 glow fx), 팝 쇳가루·불꽃 입자(렌더러 코드 입자), 프리스핀 줄 테두리 불꽃 루프(CSS), 모루 칩(CSS).

공통 앞머리 초안(`stylePrefix`):

```
Bright casual mobile slot game icon, chunky stylized 3D render with soft clay-like shading, warm lava rim light
from below and a soft key light from the top-left, palette of lava orange (#ff7a1a), ember yellow (#ffd23f),
magma red (#e8432e), dark iron (#2b2f3a), steel grey (#8a94a6) and cream highlights (#fff3e0), bold simple
silhouette that reads at 58px, no diagonal light streaks, no watermark, no baked-in drop shadow, premium mobile
slot game asset quality —
```

`negative` 초안: photorealistic photography, text, letters, numbers, random glyphs, watermark, signature, faces, hands, fingers, people, busy cluttered background, cropped edges, multiple duplicate objects, diagonal glare streaks across the image.

심볼 끝맺음은 candy와 같이 «centered composition with 10% padding, isolated on a flat solid #00FF00 chroma-key green background (no green spill)».

### 8-3. 프레임 창 비율

- 6×5 정사각 셀 → 창 종횡비 6:5(1.2). **1024×1024 정사각 캔버스**, 선언 창 x 2–98% / y 10–90%(0.96 : 0.80 = 1.2).
- 마퀴 y 0–10%(낮고 윗변 직선, 높은 아치 금지), 받침 y 90–100%(짧게), 좌우 레일 각 2% 이하(ART_DIRECTION v4·v4.1 교훈).
- 프레임 테마: 검은 쇠 띠 + 리벳, 마퀴에는 작은 불꽃 등잔 한 줄(글자 없음), 받침은 낮은 돌 받침.
- 창 안은 «pure flat #00FF00, nothing painted inside» 문장을 고정. 생성 후 **알파 투명 영역 실측**으로 `frameLayout.window`를 확정한다(창 안 흰 칠에 속는 자동 감지 금지). 430px에서 6열이 창에 맞는지 브라우저로 확인.

### 8-4. 생성 절차와 검수

- `pnpm --filter @tgslot/theme-gen gen games/volcano-forge --provider codex --only <자산>`을 한 번에 1~2장.
- 매 회 `pnpm --filter @tgslot/theme-gen contact games/volcano-forge` → contact.png를 열어 id와 그림 1:1, 58px·28px에서 실루엣 구별(특히 ruby/crystal, ingot/horseshoe, coal 가독) 눈 검수.
- 중단된 gen 뒤에는 theme.json 필수 키 전부(심볼 10·frame·background·backgroundFreeSpins·frameLayout·palette·celebration·sound) 재확인, `--reprocess`로 다시 채움.
- 사용량 한도 소진이면 로컬 SDXL로 대체하지 않고 멈추고 남은 목록을 보고.

### 8-5. theme.json 연출 항목

```json
"celebration": {
  "palette": { "core": "#ffd23f", "edge": "#ff7a1a", "glow": "#e8432e80" },
  "particles": { "shapes": ["spark", "shard", "coin"], "symbols": ["sword", "hammer"], "motion": "tumble" },
  "rays": { "style": "beams" }, "waves": { "style": "double" }, "title": { "font": "slab" }
},
"sound": { "preset": "forge" },
"props": { "ember": "props/ember.webp", "furnace-slot": "props/furnace-slot.webp", "bellows": "props/bellows.webp" }
```

키 모양은 `packages/game-sdk/src/theme.ts` `CelebrationSkinSchema`(palette·particles·rays.style·waves.style·title.font) 기준이다. 새 파티클 모양은 만들지 않는다(공용 열거 충돌 방지).

---

## 9. 효과음·배경음 프리셋 `forge`

### 9-1. 효과음 (`audioForge.ts`, 합성)

| 이벤트 | 소리 | 다른 프리셋과 다른 점 |
|---|---|---|
| 스핀 시작 | 풀무 바람: 저역 대역 잡음이 부풀었다 빠짐(180→900Hz, 350ms) | 팝·딸깍·기포가 아닌 «공기» |
| 릴 정지 | 쇠 «탁»: 90Hz 몸통 40ms + 1.3kHz 비정수 배음 짧은 울림 | 종·나무 딱따기와 다른 짧은 금속 |
| 당첨 강조 | 모루 «깡»: 배음비 1 : 2.76 : 5.40 비정수 금속 울림, 연쇄 단계마다 온음씩 높아짐(최대 6단) | 맑은 차임(bell·clockwork)과 갈리는 거친 금속 |
| 팝 | 쇳물 «치익»: 고역 대역 잡음 120ms 감쇠 | |
| 낙하 | 낮은 «쿵» 70Hz 50ms | |
| 불씨 튐 | 장작 «탁탁» 크래클 3알 | |
| 불씨 도착 | 짧은 «훅» 불길 + 칸 번호에 따라 단조 펜타토닉 한 음씩 상승(4단) | 진행감 |
| 3칸 숨쉬기 | 1.5Hz 낮은 웅웅 드론, 아주 작게 | |
| 화로 가득 | 풀무 2회 → 불길 «화르륵»(로우패스 열리는 잡음 상승) → 톱니 3화음 스탭 | 게임의 얼굴 소리 |
| 정산 ×N | 망치 3연타 «깡깡깡» 상행 → 기존 롤업 | |
| 모루 3개 기대감 | 60Hz 북 2타 반복 + 용암 드론 | |
| 프리스핀 추가 | 모루 «깡» 2음 + 불길 | |
| 작은 당첨(베팅 미만) | 소리 없음 또는 아주 짧은 «탁»(A3 원칙) | 손실 위장 금지 |

### 9-2. 배경음 (`bgmForge.ts`)

| 항목 | 기본 | 프리스핀 |
|---|---|---|
| 빠르기·조성 | 104bpm, A 믹솔리디안(밝음) | +2반음, 같은 빠르기 |
| 리듬 | 2·4박에 작은 모루 핑(금속 비정수 배음), 1·3박 둥근 북 | 16분 셰이커 + 모루 핑 8분 |
| 베이스 | 둥근 사인 + 약한 2배음, 뒷박 | 같음 |
| 선율 | 뮤트된 사각파 플럭 | 금관풍 톱니 패드 대선율 추가 |
| 레벨 | LUFS −30~−32, 단일 샘플 스파이크 0 | 같음 |

### 9-3. earshot 판정 기준 (SOUND_CHECK 방식)

- 같은 이벤트끼리 기존 9개 프리셋(bell·fruit·western·shrine·clockwork·candy·deepsea·hanbok·idol)과 **CLAP 코사인 ≤ 0.90**. 특히 clockwork(금속 틱)·western(쇠 소리)과 비교.
- 배경음도 기존 곡과 ≤ 0.90.
- 효과음 true peak ≤ −1 dBTP, 꼬리 클릭 0.
- 결과는 `docs/SOUND_CHECK.md`에 «volcano-forge 사운드» 절로 기록. **최종 귀 판정은 사용자 몫**이라고 적는다(화로 가득·정산 망치·배경음 3개를 «들어볼 파일»로).

---

## 10. 전환 클립 2편 (TRANSITION_DESIGN 규칙)

발주: `D:/park/tgslot-wt/_tools/vidgen-t2v.mjs` 재사용, `node --env-file=D:/park/YD_Claude_RND/ben_suno/.env`(키 출력·복사 금지), 9:16 1080p 13초, 편당 $0.93, 2편 + 재시도 1편 최대(**총 $2.79 상한**). 소스·프롬프트·로그는 `D:/park/tgslot-wt/_qa/volcano-forge-clips/`에 남겨 재편집 가능하게(candy F13 교훈). 컷 3.0s, 16fps / q60 / 360×640 / loop 1, `check:clips` 통과.

### 10-1. 진입 — 쇳물이 쏟아져 덮는다

> 커다란 도가니가 사슬에 매달려 스스로 기울고, 빛나는 주황 쇳물이 위에서 쏟아져 **흘러내리는 그 동작으로** 화면 전체를 덮는다. 덮인 뒤에도 쇳물 표면이 계속 흐르고 일렁인다.

**왜 이 팩인가.** 라운드의 정체는 «꺼지지 않는 화로»다. 쇳물은 불투명하고(R1) 표면이 늘 흘러 단색 정지로 굳지 않는다(R11). 도가니가 사슬로 스스로 기울어 손이 필요 없다(R4).

```
Vertical full-screen game transition effect, chunky stylized 3D render with soft clay-like shading, bright casual mobile game art, not photorealistic. A huge round iron crucible hanging from chains tilts by itself at the top of a cheerful volcano forge and pours thick glowing molten orange metal. One continuous motion repeats: the molten metal pours down from the top and spreads sideways in thick glowing waves until the whole frame is completely opaque edge to edge, corner to corner, a seamless sheet of flowing molten orange and yellow metal, holding fully covered for a beat while the molten surface keeps rippling, swirling and glowing so the covered frame is never a flat still color, then the molten sheet drains away downward and the forge shows through before the next pour. The pouring and the frame being covered are one single motion, never separate steps. Each full cycle lasts about three seconds and repeats about four times across the clip. Lava orange #ff7a1a, ember yellow #ffd23f, magma red #e8432e, dark iron #2b2f3a accents, warm light from below. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

### 10-2. 복귀 — 망치가 식은 쇠판을 깨뜨린다

> 화면을 가득 채운 검붉게 식은 쇠판 위로 큰 망치가 스스로 내려와 **쾅 치고, 그 충격으로 쇠판이 조각나 불꽃과 함께 날아가며** 맑은 장면이 드러난다.

**왜 이 팩인가.** 진입이 «부어서 덮음»이니 복귀는 «쳐서 깸»으로 방향을 바꾼다(R6, 역재생 아님). 망치는 정산 연출의 망치와 같은 물건이라 라운드 끝이 한 번에 읽힌다. candy 복귀의 R14 후보 교훈대로 드러나는 장면은 짧게 쓴다(풍경을 길게 쓰면 처음부터 뒤에 깔린다).

```
Vertical full-screen game transition effect, chunky stylized 3D render with soft clay-like shading, bright casual mobile game art, not photorealistic. A cooled dark red-black iron plate with faint glowing cracks fills the whole frame edge to edge, corner to corner, and a giant blacksmith hammer swings down by itself from above. One continuous motion repeats: the hammer strikes the plate with a heavy clang, and that same strike shatters the whole plate into chunky glowing pieces that fly off the edges of the frame with bright orange sparks, revealing a calm clear warm orange glow, then a fresh iron plate slides back in and covers the whole frame corner to corner in complete opacity for a beat while its cracks keep pulsing with light, before the hammer strikes again. The strike and the plate shattering are one single motion, never separate steps. While the frame is covered the cracks keep glowing and shifting, never a flat still color. Each full cycle lasts about three seconds and repeats about four times across the clip. Lava orange #ff7a1a, ember yellow #ffd23f, magma red #e8432e, dark iron #2b2f3a, steel grey #8a94a6. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

**재시도 규칙(1편 한정).** 진입이 덮지 못하면(쇳물이 반투명 빛으로만 나옴) 첫 문장을 «a thick opaque wall of molten metal fills the frame»으로 앞세워 재발주. 복귀가 처음부터 장면을 비추면 opaque DOM 오버레이 근거(candy F13 (1))로 `opaqueMs: 0` 채택을 먼저 검토한다. 끝 프레임과 `bg.webp` 평균색 거리를 candy처럼 재서 이음매를 기록한다.

---

## 11. 도움말 페이지

`ForgeHelp.tsx` 탭 4개. 그림은 전부 CSS 그리드(`aspect-ratio: 1` 정사각 칸)와 심볼 아이콘(@128)이라 칸이 찌그러지지 않는다. 글은 한국어 기본, 영어 사전 동봉.

| 탭 | 그림 | 문장 |
|---|---|---|
| ① 지불 | 6×5 작은 판(셀 28~32px)에 검 8개가 흩어져 빛나는 그림 1장 + 개수 구간 표(8–9·10–11·12–14·15+, 심볼 아이콘 행) | «같은 그림이 판 어디에든 8개 이상이면 지급합니다. 줄이나 붙어 있는 것은 상관없습니다.» «배당은 총 베팅액 기준입니다.» |
| ② 연쇄와 불씨 | 전·후 작은 판 2장(터진 칸이 비고 위에서 떨어짐, 새 칸 하나에 불씨) | «당첨된 그림은 사라지고 위에서 새 그림이 떨어집니다. 새로 채워진 칸에서 불씨가 튈 수 있습니다.» 불씨 값 ×2~×50 |
| ③ 화로 배율 줄 | 줄 그림(합계 상자 + 칸 4개 중 3개 켜짐) → 4개 켜짐 → 합계 ×2 화살표 | «불씨는 판 위 화로로 들어가 합계에 더해집니다. 연쇄가 끝나면 이번 연쇄 당첨에 합계를 곱합니다.» «불씨는 새로 떨어진 칸에서 솟습니다.» «화로 칸 4개가 다 차면 합계가 두 배가 됩니다. 합계는 최대 ×300입니다.» |
| ④ 프리스핀 | 모루 4·5·6 아이콘 줄 + 표 | «모루 4개 이상: 프리스핀 10회. 5개면 화로 ×5, 6개면 ×10에서 시작.» «프리스핀 동안 화로는 꺼지지 않습니다.» «모루 3개: +5회(최대 30회).» «한 번의 스핀과 한 번의 프리스핀 라운드 최대 당첨은 베팅의 5,000배입니다.» «이론 환수율 94.5%(잭팟 별도).» |

배당표 숫자는 `math.json`에서 읽어 그린다(손으로 적지 않는다). 390px에서 글 잘림 없음.

---

## 12. 기능별 QA 확인표 (기능마다 한 번, 시간 경과 QA 없음)

디버그 프리셋으로 상황을 만든 뒤 390·430 두 폭에서 한 번씩 보고 스크린샷을 `D:/park/tgslot-wt/_qa/`에 남긴다.

| 기능 | 만드는 법 | 확인 |
|---|---|---|
| 위치 무관 지불 | `win` | 8개 이상 그림 전부 동시 한 번 히트 → 멈춤 → 팝(반복 맥동 없음), 칸 빛 고리, 선 없음 / WinStrip `[아이콘 ×개수]`가 판 개수와 같음 / 7개는 미지급 |
| 연쇄 | `cascade3` | 팝·낙하가 위치 트윈 / 마지막 판 = `finalGrid` / 단계마다 «깡» 음 상승 |
| 불씨 튐·비행 | `forgeEmbers` | 불씨가 리필 칸에서 솟아 칸으로 / 스핀 끝 줄 값 = 서버 `heatAfter`·`filledAfter` / 단계당 토큰 ≤ 8 |
| 정산 ×N | `forgeEmbers` | WinStrip `연쇄 합 × 합계 = 금액`, 금액 = 서버 `totalWin` / 불씨 없는 당첨에는 정산 연출 없음 |
| 화로 가득 | 프리스핀 안 `forgeFull` | 4번째 칸 → 풀무 → 합계 두 배 → 칸 비움 / 합계 300에서 멈춤(엔진 테스트로 대체 가능) |
| 기대감 | 모루 3개 착지 판(`freeSpins` 탐색 중 관찰) | 모루 칩 3/4 붉게 + 북, normal·quick 감속, turbo·모션 축소 꺼짐 |
| 프리스핀 진입 | `freeSpins` | 모루 강조 → 쇳물 클립 → 줄 테두리 불꽃 → 카운터 `프리스핀 1/10` / 모루 5·6이면 시작 배율 표시 |
| 프리스핀 이월 | 라운드 중 스핀 2회 | 화로 합계가 다음 스핀으로 이어짐, 꽝 스핀에도 유지 |
| 추가 스핀 | `forgeRetrigger` | `+5`, 총 30 넘지 않음 |
| 프리스핀 종료 | 라운드 끝까지 | 망치 클립 → 종료 화면의 총 획득·×베팅·최종 화로·가득 횟수·최고 한 판 = 서버 요약 / 종료 후 줄 `×1` |
| 라운드 상한 | 엔진 테스트 + 디버그 `bigWin` | `winCapped` 시 즉시 종료, 금액 5,000× |
| 새로고침 복원 | 라운드 중 `location.reload()` | 남은 횟수·화로 합계·켜진 칸 동일 |
| 멱등·공개 | 같은 키 재전송 / 공정성 검증 | 바이트 동일·원장 1건 / stops·승리·불씨·totalWin 일치 |
| STOP | 회전 중·연쇄 중·화로 가득 중 | 제자리로 바뀌는 심볼 0, 줄이 서버 값으로 즉시 확정, 금액 동일 |
| 빅윈 | `bigWin` | 정산 뒤 한 번, forge 스킨 |
| 도움말 | `?` | 4탭 숫자 = math.json, 칸 정사각, ko/en, 390 잘림 없음 |
| 사운드 | 위 장면들 | 화로 가득·정산 망치·배경음 기본/프리스핀 변주, 커튼 덕킹, earshot 수치 기록, 사용자 귀 판정 1회 |
| 레이아웃 | 기본·라운드 | 430 셀 ≥ 64, 390 셀 ≥ 58, 줄 높이 고정(리사이즈 0), 불씨 숫자 판독 |
| 체험판 | `pnpm --filter @tgslot/hub build:demo` 후 정적 서버로 열기 | 스핀·프리스핀·새로고침 복원 동작 |
| 디버그 노출 | 다른 게임에서 프리셋 | forge 3종은 volcano-forge에만, 다른 게임은 409 |
| 회귀 | 기존 10종 각 1스핀 + 골든 | 골든 해시 동일, candy 연쇄·주문 카드 정상 |
| 메모리 | 50스핀 + 라운드 1회 전후 힙 스냅샷 | 불씨 토큰 DOM 수 고정, 타임라인 누수 0, 게임 나가면 props 텍스처 해제 |

---

## 13. 위험과 대안

| # | 위험 | 대안 |
|---|---|---|
| K1 | 다른 두 신작·개선안 팀과 공용 파일 병합 충돌(스키마 열거·유니온·i18n·GameScreen·audio 등록·디버그 열거) | 공용 파일은 끝에 덧붙이는 한두 줄만(§6-2). 로직은 `forge.ts`·`ForgeRail.tsx` 등 새 파일. 병합 때 리드가 열거·유니온 줄을 합친다 |
| K2 | σ가 커서 n*가 커지고 감사가 오래 걸림 | 불씨 상위 가중을 깎는 손잡이(§5-4). 그래도 크면 `heatCap` 300 → 200 |
| K3 | 프리스핀 몫이 `chanceFree`에 비선형이라 수렴이 느림 | `tune-cli` 2M 샤드(약 1분)로 이분 탐색, 마지막에 배당표 선형 배율로 미세 조정 |
| K4 | 위치 무관 지불은 베팅 미만 당첨이 많다(낮은 그림 8개 = ×0.3) | 하위 배당을 낮추고 적중률을 27%로 눌러 당첨 하나의 크기를 키움. 베팅 미만 당첨은 연출·소리 없음(A3). 리포트에 비율 기록 |
| K5 | 석탄이 어두워 58px에서 안 보임 | 밝은 테두리광 + 주황 틈을 프롬프트에 고정, 뒤판 `#3a2620`. 그래도 묻히면 «구리 주괴»로 교체(실루엣 사다리꼴과 겹치지 않게 둥근 덩어리 구리 원석) |
| K6 | 상용 게임(6×5 위치 무관 + 배율 합산)과 닮아 보임 | 메카닉 계열만 공유. 판 밖 줄·화로 가득 두 배·시작 배율·4구간 배당·와일드 없음·대장간 테마·쉬운 이름으로 새로 구성. 신·오브·사탕 폭탄 같은 기존 소재 금지 |
| K7 | 표시용 줄 값이 서버와 어긋남 | 표시는 엔진 `heatRail`과 같은 순수 규칙(공유 import), 응답 값으로 덮고 불일치 진단 로그 + 테스트 |
| K8 | 불씨 DOM 비행이 저사양 폰에서 끊김 | 토큰 풀 12개, 단계당 8개 상한, 모션 축소 시 비행 생략, transform·opacity만 애니메이트 |
| K9 | 쇳물 클립이 반투명 빛으로만 나와 덮지 못함(R1) | §10 재시도 규칙 1편. 그래도 실패면 단색 커튼 폴백 없이 «쇳물 판 + 불투명 DOM 오버레이» 근거로 채택 여부를 리드가 판단 |
| K10 | 프레임 창이 선언보다 작게 생성됨 | 알파 실측으로 `frameLayout` 확정, 마퀴·받침 낮게 못박은 문장으로 재생성 1회 |
| K11 | 사운드가 clockwork·western과 붙음(금속) | 모루 «깡»을 비정수 배음 + 저역 몸통으로, 틱 계열 금지. earshot 0.90 넘으면 레시피 교체 |
| K12 | 라운드 상한 즉시 종료가 기존 세션 배관과 어긋남 | `nextState` 없음 = 정상 종료와 같은 경로. API 테스트로 캡 종료 후 `GET /state`가 비었는지 확인 |
| K13 | Codex 이미지 한도 소진 | 생성 우선순위: 심볼 10 → frame → bg 2 → props 3 → thumb → 시트 3. 소진 시 멈추고 남은 목록 보고(SDXL 대체 금지) |
| K14 | 적중률 27%라 프리스핀 10회 중 약 7회가 꽝 — 화로 합계가 커도 «곱할 당첨»이 라운드에 2~3번뿐이라 지루할 수 있음 | 프리스핀 꽝 스핀은 추가 지연 0(기본 꽝 리듬 그대로), 줄 합계 상자 아래 «다음 당첨 ×N» 한 줄로 긴장 유지. 파일럿에서 «당첨 스핀 ≤ 1인 라운드» 비율을 리포트하고 25%를 넘으면 스트립 밀도(손잡이 1)로 적중률을 30~32%로 올린다. 프리스핀 전용 스트립은 렌더러가 `stops`로 착지하는 구조라 렌더러·기대감 코드를 바꿔야 해서 버린다 |
| K15 | 디버그 프리셋이 기본 게임 불씨 2개 판을 기본 한도 5,000회 안에 못 찾음(약 1/2,500) | forge 3종 시도 한도 200,000(§6-2, `coinRespinFull` 선례) |

---

## 14. 팀 레인과 일정 (코어·연출·아트·사운드 각 1명 + 기획 팀장)

| 레인 | 소유 파일 |
|---|---|
| 팀장(기획) | 이 문서, `games/volcano-forge/{README,CHECKLIST}.md`, 통합 확인, 이미지 눈 검수, QA 표 |
| 코어 | `slot-engine/src/{anywhere,forge,forgeSchema}.ts` + 테스트, 공용 엔진 덧붙임, `shared/src/schemas.ts`, `apps/api` 2파일, `tools/rtp-sim` 분해·리포트, `math.json`·`manifest.json`, `docs/RTP_AUDIT_volcano-forge.md` |
| 연출 | `ForgeRail`·`ForgeHelp`·`RoundPopup` 덧붙임·`GameScreen` 연결·`store`·`debugPreset`·i18n·`cascadeFx` 분기·`GameCard` |
| 아트 | `games/volcano-forge/{art,theme}/**`, `thumb.webp`, 전환 클립 |
| 사운드 | `audioForge.ts`, `bgmForge.ts`, 등록 줄, `docs/SOUND_CHECK.md` 절 |

| 날 | 코어 | 연출 | 아트 | 사운드 |
|---|---|---|---|---|
| D0(반나절) | 계약 동결: §4-2 타입·§4-4 shared·스키마 모양, `heatRail` 순수 함수 먼저 | 픽스처 응답으로 ForgeRail 정적 | 스타일 락(심볼 2장) | 레시피 스텁 |
| D1 | `anywhere.ts`·스키마·`cascade.ts` 분기·골든 확인 | ForgeRail 비행·가득·정산 | 심볼 10 | 효과음 초안 |
| D2 | `forge.ts` 정산·프리스핀·캡·RNG 테스트, API 분기·디버그 | GameScreen 연결·STOP·새로고침 복원 | frame·bg 2·props | 배경음 |
| D3 | 감사 도구 분해 → 파일럿 → 튜닝 1~4 | 도움말·종료 화면·i18n | thumb·시트·클립 발주 | earshot 비교·수정 |
| D4 | 튜닝 5~6 → 정식 감사(샤드 4) | 체험판 빌드·390/430 QA | 클립 컷·`check:clips`·`pack:check` | SOUND_CHECK 기록 |
| D5 | 여유 → status live 판단은 리드 | 기능별 QA 표 완료 | 남은 흠 정리 | 귀 판정 대기 |

임계 경로: **계약 → `anywhere.ts` → `forge.ts` → 감사 분해 → 튜닝 → 정식 감사.**

게이트: typecheck 전부 · `pnpm -r --no-bail test` · `pnpm pack:check` 0/0 · `rtp-sim audit volcano-forge --shards 4` 전 항목 통과 · 골든 동일 · 체험판 빌드 · §12 표 전부.

---

## 15. 검수 반영 (2026-11-27, 기획서 비평)

기획의 뼈대(위치 무관 8+ · strip-pull 연쇄 · 판 밖 화로 줄 · carry.forge · 새 파일 위주 · RNG 계약)는 그대로 둔다. 다시 짤 문제는 없고, 아래를 고쳤다.

| # | 무엇을 | 왜 |
|---|---|---|
| V1 | **화로 칸 5개 → 4개**, `filled` 0~3, 프리스핀 라운드당 불씨 목표 3.5 → 4.5, `chanceFree` 초안 770 → 1000, «가득 1회 이상 라운드 ≥ 60%»를 목표로 추가(§3-2·§5-1·§5-2) | 원안 수치(라운드당 불씨 3.5, 가득 라운드 약 25%)로는 이 게임의 재미 장치가 프리스핀 넷 중 셋에서 한 번도 안 보인다. 1/160 × 25% = 약 640판에 한 번. 칸 4개 + 불씨 4.5개면 포아송 근사로 약 65%가 된다. 칸이 하나 줄어 390px 줄 폭에도 여유가 생긴다(5×36px + 합계 상자 + 모루 칩이 358px 안에서 빠듯했다). 프리스핀 몫이 넘치면 `chanceFree`가 아니라 값표 꼬리·모루 지급으로 먼저 깎도록 튜닝 순서에 못박았다 |
| V2 | A-3 «칸이 다음 판을 누를 이유를 늘 띄운다»를 **프리스핀 한정**으로 바로잡고, 기본 게임에서 칸을 스핀 사이에 남기는 안을 버린 이유를 적음 | 기본 게임은 줄이 스핀마다 비어서 한 스핀에 4~5개 불씨가 나오는 일은 거의 없다. 원안의 근거 문장이 사실과 달랐다. 기본 게임에서 칸을 남기면 낮은 베팅으로 칸을 채우고 마지막 칸 직전에 베팅을 올리는 악용이 생기고, RTP가 베팅 전략에 따라 달라져 감사가 성립하지 않는다 |
| V3 | «터진 자리에서 불씨가 튄다» → «새로 떨어진 칸에서 불씨가 솟는다»(표 머리·§1·O3·도움말) | 규칙상 불씨는 리필 칸, 곧 기둥 위쪽에서 생긴다. 문구·연출이 터진 자리를 가리키면 화면과 규칙이 어긋나 «조작처럼 보인다» |
| V4 | 당첨 강조 «동시 맥동» → «한 번 히트 → 짧은 멈춤 → 팝»(O12·§1·§7-2·§12) | 사용자 취향 «연쇄는 히트 한 번→딜레이→팝». 렌더러에 이미 `CASCADE_HIT_PORTION`이 있으니 그대로 쓴다 |
| V5 | 정산 «×합계» 연출 조건을 기본/프리스핀으로 나누고, **곱한 뒤 베팅 미만이면 숫자만**(§1·§7-2) | 원안은 «불씨가 있을 때만»이라 프리스핀에서 합계가 이어져 곱해지는 당첨(새 불씨 없음)에 연출이 빠지는 모순이 있었다. 손실 위장 연출(A3) 원칙도 곱한 뒤 금액 기준으로 적용한다 |
| V6 | 프리스핀 카운터를 줄 안에서 빼고 기존 WinStrip 카운터 사용, `FreeSpinsState.multiplier` 1 고정(§7-1) | 52px 줄에 카운터 글자까지 넣으면 390px에서 과밀하다. 기존 카운터가 `×N`을 붙이는 경로라 multiplier를 1로 두어 화로 합계와 숫자가 두 곳에 뜨지 않게 한다 |
| V7 | 프리스핀 안 모루 4개 이상 처리 명시: 추가 스핀 + 모루 배당표 지급, 시작 배율 재지급 없음(§3-3) | 원안은 프리스핀 안 모루 4~6개의 지급·배율이 정해져 있지 않았다. 엔진·도움말·감사 분해가 서로 다르게 구현할 수 있었다 |
| V8 | 감사 시간 추정 13분 → 약 4분(σ̂ 15에서 9분)으로 정정, **σ̂ 상한 15**와 넘을 때 깎는 순서 추가(§5-4) | candy 정식 감사 실측(25M 스핀 33.7초, 4샤드)을 기준으로 다시 계산했다. 상한·화로 이월·두 배 때문에 σ가 candy(2.9)보다 훨씬 크므로, 넘을 때의 손잡이 순서를 미리 정해 둔다. 5,000× 상한은 도움말 문구라 고정 |
| V9 | 디버그 프리셋 forge 3종 시도 한도 200,000(§6-2, K15) | 기본 게임 불씨 2개 스핀은 약 1/2,500이라 기본 한도 5,000회에서 자주 409가 난다 |
| V10 | K14 «프리스핀 꽝 7/10» 위험과 대응 추가. 프리스핀 전용 스트립 안은 버림 | 적중률 27%면 곱할 당첨이 라운드에 2~3번뿐이다. 전용 스트립은 렌더러가 `stops`와 기본 스트립으로 착지하고 기대감도 `stops`로 계산해서 렌더러를 고쳐야 한다(다른 팀과 충돌면 확대). 대신 파일럿 지표로 적중률 손잡이를 쓴다 |
| V11 | 심볼 달아오름 시트 3장을 **선택(D5 여유 시)**으로 내림 | 한 팀 5일 범위에서 아트 20장 + 클립이 임계에 가깝다. 시트는 없어도 히트·빛 고리·코드 입자로 당첨이 읽힌다 |

**확인했고 고치지 않은 것.** (b) 형태는 6×5 위치 무관 + 낙하 + 배율 합산이라 장르 메커닉을 공유하지만, 판 밖 4칸 화로·가득 두 배·모루 수별 시작 배율·4구간 배당·와일드 없음·대장간 테마로 따로 짜였다. 프리스핀 10회·추가 +5는 장르 흔한 수라 그대로 둔다. greenhouse-garden(칸 안 씨앗 배율 + 자라는 판, 인접 클러스터)·aurora-ice-palace(다이아몬드 격자)와 겹치지 않는다. (c) 연쇄 12·프리스핀 30·화로 300·라운드 5,000× 모두 정수 하드 캡과 단조 척도가 있고, 기존 10종은 `math.forgeRail`·`payModel: 'anywhere'`가 없으면 경로가 같다(골든 게이트). (d) 불씨를 연쇄를 다 계산한 뒤 정해진 순서로 굴려 `runCascades`가 RNG 없이 남고, carry.forge(`paid` 포함)가 stateBefore에 들어가 재생·새로고침·멱등·체험판이 기존 경로로 성립한다. (e) 6×5는 폭에 묶여(candy 실측 430 65.5px·390 59.4px) 줄 높이 56px가 LadderMeter 22px보다 커도 셀이 줄지 않는다 — §12 레이아웃 행에서 실측으로 확인.

---

## 16. 구현 계약 (코어 레인 완료, 2026-11-27)

엔진·수학·공용 계약·API·체험판·감사까지 구현했다. 화면(화로 줄·도움말·당첨 빛 고리)·아트·전환 클립·사운드는 이 절만 보고 붙이면 된다.
기획서와 달라진 값은 C-7에 모았다.

### C-1. 엔진 (`packages/slot-engine`)

| 파일 | 내용 |
|---|---|
| `src/anywhere.ts` (새) | `evaluateAnywhere(grid, math, totalBet, ladder)` → `{ wins, removed }`. 선언 순서로 비스캐터·비와일드 개수를 세고 `anywhere.minCount` 이상 + 배당 구간이 있으면 그 그림 전부 지급. `WinLine.payKind = 'anywhere'`, `line = -1`, `positions` = 그 그림 칸 전부(reel,row 오름차순), `ladder = 1` |
| `src/forgeSchema.ts` (새) | `AnywhereConfigSchema { minCount }`, `ForgeRailConfigSchema { slots, fullMultiplier, heatCap, spawn{chanceBase, chanceFree}(만분율 정수), values{값:가중치}, startHeat{모루 수:시작 합계}, retrigger{trigger, spins}, maxRoundSpins }`, `checkAnywhere`, `checkForgeRail` |
| `src/forge.ts` (새) | `rollEmbers` · `heatRail`(순수, 허브 표시 계산에 그대로 import) · `startHeatFor` · `resolveForgeSpin` · `EMBER_CHANCE_SCALE = 10000` |
| `src/schema.ts` | `payModel` 열거에 `'anywhere'`, `anywhere`·`forgeRail` 선택 필드, anywhere 분기(`checkAnywhere`), 배당 단위 = 총 베팅액·키 상한 `reels*rows`, 끝에 `checkForgeRail` |
| `src/cascade.ts` | 평가기 선택 1줄(`payModel === 'anywhere' ? evaluateAnywhere : evaluateClusters`) |
| `src/spin.ts` | `getBetUnit` anywhere → 총 베팅액, `resolveSpin` 첫머리 `if (math.forgeRail) return resolveForgeSpin(...)` |
| `src/analytic.ts` | `isAnalytic`: anywhere·forgeRail이면 false(몬테카를로 전용) |
| `src/types.ts` | `ForgeCarry`·`EmberDrop`·`ForgeFullEvent`·`ForgeRailTrigger`, `RoundCarry.forge?`, `WinLine.payKind`에 `'anywhere'`, `FeatureTrigger` 유니온 끝에 `ForgeRailTrigger` |
| 테스트 | `anywhere.test.ts`(6) · `forge.test.ts`(20) · `forge-schema.test.ts`(9). 골든 7팩 해시 동일 |

스키마가 막는 것: anywhere에 paylines·ways·cluster·와일드, minCount 미만 배당 키, 키 > 30, 정수 아닌 지급 / forgeRail에 payModel ≠ anywhere, cascade·round·scatter.freeSpins 없음, orderRound·coinRespin·boardBonus·stageRoulette·mutations 동시 사용,
사다리 값 ≠ 1, `scatter.freeSpins.retrigger = true`(추가 스핀은 forgeRail.retrigger), `scatter.freeSpins.multiplier ≠ 1`, 값표 빈 것·정수 아님, 확률 0~10000 밖, `heatCap < 최대 값`,
`maxRoundSpins < 진입 스핀 수` 또는 > 엔진 상한, startHeat 키 < 진입 개수·> 칸 수·값 > heatCap·단조 감소, 추가 스핀 트리거 > 칸 수.

**RNG 소비 계약** (`seed:nonce` 하나로 스핀이 재생된다)

```
① 릴 정지 6회              nextInt(strip[reel].length), 릴 0→5
② 연쇄 0..n                0회 (strip-pull, 최대 12단계)
③ 불씨 판정                단계 0부터 → 릴 0→5 → refill[reel] 배열 순서(위→아래)
                           리필 칸마다 nextInt(10000) 1회, 값 < chance면 값 추첨 pickWeighted(values) 1회
④ 스캐터·진입·추가·정산     0회
⑤ [API] 잭팟 판정           nextInt(JACKPOT_ODDS_DENOMINATOR) 1회 (마지막)
```

호출 수 = 6 + Σ리필 칸 + 불씨 수(엔진 테스트·API 테스트가 고정). 불씨는 연쇄를 다 푼 뒤 굴리므로 `runCascades`는 RNG 없이 그대로다.
`refill[reel][i]`는 다음 판의 그 릴 `i`행에 떨어지므로 불씨 위치는 `[reel, i]`(릴 위쪽, 터진 자리가 아니다).

**정산식** (`resolveForgeSpin`)

```
baseWin   = Σ 연쇄 단계 지급(배율 전)               = SpinResult.lineWin
rail      = heatRail(시작, embers)                 시작: 기본 {0,0} / 프리스핀 carry.forge {heat, filled}
multiplier= 기본: (불씨 있음 ? rail.heat : 1)       프리스핀: max(1, rail.heat)
room      = 5000×bet − (프리스핀이면 carry.paid, 아니면 0)
boostedWin= min(baseWin × multiplier, room)
scatterWin= min(모루 배당 × bet, room − boostedWin)  = SpinResult.scatterWin (배율 없음)
totalWin  = boostedWin + scatterWin                 잘렸으면 winCapped{requested, granted, cap}
```

### C-2. 응답 계약 (`packages/shared`)

| 항목 | 내용 |
|---|---|
| `WinLineSchema.payKind` | `'anywhere'` 추가. `line = -1`, `count` = 판 전체 개수, `positions` = 그 그림 전부. `win`은 **배율 전** 값이다 |
| `FeatureTriggerSchema` | 끝에 `ForgeRailFeatureSchema` (아래) |
| `RoundCarrySchema` | `forge: ForgeCarrySchema.optional()` — `{ heat, filled, paid, fulls, bestSpin }` 전부 정수 |
| `freeSpinsSummary` | `forgeHeat?` · `forgeFulls?` · `bestSpin?` (화로 라운드만) |
| `SpinDebugPresetSchema` | `forgeEmbers` · `forgeFull` · `forgeRetrigger` · `forgeBig` |

```ts
{ type: 'forgeRail',
  embers: { step: number; position: [reel, row]; value: number }[]   // 생긴 순서
  heatBefore, filledBefore, heatAfter, filledAfter: number            // 줄 상태(서버 정본)
  fulls: { afterEmber: number; heatBefore: number; heatAfter: number }[]  // afterEmber번째(0부터) 불씨 직후 ×2
  multiplier: number       // 이번 스핀 연쇄 지급에 곱한 값(1이면 미적용)
  baseWin: number          // 배율 전 연쇄 합
  boostedWin: number }     // 배율·상한 적용 후. totalWin = boostedWin + scatterWin 피처 win
```

- 기본 게임은 **불씨가 있을 때만** `forgeRail`을 싣고, 프리스핀은 **항상** 싣는다(꽝 스핀도 `heatBefore = heatAfter`).
- 피처 순서: `forgeRail` → `scatterWin` → `freeSpins`(진입 또는 `retrigger: true`) → `freeSpinsCapped` → `winCapped`.
- `FreeSpinsState.multiplier`는 늘 1(카운터에 ×N이 붙지 않는다). 화로 합계는 `freeSpins.carry.forge.heat`에만 있다.
- 진입 스핀: `features`에 `freeSpins{spins:10}`, `freeSpins.carry.forge = { heat: 시작 합계(모루 4→0, 5→5, 6+→10), filled: 0, paid: 진입 스핀 totalWin, fulls: 0, bestSpin: 0 }`.
  진입 스핀 자신의 불씨는 그 스핀 정산에만 쓰고 넘어가지 않는다.
- 응답 크기: 실측 2~4KB(12단계 최악은 candy 상한 테스트와 같은 구조 + 불씨 목록).

### C-3. API (`apps/api`) — 새 엔드포인트 없음

| 파일 | 변경 |
|---|---|
| `games/engineSpin.ts` | `toSharedFeature`에 `forgeRail` 명시 분기(키 순서 고정 → jsonb 왕복 뒤에도 멱등 재전송 바이트 동일) |
| `economy/freeSpins.ts` | `toSharedCarry`가 `carry.forge`를 옮긴다(빠뜨리면 스핀 사이 화로가 사라진다). `freeSpinsSummary`가 이전 carry + 마지막 스핀 `forgeRail`로 `forgeHeat`·`forgeFulls`·`bestSpin`을 채운다 |
| `repos/types.ts` | `FreeSpinsSummaryRecord`에 같은 3필드 |
| `games/debugSpin.ts` | 프리셋 4종 판정, `FORGE_MAX_TRIES = 200_000`(`coinRespinFull` 선례), `isForgePreset` |
| `routes/games.ts` | `forgeRail` 없는 게임에 forge 프리셋 → `409 DEBUG_NO_MATCH`(탐색 없이) |
| `routes/volcanoForge.test.ts` (새, 8) | 계약 모양 · 멱등 재전송 바이트 · 시드 공개 재생(불씨·totalWin, 잭팟 마지막 1회) · 진입 → `GET /state` 복원 → 이월 → 끝까지·요약 3항목 · 라운드 안 forgeFull/forgeRetrigger · forgeBig · 다른 게임 409 · 프리스핀 stateBefore 재생 |

| 디버그 프리셋 | 조건 | 비고 |
|---|---|---|
| `forgeEmbers` | 이 스핀 불씨 ≥ 2 | 기본 게임 약 1/250~1/900 시도 |
| `forgeFull` | 이 스핀 화로 가득 ≥ 1 | 사실상 프리스핀 안에서만(라운드 밖은 409가 날 수 있다) |
| `forgeRetrigger` | 프리스핀 안 추가 스핀(+5) | 라운드 밖은 항상 409 |
| `forgeBig` | 배율 ≥ 10이 곱해진 연쇄 지급 ≥ 총 베팅 50배 | «큰 결과 강제». 기본 게임 약 1/1,000 시도. 공용 `bigWin`(10배+)도 그대로 쓸 수 있다 |

허브 `presetsFor`: forgeRail 팩에서 라운드 밖 `forgeEmbers`·`forgeBig`, 라운드 안 4종 모두. 라벨 i18n 키 `forgeDebugEmbers`·`forgeDebugFull`·`forgeDebugRetrigger`·`forgeDebugBig`(ko·en 사전 끝).

**상태 복원**: 프리스핀 라운드 상태는 `game_states.freeSpins`(`left`·`total`·`multiplier: 1`·`carry.forge`) 하나다. 새로고침하면 `GET /games/volcano-forge/state`가
남은 횟수·화로 합계·켜진 칸·라운드 누적 지급을 그대로 준다. 라운드가 끝나면(남은 0 또는 라운드 상한) `nextState`가 없어 carry가 통째로 사라진다(새 DB 컬럼 없음).
시드 공개 `GET /rounds/:id/seed`의 `stateBefore`에 `carry.forge`가 실려 `spin(math, {totalBet}, createSeededRng(seedInput), stateBefore)`로 프리스핀까지 재생된다.

**체험판**: 엔진·shared 변경만으로 탭 안 API가 그대로 돈다(서버 코드 추가 없음). `status: hidden`인 동안은 로비·공개 라우트에서 빠진다.

### C-4. 허브가 받는 것 (화면 레인용 메모)

- 연쇄는 candy와 같은 `cascades`·`finalGrid`(`payKind: 'anywhere'` 당첨은 칸별 빛 고리 분기가 필요 — `renderer/src/pixi/cascadeFx.ts`, `renderer/src/types.ts`의 `payKind` 유니온, `renderer/src/wins.ts`의 cluster 분기, `GameScreen.tsx`의 `payKind === 'cluster'` 분기, `GameCard` 라벨은 아직 cluster만 안다).
- 불씨 비행은 `embers[i].step`이 끝난 뒤 `position` 칸(`getCellRect`)에서 출발, 칸 점등·합계는 `heatRail`(엔진 export)로 표시 계산 후 응답의 `heatAfter`·`filledAfter`로 덮는다. 화로 가득은 `fulls[k].afterEmber`번째 불씨 직후.
- 정산 연출 조건: 기본 = `forgeRail` 있음, 프리스핀 = `multiplier > 1 && baseWin > 0`. 둘 다 `boostedWin < totalBet`이면 숫자만.
- 코어가 손댄 허브 파일은 타입 연결뿐이다: `DebugPanel.tsx` 라벨 4줄, `lib/debugPreset.ts` forge 프리셋, `i18n` 키 4개. `renderer/src/ways.ts` `betUnitCount`는 anywhere도 1.

### C-5. 수치 결과 (정식 감사 `docs/RTP_AUDIT_volcano-forge.md`)

시드 42, 4샤드(`42:shard-0..3`), RTP 측정 2억2천만 스핀, 분포 표본 2천5백만 스핀, 총 베팅 100. 게이트 **18/18**, 소요 약 18분.

| 지표 | 값 |
|---|---|
| RTP | **94.407%** (목표 94.50%, −0.093%p), 95% CI ±0.169%p |
| 잭팟 포함 | 95.907% (목표 96.00%) |
| 몫(표본) | 연쇄 ×1 46.29 + 기본 불씨 배율 11.23 + 모루 1.54 + 프리스핀 35.73 (= 연쇄 ×1 2.86 + 화로 배율 32.78 + 모루 0.10) |
| 적중률 / 베팅 미만 당첨 비율 | 34.40% / 45.9% |
| 평균 연쇄 / P(지속) / maxCascades 도달 | 1.526 / 0.345 / 0.000003% |
| 기본 게임 불씨 | 당첨 스핀의 9.75% (스핀당 0.036개), 기본 게임 화로 가득 2억2천만 중 1,355회 |
| 프리스핀 진입 | 1/204.1, 평균 12.58스핀(최장 30, 위반 0), 시작 합계 ×5 6.3% · ×10 0.18% |
| 프리스핀 평균 지급 | **72.9× 베팅** (σ 165×, 최대 4,997×) |
| 라운드당 불씨 / 화로 가득 1회+ 라운드 | 3.13 / 36.4% |
| 당첨 프리스핀 ≤ 1회 라운드 | 7.0% |
| 추가 스핀 | 프리스핀당 1/24.4 (×5 = 0.205 < 1), 30 상한에 잘림 6,944회 |
| 합계 300 도달 / 라운드 캡 종료 / 캡 on·off 차 | 0.0014% / 0.0025% / 0.005%p |
| 불씨 값 분포 | 값표와 max |z| 1.43 (1,125만 개) |
| σ (라운드 배수) | 12.81 → n* 1.91억 → `manifest.auditSpins` 220,000,000 |
| 최대 배수 (관측) | 5,000× (상한) |

재현: `pnpm --filter @tgslot/rtp-sim run audit volcano-forge --shards 4` (manifest.auditSpins 2.2억, 약 18분). 튜닝 한 화면 요약: `pnpm --filter @tgslot/rtp-sim run tune volcano-forge --spins 4000000 --shards 4`.

### C-6. 감사 도구 (`tools/rtp-sim`)

`audit/forgeStats.ts`(새): `ForgeAccumulator`·`buildForgeReport`·`forgeGates`·`forgeSections` — 분해(연쇄 ×1 / 불씨 배율 / 모루 / 프리스핀 = 연쇄 ×1 + 화로 배율 + 모루), 불씨 값 분포 z, 시작·종료 합계 분포,
라운드당 불씨·가득·당첨 ≤ 1 라운드, 추가 스핀률, 합계 300·라운드 캡 도달률. 게이트 7줄(라운드 길이 ≤ 30, 진입 1/120~1/250, 라운드 평균 30~80×, 값 분포 |z| ≤ 3,
추가 스핀 수 × 발생률 < 1, 분해 합 = 표본 RTP, 화로 지표 기록). `sampleDistribution`·`compute`·`report`·`types`·`index`·`tune-cli`에 덧붙임 한두 줄, `cascadeStats`의 maxCascades 판정은 anywhere 평가기로 분기, 리포트 라벨 anywhere.

### C-7. 기획서와 달라진 값

| 항목 | 기획 | 구현 | 이유 |
|---|---|---|---|
| `chanceBase` / `chanceFree` | 45 / 1000 | **75 / 520** | 아래 |
| 불씨 값표 가중 | 380·250·150·100·60·35·15·8·2 (기대값 3.97) | **760·150·45·18·12·8·4·2·1 (2.58)** | 값(×2~×50)은 그대로, 꼬리를 깎고 ×2 비중을 올림(§5-2 6번 손잡이) |
| 모루 지급 | 4개 2 · 5개 6 · 6개 40 | **2.75 · 8 · 40** | RTP 미세 조정 |
| 스트립 | 밀도표 미정 | 120칸, 위 README 밀도표·시드 1 | |
| 적중률 | 27% | **약 34.4%** | 당첨 ≤ 1 프리스핀 라운드를 7%로 눌렀다(K14 목표 25% 이하) |
| 진입 / 추가 | 1/160 / 1/45 | **약 1/204 / 1/24** | 모루가 고르게 흩어져 «3개» 대비 «4개» 비율이 정해진다. 추가 × 5 = 0.21 < 1 |
| 라운드당 불씨 / 가득 1회+ 라운드 | 4.5 / ≥ 60% | **약 3.1 / 약 36%** | 프리스핀 배율이 그 스핀 자신의 불씨까지 곱하는 규칙이라 큰 연쇄·많은 불씨·큰 배율이 한 스핀에 겹친다. 불씨 4.5개면 라운드 평균 100배+·σ 20+로 게이트를 넘는다. 게이트를 먼저 지키고 가득을 최대로 했다 |
| 몫 구성 | 55.5 / 10 / 2 / 27 | 약 46 / 11 / 1.6 / 36 | 위와 같은 이유로 프리스핀 몫이 커졌다(라운드 평균은 게이트 안) |

가득 비율을 60%로 올리려면 규칙 쪽 결정이 필요하다(예: 프리스핀 10 → 8회, 또는 «가득 ×2»를 «가득 +N»으로). 리드 판단 몫이라 바꾸지 않았다.
