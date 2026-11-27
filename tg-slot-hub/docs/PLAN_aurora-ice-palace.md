# aurora-ice-palace (오로라 얼음 궁전, 가제) 구현 계획

작성일 2026-11-27 · 기획 담당(팀장) · 대상: `tg-slot-hub` 신작 3종 중 하나(5×3이 아닌 새 판)
정본으로 삼은 문서: `docs/research/PRAGMATIC_FORMATS.md`(추천 형태 3번), `docs/WAVE2_DESIGN.md` §10 I1(비대칭 고정 그리드)·§4-4(가변 높이 셀 크기)·§3-4(종료 규칙), `docs/GAME_CATALOG.md` §4(종료·발산 방지 규칙, MC 감사 게이트), `docs/research/IMMERSION_HOOK_AUDIT.md`(몰입·후킹 점검), `docs/PLAN_candy-cluster-pop.md`(구성 모범), `docs/TRANSITION_DESIGN.md` §1(R1~R13)·§2-7, `games/_template/HOWTO.md` §3-d·§3-e·§6.

**한 줄.** 가운데가 가장 긴 마름모 판(3·4·5·4·3칸)에서 **가운데 릴부터 양옆으로** 같은 그림이 이어지면 맞는다. 프리스핀에서는 가장 큰 당첨 그림이 **얼어붙어 판 위로 번지고**, 얼린 칸 수만큼 «얼음 보너스»를 받는다.

이 문서는 코드를 쓰지 않는다. 수치는 근사 시뮬레이션(§5-2) 결과이고, 확정은 `rtp-sim` 감사가 한다.

---

## 0. 결정 요약

### 0-1. 보너스 장치 후보 3개

형태(마름모 3-4-5-4-3 + 가운데부터 지급)는 고정이다. 그 위에 얹을 «이 게임만의 장치»를 셋 비교했다.

**후보 1 — 얼려 두기 프리스핀 (채택)**
- 플레이 경험: 프리스핀 한 판이 맞으면 그중 **가장 큰 당첨 그림 하나**가 얼음에 갇힌다. 나머지 칸만 다시 돈다. 같은 그림(또는 와일드)이 새로 나오면 그 칸도 언다. 새로 언 칸이 없을 때까지 반복한 뒤, **얼린 칸 수**를 보너스표에 대 지급한다. 15칸을 넘기면 오로라가 한 칸 밝아져 남은 판의 얼음 보너스 배수가 오른다.
- 다르게 느껴지는 점: 매 다시 돌리기마다 «곰 하나만 더»를 기다린다. 마름모 가운데에서 시작한 얼음이 양 끝으로 번지는 것이 그대로 진행도다.
- 비용: 엔진 중간(칸 단위 재추첨 루프, kraken 코인 리스핀과 같은 RNG 관례). 렌더러 중간(칸별 회전·얼음 덮개는 코드 드로잉).
- RTP 위험: 낮음~중간. 보너스는 **유한 표 × 유한 배수**라 선형 손잡이가 있다(§5-3).

**후보 2 — 기본 게임 당첨마다 얼음 리스핀**
- 플레이 경험: 기본 게임의 모든 당첨이 위 규칙으로 번진다.
- 기각 이유: 점검(`IMMERSION_HOOK_AUDIT.md` §2.2)이 «당첨 연출이 금액과 무관하게 5초»를 이미 지적했다. 적중률 35% 게임에서 당첨마다 리스핀이 붙으면 리듬이 무너진다. 기본 RTP와 피처 RTP가 한 손잡이에 묶여 튜닝도 어렵다.

**후보 3 — 얼음 녹이기 판(칸이 얼음에 덮여 있고 당첨이 주변 얼음을 녹여 배수 칸을 드러냄)**
- 기각 이유: «판이 넓어지는/드러나는» 진행은 greenhouse-garden(자라는 격자) 축과, «칸 배수»는 volcano-forge(배율) 축과 겹칠 위험이 크다. 칸 배수 연쇄는 candy·Sugar Rush 계열이라 새로움도 낮다.

| 후보 | 재미·새로움 | 430px 판독성 | 엔진 비용(높을수록 쌈) | 수학 튜닝 용이 | 다른 신작과 안 겹침 | 합계 |
|---|---:|---:|---:|---:|---:|---:|
| 1 얼려 두기 프리스핀 | 5 | 5 | 3 | 4 | 5 | **22** |
| 2 기본 게임 얼음 리스핀 | 3 | 4 | 3 | 2 | 5 | 17 |
| 3 얼음 녹이기 판 | 4 | 3 | 2 | 2 | 2 | 13 |

### 0-2. 왜 «얼린 칸 수» 보너스인가 (가장 비싸게 배운 결정)

처음 안은 «얼림이 끝난 판을 가운데부터 길로 다시 지급»이었다. 근사 시뮬레이션에서 이 안은 **피처 몫만 1,000%p를 넘었다.** 얼린 그림이 릴마다 쌓이면 길 수가 곱으로 불어나기 때문이다(4×5×4… 최대 720길). 리스핀 스트립 밀도를 낮춰도 빈칸 심볼을 쓸 수 없어(사용자 규칙) 막을 수 없었다.

그래서 피처 지급을 둘로 나눴다.
1. 처음 착지한 판의 당첨은 평소 규칙대로 지급한다.
2. 얼림이 끝나면 **얼린 칸 수 × 그림 등급**의 보너스표로 한 번 더 지급한다. 길 수 폭발이 없고, 표가 **선형 손잡이**다(표를 2배 하면 보너스 몫도 정확히 2배).

화면에서도 이쪽이 읽힌다. «곰 12칸 → ×11» 하나만 보면 된다.

### 0-3. 다른 게임과 겹치지 않는 점

| 게임 | 판 | 핵심 동사 | 이 게임과 다른 점 |
|---|---|---|---|
| candy-cluster-pop | 6×5 클러스터 | 맞은 칸이 **사라지고** 위에서 떨어진다 | 여기는 맞은 칸이 **남고** 나머지가 돈다. 연쇄·사다리 없음 |
| kraken-cove | 5×3 라인 | 코인이 고정되고 리스핀 횟수가 3으로 **리셋**, 코인 값 합산 | 여기는 **그림 하나**가 번지고, 새로 언 칸이 없으면 바로 끝난다. 칸 값이 없고 칸 **수**로 지급 |
| magi-stella(계획) | 5×4 | 스티키 와일드가 판을 넘어 남는다 | 여기는 얼음이 **그 판 안에서만** 번지고 다음 판 전에 녹는다 |
| volcano-forge(다른 팀, 기획서 확인) | 6×5 위치 무관(8개 이상) + 낙하 연쇄 | 새로 떨어진 칸의 **불씨**가 판 밖 화로 줄에 쌓여 연쇄 지급에 곱해지고, 화로 칸 4개가 차면 합계 ×2. 프리스핀 동안 합계 유지 | 연쇄·낙하 없음, 판 고정, 지급은 «길» 규칙. 배율은 «오로라 4단» 하나뿐이고 **얼음 보너스에만** 곱한다(길 지급에는 안 곱함). 쌓이는 단위가 불씨 개수가 아니라 «한 판에 15칸 이상 얼림» 달성이다(§13 K2 대안 있음) |
| greenhouse-garden(다른 팀, 기획서 확인) | 4×4 → 8×8 자라는 클러스터 판 | 판이 자라며 열린 화분에서 나온 **씨앗 배율**이 칸 안에서 커진다 | 판은 **절대 안 변한다**(WAVE2 I1의 «비대칭 고정 그리드»). 칸 안 배율 없음 |

두 팀 기획서(new-a·new-b 작업 폴더)를 검수 때 대조했다. 세 신작 모두 프리스핀에서 «무언가가 커지는» 진행을 갖는 것은 같다 — 그래서 이 게임은 배율이 아니라 **얼린 칸 수(판을 채우는 그림)**를 진행의 주인공으로 두고, 배율은 보조로 둔다. 리드가 병합 때 셋이 배율로 겹친다고 보면 §13 K2(15칸 돌파 = 프리스핀 +2회)로 바꾼다.

---

## 1. 컨셉과 «왜 재밌나»

### 1-1. 한 줄 컨셉

북극 밤하늘의 오로라 아래, 얼음 결정 모양의 마름모 판. 가운데 기둥에서 시작한 그림이 양 날개로 이어지면 맞고, 프리스핀에서는 맞은 그림이 얼어붙어 궁전 전체로 번진다. 19칸을 전부 얼리면 «궁전 완성».

### 1-2. 순간마다 플레이어가 기대하는 것

| 순간 | 화면 | 플레이어가 손에 땀을 쥐는 이유 |
|---|---|---|
| 기본 판 회전 | 릴이 **가운데 → 안쪽 둘 → 바깥 둘** 순서로 멈춘다 | 가운데(5칸)가 먼저 서면 «맞을 수 있는 그림 후보»가 바로 보인다. 안쪽 릴이 그 그림을 받아 주는지, 바깥 릴까지 이어지는지(3→4→5릴)를 두 박자에 걸쳐 본다. 좌→우 정지보다 기대가 두 번 생긴다 |
| 구슬 2개 착지 | 바깥 릴 감속 + 낮은 바람 소리 | 진짜 결과로만 발동하는 기대감(점검 §2.3 원칙 유지) |
| 피처 진입 | 서리가 화면 가장자리에서 자라 덮는다(클립) | 규칙 예고: «얼린다» |
| 프리스핀 착지 | 당첨이 있으면 가장 큰 그림이 얼음에 갇힌다 «곰 5칸» | 어떤 그림이 얼었느냐가 곧 이번 판의 천장이다(곰·올빼미·여우가 얼면 기대가 커진다). 이 기대가 살려면 상위 그림이 자주 얼어야 한다 → 얼림 대상 등급 비율을 튜닝 목표로 고정(상 ≥ 20%, 하 ≤ 55%, §5-1) |
| 다시 돌리기 | 얼지 않은 칸만 돈다. 새 곰이 나오면 «쩡» 하고 언다. 위쪽 띠의 칸 수가 6·9·12·15·18 눈금을 넘는다 | **«한 칸만 더»**. 다음 눈금까지 남은 칸 수가 띠에 늘 보인다. 새로 언 칸이 없으면 끝이라, 매 다시 돌리기가 생사가 걸린 한 번이다 |
| 15칸 돌파 | 오로라 띠가 한 칸 밝아진다(×1→×2→×3→×5) | 이번 판 보너스부터 배수가 오른다. 남은 판 수가 많을수록 값지다 → 라운드 앞쪽 판에도 의미가 생긴다 |
| 19칸 전부 | «궁전 완성» 연출, 등급별 최고 보너스(곰 ×220 × 오로라) | 드물지만(얼림의 약 0.4%) 판 전체가 하나의 얼음 결정이 되는 그림이 머리에 남는다 |
| 라운드 종료 | 결과 화면: 베팅의 몇 배, 가장 많이 얼린 판, 오로라 최종 단계 | 점검 C2(«베팅의 ×N», 라운드 최고 판)를 처음부터 반영 |

### 1-3. 점검 지적 사항을 처음부터 피하는 설계

| 점검 지적(`IMMERSION_HOOK_AUDIT.md`) | 이 게임의 처리 |
|---|---|
| §2.1 무엇을 노려야 하는지 없음 → kraken 보물 띠가 좋은 사례 | 기본 게임 마퀴 자리에 «오로라 구슬 3개 → 얼려 두기 프리스핀 8~12회» 띠를 늘 둔다(A7). 피처 중에는 같은 자리가 얼음 칸 수 띠가 된다 |
| §2.2 베팅 미만 당첨도 5초 축하(LDW) | 공용 A3(배수별 단계 연출)를 전제로 한다. 이 게임은 1배 미만 당첨에 얼음 소리·빛을 쓰지 않는다(§9). 튜닝 목표에 «베팅 미만 당첨 비율»을 넣는다(§5) |
| §2.3 기대감은 실제 결과로만 | 가운데 먼저 정지는 정지 **순서**만 바꾼다. 결과·시간 예산은 그대로다. 구슬 기대감도 실제 착지 수로만 |
| §2.4 보너스 결과 팝업이 초라함 | 테마 스킨 결과 화면(§7-5) |
| §2.5 보너스까지 거리(1/176~1/221은 10~13분) | 목표 진입 **약 1/160**(§5-1). 기본 베팅 50 기준 10,000코인으로 200판 → 보수 계산으로 한 번도 못 볼 확률 약 29%(당첨 환급 무시), 실제로는 훨씬 낮다. 공용 C1(진행 미터)이 들어오면 구슬 수집으로 연결할 자리(마퀴 띠)를 남긴다 |
| §2.4 승리 체감 | 피처 평균 약 38배(목표, 근사 40배), 라운드 중앙값 약 30배, 10배 미만 라운드 약 9%(§5-2). 얼음 보너스는 판마다 숫자가 **곱셈식으로** 보인다(«12칸 ×11 × 오로라 ×2 = 22배») |

---

## 2. 그리드·페이 방식·심볼·배당

### 2-1. 판

| 항목 | 값 |
|---|---|
| 릴 | 5개, 높이 **3 · 4 · 5 · 4 · 3**(19칸). 판은 절대 안 변한다 |
| 표시 | 릴마다 세로 가운데 정렬(높이 4 릴은 반 칸 내려앉아 마름모가 된다) |
| 데이터 | `rows = 5`(최대 높이), `reelHeights = [3,4,5,4,3]`. 릴 r은 행 `0..h_r−1`만 쓴다(위로 붙여 저장, 화면에서만 가운데 정렬). 그 아래 칸은 `VOID_CELL`(판 밖 표시) |
| 최대 길 | 3×4×5×4×3 = **720길**. 로비·도움말 문구는 «가운데부터 720길» |

### 2-2. 지급 규칙 «가운데부터 양쪽으로»

