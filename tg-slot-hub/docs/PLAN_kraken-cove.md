# kraken-cove (#9) 구현 계획 — 크라켄 보물 동굴 (코인 리스핀 + 촉수 감기)

작성일 2026-11-26 · 대상: `tg-slot-hub` 웨이브 3 첫 게임 · 작성: kraken-cove 팀 기획(팀장)
정본 근거: `docs/GAME_CATALOG.md` §2 #9·§3·§4(종료 규칙), `docs/WAVE2_DESIGN.md` §3-4·§9-2(홀드&스핀 행), `docs/FEATURE_RESEARCH.md` §2.1·§2.16, 구성 모범 `docs/PLAN_candy-cluster-pop.md`
병렬 신작: `hanbok-night-market`(휠 + 심볼 승급, 야시장), `idol-stage-live`(픽미 + 응원 미터, 무대). 이 게임은 **휠·카드 고르기·미터·승급을 쓰지 않는다.**

**한 줄.** 금액이 적힌 코인이 6개 이상 뜨면 코인이 그 자리에 붙고 리스핀 3번이 시작된다. 새 코인이 붙을 때마다 다시 3번. 세로 한 줄(3칸)을 코인으로 다 채우면 크라켄 촉수가 그 줄을 감아 **숫자 코인을 2배**로 만든다. 판 15칸을 다 채우면 최고 보물.

**이름.** 게임 표시 이름은 「크라켄 보물 동굴」(en `Kraken Treasure Cave`), id는 `kraken-cove` 그대로다(id는 화면에 안 나온다). 영어 이름을 `Kraken Cove`로 하지 않는 이유: 같은 5×3·크라켄 와일드 구성의 상용 슬롯 «Kraken's Cove»(Relax Gaming, 2025)가 있다. «Octopus Treasure»(Play'n GO)·«Release the Kraken»(Pragmatic Play)도 피한다. 「크라켄 만」의 «만(灣)»은 뜻이 바로 안 들어와서 바꿨다. 피처 이름은 「코인 리스핀」, 재미 장치 이름은 「촉수 감기」, 보물 4단은 「작은 보물 · 중간 보물 · 큰 보물 · 최고 보물」. 조어는 없다. 허브의 「잭팟」과 헷갈리지 않게 이 게임 안의 고정 상금은 전부 «보물»이라고 부른다.

---

## A. 재미 장치 결정

### A-1. 후보 3개

셋 다 코인 리스핀(GAME_CATALOG P5) 위에 얹는 장치다. 상용 슬롯의 이름·캐릭터·연출은 쓰지 않는다. 장르 공통 문법(코인 고정·리셋 카운터·판 채우기 상금)만 쓴다.

**후보 1 — 촉수 감기 (세로줄 완성 ×2)**

- **플레이 경험.** 릴 하나(세로 3칸)가 코인으로 다 차면 판 아래에서 크라켄 촉수가 올라와 그 줄을 감는다. 그 줄의 숫자 코인 금액이 그 자리에서 2배로 바뀐다. 줄마다 한 번만.
- **손에 땀을 쥐는 순간.** 리스핀마다 «아무 코인이나 와라»에 더해 «하필 그 칸»이 생긴다. 두 칸이 찬 줄 아래에서는 촉수 끝이 꿈틀대며 기다린다. 줄이 완성되면 숫자가 눈앞에서 두 배로 올라간다.
- **비용.** 엔진은 작다. 리스핀이 끝날 때마다 다섯 줄을 검사하는 순수 함수 하나다. RNG를 쓰지 않는다. 렌더러는 중간이다. 촉수 메시 애니메이션 하나가 필요하다.
- **RTP·종료.** 칸 수를 늘리거나 코인을 지우지 않으므로 종료 척도(§3-4)를 건드리지 않는다. 숫자 코인 금액에 선형이라 튜닝이 쉽다.
- **430px 판독.** 세로줄은 릴과 같아서 «이 줄이 거의 찼다»가 판 자체로 보인다. 글자가 필요 없다.

**후보 2 — 촉수 모으기 (한 칸에 합치기)**

- **플레이 경험.** 리스핀 중 «촉수 코인»이 붙으면 같은 가로줄 코인을 전부 끌어와 한 칸에 합친다. 비워진 칸은 다시 코인을 받을 수 있다.
- **장점.** 합쳐진 큰 숫자가 보는 맛이 있고, 빈칸이 다시 생겨 라운드가 길어진다.
- **약점.** 빈칸이 늘어나는 전이라 종료 척도가 단조 감소하지 않는다. 라운드당 횟수 상한과 별도 카운터가 필요하다(GAME_CATALOG §4 규칙 3). 판 채우기(최고 보물) 판정이 «합친 칸»과 얽혀 규칙 설명이 길어진다. 시장에 비슷한 «수집» 연출이 많아 새로움이 낮다.

**후보 3 — 바다 깊이 (판이 아래로 열림)**

- **플레이 경험.** 줄을 채울 때마다 판 아래에 4행·5행이 열려 칸이 늘어난다. 세로 화면의 남는 높이를 쓴다.
- **약점.** 렌더러가 라운드 중 행 수 변경을 지원하지 않는다(WAVE2 §4-4의 가변 행은 아직 없다). 프레임 그림도 행 수마다 달라야 한다. 칸이 늘면 `q × 빈칸 < 1` 검사가 진입 시점이 아니라 매 확장마다 바뀐다. 한 팀 범위를 넘는다.

### A-2. 점수 (5점 만점)

| 후보 | 재미·새로움 | 430px 판독성 | 구현 비용(높을수록 쌈) | 감사·종료 안전 | 합계 |
|---|---:|---:|---:|---:|---:|
| 1 촉수 감기 | 4 | **5** | **4** | **5** | **18** |
| 2 촉수 모으기 | 4 | 3 | 3 | 2 | 12 |
| 3 바다 깊이 | 5 | 4 | 1 | 2 | 12 |

### A-3. 선택: 촉수 감기

1. **리스핀 한 번에 기대가 세 겹이 된다.** 코인이 오나(카운터 리셋) → 어느 칸에 오나(줄 완성) → 얼마짜리인가(보물 단계). 기본 홀드앤스핀이 «오나 안 오나» 한 겹인 것과 다르다.
2. **판이 곧 진행판이다.** 미터·카드·휠 같은 추가 UI 없이 판 자체가 목표를 보여 준다. 다른 두 신작(휠, 카드+미터)과 겹치지 않는다.
3. **종료·감사가 안전하다.** 칸 수도, 리셋 규칙도 그대로라 기존 종료 증명이 그대로 선다. RNG 소비도 늘지 않는다.
4. **개략 시뮬레이션에서 체감 빈도가 맞다.** 라운드의 약 25%는 진입하자마자 촉수가 감고, 약 56%는 리스핀 도중에 한 줄 이상 감는다(§5-1). «거의 매 라운드 한 번은 보는데 매번 몇 줄일지는 모르는» 빈도다.

---

## 0. 카탈로그를 지금 코드·요구와 대조한 결과

| # | 카탈로그·WAVE2 원문 | 지금 코드·이번 요구 | 이 계획의 결정 |
|---|---|---|---|
| K1 | 스타일라이즈드 3D 해양, 딥 티얼·러스트·폭풍 회색 | 이번 요구는 «밝고 선명한 모바일 캐주얼» | 밝은 라군 톤 팔레트로 바꾼다(§8) |
| K2 | 심볼 `mermaid` `rum` `parrot` `cannon` `map` | 사람 얼굴·술·해적 클리셰. 64px 실루엣도 겹친다 | 바다 생물 + 보물 소품 8종으로 바꾼다(§2-2). 사람은 없다 |
| K3 | 잭팟 `mini/minor/major/grand` | 허브 잭팟(모델 밖 1.5%)과 이름이 겹친다 | 「작은/중간/큰/최고 보물」, 총 베팅 고정 배수, **모델 안**(94.5%) |
| K4 | `RoundState.respin`으로 스핀 사이에 이어 감 | candy의 연쇄는 응답 하나에서 다 푼다. 리스핀은 추가 베팅이 없다 | **트리거 스핀 응답 하나에서 리스핀 전부를 결정한다**(§4-1). `RoundState`·`game_states`는 쓰지 않는다 |
| K5 | 리스핀 중 비잠금 칸만 다시 돈다(빈 칸 표시) | 사용자 규칙: 릴에 빈칸(blank) 심볼 금지 | 빈 칸은 **리스핀 전용 칸 릴**이 돌며 일반 심볼(어둡게)이나 코인을 보여 준다. 빈 그림은 없다 |
| K6 | `hardCap = 40` | 구조적 최대 리스핀은 `3 × (15 − 6 + 1) = 30` | 하드캡 40은 유지(안전망), 도달 0건을 감사 게이트로 |
| K7 | `q × emptyCells < 1`을 진입 시점마다 검사 | 빈칸은 진입 때가 최대(9칸)고 이후 줄기만 한다 | `parseGameMath`에서 `max_r q_r × (15 − trigger) < 1`을 정적 검사(§3-4) |
| K8 | 진입 `p ≈ 0.0045`(1/220) | 이번 목표 1/120~1/250 | 목표 1/185(±15%) |
| K9 | `maxWinCap` 전 게임 5,000× | 이 게임의 자연 최대는 약 1,560× | `round.maxWinCap: 2000`(기존 필드 재사용, 팩별 opt-in) |
| K10 | 코인 값 라벨 5종을 그림으로 | AI 그림의 숫자는 깨진다. UX 4차가 «릴 위 텍스트 전면 제거» | 코인 금액은 **심볼 얼굴**로 코드가 그린다(§7·§8). 줄 라벨 같은 덧씌운 글자는 여전히 없다 |
| K11 | — | `renderer/anticipation.ts`가 스캐터만 본다 | 기존 `featureTriggerCount`(엔진·렌더러 두 곳)는 **건드리지 않는다**(hanbok 팀이 같은 함수에 한 줄을 더한다). 코인 기대감은 새 파일 `renderer/src/coinAnticipation.ts`, 호출부에서 `math.coinRespin ?` 한 줄 분기 |
| K12 | — | `SoundPreset`이 두 곳(`renderer/types.ts:12`, `game-sdk/theme.ts:37`) | 두 곳에 `'deepsea'` 추가 |
| K13 | — | `engineSpin.ts toSharedFeature`는 피처 타입별 명시 분기 | `coinBoard`, `coinRespin` 분기 추가 |
| K14 | — | `prompts.ts ASSET_KINDS`에 심볼·프레임·배경·썸네일·시트만 있다 | 보물 코인·촉수 그림용으로 hanbok 기획서와 **같은 이름·같은 뜻**의 `'prop'` 종류 + theme `props` 맵을 쓴다(출력 `theme/props/<id>.webp`, 처리는 `symbol`과 같음). 이름을 맞춰 두면 병합이 «같은 줄 두 번»이 되어 충돌이 사라진다 |
| K15 | — | `rounds`에 새 jsonb 열을 더하면 다른 팀 마이그레이션과 번호가 부딪친다 | 리스핀 결과는 **피처(`features` jsonb)에 싣는다.** DB 마이그레이션 0건 |
| K16 | 공수 18/14/8/12h | 촉수·칸 릴·코인 얼굴·전환·사운드 포함 | §13-1 일정 참조(약 4.5~5일) |

카탈로그 §2 #9는 이 계획이 들어가는 커밋에서 위 결정대로 고친다(리드).

---

## 1. 컨셉과 «왜 재밌나»

### 1-1. 한 줄 컨셉

햇살이 드는 바닷속 보물 동굴. 장난꾸러기 보라색 크라켄이 금화를 지키고 있다. 금화 6개가 동시에 뜨면 리스핀이 열리고, 크라켄이 채워진 세로줄을 촉수로 감아 금액을 두 배로 불려 준다.

### 1-2. 순간별 기대 (플레이어가 손에 땀을 쥐는 지점)

| 순간 | 플레이어가 기대하는 것 | 화면이 주는 신호 |
|---|---|---|
| 기본 스핀 착지 | 코인이 몇 개 떴나, 얼마짜리인가 | 코인마다 금액이 박혀 있다. 4개가 되면 남은 릴이 느려진다(기대감) |
| 진입 직후 | 처음부터 한 줄이 다 찼나 | 진입 판에 완성된 세로줄이 있으면 바로 촉수가 감는다(라운드의 약 25%) |
| 리스핀 한 번 | ① 코인이 하나라도 붙나 ② 그게 «한 칸 남은 줄» 칸인가 ③ 보물 코인인가 | 두 칸 찬 줄 아래 촉수 끝이 꿈틀댄다. 붙으면 툭 → 잠깐 멈춤 → 고정 빛. 카운터가 ●●●로 차오른다 |
| 마지막 리스핀(1회 남음) | 이번에 못 붙이면 끝 | 칸 릴이 느리게 돌고 심장 박동 같은 저음, 카운터 옆 «마지막!» |
| 줄 완성 | 숫자가 얼마나 커지나 | 촉수가 올라와 감고, 그 줄 숫자가 ×2로 올라가며 세어진다 |
| 판 채우기 직전(빈칸 3칸 이하) | 최고 보물 | 보물 띠의 «최고 보물»이 맥박처럼 빛나고 «판 채우기까지 N칸»이 뜬다 |
| 종료 정산 | 합계가 얼마인가 | 코인이 하나씩 WinStrip 합계로 날아가며 금액이 쌓인다. 보물 코인은 띠의 해당 단계가 켜진다 |

### 1-3. 다른 게임과 다르게 느껴지는 점

- live 7종은 «줄·웨이즈 맞추기», «연쇄·클러스터»다. 이 게임은 **판을 채우는 게임**이다. 기본 게임에서도 코인 개수가 늘 의미가 있다.
- 피처 중에 플레이어가 고르는 것은 없다. 대신 «하필 그 칸» 긴장이 매 리스핀 생긴다. 다른 두 신작(직접 고르는 픽미, 돌리는 휠)과 체감이 겹치지 않는다.

