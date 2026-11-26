# hanbok-night-market (#10) 구현 계획 — 한복 야시장 · 말판 보너스

작성일 2026-11-26 · 대상: `tg-slot-hub` 신작 3종 병렬 중 한 팀(브랜치 `slot/new-b`)
정본 문서: `docs/GAME_CATALOG.md` §1·§2 #10·§4 종료 규칙, `docs/WAVE2_DESIGN.md` §9-1·§9-2(트레일 보드 #15), `docs/FEATURE_RESEARCH.md` §2.15·§5.2, 구성 모범 `docs/PLAN_candy-cluster-pop.md`
기획 수치 근거: `D:/park/tgslot-wt/_qa/new-b-plan/board-sim.mjs`(저장소 밖, 말판 정확 기대값 DP + 몬테카를로)

**결정 요약.** 카탈로그 #10의 테마(한복·야시장·민화)를 그대로 쓰되 보너스를 **휠 → 말판**으로 바꾼다.
말판은 한국 전통 **윷판 29칸**을 닮은 야시장 놀이판이고, 주사위 대신 **윷가락 4개**(도·개·걸·윷·모)를 던진다.
이 게임만의 재미 장치는 **「갈림길에 딱 멈추면 지름길」**이다(윷놀이 규칙에서 가져온 장르 메커닉, 상용 게임 복제 아님).
말판 전체는 **트리거 스핀 응답 하나에서 서버가 다 정한다**(연쇄 팩과 같은 방식). 화면의 «던지기» 탭은 정해진 결과를 한 번씩 보여 주는 연출이다.

다른 신작 두 팀과 겹치지 않는다: kraken-cove = 홀드&스핀 코인, idol-stage-live = 픽미 + 응원 미터. 말판(이동형 진행 보드)은 카탈로그에 아직 없는 피처다(FEATURE_RESEARCH §4.2 "2.15 트레일/보드 보너스 — 이동형 보드 보너스 없음").

---

## A. 재미 장치 결정

### A-1. 후보 3개 (모두 같은 말판·같은 칸 종류 위에 얹는 «한 가지 장치»)

**후보 1 — 갈림길 지름길 (윷판)**
- 경험: 판은 정사각 바깥 길 20칸 + 대각선 안쪽 길. 말이 **첫째 모퉁이·둘째 모퉁이·가운데(방)** 중 한 곳에 **딱 멈추면** 다음 던지기부터 안쪽 지름길로 꺾는다. 지름길은 짧고 값진 칸이 많다.
- 손에 땀: 던지기 전 화면이 도~모 각각이 어디에 떨어지는지 미리 표시한다. "걸이면 모퉁이!" — 숫자 하나를 빌게 된다.
- 비용: 엔진은 경로 그래프 + 갈림길 표 하나. 화면은 노드 좌표표(코드)와 지름길 빛 연출.
- 수학: 경로가 유한·비순환이라 상태 DP로 기대값이 정확히 나온다.

**후보 2 — 노점 들르기 (가게 칸 물건)**
- 경험: 노점 칸에 서면 물건(꽃신 +1칸, 복주머니 다음 코인 ×2, 부적 함정 1회 막기)을 자동으로 받는다. 물건이 다음 던지기를 바꾼다.
- 비용: 물건 상태·효과 3종·슬롯 UI·설명이 필요하다. 플레이어 선택이 결과를 바꾸면 안 되므로 «사는» 동작이 사실상 자동이라 의미가 약하다.
- 브리프의 예시 그대로라 새로움이 낮다.

**후보 3 — 손님 업기 (동행)**
- 경험: 판 위 몇 칸에 손님(도령·할머니)이 서 있다. 말이 정확히 그 칸에 멈추면 업는다(윷놀이 «업기»). 업은 손님 수만큼 마지막 배수 +1 또는 함정 1회 대신 맞아 줌.
- 비용: 손님 위치·업힌 수 상태, 캐릭터 미니 스프라이트가 더 필요하다. «배수 모으기 칸»과 역할이 겹친다.

### A-2. 점수 (5점 만점)

| 후보 | 재미·새로움 | 430px 판독 | 엔진 비용(높을수록 쌈) | 튜닝 용이 | 합계 |
|---|---:|---:|---:|---:|---:|
| 1 갈림길 지름길 | **5** | 4 | 4 | 4 | **17** |
| 2 노점 들르기 | 3 | 3 | 3 | 3 | 12 |
| 3 손님 업기 | 4 | 3 | 4 | 3 | 14 |

### A-3. 선택: 갈림길 지름길

1. **숫자 하나하나가 의미를 갖는다.** 말판 보너스의 약점은 "주사위만 굴리면 알아서 감"이다. 정확히 멈춰야 꺾이는 갈림길이 생기면 매 던지기에 목표 숫자가 생긴다.
2. **테마와 한 몸이다.** 윷판의 모퉁이·방 지름길은 한국 사람이면 아는 규칙이고, 야시장 대보름 놀이판이라는 무대 설정과 맞는다. 설명이 짧다.
3. **추가 상태가 거의 없다.** 상태는 (현재 칸, 현재 길) 두 개뿐이다. 물건·동행 같은 추가 카운터가 없다.
4. **DP로 정확히 잰다.** 지름길도 결국 유한 그래프라 튜닝이 몬테카를로를 기다리지 않는다.

---

## 0. 기존 문서·코드와 대조한 결과 (낡은 부분)

| # | 원문 | 지금 상황 | 이 계획의 결정 |
|---|---|---|---|
| O1 | 카탈로그 #10 "휠 보너스 + 심볼 승급", `bonus.type: wheel`, P6·P1 | 사용자 지시: 휠 대신 말판 | 보너스는 **말판 보너스**. 기본 게임 승급 뮤테이션은 뺀다(범위·초점). §13 K12에 대안으로 남긴다. 카탈로그 §1·§2 #10은 같은 작업에서 고쳤다 |
| O2 | 카탈로그 #10 RTP 산출 **analytic**("휠은 독립 이산 분포") | 말판은 상태가 있는 체인이다. 감사 도구의 해석 경로는 라인·스캐터만 안다 | 정식 감사는 **monte-carlo**(candy와 같은 경로·샤드·n*). 말판 기대값은 엔진의 **정확 DP**(`boardExpectation`)로 따로 구해 튜닝과 교차 검증에 쓴다 |
| O3 | 카탈로그 #10 심볼 11 = wild·scatter·bonus·tiger·magpie·… | 스캐터와 보너스를 따로 둘 이유가 없다(프리스핀 없음) | `bonus`(청사초롱)가 스캐터 역할 겸 말판 트리거. 심볼은 §2 표 11종 |
| O4 | WAVE2 §9-2 "트레일 보드 → #15 신규, 웨이브 3.5, P6 확장" | #10이 이번에 트레일 보드를 가져간다 | #15 컨셉(고양이 카페 골목)은 피처를 다른 것으로 바꿔야 한다. 카탈로그에 메모만 남기고 WAVE2는 고치지 않는다(역사 문서) |
| O5 | 카탈로그 §3 통합 `RoundState.bonus?: { kind: 'wheel'… }` | 지금 엔진의 `RoundState`는 `carry?: RoundCarry` 하나로 정리됐다(candy O4) | 말판은 **스핀 간 상태를 쓰지 않는다**. `RoundCarry`에 필드를 더하지 않는다. `game_states` 무변경 |
| O6 | 카탈로그 §4 P6 "서버 권위 다단 인터랙션(요청 여러 번)" | 다단 요청은 락·원장·재전송을 새로 짜야 한다 | **한 응답 보너스**: 트리거 스핀의 `features`에 말판 전체를 싣는다. 저장(`rounds.features` jsonb)·재전송·시드 공개가 기존 경로 그대로 동작한다 |
| O7 | — | `resolveSpin`의 라인 경로에는 지급 캡이 없다(캡은 연쇄 경로 `resolveCascadeSpin`에만) | 말판 몫만 `round.maxWinCap` 안에서 자른다(`winCapped` 재사용). 라인 경로의 기존 동작은 그대로 |
| O8 | — | `featureTriggerCount`가 두 곳(엔진 `evaluate.ts:354`, 렌더러 `anticipation.ts:10`) | 두 곳 모두 `?? math.boardBonus?.trigger` 한 줄씩. 기존 비교 테스트가 둘을 맞춘다 |
| O9 | — | `isAnalytic`(`analytic.ts:387`)은 말판을 모른다 | `boardBonus`가 있으면 false(→ MC). 한 줄 |
| O10 | — | `toSharedFeature`(`engineSpin.ts`)는 `never` 검사라 새 피처를 넣으면 컴파일이 깨진다 | `boardBonus` 분기 추가(의도된 컴파일 에러로 누락 방지) |
| O11 | — | 허브 `store/game.ts:794` `reveal()`이 **릴 착지 순간** 서버 wallet·`lastResult`·더블업 세션을 한꺼번에 공개한다 | 말판이 있는 판은 착지 때 잔액 `wallet − boardWin`, WinStrip·롤업·빅윈 판정도 `totalWin − boardWin`(라인+초롱)만 쓰고, 말판 정산 때 서버 값으로 맞춘다(결과 누설 방지). 화면을 벗어나면 즉시 서버 값. 더블업(`math.gamble`)은 `gambleOffer.pendingWin`이 말판 몫을 착지 때 드러내므로 **`boardBonus`와 공존 금지**(스키마 거부) |
| O12 | — | `SoundPreset`이 두 곳(`renderer/types.ts:12`, `game-sdk/theme.ts:36`) | 두 곳 모두 `'hanbok'` 추가 |
| O13 | — | `prompts.json` asset kind는 `symbol/frame/bg/thumb/sheet`뿐이고, `symbol`은 math 심볼이어야 한다(pack:check 오류). 다른 두 신작 기획서에는 `prop` 수요가 없다 | 새 kind를 만들지 않는다(검수 반영). 말 = `lantern_girl` 심볼 그림을 둥근 말 받침에 얹어 쓰고, 결승 등불탑 = 코드 드로잉 탑 + 꼭대기에 `bonus` 심볼 그림. game-sdk·theme-gen·pack:check 무변경 |
| O14 | 카탈로그 #10 베팅 언급 없음, 25라인 | 25로 나누어떨어지는 베팅 레벨은 shiba-shrine이 이미 쓴다 `[25,50,100,250,500,1000]`. 레벨 상한 표(`MAX_BET_TIERS` 100/200/500)와도 맞다 | 같은 레벨을 쓴다 |
| O15 | — | `GameStateResponse`는 직전 라운드를 돌려주지 않는다. `rounds` 테이블 인덱스는 `(user_id, game_id, idempotency_key)` 유니크뿐이라 «이 게임의 최신 라운드»를 찾으려면 그 사용자의 그 게임 라운드 전부를 정렬해야 한다 | 1차는 **허브 localStorage 스냅숏**(응답 받는 즉시 말판 피처 전체 저장)으로 복원한다. 서버 `lastBoard`(새 인덱스 = 마이그레이션 필요, 다른 팀과 번호 충돌)는 2차로 미룬다(§4-6) |
| O16 | — | 렌더러 `anticipatedReels`(`anticipation.ts:38`)는 스캐터가 `trigger−1`개 떨어진 뒤 **남은 모든 릴**을 감속한다. live 팩은 모든 릴에 스캐터가 있어 문제가 없었지만, 이 팩은 릴 2·4에 초롱이 없어 릴 1·3 착지 뒤 **릴 4까지 헛감속**한다 | 스트립에 스캐터가 하나도 없는 릴은 건너뛴다(조건 1개). live 7팩은 모든 릴에 스캐터가 있어 결과·연출 불변 — 기존 기대감 테스트로 확인 |

---

## 1. 한 줄 컨셉과 «왜 재밌나»

> **청사초롱 세 개가 켜지면 야시장 한복판 윷판이 펼쳐진다. 윷을 던져 말을 옮기고, 갈림길에 딱 멈추면 지름길로 꺾어 결승 등불탑의 큰 상을 노린다.**

### 1-1. 순간마다 무엇을 바라며 손에 땀을 쥐는가

| 순간 | 화면 | 플레이어의 기대 / 긴장 |
|---|---|---|
| ① 기본 스핀 | 1·3번 릴에 청사초롱이 서면 5번 릴이 느려진다 | "세 번째 초롱 와라" (기존 기대감 연출 재사용) |
| ② 말판 입장 | 비단이 휘감기는 전환 → 등불 3개가 하나씩 켜지고 "기회 5번" | 처음 보는 판 위 값진 칸(지름길·결승)을 눈으로 훑는다 |
| ③ 던지기 직전 | 판 위 다섯 칸에 **도·개·걸·윷·모 꼬리표**가 붙는다(앞으로 갈 자리 미리보기) | "걸이면 모퉁이, 개면 함정… 걸!" — 숫자 하나를 빈다 |
| ④ 윷가락이 공중에서 도는 0.6초 | 4개가 뒤집히며 떨어진다 | 납작한 면이 몇 개냐. **윷·모 = 한 번 더**가 뜨면 환호 |
| ⑤ 말이 칸을 콩콩 건너감 | 칸마다 작은 소리 | 마지막 한 칸 — 함정 앞에서 멈추나 넘어가나 |
| ⑥ 갈림길에 딱 멈춤 | 지름길 칸의 작은 등불이 말 쪽에서 결승 쪽으로 **하나씩 차례로** 켜지며 "지름길!"(선을 긋거나 빛이 판을 훑지 않는다) | 결승까지 확 가까워졌다. 지름길의 큰 코인·배수 칸이 보인다 |
| ⑦ 배수 칸 | ×2 → ×3, 바구니 숫자 전체가 커진다 | "지금 끝나도 N배" 숫자가 뛴다 — 다음 던지기는 전부 덤 |
| ⑧ 등불 2개가 꺼진 채 함정 근처 | 남은 등불 하나가 깜빡인다 | 한 번만 더 함정이면 끝 |
| ⑧-2 기회가 1번 남음 | 버튼이 "마지막 한 번!"으로 바뀌고 미리보기 꼬리표 중 가장 값진 칸이 한 번 반짝 | 말판의 56%는 기회 소진으로 끝난다 — 그 끝을 밋밋한 퇴장이 아니라 마지막 한 수로 만든다 |
| ⑨ 결승 | 등불탑 점등 + 불꽃 + 큰 상 | 바구니 × 배수가 터진다 |