1. 그림마다(와일드 포함) 릴별로 맞는 칸 수 `c_r`를 센다.
2. **가운데 릴(3번째)에 그 그림이 없으면 지급 없음.**
3. 가운데에서 왼쪽으로 연속해서 맞는 릴 수 `L`(0~2), 오른쪽으로 `R`(0~2)을 센다. 줄 길이 `n = 1 + L + R`.
4. `n ≥ 3`이면 지급. 가능한 줄은 왼쪽 3(1·2·3번 릴), 가운데 3(2·3·4번), 오른쪽 3(3·4·5번), 4릴 두 가지, 5릴 하나다.
5. 길 수 = 줄에 든 릴들의 `c_r` 곱. 지급 = 길 수 × 배당(n) × 길당 베팅액(총 베팅 ÷ 50).
6. 그림 하나는 한 번만 지급한다. 줄은 «가운데에서 좌우로 끊김 없이 이어진 최대 범위» 하나로 유일하게 정해진다(고르는 단계가 없다). «좌우 양방향 합산»은 왼쪽 날개와 오른쪽 날개가 **한 줄로 합쳐져** 길이가 되는 것으로 정한다. 왼쪽 3과 오른쪽 3을 따로 두 번 주지 않는다. 이유: 두 번 주면 가운데 칸이 두 줄에 이중 계상되고, 화면에서 «한 그림 = 한 당첨»이 무너진다.
7. 와일드만으로 된 길은 기존 `getWildChampions` 규칙대로 최고 그림(곰) 하나로만 지급한다(`ways.ts`와 같다).

> 왜 이 규칙이 감사에 유리한가: 릴 독립이 유지된다. 가운데 릴 조건과 좌우 연속 조건이 모두 릴별 칸 수로만 정해지므로 기본 게임 RTP는 **닫힌 식**으로 정확히 나온다(WAVE2 §10 I1 판정 «analytic 정확값»을 이 규칙에도 그대로 적용, §5-4).

### 2-3. 심볼표 (11종, 빈칸 없음)

| id | 이름 | 등급 | 나오는 릴 | 그림 메모(새 디자인) |
|---|---|---|---|---|
| `wild` | 얼음 결정 (와일드) | — | 2·3·4번 | 육각 얼음 결정 안에 오로라 빛이 도는 보석형. 스캐터 말고 전부 대신한다 |
| `scatter` | 오로라 구슬 | — | 전 릴 | 유리가 아닌 서리 낀 구슬 안에 청록·보라 띠가 소용돌이. 판 어디든 3개 이상 |
| `bear` | 북극곰 | 상 | 전 릴 | 통통한 인형형 곰, 귀마개 없음, 서리 털 질감 |
| `owl` | 흰올빼미 | 상 | 전 릴 | 동그란 몸, 눈 둘레 청록 테 |
| `fox` | 북극여우 | 상 | 전 릴 | 꼬리를 몸에 감은 자세, 보라 꼬리끝 |
| `gem_teal` | 청록 얼음 보석 | 중 | 전 릴 | 사각 에메랄드 컷, 서리 낀 매트 표면 |
| `gem_violet` | 보라 얼음 보석 | 중 | 전 릴 | 물방울 컷 |
| `flake` | 눈꽃 | 하 | 전 릴 | 여섯 갈래 눈꽃(굵은 팔) |
| `icicle` | 고드름 | 하 | 전 릴 | 세로로 긴 고드름 세 가닥 |
| `bead` | 얼음 방울 | 하 | 전 릴 | 둥근 얼음 구슬(구슬보다 작고 투명도 낮음, 구슬과 형태로 구분: 띠 무늬 없음) |
| `feather` | 서리 깃털 | 하 | 전 릴 | 휘어진 깃털 하나 |

하위 4종은 **형태(별·세로·원·곡선)**로 구분한다. 430px에서 셀이 72px 이상이라 판독 여유가 있지만, 띠에 쓰는 28px 아이콘에서도 구분돼야 한다.

### 2-4. 배당표 초안 (길당 배당, 길당 베팅 = 총 베팅 ÷ 50)

| 그림 | 3릴 | 4릴 | 5릴 |
|---|---:|---:|---:|
| 북극곰 | 58 | 138 | 345 |
| 흰올빼미 | 46 | 104 | 253 |
| 북극여우 | 35 | 81 | 207 |
| 청록 얼음 보석 | 23 | 58 | 138 |
| 보라 얼음 보석 | 23 | 58 | 138 |
| 눈꽃 | 12 | 28 | 69 |
| 고드름 | 12 | 28 | 69 |
| 얼음 방울 | 9 | 23 | 58 |
| 서리 깃털 | 9 | 23 | 58 |

| 오로라 구슬(총 베팅 배수) | 3개 | 4개 | 5개 이상 |
|---|---:|---:|---:|
| 지급 | 2 | 10 | 50 |
| 프리스핀 | 8 | 10 | 12 |

- 베팅 레벨 50 / 100 / 250 / 500 / 1000 / 2500(`ways.betDivisor = 50`, 길당 베팅이 정수). idol-stage-live와 같은 눈금이다.
- 배당은 전부 정수다. 길당 베팅이 1 이상 정수라 지급도 정수다.
- 위 수치는 §5-2 근사 모델에서 기본 몫 69.6%가 나온 값이다. 실제 스트립으로 바꾸면 «적중률은 스트립, RTP는 배당 선형 배율»(HOWTO §3-e) 순서로 다시 맞춘다.

---

## 3. 피처 규칙 전문 — 얼려 두기 프리스핀

### 3-1. 진입

- 유료 판에서 오로라 구슬 3·4·5개 이상 → 프리스핀 8·10·12회. 구슬 지급(2·10·50배)도 함께 준다.
- 진입 판의 당첨은 평소대로 지급한다.

### 3-2. 프리스핀 한 판의 진행

1. **착지.** 다섯 릴이 `freeStrips`(프리스핀 전용 스트립)로 멈춘다. 기본 스트립보다 적중률이 높다(목표 약 60%, 기본 35%). 이유: 프리스핀의 «당첨 없는 판»이 많으면 얼림을 못 보고 지나간다.
2. **평소 지급.** 착지 판을 가운데부터 길 규칙으로 평가해 지급한다(오로라 배수 **안 곱함**).
3. 당첨이 없으면 그 판은 끝(얼림 없음).
4. **얼릴 그림 고르기.** 당첨 중 금액이 가장 큰 그림. 같으면 배당표 위쪽 그림(곰 → … → 서리 깃털). 와일드만으로 된 길이 가장 크면 곰.
5. **얼림.** 판 위의 그 그림 칸과 와일드 칸이 **전부**(줄에 들었든 안 들었든) 언다. 얼린 칸 수 `k₀ ≥ 3`.
6. **다시 돌리기.** 얼지 않은 칸만 `respinStrips`(릴별 칸 스트립)에서 칸마다 한 번씩 다시 뽑는다. 리스핀 칸 스트립에는 구슬이 없다(리트리거는 착지 판에서만).
7. 새로 뽑힌 칸이 그 그림이나 와일드면 언다.
8. **새로 언 칸이 1개 이상이면 6으로.** 0개이거나 19칸이 전부 얼었으면 끝.
9. **오로라.** 얼린 칸 수 `k ≥ 15`면 오로라가 한 단계 오른다(최대 ×5). **오른 배수는 이 판 보너스부터 적용한다.** 달성한 판에서 바로 보상이 보여야 한다.
10. **얼음 보너스.** `k`를 보너스표(§3-3)에 대 총 베팅 배수를 구하고, 9를 반영한 오로라 배수를 곱해 지급한다.
11. **녹음.** 다음 판 전에 얼음이 전부 녹는다. 판 사이에 남는 것은 오로라 단계뿐이다.

> 얼림 중에 다시 뽑힌 칸으로 생긴 **다른 그림 당첨은 지급하지 않는다.** 지급은 2(착지 판)와 9(얼음 보너스) 두 번뿐이다. 도움말에 그림으로 못박는다(§11). 이유는 §0-2.

### 3-3. 얼음 보너스표 (총 베팅 배수, 오로라 배수 곱하기 전)

| 얼린 칸 수 | 6+ | 9+ | 12+ | 15+ (오로라 +1) | 18+ | 19 (궁전 완성) |
|---|---:|---:|---:|---:|---:|---:|
| 상(곰·올빼미·여우) | 1.8 | 4.4 | 11 | 25 | 68 | 220 |
| 중(보석 2종) | 1 | 2.2 | 5.4 | 13 | 34 | 110 |
| 하(눈꽃·고드름·방울·깃털) | 0.4 | 1 | 2.5 | 6.5 | 17 | 55 |

- 3~5칸은 보너스 0(평소 지급만). 근사 모델에서 얼림의 약 10%다.
- 모든 값이 0.02의 배수라 베팅 50 이상에서 코인이 정수다(스키마가 검사, §6). 튜닝 7번(표 전체 배율)을 적용한 뒤에도 값마다 **0.02 단위로 반올림**하고 단조 증가를 다시 확인한다(반올림 오차는 감사가 흡수).
- 등급을 그림마다 따로 두지 않고 3단으로 묶은 이유: 도움말 표가 3줄로 끝나고, 튜닝 손잡이가 «표 전체 배율» 하나로 줄어든다.

### 3-4. 오로라 배수

| 단계 | 0 | 1 | 2 | 3(최대) |
|---|---|---|---|---|
| 배수 | ×1 | ×2 | ×3 | ×5 |

- 오르는 조건: 한 판의 얼린 칸 수가 15 이상. 라운드 안에서만 유지되고 라운드가 끝나면 사라진다.
- 곱하는 대상: **얼음 보너스만.** 평소 지급에는 안 곱한다(곱하면 피처 몫이 길 지급 쪽으로 쏠려 «얼린 칸» 장치의 비중이 줄어든다. 근사 모델에서 확인).
- 근사 모델: 라운드 끝 평균 단계 0.87(대략 ×2 언저리), 라운드의 약 절반이 한 번 이상 오른다.

### 3-5. 리트리거·종료·상한

| 항목 | 규칙 | 근거 |
|---|---|---|
| 리트리거 | 프리스핀 **착지 판**에 구슬 3개 이상 → +4회 | 얼림 중에는 구슬이 안 나온다 |
| 라운드 상한 | 총 부여 20회. 넘는 리트리거는 잘라 `freeSpinsCapped` 기록 | GAME_CATALOG §4 규칙 2(정수 하드 캡) |
| 얼림 하드 캡 | 한 판의 다시 돌리기 ≤ 17번(`frostRespin.hardCap`) | 아래 척도 |
| 단조 감소 척도(얼림) | 얼지 않은 칸 수 `U`. 계속하는 조건이 «새로 언 칸 ≥ 1»이라 `U`가 매번 1 이상 준다. `U₀ ≤ 16`이라 다시 돌리기는 최대 17번(마지막 1번은 새 칸 0) | §4 규칙 3 |
| 단조 감소 척도(라운드) | `freeSpinsLeft`. 리트리거는 20회 미만일 때만 | §4 규칙 1(`count × p < 1`: 4 × P(착지 구슬 3+) ≪ 1) |
| 지급 상한 | `round.maxWinCap = 2,500`(총 베팅 배수). 유료 판(진입 판 포함)은 판 단위, 프리스핀은 진입 판을 뺀 **프리스핀 합 누적**(carry의 `paid`) | §4 규칙 2. 이론상 기본 판 최대(19칸 전부 곰·와일드) 720×345÷50 = 4,968배, 피처 이론 최대도 2,500배를 넘는다. kraken은 진입 안 한 판에 상한이 없어 «라인 최대 + 스캐터 최대 < 상한» refine으로 막았지만, 이 팩은 `resolveFrostSpin`이 **유료 판까지 전부** 처리하므로 유료 판에도 판 단위 상한을 건다(그 refine을 쓰지 않는다). 도움말 문구: «한 번의 스핀, 또는 한 번의 프리스핀 라운드 최대 당첨은 베팅의 2,500배» |
| 상한 도달 | 평소 지급 → 구슬 지급 → 얼음 보너스 순으로 채우고 넘치는 몫을 잘라 `winCapped` 기록 | candy `resolveCascadeSpin`과 같은 처리 |

### 3-6. 재미 장치가 결과를 바꾸지 않는다는 점

얼릴 그림 고르기, 얼림 순서, 보너스, 오로라는 전부 서버 엔진이 정한다. 화면 입력(STOP·스킵·탭)은 표시 속도만 바꾼다.

---

## 4. RNG 소비 순서 · 상태 · 응답 계약 · API

### 4-1. RNG 소비 계약

```
[유료 판]  릴 정지 5회 nextInt(strip_r.length) → 뮤테이션 0회(이 팩은 뮤테이션 금지)
           → 가운데부터 길·구슬 평가 0회 → (진입이면 상태만 만든다, 0회)
           → [API] 잭팟 판정 1회 (기존 그대로)
[프리스핀] 릴 정지 5회 nextInt(freeStrips_r.length) → 평가 0회 → (당첨 있으면) 얼릴 그림 결정 0회
           → 다시 돌리기 단계 j = 1..: 얼지 않은 칸마다 nextInt(respinStrips_r.length) 1회
             순서 = 릴 0→4, 각 릴 안에서 행 0→h_r−1 (kraken `runCoinRespin`과 같은 관례)
           → 보너스·오로라·상한 0회 → [API] 잭팟 판정 1회 (기존 규칙 그대로)
```

- 프리스핀 한 판의 RNG 호출 수 = 5 + Σ_j U_j ≤ 5 + (16+15+…+1) = 141. 테스트가 «당첨 없는 프리스핀 5회», «얼림 j단계면 5 + Σ U_j회»를 고정한다.
- `seedInput + stateBefore + totalBet`이면 판 전체가 재생된다(오로라 단계는 `stateBefore.carry.frost`).

### 4-2. 엔진 타입 (추가만)

```ts
// types.ts — 추가
export interface FrostStep {
  /** 이번 단계에 다시 뽑힌 칸의 새 심볼. 칸 순서(릴 0→4, 행 0→h−1, 얼지 않은 칸만). */
  cells: SymbolId[]
  /** 이번 단계에 새로 언 칸. */
  frozen: GridPosition[]
}
export interface FrostOutcome {
  target: SymbolId
  tier: 'high' | 'mid' | 'low'
  startFrozen: GridPosition[]
  steps: FrostStep[]
  finalGrid: SymbolId[][]
  count: number              // 얼린 칸 수(와일드 포함)
  bonusMultiple: number      // 표 값(오로라 곱하기 전)
  auroraBefore: number       // 단계 0..3
  auroraAfter: number
  bonus: number              // 실제 지급 코인(상한 반영)
}
export interface FrostCarry { level: number; paid: number; bestCount: number }
export interface RoundCarry { orders?: OrderRoundCarry; frost?: FrostCarry }   // frost 한 줄만 추가
type FeatureTrigger = … | ({ type: 'frostChain' } & FrostOutcome)   // 끝에 한 줄
interface SpinResult { …; frostWin?: number }
```