---

## 2. 그리드·페이 방식·심볼·배당

### 2-1. 게임 요약

| 항목 | 값 |
|---|---|
| 그리드 | 5릴 × 3행(15칸) |
| 기본 지급 | 20 페이라인, 왼쪽부터 3·4·5연속. 배당 단위는 라인당 베팅액(`총 베팅 ÷ 20`) |
| 당첨 표시 | 선을 그리지 않는다(`paylineStyle: 'effect'`). 당첨 칸 강조 이펙트로 경로를 보여 준다 |
| 와일드 | 크라켄(릴 2·3·4에만). 코인은 대체하지 않는다(`wild.excludes: ["coin"]`). 릴 1에 없으므로 **와일드 자체 배당은 없다**(왼쪽부터 세는 라인이 와일드로 시작할 수 없다) |
| 스캐터 | 없다. 피처는 코인이 연다 |
| 코인 | 라인 배당이 없는 특수 심볼. 뜰 때마다 서버가 금액(또는 보물 단계)을 정한다 |
| 코인 리스핀 | 코인 6개 이상으로 시작, 리스핀 3회, 새 코인이 붙으면 3회로 리셋, 15칸이 차거나 0회가 되면 끝 |
| 촉수 감기 | 세로줄 3칸이 다 코인이면 그 줄 숫자 코인 ×2(줄마다 1회) |
| 보물 4단 | 작은 ×20 · 중간 ×50 · 큰 ×200(코인으로 등장, 라운드당 각 1회) · 최고 ×1000(15칸 채움 때만) — 총 베팅 배수, 모델 안 |
| 상한 | 스핀(=라운드) 지급 2,000×(`round.maxWinCap`). 자연 최대 약 1,560× |
| 목표 RTP | 94.5% = 라인 66.0 + 코인 리스핀 28.5. 허브 잭팟 1.5%는 모델 밖(체감 96.0%) |
| 변동성 | high. 적중률 목표 27%, 피처 1/185, 피처 평균 약 49× |
| 베팅 레벨 | 20 / 40 / 100 / 200 / 500 / 1000(라인당 1~50 정수) |
| 셀 크기 | 430px 약 79px, 390px 약 71px(ART_DIRECTION v4 기준 창 x 2–98%) |

### 2-2. 심볼표 (빈칸 없음, 10종)

| id | 이름(ko / en) | 역할 | 실루엣(64px 구분 기준) |
|---|---|---|---|
| `wild` | 크라켄 / Kraken | 와일드, 릴 2·3·4(자체 배당 없음) | 둥근 보라 머리 + 양옆으로 말린 촉수 두 가닥. 유일하게 얼굴이 있는 심볼 |
| `coin` | 금화 / Gold Coin | 리스핀 트리거·지급. 라인 배당 없음 | 정면 원반. 가장자리 테두리 + 가운데 조개 무늬(숫자 자리는 비워 둔다) |
| `crown` | 산호 왕관 / Coral Crown | 상위 1 | 뾰족 왕관 + 산호 가지 |
| `compass` | 황동 나침반 / Brass Compass | 상위 2 | 원 + 바늘(코인과 겹치지 않게 **사각 뚜껑이 열린 모양**) |
| `seahorse` | 해마 / Seahorse | 상위 3 | 세로 S자 |
| `pufferfish` | 복어 / Pufferfish | 상위 4 | 가시 공 |
| `crab` | 꽃게 / Crab | 하위 1 | 가로로 넓은 집게 |
| `jellyfish` | 해파리 / Jellyfish | 하위 2 | 종 모양 + 아래 늘어진 줄 |
| `starfish` | 불가사리 / Starfish | 하위 3 | 오각 별 |
| `shell` | 가리비 / Scallop | 하위 4 | 부채꼴 |

같은 형태 쌍이 없게 골랐다(원반은 코인 하나뿐, 별은 불가사리 하나뿐). 다른 두 신작 심볼(야시장 음식·노리개 / 아이돌·응원봉)과도 겹치지 않는다.

### 2-3. 배당표 초안 (라인당 베팅액 배수, 튜닝 전)

| 심볼 | 3 | 4 | 5 |
|---|---:|---:|---:|
| `crown` | 20 | 80 | 300 |
| `compass` | 15 | 60 | 200 |
| `seahorse` | 10 | 40 | 150 |
| `pufferfish` | 8 | 30 | 100 |
| `crab` | 5 | 15 | 60 |
| `jellyfish` | 5 | 15 | 50 |
| `starfish` | 4 | 10 | 40 |
| `shell` | 4 | 10 | 40 |

- 와일드 줄은 두지 않는다. 와일드가 릴 2·3·4에만 있어 왼쪽부터 세는 라인이 와일드로 시작할 수 없다 — 배당을 적어 봐야 도달 0인 죽은 줄이고, 도움말 배당표에서 플레이어를 속이게 된다.
- 라인 RTP 66.0은 이 표의 **선형 배율**로 맞춘다(HOWTO §3-e). 100 미만 값은 정수 반올림.
- 적중률(27%)은 HOWTO §3-d의 «채움 심볼 교차 배치 + 앞뒤 릴 역할 분리»로 누른다.
- 코인은 라인을 끊는 칸이다(와일드가 대체하지 않는다). 코인이 많이 뜬 판은 라인 당첨이 줄어드는데, 그 판은 대개 리스핀이 열리므로 체감 손해가 없다.

### 2-4. 코인 금액표 (총 베팅 배수, 기본·리스핀 공용)

| 종류 | 값 | 가중치(초안) | 메모 |
|---|---:|---:|---|
| 숫자 | ×1 | 4000 | |
| 숫자 | ×2 | 2500 | |
| 숫자 | ×3 | 1400 | |
| 숫자 | ×5 | 900 | |
| 숫자 | ×10 | 400 | |
| 작은 보물 | ×20 | 300 | 판에 이미 있으면 후보에서 뺀다 |
| 중간 보물 | ×50 | 90 | 〃 |
| 큰 보물 | ×200 | 18 | 〃 |
| 최고 보물 | ×1000 | — | 코인으로 나오지 않는다. 15칸을 채우면 따로 지급 |

- 베팅 레벨이 전부 20의 배수라 모든 금액이 정수 코인이다(스키마가 `값 × 베팅 레벨` 정수를 검사).
- 촉수 감기 ×2는 **숫자 코인에만** 적용한다. 보물 코인은 띠에 적힌 금액 그대로다(«고정 배수» 약속을 지킨다).
- «보물 단계 각 1회»는 다시 뽑기가 아니라 **이미 판에 있는 보물을 후보에서 빼고 한 번 뽑는다**(RNG 1회, 결정론).

---

## 3. 피처 규칙 전문

### 3-1. 트리거

- 기본 스핀이 멈춘 판(뮤테이션 없음)에서 `coin`이 **6개 이상**이면 그 스핀이 곧 리스핀 라운드가 된다.
- 트리거 스핀의 라인 당첨도 그대로 지급한다(코인 칸은 라인을 끊는다).
- 진입 판의 코인 금액은 기본 스핀에서 이미 정해진 값 그대로다(화면에 보이던 숫자가 바뀌지 않는다).

### 3-2. 진행

1. 진입: 코인 칸 고정, `left = 3`. 진입 판에서 이미 다 찬 세로줄이 있으면 **먼저 촉수 감기**를 처리한다.
2. 리스핀 한 번:
   - 고정되지 않은 칸마다 그 릴의 **리스핀 칸 스트립**에서 한 칸을 뽑는다(칸마다 독립).
   - 뽑힌 칸이 `coin`이면 금액을 뽑아 고정한다. 아니면 그 심볼을 어둡게 보여 주고 다음 리스핀에 다시 돈다(지급 없음).
   - 이번 리스핀에 새 코인이 1개 이상이면 `left = 3`, 아니면 `left -= 1`.
   - 새 코인으로 다 찬 세로줄을 왼쪽부터 촉수 감기 처리한다.
3. 종료: `left = 0`이거나 15칸이 다 찼거나 하드캡(40회)에 닿으면 끝.

### 3-3. 정산

```
숫자 코인 합(촉수 감기 반영) + 보물 코인 합 + (15칸이면 최고 보물 ×1000) → 총 베팅 곱 → 상한 2,000× 안에서 지급
```

- 리스핀 지급은 트리거 스핀의 `totalWin`에 라인 당첨과 함께 들어간다(`respinWin`으로 따로도 싣는다).
- 상한은 라인 → 숫자 코인 → 보물 → 최고 보물 순으로 채우고 넘치면 자르며 `winCapped` 피처를 남긴다. 자연 최대(§3-5)가 상한보다 작아 실전 도달은 0이 목표다.

### 3-4. 종료 보장 (GAME_CATALOG §4 규칙 1~3)

| 규칙 | 이 게임에서의 근거 |
|---|---|
| 1 기대 반복 수렴 | `r = max_r q_r × 빈칸`. 빈칸은 진입 때 최대 `15 − 6 = 9`이고 줄기만 한다. `parseGameMath`가 `max_r q_r × (reels·rows − trigger) < 1`을 검사하고 넘으면 예외. 목표 `q ≈ 0.065` → `r ≈ 0.59` |
| 2 정수 하드캡 + 지급 캡 | `hardCap: 40`(필수 필드) + `round.maxWinCap: 2000`. 감사도 같은 캡으로 잰다 |
| 3 단조 감소 척도 | `M = 3 × 빈칸 + left`. 새 코인 k개(k ≥ 1)면 `ΔM = −3k + (3 − left) ≤ −1`, 없으면 `ΔM = −1`. `M ≥ 0`, 시작값 ≤ `3 × 9 + 3 = 30` → **리스핀은 최대 30회**. 빈칸 0이면 즉시 종료 |

- 고정된 칸은 절대 다시 뽑지 않는다(카탈로그 엣지 규칙).
- 스키마 refine: `hardCap ≥ 1`, `respins ≥ 1`, `1 ≤ trigger ≤ reels·rows`, 리스핀 칸 스트립 릴마다 코인 1개 이상·비코인 1개 이상, 촉수 배수 정수 ≥ 2, 보물 값 오름차순, 금액 × 베팅 레벨 정수, `coinRespin`과 `cascade`/`cluster`/`orderRound`/`scatter.freeSpins` 동시 금지.

### 3-5. 상한

| 항목 | 값 |
|---|---|
| 숫자 코인 최대 | 15칸 중 보물 3칸을 뺀 12칸 × ×10 × 촉수 2 = 240× |
| 보물 최대 | 20 + 50 + 200 + 1000 = 1,270× |
| 트리거 스핀 라인 최대 | 코인 15칸이면 라인 0, 코인 6칸이면 9칸으로 만들 수 있는 라인 ≈ 50× 이하 |
| 자연 최대 | ≈ 1,560× |
| 서비스 상한 | **2,000×**(`round.maxWinCap`) — 안전망. 도달률은 감사 리포트에 명시 |

### 3-6. 촉수 감기 세부

- 대상: 고정 코인 3칸으로 다 찬 세로줄(릴). 줄마다 라운드당 1회(`wrapped[reel]`).
- 효과: 그 줄의 숫자 코인 금액 × `columnBonus.multiplier`(2). 보물 코인은 그대로.
- 처리 순서: 같은 리스핀에 여러 줄이 완성되면 왼쪽 줄부터. 진입 판에서 완성된 줄도 같은 규칙.
- 판 채우기와 관계: 15칸을 채우면 다섯 줄이 모두 감긴 상태가 된다(그 전에 이미 감긴 줄 포함). 최고 보물은 그 뒤에 더한다.
- RNG를 쓰지 않는 결정론 함수다(`applyColumnWraps(board) → { board, wraps }`).

---

## 4. RNG 소비 순서·응답 계약·API

### 4-1. 왜 «응답 하나에서 다 푼다»인가

| 기준 | 응답 하나(채택) | `game_states`로 리스핀마다 요청 |
|---|---|---|
| 추가 베팅 | 없음(리스핀은 공짜) | 없음 |
| 엔진 | 스핀 안 루프 하나. `RoundState` 변경 없음 | `spinUnchecked`가 «릴 정지 없이 빈칸만 뽑는» 두 번째 경로를 가져야 함 |
| 허브 잭팟 | 라운드당 1회 판정(기존과 동일) | 프리스핀 적립 0 경로 재사용 |
| 멱등·공개 | 트리거 스핀 하나로 끝. `replaySpin` 그대로 | 리스핀 요청마다 라운드 레코드 30개까지 |
| 감사 | 스핀 = 라운드. 기존 샤드 그대로 | 세션 루프 |
| 새로고침 | 결과·잔액은 이미 확정. **연출만** 잃는다 → §4-5의 연출 이어 보기로 보완 | 서버 상태로 그 리스핀부터 복원 |
| DB | 마이그레이션 0(피처 jsonb에 실음) | carry 스키마 확장 |

연출을 잃는 것 하나를 빼면 응답 하나가 모든 면에서 싸고 안전하다. candy의 연쇄가 같은 방식이고 검증이 끝났다.

### 4-2. RNG 소비 계약

```
① 릴 정지 5회             nextInt(strip[reel].length), 릴 0→4
② 뮤테이션 0회            (없음)
③ 기본 판 코인 금액        코인 칸마다 1회, 순서 릴 0→4 · 행 0→2
                           pickWeighted(values − 판에 이미 있는 보물)
④ 라인 평가 0회
⑤ [진입 시] 리스핀 k = 1..  고정 안 된 칸마다(릴 0→4 · 행 0→2)
                           nextInt(respinStrip[reel].length) 1회
                           → coin이면 금액 1회(③과 같은 규칙)
   촉수 감기·종료 판정 0회
⑥ 정산 0회
⑦ [API] 허브 잭팟 판정 1회   (기존 그대로, 이것이 마지막)
```