**핵심 장치는 ③ 미리보기 + ⑥ 갈림길**이다. 결과는 서버가 이미 정했지만, 판이 다 보이고 숫자 다섯 개가 각각 어디로 가는지 보이니 던질 때마다 바라는 숫자가 생긴다. ⑦의 «지금 끝나면 N배» 표시가 "더 잃을 것은 없고 오를 일만 남았다"는 감각을 준다.

---

## 2. 게임 요약 · 그리드 · 심볼 · 배당

### 2-1. 요약

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 5릴 × 3행 / **25 페이라인**, 왼쪽부터 연속, 와일드 대체 |
| 보너스 | 청사초롱(`bonus`)은 **릴 1·3·5에만**(인덱스 0·2·4) 있고 한 릴에 최대 1개 보인다 → 3개 = 말판 보너스 + 총 베팅 ×2 |
| 말판 보너스 | 윷판 29칸, 기회 5번(윷·모·한 번 더 칸으로 +1, 합계 상한 12번), 등불 3개(함정 3번이면 끝), 결승 큰 상, 지급 = 바구니 × 배수(최소 5배) |
| 목표 RTP | **94.5%** = 라인 71.3 + 스캐터 지급 1.1 + 말판 22.1 (잭팟 1.5는 모델 밖, 체감 96.0) |
| 피처 빈도 | 약 **1/175** 스핀 (릴별 초롱 노출 3×5/84 = 0.1786, 세제곱 0.00570) |
| 말판 평균 지급 | 약 **38.5배**(v0 DP 정확값 38.54, σ 37.1) |
| 최대 당첨 | 말판 구조상 최대 **200배**(v0 DP 정확값, `boardBonus.maxWin`으로 명시·검사) / 한 판 상한 `round.maxWinCap` **1,000배**(구조상 닿지 않는 안전 캡) |
| 변동성 | medium-high (예상 σ 약 5~6.5, §5) |
| 베팅 레벨 | 25 / 50 / 100 / 250 / 500 / 1000 (라인당 1~40, 정수 지급) |
| 셀 크기 | 정사각 1024 프레임 + 가로형 창 x 2–98%·y 19–81%(ART_DIRECTION v3·v4) → 430px 약 79px, 390px 약 72px |

### 2-2. 심볼표 (11종, 빈칸 없음)

| id | 이름 ko / en | 등급 | 그림 | 비고 |
|---|---|---|---|---|
| `wild` | 호랑이 탈 / Tiger Mask | 와일드 | 민화풍 나무 탈(붉은·흰 칠, 까치호랑이 얼굴) | `bonus` 제외 전부 대체. 전 릴 |
| `bonus` | 청사초롱 / Silk Lantern | 보너스(스캐터) | 위 청·아래 홍 비단 초롱, 불빛 | 릴 1·3·5에만, 스트립 간격 ≥ 3 |
| `lantern_girl` | 초롱 아가씨 / Lantern Girl | 고1 | 한복 차림 등불 상인 아가씨 반신(원작 없음) | **주인공**. 말판의 말과 같은 인물 |
| `scholar` | 갓 쓴 도령 / Young Scholar | 고2 | 갓·도포 차림 손님 소년 반신 | |
| `granny` | 떡집 할머니 / Rice-cake Granny | 고3 | 머릿수건·앞치마, 떡 접시를 든 상인 할머니 반신 | |
| `norigae` | 노리개 / Norigae | 중1 | 매듭·술 달린 노리개 | 형태로 구분: 세로 술 |
| `flower_shoes` | 꽃신 / Flower Shoes | 중2 | 꽃 수 놓은 꽃신 한 켤레 | 가로 납작 |
| `lucky_pouch` | 복주머니 / Lucky Pouch | 중3 | 끈 조인 비단 복주머니 | 둥근 주머니 |
| `hotteok` | 호떡 / Hotteok | 저1 | 꿀이 흐르는 호떡(종이컵) | |
| `tteokbokki` | 떡볶이 / Tteokbokki | 저2 | 꼬치에 꽂힌 떡볶이 | 세로 꼬치 |
| `dalgona` | 달고나 / Dalgona | 저3 | 별 모양 찍힌 달고나 원판 | 동그란 판 |

- 저·중 등급은 **실루엣으로 구분**(둥근 판 / 세로 꼬치 / 컵 / 술 / 신발 / 주머니), 72px에서 판독.
- 캐릭터 3명은 새로 만든 인물이다. 의상은 조선 후기 평상복 계열, 특정 드라마·게임 캐릭터를 참조하지 않는다.

### 2-3. 배당표 초안 (라인당 베팅 배수, T가 튜닝)

| 심볼 | 2 | 3 | 4 | 5 |
|---|---:|---:|---:|---:|
| `wild` | – | 50 | 200 | 500 |
| `lantern_girl` | – | 40 | 120 | 400 |
| `scholar` | – | 30 | 90 | 250 |
| `granny` | – | 25 | 70 | 200 |
| `norigae` | – | 15 | 40 | 120 |
| `flower_shoes` | – | 12 | 30 | 100 |
| `lucky_pouch` | – | 10 | 25 | 80 |
| `hotteok` | – | 6 | 15 | 50 |
| `tteokbokki` | – | 5 | 12 | 40 |
| `dalgona` | 1 | 4 | 10 | 30 |
| `bonus`(스캐터, **총 베팅** 배수) | – | 2 + 말판 | – | – |

- 페이라인 25개: fruit-fiesta의 20줄 + 지그재그 5줄(행 패턴 `[0,1,0,1,0]` `[2,1,2,1,2]` `[1,0,1,0,1]` `[1,2,1,2,1]` `[0,1,2,1,0]`과 겹치지 않게 T가 확정).
- 스트립 초안: 릴 1·3·5 길이 84(초롱 5개, 간격 ≥ 3), 릴 2·4 길이 80(초롱 없음). 와일드는 릴 1에 적게(1~2), 2~5에 3~4.
- 목표: 적중률 28~33%, 기본(라인+스캐터) 몫 72.4%.

---

## 3. 말판 보너스 규칙 전문

### 3-1. 판 (윷판 29칸, v0 값)

말은 **출발(오른쪽 아래)**에서 시계 반대 방향으로 돈다: 오른쪽 변을 올라가 → 위 변 → 왼쪽 변을 내려와 → 아래 변 → 출발 자리 = **결승**.

```
 둘째모퉁이 o10   o9      o8      o7      o6     첫째모퉁이 o5
   [코4]★      [×+1]   [코3]   [+1]   [함정]      [코3]★
 o11 [함정]     b1[함정]                  a1[코5]     o4 [코2]
 o12 [코4]           b2[코6]       a2[함정]          o3 [함정]
                          방(c) [×+2]★
 o13 [앞으로2]       c1[코4]       f1[코8]          o2 [코2]
 o14 [함정]     c2[코4]                   f2[함정]    o1 [코1]
 셋째모퉁이 o15   o16     o17     o18     o19     출발·결승
   [×+1]       [코5]   [함정]  [코6]   [코6]    [큰 상 30]
                                            ★ = 갈림길(딱 멈추면 지름길)
```

| 칸 종류 | 표기(화면) | 효과 | v0 개수 |
|---|---|---|---:|
| 코인 칸 | 엽전 + 숫자 `3` | 바구니 += 값(총 베팅 배수) | 15 |
| 배수 칸 | 등불 겹 + `×+1` / `×+2` | 배수 += 값 (×1에서 시작, 상한 ×4 — v0 판에서 세 배수 칸을 다 밟는 길이 없어 구조상 최대도 ×4, 도달 1.2%) | 3 |
| 앞으로 칸 | 화살표 + `2` | 그 길로 N칸 더 간다. 도착 칸의 효과를 받는다(앞으로→앞으로 연쇄 없음, 판 배치로 보장) | 1 |
| 한 번 더 칸 | 엇갈린 윷가락 + `+1` | 기회 +1 (상한 안에서) | 1 |
| 함정 칸 | 도깨비 바람 소용돌이 | 등불 하나 꺼짐. 3개 다 꺼지면 **즉시 끝** | 8 |
| 결승 | 등불탑 | 바구니 += 큰 상(30), **즉시 끝**. 넘쳐 지나가도 도착으로 친다 | 1 |
| 출발 | 멍석 | 효과 없음(처음에만 서 있음) | 1 |

**길 4개** (math.json `routes`, 노드 id 배열):
- 바깥 길 `outer`: 출발 → o1 … o19 → 결승 (20걸음)
- 지름길 `a`(첫째 모퉁이에 멈춤): o5 → a1 → a2 → 방 → c1 → c2 → o15 → o16 … o19 → 결승 (11걸음, 바깥보다 4걸음 짧음)
- 지름길 `b`(둘째 모퉁이에 멈춤): o10 → b1 → b2 → 방 → f1 → f2 → 결승 (6걸음, 4걸음 짧음)
- 지름길 `center`(방에 멈춤): 방 → f1 → f2 → 결승 (3걸음)

**갈림길 규칙(재미 장치)**: 한 번의 던지기(앞으로 칸 이동 포함)를 끝낸 뒤 말이 **o5·o10·방** 중 한 곳에 서 있으면, 다음 던지기부터 해당 지름길로 간다. 지나가기만 하면 꺾지 않는다. 셋째 모퉁이(o15)는 이미 결승 5칸 앞이라 갈림길이 아니다. 앞으로 칸이 갈림길에 내려 줘도 «멈춤»으로 친다.

### 3-2. 윷 던지기 (= 주사위)

| 결과 | 걸음 | 가중치(v0, 합 1000) | 확률 | 한 번 더 |
|---|---:|---:|---:|:---:|
| 도 | 1 | 240 | 24.0% | |
| 개 | 2 | 380 | 38.0% | |
| 걸 | 3 | 230 | 23.0% | |
| 윷 | 4 | 120 | 12.0% | ✔ |
| 모 | 5 | 30 | 3.0% | ✔ |

- 평균 걸음 2.28. 실제 윷가락 확률(평평한 면 0.6 가정 시 도 15·개 35·걸 35·윷 13·모 3%)보다 짧은 쪽으로 기울였다 — 함정·갈림길을 더 자주 밟게 하려는 튜닝 값이다(도움말에는 확률을 적지 않는다).
- 빽도(뒤로 1칸)는 넣지 않는다. 앞으로만 가야 종료 척도(§3-4)가 단순하고, «되돌아감»은 바구니가 줄어드는 듯한 오해를 준다.
- 윷가락 4개의 앞뒷면 배치(어느 가락이 납작한지)는 **연출 전용**이다. 결과에 맞게 던지기 순번으로 결정론적으로 고른다(RNG 미사용).

### 3-3. 진행 · 종료 · 지급

1. **트리거**: 스핀 그리드에서 `bonus` 3개(릴 1·3·5 각 1개). 유료 스핀에서만(이 게임엔 프리스핀이 없다).
2. **시작 상태**: 칸 = 출발, 길 = 바깥, 기회 5, 등불 3, 배수 ×1, 바구니 0, 던진 수 0.
3. **던지기 1회**: 기회 −1, 던진 수 +1 → 윷 추첨(RNG 1회) → 윷·모면 기회 +1(단 `던진 수 + 기회 < 12`일 때만) → 그 길로 걸음 수만큼 이동(결승을 넘치면 결승) → 앞으로 칸이면 추가 이동 → 도착 칸 효과 → 갈림길이면 길 전환.
4. **종료**(먼저 오는 것): 결승 도착 / 함정 3번째 / 기회 0. **하드캡은 불변식으로 보장한다**: 시작 `던진 수 + 기회 = 5 ≤ 12`, 던지기마다 합은 그대로(기회 −1, 던진 수 +1)이고 기회를 늘리는 전이는 `합 < 12`일 때만 +1 → `던진 수 + 기회 ≤ maxThrows`가 항상 참이라 기회 0은 늦어도 12번째 던지기 뒤에 온다. 그래서 «던진 수 12»는 별도 종료 사유가 아니다(검수 반영: v0에서 도달 0건, 사유를 따로 두면 영원히 안 나오는 분기가 생긴다). 엔진은 루프 조건에 `던진 수 < maxThrows`를 안전장치로 함께 둔다.
5. **지급**: `payout = max(최소 5, 바구니 × 배수)` (총 베팅 배수, 정수) → 코인 `payout × totalBet` → `round.maxWinCap × totalBet − (라인 + 스캐터 지급)`으로 자른다(잘리면 `winCapped`).
6. 미완 상태로 끝나도 바구니는 전부 받는다(함정은 바구니를 빼앗지 않는다). **「지금 끝나면 N배」** = `max(5, 바구니 × 배수)`를 항상 표시한다.

### 3-4. 종료 보장 (GAME_CATALOG §4 규칙 1~3)

| 규칙 | 말판에서 |
|---|---|
| 1 기대 반복 수렴 | 말판 안에 자기 재진입(리트리거)이 없다. 스캐터 3개가 다시 떠도 말판은 다시 열리지 않는다(말판 중엔 릴이 돌지 않는다). `r = 0` |
| 2 정수 하드 캡 + 지급 캡 | `maxThrows = 12`(불변식 `던진 수 + 기회 ≤ maxThrows`), `trapLimit = 3`, `maxMultiplier = 4`, `boardBonus.maxWin = 200`(DP 최대값 이하 검사), `round.maxWinCap = 1000` |
| 3 단조 감소 척도 | **결승까지 남은 걸음 수**(현재 길 기준)가 매 던지기 최소 1 줄어든다 — 길은 전부 비순환이고 이동은 앞으로만, 지름길 전환은 남은 걸음을 늘리지 않는다(검사: 각 갈림길에서 `len(지름길 남은 걸음) < len(현재 길 남은 걸음)`). 보조 척도 `maxThrows − 던진 수`는 매번 정확히 1 줄고, 기회를 늘리는 전이(윷·모·한 번 더 칸)는 이 척도를 되돌리지 않는다 |