- 오로라 상승은 **별도 피처를 만들지 않는다.** `frostChain.auroraAfter > auroraBefore`가 곧 상승이다(검수 반영: 피처 유니온·`toSharedFeature`·공유 스키마에 덧붙일 줄을 하나씩 줄여 병합 충돌 면을 줄인다).

- 진입은 기존 `{ type: 'freeSpins', spins, multiplier: 1, retrigger }`를 그대로 쓴다(세션 배관 재사용). `nextState = { freeSpinsLeft, freeSpinsTotal, multiplier: 1, carry: { frost: { level: 0, paid: 0, bestCount: 0 } } }`.
- `frostChain` 피처에 단계 기록을 통째로 싣는다. kraken이 `coinRespin` 피처에 리스핀 기록을 싣는 것과 같은 방식이라 **DB 마이그레이션이 필요 없다**(`rounds.features` jsonb).
- live 10팩은 `frost` 키가 생기지 않는다(골든 비트 동일).

### 4-3. 공유 계약·응답 (`packages/shared`)

| 항목 | 변경 |
|---|---|
| 새 스키마 | `FrostStepSchema`, `FrostChainFeatureSchema`, `FrostCarrySchema` |
| `RoundCarrySchema` | `frost?` 추가 |
| `SpinResponse` | `frostWin?`(= `frostChain` 피처의 `bonus`, `respinWin`처럼 피처에서 꺼냄) |
| `freeSpinsSummary` | `frost?: { bestCount, auroraLevel, bonusTotal }` 선택 필드 |
| 격자 | `VOID_CELL`이 든 `grid`가 그대로 지나가도록 grid 스키마가 문자열만 보는지 확인(새 심볼 검사가 있으면 VOID 허용) |
| 디버그 프리셋 | `frostRound`, `frostChain12`, `auroraUp` |
| 응답 크기 | 최악(17단계) 약 4KB 추가. 상한 테스트 8KB |

### 4-4. API 경로와 복원

| 경로 | 동작 |
|---|---|
| `POST /games/:id/spin` | 엔진 결과 저장. 프리스핀은 기존대로 `rounds.state_before`에 `stateBefore` 저장(memory·drizzle 두 저장소 모두 이미 프리스핀이면 저장한다 — `repos/drizzle.ts:541`, `repos/memory.ts:380`) |
| 새로고침 | `GET /games/:id/state`가 `freeSpins.carry.frost`를 돌려준다 → 남은 횟수·오로라 단계 복원. 얼음은 판 사이에 안 남으므로 복원할 판 상태가 없다(장점) |
| 멱등 재전송 | 같은 키면 저장된 라운드로 응답을 다시 조립한다. `frostWin`은 저장된 `frostChain` 피처에서 꺼낸다(`routes/games.ts`의 `respinWin` 조립 옆에 한 줄). 엔진 재실행 없음 |
| 시드 공개·검증 | `RoundSeedResponse.stateBefore` + `replaySpin(math, bet, rng, stateBefore)` → `totalWin`·`frostChain.steps` 일치 비교(candy H8 경로 재사용) |
| 서버 권위 | 얼릴 그림, 단계, 보너스, 오로라, 상한은 엔진만 계산. 허브는 받은 단계를 그리기만 한다 |
| `toSharedFeature` | `frostChain` 명시 분기(미지 피처가 `scatterWin`으로 떨어지는 문제 재발 방지, candy O17) |
| 디버그 | `debugSpin.ts`: `frostRound`(유료 판에 프리스핀 진입), `frostChain12`(라운드 중 `count ≥ 12`), `auroraUp`(라운드 중 `frostChain.auroraAfter > auroraBefore`). 피처 없는 게임은 409 |
| 체험판 | `apps/hub/src/demo/server.ts`가 같은 엔진·memory 저장소를 탭 안에서 돌린다. 공용 스키마와 `toSharedFeature`만 맞으면 따로 할 일이 없다. QA에서 `build:demo`로 한 번 확인 |

---

## 5. 수학 목표 · 튜닝 · 감사 게이트 · 예상 n*

### 5-1. 목표

| 항목 | 목표 | 근거 |
|---|---|---|
| RTP | **94.5%**(±0.5pp, 피처 포함). 허브 잭팟 1.5%는 모델 밖 | 공통 브리핑 |
| 구성 | 기본 길 **69.0** + 구슬 지급 **1.75** + 피처 **23.75**(= 진입 1/160 × 평균 38배. 그중 프리스핀 평소 지급 약 6.6, 얼음 보너스 약 17.2) | §5-2 근사는 진입 1/170·평균 40배라 피처 23.6이었다. 진입을 1/160으로 올리면 같은 평균에서 피처가 25.0으로 넘치므로 평균을 38배로 낮추고 기본 몫을 0.5 내린 자기 일관 값으로 고쳤다(검수 반영) |
| 적중률 | 33~36% | 점검 실측 28~53% 안, 베팅 미만 당첨 비율과 맞바꿈 |
| 베팅 미만 당첨 비율 | 당첨 중 ≤ 45%(근사 모델 49.5% → 튜닝으로 내림) | 점검 §2.2 LDW |
| 피처 진입 | **약 1/160**(허용 1/140~1/190) | 1/120~1/250 안, 점검 §2.5 |
| 피처 평균 | 베팅의 **약 38배**(허용 36~42) | 브리핑 30~80배. 진입률 × 평균 = 피처 몫이 맞물리게 |
| 라운드 분포 | 중앙값 약 30배, 10배 미만 ≤ 10%, 100배 이상 약 5% | 근사 모델 |
| 변동성 | 중고(σ 약 4.5~5) | 근사 모델 σ 4.73 |
| 최대 당첨 | 2,500배(상한), 도달률 리포트에 명시 | §3-5 |
| 얼림 대상 등급 | 상 ≥ 20% · 중 약 25% · 하 ≤ 55% | 검수 실측: §5-2 근사 스트립 그대로면 **상 8.7% · 중 12.3% · 하 79%**라 «곰이 얼까» 기대가 거의 안 생긴다. `freeStrips`의 상위·중위 가중을 올린 시험(상 3.5~4.5, 중 5, 하 11·2)에서 상 31% · 중 26% · 하 43%, 표 배율 0.85 언저리에서 피처 몫이 목표에 맞았다 |
| 베팅 1배 미만 얼음 보너스 | 얼림 중 ≤ 30% | 근사 23.6%, 위 시험 24~37%. 넘으면 하위 6칸 값을 올린다 |

### 5-2. 근사 시뮬레이션 결과 (참고값)

칸 독립 가정(스트립 상관 무시)의 빠른 모델로 수치를 잡았다. 스크립트·실행 명령은 저장소 밖 `D:/park/tgslot-wt/_qa/new-c-plan/aurora-estimate.mjs`, `aurora-estimate.cmd.txt`.

| 지표 | 값 (500만 판) |
|---|---|
| RTP 합계 | 94.54% (기본 69.56 · 구슬 1.63 · 피처 23.34) |
| 적중률 | 35.0% |
| 피처 진입 | 1/173 (구슬 가중 1.0 → 1/160 목표엔 약 1.05로 올림) |
| 피처 평균 / 중앙값 / 하위 10% / 상위 10% | 40.3배 / 30.3배 / 10.7배 / 78.3배 |
| 라운드 평균 판 수 | 8.37 |
| 프리스핀 당첨률(얼림 발생) | 60.3% |
| 얼림 1회 평균 다시 돌리기 | 3.96번 |
| 얼린 칸 수 분포 | 3~5칸 9.7% · 6~8칸 19.8% · 9~11칸 26.2% · 12~14칸 27.1% · 15~17칸 15.5% · 18칸 1.5% · 19칸 0.4% |
| 오로라 라운드 끝 평균 단계 | 0.87 |
| σ(판당) | 4.73 |
| 관측 최대 라운드 | 710배(약 2.9만 라운드 중) |
| 얼림 대상 등급(검수 추가 측정, 100만 판) | 상 8.7% · 중 12.3% · 하 79.0% → §5-1 목표로 고친다 |
| 라운드 평균 얼림 횟수 | 8.37 × 0.60 ≈ 5.0회 |

이 모델에서 버린 안: 얼림 후 판을 길로 다시 지급(피처 1,000%p 이상), 오로라 조건을 «양 끝 릴까지 얼면»으로 둔 안(라운드 끝 평균 단계 2.7, 대부분 ×5에 붙어 긴장이 사라짐), 오로라를 평소 지급에도 곱한 안(피처 몫이 길 지급으로 쏠림).

### 5-3. 튜닝 순서 (손잡이 순서 고정)

| 순 | 손잡이 | 목표 지표 | 메모 |
|---|---|---|---|
| 1 | 기본 스트립 «채움 심볼 교차 배치»(HOWTO §3-d): 가운데 릴은 얼음 방울·서리 깃털이, 안쪽 릴(2·4번)은 눈꽃·고드름이 채운다 | 적중률 33~36% | 가운데부터 규칙에서는 **가운데 릴과 안쪽 두 릴**이 적중률을 정한다. 바깥 릴은 4·5릴 배당만 키운다(HOWTO §3-d의 «앞뒤 릴 역할 분리»를 가운데 기준으로 뒤집은 것) |
| 2 | 하위 그림 3릴 배당 ↔ 교차 강도 | 베팅 미만 당첨 ≤ 45% | 3릴 하위 배당을 올리고 교차를 세게 하면 적중률은 내려가고 당첨 1건이 커진다 |
| 3 | 배당표 선형 배율 | 기본 몫 69.0 | RTP는 배율에 선형. 100 미만은 정수 반올림 |
| 4 | 구슬 가중 | 진입 1/160 | |
| 5 | `freeStrips` 교차 완화 + **상·중위 그림 가중 올림** | 프리스핀 당첨률 60~68%, 얼림 대상 등급 상 ≥ 20%·하 ≤ 55% | 착지 판의 «가장 큰 당첨»이 얼림 대상이라 등급 비율은 리스핀 스트립이 아니라 이 손잡이가 정한다 |
| 6 | `respinStrips` 그림별 가중 | 얼린 칸 분포(중앙 11~12칸, 15+ 약 17%) | 상위 그림은 리스핀 가중을 낮춰 «번지기 어렵지만 값지게» |
| 7 | **얼음 보너스표 전체 배율** | 피처 몫 23.75(평균 약 38배) | 보너스 몫이 표에 정확히 비례 → 1~2회 반복으로 끝. 적용 뒤 0.02 단위 반올림(§3-3) |

7을 마지막에 두는 이유: 1~6이 분포(모양)를 정하고 7이 크기만 정한다. 순서를 바꾸면 표를 다시 맞춰야 한다.

### 5-4. 감사 방법

- **기본 게임 해석식(필수 교차 검증).** 해석식은 상한(2,500배)을 걸지 않은 값이다. 기본 판이 상한에 닿을 확률은 무시할 만큼 작지만, MC 비교는 상한 off 기본 몫과 한다. 가운데부터 규칙은 릴 독립이라 `E[기본] = Σ_그림 Σ_(L,R) P(가운데 맞음, 왼쪽 연속 L, 오른쪽 연속 R) × E[길 수 | 조건] × 배당(1+L+R)`로 닫힌다(와일드 챔피언 차감은 `analytic.ts`의 `Π E[와일드 칸 수]` 방식 그대로). `tools/rtp-sim/src/centerWaysAnalytic.ts`(새 파일)로 구하고, MC 기본 몫과 3SE 안 일치를 테스트로 고정한다. 감사 도구가 새 규칙을 잘못 재는 사고(candy O3)를 막는 교차 검증이다.
- **전체는 몬테카를로**(얼림 루프가 판 전체 상태에 의존). `--shards 4`.
- **n\*.** `n* = ⌈(1.96 · σ̂ · 1.1 / 0.002)²⌉`. σ̂ = 4.73이면 약 26.0M → `manifest.auditSpins = 30,000,000`. 실제 스트립 파일럿 5M에서 σ̂를 다시 재 갱신한다(스트립 상관으로 σ가 오를 수 있다).
- **감사 시간(추정).** 판당 약 6~10µs(얼림 없는 판이 대부분, astral 8.4µs 참고) × 30M ≈ 단일 3~5분, 샤드 4면 1~2분.

### 5-5. 게이트

| 관문 | 기준 |
|---|---|
| CI(40만) | `\|rtp−target\| ≤ max(0.5pp, 3·SE)` + 재현성 + 정밀도 필드 |
| 정식 감사 | `\|rtp−target\| ≤ 0.5pp` **그리고** ci95 반폭 ≤ 0.2pp, `n ≥ n*` |
| 기존 | 레벨별 ±0.5pp · 적중률 10~60% · 최대 배수 ≥ 50x · 독립 MC 3SE · 분포 합 1 · 잭팟 포함 96.0 ± 0.5 |
| 해석식 교차 | 기본 몫 해석값 vs MC 3SE 안 |
| 얼림 | 다시 돌리기 ≤ 17(위반 0건), 얼린 칸 분포·그림별·**등급별** 얼림 비율·단계 수 분포가 리포트에 있음. 얼림 대상 등급 상 ≥ 20%·하 ≤ 55%. «베팅 1배 미만 얼음 보너스(0 포함)» 비율 ≤ 30%(초과면 하위 6칸 값을 올림) |
| 라운드 | 판 수 ≤ 20(위반 0건), 리트리거율, 라운드 길이 분포 |
| 오로라 | 단계별 도달률, 라운드 끝 단계 분포 |
| 분해 | 평소 지급(기본) + 구슬 + 프리스핀 평소 지급 + 얼음 보너스 = 합계 |
| 상한 | 2,500배 도달률(판·라운드)과 상한 on/off 차 |
| 체감 | 베팅 미만 당첨 비율, 라운드 중앙값·10배 미만 비율 |
| 회귀 | live 10팩 골든(`__golden__`)과 2M 수치 동일 |

---

## 6. 엔진·공용 패키지 변경 목록

원칙: 새 기능은 **새 파일**, 공용 파일은 **선택 필드로 켜지는 분기 한두 줄**만. 다른 두 신작·개선안 팀이 같은 파일을 고치고 있으므로 유니온·스위치·사전은 **끝에 덧붙인다**.