- 소비 횟수는 판 결과로 정해진다. `seed + nonce + totalBet`이면 라운드 전체가 재생된다.
- `coinRespin.test.ts`의 RNG 호출 수 테스트: 코인 c개 비진입 스핀 = `5 + c`, 진입 스핀 = `5 + c + Σ(리스핀마다 빈칸 수 + 새 코인 수)`.
- `pickWeighted`는 candy 때 `src/random.ts`로 옮겨 둔 것을 쓴다.
- 코인이 없는 팩(live 7종)은 ③⑤가 없다. `math.coinRespin`이 없으면 `spinUnchecked`는 한 글자도 다르게 돌지 않는다(골든 게이트).

### 4-3. 엔진 타입 (`packages/slot-engine/src/types.ts` 추가분)

```ts
export type TreasureTier = 'small' | 'medium' | 'large'
export interface CoinCell {
  pos: GridPosition                 // [reel, row]
  kind: 'bet' | 'treasure'
  value: number                     // 총 베팅 배수 (촉수 감기 반영 후)
  tier?: TreasureTier               // kind === 'treasure'
  amount: number                    // 코인 = round(value × totalBet)
}
export interface ColumnWrap { reel: number; before: number[]; after: number[] }   // 행 0→2의 금액(코인)
export interface RespinStep {
  index: number                     // 0부터
  grid: SymbolId[][]                // 이 리스핀이 멈춘 판(grid[row][reel]). 고정 칸은 'coin'
  newCoins: CoinCell[]              // 이번에 붙은 코인
  wraps: ColumnWrap[]               // 이번에 감긴 줄
  left: number                      // 이 리스핀 뒤 남은 횟수
}
export interface RespinOutcome {
  entry: CoinCell[]                 // 진입 판 코인(입장 시 감기 반영 전)
  entryWraps: ColumnWrap[]
  steps: RespinStep[]
  final: CoinCell[]                 // 종료 판 코인 전부(감기 반영)
  full: boolean
  coinWin: number                   // 숫자 + 보물 코인 합 (코인)
  topWin: number                    // 최고 보물 (코인, 15칸일 때만)
  win: number                       // 지급 (캡 적용)
  capped: boolean
  hitHardCap: boolean
}
// FeatureTrigger에 추가
| { type: 'coinBoard'; cells: CoinCell[] }                  // 기본 판에 코인이 1개 이상일 때
| { type: 'coinRespin' } & RespinOutcome                    // 진입했을 때
// SpinResult에 추가
respinWin?: number                                          // 진입 스핀만. totalWin에 이미 들어 있다
```

`totalWin = lineWin + respinWin`(진입 스핀), 그 밖은 기존 그대로.

### 4-4. 응답·저장·API 경로

| 항목 | 변경 |
|---|---|
| 저장 | 엔진 피처가 `rounds.features`(jsonb)에 그대로 저장된다 → **새 열·마이그레이션 없음** |
| `POST /games/:id/spin` | `SpinResponse.features`에 `coinBoard`·`coinRespin`이 실린다. `respinWin`은 `orderWin`처럼 피처에서 조립해 싣는다 |
| 멱등 재전송 | 저장된 피처를 그대로 돌려준다(재실행 안 함) → 바이트 동일 |
| 시드 공개 `GET /rounds/:id/seed` | 기존 그대로. 허브 `handleRevealSeed`가 `replaySpin(math, bet, rng)`로 재생해 `totalWin`·`coinRespin.final`·`steps.length`를 비교한다 |
| `GET /games/:id/state` | 변경 없음(리스핀은 상태를 남기지 않는다) |
| 응답 크기 | 리스핀 1회 ≈ 0.2KB(15칸 판 + 새 코인). 최악 30회 ≈ 6KB + 진입·종료 ≈ 1KB. **상한 테스트 12KB** |
| 서버 권위 | 코인 금액·리스핀 판·촉수 감기·정산은 엔진만 계산한다. 허브는 피처를 **재생만** 한다(클라이언트 RNG 없음) |
| 체험판(`--mode demo`) | 같은 Hono 앱·엔진을 탭 안에서 돌리므로 그대로 동작. `pnpm --filter @tgslot/hub build:demo` 후 체험판 QA 1회 |

응답 예(요약):

```json
{
  "totalBet": 100, "totalWin": 7300, "respinWin": 6900,
  "features": [
    { "type": "coinBoard", "cells": [ { "pos": [0,1], "kind": "bet", "value": 2, "amount": 200 }, "…" ] },
    { "type": "coinRespin",
      "entry": ["…6칸…"], "entryWraps": [],
      "steps": [ { "index": 0, "grid": [["coin","crab","…"],["…"],["…"]],
                   "newCoins": [ { "pos": [3,2], "kind": "treasure", "tier": "small", "value": 20, "amount": 2000 } ],
                   "wraps": [], "left": 3 }, "…" ],
      "final": ["…11칸…"], "full": false, "coinWin": 6900, "topWin": 0, "win": 6900,
      "capped": false, "hitHardCap": false }
  ]
}
```

### 4-5. 새로고침 — 연출 이어 보기

- 결과·잔액은 응답 시점에 이미 확정이다. 새로고침해도 돈은 잃지 않는다.
- 허브는 `coinRespin`이 든 응답을 받으면 연출 시작 전에 `localStorage['tgslot.respinReplay.<gameId>']`에 `{ roundId, response, savedAt }`를 저장하고, 연출이 끝나면(STOP 압축 포함) 지운다(`lib/respinReplay.ts`, 저장·읽기 모두 try/catch). sessionStorage가 아닌 이유: 텔레그램 미니앱은 닫았다 다시 열면 새 웹뷰라 sessionStorage가 비어 있다.
- 다시 열었을 때 그 게임이고 10분 안이면 «지난 리스핀 이어 보기»로 그 응답을 **표시 전용**으로 처음부터 재생한다. 재생 중 스핀 버튼은 잠그고, STOP 한 번이면 §7-5 압축 재생으로 바로 끝난다. 잔액은 서버(`/me`) 값을 그대로 쓰고 재생 중 갱신하지 않는다. 10분이 지났거나 저장이 막힌 환경이면 아무것도 재생하지 않는다(잔액은 이미 맞다 — live 7종과 같은 동작).
- 응답을 받기 전에 새로고침한 경우(멱등 키가 메모리에만 있음)는 live 7종과 같다. 이 게임만 따로 막지 않는다.
- 서버 권위는 그대로다(재생 데이터는 서버가 준 응답이다).

### 4-6. 디버그 프리셋 (`SpinDebugPresetSchema`, `debugSpin.ts`, `lib/debugPreset.ts`)

| 프리셋 | 조건 | 비고 |
|---|---|---|
| `coinRespin` | 진입 | 약 1/185 → 기본 5,000회 탐색 |
| `columnWrap` | 리스핀 **도중** 감기 1회 이상 | 진입 감기만으로는 애니메이션 순서 확인이 안 된다 |
| `treasure` | 종료 판에 보물 코인 1개 이상 | |
| `coinRespinFull` | 15칸 채움 | 약 1/26,000 스핀. 서버가 이 프리셋만 내부 탐색 상한 200,000회(클라이언트 `maxTries` 무시). 탐색 지연 테스트 < 3s |

`presetsFor(math)`가 `coinRespin`이 있는 팩에만 4종을 보여 주고 `freeSpins`는 뺀다. 다른 게임은 서버가 409.

---

## 5. 수학 목표·튜닝·감사

### 5-1. 목표와 개략 추정

개략 시뮬레이션(칸 독립 모델, 기획 추정용 스크래치 스크립트, 코인 밀도 c = 0.118, 리스핀 q = 0.065, §2-4 금액표):

| 지표 | 목표 | 개략값 |
|---|---|---|
| 피처 진입 | 1/185 ±15% | 1/191 |
| 피처 평균 지급 | 40~60× | 49.3× |
| 피처 표준편차 | — | 93.6× |
| 종료 코인 수 | 평균 9~10 | 9.3(6개 13.6% … 15개 0.7%) |
| 평균 리스핀 | 6~8 | 7.3(최대 관측 25) |
| 진입하자마자 감기 | 20~30% | 24.7% |
| 리스핀 도중 감기 1회 이상 | 50~60% | 56.4% |
| 작은 / 중간 / 큰 보물 등장 | 25% / 8% / 1.7%(라운드당) | 25.2% / 8.4% / 1.75% |
| 15칸 채움 | 0.5~1.0% | 0.70% |
| 피처 지급 구성 | — | 숫자 42.6% · 촉수 보너스 17.4% · 보물 25.9% · 최고 14.2% |
| 피처 RTP | 28.5 | 26.1(진입률을 1/185로 맞추면 26.6, 금액 가중치로 보정) |

실제 스트립은 코인이 2~3칸 묶음으로 놓여 칸 독립이 아니다. 위 값은 출발점이고 정답은 몬테카를로가 낸다.

### 5-2. math.json 모양 (엔진 스키마 추가분)

```json
"wild": { "substitutesFor": "all", "excludes": ["coin"] },
"round": { "maxWinCap": 2000 },
"coinRespin": {
  "symbol": "coin",
  "trigger": 6,
  "respins": 3,
  "hardCap": 40,
  "respinStrips": [["coin","shell","crab","…"], "… 릴 5개 …"],
  "values": [
    { "kind": "bet", "value": 1, "weight": 4000 },
    { "kind": "bet", "value": 2, "weight": 2500 },
    { "kind": "bet", "value": 3, "weight": 1400 },
    { "kind": "bet", "value": 5, "weight": 900 },
    { "kind": "bet", "value": 10, "weight": 400 },
    { "kind": "treasure", "tier": "small", "weight": 300 },
    { "kind": "treasure", "tier": "medium", "weight": 90 },
    { "kind": "treasure", "tier": "large", "weight": 18 }
  ],
  "treasures": { "small": 20, "medium": 50, "large": 200, "top": 1000 },
  "columnBonus": { "multiplier": 2 }
}
```

리스핀 칸 스트립은 릴마다 200칸 안팎, 코인 13칸(q = 0.065) + 하위 심볼(비코인 칸은 지급하지 않으니 무엇이든 되지만, 화면이 지루하지 않게 하위 4종을 섞는다).

### 5-3. 튜닝 순서 (손잡이를 섞지 않는다)

1. **기본 스트립 코인 배치**(묶음 길이·밀도, 릴별) → 진입률 1/185. 적중률은 아직 보지 않는다.
2. **채움 심볼 교차 배치** → 적중률 27%.
3. **배당표 선형 배율** → 라인 RTP 66.0.
4. **리스핀 칸 스트립 q**(릴별 코인 수) → 종료 코인 평균 9.3, 15칸 채움 0.5~1.0%. `max q × 9 < 1` 유지.
5. **보물 가중치** → 등장률 25 / 8 / 1.7%.
6. **숫자 코인 가중치**(×1 ↔ ×2 비율 이동) → 피처 RTP 28.5. 피처 기대값이 평균 숫자 금액에 거의 선형이라 1~2회 반복으로 끝난다.
7. 다른 시드로 교차 확인(HOWTO §3-e-4).

기대감(남은 릴 감속) 발생률도 `tune-cli`에 낸다. 목표 ≤ 3% 스핀(§7-3 규칙).

### 5-4. 감사 도구 변경 (`tools/rtp-sim`)

- `audit/coinRespinStats.ts`(새 파일): 진입률, 종료 코인 수 분포(6~15), 리스핀 횟수 분포(0~30), 진입 감기·도중 감기 횟수 분포, 보물 단계별 등장률, 15칸 채움률, `hardCap`·`winCapped` 도달률, 피처 지급 분포.
- `audit/contributions.ts`: 분해를 `lines / respinNumeric / respinWrapBonus / respinTreasure / respinTop`로 나눈다.
- `audit/report.ts`: «코인 리스핀» 절 추가(위 지표 + 파일럿 σ, `n*`, 실제 `n`).
- `tune-cli.ts`: 위 지표 한 화면 + 기대감 발생률. `--respin-strips densities.json`으로 칸 스트립 생성.
- `audit/spinner.ts`는 이미 `spinUnchecked`에 위임하므로(candy O3) 리스핀까지 같은 경로로 잰다. 같은 결과 테스트만 하나 더한다.
- `isAnalytic`: `coinRespin`이 있으면 false(몬테카를로 전용, 카탈로그 §4 P5 행).

### 5-5. σ와 n*

- 스핀당 분산 ≈ `p × E[X²] + 라인 분산` ≈ `0.0054 × (93.6² + 49.3²) + 3²` ≈ 72 → **σ̂ ≈ 8.4**.
- `n* = ⌈(1.96 · σ̂ · 1.1 / 0.002)²⌉` ≈ **8.2천만** → `manifest.auditSpins: 90000000`(파일럿 5M 후 갱신).
- σ̂ > 11이면 큰 보물(×200) 가중치를 낮추고 중간 보물을 올려 기대값을 유지한 채 꼬리만 깎는다.
- 시간 추정: 5×3 라인 스핀 약 4~6µs(피처는 드묾) → 9천만 × 5µs ÷ 4샤드 ≈ **2~3분**(`--shards 4`, 메모리 제약 준수). 파일럿 5M ≈ 25초.

### 5-6. 감사 게이트 (HOWTO §6 + 카탈로그 §4)

| 관문 | 기준 |
|---|---|
| CI(40만) | `\|rtp − 0.945\| ≤ max(0.5%p, 3·SE)` + 고정 시드 재현 + 정밀도 필드 |
| 정식 감사 | `\|rtp − 0.945\| ≤ 0.5%p` **그리고** ci95 반폭 ≤ 0.2%p, `n ≥ n*`, 샤드 시드 전부 기록 |
| 기존 | 베팅 레벨별 ±0.5%p · 적중률 10~60% · 최대 배수 ≥ 100× · 분포 합 1 · 잭팟 포함 96.0 ± 0.5 |
| 코인 리스핀 | 진입 1/185 ±15% · 리스핀 ≤ 30(위반 0) · `hardCap` 도달 0 · `q×빈칸` 정적 검사 통과 · 분해 합 = 전체 |
| 상한 | `winCapped` 도달률과 캡 on/off 차를 명시(기대 0) |
| 회귀 | `__golden__` 6팩 해시 동일 + candy 연쇄·주문 테스트 통과 + live 7종 2M 수치 동일 |