엔진 스키마가 정적으로 검사한다(§6 `checkBoardConfig`): 모든 길이 결승으로 끝나고 순환 없음, 갈림길 표의 첫 칸이 해당 노드, 앞으로 칸 도착이 또 앞으로 칸이 아님, `throws ≤ maxThrows ≤ 20`, 가중치 양수, DP 최대 지급 ≤ `maxWin`, `gamble`·`scatter.freeSpins`·`orderRound`·`cascade`와 공존 금지.

### 3-5. math.json 조각 (v0)

```json
"scatter": { "symbol": "bonus", "pays": { "3": 2 } },
"round": { "maxWinCap": 1000 },
"boardBonus": {
  "trigger": 3,
  "throws": 5, "maxThrows": 12, "trapLimit": 3, "maxMultiplier": 4, "minPayout": 5, "maxWin": 200,
  "throwTable": [ { "steps": 1, "weight": 240 }, { "steps": 2, "weight": 380 }, { "steps": 3, "weight": 230 },
                  { "steps": 4, "weight": 120, "extraThrow": true }, { "steps": 5, "weight": 30, "extraThrow": true } ],
  "layout": "yut29",
  "nodes": {
    "start": { "kind": "start" }, "goal": { "kind": "goal", "value": 30 },
    "o1": { "kind": "coin", "value": 1 }, "o2": { "kind": "coin", "value": 2 }, "o3": { "kind": "trap" },
    "o4": { "kind": "coin", "value": 2 }, "o5": { "kind": "coin", "value": 3 }, "o6": { "kind": "trap" },
    "o7": { "kind": "again" }, "o8": { "kind": "coin", "value": 3 }, "o9": { "kind": "mult", "value": 1 },
    "o10": { "kind": "coin", "value": 4 }, "o11": { "kind": "trap" }, "o12": { "kind": "coin", "value": 4 },
    "o13": { "kind": "forward", "value": 2 }, "o14": { "kind": "trap" }, "o15": { "kind": "mult", "value": 1 },
    "o16": { "kind": "coin", "value": 5 }, "o17": { "kind": "trap" }, "o18": { "kind": "coin", "value": 6 },
    "o19": { "kind": "coin", "value": 6 },
    "a1": { "kind": "coin", "value": 5 }, "a2": { "kind": "trap" }, "c": { "kind": "mult", "value": 2 },
    "c1": { "kind": "coin", "value": 4 }, "c2": { "kind": "coin", "value": 4 },
    "b1": { "kind": "trap" }, "b2": { "kind": "coin", "value": 6 },
    "f1": { "kind": "coin", "value": 8 }, "f2": { "kind": "trap" }
  },
  "routes": {
    "outer":  ["start","o1","o2","o3","o4","o5","o6","o7","o8","o9","o10","o11","o12","o13","o14","o15","o16","o17","o18","o19","goal"],
    "a":      ["o5","a1","a2","c","c1","c2","o15","o16","o17","o18","o19","goal"],
    "b":      ["o10","b1","b2","c","f1","f2","goal"],
    "center": ["c","f1","f2","goal"]
  },
  "forks": { "o5": "a", "o10": "b", "c": "center" }
}
```

- 노드 화면 좌표는 math가 아니라 허브의 `layout: "yut29"` 표가 갖는다(§6). math는 수학만.
- 코인·큰 상 값은 **정수**(총 베팅 배수)라 모든 베팅 레벨에서 코인이 정수다. 스키마가 정수 검사.

### 3-6. v0 수치 (DP 정확값 / MC 100만 라운드)

| 지표 | 값 |
|---|---|
| 평균 지급 | **38.54배** (최소 5배 포함 DP. 기획 시뮬의 MC 38.47은 최소 지급 없는 값 — 최소 없는 DP 38.40과 맞는다) |
| 표준편차 / E[X²] | 37.10 / 2,861 |
| 최대 지급 | **200배** (DP가 모든 경로에서 구한 최대) |
| 결승 도착 | 32.0% |
| 함정 3번으로 끝 | 11.8% |
| 기회 소진으로 끝 | 56.2% |
| 던진 수 12로 끝 | 0% (불변식상 별도 사유 아님, §3-3) |
| 갈림길을 한 번 이상 밟음 | **66.4%** (재미 장치가 3판 중 2판에 등장) |
| 갈림길이 결과를 바꾸나 (검수 측정) | 밟은 판: 결승 37.5% · 평균 43.4배 / 안 밟은 판: 결승 21.0% · 평균 28.8배 — 장치가 결과를 실제로 가른다 |
| 던지기 직전 미리보기에 함정 칸이 섞여 있는 비율 (검수 측정) | 93.0% — 거의 매 던지기에 «피할 숫자»가 있다. 두 결과가 같은 칸(대개 결승 넘침)을 가리키는 경우 14.5% → 꼬리표를 겹쳐 쌓는다 |
| 끝 배수 분포 (검수 측정) | ×1 38.2% · ×2 29.7% · ×3 31.0% · ×4 1.2% |
| 최소 5배가 적용된 판 | 5.1% |
| 갈림길도 결승도 없는 밋밋한 판 | 26.6% (→ §1-1 ⑧-2 «마지막 한 번» 연출로 끝을 살린다) |
| 평균 던지기 | 5.68번 (분포 4: 4.4% · 5: 40.7% · 6: 37.5% · 7: 15.2% · 8+: 1.8%, p95 = 7번) |
| 지급 분포 | <10배 19.0% · 10~19 27.7% · 20~39 19.4% · 40~79 13.9% · 80~149 19.8% · 150+ 0.1% |
| DP 상태 수 | 2,610 (스키마 파싱 때 돌려도 수 ms) |

목표 범위(튜닝 게이트 아님, 체감 기준): 결승 25~35%, 함정 끝 10~20%, 갈림길 ≥ 55%, 평균 던지기 5~7, 10배 미만 ≤ 20%.

---

## 4. RNG 소비 순서 · 계약 · API

### 4-1. RNG 소비 계약

```
릴 정지 (5회) → 뮤테이션 (이 팩 0회) → 라인·스캐터 평가 (0회)
→ [bonus ≥ 3 이고 유료 스핀] 윷 던지기 k회 (던질 때마다 pickWeighted 1회 = nextInt(1000) 1회, k는 결과로 결정)
→ [API] 잭팟 판정 1회
```

- 던지기 수 k는 앞선 결과로 정해지므로 `seed + nonce + totalBet`만으로 말판 전체가 재현된다(`stateBefore` 없음 — 말판은 유료 스핀 한 판 안에서 끝난다).
- `board.test.ts`: 비트리거 스핀 `nextInt` 5회, 트리거 스핀 `5 + throws.length`회.
- live 7팩은 `boardBonus` 키가 없어 이 경로를 타지 않는다(골든 해시 불변).

### 4-2. 엔진 타입 (`types.ts`에 추가, 구현은 `board.ts`)

```ts
export type BoardTileKind = 'start' | 'coin' | 'mult' | 'forward' | 'again' | 'trap' | 'goal'
export type BoardEnd = 'goal' | 'traps' | 'throws'   // 하드캡은 불변식(§3-3)이라 사유가 아니다

/** 던지기 1회의 결과. 값은 전부 이 던지기를 처리한 **뒤**의 상태다. */
export interface BoardThrow {
  steps: number            // 1~5 = 도·개·걸·윷·모
  extraThrow: boolean      // 윷·모 한 번 더가 실제로 인정됐는지 (상한에 걸리면 false)
  path: string[]           // 지나간 노드 id (출발 칸 제외, 도착 칸 포함)
  forward?: string[]       // 앞으로 칸이 더 옮긴 노드 id
  at: string               // 최종으로 멈춘 칸
  route: string            // 다음 던지기에서 탈 길 id (갈림길이면 바뀐 값)
  tile: BoardTileKind
  value?: number
  pot: number              // 바구니 (총 베팅 배수)
  multiplier: number
  traps: number            // 꺼진 등불 수
  throwsLeft: number
}

export interface BoardBonusTrigger {
  type: 'boardBonus'
  throws: BoardThrow[]
  end: BoardEnd
  pot: number
  multiplier: number
  /** max(minPayout, pot × multiplier). 총 베팅 배수. */
  payout: number
  /** 실제 지급 코인 (캡 적용 후). `SpinResult.totalWin`에 이미 들어 있다. */
  win: number
}
// FeatureTrigger 유니온에 BoardBonusTrigger 추가
// SpinResult += { boardWin?: number }   // 말판 지급 코인. 트리거 스핀만. 감사 기여도용
```

```ts
// board.ts
export function playBoard(config: BoardBonusConfig, totalBet: number, rng: Rng, capCoins: number): BoardBonusTrigger
export function replayBoard(config: BoardBonusConfig, steps: readonly number[], totalBet: number, capCoins: number): BoardBonusTrigger // RNG 없음
export function advanceBoard(config, at: string, route: string, steps: number): { path: string[]; at: string } // 순수, 허브 미리보기도 이걸 쓴다
// boardExact.ts
export function boardExpectation(config: BoardBonusConfig): {
  mean: number; meanSq: number; max: number; pEnd: Record<BoardEnd, number>; pFork: number; meanThrows: number }
```

- `playBoard` = 매 던지기 `pickWeighted(throwTable)` → `replayBoard`와 같은 처리. **한 함수(`stepBoard`)를 두 경로가 공유**해 엔진·허브·감사가 같은 규칙을 쓴다.
- 허브는 `advanceBoard`로 «도~모 미리보기 칸»을 계산한다(표시용, 결과 아님).

### 4-3. `spin.ts` 연결 (라인 경로에 한 곳)

`resolveSpin`의 비연쇄 경로에서 스캐터 평가 직후:

```ts
if (math.boardBonus !== undefined && state === undefined && scatter.count >= math.boardBonus.trigger) {
  // applyBoardBonus: rng 필수(없으면 던진다), 캡 = round.maxWinCap × totalBet − (lineWin + scatter.win)
  // features.push(board); totalWin += board.win; result.boardWin = board.win
}
```

`state === undefined`(유료 스핀)만 — 이 팩은 프리스핀이 없다. `nextState`는 만들지 않는다.

### 4-4. shared · API 계약

| 항목 | 변경 |
|---|---|
| `FeatureTriggerSchema` | `boardBonus` 객체 추가: `throws: BoardThrowSchema[] (max 12)`, `end`, `pot`, `multiplier`, `payout`, `win(int ≥ 0)` |
| `engineSpin.ts toSharedFeature` | `boardBonus` 분기(필드 하나씩 복사, 키 순서 고정 → jsonb 왕복 뒤에도 응답 바이트 동일) |
| `SpinResponse` | **변경 없음.** 말판은 `features`에, 합계는 `totalWin`에 이미 있다 |
| 라운드 저장 | **변경 없음.** `rounds.features` jsonb가 말판 전체를 담는다(최악 12던지기 약 1.6KB) |
| 멱등 재전송 | 같은 `idempotencyKey` → 저장된 `features` 그대로 → 바이트 동일, 원장 1건 |
| 시드 공개 | `GET /rounds/:id/seed` 기존 그대로. 허브 `handleRevealSeed`의 `replaySpin(math, bet, rng)`이 말판까지 재생해 `totalWin`을 비교한다 |
| 디버그 프리셋 | `SpinDebugPresetSchema += 'boardBonus' \| 'boardGoal' \| 'boardTraps' \| 'boardFork'` — 각각 말판 진입 / `end === 'goal'` / `end === 'traps'` / 갈림길 1회 이상. `debugSpin.ts` 매처 4개, `games.ts`는 `boardBonus` 없는 팩에 409. 예상 탐색 횟수 약 175 / 550 / 1,500 / 265회(기본 `DEFAULT_DEBUG_MAX_TRIES` 5,000). `boardTraps`는 5,000번 안에 못 찾을 확률이 약 3.5%라 QA 중 가끔 `DEBUG_NO_MATCH`가 난다 — 다시 누르면 된다(상한은 올리지 않는다) |
| 상태 복원 | **API 변경 없음**(검수 반영). 허브 localStorage 스냅숏으로 복원한다(§4-6). `rounds`에 `(user_id, game_id, created_at)` 인덱스가 없어 서버 «최신 라운드» 조회는 게임 입장마다 정렬 비용이 들고, 인덱스를 더하면 마이그레이션 번호가 다른 팀과 부딪친다 → 2차 |
| 서버 권위 | 윷 결과·이동·지급은 엔진만 계산한다. 허브의 탭·자동·빨리 감기는 표시 순서만 바꾼다 |

### 4-5. 체험판(`--mode demo`)

`apps/hub/src/demo/server.ts`는 `createApp` + `MemoryRepos`를 그대로 띄우므로 엔진·shared·API 변경이 자동으로 들어간다. 확인할 것은 두 가지다.
1. 팩 json 묶음(`import.meta.glob`)에 새 게임 폴더가 잡히는지. 디버그 프리셋은 체험판에서 열리지 않는다(기존 정책).
2. 복원 스냅숏 키(`tgslot.board.<gameId>`)가 체험판 저장소 스냅숏 키와 겹치지 않는지, 새로고침 뒤 잔액(체험판 저장소)과 말판 복원이 함께 맞는지.

### 4-6. 새로고침 · 응답 유실 복원