### 6-1. `packages/slot-engine`

| 파일 | 새/수정 | 내용 |
|---|---|---|
| `src/shape.ts` | **새** | `VOID_CELL`, `reelHeight(math, r)`, `inShape(math, reel, row)`, `shapeCells(math)`(릴→행 순서 칸 목록, 캐시), `shapeCellCount`. «릴별 높이» 일반 기능의 단일 진실 |
| `src/centerWays.ts` | **새** | `evaluateCenterWays(grid, math, betPerWay)`. `getLineCandidates`·`getWildChampions` 재사용. 반환 모양은 `evaluateWays`와 같다(`line: -1`, `ways`, `direction: 'center'`, `count = 1+L+R`, `positions`) |
| `src/frostSchema.ts` | **새** | `frostRespin` zod 스키마 + refine(아래) |
| `src/frost.ts` | **새** | `runFrostChain`(얼림 루프), `frostBonus`(표 조회), `resolveFrostSpin`(유료·프리스핀 정산, 상한, carry), `foldFrost(grid, outcome)`(저장 기록으로 최종 판 조립, 순수 함수) |
| `src/schema.ts` | 수정(추가) | 선택 필드 `reelHeights?: number[]`, `ways.from?: 'left' \| 'center'`(기본 left), `frostRespin?`. refine: `reelHeights` 길이 = reels, 최댓값 = rows, 1 이상 · `ways.base`를 `Π reelHeights`와 비교 · `reelHeights`가 있으면 `mutations`·`paylines`·`cascade` 금지 · `VOID_CELL`을 심볼 id로 못 씀 · `frostRespin` 있으면 `scatter.freeSpins` 금지 · 보너스표 값 × 최소 베팅 정수 |
| `src/spin.ts` | 수정(분기 2곳) | `buildGrid`: `reelHeights`가 있을 때만 `row ≥ h_r` 칸을 `VOID_CELL`로(없으면 기존 루프 그대로). `resolveSpin`: `if (math.frostRespin !== undefined) return resolveFrostSpin(…)` 한 줄(coinRespin 분기 옆) |
| `src/evaluate.ts` | 수정(한 줄) | `featureTriggerCount`가 `frostRespin.freeSpins.trigger`도 돌려준다(기대감용) |
| `src/analytic.ts` | 수정(한 줄) | `isAnalytic`: `reelHeights`·`frostRespin`이 있으면 false(해석식은 rtp-sim 새 파일이 따로 맡는다) |
| `src/idle.ts` | 수정(분기) | 대기 화면 «깨끗한 창» 검사가 릴별 높이를 쓰게 |
| `src/types.ts` | 수정(추가) | §4-2 타입 |
| `src/limits.ts` | 그대로 | 라운드 20회 상한은 팩 설정(`frostRespin.freeSpins.maxTotal`) |
| `src/index.ts` | 수정(추가) | 새 export |
| 테스트 | **새** `centerWays.test.ts`, `frost.test.ts`, `shape.test.ts`, `frostSchema.test.ts` | 손 그리드(왼쪽 3·가운데 3·오른쪽 3·4릴 둘·5릴, 가운데 없음 미지급, 와일드 챔피언, VOID 무시), 얼림(대상 고르기 동점, 와일드 동시 얼림, 새 칸 0이면 종료, 19칸 종료, 하드 캡, RNG 호출 수, `foldFrost === finalGrid`, 오로라 15칸·이번 판 적용·최대 ×5, 라운드 상한·리트리거 20회, `paid` 누적 상한), 골든 10/10 |

`frostRespin` 모양(초안):

```ts
frostRespin: {
  freeSpins: { trigger: 3, counts: { "3": 8, "4": 10, "5": 12 }, retrigger: 4, maxTotal: 20 },
  freeStrips: SymbolId[][],        // 릴별, 길이 ≥ 40, 구슬 포함 가능
  respinStrips: SymbolId[][],      // 릴별, 구슬 금지, 와일드는 2·3·4번 릴만
  hardCap: 17,
  thresholds: [6, 9, 12, 15, 18, 19],
  tiers: { high: ["bear","owl","fox"], mid: ["gem_teal","gem_violet"], low: ["flake","icicle","bead","feather"] },
  bonus: { high: [1.8,4.4,11,25,68,220], mid: [1,2.2,5.4,13,34,110], low: [0.4,1,2.5,6.5,17,55] },
  aurora: { ladder: [1, 2, 3, 5], threshold: 15 }
}
```

refine(`ways.from: 'center'`): 릴 수 홀수 · 가운데 릴 높이 = 최대 높이(`rows`) · `bothWays`와 함께 쓸 수 없음.
refine(`frostRespin`): 모든 비와일드·비스캐터 심볼이 등급 하나에만 속함 · 표 길이 = thresholds 길이 · 표 단조 증가 · `hardCap ≥ shapeCellCount − 최소 얼림 칸(3) + 1`(= 17) · `retrigger × P_max < 1`(보수 검사) · `maxTotal ≤ MAX_FREE_SPINS_PER_ROUND`.

### 6-2. `packages/renderer`

| 파일 | 새/수정 | 내용 |
|---|---|---|
| `src/shapeLayout.ts` | **새** | `reelOffsetY(layout, heights, reel)`(높이 4 릴은 반 칸), `shapeCellRect(…)`, `isVoid`. `layout.ts`의 `computeLayout`은 그대로(rows=5로 계산) |
| `src/stopOrder.ts` | **새** | `stopDelays(order, stagger)`: `[[2],[1,3],[0,4]]` → 릴별 정지 지연. 터보·모션 축소는 한 번에 |
| `src/frost.ts` | **새** | 순수 계획: `buildFrostPlan(outcome, speedRow)`, `frostStepDurations`, `compressFrost(remaining)`. 마지막 판이 `finalGrid`와 같아야 한다 |
| `src/pixi/frostFx.ts` | **새** | 얼음 덮개(코드 드로잉: 반투명 청백 판 + 서리 테두리 + 금 무늬), 언 칸 «쩡» 파편, 녹음(아래로 부서짐), 얼지 않은 칸의 칸 단위 회전(스프라이트 풀 재사용) |
| `src/pixi/diamondBacking.ts` | **새** | 19칸 얼음 받침판과 판 밖 네 모서리의 서리 막(코드 드로잉). 마름모 윤곽은 프레임 그림이 아니라 이것이 만든다(§8-2) |
| `src/pixi/pixiRenderer.ts` | 수정(가드 분기) | `math.reelHeights`가 있을 때만: 릴별 마스크 높이·스프라이트 수(h+2)·y 오프셋, VOID 칸 미표시, 정지 순서 지연 적용. 없으면 기존 경로 |
| `src/grid.ts`, `src/initialStops.ts`, `src/anticipation.ts` | 수정(분기) | 행 루프를 `h_r`까지. 기대감은 «가운데+안쪽까지 구슬 2개 → 바깥 둘 감속» |
| `src/types.ts` | 수정(추가) | `SoundPreset`에 `'frost'`. 이벤트 `frostStep { index, total, newlyFrozen, count, nextThreshold }`, `frostEnd { count, bonusMultiple, auroraAfter, bonus }`. `SpinToOptions += { frost? }` |
| 기존 `getCellRect` | 그대로 사용 | 허브 DOM 띠로 «칸 → 띠» 눈송이 비행 좌표 |
| 테스트 | **새** `shapeLayout.test.ts`, `stopOrder.test.ts`, `frost.test.ts` | live 팩 레이아웃 고정값 불변(`layout.test.ts` 잠금 유지), 반 칸 오프셋, 예산 4행, 압축, purity |

### 6-3. `apps/hub`

| 파일 | 새/수정 | 내용 |
|---|---|---|
| `components/game/FrostMeter.tsx` +css | **새** | 마퀴 자리 띠: 얼린 그림 아이콘(28px) + 칸 수 + 눈금 6·9·12·15·18·19(15에 오로라 표시) + 다음 눈금 보너스 «12칸 ×11». 기본 게임에서는 «오로라 구슬 3개 → 프리스핀 8~12회» 안내 띠 |
| `components/game/AuroraBands.tsx` +css | **새** | 오로라 4단(×1·×2·×3·×5). CSS 그라데이션 물결(세로 커튼형, **사선 광택 없음**) |
| `components/game/DiamondHelp.tsx` +css | **새** | 도움말 판·지급 그림(§11) |
| `components/game/FrostSummary.tsx` | **새** | 라운드 결과 화면 본문(§7-5). `RoundPopup`에는 props 하나만 추가 |
| `GameScreen.tsx` | 수정(추가) | `frostStep`·`frostEnd` 이벤트 → 띠·오로라·WinStrip, 도움말 탭 선택, 마퀴 띠 배치. 기존 분기 아래에 덧붙임 |
| `store/game.ts` | 수정(추가) | `frost: FrostCarry \| null`을 **서버 값**으로만 갱신 |
| `components/GameCard.tsx` | 수정(한 줄) | 로비 문구 «얼려 두기 프리스핀 · 가운데부터 720길» (점검 A5: 사양보다 피처 이름) |
| `lib/debugPreset.ts` | 수정(추가) | 프리셋 3종 노출 조건 |
| `lib/audioFrost.ts`, `lib/bgmFrost.ts`, `lib/frostSfx.ts` | **새** | §9. `audio.ts`는 import 한 줄 + `RECIPES.frost` 한 줄 + 위임 export(kraken `deepsea` 방식) |
| `lib/bgmVoices.ts` | 수정(추가) | `FROST_KIT` |
| `i18n/ko.ts`, `i18n/en.ts` | 수정(끝에 추가) | `aurora.*` 네임스페이스(게임 이름·심볼 이름·도움말·띠 문구·결과 화면) |

### 6-4. `packages/shared`, `packages/game-sdk`, `apps/api`, `tools`

| 파일 | 내용 |
|---|---|
| `shared/src/schemas.ts` | §4-3 (유니온 끝에 덧붙임) |
| `game-sdk/src/manifest.ts`, `validate.ts` | `reelHeights` 일치 검사(manifest ↔ math), rows = max(heights), 로비 라벨 |
| `game-sdk/src/theme.ts` | `reelStopOrder?: number[][]`(모든 릴이 정확히 한 번), `SOUND_PRESETS`에 `'frost'` |
| `apps/api/src/games/engineSpin.ts` | `toSharedFeature` 분기 1개(`frostChain`) |
| `apps/api/src/routes/games.ts` | `frostWin` 조립 한 줄 |
| `apps/api/src/games/debugSpin.ts` | 프리셋 3종 판정 |
| `apps/api/src/economy/freeSpins.ts` | 요약에 `frost?` |
| `tools/rtp-sim/src/strips.ts`, `audit/compute.ts`, `audit/report.ts`, `report.ts` | 릴별 높이 |
| `tools/rtp-sim/src/audit/frostStats.ts` | **새** — 얼린 칸 분포, 그림별 얼림, 단계 수, 오로라, 보너스 몫, 라운드 길이, 상한 |
| `tools/rtp-sim/src/centerWaysAnalytic.ts` | **새** — §5-4 |
| `tools/rtp-sim/src/tune-cli.ts` | 손잡이 7개 표시(§5-3) |
| `tools/theme-gen` | **코드 변경 없음**(검수 반영). 세로 캔버스 1024×1536은 ART_DIRECTION v5로 이미 지원되고(`FRAME_WINDOW_REGION_PORTRAIT` y 5~96%가 선언 창 y 18~82%를 담는다), 정사각 창은 `art/prompts.json` 문구로만 정한다 |

### 6-5. 팀 레인 (한 팀: 기획·코어·연출·아트·사운드)

| 레인 | 소유 | 공수(h) |
|---|---|---:|
| 기획(팀장, 이 문서) | 계약 동결, 수치 표, 도움말 문구, 통합 QA, 이미지 눈 검수 | 10 |
| 코어 | slot-engine 새 파일 4 + 분기, shared, API, rtp-sim(해석식·통계·튜닝), `math.json`·`manifest.json`, 감사 | 34 |
| 연출 | renderer 새 파일 5 + 분기, 허브 컴포넌트 4 + 연결, 디버그, i18n | 30 |
| 아트 | `prompts.json`, 생성 17장, 프레임 알파 실측, 클립 2편(+재시도 1), celebration | 14 |
| 사운드 | `frost` 효과음·배경음, earshot 판정, `SOUND_CHECK.md` | 8 |

```
D0  기획: 계약 동결(§4-2 타입, §6-1 스키마 모양, 렌더러 이벤트, SoundPreset 'frost', math.json v0 hidden)
D1  코어: shape·centerWays·스키마·골든     연출: shapeLayout·stopOrder·마름모 받침      아트: 스타일 락 → 심볼
D2  코어: frost 엔진·API·디버그·해석식     연출: frost 계획·frostFx·띠 2종(픽스처)      아트: 프레임·배경 2·썸네일  사운드: 레시피
D3  코어: 파일럿 → 튜닝 1~6               연출: STOP·결과 화면·도움말                아트: 시트·클립          사운드: earshot
D4  코어: 튜닝 7 → 정식 감사(샤드 4)       기획: 통합 e2e(390·430) + 기능별 QA 1회
D5  여유 → QA_LOG → status live 판단(리드)
```

임계 경로: **shape → centerWays → frost 엔진 → rtp-sim 통계 → 튜닝 → 정식 감사.**

---

## 7. 화면 스토리보드 (390 / 430)

### 7-1. 레이아웃

| 요소 | 위치 | 390×844 | 430×932 |
|---|---|---|---|
| 프레임 | 1024×1536 세로 캔버스, 창 x 2~98%·y 18~82%(정사각) | 셀 약 **68~71px**(스테이지 높이에 묶이면 68) | 셀 약 **73~79px**(높이에 묶이면 73) |
| 마름모 | 창 안 5×5 상자의 19칸, 높이 4 릴은 반 칸 내림 | 판 폭 약 374px | 약 413px |
| 마퀴 띠(DOM) | 캔버스 위 16% 자리(프레임 마퀴 위에 겹침) | 높이 약 56px | 약 62px |
| 당첨 금액(WinStrip) | 컨트롤 위(기존 자리) | | |
| 설정 | 중앙 팝업(기존) | | |