---

## 6. 엔진·공용 패키지 변경 목록 (파일 단위)

새 파일 위주, 공용 파일은 «추가만». i18n 키는 `kraken`/`coinRespin` 네임스페이스로 사전 끝에 붙인다.

### 6-1. `packages/slot-engine`

| 파일 | 변경 |
|---|---|
| `src/coinRespinSchema.ts` **새** | `CoinRespinSchema`(zod) + `checkCoinRespin(math, issue)` refine(§3-4 전부) |
| `src/coinRespin.ts` **새** | `assignCoinValues(math, grid, totalBet, rng)`, `runCoinRespin(math, entry, totalBet, capRoom, rng)`, `applyColumnWraps(board, math)`, `foldRespin(entryGrid, steps)`(순수), `resolveCoinRespinSpin(…)` |
| `src/schema.ts` | `GameMathSchema`에 `coinRespin: CoinRespinSchema.optional()` 한 줄 + refine 호출 한 줄 |
| `src/spin.ts` | `spinUnchecked`에서 `math.coinRespin`이면 `resolveCoinRespinSpin`으로 분기(3줄). 없으면 기존 경로 그대로 |
| `src/types.ts` | §4-3 타입 추가 |
| `src/analytic.ts` | `isAnalytic`: `coinRespin` 있으면 false |
| `src/index.ts` | 새 함수·타입 export |
| `src/coinRespin.test.ts` **새** | 손 판 테스트(아래) |
| `src/coinRespin-schema.test.ts` **새** | refine 실패 케이스 |

`coinRespin.test.ts`가 고정하는 것:

| 테스트 | 내용 |
|---|---|
| 리셋 | 새 코인 → 3, 없음 → −1, 0이면 종료, 15칸이면 즉시 종료 |
| 고정 | 고정 칸은 다시 뽑지 않는다(RNG 호출 수로 확인) |
| 촉수 감기 | 진입 감기, 도중 감기, 같은 리스핀 두 줄(왼쪽부터), 줄당 1회, 보물 코인은 ×1 |
| 보물 | 판에 있는 보물은 후보에서 빠짐, 세 단계가 다 있으면 숫자만 나옴 |
| 최고 보물 | 15칸에서만, 1회 |
| 종료 척도 | 무작위 50,000라운드에서 리스핀 ≤ 30, `hitHardCap` 0 |
| 캡 | 캡을 낮춘 픽스처로 자르기·`winCapped` |
| RNG 호출 수 | §4-2 공식 |
| 재생 | `foldRespin(entry, steps)`의 마지막 판 = `final`, `win = coinWin + topWin` |
| 골든 | `__golden__` 6팩 해시 동일(candy는 기존 연쇄·주문 테스트로) |

### 6-2. `packages/shared`

| 파일 | 변경 |
|---|---|
| `src/schemas.ts` | `CoinCellSchema`, `ColumnWrapSchema`, `RespinStepSchema`, `FeatureTriggerSchema`에 `coinBoard`·`coinRespin` 추가, `SpinResponse.respinWin?`, `SpinDebugPresetSchema`에 4종 추가 |
| `src/schemas.test.ts` | 새 피처 파싱 + 최악 응답 12KB |

### 6-3. `apps/api`

| 파일 | 변경 |
|---|---|
| `src/games/engineSpin.ts` | `toSharedFeature`에 `coinBoard`·`coinRespin` 명시 분기(`never` 검사 유지) |
| `src/routes/games.ts` | `respinWin` 조립(피처에서), 코인 리스핀이 없는 팩에 4종 프리셋 409 |
| `src/games/debugSpin.ts` | 프리셋 술어 4종, `coinRespinFull` 내부 탐색 상한 |
| `src/routes/coinRespin.test.ts` **새** | 진입 응답 모양, 멱등 재전송 바이트 동일, 원장 1건, 시드 공개 재생 일치, 잭팟 판정이 리스핀 뒤 1회 |

### 6-4. `packages/game-sdk` · `tools/theme-gen`

| 파일 | 변경 |
|---|---|
| `game-sdk/src/prompts.ts` | `ASSET_KINDS`에 `'prop'` 추가(출력 `theme/props/<id>.webp`) — hanbok 기획서 §6과 같은 정의 |
| `game-sdk/src/theme.ts` | `props?: Record<string, string>`(hanbok과 같음), `SOUND_PRESETS`에 `'deepsea'` |
| `game-sdk/src/validate.ts` | `coinRespin` 팩이면 `props`의 `coin-small/medium/large`, `treasure-top`, `tentacle` 필수(오류). 이 검사는 `coinRespin` 분기 안에 둔다 |
| `tools/theme-gen/src/**` | `prop`을 `symbol`처럼 생성·키잉·`applyThemeUpdate` 병합, 컨택트 시트에 포함(hanbok과 같은 변경 — 먼저 병합되는 쪽을 따른다) |

### 6-5. `packages/renderer`

| 파일 | 변경 |
|---|---|
| `src/respin.ts` **새** | 순수 계획: `buildRespinPlan(outcome, opts)`, `respinStepDurations(mode)`, `compressRespin(remaining)`. 마지막 판 = `final` 등식 검사 |
| `src/pixi/respinFx.ts` **새** | 칸 릴(빈 칸만 개별 회전·착지), 고정 테두리, 비코인 칸 어둡게(밝기 45%), 촉수 끝 «한 칸 남음» 대기 |
| `src/pixi/coinFace.ts` **새** | 코인 금액 얼굴: `coin` 텍스처 + 금액 글자를 `RenderTexture`로 합성, 라벨 문자열 키 캐시(최대 64, LRU, `destroy` 때 전부 해제). 보물 코인은 `props` 텍스처 |
| `src/pixi/tentacle.ts` **새** | `MeshRope` + `props/tentacle` 텍스처. 줄을 감는 경로 점 애니메이션, 객체 풀 5개, GSAP 타임라인은 스킵·파괴 때 `kill` |
| `src/types.ts` | `SoundPreset`에 `'deepsea'`, `Theme.props?`, `SpinToOptions.coins?`·`respin?`, 이벤트 `respinStep`·`columnWrap`·`respinCollect`·`respinEnd` |
| `src/coinAnticipation.ts` **새** | `coinAnticipatedReels(math, stops)` — 코인 규칙(§7-3). 기존 `anticipation.ts`·`featureTriggerCount`는 그대로 |
| `src/pixi/pixiRenderer.ts` | 기대감 릴 계산에 `math.coinRespin ? coinAnticipatedReels : anticipatedReels` 한 줄. 착지 → 코인 얼굴 → (`respin` 있으면) `runRespinPhase` → `spinEnd`. 진입 전 `setMode('freeSpins')` 경로 재사용 |
| `src/respin.test.ts` **새** | 시간 예산 4행, 압축, 등식 |

이벤트 계약(허브가 소비):

```ts
| { type: 'respinStep'; index: number; total: number; phase: 'start'|'land'|'end'; left: number
    newCoins: CoinCell[]; coinTotal: number }                    // coinTotal = 지금까지 판 위 금액 합
| { type: 'columnWrap'; reel: number; phase: 'start'|'end'; before: number[]; after: number[] }
| { type: 'respinCollect'; index: number; cell: CoinCell; running: number }   // 정산 중 코인 1개
| { type: 'respinEnd'; coinWin: number; topWin: number; full: boolean }
```

### 6-6. `apps/hub`

| 파일 | 변경 |
|---|---|
| `components/game/RespinHud.tsx` **새** (+css) | 남은 리스핀 점 3개(●●●) + «마지막!» + «판 채우기까지 N칸» |
| `components/game/TreasureRibbon.tsx` **새** (+css) | 보물 4단 띠. 현재 베팅 기준 금액, 등장·지급 시 해당 칸 켜짐 |
| `components/game/CoinRespinHelp.tsx` **새** (+css) | 도움말 «코인 리스핀» 탭(§11) |
| `lib/respinReplay.ts` **새** | §4-5 |
| `components/game/CoinRespinLayer.tsx` **새** | HUD·보물 띠 배치, 렌더러 이벤트 처리, 이어 보기, 시드 공개 비교 보조를 한 컴포넌트에 모은다 |
| `store/coinRespin.ts` **새** | `respinView`(표시용 진행) 작은 zustand 스토어 — 서버 피처로만 채운다. 공용 `store/game.ts`는 건드리지 않는다 |
| `lib/coinFormat.ts` **새** | 코인 얼굴·보물 띠용 압축 표기(≤5글자), **언어별**: ko는 1만 미만 쉼표(`2,500`), 1만 이상 «만»(`2만`·`1.5만`·`100만`), en은 `2.5K`·`20K`·`1M`. 렌더러에 함수로 넘긴다 |
| `components/game/GameScreen.tsx` | `math.coinRespin`일 때만 `<CoinRespinLayer>` 마운트 + `spinTo`에 `coins`/`respin` 전달 + 이벤트 전달(몇 줄. 다른 두 팀도 고치는 파일이라 로직은 새 파일로) |
| `lib/debugPreset.ts` | `presetsFor`에 4종 |
| `i18n/ko.ts`·`en.ts` | `coinRespin*`·`treasure*`·`kraken*` 키를 끝에 추가 |

### 6-7. 사운드 (`apps/hub/src/lib`)

| 파일 | 변경 |
|---|---|
| `audioDeepsea.ts` **새** | `DEEPSEA_RECIPE` + 리스핀 전용 소리 함수(§9) |
| `audio.ts` | import + `RECIPES.deepsea` 한 줄 + 새 재생 함수 export(위임) |
| `bgmDeepsea.ts` **새** | `DEEPSEA` BGM 스타일 |
| `bgm.ts` | `BGM_STYLES.deepsea` 한 줄 |

### 6-8. 게임 팩 `games/kraken-cove/`

`manifest.json`(`status: hidden` → 게이트 통과 후 `live`, `auditSpins`), `math.json`, `art/prompts.json`, `art/fx.json`, `theme/theme.json`, `README.md`(배당표·실측), `CHECKLIST.md`, `docs/RTP_AUDIT_kraken-cove.md`.

---

## 7. 화면 스토리보드 (390×844 / 430×932)

### 7-1. 배치 (위 → 아래, 430 기준)

```
┌ 상단 바(잔액·뒤로·설정)                     56px
├ 허브 잭팟 띠(기존 위치·모양 그대로)          ~40px
├ 보물 띠 [작은 2,000][중간 5,000][큰 20,000][최고 100,000]   40px  ← 코인 모양 칩, 「보물」 머리표
├ (리스핀 중) 남은 리스핀 ●●●  · (빈칸 ≤3일 때) 판 채우기까지 3칸   32px
├ 프레임(정사각, 마퀴에 크라켄 촉수 장식)
│   └ 릴 창 5×3, 셀 약 79px(390: 약 71px)
├ WinStrip(당첨 금액 — 리스핀 중엔 «모은 코인 12,400»)   컨트롤 바로 위
└ 컨트롤(베팅·스핀/STOP·오토·속도)
```

- 보물 띠는 **게임 영역 안**(프레임 바로 위)에 둔다. 허브 잭팟은 기존 상단 위치·이름 그대로라 둘이 섞여 보이지 않는다.
- 리스핀 HUD가 생기고 사라질 때 캔버스 크기가 바뀌지 않게 높이를 늘 확보한다(기본 게임에서는 빈 자리 — 규칙 문구를 화면에 쓰지 않는다. 규칙은 도움말 페이지로). «판 채우기까지 N칸»은 빈칸 3칸 이하일 때만(§1-2).
- 숫자 판독: 코인 얼굴 글자 390px에서 18px 이상, 굵게 + 진한 외곽선, 라벨 폭 ≤ 셀의 80%(390px 셀 71px → 57px, `coinFormat` 5글자 이하). 보물 띠 칩(430에서 약 99px)도 같은 표기라 베팅 1000의 최고 보물도 `100만`/`1M`으로 한 줄에 든다.

### 7-2. 장면별

| 장면 | 내용 |
|---|---|
| S1 기본 | 릴이 멈추면 코인마다 금액 얼굴이 뜬다(착지와 같은 tick에 텍스처 교체 — 제자리에서 바뀌어 보이지 않게 회전 중 마지막 프레임부터 얼굴을 단다). 라인 당첨은 칸 강조 이펙트(선 없음) |
| S2 진입 | 코인이 릴→행 순서로 80ms 간격 «칭» 펄스 → 라인 당첨이 있으면 brief 표시 → 크라켄(마퀴) 흔들림 → 전환 클립 `fs-enter`(3.0s, `opaqueMs`에서 교체) → 덮인 사이에 동굴 배경(`bgFreeSpins`)·비코인 칸 어둡게·HUD ●●● → 클립 걷힘 → 진입 감기가 있으면 바로 촉수 |
| S3 리스핀 | 빈 칸들만 개별 회전(600ms, 칸마다 35ms 스태거) → 착지. 새 코인: **툭(히트) → 120ms 멈춤 → 고정 테두리 빛 + «철컥칭»** → 카운터가 ●●●로 차오름(소나 3음). 코인 없음: 점 하나가 톡 빠짐 |
| S3-a 한 칸 남은 줄 | 두 칸이 찬 줄 아래 촉수 끝이 판 밑에서 살짝 나와 꿈틀댄다(코드 애니메이션). 줄이 완성되면 그대로 올라와 감는다 |
| S3-b 촉수 감기 | 촉수가 아래에서 올라옴(350ms) → 감기(250ms) → 그 줄 숫자가 ×2로 세어짐(300ms) → 촉수 내려감(배경에서, 시간 예산 밖) |
| S3-c 마지막 리스핀 | 칸 회전 900ms로 느리게 + 저음 심장 박동 + HUD «마지막!». turbo·모션 축소에서는 회전만 600ms |
| S4 정산 | 남은 0회 또는 15칸 → 코인이 릴→행 순으로 하나씩 WinStrip 합계로 날아감(120ms 간격, 9개면 ≈ 1.1s). 보물 코인은 400ms 머물며 보물 띠 해당 칸 점등. 15칸이면 판 전체 금빛 → «최고 보물» 띠 확대 2.0s |
| S5 빅윈 | 정산이 끝난 뒤 한 번만 등급 판정 → 공용 셀레브레이션 스킨(`theme.json celebration`). 동굴 배경 위에서 재생 |
| S6 종료 | (빅윈 등급이면 S5 뒤, 아니면 정산 직후) 전환 클립 `fs-exit`(첫 프레임부터 덮음) → 기본 배경 복귀. WinStrip에 «코인 리스핀 합계» 총액 유지. 별도 요약 팝업은 두지 않는다(정산·빅윈·클립에 이어 네 번째 마무리 화면이 되어 지루하다) |