| 경우 | 동작 |
|---|---|
| 말판 재생 중 새로고침 | 허브가 **응답을 받는 즉시**(릴이 돌기 전) localStorage `tgslot.board.<gameId>` = `{ roundId, savedAt, totalBet, feature, shown }`(피처 전체 ≤ 1.6KB, `shown` = 보여 준 던지기 수)를 쓴다. 다시 열면 30분 안의 스냅숏이 `shown !== 'done'`이면 **`shown`번째 던지기까지 즉시 배치**하고 이어서 재생한다(코인은 이미 지급됨, 재생은 표시뿐). 화면에 뜨는 잔액은 `GET /me` 서버 값 그대로 |
| 릴이 도는 중 새로고침(응답은 받음) | 스냅숏이 `shown: 0`으로 있으니 같은 판을 **처음부터** 재생한다 |
| 응답을 못 받고 새로고침 | 스냅숏이 없으니 말판을 다시 보여 주지 못한다. 코인은 서버에 안전하게 들어가 있다(드문 경우 — 1/175 스핀 × 응답 유실). 서버 `lastBoard` 복원은 2차(§13 K4) |
| 표시가 끝난 판 | `shown: 'done'`으로 덮어 두 번 보이지 않게 한다 |
| 스냅숏 검증 | 복원 전 `replayBoard(config, steps, totalBet, cap)`로 다시 계산해 스냅숏의 `pot·multiplier·payout`과 같을 때만 재생(어긋나면 버리고 진단 로그). 표시 전용이라 지갑에는 아무 영향이 없다 |

localStorage는 편의용이다. 지갑·결과는 언제나 서버 값이다(읽기·쓰기 전부 try/catch, 실패해도 정상 진행). 다른 기기 «지난 말판 결과» 팝업은 뺐다(서버 조회가 필요).

---

## 5. 수학 목표 · 튜닝 · 감사

### 5-1. RTP 분해 목표

| 몫 | 목표 |
|---|---:|
| 라인 | 71.3% |
| 스캐터 지급(3개 = ×2) | 1.1% (`p × 2`) |
| 말판 | 22.1% (`p × E[말판]` = 0.00570 × 38.5 ≈ 21.9 → 튜닝으로 맞춤) |
| **합계** | **94.5%** ± 0.5pp |
| 허브 잭팟(모델 밖) | 1.5% |

### 5-2. 튜닝 순서 (손잡이마다 효과가 분리돼 있다)

1. **말판 구조**(DP만, 초 단위 반복): 함정 위치·개수, 기회 수, 윷 가중치로 결승률·함정 끝 비율·갈림길률·평균 던지기를 §3-6 목표 범위에 넣는다. `boardExpectation`이 정확값을 바로 준다.
2. **말판 값 배율 k**: 코인·큰 상·최소 지급을 전부 k배 하면 말판 평균이 **정확히 k배**(배수 칸은 그대로). 선형 손잡이다. 정수 유지 위해 표를 다시 반올림하고 DP로 재확인.
3. **초롱 밀도**(릴 1·3·5 스트립의 초롱 수/길이) → 트리거 확률 `p`(해석식, 정확). 목표 1/175(허용 1/150~1/210).
4. **기본 배당표 선형 배율 + 스트립 밀도** → 라인 몫 71.3%, 적중률 28~33%. 라인 몫은 기존 해석 경로(`expectedLineMultiplier`)로 정확히 나온다.
5. 합계를 MC 파일럿 5M으로 확인 → 정식 감사.

`tune-cli`에 말판 줄을 더한다: `boardExpectation` 결과(평균·σ·최대·종료 비율·갈림길률), `p`, 말판 몫, `--board-scale k` 미리보기.

### 5-3. 감사 게이트 (HOWTO §6 + 카탈로그 §4 + 말판 전용)

| 관문 | 기준 |
|---|---|
| CI(40만) | `\|rtp−target\| ≤ max(0.5pp, 3·SE)` + 재현성 + 정밀도 필드 |
| 정식 감사(MC) | `\|rtp−94.5\| ≤ 0.5pp` **그리고** ci95 반폭 ≤ 0.2pp, `n ≥ n*` |
| 기존 | 레벨 6개 각각 ±0.5pp · 적중률 10~60% · 최대 배수 ≥ 50x · 독립 MC 3SE · 분포 합 1 · 잭팟 포함 96.0 ± 0.5 |
| 말판 | 최장 던지기 ≤ 12(위반 0건) · 종료 사유 4종 비율이 리포트에 있음 · **MC 말판 평균이 DP 평균과 3SE 안** · 관측 최대 말판 지급 ≤ `maxWin` · 갈림길률 리포트 · `winCapped` 도달 0건(구조상) |
| 회귀 | live 7팩 골든 해시·2M 수치 동일 |

### 5-4. 예상 σ와 n*

- 기본 게임(프리스핀 없는 25줄) σ를 약 3으로 본다(fruit-fiesta 4.63은 프리스핀 포함). `E[X²]_기본 ≈ 9.5`.
- 말판 기여 `p × E[B²] = 0.0057 × 2,861 ≈ 16.3`.
- 분산 ≈ 9.5 + 16.3 − 0.945² ≈ 25 → **σ̂ ≈ 5.0**. `n* = ⌈(1.96·5.0·1.1/0.002)²⌉ ≈ 29M` → `manifest.auditSpins = 30,000,000`.
- 기본 σ가 더 크면(4.5) σ̂ ≈ 6.0 → n* ≈ 42M → 50M. 파일럿 5M에서 확정한다.
- 시간: 25줄 평가 약 4~6µs/스핀, 말판은 0.6%만 → 30M ≈ 단일 2~3분, `--shards 4` 약 1분. 파일럿 5M 약 20초.
- σ̂가 7을 넘으면(말판 꼬리가 크면) 큰 상을 줄이고 지름길 코인을 올려 평균은 유지하고 꼬리만 깎는다.

---

## 6. 엔진 · 공용 패키지 변경 목록 (파일 단위)

**원칙**: 다른 두 신작 팀이 같은 공용 파일을 동시에 고친다. 피처 로직은 새 파일, 공용 파일은 **한두 줄 추가**만. i18n 키는 `board.*`·`hanbok.*` 네임스페이스로 사전 끝에 덧붙인다.

### 6-1. 새 파일

| 파일 | 내용 |
|---|---|
| `packages/slot-engine/src/board.ts` | `stepBoard`(던지기 1회 처리), `advanceBoard`, `playBoard`, `replayBoard`, `applyBoardBonus`(캡·피처·boardWin) |
| `packages/slot-engine/src/boardSchema.ts` | `BoardBonusConfigSchema`(zod), `checkBoardConfig(math, issue)`: 노드·길·갈림길·앞으로 칸·정수 값·`throws ≤ maxThrows ≤ 20`·DP 최대 ≤ `maxWin`·스캐터 필수·`scatter.freeSpins`/`orderRound`/`cascade`/`gamble`과 공존 금지·트리거 ≤ 스캐터가 놓인 릴 수 |
| `packages/slot-engine/src/boardExact.ts` | `boardExpectation`(상태 메모 DP: 칸·길·바구니·배수·등불·기회·던진 수) |
| `packages/slot-engine/src/board.test.ts` · `boardExact.test.ts` · `boardSchema.test.ts` | §6-4 표 |
| `packages/shared/src/board.ts` | `BoardThrowSchema`, `BoardBonusFeatureSchema` (shared `schemas.ts`의 유니온은 이걸 import만) |
| `apps/hub/src/game/boardFlow.ts` (+test) | 말판 재생 상태 기계(순수): `intro → ready → throwing → moving → effect → (fork) → ready … → summary → done`, 이벤트 `tap / auto / skip / timer`, 효과는 반환만(roundFlow.ts와 같은 방식) |
| `apps/hub/src/game/boardPlayback.ts` (+test) | 피처 → 던지기별 표시값, `replayBoard`로 재계산해 서버 값과 비교(불일치 시 서버 값 + 진단 로그), localStorage 복원 표시 |
| `apps/hub/src/components/game/board/BoardBonus.tsx` (+css) | 말판 전체 화면(HUD·판·미리보기·윷 영역·버튼·요약) |
| `.../board/BoardMap.tsx` | SVG 윷판(선·노드·아이콘·꼬리표·지름길 빛), 말 이동 |
| `.../board/YutThrow.tsx` | 윷가락 4개 CSS 3D 뒤집기(코드 드로잉) |
| `.../board/yutLayout.ts` (+test) | `yut29` 노드 정규화 좌표(0~1): 모퉁이 (1,1)(1,0)(0,0)(0,1), 변 0.2 간격, 대각선은 모퉁이→중앙의 1/3·2/3. 판 가장자리 안쪽 여백 = 결승 노드 반지름. 테스트: 판 358px에서 모든 노드 쌍의 중심 거리 ≥ 두 노드 반지름 합 + 6px (가장 붙는 쌍은 a1–o4·a1–o6, b1–o6·b1–o11 같은 모퉁이 옆 대각선 칸) |
| `.../board/BoardCurtain.tsx` | 말판 진입·복귀 전환 클립을 **허브 DOM에서** 재생(theme `transitions.freeSpinsEnter/Exit`의 `src`·`opaqueMs`). 덮인 순간 콜백으로 말판 장착/해제. 클립이 없거나 디코드 실패면 단색 커튼 폴백. 렌더러 `setMode`는 부르지 않는다 — `RendererMode`는 프리스핀 명판·금테까지 바꾸므로 말판에 맞지 않는다. 배경음 덕킹은 같은 시각에 허브가 직접 호출 |
| `.../board/tileIcons.tsx` | 칸 아이콘 SVG(엽전·등불 겹·화살표·엇갈린 윷·소용돌이) — 코드 드로잉 |
| `.../board/BoardHelp.tsx` | 도움말 «말판 보너스» 탭(§11) |
| `apps/hub/src/hooks/useBoardBonus.ts` | GameScreen 연결 훅(피처 감지, 전환, 잔액 표시 지연, 복원 스냅숏). 릴·라인 연출이 끝난 뒤 말판 재생을 Promise로 열고, **그 Promise가 끝나기 전에는 다음 판 예약(오토스핀 재개)·빅윈을 걸지 않는다** |

### 6-2. 공용 파일 최소 수정

| 파일 | 수정 |
|---|---|
| `slot-engine/src/schema.ts` | `boardBonus: BoardBonusConfigSchema.optional()` 1줄 + refine에서 `checkBoardConfig` 호출 1줄 |
| `slot-engine/src/types.ts` | 타입 import·재수출, `FeatureTrigger`에 `BoardBonusTrigger`, `SpinResult.boardWin?` |
| `slot-engine/src/spin.ts` | `resolveSpin` 비연쇄 경로에 `applyBoardBonus` 호출 블록 1곳(§4-3) |
| `slot-engine/src/evaluate.ts` | `featureTriggerCount`에 `?? math.boardBonus?.trigger` |
| `slot-engine/src/analytic.ts` | `isAnalytic`: `boardBonus` 있으면 false |
| `slot-engine/src/index.ts` | `board.ts`·`boardExact.ts` export |
| `shared/src/schemas.ts` | 유니온에 `BoardBonusFeatureSchema`, 프리셋 enum 4개 (`GameStateResponse` 무변경) |
| `api/src/games/engineSpin.ts` | `toSharedFeature` 분기 |
| `api/src/games/debugSpin.ts` · `routes/games.ts` | 프리셋 매처 4개, 409 가드 (`/state`·repos 무변경) |
| `renderer/src/anticipation.ts` | `featureTriggerCount`에 `boardBonus?.trigger` (+ `AnticipationMath` 타입 필드), `anticipatedReels`가 스트립에 스캐터가 없는 릴을 건너뜀(§0 O16) |
| `renderer/src/types.ts` · `game-sdk/src/theme.ts` | `SoundPreset`에 `'hanbok'` |
| `tools/rtp-sim/src/audit/{contributions,report}.ts` + 새 파일 `boardStats.ts`(`cascadeStats.ts`를 본보기로, 기존 파일 이름은 그대로) · `tune-cli.ts` | 말판 기여(`boardWin`), 말판 절(진입률·평균·종료 사유·던지기 분포·갈림길률·DP 대조), tune 말판 줄 |
| `hub/src/lib/debugPreset.ts` | `presetsFor`: `boardBonus` 팩이면 4종 추가, `freeSpins` 제외 |
| `hub/src/lib/audio.ts` · `bgm.ts` · `bgmVoices.ts` | `HANBOK_RECIPE`·말판 효과음 함수·`HANBOK` 배경음 스타일 **추가만** |
| `hub/src/i18n/{ko,en}.ts` | `board.*`·`hanbok.*` 키를 사전 끝에 |
| `hub/src/store/game.ts` | `reveal()`에서 말판 판이면 잔액 `wallet − boardWin`, 착지 당첨 표시 `totalWin − boardWin`(§0 O11) + 응답 수신 즉시 복원 스냅숏 저장 호출 1줄 |
| `hub/src/components/game/GameScreen.tsx` | `useBoardBonus` 훅 호출 1줄 + `<BoardBonus>` 렌더 슬롯 1곳 + 도움말 탭에 `BoardHelp` 1줄 |
| `hub/src/components/GameCard.tsx` | 로비 표기 `5×3 · 25줄` 기존 경로 확인만(변경 없을 가능성 높음) |

### 6-3. 병합 주의 (다른 두 팀)

- 아트 도구(game-sdk asset kind·theme-gen·pack:check)와 API 저장소 계층(repos·`/state`)은 **건드리지 않는다**(검수 반영으로 `prop` kind·`lastBoard` 제거). 병합 표면이 엔진·shared 유니온·허브 연결부로 줄었다.
- `FeatureTrigger` 유니온·프리셋 enum·`SoundPreset`·i18n은 순서만 겹친다(추가 위치는 끝).
- `spin.ts`의 우리 블록은 라인 경로, candy·kraken 쪽은 다른 분기라 충돌 범위가 작다.