- 스테이지 높이가 모자라 캔버스가 높이에 묶이는 기기도 셀 ≥ 64px가 게이트다(390×560 컨테이너에서 약 68px).
- **D1에 실측한다(검수 반영).** 2:3 캔버스는 430×932에서 높이에 묶일 수 있어 셀이 72px 게이트 언저리다. 아트 전에 임시 프레임(투명 + 정사각 창)으로 390·430 셀 크기를 헤드리스로 재고, 430에서 72px 미만이면 마퀴 띠를 캔버스 밖 DOM(스테이지 위)으로 빼고 프레임 마퀴·받침을 각 10%로 줄인 프롬프트로 바꾼다. 마퀴 높이는 생성 전에 정한다(생성 뒤 바꾸면 프레임 재생성).
- 판 위 글자는 없다(UX 4차 규칙). 숫자는 전부 DOM 띠·WinStrip·결과 화면에.
- 당첨 선을 그리지 않는다. 당첨 경로는 **맞은 칸이 가운데부터 바깥으로 차례로 빛나는 이펙트**(가운데 칸 → 안쪽 → 바깥, 칸당 60ms)로 보인다. «가운데부터» 규칙을 눈으로 가르쳐 준다.

### 7-2. 기본 판

| 시점 | 화면 | normal 시간 |
|---|---|---|
| 회전 | 다섯 릴 동시 출발 | — |
| 정지 1 | 가운데 릴 | 기존 첫 정지 시점 |
| 정지 2 | 2·4번 릴 동시 | +260ms |
| 정지 3 | 1·5번 릴 동시(구슬 2개면 +800ms 감속) | +260ms |
| 당첨 | 칸이 가운데부터 바깥으로 빛남 → WinStrip `[아이콘 ×길] · 4릴 · 금액` | 공용 A3 단계에 따름 |

- 꽝 판 총 길이는 기존 5릴 정지(4간격)와 같거나 짧게 맞춘다(2간격 × 1.3배). 점검의 «꽝 1.4~1.9초» 리듬을 해치지 않는다.
- 터보·모션 축소: 정지 순서 없이 한 번에.

### 7-3. 피처 진입

| 시점 | 화면 | 시간 |
|---|---|---|
| 구슬 강조 | 구슬 3개에 오로라 고리 | 900ms |
| 진입 클립 | 서리가 자라 덮음(§10-1) → 덮인 동안 배경을 `bgFreeSpins`로 교체 | 3.0s |
| 띠 전환 | 마퀴 띠가 안내 띠 → 얼음 칸 띠로, 오로라 4단 등장(×1 점등) | 600ms |
| 카운터 | `얼려 두기 프리스핀 1/8` | — |

### 7-4. 프리스핀 진행 (얼림)

| 단계 | 화면 | normal / quick / turbo / 모션 축소 |
|---|---|---|
| 착지·평소 지급 | 기본 판과 같다 | — |
| 얼릴 그림 | 대상 칸이 **한 번 빛남 → 짧은 정적 → 얼음에 갇힘**(사용자 규칙 «히트 → 딜레이 → 팝»과 같은 박자. 코드 덮개, 테두리 서리가 자람) · 띠에 아이콘과 `5칸` | 520 / 400 / 260 / 150ms (빛남 120 · 정적 160 · 얼음 240) |
| 다시 돌리기 1단계 | 얼지 않은 칸만 칸 단위 회전 → 착지 → 새로 언 칸 «쩡»(칸마다 50ms 간격) → 칸 수 올라감, 눈송이가 칸에서 띠로 날아감(단계당 최대 6개). **얼림 중 얼지 않은 칸은 밝기 60%로 눌러 둔다** — 다시 뽑힌 칸이 우연히 다른 그림 줄을 만들어도 당첨처럼 읽히지 않게(그 당첨은 지급하지 않으므로, §3-2) | 640 / 460 / 320 / 200ms |
| 눈금 통과 | 띠 눈금이 깨지듯 빛남 + 짧은 상승음 | 단계 시간 안 |
| 5단계째부터 | 단계 시간 ×0.85씩, 하한은 기본의 0.35배 | 17단계 합 normal 약 6.4s(게이트 ≤ 6.5s): 640×4 + (544+462+393+334+284+241) + 224×7 |
| 끝 | 띠 «12칸 ×11» → `× 오로라 ×2` → `= 22배` 곱셈식, WinStrip `얼음 보너스 +1,100` | 900 / 650 / 400 / 300ms |
| 끝(보너스 0 또는 베팅 1배 미만) | 곱셈식·결정 화음 없이 띠에 칸 수와 작은 `+N`만, 바로 녹음 | 300 / 250 / 200 / 150ms (점검 §2.2 LDW를 피처 안에도 적용, 검수 반영) |
| 오로라 상승(15칸+) | 오로라 띠 한 칸 점등, 화면 위쪽 가장자리 빛 물결(사선 아님, 세로 커튼) | 700 / 500 / 300 / 0ms |
| 궁전 완성(19칸) | 판 전체 얼음 결정 빛남 + «궁전 완성» 띠 문구 | +900ms |
| 녹음 | 얼음이 아래로 부서져 사라짐 | 350 / 260 / 180 / 0ms |

**라운드 시간 예산(normal, 검수 추가).** 얼림 1회 평균 ≈ 520 + 4단계×640 + 900 + 350 ≈ 4.3s, 라운드 평균 얼림 5회 ≈ 22s + 프리스핀 착지 8.4판 × 약 1.6s ≈ 13s + 진입·복귀 클립 6s + 결과 화면 2.5s ≈ **평균 약 45초**. 17단계 최악 얼림 1회 ≈ 8.2s. 라운드 평균이 60초를 넘으면 단계 시간부터 줄인다(quick은 약 33초).

### 7-5. 종료

| 시점 | 화면 | 시간 |
|---|---|---|
| 마지막 판 정산 | — | — |
| 결과 화면 | 테마 카드(얼음 테두리): 총 획득, **«베팅의 ×38.2»**, 가장 많이 얼린 판(아이콘 + 칸 수), 오로라 최종 단계, 프리스핀 n회 | 자동 2.5s, 탭 즉시 |
| 복귀 클립 | 얼음판이 마름모 금을 따라 갈라져 흩어짐(§10-2) | 3.0s |
| 기본 판 | 띠가 안내 띠로 돌아감 | — |

### 7-6. 빅윈

공용 셀레브레이션(`theme.json celebration`)을 쓴다. 등급·코인·셀레브레이션은 **판 정산이 다 끝난 뒤 한 번만**(얼음 보너스 포함 금액 기준). 스킨 초안:

```json
"celebration": {
  "palette": { "core": "#f4fbff", "edge": "#3fe0c5", "glow": "#8a6bff80" },
  "particles": { "shapes": ["shard", "spark", "star"], "symbols": ["flake"], "colors": ["#f4fbff", "#bfefff", "#3fe0c5", "#8a6bff", "#ff8fc7"], "motion": "flutter", "size": 1.1 },
  "rays": { "style": "halo" }, "waves": { "style": "ring" },
  "title": { "font": "rounded", "weight": 850, "stroke": 2, "strokeColor": "#0d1838cc", "tracking": 0.02 },
  "tiers": { "storm": { "edge": "#8a6bff", "glow": "#3fe0c580" }, "cataclysm": { "core": "#ffffff", "edge": "#ff8fc7", "glow": "#bfefff9e", "density": 1.4 } }
}
```

astral·royal이 `beams`, 다른 팩이 `sunburst`를 쓰므로 여기는 `halo` + 눈송이 `flutter`(내리는 눈)로 구별한다.

### 7-7. STOP·스킵

| 상황 | 동작 |
|---|---|
| 릴 회전 중 STOP | 기존 스냅 착지(정지 순서 무시, 한 번에) |
| 얼림 중 STOP | 남은 단계를 압축 재생: 단계당 `max(90, min(220, 1200/남은 수))`ms, 칸 회전 없이 착지만, 언 칸은 그대로(언 칸에서 심볼이 바뀌어 보이는 경로 없음). 보너스 곱셈식은 바로 최종값 |
| 두 번째 탭 | 무시 |
| 결과 화면 | 탭으로 닫기 |
| 빅윈 | 기존 스킵 규칙 |

---

## 8. 아트 목록

### 8-1. 컨셉

**서리 낀 도자기·눈 인형 장난감 3D**(매트 서리 표면에 고운 눈 반짝임, 유리처럼 번들거리지 않음). royal-diamond-777(다이아 유리·백금)·astral(스테인드글라스)과 재질로 갈린다.

- 팔레트: 밤하늘 남색 `#0d1838`, 오로라 청록 `#3fe0c5`, 오로라 보라 `#8a6bff`, 얼음 하늘 `#bfefff`, 눈 흰색 `#f4fbff`, 오로라 끝 분홍 `#ff8fc7`.
- 조명: 좌상단 차가운 주광 + 청록·보라 테두리광.
- **크로마키 주의.** 키 색 허용 범위가 색상각 90~150°(`theme-gen/constants.ts` 허용 30°)다. 오로라 «초록»(색상각 130° 근처)을 심볼에 쓰면 먹힌다. 심볼은 청록(170° 이상)·보라만 쓰고, 초록 오로라는 배경(키잉 안 함)에서만 쓴다.
- **사선 광택 금지.** 얼음은 생성기가 대각선 반사줄을 넣기 쉽다. `stylePrefix`와 `negative` 양쪽에 «no diagonal light streak»을 넣고 컨택트 시트에서 확인한다.

`stylePrefix` 초안:
```
Soft frosted toy-like 3D mobile game icon render, matte frosted porcelain and plush packed-snow textures with a fine sparkle of snow crystals, not glossy, not glass, rounded chunky shapes, bold simple silhouette that reads at 64px, 3/4 top-down camera angle, cool soft top-left key light with a faint aurora teal and violet rim light, night navy (#0d1838) and snow white (#f4fbff) color story with aurora teal (#3fe0c5), aurora violet (#8a6bff) and ice sky (#bfefff) accents, no green tones on the object, no diagonal light streaks, no lens flare, no baked-in drop shadow, premium casual mobile slot game asset quality —
```
`negative` 초안:
```
photorealistic photography, real animal fur photo, glossy glass reflections, diagonal light streak across the image, blurry, watermark, signature, text, letters, numbers, random glyphs, busy cluttered background, baked-in drop shadow, cropped edges, multiple duplicate objects, people, hands, scary teeth, cheap clip-art look
```

### 8-2. 마름모를 어디서 만드나 (코드 드로잉 결정)

생성기는 계단형 마름모 창을 정확히 못 그린다(창을 선언보다 작게 그리는 문제도 있다, ART_DIRECTION v4.1). 그래서:
- **프레임 그림은 정사각 직사각 창**(창 안 순수 `#00FF00`)으로 받는다. 창 위치는 알파 투명 영역 실측으로 `frameLayout`을 확정한다.
- **마름모 윤곽은 코드가 그린다**: 19칸 얼음 받침판 + 판 밖 네 모서리를 덮는 서리 막(`diamondBacking.ts`). 프레임과 무관하게 칸과 정확히 맞는다.

### 8-3. 자산 표 (생성 17장 + 클립 2편)

| 키 | kind | 생성 → 출력 | 프롬프트 초안 (stylePrefix 뒤에 붙임) | 메모 |
|---|---|---|---|---|
| `wild` | symbol | 1024² → 512 | a single chunky hexagonal ice crystal gem with soft teal-and-violet aurora light swirling inside, frosted matte facets, the only symbol with an inner glow | 와일드는 글자 없이 형태로 |
| `scatter` | symbol | 1024² → 512 | a frosted snow-globe-like orb (not glass) with teal and violet aurora ribbons swirling inside and tiny snow crystals around its base | 유일한 «원 + 띠» 형태 |
| `bear` | symbol | 1024² → 512 | a round chubby plush-toy polar bear sitting, frosty white fur with faint ice-blue shading, small teal scarf | 얼굴 있는 심볼 3종은 상위만 |
| `owl` | symbol | 1024² → 512 | a round plush-toy snowy owl, white feathers with soft grey speckles, teal rings around its eyes, wings folded | |
| `fox` | symbol | 1024² → 512 | a plush-toy arctic fox curled with its fluffy tail wrapped around its body, violet tail tip | |
| `gem_teal` | symbol | 1024² → 512 | a chunky square emerald-cut ice gem in aurora teal, frosted matte surface, thin snow rim | 초록 기 금지 |
| `gem_violet` | symbol | 1024² → 512 | a chunky teardrop-cut ice gem in aurora violet, frosted matte surface, thin snow rim | |
| `flake` | symbol | 1024² → 512 | a bold six-armed snowflake with thick rounded arms, pale ice-blue porcelain | 별형 |
| `icicle` | symbol | 1024² → 512 | three chunky icicles hanging side by side from a small snow cap, pale cyan | 세로형 |
| `bead` | symbol | 1024² → 512 | a small round frozen ice bead with a frosty white core, plain, no bands | 원형(구슬과 형태로 구분) |
| `feather` | symbol | 1024² → 512 | a single curved frost-covered feather, pale lavender with white frost edges | 곡선형 |
| `frame` | frame | **1024×1536** → 1080 | an ice palace frame: low flat frosted ice arch marquee (no tall arch) with small snowflake crests, thin ice side rails at most 1.5% wide, short packed-snow base. The reel window is a square opening from x 2% to 98% and y 18% to 82%, filled with pure #00FF00, nothing drawn inside the window. The marquee is empty, no text, no emblem in the middle | 마퀴 가운데를 비워 DOM 띠 자리로. 알파 실측 필수 |
| `bg` | bg | 1024×1536 → 1080 | a calm polar night landscape, soft snowy hills and a distant ice palace silhouette under gentle teal, green and violet aurora curtains, low saturation behind the reels | `reelBackdrop` 포함, 심볼이 묻히지 않게 채도 낮춤 |
| `bgFreeSpins` | bg | 1024×1536 → 1080 | the inside of the ice palace great hall, frosted ice pillars and a crystal dome showing bright aurora curtains above, floor of packed snow | 클립이 닿는 톤과 이어지게 |
| `thumb` | thumb | 1536×1024 → 640 | a diamond-shaped ice reel board where polar bear symbols freeze into ice from the center outward under a bright aurora sky | 로비 카드 |
| `bear-win` `wild-win` `scatter-win` | sheet 3×3 @12fps | 1024² → 768 | 각 심볼의 짧은 반응(곰 고개 끄덕임 / 결정 안 오로라 소용돌이 / 구슬 띠 회전) | 얼음 파편은 코드 입자 |
| `fs-enter` / `fs-exit` | 전환 클립 | 360×640, 3.0s, loop 1 | §10 | `check:clips` 통과 |
| 얼음 덮개·파편·녹음 | 코드 | — | — | `frostFx.ts`. 반투명 얼음은 크로마키로 못 받으므로 코드가 낫다 |
| 마름모 받침·모서리 서리 | 코드 | — | — | `diamondBacking.ts` |
| 오로라 4단·얼음 칸 띠 | CSS | — | — | DOM, 세로 커튼 물결 |
| `celebration` | theme.json | — | — | §7-6 |
| `sound` | theme.json | — | — | `{ "preset": "frost" }` |
| `reelStopOrder` | theme.json | — | — | `[[2],[1,3],[0,4]]` |