### 7-3. 기대감 (기본 게임)

- 릴 3이 멈춘 뒤 코인 ≥ 4면 릴 4·5 감속, 릴 4가 멈춘 뒤 코인 ≥ 5면 릴 5 감속. normal·quick만, turbo·모션 축소는 끔. 시간만 늘고 결과는 그대로다.
- 발생률을 `tune-cli`로 재고 3%를 넘으면 문턱을 올린다.

### 7-4. 시간 예산

리스핀 1회 = 회전 + 착지 정리 + (새 코인이면) 고정 연출. 촉수·정산은 이벤트가 있을 때만.

| 모드 | 리스핀 1회(코인 없음 / 있음) | 촉수 1줄 | 정산(코인 9개) | 일반 라운드 합(7회·감기 1·클립 2) | 최악(30회·감기 5·15칸) | 게이트 |
|---|---|---|---|---:|---:|---|
| normal | 800 / 1,100ms | 900ms | 1.1s | ≈ 16s | ≈ 44s | 일반 ≤ 18s |
| quick | 600 / 820ms | 680ms | 0.8s | ≈ 13s | ≈ 34s | ≤ 15s |
| turbo | 420 / 560ms | 450ms | 0.6s | ≈ 11s | ≈ 25s | ≤ 12.5s |
| 모션 축소 | 300 / 380ms | 200ms(점멸) | 0.4s | ≈ 9s | ≈ 17s | ≤ 10.5s |

(클립 2편 6.0s와 진입 펄스·마퀴 흔들림 ≈1s는 모든 모드에 포함. 모션 축소는 클립 대신 기존 단색 커튼. 빅윈 셀레브레이션은 candy R2처럼 예산 밖이며 기존 스킵 핸들로 줄인다. 요약 팝업을 뺀 값이다. 개략 시뮬레이션 기준 평균 리스핀 7.2회 중 «1회 남음» 차례가 라운드당 약 1.5번이라 마지막 리스핀 감속 비용은 normal 약 0.15s.)

### 7-5. STOP·스킵

- 기본 릴 회전 중 STOP: 기존 스냅 착지. 코인 얼굴은 착지 프레임과 같은 tick에 단다.
- 리스핀 진행 중 STOP(한 번): 남은 리스핀을 **압축 재생**한다. 1회 길이 `max(90, min(220, 1500 / 남은 수))`ms, 칸 회전은 항상 위치 트윈(제자리 텍스처 교체 없음), 촉수는 300ms 점멸판, 정산은 600ms 일괄. 금액·순서는 같다.
- 두 번째 탭은 무시한다. 셀레브레이션은 기존 스킵 핸들.
- 오토스핀 중 진입하면 리스핀은 자동 진행하고 복귀 클립 뒤 다음 오토스핀으로 이어진다.

---

## 8. 아트

### 8-1. 컨셉

**선명한 라군 동굴 + 말랑한 비닐 장난감 3D.** 물기 어린 하이라이트는 재질에만, 화면을 가로지르는 사선 광택·빛 쓸기는 없다(사용자 규칙). 빛은 위에서 내려오는 물결 무늬(코스틱)로만.

- 팔레트: 라군 청록 `#2ec4d6`, 산호 분홍 `#ff6f91`, 햇살 금 `#ffc83d`, 크라켄 보라 `#7b5cff`, 깊은 동굴 남색 `#10285a`(대비용), 물거품 민트 `#b8f5e8`.
- candy(매트 파스텔 젤리)·fruit(캔디 글라스)와 재질이 다르다. 야시장(민화)·아이돌(셀셰이딩)과도 겹치지 않는다.

`stylePrefix` 초안:

```
Bright stylized 3D mobile game icon render, chunky soft vinyl-toy shapes with a subtle wet sheen on the material only, underwater lagoon cave theme, 3/4 top-down camera angle, soft top light with gentle rippling caustic light from above, vivid palette of lagoon teal (#2ec4d6), coral pink (#ff6f91), sunny gold (#ffc83d), kraken violet (#7b5cff) with deep navy (#10285a) accents, bold simple silhouette that reads at 64px, no watermark, no baked-in drop shadow, premium casual mobile slot game asset quality —
```

`negative` 초안: `photorealistic photography, dark horror mood, scary teeth, blurry, watermark, signature, text, letters, numbers, random glyphs, diagonal light streak across the image, busy cluttered background, baked-in drop shadow, cropped edges, multiple duplicate objects, people, hands, cheap clip-art look`

### 8-2. 자산 목록 (생성 22장 + 클립 2편)

| id | kind | size → out | 프롬프트 초안(요지) / 메모 |
|---|---|---|---|
| `wild` | symbol | 1024² → 512 | 둥근 보라 크라켄 머리, 큰 동그란 눈·미소, 양옆으로 말린 촉수 두 가닥, 귀엽고 무섭지 않게. (이 심볼만 얼굴 허용 — 프롬프트에서 negative의 face 금지를 빼고 «friendly cute face») |
| `coin` | symbol | 1024² → 512 | 정면 금화, 두꺼운 테두리, 가운데 **넓고 매끈한 빈 면**(코드가 금액을 쓴다), 테두리에 작은 조개 무늬. «no numbers, no letters, the center is plain smooth gold» |
| `crown` | symbol | 1024² → 512 | 산호 가지가 솟은 황금 왕관, 분홍 진주 3알 |
| `compass` | symbol | 1024² → 512 | 뚜껑이 열린 **사각** 황동 나침반(원반 코인과 구분) |
| `seahorse` | symbol | 1024² → 512 | 산호색 해마, 세로 S자 |
| `pufferfish` | symbol | 1024² → 512 | 노란 가시 복어, 동그란 몸 |
| `crab` | symbol | 1024² → 512 | 주황 꽃게, 집게 활짝 |
| `jellyfish` | symbol | 1024² → 512 | 반투명 분홍 해파리(유리 질감 아님), 늘어진 줄 |
| `starfish` | symbol | 1024² → 512 | 주황 불가사리 |
| `shell` | symbol | 1024² → 512 | 민트 가리비 |
| `frame` | frame | 1024² → 1080 | 정면, 산호와 조개로 덮인 바위 아치. 마퀴(y 0–17%)에 보라 촉수 두 가닥이 양쪽 위에서 말려 내려옴, 받침(y 83–100%)은 모래와 작은 보물 더미. 창 **x 2–98%, y 19–81%(약 3:2 가로형)**, 사이드 레일 ≤ 1.5%. 고정 문장: "The reel window is clearly wider than tall (about 3:2 landscape proportion)… the window interior is pure #00FF00, nothing is drawn inside… the window nearly touches the left and right canvas edges." |
| `bg` | bg | 1024×1536 → 1080 | 정면, 햇살 드는 얕은 라군 동굴, 위에서 물결 빛 무늬, 산호·해초, 채도 낮춤(심볼이 묻히지 않게), `reelBackdrop` 포함. «no diagonal light beams» |
| `bgFreeSpins` | bg | 1024×1536 → 1080 | 정면, 동굴 안쪽 보물 방: 금화 더미가 빛나고 뒤쪽에 촉수만 보이게 몸을 만 크라켄(머리 없음), 따뜻한 금빛 |
| `thumb` | thumb | 1536×1024 → 640 | 크라켄이 촉수로 금화가 쌓인 세로줄을 감싸 안고 웃는 장면, 금화가 튀어 오름 |
| `coin-small` | prop | 1024² → 384 | 청록·은빛 보물 코인, 가운데 작은 진주 하나(글자 없음) |
| `coin-medium` | prop | 1024² → 384 | 금빛 보물 코인, 가운데 진주 세 알 |
| `coin-large` | prop | 1024² → 384 | 보라·루비 보물 코인, 가운데 큰 보석 |
| `treasure-top` | prop | 1024² → 512 | 뚜껑이 열려 금화가 넘치는 보물 상자(최고 보물 띠·정산 연출) |
| `tentacle` | prop | 1536×1024 → 1024 | 가로로 곧게 뻗은 보라 촉수 **한 가닥**(왼쪽 굵고 오른쪽 가늘게), 아래쪽에 연분홍 빨판 줄, 크로마 배경. `MeshRope` 텍스처용이라 휘어지지 않은 곧은 형태가 필수 |
| `wild-win` | sheet 3×3 @12fps | 1024² → 768 | 크라켄이 촉수를 흔들며 윙크 |
| `coin-win` | sheet 3×3 @12fps | 1024² → 768 | 금화가 제자리에서 반 바퀴 돌며 테두리 반짝(사선 쓸기 없음) |
| `crown-win` | sheet 3×3 @12fps | 1024² → 768 | 왕관 진주가 차례로 반짝 |
| `fs-enter` / `fs-exit` | 전환 클립(SeeDance) | 360×640, 3.0s, loop=1 | §10 |

**코드 드로잉이 나은 것(이미지 생성 없음)**

| 대상 | 방식 |
|---|---|
| 코인 금액 글자 | `coinFace.ts` RenderTexture 합성(굵은 둥근 글꼴 + 남색 외곽선) |
| 고정 테두리 | Pixi Graphics 링 + 잔물결 펄스 |
| 비코인 칸 어둡게 | 스프라이트 tint/알파(필터 없이) |
| 촉수 움직임 | `MeshRope` 경로 애니메이션(그림은 `tentacle` 한 장) |
| 거품·금화 파편 | 코드 입자(풀 재사용) |
| 보물 띠·리스핀 점 | DOM + CSS, 아이콘은 `props` 그림 @64 |
| 도움말 판 그림 | DOM 미니 격자 + 심볼 아이콘(§11) |

`celebration`(theme.json): `palette { core #ffe27a, edge #2ec4d6, glow #7b5cff80 }`, `particles { shapes ['coin','gem','spark'], symbols ['coin','starfish'], motion 'flip' }`, `rays { style 'halo' }`, `title { font 'rounded', weight 900, strokeColor '#10285ab3' }`. `sound: { "preset": "deepsea" }`.

### 8-3. 검수 체크 (지난 실패에서 나온 것)

| 교훈 | 대책 |
|---|---|
| 창 안을 칠하면 감지가 실패 | 알파 투명 영역 실측으로 `frameLayout.window` 확인(±1%), 430px에서 5열이 창에 맞는지 |
| codex 회수가 엉뚱한 그림을 집음 | 1~2장씩 생성, 매번 `pnpm --filter @tgslot/theme-gen contact games/kraken-cove`로 컨택트 시트를 열어 id ↔ 그림 1:1 확인 |
| 중단된 gen이 theme.json을 반쯤 비움 | 중단 뒤 `--reprocess`로 재작성, `pack:check` 0 오류 |
| 코인 «빈 면»에 무늬·글자가 들어옴 | 컨택트 시트 58px·28px 타일에서 코인 가운데가 비었는지 확인, 실패면 그 자산만 `--force` 재생성 |
| 사용량 한도 소진 | 로컬 SDXL로 대체하지 않고 멈춘 뒤 남은 목록 보고 |

---

## 9. 효과음·배경음 (`deepsea` 프리셋)

### 9-1. 효과음 레시피

| 이벤트 | 설계(합성) | 기존 프리셋과 다른 점 |
|---|---|---|
| 스핀 시작 | 거품 휘익: 대역 잡음 상승 + 짧은 거품 톡톡 4개 | candy·fruit의 팝 대신 물속 질감 |
| 릴 정지 | 물방울 똑: 사인 1200→420Hz 40ms + 짧은 고역 잡음 | 킥 구조 금지(SOUND_CHECK 교훈) |
| 코인 착지(기본) | 금속 «칭»: 비정수 배음 2.1k·3.3kHz, 80ms 감쇠 | |
| 리스핀 회전 | 낮은 소나 «핑»(880Hz 사인 + 2회 메아리) | 신규 |
| 코인 고정 | «철컥» 110Hz 짧은 몸통 + «칭». 라운드 안 고정마다 반음씩 올라감(최대 12단) | 신규. 진행감 |
| 카운터 리셋 | 소나 3음 상행(도·미·솔) | 신규 |
| 마지막 리스핀 | 60Hz 심장 박동 2타 | 신규. 긴장 |
| 촉수 감기 | 우웅: 톱니 80→160Hz 로우패스 슬라이드 + 거품 폭발, 이어 «띠링» 2배 확정음 | 신규. 게임의 얼굴 소리 |
| 보물(작은/중간/큰) | 종 화음 2/3/4음 쌓기, 단계마다 한 옥타브 위 장식 | |
| 최고 보물 | 짧은 팡파르(금관풍 톱니 3화음 + 심벌 잡음) | |
| 정산 틱 | 코인 1개당 짧은 «틱», 높이는 진행률 | 롤업 틱 레시피 재사용 |
| 작은·큰 당첨 / 피처 | 마림바풍 말렛 + 물방울 장식 | |

### 9-2. 배경음 (`bgmDeepsea.ts`)