### 6-4. 엔진 테스트

| 테스트 | 고정하는 것 |
|---|---|
| 이동 손 사례 10개 | 바깥 길, 결승 넘침, 앞으로 칸, 앞으로가 갈림길에 내려 줌, o5·o10·방 멈춤 전환, 지나가면 전환 없음, 지름길 a에서 방 멈춤 → center |
| 종료 3종 + 하드캡 | 결승 / 함정 3번째 즉시 / 기회 0. 하드캡: 모든 던지기 뒤 `던진 수 + 기회 ≤ maxThrows` 속성 검사(20만 판) + 픽스처 설정(긴 길·함정 없음·윷만)에서 정확히 12번째에 끝남 |
| 한 번 더 상한 | `던진 수 + 기회 ≥ 12`면 윷·모·한 번 더 칸이 기회를 안 늘림 |
| 지급 | `max(5, 바구니×배수)`, 배수 상한 ×4(픽스처로 상한 클램프 확인), 정수, 캡과 `winCapped` |
| `replayBoard === playBoard` | 같은 RNG 기록으로 20만 판 |
| DP vs MC | `boardExpectation.mean`과 MC 200만 판 평균이 3SE 안, `max` ≥ MC 관측 최대 |
| RNG 호출 수 | §4-1 |
| 스키마 | 순환 길·끊긴 길·잘못된 갈림길·앞→앞 연쇄·정수 아닌 값·`maxWin` 초과·`orderRound` 공존 거부 |
| 골든 | live 7팩 해시 동일 |

---

## 7. 화면 스토리보드 (390 / 430 세로)

### 7-1. 기본 게임

- 기존 5×3 레이아웃 그대로. 셀 430px 약 79, 390px 약 72(판독 기준 58 이상).
- 당첨은 선을 그리지 않고 심볼 이펙트로만(사용자 취향). 금액은 컨트롤 위 WinStrip.
- 초롱 2개(릴 1·3)가 서면 릴 5 감속 + 긴장음(기존 기대감, normal·quick만).

### 7-2. 말판 진입 (총 약 5.5s)

| 시각 | 내용 |
|---|---|
| 0.0 | 릴 착지, 라인 당첨 표시(있으면 기존 A단계 1회) |
| +0.4 | 초롱 3개 강조(시트 `bonus-win` + 불빛 번짐), 효과음 `feature`(꽹과리 연타) |
| +1.6 | 진입 전환 클립(비단이 휘감김, `BoardCurtain` DOM 재생) — 덮인 순간(`opaqueMs`)에 말판 오버레이 장착, 캔버스 일시정지 |
| +4.6 | 클립 걷힘 → 등불 3개가 하나씩 켜짐(200ms 간격) → 배너 "말판 보너스 · 기회 5번"(900ms) |
| +5.5 | 첫 던지기 대기(탭, 자동이면 1.2s 뒤) |

### 7-3. 말판 화면 레이아웃

```
430×932                                   390×844
┌──────────────────────────────┐          (같은 배치, 판 358px)
│ 기회 ●●●●○  등불 🏮🏮🏮        │ 56px HUD (아이콘+숫자, 14px)
│ 배수 ×2    바구니 14배        │
├──────────────────────────────┤
│                              │
│      윷판 398×398 (SVG)       │ 노드: 일반 40px(390: 36), 모퉁이·방 50(46), 결승 58(52)
│   다섯 칸에 도·개·걸·윷·모     │ 숫자 15px 굵게, 꼬리표 12px 칩
│   꼬리표(미리보기)            │
│                              │
├──────────────────────────────┤
│   "걸! 3칸"  (결과 32px)      │ 48px
│  ═══ 멍석 위 윷가락 4개 ═══   │ 112px
├──────────────────────────────┤
│ 지금 끝나면 28배 (=2,800)     │ 28px 강조 줄 — 금액은 컨트롤 바로 위(사용자 취향)
│ [ 윷 던지기 ]  [자동] [⏩]    │ 64px, 엄지 영역
└──────────────────────────────┘
```

- 세로 합계: 430 = 56+398+48+112+28+64 = 706px, 390 = 56+358+48+112+28+64 = 666px. 텔레그램 헤더·안전 영역을 빼도(약 90px) 두 화면 모두 남는다.
- 판 배경은 말판 배경 그림(빈 멍석·광장), 선·노드·아이콘은 전부 SVG 코드 드로잉 → 좌표가 그림과 어긋날 일이 없다.
- 칸 사이 연결은 **옅은 정적 점선**(빛·움직임 없음). 당첨 선처럼 보이는 굵은 선, 판을 가로지르는 빛 훑기는 쓰지 않는다(사용자 취향).
- 지나간 칸은 살짝 어둡게, 함정은 붉은 테, 갈림길은 금빛 점선 고리 + "지름길" 작은 글자. 지름길 열림은 칸 등불이 하나씩 차례로 켜지는 것으로만 보여 준다.
- 꼬리표는 노드 위가 아니라 노드에서 판 중앙 쪽으로 비켜 붙인 칩이다. 두 결과가 같은 칸이면(대개 결승 넘침) 칩을 `걸·윷`처럼 한 칩에 합친다.
- 말 = `lantern_girl` 심볼 그림을 둥근 말 받침(코드 드로잉 원판 + 테두리)에 얹은 것, 노드 위 46px(390: 42px), 이동 시 콩콩 뛰기(squash 0.92/1.06). 결승 등불탑 = 코드 드로잉 3단 탑 + 꼭대기 `bonus` 그림.

### 7-4. 던지기 1회 연출 · 시간 예산

| 단계 | normal | quick | turbo | 모션 축소 |
|---|---:|---:|---:|---:|
| 윷가락 날기·뒤집힘 | 650 | 450 | 300 | 0(바로 결과 면) |
| 결과 표시 "걸!" | 350 | 250 | 150 | 200 |
| 말 이동(칸당) | 180 | 130 | 90 | 0(한 번에 페이드) |
| 앞으로 칸 추가 이동(칸당) | 180 | 130 | 90 | 0 |
| 칸 효과(코인 날아감·배수 펀치·함정 바람·한 번 더) | 450 | 320 | 220 | 150 |
| 갈림길 열림(지름길 칸 등불 차례 점등) | +500 | +350 | +250 | +0 |
| 자동 모드 다음 던지기 대기 | 600 | 400 | 250 | 300 |
| **평균 던지기(2.3칸, 자동)** | **≈2.5s** | 1.8s | 1.2s | 0.7s |
| **말판 전체(평균 5.7번, 자동)** | **≈14s** | 10s | 7s | 4s |

게이트: 자동 재생 기준 normal 말판 전체 p95 ≤ 20s, turbo ≤ 10s.

- 윷·모: 결과 뒤 "한 번 더!" 도장 + 기회 점 하나 추가(펀치).
- 함정: 소용돌이 바람이 말을 스치고 등불 하나가 «훅» 꺼짐 + 화면 6px 흔들림(모션 축소 시 없음) + light haptic. 마지막 남은 등불은 깜빡임.
- 코인 칸: 엽전 3~6개가 바구니 숫자로 날아감(DOM 풀 12개 재사용, 모션 축소 시 숫자만).
- 배수 칸: "×2 → ×3" 펀치 + "지금 끝나면" 숫자 롤업.

### 7-5. 탭 · 자동 · 빨리 감기(STOP) — 결과는 절대 안 바뀐다

| 입력 | 동작 |
|---|---|
| [윷 던지기] 탭 | 다음 던지기 재생 시작. 결과는 `throws[i]` 그대로 |
| 재생 중 화면 탭 | 지금 던지기를 즉시 끝 상태로(남은 이동·효과 압축 120ms) |
| [자동] | 대기 없이 순서대로 재생. 오토스핀 중 진입하면 자동으로 켜짐 |
| [⏩] 1회 | 남은 던지기를 던지기당 300ms로 압축 재생(효과음은 던지기당 틱 1개) |
| [⏩] 2회 | 요약 화면으로 바로 |
| 앱 숨김(visibilitychange) | 일시정지, 돌아오면 이어서 |

### 7-6. 말판 종료 (약 6s)

| 시각 | 내용 |
|---|---|
| 0.0 | 마지막 효과. 결승이면 등불탑 점등 + 불꽃(코드 입자) + "결승! 큰 상 30" |
| +0.8 | 요약 카드(중앙): `바구니 24배 × 배수 3 = 72배` / 끝난 이유 한 줄("결승 도착" · "등불이 모두 꺼짐" · "기회를 다 씀") / 코인 롤업 1.2s |
| +2.0 | [받기] (오토스핀이면 2.5s 뒤 자동) |
| 탭 후 | 복귀 전환 클립(윷가락 착지로 비단이 갈라짐) → 덮인 순간 오버레이 해제·캔버스 재개 → 기본 화면 |
| 복귀 후 | WinStrip에 `라인 + 초롱 + 말판` 합계, 잔액이 서버 값으로 맞춰짐 → 등급이 되면 빅윈 공용 스킨(theme.json celebration) **한 번만** |

### 7-7. 빅윈

- 등급 판정은 트리거 스핀 `totalWin / totalBet` 기준(라인+스캐터+말판), 말판 요약이 끝난 뒤에만.
- 셀레브레이션 스킨: 오방색 팔레트, 파티클 `petal`·`coin`·`spark`, motion `flutter`, rays `halo`, waves `double`, 제목 `serif`(§8-4).

### 7-8. 메모리

- 말판 그림(말판 배경·진입/복귀 클립)은 초롱 2개 착지 때 미리 읽고(`decode()`), 말판이 끝나면 클립 img를 제거, 게임 화면을 떠날 때 배경도 해제. 말·결승 탑은 이미 올라와 있는 심볼 그림을 재사용해 추가 텍스처가 없다.
- 말판 중 Pixi 티커 일시정지(WebGL 컨텍스트 하나만 유지, 두 번째 캔버스 없음).
- WAAPI 애니메이션은 언마운트 때 `cancel()`, 타이머는 상태 기계 효과로만 만들고 전부 해제. 코인 입자 DOM 풀 12개 고정.

---

## 8. 아트 목록

### 8-1. 컨셉

**민화 + 부드러운 3D 하이브리드, 야시장 등불 밤.** 한지 결·가는 먹선·오방색 평면 채색 위에 얕은 입체 조명, 따뜻한 등불 빛(`#ffb765`).
팔레트: 적 `#d8433c` · 청 `#2f6fb0` · 황 `#e8c34a` · 백 `#f2ece0` · 흑 `#1c1a18` · 등불 `#ffb765` · 밤하늘 `#1f2440`.
**stylePrefix 초안**: "Korean minhwa folk-painting style blended with soft toy-like 3D volume, hanji paper grain and fine ink outlines, flat obangsaek colors (red #d8433c, blue #2f6fb0, yellow #e8c34a, ivory #f2ece0) with gentle volumetric lighting and a warm night-market lantern glow (#ffb765), bold simple silhouette that reads at 64px, no watermark, no baked-in drop shadow, premium mobile slot game asset quality —"
**negative 초안**: "photorealistic photography, glossy plastic, neon cyberpunk, blurry, watermark, signature, text, letters, hangul characters, random glyphs, busy cluttered background, baked-in drop shadow, cropped edges, multiple duplicate objects, existing anime or drama characters"

### 8-2. 생성 자산 (Codex, 총 18장 + 클립 2편 — 말·결승 탑은 심볼 그림 재사용, §0 O13)

| id | kind | size → out | 프롬프트 초안(stylePrefix 뒤) |
|---|---|---|---|
| `wild` | symbol | 1024² → 512 | a carved wooden Korean tiger mask in minhwa style, big round eyes and a wide grin, red and white lacquer with blue stripes, the most ornate symbol, centered, #00FF00 background |
| `bonus` | symbol | 1024² → 512 | a glowing Korean silk lantern (blue top half, red bottom half) with gold frame ribbons, warm light inside, the only vertical glowing symbol |
| `lantern_girl` | symbol | 1024² → 512 | bust portrait of an original cheerful young woman merchant in a hanbok (yellow jeogori, red skirt), holding a small lantern, friendly smile, chibi-leaning proportions, not any existing character |
| `scholar` | symbol | 1024² → 512 | bust portrait of an original young scholar boy guest wearing a black gat hat and pale blue dopo robe, curious expression |
| `granny` | symbol | 1024² → 512 | bust portrait of an original kind grandmother rice-cake seller with a headscarf and apron, holding a plate of colorful tteok |
| `norigae` | symbol | 1024² → 512 | a norigae ornament: knotted cord with a jade piece and long red tassel, vertical |
| `flower_shoes` | symbol | 1024² → 512 | a pair of embroidered Korean flower shoes (kkotsin), seen from 3/4 angle, wide flat silhouette |
| `lucky_pouch` | symbol | 1024² → 512 | a round silk lucky pouch (bokjumeoni) with drawstring tied, blue and red with gold pattern |
| `hotteok` | symbol | 1024² → 512 | a hotteok pancake with dripping honey sugar filling in a paper cup |
| `tteokbokki` | symbol | 1024² → 512 | tteokbokki rice cakes in red sauce on a wooden skewer, vertical |
| `dalgona` | symbol | 1024² → 512 | a round golden dalgona sugar candy disc with a pressed star shape |
| `frame` | frame | 1024² → 1080 | giwa roof eaves marquee with two silk lanterns at the top, dancheong-painted thin pillars on the sides, base of a wooden stall counter; reel window x 2–98%, y 19–81%, clearly wider than tall (about 3:2 landscape), side rails ≤ 1.5%; "the reel window is pure #00FF00 and nothing is drawn inside it" 문장 고정 |
| `bg` | bg | 1024×1536 → 1080 | a lantern-lit Korean night market alley, strings of warm lanterns, stall awnings, soft bokeh, desaturated so symbols stand out |
| `bgFreeSpins`(→ 말판 배경) | bg | 1024×1536 → 1080 | a festive night market square seen from above, a large **empty plain woven straw mat** in the center taking 85% of the width, lanterns around the edges; **no markings, no lines, no dots on the mat**(노드는 코드가 그린다) |
| `thumb` | thumb | 1536×1024 → 640 | the lantern girl hopping onto a corner of a yut board while four wooden yut sticks spin in the air, lanterns glowing |
| `wild-win` | sheet 3×3 @12fps | 1024² → 768 | 호랑이 탈 눈 깜빡 + 수염 떨림 |
| `bonus-win` | sheet 3×3 @12fps | 1024² → 768 | 초롱 불빛 일렁임 + 흔들림 |
| `lantern_girl-win` | sheet 3×3 @12fps | 1024² → 768 | 아가씨가 초롱을 흔들며 웃음 |