### 8-4. 생성·검수 절차

1. 한 번에 1~2장: `pnpm --filter @tgslot/theme-gen gen games/aurora-ice-palace --provider codex --only <키>`.
2. 매번 `pnpm --filter @tgslot/theme-gen contact games/aurora-ice-palace` → 컨택트 시트를 Read로 열어 id와 그림 1:1, 512/58/28px 판독, 사선 광택, 초록 기 확인.
3. 프레임: 알파 투명 영역 실측으로 `frameLayout.window` 확정(색 감지는 창 안 흰 칠에 속는다).
4. 중단되면 `theme.json`에 마지막 자산만 남을 수 있다 → 필수 키 확인 후 `--reprocess`.
5. 사용량 한도가 차면 멈추고 남은 목록을 보고한다(로컬 SDXL 대체 금지).

---

## 9. 효과음·배경음 프리셋 `frost`

목표: 기존 9개 프리셋(bell·fruit·western·shrine·clockwork·candy·deepsea·hanbok·idol)과 같은 이벤트끼리 CLAP 코사인 ≤ 0.90, 배경음 ≤ 0.88. 가장 붙기 쉬운 상대는 **clockwork(유리)·candy(글로켄)·deepsea(둥근 종)**다. 그래서 «맑은 정수 배음 차임»을 피하고 **비정수 배음 FM + 잡음 균열**을 얼굴 소리로 삼는다.

### 9-1. 효과음

| 이벤트 | 소리 | 다른 프리셋과 다른 점 |
|---|---|---|
| 스핀 시작 | 찬 바람 휘익(대역 잡음 600→3,200Hz, 고역 바람결) + 눈 밟는 «뽀득» 2개 | 팝·기포·톱니 대신 바람·눈 |
| 릴 정지(3단) | 얼음 «똑»(짧은 잡음 클릭 + 2.4kHz 비정수 FM 핑, 60ms). 가운데 → 안쪽 → 바깥으로 갈수록 반음씩 높게 | 정지 순서를 소리로도 들려 줌 |
| 작은 당첨 | FM 얼음 «팅» 2음(비율 1.41, 빠른 감쇠) + 눈 반짝임 잡음 | 글로켄·유리 정수 배음과 갈림 |
| **1배 미만 당첨** | 소리 없음, 칸 빛만(점검 A3) | LDW 회피 |
| 큰 당첨 | 낮은 오로라 패드 부풂(톱니 디튠 로우패스 열림) → 얼음 결정 화음(비정수 3~5음) | 등급마다 화음 수 증가 |
| 피처 진입 | 서리가 번지는 «바스락» 잡음 상승 + 패드 상승 | |
| 기대감 | 낮은 바람 울음(대역 잡음 + 0.8Hz 진폭 흔들림) | 사인 사이렌·삼각파와 다름 |
| 얼림 시작 | 얼음 균열 «쩌억»(대역 잡음 1.8k→600Hz 스윕 + 90Hz 쿵) | **게임의 얼굴 소리** |
| 새로 언 칸 | 짧은 «쩡»(균열 축소판). 라운드 안 얼린 칸 수에 따라 반음씩 오름(3→19칸 = 16단, 한 옥타브 넘게) | 진행감, kraken 고정음과 음색이 다름(금속 철컥 아님) |
| 칸 회전 | 아주 작은 바람 틱(단계당 1회로 묶음) | |
| 눈금 통과 | 얼음 2음 상행 | |
| 얼음 보너스 공개 | 등급별 결정 화음(하 2음 / 중 3음 / 상 4음). 보너스 0 또는 베팅 1배 미만이면 화음 없음 | |
| 오로라 상승 | 코러스 패드 상향 스윕 + 높은 FM 반짝임 | |
| 궁전 완성 | 전체 결정 화음 + 부서지는 반짝임 + 2.0s 배경음 덕킹 | |
| 녹음 | 아래로 부서지는 잡음 «사르르» | |
| 롤업 틱 | 작은 얼음 틱, 높이는 진행률 | |

### 9-2. 배경음

| 모드 | 설계 |
|---|---|
| 기본 | **72bpm**, E 도리안. 오로라 패드(디튠 톱니 로우패스, 느린 필터 흔들림) + 부드러운 하프 뜯기 아르페지오 + 활로 켠 듯한 저음 지속음 + 브러시 셰이커. 기존 곡 빠르기(62·88·96·108·116~128)와 겹치지 않는다 |
| 프리스핀 | 76bpm, 같은 조 +2반음. FM 높은 대선율 + 서브 맥동 + 하이햇 16분 |
| 기본값 | 기존 규칙대로 기본 꺼짐, 설정에서 켬. LUFS −30~−32, BGM 40% 믹스 |

### 9-3. 판정 기록

earshot으로 이벤트별 `describe`·`measure`·CLAP 코사인(9개 프리셋 대비)과 배경음 쌍 코사인을 재 `docs/SOUND_CHECK.md`에 «aurora-ice-palace 사운드(`frost`)» 절로 남긴다. **수치는 참고값이고 최종 귀 판정은 사용자 몫**이라고 적는다. 코드는 kraken `deepsea`처럼 `audioFrost.ts`·`bgmFrost.ts`·`frostSfx.ts`에 두고 `audio.ts`는 세 줄만 고친다.

---

## 10. 전환 클립 2편 (TRANSITION_DESIGN 규칙)

발주: SeeDance 2.0(mdbox) t2v, 9:16, 13초, `camera_fixed` 미전달, `generate_audio:false`. 스크립트는 `D:/park/tgslot-wt/_tools/vidgen-t2v.mjs`가 있으면 재사용, 없으면 §2-7 메모대로 `vidgen.mjs`에서 이미지 첨부·16:9 고정을 걷어 낸 변형을 거기 만든다. 키는 `--env-file`로만. 편당 $0.93, **진입 1 + 복귀 1 + 재시도 1 = 최대 3편**. 소스 mp4·프롬프트·로그는 `D:/park/tgslot-wt/_qa/new-c-plan/clips/`에 남긴다(candy가 소스 유실로 재발주한 교훈).

### 10-1. 진입 — 서리가 자라 덮는다

> 서리 고사리가 화면 네 가장자리에서 자라 들어와 **가지를 치며 맞물리는 그 동작으로** 화면 전체를 덮는다. 덮인 뒤에도 서리는 계속 가지를 치고, 그 아래로 오로라 빛이 흐른다.

**왜 이 팩인가.** 피처의 동사가 «얼린다»다. 서리가 번지는 것이 곧 «얼림이 판에 번진다»의 예고다. 서리는 겹치면 구조적으로 불투명해지고(R1), 가지가 계속 자라 단색 정지로 굳지 않는다(R11).

**규칙 적용.** R1 · R2(3초 주기 ×4) · R3(본문 고정 문구) · R4(사람·손·글자·동물 금지 — 심볼에 동물이 있어도 클립에는 안 나오게) · R5 · R8(자람 = 덮임 한 동작) · R9(주어 «frost ferns» 첫 문장) · R11 · R12(stylePrefix의 매트 서리·팔레트 hex, negative의 photorealistic·glossy glass) · R13(사선 광택은 사용자 규칙이라 유지).

```
Vertical full-screen game transition effect, soft toy-like 3D render, matte frosted porcelain and packed-snow textures with a fine sparkle of snow, not glossy, not glass, not photorealistic, premium mobile game art. Feathery frost ferns grow across a dark navy polar night sky with soft teal and violet aurora ribbons glowing behind. One continuous motion repeats: the frost ferns sprout from all four edges of the frame and branch inward faster and thicker, interlocking in that same growth until the whole frame is completely opaque edge to edge, corner to corner, a seamless sheet of white and pale cyan frost, holding fully covered for a beat while the frost keeps branching and the aurora glow keeps drifting softly beneath it so the covered frame is never a flat still color, then the frost thaws away and the night sky shows through before the next growth. The frost growing and the frame being covered are one single motion, never separate steps. Each full cycle lasts about three seconds and repeats about four times across the clip. Night navy #0d1838, aurora teal #3fe0c5, aurora violet #8a6bff, ice sky #bfefff and snow white #f4fbff, cool soft top-left light. No diagonal light streaks across the frame. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

### 10-2. 복귀 — 얼음판이 마름모 금을 따라 갈라져 흩어진다

> 화면을 가득 메운 얼음판 가운데에서 밝은 금이 마름모 모양으로 뻗고, **그 순간 얼음판이 금을 따라 큰 조각으로 갈라져 바깥으로 날아가며** 맑은 밤하늘이 드러난다.

**왜 이 팩인가.** 라운드가 끝나면 얼음이 녹는다(§3-2 11). 진입이 «자라서 덮임»이니 복귀는 «깨져서 걷힘»으로 방향을 바꾼다(R6, 역재생 아님). 마름모 금은 판 모양을 다시 보여 준다.

**규칙 적용.** R1(덮인 채 시작, `opaqueMs: 0` 후보) · R2 · R4 · R6 · R8(금 = 조각 날림 한 동작) · R9(얼음판 첫 문장) · R11 · R12 · R13. candy의 R14 후보(드러나는 장면을 길게 쓰면 처음부터 깔아 버린다)를 따라 드러나는 장면은 «a calm clear night sky» 한 마디로만 쓴다.

```
Vertical full-screen game transition effect, soft toy-like 3D render, matte frosted porcelain and packed-snow textures with a fine sparkle of snow, not glossy, not glass, not photorealistic, premium mobile game art. A thick seamless sheet of white and pale cyan frost fills the frame completely, edge to edge, corner to corner, with soft teal and violet aurora light glowing through it. One continuous motion repeats: a bright crack shoots out from the center in a diamond shape and in that same instant the frost sheet splits along the cracks into large flat shards that burst outward and tumble off the edges of the frame, revealing a calm clear night sky, then fresh frost grows back in from the edges and covers the whole frame in complete opacity for a beat while the frost keeps glittering and branching, before the next crack. The crack and the shards flying away are one single motion, never separate steps. While the frame is covered the frost keeps moving, never a flat still color. Each full cycle lasts about three seconds and repeats about four times across the clip. Night navy #0d1838, aurora teal #3fe0c5, aurora violet #8a6bff, ice sky #bfefff and snow white #f4fbff, cool soft top-left light. No diagonal light streaks across the frame. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

**컷·규격.** 3.0s 등속, 16fps / q60 / 360×640 / `loop 1`(§4-3 확정 규격). 진입 스왑 오프셋은 «배경 노출이 바닥값에 닿는 시점»을 재서 `opaqueMs`로. 끝 장면이 `bg.webp`(밤 설원)와 평균색 거리가 작은 컷을 고른다(candy 2차 재발주 교훈). `pnpm --filter @tgslot/theme-gen check:clips` 정지 총량 < 20%. 팩 합계 1.2MiB 안.

**재시도 1편 사용 기준.** R1 실패(덮임이 화면 일부만) 또는 주제 놓침(서리 대신 눈보라만)이면 그쪽 편만 첫 문장을 «초근접, 서리가 프레임을 가득»으로 바꿔 재발주. 두 편 다 실패하면 단색 커튼 폴백으로 두고 보고한다.

---

## 11. 도움말 페이지

규칙은 도움말에서만 설명한다(판 위 글자 없음). 칸 그림은 전부 CSS `aspect-ratio: 1`인 정사각 칸으로 그린다(페이라인 그림처럼 찌그러지지 않게). 높이 4 릴은 반 칸 내려 실제 판과 같은 마름모를 만든다.

| 탭 | 내용 |
|---|---|
| 1 판과 지급 | 마름모 판 그림(19칸). «가운데 릴에서 시작해 양옆으로 이어지면 맞아요» + 예시 그림 3장: 왼쪽 3릴 / 가운데 3릴 / 5릴(맞은 칸을 가운데부터 바깥으로 색칠, 선 없음). «길 수 = 줄에 든 릴마다 맞은 칸 수를 곱한 값» 예시 `2 × 1 × 3 = 6길`. «가운데 릴에 없으면 맞지 않아요» 반례 1장. «한 그림은 가장 긴 줄로 한 번만» |
| 2 배당표 | §2-4 표(그림 아이콘 + 3·4·5릴), «길 하나당 배당, 총 베팅 ÷ 50 기준». 와일드: «2·3·4번 릴에만, 구슬 말고 전부 대신». 구슬: 3·4·5개 지급과 프리스핀 수 |
| 3 얼려 두기 프리스핀 | 작은 마름모 4컷 만화: ① 당첨 → ② 가장 큰 그림이 얼음 ③ 나머지만 다시 돌아 같은 그림이 또 얼음 ④ 새로 언 칸이 없으면 끝 → «얼린 칸 수로 얼음 보너스». 보너스표(§3-3, 3줄). «다시 돌리기 중 생긴 다른 당첨은 지급하지 않아요». 오로라: «한 판에 15칸 이상 얼리면 오로라가 한 칸 밝아져 그 판부터 얼음 보너스 ×2 → ×3 → ×5». 리트리거 +4, 최대 20회 |
| 4 기타 | 최대 당첨 2,500배, RTP 94.5%, 가상 코인 안내, 공정성 검증 안내(기존 문구 재사용) |

i18n 키는 `aurora.help.*`, `aurora.symbol.*`, `aurora.meter.*`, `aurora.summary.*`로 사전 끝에 덧붙인다. 한국어가 기본, 영어도 같은 커밋에. 용어는 쉬운 말로 고정: 얼려 두기 프리스핀(Freeze Spins), 얼음 보너스(Ice Bonus), 오로라 배수(Aurora Multiplier), 궁전 완성(Full Palace), 가운데부터 720길(720 Ways from the Center).