- base: 96bpm, 장조 기반 믹솔리디안, 부드러운 패드 + 칼림바풍 플럭 리드 + 셰이커, 저음은 둥근 사인 베이스. «바닷속 보물 동굴»의 느긋한 들뜸.
- free(리스핀 중 변주): +2 반음, 16분 하이햇, 소나 아르페지오 대선율, 베이스 8분 오스티나토로 긴장.
- 클립 재생 중 덕킹(기존 규칙), 기본 꺼짐(설정에서 켬).

### 9-3. earshot 판정 (→ `docs/SOUND_CHECK.md` «kraken-cove 사운드» 절)

- 이벤트별 스템 렌더(기존 하네스) → `match`·`describe`·`measure`, 꼬리 −60dB 이하, 클리핑 0.
- candy·fruit의 같은 이벤트와 CLAP 코사인: **목표 ≤ 0.90**(candy↔fruit 0.91이 기존 기록). 못 미치면 수치를 적고 귀 판정 항목으로 넘긴다.
- BGM: base·free LUFS −30~−32, base↔free 코사인 ≤ 0.93, 믹스 SFX−BGM: 작은 당첨 ≥ +3dB, 코인 고정 ≥ +5dB.
- 문서에 **«수치는 참고값, 최종 귀 판정은 사용자 몫»**이라고 적는다.

---

## 10. 전환 클립 2편 (TRANSITION_DESIGN R1~R13)

발주: SeeDance 2.0 t2v, 9:16, 13초, 편당 $0.93. 2편 발주 + 실패 시 1편 재발주(최대 3편, $2.79). 스크립트는 `D:/park/tgslot-wt/_tools/vidgen-t2v.mjs`(없으면 candy 때처럼 `vidgen.mjs`에서 이미지 첨부·16:9 고정을 걷어 낸 변형을 그 위치에 만든다). 키는 `--env-file`로만. 컷 3.0s, 16fps/q60 애니메이션 WebP, `check:clips` 통과, `theme.json transitions`에 `opaqueMs`·`durationMs` 실측값.

### 10-1. 진입 — 금화가 파도처럼 쏟아진다

> 동굴 위쪽에서 금화가 거품 파도처럼 쏟아져 내려 **쌓이는 그 동작으로** 화면 전체를 덮는다. 덮인 뒤에도 금화가 구르고 반짝이며 거품이 오른다.

왜 이 게임인가: 라운드의 정체가 «코인을 모으는 것»이라 전환이 곧 규칙 예고다. 금화 더미는 구조적으로 불투명하고(R1), 계속 구르니 단색 정지로 굳지 않는다(R11). 규칙: R1·R2·R3·R4(손·사람·글자 금지, 금화는 «plain, no markings»)·R5·R7·R8(쏟아짐 = 덮임 한 동작)·R9(주어 «gold coins» 첫 문장)·R11·R12(stylePrefix 어휘·hex, negative의 photorealistic)·R13(동물 금지는 이 팩에서 뺀다 — 겪지 않은 실패이고 복귀 클립의 주어가 촉수다).

```
Vertical full-screen game transition effect, bright stylized 3D render, chunky soft vinyl-toy look with a subtle wet sheen, not photorealistic, premium casual mobile game art. A torrent of shiny plain gold coins pours down from the top of a sunlit lagoon-teal underwater cave in a bubbly wave. One continuous motion repeats: the coins cascade down and pile up thicker and thicker, tumbling over each other in that same pour until the whole frame is completely opaque edge to edge, corner to corner, a seamless heap of gold coins, holding fully covered for a beat while the coins keep tumbling, glinting and bubbles keep rising so the covered frame is never a flat still color, then the heap slides away downward and the teal cave shows through before the next pour. The coins pouring in and the frame being covered are one single motion, never separate steps. Each full cycle lasts about three seconds and repeats about four times across the clip. Lagoon teal #2ec4d6, sunny gold #ffc83d, coral pink #ff6f91 and kraken violet #7b5cff accents, soft light from above with rippling caustics. The coins are completely plain with no markings. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

### 10-2. 복귀 — 촉수가 금화 더미를 쓸어 걷는다

> 화면을 가득 채운 금화 더미를 보라 촉수 한 가닥이 **휘감아 쓸어 올리는 그 동작으로** 걷어 내며 밝은 라군 동굴이 드러난다.

왜 이 게임인가: 재미 장치가 «촉수가 감는다»다. 진입이 «쏟아져 쌓임»이니 복귀는 «감아 걷음»으로 방향이 다르다(R6, 역재생 아님). 촉수는 머리 없이 한 가닥만(얼굴·눈 없음). 첫 프레임부터 덮여 있으므로 `opaqueMs: 0` 후보.

```
Vertical full-screen game transition effect, bright stylized 3D render, chunky soft vinyl-toy look with a subtle wet sheen, not photorealistic, premium casual mobile game art. A single thick glossy kraken-violet tentacle with soft pale pink suckers sweeps through a dense heap of shiny plain gold coins that fills the frame completely, edge to edge, corner to corner. One continuous motion repeats: the tentacle curls in from the bottom edge, wraps around the heap and swirls it up and away off the top of the frame in a bubbly spiral, and that same sweep reveals a calm sunlit lagoon-teal underwater cave with coral and rippling caustic light, fully clear, then a fresh wave of coins pours back in and covers the whole frame corner to corner in complete opacity for a beat while the coins keep tumbling, before the tentacle sweeps again. The tentacle sweeping and the coins clearing are one single motion, never separate steps. While the frame is covered the coins keep moving, never a flat still color. Only one tentacle is ever visible, never a head, never eyes. Each full cycle lasts about three seconds and repeats about four times across the clip. Lagoon teal #2ec4d6, sunny gold #ffc83d, coral pink #ff6f91 and kraken violet #7b5cff, soft light from above. The coins are completely plain with no markings. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

### 10-3. 채택 기준

R1(덮임 구간에 뒤가 안 비침) · R11(정지 프레임 비율 ≈ 0%) · 사진 질감이 아닌 장난감 톤 · 촉수에 얼굴 없음 · 글자 없음. 진입 컷은 덮임이 0.5s 이상 유지되는 구간, 복귀 컷은 덮인 채 시작해 걷히는 구간. 실패 시 위 문장에서 «초근접, 더미가 프레임을 가득 채움»으로 1회 재발주(candy 2-7 사례).

---

## 11. 도움말 페이지 (`CoinRespinHelp.tsx`, 도움말 «코인 리스핀» 탭)

규칙은 도움말 페이지로만 설명한다(릴 위 설명 없음). 각 단계는 DOM 미니 판(5×3 작은 칸 + 심볼 아이콘)으로 그린다.

| 순서 | 그림 | 문구(ko) |
|---|---|---|
| ① 시작 | 코인 6개가 박힌 미니 판 | 코인이 6개 이상 뜨면 코인 리스핀이 시작돼요. 코인은 그 자리에 고정돼요. |
| ② 리스핀 | 점 ●●● → 새 코인 → ●●● | 리스핀은 3번. 새 코인이 하나라도 붙으면 다시 3번으로 채워져요. |
| ③ 촉수 감기 | 세로줄 3칸이 찬 판 + 촉수 + ×2 | 세로 한 줄 3칸을 코인으로 다 채우면 크라켄이 그 줄을 감아 숫자 코인 금액이 2배가 돼요. 줄마다 한 번. 보물 코인은 그대로예요. |
| ④ 끝 | 코인이 합계로 모이는 그림 | 리스핀이 0번이 되면 판 위 코인 금액을 모두 받아요. |
| ⑤ 보물 | 보물 4단 표(현재 베팅 금액으로 표시) | 작은 보물 ×20 · 중간 보물 ×50 · 큰 보물 ×200은 코인으로 나와요(한 라운드에 단계마다 한 번). 15칸을 다 채우면 최고 보물 ×1000을 더 받아요. |
| ⑥ 알림 | — | 보물은 이 게임의 상금이에요. 화면 위 허브 잭팟과는 따로예요. · 한 번에 받을 수 있는 최대 금액은 총 베팅의 2,000배예요. · 리스핀 중 어둡게 보이는 그림은 지급되지 않아요. |

그 밖의 탭: «배당표»(심볼 10종, 코인·와일드 설명), «라인»(20 라인을 점 패턴으로, 기존 컴포넌트). en 사전도 같은 키로 함께 넣는다. 390px에서 잘림 없음, 문구는 math.json 값을 읽어 채운다(하드코딩 금지).

---

## 12. 기능별 QA 확인표 (기능마다 1회)

디버그 프리셋으로 상황을 만들고 390×844·430×932(DPR 2) 헤드리스 크롬으로 찍어 PNG를 직접 연다. 시간 경과 QA는 하지 않는다.

> 통합 QA 결과(2026-11-26, 리드): 항목별 통과·근거는 `games/kraken-cove/CHECKLIST.md`. 사용자 귀 판정만 남았다.

**기본 게임**
- [ ] 코인 얼굴 금액이 서버 `coinBoard`와 같다, 착지 뒤 제자리에서 바뀌어 보이는 칸 0
- [ ] 라인 당첨이 선 없이 칸 강조로만 보인다
- [ ] 코인 4개 이상에서 남은 릴 감속(normal·quick), turbo·모션 축소는 꺼짐

**진입** (`coinRespin`)
- [ ] 코인 펄스 → 클립 진입 → 동굴 배경 → ●●● 순서, 진입 판 코인 = 서버 `entry`
- [ ] 진입 감기가 있는 판이면 클립이 걷힌 직후 촉수

**리스핀 진행**
- [ ] 빈 칸만 돈다, 고정 칸은 움직이지 않는다
- [ ] 새 코인: 툭 → 멈춤 → 고정 빛, 카운터 3으로 리셋 / 코인 없음: 점 하나 감소
- [ ] 리스핀마다 판 = 서버 `steps[i].grid`, 횟수 = `steps.length`
- [ ] 마지막 리스핀 느림 + «마지막!»
- [ ] 빈 그림(blank) 칸이 한 번도 보이지 않는다

**촉수 감기** (`columnWrap`)
- [ ] 두 칸 찬 줄 아래 촉수 끝 대기 → 완성 시 감기 → 숫자 ×2가 서버 `after`와 같다
- [ ] 보물 코인은 ×1, 같은 줄 두 번 감기 없음

**보물** (`treasure`)
- [ ] 보물 코인 그림·띠 점등이 단계와 맞다, 같은 단계 두 번 없음
- [ ] 띠 금액이 현재 베팅 × 배수

**15칸 채움** (`coinRespinFull`)
- [ ] 다섯 줄 모두 감긴 상태 → 최고 보물 연출 → 합계 = `coinWin + topWin`

**정산·종료**
- [ ] 코인이 하나씩 합계로, WinStrip(컨트롤 위) 금액이 단조 증가, 최종 = `respinWin`
- [ ] 빅윈 스킨은 정산 뒤 한 번만, 요약 팝업 없음, WinStrip 합계 = 서버 `respinWin`
- [ ] 복귀 클립 → 기본 배경, HUD 사라짐, 캔버스 리사이즈 0

**STOP·스킵**
- [ ] 리스핀 중 STOP 한 번 → 압축 재생(≤ 1.5s + 정산 0.6s), 금액 동일, 두 번째 탭 무시
- [ ] 압축 중에도 제자리 텍스처 교체 0

**새로고침**
- [ ] 리스핀 연출 도중 새로고침 → 잔액은 이미 반영, «이어 보기»로 같은 응답 재생(잔액 변동 없음)
- [ ] 앱을 닫았다 다시 열어도(10분 안) 이어 보기, 재생 중 스핀 버튼 잠김, STOP 한 번에 압축 종료
- [ ] 저장 막힌 환경(시크릿 등)에서도 오류 없이 평소 화면(재생 없음, 잔액 정상)

**멱등·공개**
- [ ] 같은 키 재전송 → 바이트 동일, 원장 1건
- [ ] 진입 스핀 시드 공개 → 재생 `totalWin`·`final`·리스핀 수 일치

**체험판**
- [ ] `build:demo` 결과에서 진입·리스핀·정산 1회

**도움말**
- [ ] 6단계 그림·문구가 math.json과 일치, ko/en 키, 390px 잘림 없음

**디버그**
- [ ] kraken에만 4종 노출(`freeSpins` 없음), 다른 게임은 409

**사운드·BGM**
- [ ] 고정음이 반음씩 오름, 촉수 소리, 마지막 리스핀 박동, earshot 수치 기록, 사용자 귀 판정 1회
- [ ] 리스핀 변주·클립 덕킹

**레이아웃·메모리**
- [ ] 430 셀 ≥ 76, 390 셀 ≥ 68, 코인 글자 ≥ 18px
- [ ] 라운드 10회 뒤 코인 얼굴 캐시 ≤ 64, 촉수 풀 ≤ 5, 활성 트윈 0(renderer `diagnostics()`)

**회귀**
- [ ] live 7종 스핀·프리스핀·연쇄·주문 라운드 정상, 골든 6팩 해시 동일

---

## 13. 위험과 대안