**생성 순서(한도 대비 우선순위)**: 심볼 11 → frame → bg → bgFreeSpins → thumb → 시트 3. 한도가 끝나면 멈추고 남은 목록을 보고한다(로컬 SDXL 대체 금지).

### 8-3. 코드 드로잉 (생성하지 않음 — 이쪽이 낫다)

| 대상 | 이유 |
|---|---|
| 윷판 점선·노드·꼬리표·지름길 칸 점등 | 좌표 정확도, 상태(지나감·함정·갈림길) 색 변경 |
| 말 받침·결승 등불탑(3단 탑 + 꼭대기 `bonus` 그림) | 새 asset kind 없이 심볼 그림 재사용(§0 O13), 점등 애니메이션 |
| 칸 아이콘 6종(엽전·등불 겹·화살표·엇갈린 윷·소용돌이·멍석) | 28~32px 작은 크기에서 선명, 숫자 겹침 |
| 윷가락 4개(납작한 면 X 무늬 3개 / 둥근 면 나무결) | 3D 뒤집기 애니메이션, 앞뒷면 전환 |
| 등불 HUD 아이콘·기회 점 | 꺼짐 애니메이션 |
| 코인 입자·불꽃 | 기존 코드 입자 재사용 |

### 8-4. theme.json 핵심

```json
"sound": { "preset": "hanbok" },
"celebration": {
  "palette": { "core": "#f2ece0", "edge": "#d8433c", "glow": "#ffb76580" },
  "particles": { "shapes": ["petal", "coin", "spark"], "colors": ["#d8433c", "#2f6fb0", "#e8c34a", "#f2ece0", "#ffb765"], "motion": "flutter", "size": 1.2 },
  "rays": { "style": "halo" }, "waves": { "style": "double" },
  "title": { "font": "serif", "weight": 800, "stroke": 2, "strokeColor": "#1c1a18cc" }
},
"transitions": { "freeSpinsEnter": { "src": "transitions/fs-enter.webp" }, "freeSpinsExit": { "src": "transitions/fs-exit.webp" } }
```
전환·배경 키 이름은 기존(`freeSpins*`, `backgroundFreeSpins`)을 그대로 쓴다(candy 선례). 허브가 말판 진입·복귀에 같은 키를 쓴다.

### 8-5. 검수 (지난 실패에서 나온 체크)

| 체크 | 방법 |
|---|---|
| 회수 오류로 다른 그림이 들어옴 | `theme-gen contact` 시트를 Read로 열어 id↔그림 1:1, 회수 로그가 찍힌 자산 재확인 |
| 프레임 창 감지가 창 안 흰 칠에 속음 | 알파 투명 영역 실측으로 `frameLayout.window` 확인(±1%), 430px에서 5열이 창에 맞는지 |
| 중단된 gen이 theme.json에 마지막 자산만 남김 | 매 gen 뒤 theme.json 필수 키 확인, 필요하면 `--reprocess` |
| 말판 배경에 점·선이 그려짐 | 눈 검수. 그려졌으면 재생성(노드와 겹치면 판독 불가) |
| 캐릭터 얼굴이 기존 작품을 닮음 | 눈 검수, 닮으면 재생성 |
| 글자(한글 비슷한 획) | 눈 검수, 있으면 재생성 |

---

## 9. 효과음 · 배경음 프리셋 `hanbok`

### 9-1. 효과음 (`HANBOK_RECIPE` + 말판 전용 함수, 평조 오음 G A B D E)

| 이벤트 | 합성 설계 | 기존과 구분점 |
|---|---|---|
| 스핀 시작 | 가야금 짧은 글리산도(뜯는 현 5음 상행) | shrine 고토는 미야코부시 음계 → 우리는 장조 오음 |
| 릴 정지 | 장구 «덕»(채편: 2.5kHz 대역 잡음 + 400Hz 몸통), 마지막 릴 «쿵»(궁편 저음) | shrine 목탁(속 빈 나무)과 다른 가죽 질감 |
| 작은 당첨 | 가야금 3음 상행 | |
| 큰 당첨 | 해금 활 긋기 스웰(톱니파→대역통과 900~1500Hz, 비브라토 5.5Hz) + 꽹과리 한 번 | 해금은 기존 어느 프리셋에도 없음 |
| 피처(초롱 3) | 꽹과리 «갱 갱 갱개갱»(비조화 금속 배음) + 징 저음 스웰 | 금속성 놋쇠 — shrine·candy에 없음 |
| 롤업 틱 / 끝 | 가야금 하모닉 «팅» / 징 짧게 | |
| `playYutToss()` | 막대가 공기를 가르는 휙(잡음 고역 상승 스윕 250ms) | |
| `playYutLand(steps)` | 나무 막대 4번 «딱딱딱딱»(간격 25~60ms, 가락마다 음높이 다름, 납작 면은 밝게·둥근 면은 둔하게) | shrine 딱따기(2타 동시)와 리듬 다름 |
| `playYutCall(steps)` | 결과 음: 도→모로 갈수록 오음계 위로, 윷·모는 꽹과리 장식 + "한 번 더" 반짝 | |
| `playTokenHop(i)` | 부드러운 나무 톡, 칸마다 반음씩 위 | |
| `playTileCoin()` | 엽전 짤랑(짧은 고역 배음 3~4개 무작위 아님 — 고정 패턴) | |
| `playTileMult(level)` | 해금 짧은 상행 슬라이드, 단계마다 한 음 위 | |
| `playTileTrap()` | 바람 «쉬익»(저역통과 하강 스윕) + 등불 «훅» + 장구 «쿵» 하강 | |
| `playFork()` | 대금 숨 섞인 3음 상행(사인+잡음) — 지름길 열림 | |
| `playGoal()` | 징 + 꽹과리 몰아치기 + 가야금 상행 | |
| `playBoardSummary()` | 장구 «덩» + 가야금 화음 | |

수치 목표(earshot): 전 스템 true peak ≤ −1 dBTP(기존 실측처럼 −9 근처), 꼬리 클릭 없음, `playYutCall` 1→5 스펙트럼 피크 단조 증가, `playTileMult` 단조 증가, **같은 이벤트의 CLAP 코사인 hanbok↔shrine ≤ 0.90**(기존 western↔shrine 0.98이 반면교사), hanbok↔candy ≤ 0.90.

### 9-2. 배경음 `HANBOK` (`bgm.ts` 스타일 추가)

- 기본: **굿거리 느낌 12/8**, 점4분 = 80, 평조 G 장조 오음. 장구 장단(덩 · 기덕 쿵 · 더러러 쿵 · 기덕 쿵 덕 ·), 가야금 분산화음 반주, 해금 선율(두 마디 악구), 4마디마다 징 한 번. 엔진이 3연 박을 못 받으면 8분 셔플(2:1)로 근사.
- 말판(free 변주): 자진모리 느낌으로 템포 ×1.35, 꽹과리 박 강조 추가, 해금 대신 대금 선율, +2반음.
- 목표: 기본 −30~−32 LUFS(기존과 같음), 말판 변주 −30~−31, 전환 커튼 덕킹 동작, BGM 코사인 hanbok↔shrine ≤ 0.92.
- 기록: `docs/SOUND_CHECK.md`에 «hanbok-night-market 사운드» 절(candy 절과 같은 표). **수치는 참고값, 최종 귀 판정은 사용자 몫**이라고 적는다.

---

## 10. 전환 클립 2편 (SeeDance 2.0, TRANSITION_DESIGN 규칙)

공통: 9:16, 13초 발주 후 3초 컷, 16fps/q60 애니메이션 WebP, `check:clips` 통과. 편당 $0.93, 재시도 포함 **최대 3편**. 스크립트는 `D:/park/tgslot-wt/_tools/vidgen-t2v.mjs`(없으면 candy 때처럼 `vidgen.mjs`에서 이미지 첨부·16:9 고정을 걷어 낸 t2v 변형), 키는 `node --env-file=D:/park/YD_Claude_RND/ben_suno/.env`로만.

**소재 선택 이유.** fruit-fiesta 복귀가 «등불이 올라간다»라서 등불을 주 소재로 쓰면 겹친다. 그래서 진입은 **비단 천**(오방색, 겹치면 구조적으로 불투명 → R1, 계속 물결쳐 단색 정지가 안 됨 → R11), 복귀는 **윷가락 착지**(말판의 끝을 윷 한 번으로 읽힌다)로 한다. 진입 «휘감겨 덮임» ↔ 복귀 «찍고 갈라짐»으로 방향이 다르다(R6). 사람 없이 천과 막대가 스스로 움직인다(R4). "hanbok"이라는 단어는 사람을 부르므로 쓰지 않고 "empty silk cloth"로 쓴다.

### 10-1. 진입 — 오방색 비단이 휘감겨 덮는다

```
Vertical full-screen game transition effect, Korean minhwa folk-painting style blended with soft toy-like 3D volume, hanji paper grain and fine ink outlines, flat obangsaek colors with a warm lantern glow, not photorealistic, premium mobile game art. Long panels of empty silk cloth in red #d8433c, blue #2f6fb0, yellow #e8c34a and ivory #f2ece0, edged with thin gold trim, billow in front of a lantern-lit night market alley glowing warm #ffb765. One continuous motion repeats: the silk panels whirl up from the bottom of the frame and sweep in fuller and fuller, overlapping fold over fold in that same billowing swirl until the whole frame is completely opaque edge to edge, corner to corner, a seamless layered mass of rippling silk, holding fully covered for a beat while the silk keeps rippling and folding so the covered frame is never a flat still color, then the panels slide away and the alley glows through before the next swirl. The silk sweeping in and the frame being covered are one single motion, never separate steps. Each full cycle lasts about three seconds and repeats about four times across the clip. The cloth is plain with no writing. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```
규칙: R1·R2·R3(본문 고정 문구, `camera_fixed` 미전달)·R4·R5·R7·R8(휘감김 = 덮임)·R9(주어 «silk panels» 첫 문단)·R11·R12(stylePrefix 어휘·hex, negative의 photorealistic)·R13(겪은 실패만). 컷: 덮임이 시작되는 사이클의 0.3s 전부터 3.0s, `opaqueMs`는 실측.

### 10-2. 복귀 — 윷가락이 떨어져 비단이 갈라진다

```
Vertical full-screen game transition effect, Korean minhwa folk-painting style blended with soft toy-like 3D volume, hanji paper grain and fine ink outlines, flat obangsaek colors with a warm lantern glow, not photorealistic, premium mobile game art. Four plain wooden yut sticks, each a long half-round stick with one flat pale face and one rounded brown face, float centered above a thick drift of rippling silk cloth in red #d8433c, blue #2f6fb0, yellow #e8c34a and ivory #f2ece0 that fills the frame completely, edge to edge, corner to corner. One continuous motion repeats: the four sticks drop and land on the silk with a crisp clack, and that same impact splits the silk down the middle and throws the panels apart to both sides of the frame in rippling waves, revealing a calm lantern-lit night market alley glowing warm #ffb765, fully clear and still, then the silk sweeps back in and covers the whole frame corner to corner in complete opacity for a beat while it keeps rippling, before the sticks drop again. The sticks landing and the silk splitting apart are one single motion, never separate steps. While the frame is covered the silk keeps moving, never a flat still color. Each full cycle lasts about three seconds and repeats about four times across the clip. The sticks and the cloth have no markings. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```
규칙: R1·R2·R4·R6·R8(착지 = 갈라짐)·R9(윷가락 첫 문장)·R11·R12·R13. 덮인 채 시작하므로 `opaqueMs: 0` 후보.

**재시도 기준**: 덮임이 화면 85% 미만(candy 1차 exit 실패 사례) / 사람·손·글자 등장 / 정지 프레임 > 10% → 해당 방향만 1편 재발주(총 3편 상한). 결과는 TRANSITION_DESIGN §2-8(새 절)에 프롬프트·컷 구간·용량을 기록.

---

## 11. 도움말 페이지 구성 (`HelpPage` 탭, ko/en)

| 탭 | 내용 |
|---|---|
| 1 배당표 | 심볼 11종 그림 + 2·3·4·5 배당(라인당 베팅 기준 표기), 와일드 설명 "청사초롱 말고 모두 대신한다" |
| 2 줄 모양 | 25줄 패턴 그림(기존 컴포넌트), "왼쪽 릴부터 이어져야 한다" |
| 3 **말판 보너스** (`BoardHelp.tsx`) | 아래 그림 6칸 |