---

## 12. 기능별 QA 확인표 (기능마다 한 번)

디버그 프리셋으로 상황을 만든 뒤 390×844·430×932(deviceScaleFactor 2) 헤드리스로 찍어 눈으로 본다. 시간 경과 QA는 하지 않는다.

**판·레이아웃**
- [ ] 마름모 3·4·5·4·3, 높이 4 릴이 반 칸 내려앉음, 판 밖 네 모서리에 심볼 없음
- [ ] 셀 430px ≥ 72, 390px ≥ 64
- [ ] 마퀴 띠가 캔버스를 밀어내지 않음(피처 진입·종료 때 리사이즈 0)

**가운데부터 지급**
- [ ] 왼쪽 3·가운데 3·오른쪽 3·4릴·5릴 각 1회, 금액이 `길 × 배당 × 베팅/50`과 같음
- [ ] 가운데 릴에 없으면 미지급
- [ ] 맞은 칸이 가운데부터 바깥으로 빛남, 선 없음

**정지 순서·기대감**
- [ ] 가운데 → 안쪽 → 바깥 순 정지(normal·quick), 터보·모션 축소는 한 번에
- [ ] 구슬 2개 착지 시 바깥 감속, 실제 결과로만

**피처 진입** (`frostRound`)
- [ ] 구슬 강조 → 진입 클립 → 띠 전환 → 카운터 `얼려 두기 프리스핀 1/8`
- [ ] 구슬 3·4·5개가 8·10·12회

**얼림** (`frostChain12`)
- [ ] 가장 큰 당첨 그림이 얼음, 와일드도 함께
- [ ] 얼지 않은 칸만 돌고 언 칸은 그대로
- [ ] 띠 칸 수 = 서버 `count`, 단계 수 = `steps.length`
- [ ] 끝 곱셈식과 WinStrip `얼음 보너스` 금액 = 서버 `bonus`
- [ ] 다시 돌리기 중 생긴 다른 당첨에 지급 표시 없음, 얼지 않은 칸은 눌린 밝기
- [ ] 대상 칸 «빛남 → 정적 → 얼음» 박자
- [ ] 보너스 0·베팅 1배 미만 얼림은 곱셈식·화음 없이 짧게 끝남

**오로라** (`auroraUp`)
- [ ] 15칸 이상에서 한 칸 점등, 그 판 보너스부터 배수 적용
- [ ] ×5에서 더 안 오름, 라운드 끝나면 사라짐

**궁전 완성** (19칸 손 그리드 픽스처로 1회)
- [ ] 연출과 보너스표 19칸 값

**STOP**
- [ ] 얼림 중 STOP → 압축 ≤ 1.2s, 금액 동일, 언 칸에서 심볼 바뀜 0(스크린캐스트)
- [ ] 두 번째 탭 무시

**라운드 종료**
- [ ] 결과 화면 «베팅의 ×N», 가장 많이 얼린 판, 오로라 단계가 서버 `freeSpinsSummary`와 일치
- [ ] 복귀 클립 → 안내 띠 복귀

**리트리거·상한**
- [ ] 착지 판 구슬 3개 +4회, 20회 넘지 않음
- [ ] 상한 픽스처에서 `winCapped`와 화면 금액

**상태 복원·멱등·공개**
- [ ] 라운드 중 새로고침 → 남은 횟수·오로라 단계 동일
- [ ] 같은 키 재전송 → 바이트 동일, 원장 1건
- [ ] 공정성 검증에서 stops·얼림 단계·금액 일치

**당첨 연출**
- [ ] 1배 미만 당첨은 조용히(A3 적용 시)
- [ ] 빅윈·코인·셀레브레이션은 판 정산(얼음 보너스 포함) 뒤 한 번

**도움말**
- [ ] 4탭 내용이 math.json과 일치, 칸 정사각, 390px 잘림 없음, ko/en

**디버그**
- [ ] 이 게임에서만 3종 노출, 라운드 밖 `frostChain12`·`auroraUp` 비활성, 다른 게임 409

**사운드·배경음**
- [ ] 정지 3단 음높이, 언 칸 반음 상승, 균열음, 사용자 귀 판정 1회
- [ ] 기본·프리스핀 변주, 클립 덕킹

**체험판**
- [ ] `build:demo` 결과물에서 진입·얼림·종료 1회

**메모리**
- [ ] 라운드 3회 반복 뒤 Pixi 텍스처·스프라이트 수가 기준선으로 복귀(얼음 덮개·파편 풀 반납, 트윈 정리)

**회귀**
- [ ] live 10종 스핀·피처 정상, 골든 10/10

---

## 13. 위험과 대안

| # | 위험 | 완화 / 대안 |
|---|---|---|
| K1 | 얼림이 판을 너무 쉽게 채워 피처가 폭주 | 지급을 «착지 판 + 얼린 칸 수 표»로 분리(§0-2). 분포는 `respinStrips`, 크기는 표 배율로 따로 맞춘다 |
| K2 | 오로라 배수가 volcano-forge의 배율 장치와 겹친다는 병합 판단 | 대안: 15칸 돌파 보상을 «프리스핀 +2회»로 바꾼다(라운드 상한 20 유지). 오로라 띠 UI·조건은 그대로, 튜닝은 표 배율 한 번 |
| K3 | 릴별 높이 일반화가 live 10팩을 건드림 | 모든 변경이 `reelHeights`·`frostRespin` 선택 필드 가드 안. 골든 10/10, `layout.test.ts` 고정값 잠금, live 2M 수치 동일 |
| K4 | 근사 모델(칸 독립)과 실제 스트립의 차이 | 파일럿 5M으로 σ·적중률·분포 재측정 후 n* 갱신. 튜닝 손잡이 순서 고정(§5-3) |
| K5 | 베팅 미만 당첨 비율이 높음(근사 49.5%) | §5-3 2번 손잡이 + 공용 A3. 목표 ≤ 45%를 감사 리포트에 기록 |
| K6 | 마름모 창 프레임 생성 실패 | 프레임은 정사각 창, 마름모는 코드(§8-2) |
| K7 | 얼음 그림에 사선 광택·초록 기 | 프롬프트 양쪽 금지 + 컨택트 시트 검수 + 키 색 허용 범위 밖 색만(§8-1) |
| K8 | `frost` 소리가 clockwork·candy·deepsea와 비슷 | 비정수 FM + 잡음 균열, earshot 코사인 기준(§9). 넘으면 균열음 비중을 올린다 |
| K9 | 긴 얼림(17단계)이 지루 | 5단계부터 압축, normal 합 ≤ 6.5s 게이트, STOP 압축 |
| K10 | 공용 파일 병합 충돌(스키마 유니온·`resolveSpin` 분기·`SoundPreset`·i18n·`GameScreen`) | 새 파일 위주, 공용 파일은 끝에 덧붙이는 한두 줄. 고친 줄 목록을 §6에 파일 단위로 남김 |
| K11 | 상한 2,500배가 기본 판 이론 최대(4,968배)보다 낮다 | 의도된 상한. 도달률을 리포트에 명시하고 상한 on/off 차가 오차 안인지 확인 |
| K12 | Codex 사용량 한도 | 1~2장씩, 한도 소진 시 중단·보고. 생성 17장 중 시트 3장은 마지막 순서(없어도 출시 가능) |
| K13 | 세 신작 모두 프리스핀에서 «커지는 것»이 있다(volcano 화로 합계, greenhouse 씨앗 배율, 여기 오로라 단계) | 검수에서 두 기획서를 대조해 §0-3 갱신. 이 게임의 주인공은 얼린 칸 수이고 오로라는 얼음 보너스에만 곱하는 4단 보조다. 리드가 그래도 겹친다고 보면 K2 |
| K16 | 얼림 대상이 하위 그림에 쏠려(근사 79%) «어떤 그림이 얼까» 기대가 죽음 | §5-1 등급 비율 목표 + §5-3 5번 손잡이 + 감사 게이트. 하위 얼림이 보너스 0·1배 미만이면 짧게 끝내 반복 피로를 줄인다(§7-4) |
| K14 | 응답 크기 | 17단계 최악 약 4KB 추가, 8KB 상한 테스트 |
| K15 | 보너스까지 거리(기본 베팅 50) | 진입 1/160 목표, 공용 A4(기본 베팅 잔액 비례)·C1(진행 미터)이 오면 마퀴 띠에 연결 |

---

## 검수 반영 (2026-11-27, 기획서 비평)

판정: **고쳐서 진행(revised).** 형태 규칙(가운데부터 양쪽, 한 그림 한 번), 얼림 루프의 종료 척도(얼지 않은 칸 수 단조 감소, 하드 캡 17), RNG 소비 계약, 서버 권위·새로고침·멱등·시드 공개·체험판 경로, 골든 불변 가드는 근거가 맞아 그대로 둔다. 근사 스크립트를 다시 돌려(200만 판) §5-2 수치가 재현되는 것을 확인했다(RTP 94.53, 진입 1/170, 평균 40.1배, σ 4.69). 아래만 고쳤다.

| # | 무엇을 | 왜 |
|---|---|---|
| 1 | **얼림 대상 등급 목표 추가**(상 ≥ 20%, 하 ≤ 55%) — §1-2, §5-1, §5-3 5번 손잡이, §5-5 게이트, K16 | 근사 모델을 등급별로 다시 재 보니 얼림의 **79%가 하위 그림**, 상위는 8.7%뿐이었다. 기획의 핵심 기대(«곰이 얼면 천장이 높다»)가 라운드 셋 중 둘에서 한 번도 안 생긴다. `freeStrips` 상·중위 가중을 올린 시험에서 상 31%·하 43%, 표 배율 약 0.85로 피처 몫이 맞아 실현 가능함을 확인했다(스크립트 `D:/park/tgslot-wt/_qa/new-c-critic/est2.mjs`) |
| 2 | **피처 안 LDW 처리** — 보너스 0·베팅 1배 미만 얼림은 곱셈식·화음 없이 300ms로 끝냄(§7-4, §9-1), 게이트 ≤ 30% | 라운드 평균 얼림 5회 중 약 1회가 «얼음 보너스 +0.4배»였다. 매번 같은 곱셈식 의식을 치르면 지루한 반복이 되고 점검 §2.2의 LDW 지적을 피처 안에서 되풀이한다 |
| 3 | **얼지 않은 칸 밝기 60%** (§7-4) | 다시 뽑힌 칸이 다른 그림 줄을 우연히 만들면 당첨처럼 보이는데 지급은 0이다. 도움말 문구만으로는 막을 수 없다 |
| 4 | **대상 칸 «빛남 → 정적 → 얼음»** (§7-4) | 사용자 규칙 «히트 한 번 → 딜레이 → 팝»과 같은 박자로 맞춤 |
| 5 | **시간 예산 산수 정정** — 하한 0.4 → 0.35배, 17단계 합 6.4s, 라운드 평균 약 45초 표 추가 | 원안(×0.85, 하한 0.4)은 합이 6.6s로 스스로 정한 ≤ 6.5s 게이트를 넘었다. 라운드 전체 시간 예산이 없었다 |
| 6 | **RTP 구성 자기 일관화** — 기본 69.0 · 구슬 1.75 · 피처 23.75(= 1/160 × 38배) | 원안은 근사(1/173)의 구성 표를 그대로 두고 진입만 1/160으로 올려, 같은 평균이면 피처가 25.0으로 넘치는 모순이 있었다 |
| 7 | **오로라 단계 순서 정정** — §3-2의 9(오로라)와 10(보너스) 자리 바꿈 | 원안은 10번 문장 안에 «9보다 먼저 판정»이라 써 구현자가 순서를 거꾸로 읽기 쉬웠다 |
| 8 | **`auroraUp` 피처 삭제**, `frostChain.auroraBefore/After`로 대신 — §4-2·§4-3·§4-4·§6-4 | 같은 정보가 두 군데 실려 있었다. 공용 피처 유니온·공유 스키마·`toSharedFeature`에 덧붙이는 줄이 하나씩 줄어 병합 충돌 면이 준다 |
| 9 | **theme-gen 코드 변경 삭제** (§6-4) | 세로 1024×1536 규격과 탐지 영역(`FRAME_WINDOW_REGION_PORTRAIT`)이 이미 있다. 범위 축소 |
| 10 | **유료 판 상한 명시** (§3-5) + 해석식은 상한 off와 비교(§5-4) | kraken은 «라인 최대 + 스캐터 최대 < 상한» refine을 쓰는데 이 팩은 기본 이론 최대가 4,968배라 그 refine에 걸린다. `resolveFrostSpin`이 유료 판까지 판 단위로 자른다는 것과 진입 판은 라운드 누적에서 뺀다는 것을 못박았다 |
| 11 | **보너스표 배율 뒤 0.02 반올림** (§3-3) | 튜닝 7번이 표를 실수배 하면 «0.02의 배수라 코인 정수» 전제가 깨진다 |
| 12 | **center 길 refine 추가** — 릴 수 홀수, 가운데 릴 = 최대 높이, `bothWays` 동시 금지 (§6-1) | 일반 기능으로 넣는 이상 잘못된 팩을 스키마가 막아야 한다. `ways.bothWays`가 이미 있어 섞이면 이중 지급 |
| 13 | **셀 크기 표기 정정 + D1 실측 게이트** (§7-1) | 원안 표는 430에서 79px라 했지만 2:3 캔버스가 높이에 묶이면 약 73px로 게이트(72) 언저리다. 마퀴 높이를 프레임 생성 전에 확정해야 재생성 비용이 안 든다 |
| 14 | **§0-3·K13을 실제 두 기획서로 갱신** | volcano-forge(6×5 위치 무관 + 연쇄 + 화로 배율 줄), greenhouse-garden(4×4→8×8 자라는 판 + 씨앗 배율)을 대조했다. 판·동사는 겹치지 않는다. 세 게임 모두 프리스핀에서 커지는 진행이 있다는 점만 남아 K2 대안을 리드 판단 몫으로 남긴다 |