| # | 위험 | 대안 |
|---|---|---|
| K1 | 새로고침하면 리스핀 연출을 잃는다 | §4-5 연출 이어 보기. 결과·잔액은 이미 확정이라 손해는 없다 |
| K2 | 코인 금액 글자가 «릴 위 텍스트 금지»(UX 4차)와 충돌해 보인다 | 이번 요구가 «금액이 적힌 코인 심볼»을 직접 지정했다 — 금액은 피처의 핵심 정보다. 덧씌운 라벨이 아니라 심볼 얼굴(텍스처)로 그리고, 코인 밖(줄 번호·안내 문구 등)에는 여전히 글자를 쓰지 않는다 |
| K3 | 칸 독립 추정과 실제 스트립(코인 묶음)이 어긋나 진입률이 튄다 | 튜닝 1단계에서 진입률만 맞춘다. 묶음 길이(1~3) 분포가 손잡이 |
| K4 | 촉수 감기가 너무 흔해 특별함이 줄거나, 너무 드물어 안 보인다 | 진입 감기 20~30%·도중 감기 50~60%를 리포트로 고정. 리스핀 칸 스트립 q와 기본 묶음 길이로 조절. ×2는 유지 |
| K5 | σ가 커서 감사 표본이 1억을 넘는다 | 큰 보물 가중치↓·중간↑로 꼬리만 깎음(§5-5). 샤드 4 |
| K6 | `MeshRope` 촉수가 저사양에서 끊긴다 | 정점 수 ≤ 40, 풀 재사용, 모션 축소·turbo는 점멸판. 실패 시 3×3 스프라이트 시트 대체 |
| K7 | 다른 두 팀과 공용 파일 충돌(`ASSET_KINDS`, `SoundPreset`, 피처 유니온, 디버그 프리셋, i18n, GameScreen, `featureTriggerCount`) | 새 파일 위주, 공용 파일은 줄 추가만. 그림 종류는 hanbok과 같은 `'prop'`/`props`로 맞췄다. `featureTriggerCount`는 건드리지 않고 `coinAnticipation.ts`를 새로 둔다. GameScreen은 `CoinRespinLayer` 마운트 몇 줄, 스토어는 새 파일. DB 마이그레이션은 0 |
| K8 | codex가 코인 가운데에 무늬·숫자를 그린다 | 컨택트 시트 검수, 그 자산만 재생성. 최악이면 코인 빈 면을 코드로 덮는 원판(Graphics) |
| K9 | 촉수·크라켄이 무섭게 나온다 | stylePrefix의 비닐 장난감·밝은 톤, negative의 «dark horror, scary teeth», 와일드만 얼굴 허용 |
| K10 | 전환 클립에서 촉수에 머리·눈이 생긴다 | «only one tentacle, never a head, never eyes». 실패 시 1회 재발주(최대 3편) |
| K11 | 사운드가 candy·fruit와 같은 군으로 들린다(CLAP 0.9대) | 물방울·소나·금속 칭으로 재질을 바꿨다. 수치 못 미치면 귀 판정으로 넘긴다 |
| K12 | 홀드앤스핀 원조 상용 게임을 베꼈다는 인상 | 이름(코인 리스핀·보물·촉수 감기)·캐릭터·그림·연출 전부 새로. 보물을 «잭팟»이라 부르지 않는다. 장르 문법만 쓴다 |
| K13 | 리스핀 연출이 길어 지루하다(최악 46s) | 마지막 리스핀만 느리게, 나머지는 800ms. STOP 압축, turbo 26s. 일반 라운드 ≤ 20s 게이트 |
| K14 | `coinRespinFull` 디버그 탐색이 15s 락을 넘는다 | 공용 `SpinDebugRequestSchema.maxTries` 상한(20,000)은 그대로 두고 `debugSpin.ts` 안에서 이 프리셋만 내부 상한 200,000회로 올린다(20,000회로는 찾을 확률 약 54%). ≈ 1~2s 실측 테스트. 넘으면 시드 사전 탐색 픽스처로 대체 |
| K15 | 메모리: 코인 얼굴 텍스처 누수 | 라벨 키 LRU 64, 렌더러 파괴 때 전부 `destroy(true)`, `diagnostics()`로 QA |

### 13-1. 팀 레인과 일정 (한 팀: 리드 + 코어·연출·아트·사운드)

| 레인 | 소유 |
|---|---|
| L 리드(기획) | 계약 커밋(§4-3 타입·shared 스키마·`foldRespin`·`applyColumnWraps` 직접 구현), 문서, 통합·QA, 이미지 검수 |
| C 코어 | `slot-engine`, `shared`, `apps/api`, `tools/rtp-sim`, `games/kraken-cove/{math,manifest}.json`, `RTP_AUDIT` |
| P 연출 | `packages/renderer`, `apps/hub`(사운드 파일 제외) |
| A 아트 | `game-sdk`·`theme-gen`의 `'prop'` 종류(hanbok과 같은 정의), `games/kraken-cove/{art,theme}`, 썸네일, 전환 클립 |
| S 사운드 | `audioDeepsea.ts`, `bgmDeepsea.ts`, `audio.ts`·`bgm.ts` 한 줄씩, `SOUND_CHECK.md` 절 |

| 날 | 내용 |
|---|---|
| D0(반나절) | L: 골든 확인 → 계약(타입·스키마·순수 함수 2개·픽스처 응답·`math.json v0`) → typecheck |
| D1 | C: 스키마·`coinRespin.ts`·테스트 / P: `respin.ts` 계획·`coinFace`·HUD·띠 정적 / A: `'prop'` 종류 → 스타일 락(wild·coin 2장) → 심볼 / S: 레시피 초안 |
| D2 | C: API·디버그·rtp-sim 통계 → 파일럿 5M / P: `respinFx`·`tentacle`·이벤트·허브 배선(픽스처로) / A: frame·bg 2·prop 5장 / S: BGM |
| D3 | C: 튜닝 1~6 → 정식 감사(샤드 4) / P: STOP 압축·이어 보기·도움말·시드 공개 / A: 시트 3·썸네일·클립 2편 / S: earshot·문서 |
| D4 | L: 통합 e2e(390/430, 개발 스택 + 체험판) + §12 확인표 → `status: live` → QA_LOG |
| D5 | 여유분(재발주·재튜닝) |

임계 경로: **계약(D0) → `coinRespin.ts` → rtp-sim 통계 → 튜닝 → 정식 감사.** 연출은 픽스처 응답으로 엔진과 병렬 진행한다.

---

## 검수 반영 (기획 비평, 2026-11-26)

판정: **고쳐서 진행(revised)**. 피처 골격(코인 6개 진입 · 리스핀 3회 리셋 · 세로줄 촉수 감기 ×2 · 보물 4단 모델 안 · 응답 하나에서 다 풂)은 그대로 둔다. 아래만 바꿨다.

**검증한 것(바꾸지 않음)**

- §5-1 개략값을 독립 스크래치 시뮬레이션(칸 독립, c 0.118 · q 0.065, 30만 라운드)으로 다시 냈다: 진입 1/191, 피처 평균 49.4×(σ 95.0), 15칸 0.72%, 진입 감기 24.8%, 도중 감기 56.1%, 평균 리스핀 7.23(최대 24), 종료 코인 평균 9.25. 기획서 값과 맞는다. 피처 RTP는 이 금액표로 25.8이라 28.5까지 금액 가중치 보정이 필요하다는 기획서 설명도 맞다.
- 종료 척도 `M = 3×빈칸 + left`: 새 코인 k ≥ 1이면 `ΔM = −3k + (3 − left) ≤ −1`(left ≥ 1), 없으면 −1, 시작 ≤ 30 → 리스핀 ≤ 30. 맞다. 하드캡 40은 안전망, 도달 0 게이트도 맞다.
- 기존 필드 확인: `wild.excludes`·`round.maxWinCap`(`RoundConfigSchema`)·`paylineStyle`이 이미 있다. `coinRespin`이 없으면 `spinUnchecked`가 그대로라 골든 불변 주장이 선다.
- 감사 시간: fruit-fiesta 실측 2M 8.2s(≈4µs/스핀)로 보면 9천만 ÷ 4샤드 ≈ 2분. n* 8.2천만도 σ 추정과 맞다.
- 다른 신작과의 겹침: hanbok = 윷판 말판 + 갈림길, idol = 3겹 룰렛 + 응원봉 불빛. 코인 고정·리스핀·세로줄은 이 게임에만 있다. idol의 «불 켜진 칸 2배»와 «×2»라는 보상 꼴은 같지만 조건(그 스핀의 응원봉 수 vs 세로줄 완성)과 화면(룰렛 칸 vs 코인 얼굴)이 달라 그대로 둔다.

**바꾼 것과 이유**

| # | 무엇을 | 왜 |
|---|---|---|
| V1 | 영어 이름 `Kraken Cove` → `Kraken Treasure Cave`(§이름) | 웹 검색으로 Relax Gaming의 «Kraken's Cove»(2025, 5×3, 크라켄 와일드)를 확인했다. 실존 상용 게임 이름과 사실상 같다(사용자 취향 «이름은 새로»). Play'n GO «Octopus Treasure», Pragmatic «Release the Kraken»도 피하도록 적었다. 한국어 이름은 그대로 |
| V2 | 와일드 배당 줄(30/150/500) 삭제(§2-1·2-2·2-3) | 와일드가 릴 2·3·4에만 있는데 라인은 릴 1부터 센다 → 와일드로 시작하는 라인은 도달 0. 죽은 배당은 튜닝 손잡이를 흐리고 도움말 배당표에서 플레이어를 속인다 |
| V3 | 기본 게임 HUD 자리의 «코인 6개면 리스핀» 안내 문구 삭제, «판 채우기까지 N칸»은 빈칸 ≤ 3일 때만(§7-1) | 사용자 취향 «규칙은 도움말 페이지로». §1-2(빈칸 3칸 이하)와 §7-1(항상)이 서로 달랐던 것도 맞췄다 |
| V4 | `RespinSummary` 종료 팝업 삭제(§6-6·7-2 S6·7-5·12) | 정산 → 빅윈 → 요약 팝업 → 복귀 클립으로 마무리 화면이 넷이라 «지루한 반복». 평균 49×면 거의 늘 빅윈 등급이 붙는다. 합계는 WinStrip(컨트롤 위)에 남는다. 컴포넌트 하나·라운드 2.5s를 덜었다 |
| V5 | 시간 예산 표 갱신(§7-4): normal ≈ 16s(게이트 ≤ 18s) 등 | V4 반영. 빅윈은 candy R2처럼 예산 밖임을 명시. 구성(리스핀 7.2회·«1회 남음» 1.5번·클립 6s·펄스 1s)을 적어 재계산 가능하게 했다 |
| V6 | 그림 종류 `'ui'`/`ui` → `'prop'`/`props`(§0 K14·6-4·6-5·8-2·13) | hanbok 기획서가 같은 목적(심볼이 아닌 그림)으로 `'prop'` + theme `props`를 이미 정했다. 다른 이름이면 병합 때 유니온·스키마·theme-gen이 두 벌 생긴다. 같은 이름이면 «같은 줄 추가»라 충돌이 사라진다 |
| V7 | `featureTrigger(math)` 리팩터 철회 → 새 파일 `renderer/src/coinAnticipation.ts` + 호출부 한 줄(§0 K11·6-1·6-5) | 공용 `featureTriggerCount`(엔진·렌더러)는 hanbok이 한 줄을 더하는 함수다. 시그니처를 바꾸면 병합 충돌이 확실하다. 코인 기대감 규칙(3릴 뒤 ≥4, 4릴 뒤 ≥5)은 스캐터 규칙(trigger−1)과 달라 어차피 별도 함수가 맞다 |
| V8 | 허브 로직을 `CoinRespinLayer.tsx`·`store/coinRespin.ts` 새 파일로(§6-6) | `GameScreen.tsx`·`store/game.ts`는 세 팀이 함께 고친다. 공용 파일은 마운트 몇 줄만 |
| V9 | 이어 보기 저장소 sessionStorage → localStorage(게임별 키), 재생 중 스핀 잠금·STOP 압축, 저장 막힘 때 «마지막 판 토스트» 삭제(§4-5·12) | 텔레그램 미니앱은 닫았다 열면 새 웹뷰라 sessionStorage가 빈다. 저장이 막히면 마지막 판을 가져올 서버 경로가 없으니(`GET /state`는 리스핀을 모른다) 약속할 수 없는 동작이었다. 응답 전 새로고침은 live 7종과 같다고 명시 |
| V10 | `coinFormat` 언어별 표기(ko «만», en «K/M»), 보물 띠도 같은 표기(§6-6·7-1) | 기본 언어가 한국어라 `20K`보다 `2만`이 바로 읽힌다. 390px 셀(71px)의 80% = 57px에 5글자 이하로 들어가는지 적었고, 베팅 1000의 최고 보물(1,000,000)이 99px 칩에 한 줄로 들어가게 했다 |
| V11 | K2 위험 재서술(§13) | 이번 요구가 «금액이 적힌 코인»을 직접 지정했다. «거부되면 금액을 없앤다»는 대안은 요구와 어긋나 지웠다 |
| V12 | K14 `coinRespinFull` 탐색: 공용 `maxTries` 상한 20,000은 그대로, `debugSpin.ts` 안에서만 200,000 | 공용 스키마를 넓히지 않는다. 20,000회로는 1/26,000 사건을 찾을 확률이 약 54%라 내부 상한이 필요한 이유를 적었다 |
| V13 | 참조 번호 수정(§0 K2 → §2-2, K16 → §13-1) | 오기 |

**리드에게 남기는 것**

- 병합 때 `deepsea` 효과음·BGM을 hanbok·idol의 새 프리셋과도 earshot 코사인으로 한 번 더 비교한다(지금은 상대가 없어서 candy·fruit만 비교 대상).
- 범위: 5레인 4.5~5일은 빡빡하지만 V4·V6·V7·V8로 공용 파일 수정과 컴포넌트를 줄였다. 일정이 밀리면 줄일 순서는 ① `crown-win` 시트 → ② 촉수 `MeshRope`를 스프라이트 상승·회전으로(§13 K6 대안) → ③ `treasure` 디버그 프리셋(`coinRespin` 탐색으로 대체).


---

## 구현 계약 (코어 레인 완료, 2026-11-26)

엔진·수학·공용 계약·API·감사까지 구현했다. 화면(렌더러·허브 UI)·아트·사운드는 이 절의 계약만 보고 붙이면 된다.
기획서와 달라진 값은 C-6에 모았다.

### C-1. 엔진 (`packages/slot-engine`)