말판 보너스 탭 그림 6칸 (390px 폭에서 한 칸 = 그림 + 두 줄 설명):
1. **들어가기**: 릴 1·3·5에 청사초롱 3개 그림 → "총 베팅 ×2 + 말판 보너스"
2. **윷 던지기**: 윷가락 4개 앞뒷면 그림 5줄(도 1칸 · 개 2칸 · 걸 3칸 · 윷 4칸 + 한 번 더 · 모 5칸 + 한 번 더) — `YutThrow`의 정지 그림 재사용
3. **칸 종류**: 아이콘 6개 + 한 줄씩(코인: 바구니에 담김 / 배수: 마지막에 바구니 전체에 곱함 / 앞으로: N칸 더 / 한 번 더: 기회 +1 / 함정: 등불이 하나 꺼짐 / 결승: 큰 상)
4. **지름길**: 작은 윷판 그림에 갈림길 3곳 금빛 표시 + 화살표 → "모퉁이나 한가운데에 딱 멈추면 다음부터 지름길로 간다"
5. **끝나는 때**: 기회를 다 씀 · 등불 3개가 모두 꺼짐 · 결승 도착 (+ 던지기는 최대 12번)
6. **받는 돈**: "바구니 × 배수, 적어도 총 베팅의 5배, 많게는 200배" + "윷 결과는 스핀할 때 서버가 이미 정해 두고, 화면에서는 한 번씩 보여 준다(공정성 검증 가능)"

- 값(기회·등불·최소·최대·큰 상)은 **math.json에서 읽어** 표시한다(하드코딩 금지 → 튜닝해도 도움말이 맞음).
- i18n: `board.help.*`, `hanbok.symbol.*`. 도·개·걸·윷·모는 en에서 "Do (1)·Gae (2)·Geol (3)·Yut (4)·Mo (5)"로 숫자를 함께.

---

## 12. 기능별 QA 확인표 (디버그 프리셋으로 상황을 만들고 한 번씩)

브라우저: 개발 스택(`?debug=1`) + 헤드리스 크롬 390×844·430×932(DPR 2), 스크린샷은 `D:/park/tgslot-wt/_qa/new-b-*`, 체험판 빌드 1회. 시간 경과 QA 없음.

**기본 게임**
- [ ] 셀 430px ≥ 76, 390px ≥ 70, 5열이 프레임 창에 맞음(잘림 0)
- [ ] 당첨 선 없음, 심볼 이펙트로만 표시, 금액은 컨트롤 위
- [ ] 초롱이 릴 2·4에 안 나옴, 한 릴에 2개 안 보임

**기대감**
- [ ] 초롱 2개(릴 1·3) 착지 시 릴 5만 감속(normal·quick), **릴 4는 감속 없음**(§0 O16), turbo·모션 축소 꺼짐

**말판 진입** (`boardBonus`)
- [ ] 초롱 강조 → 진입 클립 → 등불 3개 점등 → "기회 5번"
- [ ] 착지 순간 잔액이 말판 몫만큼 덜 보임(결과 누설 0)

**던지기 · 이동** (`boardBonus`)
- [ ] 화면 윷 결과·도착 칸·HUD가 응답 `throws[i]`와 전부 같음(진단 로그 불일치 0)
- [ ] 도~모 미리보기 꼬리표가 실제 도착 칸과 일치(갈림길 길 포함)
- [ ] 윷·모에서 "한 번 더" + 기회 점 증가
- [ ] 탭 타이밍을 바꿔도 결과 동일(같은 라운드 재전송으로 두 번 비교)

**갈림길** (`boardFork`)
- [ ] 모퉁이/방에 딱 멈추면 지름길 칸 등불이 차례로 켜짐(판을 훑는 빛·선 없음) + 다음 던지기가 안쪽 길로
- [ ] 지나가기만 하면 꺾지 않음

**함정 · 끝** (`boardTraps`)
- [ ] 함정마다 등불 하나 꺼짐, 3번째에서 즉시 요약
- [ ] 요약 "등불이 모두 꺼짐", 바구니는 그대로 지급

**결승** (`boardGoal`)
- [ ] 등불탑 점등·불꽃, 큰 상이 바구니에 더해진 뒤 × 배수

**요약 · 정산**
- [ ] `바구니 × 배수 = 지급`이 응답 `payout`·`win`과 일치, 최소 5배 적용 사례 확인
- [ ] 복귀 클립 → WinStrip 합계 = `totalWin`, 잔액 = 서버 wallet
- [ ] 빅윈 셀레브레이션은 말판 요약 뒤 한 번만, 오방색 스킨

**빨리 감기 · 자동**
- [ ] ⏩ 1회 압축(던지기당 300ms), 2회 요약 직행, 금액 동일
- [ ] 오토스핀 중 진입 → 자동 재생 → 요약 자동 닫힘 → 오토스핀 계속

**복원**
- [ ] 말판 중 새로고침 → 보던 던지기부터 이어짐(스냅숏), 잔액은 서버 값
- [ ] 릴이 도는 중 새로고침 → 같은 판을 처음부터 재생, 잔액 이중 증가 없음
- [ ] 스냅숏을 손으로 망가뜨리면(값 변조) 재생하지 않고 진단 로그만
- [ ] 기회 1번 남았을 때 «마지막 한 번!» 버튼
- [ ] 다 본 판은 다시 안 뜸

**멱등 · 공개**
- [ ] 같은 키 재전송 → 바이트 동일, 원장 1건
- [ ] 공정성 검증(시드 공개) → `totalWin` 일치(말판 포함)

**체험판**
- [ ] `build:demo` 결과에서 말판 진입·재생·새로고침 복원 동작

**도움말**
- [ ] 말판 탭 그림 6칸, 값이 math.json과 일치, ko/en 키 누락 0, 390px 잘림 0

**디버그**
- [ ] 이 게임에서만 말판 프리셋 4종, `freeSpins` 없음, 다른 게임 409

**사운드 · 배경음**
- [ ] 윷 착지 4타, 결과 음 도→모 상승, 함정·지름길·결승 소리 구분
- [ ] 배경음 기본/말판 변주 전환, 커튼 덕킹
- [ ] earshot 수치 SOUND_CHECK 기록, 사용자 귀 판정 1회

**메모리**
- [ ] 말판 10회 진입·종료 후 DOM 노드·리스너 수 원위치, 힙 증가 없음(`memory-smoke` 또는 chrome-devtools 힙 스냅숏)
- [ ] 말판 중 Pixi 티커 정지

**회귀**
- [ ] live 7종 스핀·프리스핀·연쇄·주문 카드 정상, 골든 해시 동일

---

## 13. 위험과 대안

| # | 위험 | 대안 |
|---|---|---|
| K1 | 결승이 너무 쉽거나 어렵다(체감) | 손잡이가 분리돼 있다: 함정 개수·위치(함정 끝·결승률), 기회 수(길이), 윷 가중치(갈림길률). DP가 즉시 답한다. 목표 범위 §3-6 |
| K2 | 말판이 길어 지루하다 | 자동 재생 p95 ≤ 20s 게이트, ⏩ 압축, 기회 5 → 4로 줄이고 값 배율로 몫 보전 |
| K3 | 착지 때 잔액이 먼저 올라 결과가 샌다 | `reveal()` 표시 지연(§0 O11), 화면 이탈 시 즉시 서버 값 |
| K4 | 새로고침·응답 유실 시 말판을 못 봄 | 1차: 응답 수신 즉시 localStorage 스냅숏(§4-6) — 재생 중·릴 회전 중 새로고침은 전부 복원. 응답 자체를 못 받은 경우만 잔액 반영으로 끝(코인 안전). 2차: `rounds (user_id, game_id, created_at)` 인덱스 마이그레이션 + `/state.lastBoard` — 다른 팀 마이그레이션이 병합된 뒤 리드가 번호를 정해서 |
| K5 | 공용 파일 병합 충돌(다른 두 팀) | 새 파일 위주, 공용은 끝에 추가, 네임스페이스 i18n. GameScreen은 훅 1줄·슬롯 1곳 |
| K6 | 반신 심볼 그림을 말로 쓰면 46px에서 얼굴이 작다 | 받침 원 안에서 얼굴 쪽으로 잘라(중심·배율을 `yutLayout`에 상수로) 쓴다. 그래도 안 읽히면 2차에 전신 말 그림 + asset kind 추가(다른 팀 수요와 함께) |
| K7 | Codex 사용량 한도 | §8-2 우선순위 순서. 한도 시 멈추고 남은 목록 보고, 로컬 SDXL 대체 금지 |
| K8 | SeeDance가 비단에 사람을 입힌다(한복 연상) | "hanbok" 단어 미사용, "empty silk cloth". 재발주 1편 여유 |
| K9 | 가야금이 shrine의 고토와 같은 소리로 들린다 | 선율을 해금(활)으로, 장구·꽹과리 비중을 올림. CLAP ≤ 0.90 미달이면 가야금은 반주에서만 |
| K10 | 플레이어가 기회·등불 두 자원을 헷갈린다 | HUD 아이콘 구분(점 vs 등불), "지금 끝나면 N배" 한 줄, 도움말 5번 칸, 첫 진입 때만 2초 안내 말풍선 |
| K11 | 윷가락 4개가 작아 결과가 안 읽힌다 | 결과 글자 32px("걸! 3칸")가 정본, 가락은 연출 |
| K12 | 기본 게임이 밋밋하다(99.4%가 그냥 라인) | 설정만으로 기존 `upgrade` 뮤테이션(예: 달고나 3개 이상이면 확률로 떡볶이로)을 더할 수 있다. 해석 경로는 MC라 영향 없음. 1차 출시 후 사용자 판단 |
| K13 | 저사양 안드로이드 웹뷰에서 CSS 3D가 버벅임 | 모션 축소 경로(뒤집기 없음)를 기기 성능 감지로 자동 적용 옵션 |
| K14 | 감사 σ가 예상(5)보다 크다 | auditSpins 상향(샤드 4로 50M도 2분 내), 그래도 크면 큰 상 축소·지름길 코인 상향으로 꼬리만 깎음 |

---

## 14. 팀 레인 · 일정 (코어·연출·아트·사운드 각 1명 + 팀장)

| 레인 | 소유 |
|---|---|
| L 팀장(기획) | 이 문서, `docs/*`, 계약 동결, 통합·QA·이미지 눈 검수 |
| C 코어 | `slot-engine/src/board*.ts`·공용 엔진 수정, `shared/src/board.ts`·schemas, `apps/api/**` 해당 부분(engineSpin·debugSpin·games 409만, repos 무변경), `tools/rtp-sim/**`, `games/hanbok-night-market/{math,manifest}.json`, `docs/RTP_AUDIT_hanbok-night-market.md` |
| D 연출 | `apps/hub/src/{game/board*,components/game/board/**,hooks/useBoardBonus.ts}`, GameScreen·store 연결, `renderer/src/anticipation.ts`, i18n, 도움말, 디버그 프리셋 UI |
| A 아트 | `games/hanbok-night-market/{art,theme}/**`·`thumb.webp`, 전환 클립 (공용 아트 도구 무변경) |
| S 사운드 | `apps/hub/src/lib/{audio,bgm,bgmVoices}.ts` 추가분, earshot 기록 |

| 날 | 내용 |
|---|---|
| D0(반나절) | L+C: 계약 동결 — 엔진 타입·스키마 모양·shared 피처·프리셋 enum·`SoundPreset 'hanbok'`, `math.json v0`(이 문서 §3-5)·`manifest.json`(`status: hidden`). typecheck 통과 |
| D1 | C: `board.ts`·`boardExact.ts`·스키마·테스트·골든 / D: 말판 화면 정적(픽스처 피처로), `yutLayout`, 윷 애니 / A: stylePrefix 락 → 심볼 / S: 레시피 초안 |
| D2 | C: spin 연결·API(engineSpin·debug)·rtp-sim 말판 절 / D: `boardFlow` 상태 기계·탭·자동·⏩·잔액 지연·`BoardCurtain` / A: frame·bg·말판 배경 |
| D3 | C: 튜닝(§5-2) → 파일럿 / D: 진입·종료·복원·도움말·디버그 / A: thumb·시트·전환 클립 / S: earshot·배경음 |
| D4 | C: 정식 감사(샤드 4) / L: 통합 e2e(390·430·체험판) + §12 확인표 |
| D5 | 여유분 → `status: live` → QA_LOG·SOUND_CHECK·TRANSITION_DESIGN 기록 → 리드 커밋 |

임계 경로: **계약 → board.ts → spin 연결 → 튜닝 → 정식 감사**. 화면은 D1부터 픽스처로 병렬.

---

## 검수 반영 (2026-11-26, 기획서 비평)

근거: 비평용 재측정 스크립트 `D:/park/tgslot-wt/_qa/new-b-critic/board-crit.mjs`(저장소 밖, v0 값 MC 100만 판)와 코드 대조(`anticipation.ts`, `store/game.ts reveal()`, `db/schema.ts rounds`, `roundFlow.ts`, `renderer setMode`).
판정: **근본 재설계 불필요**. 재미 장치(갈림길 지름길)는 결과를 실제로 가르고(밟은 판 결승 37.5% · 평균 43.4배 vs 안 밟은 판 21.0% · 28.8배), 미리보기 5칸 중 함정이 섞인 던지기가 93%라 매 던지기 긴장이 있다. 아래만 고쳤다.