손대지 않은 판단: 형태·피처의 독창성(마름모 판은 조사 문서 추천 형태이고, «한 그림 얼려 두고 새 칸이 없을 때까지 다시 돌리기 → 칸 수 표 지급»은 장르 메커닉 조합이며 이름·그림·연출은 새로 짓는다), 한 팀 범위(약 96시간, 위 8·9로 소폭 축소), 사용자 취향(사선 광택·당첨 선·빈칸 심볼 없음, 마름모 밖 네 모서리는 빈칸이 아니라 서리 막, 규칙은 도움말, 금액은 컨트롤 위, 쉬운 이름).

---

## 구현 계약 (코어, 2026-11-27)

코어 레인(엔진·수학·공용 계약·API·rtp-sim) 결과. 화면·아트·사운드 담당은 이 절을 정본으로 쓴다. 기획 본문과 다른 곳은 여기가 이긴다(아래 «기획과 달라진 점»).

### A. math.json (`games/aurora-ice-palace/math.json`, `status: hidden`)

| 필드 | 값 |
|---|---|
| `reels` / `rows` / `reelHeights` | 5 / 5 / `[3,4,5,4,3]` (19칸) |
| `payModel` / `ways` | `ways` / `{ base: 720, bothWays: false, betDivisor: 50, from: "center" }` |
| `betLevels` | 50·100·250·500·1000·2500 (길당 베팅 = 총 베팅 ÷ 50) |
| `scatter.pays` | 3개 ×2.5 · 4개 ×12 · 5개 이상 ×60 (총 베팅 배수) |
| `frostRespin.freeSpins` | `trigger 3`, `counts {3:8, 4:10, 5:12}`, `retrigger 4`, `maxTotal 20` |
| `frostRespin.freeStrips` / `respinStrips` | 프리스핀 착지 스트립 / 얼림 칸 스트립(구슬 없음, 와일드는 2·3·4번 릴만) |
| `frostRespin.thresholds` / `bonus` | `[6,9,12,15,18,19]` / 상 `[1.48,3.26,5.92,11.1,28.12,88.8]` · 중 `[0.88,1.62,3.26,6.3,15.54,47.36]` · 하 `[0.76,0.96,1.56,3.1,7.4,23.68]` |
| `frostRespin.aurora` | `{ ladder: [1,2,3,5], threshold: 15 }` |
| `frostRespin.hardCap` | 17 |
| `round.maxWinCap` | 2500 |

배당표(길당): 곰 113/271/678 · 올빼미 90/215/520 · 여우 68/158/395 · 보석 2종 56/130/316 · 눈꽃·고드름 16/38/96 · 방울·깃털 11/28/70.

### B. 판·좌표

- `grid[row][reel]`, 행은 **위로 붙여** 저장한다. 릴 r의 `row ≥ h_r` 칸은 `"__void__"`(엔진 `VOID_CELL`). 응답 `grid`·`gridBefore`·`frostChain.finalGrid`에 그대로 실린다. 마름모 가운데 정렬(높이 4 릴 반 칸)은 렌더러 몫.
- 칸 순서 규약(RNG·`steps[].cells`·`startFrozen` 모두): **릴 0→4, 릴 안 행 0→h_r−1** (`shapeCells(math)`).
- **프리스핀 `stops`는 `frostRespin.freeStrips` 인덱스다.** 렌더러는 프리스핀 판(`isFreeSpin: true`)에서 `frostSpinMath(math, true)`(엔진 export, 스트립만 바꾼 캐시 사본)를 넘겨야 릴 그림이 `grid`와 맞는다. 유료 판은 `math` 그대로.

### C. 응답 필드 (`@tgslot/shared`)

| 필드 | 뜻 |
|---|---|
| `wins[]` | `line: -1`, `ways`, `count = 1+L+R`(3·4·5), **`direction: 'center'`**, `positions`는 **가운데 릴 → 왼쪽1 → 오른쪽1 → 왼쪽2 → 오른쪽2** 순서(릴 안 행 순). «가운데부터 차례로 빛남»은 이 순서를 그대로 쓰면 된다. 와일드만으로 된 길은 `symbol: 'bear'` |
| `frostWin?` | 얼음 보너스 지급 코인(`frostChain.bonus`). `totalWin`에 이미 포함. 얼림이 일어난 프리스핀만 |
| `features[]` (유료 판) | `scatterWin?` → `freeSpins?{retrigger:false}` → `freeSpinsCapped?` → `winCapped?` |
| `features[]` (프리스핀) | `scatterWin?` → **`frostChain?`** → `freeSpins?{spins:4|잘린 값, retrigger:true}` → `freeSpinsCapped?` → `winCapped?` |
| `frostChain` | `target`(얼린 그림) · `tier`(`high/mid/low`) · `startFrozen[]`(처음 언 칸, target+와일드 전부) · `steps[]{cells[], frozen[]}`(단계마다 얼지 않은 칸에 새로 뽑힌 심볼 / 새로 언 칸; 마지막 단계 `frozen`이 비면 끝, 19칸이 차면 빈 단계 없이 끝) · `finalGrid` · `count`(얼린 칸, 와일드 포함) · `bonusMultiple`(표 값, 오로라 전) · `auroraBefore`/`auroraAfter`(0..3) · `auroraMultiplier`(1·2·3·5, **이 판 보너스에 쓴 값**) · `bonus`(코인, 상한 반영) · `hitHardCap`(항상 false) |
| `freeSpins.carry.frost` | `{ level, paid, bestCount, bonusTotal }` — 오로라 단계 · 라운드 프리스핀 누적 지급(진입 판 제외) · 한 판 최다 얼린 칸 · 얼음 보너스 합. **서버 값만** 쓴다 |
| `freeSpinsSummary.frost` | 라운드 끝 판에만: `{ bestCount, auroraLevel, bonusTotal }` |

- `totalWin = 길 지급 + 구슬 지급 + frostWin` (상한 순서 길 → 구슬 → 보너스). `wins[].win`은 상한 전 값이라 `winCapped`가 있으면 `totalWin`을 믿는다.
- 오로라 상승 = `auroraAfter > auroraBefore`(별도 피처 없음). 얼음 보너스 곱셈식: `bonusMultiple × auroraMultiplier × 총 베팅 = bonus`(상한 전).
- 화면 이벤트 재료(연출 레인 제안 `frostStep`/`frostEnd`): 단계 j 뒤 칸 수 = `startFrozen.length + Σ_{i≤j} steps[i].frozen.length`, 다음 눈금은 `math.frostRespin.thresholds`, 종료값은 `count`·`bonusMultiple`·`auroraAfter`·`bonus`. 재생 검증은 `foldFrost(grid, frostChain) === finalGrid`(엔진 export, math 불필요).
- 다시 뽑힌 칸이 다른 그림 줄을 만들어도 지급하지 않는다(지급은 착지 판 `wins` + `frostWin`뿐).

### D. 규칙 확정(엔진)

- 얼릴 그림: 당첨 금액이 가장 큰 그림, 동점이면 `math.symbols` 선언 순서 앞(곰→…→깃털). 와일드 자체 배당 없음.
- 프리스핀 착지 판의 구슬 지급도 준다(오로라 안 곱함). 리트리거는 착지 판 구슬 3+만, +4, 총 20 상한.
- 상한 2,500×: 유료 판은 판 단위, 프리스핀은 `carry.frost.paid` 누적. **누적이 상한에 닿으면 남은 횟수와 상관없이 라운드 종료**(`nextState` 없음, `winCapped`). 30M 감사에서 도달 0건.

### E. RNG 계약

`[유료] nextInt(strips_r.length) × 5` / `[프리스핀] nextInt(freeStrips_r.length) × 5 → (당첨 있으면) 단계마다 얼지 않은 칸 수만큼 nextInt(respinStrips_r.length)` → `[API] 잭팟 1회`. 프리스핀 1판 호출 수 = 5 + Σ_j U_j (테스트 고정).

### F. 서버·복원·디버그

| 항목 | 동작 |
|---|---|
| 새로고침 | `GET /games/:id/state` → `freeSpins.{left,total,carry.frost}`. 판 사이 얼음 없음(복원할 판 없음) |
| 멱등 재전송 | 저장된 라운드로 재조립, `frostWin`은 저장된 `frostChain.bonus`. 바이트 동일(디버그 블록 제외) |
| 시드 공개 | `GET /rounds/:id/seed`의 `stateBefore.carry.frost` + `spin(math, {totalBet}, createSeededRng(seedInput), stateBefore)` → stops·steps·totalWin 일치 |
| DB | 마이그레이션 없음(`rounds.features`·`rounds.state_before` jsonb, 프리스핀 세션은 게임 상태 `state` jsonb 안 `freeSpins.carry`) |
| 디버그 프리셋(`SpinDebugPreset`) | `frostRound`(유료 판 진입) · `frostChain12`(라운드 중 12칸+) · `auroraUp`(오로라 상승) · `frostFull`(19칸 궁전 완성) · `frostBig`(얼음 보너스 ≥ 총 베팅 25배, «큰 결과»). 얼림 없는 게임은 409 `DEBUG_NO_MATCH`. 라운드 밖 얼림 프리셋은 탐색 실패 409. 허브 `presetsFor`: 라운드 밖 `frostRound`, 라운드 중 나머지 4종, `frostFull`·`frostBig`는 `maxTries 20000` |
| 체험판 | 같은 엔진·memory 저장소. `build:demo` 통과, 체험판 스핀 정상(테마 없어 «그래픽을 불러올 수 없어요» 폴백) |

### G. 공용 파일에 덧붙인 것 (병합 참고)

- slot-engine: 새 파일 `shape.ts`·`centerWays.ts`·`frostSchema.ts`·`frost.ts`(+테스트 3). 수정: `schema.ts`(선택 필드 `reelHeights`·`ways.from`·`frostRespin`, `ways.base`를 `shapeWaysBase`로, refine 2줄), `spin.ts`(`buildGrid` 릴 높이 분기, `spinUnchecked`·`resolveSpin` 얼림 분기 각 1줄), `ways.ts`(center 위임 1줄), `evaluate.ts`(`featureTriggerCount`), `analytic.ts`(`isAnalytic` 1줄), `idle.ts`(릴 높이), `types.ts`(`direction` 'center', `RoundCarry.frost`, 유니온 끝 `FrostChainTrigger`, `SpinResult.frostWin`, 끝에 Frost 타입), `index.ts`.
- shared `schemas.ts`: 프리셋 5개, `direction` enum 'center', `FrostCarrySchema`·`RoundCarry.frost`, `frostWin`, `freeSpinsSummary.frost`, `FrostStepSchema`·`FrostChainFeatureSchema`(유니온 끝).
- api: `engineSpin.ts`(`frostChain` 분기), `routes/games.ts`(409 1줄·`frostWin` 조립), `debugSpin.ts`(프리셋 5종), `economy/freeSpins.ts`(carry·요약), `repos/types.ts`. 새 테스트 `routes/frostRound.test.ts`.
- hub(타입 연결만): `DebugPanel.tsx` 라벨, `lib/debugPreset.ts` 노출 조건, i18n 사전 끝 `auroraDebug*` 5키(ko·en). renderer `types.ts` `direction`에 'center'.
- rtp-sim: 새 `centerWaysAnalytic.ts`·`audit/frostStats.ts`(+`audit/frost.test.ts`), 훅 `sampleDistribution`·`compute`·`report`·`types`·`index`·`contributions`, `tune-cli --bonus-scale`, `cascade.test.ts` 옛 조립이 freeStrips를 따르게.

### H. 수치 결과 (정식 감사 `docs/RTP_AUDIT_aurora-ice-palace.md`, 30M·샤드 4·베팅 100, 22/22 PASS)

| 지표 | 값 |
|---|---|
| RTP | **94.613%** (+0.113%p, 95% CI ±0.157%p), 잭팟 포함 96.11% |
| 분해 | 기본 길 68.37 · 구슬 1.83 · 프리스핀 길 8.67 · 프리스핀 구슬 0.06 · 얼음 보너스 15.57 |
| 기본 길 해석식 vs MC | 68.348% / 68.375% (3SE 안) |
| 적중률 / 베팅 미만 당첨 비율 | 35.38% / 41.66% |
| 진입 | 1/162.5 |
| 피처 평균 / 중앙값 / 10배 미만 / 100배+ / 최대 | 39.5× / 32×대 / 4.7% / 3.8% / 620× |
| 라운드 평균 판 수 · 얼림 횟수 · 단계 | 8.21판 · 5.11회 · 4.35단계(최장 15, 하드캡 17 도달 0) |
| 얼림 대상 등급 | 상 27.2% · 중 31.4% · 하 41.4% |
| 베팅 1배 미만 얼음 보너스(0 포함) | 26.8% |
| 궁전 완성 | 얼림의 0.41% |
| 라운드 끝 오로라 | 0단 37.8% · 1단 39.1% · 2단 17.6% · 3단 5.6% |
| σ / n* | 4.393 / 22.4M (`auditSpins` 30M) |
| 상한 도달 | 0건, 응답 최대 얼림 피처 < 8KB(테스트), 실측 응답 약 3KB |

### I. 기획과 달라진 점

- 배당표·보너스표·구슬 지급을 튜닝으로 새로 정했다(A). 기획 초안 배당으로는 3릴 1길 당첨이 대부분 베팅 미만이라 LDW 54%였다 → 3릴 배당을 올리고 교차 배치를 세게 해 41.7%.
- 피처 몫 구성: 프리스핀 길 8.7 + 보너스 15.6(기획 근사 6.6 + 17.2). 등급 목표(상 ≥ 20%)를 지키며 프리스핀 당첨률 62%를 맞추면 길 몫이 커진다.
- `FrostCarry`에 `bonusTotal` 추가(라운드 끝 요약용). `frostChain`에 `auroraMultiplier`·`hitHardCap` 추가.
- 디버그 프리셋 2종 추가: `frostFull`, `frostBig`.
- 프리스핀 누적 상한 도달 시 라운드 종료(§3-5에 없던 규칙).

### J. 남은 것 (다른 레인)

- `pnpm pack:check`: aurora 오류 1(썸네일 `thumb.webp` 없음)·경고 2(theme·prompts 없음) — 아트 레인이 넣으면 해소. 그 전에는 API 로더가 `live`로 못 올린다.
- 렌더러: `VOID_CELL` 칸 미표시·마름모 정렬·프리스핀 `frostSpinMath` 스트립 교체·`frostChain` 재생. 허브: 띠·결과 화면·도움말.