| 파일 | 내용 |
|---|---|
| `src/coinRespinSchema.ts` (새) | `CoinRespinSchema`·`CoinValueEntrySchema`·`checkCoinRespin`·`coinRespinGrowthBound` |
| `src/coinRespin.ts` (새) | `drawCoin` · `assignCoinValues` · `toCoinBoard` · `boardCells` · `applyColumnWraps`(순수) · `runCoinRespin` · `foldRespin`(순수) · `resolveCoinRespinSpin` |
| `src/schema.ts` | `coinRespin: CoinRespinSchema.optional()` + superRefine 끝에 `checkCoinRespin` 한 줄 |
| `src/spin.ts` | `resolveSpin`에서 `math.coinRespin`이면 `resolveCoinRespinSpin`으로 분기(연쇄 분기 바로 아래). 없으면 기존 경로 그대로 → 골든 6팩 해시 동일 |
| `src/types.ts` | `TreasureTier`·`CoinCell`·`ColumnWrap`·`RespinStep`·`RespinOutcome`·`CoinBoardTrigger`·`CoinRespinTrigger`, `SpinResult.respinWin?` |
| `src/analytic.ts` | `isAnalytic`: `coinRespin`이 있으면 false(몬테카를로 전용) |
| 테스트 | `coinRespin.test.ts`(14) · `coinRespin-schema.test.ts`(10) |

스키마가 막는 것: `cascade`·`cluster`·`orderRound`·`scatter.freeSpins`·`mutations`와 동시 사용, 코인의 라인 배당, 와일드의 코인 대체(`wild.excludes`에 코인 필수),
트리거 > 칸 수, `hardCap < respins × (칸 − trigger + 1)`, 리스핀 칸 스트립의 릴 수 불일치·코인 0개·전부 코인·와일드/스캐터 칸, `max q × (칸 − trigger) ≥ 1`,
보물 단계 중복, 숫자 코인 0종, `small < medium < large < top` 위반, 모든 베팅 레벨에서 `금액 × 베팅`(숫자 코인은 촉수 배수까지)이 정수가 아님, 촉수 배수 < 2·비정수.

**RNG 소비 계약** (`seed:nonce` 하나로 라운드 전체가 재생된다)

```
① 릴 정지 5회                nextInt(strip[reel].length), 릴 0→4
② 기본 판 코인 금액          코인 칸마다 1회, 릴 0→4 · 각 릴 안에서 행 0→2
                             pickWeighted(금액표 − 판에 이미 있는 보물 단계)  (키는 금액표 순번 3자리)
③ [진입 시] 리스핀 k = 1..   고정 안 된 칸마다(릴 0→4 · 행 0→2) nextInt(respinStrips[reel].length) 1회
                             → 코인이면 금액 1회(②와 같은 규칙, 이번 리스핀에 먼저 붙은 보물도 제외)
   촉수 감기·종료·정산 0회
④ [API] 허브 잭팟 판정 1회   (기존 그대로, 항상 마지막)
```

비진입 스핀 = `5 + 코인 수`, 진입 스핀 = `5 + 코인 수 + Σ(리스핀마다 빈칸 수 + 새 코인 수)` (테스트가 고정).

### C-2. 응답 계약 (`packages/shared` → `SpinResponse`)

- `respinWin?: number` — 진입 스핀에만. `totalWin`에 이미 들어 있다. `totalWin = Σ wins[].win + respinWin`.
- `features[]` 순서: (`scatterWin`) → `coinBoard` → `coinRespin` → (`winCapped`). 프리스핀 상태는 없다(`freeSpins: null`).

| 피처 | 언제 | 필드 |
|---|---|---|
| `coinBoard` | 기본 판에 코인이 1개 이상(유료 스핀의 약 84%) | `cells: CoinCell[]` (릴 → 행 순서). 금액 얼굴용. 진입 스핀이면 `coinRespin.entry`와 같다 |
| `coinRespin` | 코인 ≥ 6 | 아래 표 |
| `winCapped` | 상한(총 베팅 2,000×)에 잘렸을 때만(감사 0건) | `requested`·`granted`·`cap` (코인) |

`CoinCell = { pos: [reel, row], kind: 'bet' | 'treasure', value, tier?, amount }`. `value`는 총 베팅액 배수(그 시점의 촉수 감기 반영),
`amount = round(value × totalBet)` 코인, 보물이면 `tier: 'small' | 'medium' | 'large'`. 키 순서는 늘 `pos, kind, value, tier?, amount`.

`coinRespin` 필드:

| 필드 | 뜻 |
|---|---|
| `entry: CoinCell[]` | 진입 판 코인, **진입 감기 전** 금액 |
| `entryWraps: ColumnWrap[]` | 진입 판에서 이미 찬 줄의 감기(왼쪽 줄부터). `{ reel, before[3], after[3] }`, 행 0→2 금액(코인). 보물 칸은 before = after |
| `steps: RespinStep[]` | 리스핀마다 `{ index, grid[row][reel], newCoins, wraps, left }`. `grid`의 고정 칸은 `'coin'`, 빈 칸은 그 리스핀에 뽑힌 심볼(하위 4종 또는 코인 — **빈칸 심볼 없음**). `newCoins`는 이번에 붙은 코인(**이번 감기 전** 금액, 릴 → 행 순서). `wraps`는 이번 리스핀 뒤 감긴 줄(왼쪽부터). `left`는 이 리스핀 뒤 남은 횟수(새 코인이 있으면 3) |
| `final: CoinCell[]` | 끝난 판 코인 전부(감기 반영, 릴 → 행 순서). 정산 때 날아가는 순서로 쓰면 된다 |
| `full` | 15칸 채움 |
| `coinWin` / `topWin` / `win` | 숫자+보물 코인 지급 / 최고 보물 지급 / 합(= `respinWin`). 전부 캡 적용 후 코인 |
| `capped` / `hitHardCap` | 상한에 잘림 / 하드캡 40 도달(구조상 0) |

재생 등식: `foldRespin({ reels, rows }, feature)`(엔진 export, 순수)가 `final`과 같다. 진행 중 판의 코인 합(`coinTotal`)은 `entry`에 `entryWraps`를 입히고
스텝마다 `newCoins`를 얹은 뒤 `wraps.after`로 덮어 가며 더하면 된다(`foldRespin`과 같은 순서).
최악(리스핀 30회·15칸·감기 5줄·최대 베팅) 피처 JSON은 12KB 미만(shared 테스트), 실제 응답 전체는 4~6KB(브라우저 QA 실측).

**렌더러 이벤트(§6-5)와 데이터 매핑**: `respinStep` ← `steps[i]`(`newCoins`·`left`, `total = steps.length`), `columnWrap` ← `entryWraps`·`steps[i].wraps`의 `before`→`after`,
`respinCollect` ← `final` 순서, `respinEnd` ← `coinWin`·`topWin`·`full`. 기대감 규칙(릴 3 뒤 코인 ≥ 4, 릴 4 뒤 ≥ 5)의 실측 발생률은 2.07%(목표 ≤ 3%).

### C-3. API (`apps/api`)

- `games/engineSpin.ts`: `toSharedFeature`에 `coinBoard`·`coinRespin` 명시 분기(`never` 검사 유지), `toSharedCoinCell`(키 순서 고정) export.
- `routes/games.ts`: `respinWin`을 저장된 `coinRespin` 피처의 `win`으로 조립해 싣는다(`orderWin`과 같은 방식). 리스핀 결과는 `rounds.features`(jsonb)에만 저장 → **DB 마이그레이션 0건**.
- 멱등 재전송: 저장된 피처를 그대로 돌려준다(재실행 없음). 메모리 레포에서 바이트 동일(`debug` 블록 제외) 테스트 통과. Postgres jsonb는 키 순서를 바꾸므로 드리즐 레포의 재전송은 기존 피처와 같은 수준(값 동일)이다.
- 시드 공개 `GET /rounds/:id/seed`: 변경 없음. `spin(math, { totalBet }, createSeededRng(seedInput))`가 `totalWin`·`coinRespin.final`·`steps.length`까지 같다(테스트). 허브 `handleRevealSeed`의 `totalWin` 비교가 리스핀까지 그대로 검증한다.
- `GET /games/:id/state`: 변경 없음. 리스핀은 서버 상태를 남기지 않는다 → 새로고침 뒤 연출은 §4-5(허브 `localStorage` 이어 보기) 몫. 잔액은 응답 시점에 이미 확정이다.
- 테스트 `routes/coinRespin.test.ts`(8): 진입 응답 모양·원장 1건, 멱등 재전송, 시드 공개 재생 + 잭팟 판정이 리스핀 뒤 마지막 1회, 프리셋 4종, 다른 게임 409, 비진입 응답.

### C-4. 디버그 프리셋

| 이름 | 조건 | 비고 |
|---|---|---|
| `coinRespin` | 진입 | 실측 90~140회 탐색 |
| `columnWrap` | 리스핀 **도중** 감기 1회 이상 | 진입 감기만 있는 판은 제외 |
| `treasure` | 끝난 판에 보물 코인 1개 이상 | |
| `coinRespinFull` | 15칸 채움 | 서버가 `max(요청 maxTries, 200,000)`까지 탐색(`COIN_RESPIN_FULL_MAX_TRIES`). 실측 24,382회, 1초 안팎 |
| (기존) `bigWin` | 총 베팅 10배 이상 | 큰 결과 강제는 이것과 `coinRespinFull` |

- 코인 리스핀이 없는 팩에 4종을 보내면 `409 DEBUG_NO_MATCH`. 기존 `lose`·`win`은 피처(`coinBoard` 포함)가 없는 스핀만 고르므로 kraken에서는 코인 0개 판이 나온다.
- 허브: `lib/debugPreset.ts presetsFor`가 `coinRespin` 팩에 4종을 붙이고 `freeSpins`를 뺀다. `DebugPanel` 라벨 + i18n 키 `debugPresetCoinRespin`·`debugPresetColumnWrap`·`debugPresetTreasure`·`debugPresetCoinRespinFull`(ko·en 끝에 추가). 체험판은 기존대로 디버그 스핀이 꺼져 있다(400).

### C-5. 수치 결과 (정식 감사 `docs/RTP_AUDIT_kraken-cove.md`, 9천만 스핀, 시드 42, 4샤드, 13/13 통과)

| 지표 | 결과 | 목표 |
|---|---|---|
| RTP | **94.499%** (95% CI ±0.172%p) | 94.5 ± 0.5, 반폭 ≤ 0.2 |
| 잭팟 포함 | 95.999% | 96.0 ± 0.5 |
| 몫(표본 분해) | 라인 65.98 + 리스핀 28.77 (숫자 12.43 · 촉수 보너스 5.10 · 보물 7.10 · 최고 4.14) | 66.0 + 28.5 |
| 적중률 | 27.77% | 27% |
| 진입 | 1/178.7 | 1/185 ± 15% |
| 피처 평균 / σ / 최대 | 51.4× / 96.2× / 1,343× | 40~60× |
| 평균 리스핀 / 최장 | 7.25 / 25 (구조상 30, 하드캡 도달 0) | 6~8 |
| 종료 코인 / 15칸 | 9.25 / 0.74% | 9~10 / 0.5~1.0% |
| 진입 감기 / 도중 감기 | 26.4% / 56.2% | 20~30 / 50~60 |
| 보물 등장 (작은/중간/큰) | 25.2 / 8.4 / 1.73% | 25 / 8 / 1.7 |
| winCapped | 0 | 0 |
| σ̂ → n* | 8.33 → 80.6M (`auditSpins` 90M) | |
| 지급 상한 | 2,000× (`round.maxWinCap`) | |

빠른 재측정 `pnpm --filter @tgslot/rtp-sim run tune kraken-cove --spins 2000000 --shards 4`(약 5초), 정식 `run audit kraken-cove --shards 4`(약 6분).
감사 도구: `tools/rtp-sim/src/audit/coinRespinStats.ts`(새, 통·리포트·게이트 5종), `sampleDistribution`·`types`·`compute`·`report`·`index`·`tune-cli`에 코인 리스핀 분기, `audit/coinRespin.test.ts`(2).

### C-6. 기획 대비 바뀐 것

| 항목 | 기획 | 구현 | 이유 |
|---|---|---|---|
| 배당표 | §2-3 초안 | 약 3~5배(`games/kraken-cove/README.md` 표) | 초안으로는 라인 RTP 16%. 선형 배율 + 4·5연속 비중 확대로 66% / 적중률 27.8% |
| 숫자 코인 가중치 | ×1 4000 · ×2 2500 | ×1 2750 · ×2 3750 | 피처 RTP 28.5 맞춤(§5-3의 6단계) |
| 와일드 수 | — | 릴 2·3·4에 4개씩 | 적중률 25% → 27.8% |
| 진입 감기 손잡이 | 코인 묶음 1~3 | 3칸 묶음은 릴 2에 하나뿐 | 3칸 묶음이 릴마다 있으면 진입 감기가 60~80%로 치솟는다 |
| 리스핀 칸 스트립 | 200칸, 코인 13 | 그대로(코인 고르게 흩음, 하위 4종) | |

### C-7. 남은 것 (다른 레인·리드)

- 아트 레인: `thumb.webp`·`theme/`·`art/prompts.json`이 없어 `pnpm pack:check`가 kraken-cove 썸네일 **오류 1건**을 낸다. 서빙 로더·체험판 번들도 이 팩을 건너뛴다(hidden이라 부팅은 막지 않는다).
  그래서 저장소 그대로는 개발 스택·체험판에 이 게임이 안 뜬다. 코어 QA는 저장소 밖 `GAMES_DIR`(status live + 임시 테마)로 API를 띄워 브라우저로 했고, 체험판은 같은 Hono 앱을 체험판 설정(메모리 레포, 디버그 꺼짐)으로 프로세스 안에서 돌려 확인했다.
- `game-sdk/validate.ts`의 `props`(coin-small/medium/large·treasure-top·tentacle) 필수 검사(§6-4)는 아트 레인 몫으로 남겼다.
- 허브 연출(§4-5 이어 보기, 코인 얼굴, HUD, 시드 공개 비교 보조)은 연출 레인 몫. 지금 허브는 새 피처를 받아도 깨지지 않고 합계(`totalWin`)로 빅윈만 띄운다(테마가 없으면 렌더러 설정이 실패하고 대체 문구가 뜬다).