| # | 무엇을 | 왜 |
|---|---|---|
| R1 | 종료 사유에서 «던진 수 12»를 빼고 하드캡을 불변식 `던진 수 + 기회 ≤ maxThrows`로 명시(§3-3·§3-4·§4-2 `BoardEnd`·§6-4 테스트) | 기회 증가 조건(`합 < 12`) 때문에 기회 0이 반드시 먼저 온다 → `'maxThrows'`는 도달 불가 분기(MC 0건). 안 나오는 사유·프리셋·문구를 만들 이유가 없고, 종료 증명은 불변식 한 줄이 더 강하다 |
| R2 | `maxMultiplier` 5 → 4(§3-1·§3-4·§3-5) | v0 판은 세 배수 칸(o9·o15·방)을 한 길에서 다 밟을 수 없어 구조상 최대 ×4(도달 1.2%). 닿지 않는 상한을 도움말·HUD에 쓰면 거짓 약속이 된다. 기대값·최대 지급 수치는 그대로 |
| R3 | 착지 때 감추는 범위를 잔액에서 **WinStrip·롤업·빅윈 판정**까지 넓히고, `boardBonus`와 `gamble` 공존 금지(§0 O11·§3-4·§6-1) | `reveal()`은 잔액·`lastResult`·더블업 세션을 한꺼번에 공개한다. `gambleOffer.pendingWin`에 말판 몫이 들어 있어 착지 순간 결과가 샌다 |
| R4 | 렌더러 `anticipatedReels`가 스캐터 없는 릴을 건너뛰게(§0 O16·§6-2·§12) | 지금 로직은 초롱 2개 뒤 **남은 모든 릴**을 감속 → 초롱이 없는 릴 4까지 헛감속(가짜 기대감). live 팩은 모든 릴에 스캐터가 있어(실측) 영향 0 |
| R5 | 서버 `lastBoard`·`getLatestRound`·`GameStateResponse` 변경을 2차로 미루고 **응답 수신 즉시 localStorage 스냅숏**(피처 전체 + `replayBoard` 자체 검증)으로 복원(§0 O15·§4-4~4-6·§13 K4) | `rounds`에 `(user_id, game_id, created_at)` 인덱스가 없어 게임 입장마다 그 사용자의 라운드 전부를 정렬한다. 인덱스를 더하면 마이그레이션 번호가 다른 팀과 부딪친다. 스냅숏으로 «재생 중·릴 회전 중 새로고침»은 전부 복원되고, 못 하는 건 «응답 자체 유실»뿐(코인 안전) |
| R6 | 새 asset kind `prop` 제거 — 말은 `lantern_girl` 심볼 그림 + 코드 드로잉 받침, 결승 탑은 코드 드로잉 + `bonus` 그림(§0 O13·§6-2·§6-3·§8·카탈로그) | 다른 두 신작 기획서에 `prop` 수요가 없다(확인). game-sdk 스키마·theme-gen·pack:check를 이 팀만을 위해 고치는 병합 비용·범위가 크다. 생성 20장 → 18장 |
| R7 | 전환 클립을 허브 DOM(`BoardCurtain.tsx`)에서 재생, 렌더러 `setMode` 미사용(§6-1·§7-2) | 원안은 «덮인 순간 장착»만 적고 무엇이 클립을 트는지 비어 있었다. `RendererMode`는 프리스핀 명판·금테까지 바꾸고 `roundFlow`의 커튼 대상도 `freeSpins/base`뿐이라 말판에 그대로 못 쓴다 |
| R8 | 말판 재생이 끝나기 전 다음 판 예약·빅윈 금지를 훅 계약에 명시(§6-1 `useBoardBonus`) | 오토스핀 중 말판이 열리면 재생과 다음 스핀이 겹칠 수 있다 |
| R9 | 「지금 끝나면 N배」 줄을 HUD 위쪽에서 **컨트롤 바로 위**로 이동, 세로 합계 계산 추가(§7-3) | 사용자 취향 «당첨 금액은 컨트롤 위» |
| R10 | 지름길 표시를 «대각선 길이 금빛으로 켜짐» → «칸 등불이 하나씩 차례로 점등», 연결선은 옅은 정적 점선(§1-1 ⑥·§7-3·§7-4·§8-3·§12) | 판을 가로지르는 대각 빛줄기는 금지된 사선 광택·당첨 선 그리기로 읽힌다 |
| R11 | 노드 크기 축소(일반 44 → 40/36px 등)와 `yutLayout` 최소 간격 테스트, 꼬리표를 판 중앙 쪽 칩으로·같은 칸이면 합침(§6-1·§7-3) | 390px 판(358px)에서 원안 크기로는 모퉁이 옆 대각선 칸(a1)과 바깥 칸(o4·o6)의 중심 거리 약 50px에 44px 노드 → 틈 6px, 꼬리표·말이 겹친다. 같은 칸을 가리키는 결과가 14.5% |
| R12 | 기회 1번 남았을 때 «마지막 한 번!» 연출(§1-1 ⑧-2·§12) | 말판의 56%가 기회 소진으로 끝나고, 26.6%는 갈림길도 결승도 없다. 그 끝을 조용한 퇴장 대신 한 수의 긴장으로 |
| R13 | 수치 표 보정·보강(§3-6): MC 38.47은 최소 지급 없는 값임을 명시, 갈림길 효과·미리보기 함정 비율·끝 배수 분포·최소 지급 적용률·던지기 분포(p95 7번) 추가 | 원안의 «DP 38.54 vs MC 38.47»은 서로 다른 규칙의 값이었다. 재미 장치가 실제로 결과를 바꾸는지의 근거를 문서에 남긴다 |
| R14 | `boardTraps` 프리셋 탐색 실패 확률(약 3.5%) 명시, rtp-sim은 `cascadeStats` 이름을 바꾸지 않고 새 `boardStats.ts`(§4-4·§6-2) | QA가 `DEBUG_NO_MATCH`를 버그로 오인하지 않게 / candy 감사 도구를 건드리지 않게 |

검토했지만 그대로 둔 것:
- **주사위 → 윷가락**: 브리프의 «주사위» 역할(서버가 정한 이동 수를 한 번씩 굴려 보여 주기)을 그대로 하고, 테마와 한 몸이라 유지. 결과 판독은 32px 글자가 정본(K11).
- **독창성**: 윷판 지름길은 민속놀이 규칙이라 상용 게임 복제가 아니다. kraken-cove(코인 리스핀·촉수 감기), idol-stage-live(픽미·응원봉 불빛)와 메커닉·화면·용어가 겹치지 않는다(두 기획서 대조).
- **감사**: 25줄 기본 σ 가정(약 3)은 파일럿 5M에서 확정. candy는 4샤드로 1천만 스핀 29초였으니 30M~50M도 2분 안팎.
- **범위**: 위 R5·R6으로 공용 아트 도구·API 저장소 계층이 빠져 한 팀 5일 범위에 든다. 효과음 함수 수(말판 전용 9개)는 S 레인 단독이라 유지.

---

## 구현 계약 (코어 레인 C, 2026-11-26 동결)

화면(D)·아트(A)·사운드(S) 담당이 기대어도 되는 값이다. 바꿀 때는 코어와 먼저 맞춘다.

### C-1. 수치 결과 (정식 감사 `docs/RTP_AUDIT_hanbok-night-market.md`, 3천만 스핀·4샤드·시드 42)

| 지표 | 값 |
|---|---|
| RTP | 감사 MC **94.530%** (±0.166%p, 13/13 게이트 통과) / 정확값 94.510% = 라인 71.427 + 스캐터 1.139 + 말판 21.944 |
| 잭팟 포함 | 96.03% |
| 적중률 / σ / auditSpins | 29.5% / 4.64 / 30,000,000 (n* 25.1M) |
| 말판 진입 | 1/175.6 스핀 |
| 말판 평균·최대 | 38.54배(σ 37.1) · 최대 200배(`maxWin`), 최소 5배 |
| 종료 사유 | 결승 32.0% · 함정 11.9% · 기회 소진 56.2% |
| 갈림길·던지기 | 갈림길에 멈춤 66.4% · 평균 던지기 5.68(관측 최장 9, 상한 12) |
| 페이테이블 | v0의 약 2배(정수): 와일드 100/400/1000 … 달고나 2:1·9/20/60 — `games/hanbok-night-market/README.md` |

말판 값(§3-5 v0 칸·윷 가중치·기회 5·등불 3·×4·최소 5·큰 상 30)은 **그대로** 쓰고 RTP는 페이테이블·스트립으로만 맞췄다. `maxMultiplier` 4, `maxWin` 200.

### C-2. 응답 계약 (`SpinResponse` 무변경, 피처만 추가)

- 트리거 스핀(유료, 초롱 3개)의 `features` 순서: `scatterWin`(총 베팅 ×2) → **`boardBonus`** → (캡에 걸렸을 때만) `winCapped`. 이 팩에 `freeSpins`·`gambleOffer`는 없다(스키마가 공존 금지).
- `totalWin` = 라인 + 스캐터 + `boardBonus.win`. `wallet`은 이미 반영된 값. 말판 몫은 **`boardBonus.win`**에서 읽는다(응답에 `boardWin` 필드는 없다. 엔진 `SpinResult.boardWin`만 있다).
- `boardBonus` = `{ type, throws: BoardThrow[] (1..20), end: 'goal'|'traps'|'throws', pot, multiplier, payout, win }` — `payout`은 총 베팅 배수 `max(minPayout, pot × multiplier)`, `win`은 코인(캡 적용 후).
- `BoardThrow` = `{ steps 1~5(도~모), extraThrow, path[], forward?[], at, route, tile, value?, pot, multiplier, traps, throwsLeft }`. 값은 전부 **그 던지기를 처리한 뒤** 상태다.
  - `path`: 지나간 칸(출발 제외, 도착 포함). 앞으로 칸(o13)에 서면 `path` 끝이 `o13`이고 `forward`가 더 간 칸(예 `['o14','o15']`), `at`은 최종 칸.
  - `route`: **다음** 던지기에서 탈 길. 갈림길(`math.boardBonus.forks`의 키 o5·o10·c)에 멈추면 그 지름길 id(a·b·center)로 바뀐다. «지름길 열림» 연출 = `forks[at] !== undefined`인 던지기.
  - `extraThrow`: 윷·모의 한 번 더가 실제로 인정됐는지(상한에 걸리면 false). 한 번 더 칸(`tile: 'again'`)의 +1은 `throwsLeft`로 보인다.
  - `tile`: 최종 칸 종류(`coin|mult|forward|again|trap|goal|start`), `value`: 그 칸 값(코인·배수·결승). 함정마다 `traps` +1.
  - 시작 상태: 칸 `start`, 길 `outer`, 기회 `throws`(5), 등불 0, ×1, 바구니 0 (`initialBoardState(config)`).
- 저장·재전송: `rounds.features` jsonb에 그대로. 같은 `idempotencyKey` 재전송은 바이트 동일·원장 1건(테스트 `apps/api/src/routes/boardBonus.test.ts`). `toSharedFeature`가 키 순서를 고정한다.
- 시드 공개: `GET /rounds/:id/seed` 그대로(`stateBefore: null`). `spin(math, {totalBet}, createSeededRng(seedInput))`가 말판까지 재현한다. RNG 순서 = 릴 5회 → 윷 k회(던질 때마다 `nextInt(1000)` 1회) → 잭팟 1회.

### C-3. 엔진 API (허브가 import해서 쓰는 순수 함수, `@tgslot/slot-engine`)

| 함수 | 용도 |
|---|---|
| `previewBoardLanding(config, at, route, steps)` → `{ at, fork }` | 던지기 직전 도·개·걸·윷·모 꼬리표(앞으로 칸까지 따라간 최종 칸, 갈림길 여부). 표시 전용 |
| `advanceBoard(config, at, route, steps)` → `{ path, at }` | 말 이동 경로 애니메이션 |
| `replayBoard(config, steps[], totalBet, capCoins)` | 복원 스냅숏 검증. `capCoins = round.maxWinCap × totalBet − (라인+스캐터 지급)`(이 팩은 사실상 `Infinity`와 같다) |
| `initialBoardState`·`stepBoard`·`boardPayout`·`boardStartNode`·`boardStartRoute` | 상태 기계·요약 «지금 끝나면 N배»(`boardPayout(config, pot, multiplier)`) |
| `boardExpectation(config)`·`computeBoardRtp(math, bet)` | DP 정확값(튜닝·감사·도움말 수치) |

`config`는 `math.boardBonus`(허브는 `/games/:id/math`로 받는다). 노드 id: 바깥 `start, o1…o19, goal`, 대각선 `a1, a2, c(방), c1, c2, b1, b2, f1, f2`, `layout: "yut29"`. 도움말 수치(기회·등불·최소·최대·큰 상)는 `throws`·`trapLimit`·`minPayout`·`maxWin`·`nodes.goal.value`에서 읽는다.

### C-4. 디버그 프리셋 (API, `?debug=1` 패널)

`SpinDebugPresetSchema` += `boardBonus`(말판 진입) · `boardGoal`(결승) · `boardTraps`(함정 끝) · `boardFork`(갈림길에 한 번 이상 멈춤) · `boardBig`(말판 지급 ≥ 100배 — «큰 결과 강제»). 말판 없는 팩은 409 `DEBUG_NO_MATCH`. 기대 탐색 수 176 / 549 / 1,481 / 265 / 1,404회(기본 5,000회에서 `boardTraps` 3.4%·`boardBig` 2.8%는 `DEBUG_NO_MATCH`가 날 수 있다 — 다시 누르면 된다). 허브 `presetsFor`가 말판 팩에 5종을 붙이고 `freeSpins`를 뺀다. 라벨 키 `boardDebug*`(ko/en 사전 끝). 체험판은 기존 정책대로 프리셋이 없다.

### C-5. 상태 복원

API·`game_states` 무변경(§4-6 그대로). 말판은 스핀 간 상태가 없다 — 허브가 응답을 받는 즉시 localStorage `tgslot.board.<gameId>`에 피처를 저장하고 `replayBoard`로 검증해 이어 재생한다. 서버 «최신 라운드» 조회(`lastBoard`)는 2차.

### C-6. 화면 쪽이 아직 할 일 (코어 범위 밖, 계약상 필요)

- `store/game.ts reveal()`: 말판 판은 착지 때 잔액 `wallet − boardBonus.win`, WinStrip·롤업·빅윈 판정은 `totalWin − boardBonus.win`(§0 O11). 지금은 착지 때 전액이 보인다(결과 누설).
- `renderer/src/anticipation.ts`: `featureTriggerCount`에 `?? math.boardBonus?.trigger`, 스캐터 없는 릴 건너뛰기(§0 O16). 엔진 쪽 `featureTriggerCount`는 이미 말판 트리거(3)를 돌려준다.
- 썸네일·테마가 없으면 API 서빙 검증에서 hidden 팩이 빠진다(`thumb.webp`가 생기면 자동으로 로드).
