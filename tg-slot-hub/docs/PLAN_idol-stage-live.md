# idol-stage-live (#11) 구현 계획 — 무대 룰렛

작성일 2026-11-26 · 대상: `tg-slot-hub` 신작 3종 중 하나(팀 new-c) · 상태: 기획 확정안(코드 착수 전)
정본 근거: `docs/GAME_CATALOG.md` §0·§2 #11·§4(종료·발산 규칙), `docs/WAVE2_DESIGN.md` §4-4(셀 크기)·§9-2(휠·픽미 판정)·§10, `docs/FEATURE_RESEARCH.md` §2.13(보너스 휠)·§2.26(입력이 결과에 닿으면 안 됨), `docs/PLAN_candy-cluster-pop.md`(구성 모범), `games/_template/HOWTO.md` §3-d·§3-e·§6, `docs/TRANSITION_DESIGN.md` §1·§2-7, `docs/ART_DIRECTION.md` v3·v4, `docs/SOUND_CHECK.md`.
수치 검산: 룰렛 기대값·분포는 DP와 MC 100만 회로 미리 쟀다(`D:/park/tgslot-wt/_qa/new-c-plan/wheel-dp.mjs`, 저장소 밖). 기본 게임 수치는 튜닝 전 초안이다.

---

## 0. 카탈로그 원안에서 바뀐 것

| # | 카탈로그 §2 #11 원문 | 이 계획의 결정 | 이유 |
|---|---|---|---|
| C1 | 보너스 = 픽미(카드 12장 중 고르기) | **무대 룰렛**(여러 겹 보너스 휠) | 이번 배분에서 피처 계열이 고정됐다. 픽미의 "골랐다는 주체감"은 «돌리기» 탭이 이어받는다 |
| C2 | 응원 미터: 승리 스핀마다 +1, 10/25/50에 배수 2/3/5, **스핀 간 누적** | **응원봉 불빛**: 그 스핀 화면의 응원봉 수만큼 룰렛 코인 칸에 불이 켜지고 2배. **이월 없음** | 유료 스핀 사이로 넘어가는 상태 금지(브리핑). 카탈로그가 스스로 "리셋 정책을 못 박지 않으면 RTP 발산" 위험을 적어 둔 장치를 없앤다. base 상태 영속(`WAVE2` §10 I3의 차익 위험)도 생기지 않는다 |
| C3 | 1024 ways **양방향** | 1024 ways **왼쪽→오른쪽만** | 양방향은 당첨 경로 이펙트가 두 방향으로 나가 판독 부담이 크고 튜닝 축이 하나 는다. 이 게임의 볼거리는 룰렛이다 |
| C4 | 심볼 `mira` `yuni` `sera` `heart_bomb` `crown_a` | 색+역할 이름(`idol_pink` 「핑크 센터」 등), 실루엣이 다른 소품 | 기능·용어는 뜻이 바로 보이는 쉬운 말(조어 금지). 28px 아이콘에서도 모양으로 구분 |
| C5 | RTP 68.0 + 미터 14.0 + 픽미 12.5 | **기본 ways 75.0 + 무대 룰렛 19.5** | 미터가 없어졌다. 룰렛 평균 약 45배 × 진입 약 1/230 |
| C6 | `bonus` 심볼 별도 + `scatter` 심볼 | `bonus` 1종(스캐터 판정, 배당 없음) | 심볼 하나가 하나의 뜻만 갖게. 스캐터 소액 배당은 룰렛과 겹쳐 규칙만 늘린다 |
| C7 | `GAME_CATALOG` §4 P6 `bonus` 프레임워크(pick-me·wheel 공용, 다단 인터랙션 API) | **트리거 스핀 응답 하나에서 룰렛을 끝까지 정산**. 새 API 경로·`game_states` 없음 | 브리핑이 허용한 방식. 연쇄(candy)처럼 결과가 한 응답에 들어가니 멱등 재전송·시드 공개·체험판이 기존 경로 그대로 돈다(§4) |

**다른 신작과의 경계.** 이 기획 시점에 두 팀 폴더(`D:/park/tgslot-wt/new-a`, `new-b`)에 기획서가 아직 없다. 카탈로그 기준으로 `kraken-cove`는 홀드&스핀(코인 잠금 리스핀 + 4단 잭팟)이다. `hanbok-night-market`은 카탈로그 원문이 «휠 보너스»지만 이번 배분에서 휠 계열은 이 팀 고정이므로 그 팀은 다른 계열로 간다고 전제한다. 겹침을 구조로 막는다.
- 이 게임에는 **릴 리스핀·칸 잠금·코인 값 라벨·잭팟 리본·보드 이동·주사위·카드 고르기가 없다.** 핵심 동사는 «돌린다 → 안쪽으로 들어간다» 하나다.
- 코드 이름은 `stageRoulette` / `Roulette*`로 네임스페이스한다. `wheel`·`bonus` 같은 범용 이름은 쓰지 않아 병합 때 충돌하지 않는다.
- 여러 겹 화살표 휠(«위로»로 안쪽 고리에 들어가 맨 안쪽 큰 상)은 상용 선례가 있는 **장르 메커닉**이다. 그 판 배치·색(금빛 고리·화살표 칸)·명칭을 따라 하지 않고, 이 게임의 정체성은 «돌리기 여러 번 + 앙코르 + 응원봉 불빛 칸»으로 둔다.
- 테마: 무대 조명·응원봉·리본 테이프(밤바다·야시장 어휘 없음). 소리: 신스팝·박수·함성(뱃고동·국악기 없음).
- 리드 확인 1건: 병합 전 hanbok 팀 피처가 휠이 아닌지 본다. 휠이면 리드가 한쪽을 조정한다.

---

## A. 재미 장치 결정

### A-1. 후보 3개

모두 «무대 룰렛» 위에 얹는다. 실존 상용 게임의 규칙·이름·연출을 옮긴 것은 없다.

**후보 1 — 응원봉 불빛 (채택)**
- **규칙.** 보너스가 터진 그 스핀의 화면에 응원봉 심볼이 N개 있으면, 룰렛 각 고리의 코인 칸 N개에 불이 켜진다(최대 6, 안쪽 고리는 코인 칸 5개라 5). 불 켜진 칸의 상은 2배. 켜지는 순서는 고리마다 고정이다.
- **플레이 경험.** 보너스 3개가 섰을 때 "응원봉이 몇 개 깔렸지?"가 바로 두 번째 기대가 된다. 룰렛이 열리면 응원봉 불빛이 하나씩 날아와 칸을 분홍으로 켠다. 돌릴 때마다 «분홍 칸에 서라»를 빈다.
- **비용.** 엔진 작음(격자에서 개수 세기, RNG 0회). 허브 중간(토큰 비행·칸 점등). 아트 0(응원봉 심볼 재사용).
- **수학.** 응원봉 0개 → 평균 37.0배, 3개 → 48.1배, 6개 → 58.7배(DP, §5-2). 차이가 체감되면서 꼬리는 유계(2배 상한)다.
- **이월.** 없음. 그 스핀 격자만 본다.

**후보 2 — 떼창 게이지**
- 룰렛 안에서 코인 칸에 설 때마다 게이지가 차고, 다 차면 자동으로 한 단계 위로.
- 라운드 안 상태라 감사는 쉽다. 하지만 진입 전(기본 게임)에는 아무 기대도 만들지 않고, «한 단계 위로» 칸과 역할이 겹쳐 룰렛 규칙이 하나 더 는다.

**후보 3 — 센터 지목**
- 보너스 심볼마다 멤버가 그려져 있고 같은 멤버가 2개 이상이면 그 멤버의 전용 칸이 룰렛에 끼어든다.
- 보는 맛은 크지만 보너스 심볼이 3종으로 늘고(아트 3장), 룰렛 칸 구성이 스핀마다 바뀌어 도움말 그림과 세로 판독이 무너진다.

### A-2. 점수 (5점 만점)

| 후보 | 재미·새로움 | 430px 판독성 | 구현 비용(높을수록 쌈) | 수학·감사 용이 | 합계 |
|---|---:|---:|---:|---:|---:|
| 1 응원봉 불빛 | 4 | 5 | 4 | 5 | **18** |
| 2 떼창 게이지 | 3 | 4 | 4 | 4 | 15 |
| 3 센터 지목 | 4 | 2 | 2 | 3 | 11 |

### A-3. 룰렛 골격 결정 — 한 판 휠 vs «세 곡» 휠

| 골격 | 규칙 | 평균 회전 수 | 안쪽 고리 도달 | 판정 |
|---|---|---:|---:|---|
| 한 판 휠 | 코인 칸에 서면 끝, «위로»면 안쪽으로 | 약 1.6 | 약 7% | 기각. 손에 땀을 쥐는 순간이 한두 번뿐이다 |
| **세 곡 휠** | 곡(=돌리기 기회, 화면 표기는 «남은 돌리기») 3개. 코인 칸은 상을 받고 곡 하나 소비, «위로»는 곡 소비 없이 안쪽으로 가서 곧바로 다시 돌림, 안쪽 고리는 남은 곡 내내 유지 | **4.4** | **21%** | **채택.** 들어갈수록 남은 곡이 다 비싸진다 → "지금 위로 걸리면 남은 두 곡이 안쪽"이라는 계산이 생긴다 |

---

## 1. 게임 요약

| 항목 | 값 |
|---|---|
| 한 줄 | 무대 초대권 3장이 서면 **무대 룰렛**이 열린다. 세 곡 동안 룰렛을 돌려 상을 모으고, «한 단계 위로»에 걸리면 더 큰 상이 있는 안쪽 고리로 들어간다. 그 스핀 화면의 **응원봉** 수만큼 코인 칸에 불이 켜져 2배가 된다. |
| 왜 재밌나 | ① 릴 정지: 초대권 2장 뒤 세 번째 릴, 3장 뒤엔 «4장이면 가운데 고리에서 시작» 기대 ② 진입: 응원봉 불빛이 하나씩 날아와 칸이 켜지는 순간 ③ 매 회전 감속: 포인터가 «위로» 칸 앞에서 느려질 때 ④ 안쪽 고리: 대상(×120) 옆 칸을 지날 때, 대상을 받고도 돌리기가 남아 «한 번 더?»가 이어질 때 ⑤ 앙코르: 돌리기 하나 더 ⑥ 마지막 곡: 합계가 빅윈 등급을 넘을까 |
| 그리드 / 페이 | 5릴 × 4행, 1024 ways 왼쪽→오른쪽(인접 릴 3개 이상), `betDivisor 50` |
| 배당 기준 | 웨이당 베팅액(총 베팅 ÷ 50) × 페이테이블 × 경로 수. 룰렛 상은 **총 베팅 배수** |
| 와일드 | 황금 마이크. 릴 2~5에만. 초대권을 뺀 모든 심볼을 대신한다. 응원봉으로 세지 않는다 |
| 보너스 | 무대 초대권(스캐터 판정). 모든 릴에 나오고 한 릴 창에 최대 1장(스트립 간격 ≥ 4). **배당 없음** |
| 무대 룰렛 | 3겹(바깥 12칸·가운데 10칸·안쪽 8칸). 곡 3개, 앙코르 최대 2번, 최대 7회 회전. 안쪽 고리의 «대상 ×120»이 최고 상(코인 칸처럼 곡 하나를 쓰고 공연은 계속) |
| 재미 장치 | 응원봉 불빛(그 스핀 한정, 이월 없음) |
| 상한 | 한 스핀 지급 2,000×(`round.maxWinCap`, 기본 ways + 룰렛 합). 룰렛 단독 이론 최대 390× |
| 목표 RTP | 94.5% = 기본 ways 75.0 + 무대 룰렛 19.5. 허브 잭팟 1.5%는 모델 밖(체감 96.0) |
| 변동성 | 중고(high). 적중률 28~32%, 진입 약 1/230, 룰렛 평균 약 45×, 예상 σ 약 5.2 |
| 베팅 레벨 | 50 / 100 / 250 / 500 / 1000 / 2500 (웨이당 1~50코인, 룰렛 정수 배수라 코인이 항상 정수) |
| 화면 용어 | 내부 이름 `songs`(곡)는 화면·도움말에서 **«남은 돌리기 N번»**으로 쓴다(곡=돌리기 기회라는 비유를 설명 없이 읽게 하지 않는다). «앙코르»는 «앙코르 +1번», «한 단계 위로»는 그대로 |
| 셀 크기 | 430px 78.8px, 390px 71.5px (`WAVE2` §4-4 5×4 행, 폭에 묶임) |

---

## 2. 그리드·페이·심볼

### 2-1. 심볼표 (11종, 빈칸 없음)

| id | ko / en | 등급 | 릴 | 실루엣 (28px 구분 기준) | 비고 |
|---|---|---|---|---|---|
| `wild` | 황금 마이크 / Golden Mic | 와일드 | 2~5 | 세로 막대 + 둥근 머리 | 응원봉 아님 |
| `bonus` | 무대 초대권 / Stage Pass | 보너스 | 1~5 | 기울어진 가로 직사각 + 끈 | 배당 없음, 3장 진입 |
| `idol_pink` | 핑크 센터 / Pink Center | 최상 | 전부 | 사이드 포니테일 흉상 | 분홍 |
| `idol_blue` | 블루 보컬 / Blue Vocal | 상 | 전부 | 단발 + 헤드셋 흉상 | 파랑 |
| `idol_gold` | 골드 댄서 / Gold Dancer | 상 | 전부 | 모자 + 땋은 머리 흉상 | 금색 |
| `lightstick` | 응원봉 / Lightstick | 중상 | 전부 | 원통 손잡이 + 빛나는 공 머리 | **재미 장치** |
| `album` | 앨범 / Album | 중 | 전부 | 정사각 케이스 + 반쯤 나온 원반 | |
| `heart_balloon` | 하트 풍선 / Heart Balloon | 중 | 전부 | 하트 + 곱슬 끈 | 파랑 호일 |
| `star_badge` | 별 배지 / Star Badge | 하 | 전부 | 별 | 금색 |
| `note` | 음표 / Music Note | 하 | 전부 | 겹음표 | 네온 분홍 |
| `ribbon` | 리본 / Ribbon | 하 | 전부 | 나비 리본 | 은색+분홍 |

### 2-2. 배당표 초안 (웨이당 베팅 단위, 경로 수를 곱한다)

| 심볼 | 3개 | 4개 | 5개 |
|---|---:|---:|---:|
| 핑크 센터 | 15 | 40 | 120 |
| 블루 보컬 | 12 | 30 | 90 |
| 골드 댄서 | 10 | 25 | 70 |
| 응원봉 | 8 | 18 | 50 |
| 앨범 | 6 | 15 | 40 |
| 하트 풍선 | 5 | 12 | 30 |
| 별 배지 | 3 | 8 | 20 |
| 음표 | 3 | 6 | 15 |
| 리본 | 2 | 5 | 12 |

- 값은 전부 정수다(웨이당 1코인 이상이라 지급이 항상 정수 — `schema.ts` 정수 검사 통과). 100 미만이라 튜닝 반올림은 정수 단위(HOWTO §3-e 2).
- 이론 최대: 20칸 전부 핑크 센터+와일드면 120 × 1024 ÷ 50 = 2,457.6× → 상한 2,000×에 걸린다. 도달률은 감사 리포트에 남긴다(사실상 0 예상).

### 2-3. 스트립 초안 (릴당 100칸 내외, 튜닝 전)

| 심볼 | 릴당 개수 | 근거 |
|---|---|---|
| `bonus` | 2 (간격 ≥ 4, 스트립 끝↔처음 이음매 포함 원형 간격) | 창 4행 → 릴당 노출 q = 0.08. P(3장 이상) ≈ 10q³(1−q)² + 5q⁴(1−q) + q⁵ ≈ 0.0045 ≈ 1/221. 4장 이상 비율 약 4% |
| `lightstick` | 10 | 화면당 평균 2.0개(5릴 × 4행 × 0.10). 불빛 분포의 중심 |
| `wild` | 릴 2~5에 2~3 | HOWTO §3-d: 앞 3릴이 적중률, 뒤 2릴이 4·5개 배당 |
| 하위 3종 | 교차 배치 | §3-d 1번 «채움 심볼 교차»로 3연속 적중률을 누른다 |

`pack:check`에 경고 추가: `bonus`가 한 릴에서 **원형** 간격 < `rows`면 경고(한 창 2장 = 진입 계산이 어긋남).

응원봉 밀도는 재미 장치의 손잡이라 튜닝 1단계에서 고정한다. 기본 몫에서 응원봉이 차지하는 비중이 너무 크면 밀도가 아니라 **응원봉 배당**을 «중» 수준(6/15/40)으로 내린다.

---

## 3. 무대 룰렛 규칙 전문

### 3-1. 트리거

- **유료 스핀**에서 화면(`grid`)의 무대 초대권이 **3장 이상**이면 그 스핀 안에서 무대 룰렛을 정산한다.
- **4장 이상이면 가운데 고리에서 시작**한다(바깥 고리를 건너뛴다). 5장도 가운데 고리다.
- 이 게임에는 프리스핀이 없다. 룰렛 안에서 룰렛이 다시 열리는 일(리트리거)도 없다.
- 트리거 스핀의 기본 ways 승리는 평소대로 지급하고, 룰렛 상은 그 위에 더한다.

### 3-2. 판 구성 (초안 — 칸 크기는 모두 같고 확률도 칸 수 비율 그대로)

칸은 시계 방향 인덱스(포인터 12시 = 0번 칸 시작). «×n»은 총 베팅 배수.

**바깥 고리 «객석»** (12칸: 코인 8 · 위로 2 · 앙코르 2)

| 칸 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 내용 | ×3 | ×5 | 위로 | ×3 | 앙코르 ×3 | ×6 | ×4 | 위로 | ×8 | 앙코르 ×3 | ×4 | ×10 |
| 불 순서 | — | 2 | — | 5 | — | **1** | 4 | — | 6 | — | 3 | — |

불 순서 `litOrder = [5, 1, 10, 6, 3, 8]` (1번째 불은 5번 칸 ×6 → ×12). 0번·11번 칸(×3·×10)은 켜지지 않는다.

**가운데 고리 «무대»** (10칸: 코인 6 · 위로 2 · 앙코르 2)

| 칸 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| 내용 | ×5 | 위로 | ×8 | 앙코르 ×5 | ×12 | ×6 | 위로 | ×15 | 앙코르 ×5 | ×20 |

`litOrder = [4, 2, 9, 5, 0, 7]`

**안쪽 고리 «센터»** (8칸: 코인 5 · 앙코르 2 · 대상 1, 위로 없음)

| 칸 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| 내용 | ×15 | 앙코르 ×15 | ×25 | **대상 ×120** | ×20 | ×30 | 앙코르 ×15 | ×50 |

`litOrder = [2, 4, 0, 5, 7]`

### 3-3. 진행

상태: `ring`(0 바깥 / 1 가운데 / 2 안쪽), `songsLeft`(시작 3), `encoresUsed`(시작 0), `total`.

한 번 돌릴 때마다 지금 고리에서 칸 하나가 정해진다(서버 RNG, 칸마다 같은 확률).

| 칸 | 지급 | 상태 변화 |
|---|---|---|
| 코인 ×v | v × 총 베팅 (불 켜진 칸이면 2v) | `songsLeft −1` |
| 한 단계 위로 | 없음 | `ring +1`. 곡을 쓰지 않고 **곧바로 안쪽 고리를 돌린다**. 안쪽으로 간 고리는 공연 끝까지 유지(한 방향) |
| 앙코르 ×v | v × 총 베팅 (불 대상 아님) | `encoresUsed < 2`면 `encoresUsed +1`이고 **곡을 쓰지 않는다**(= 한 곡 더). 2번 다 쓴 뒤 앙코르 칸은 코인 칸처럼 상만 주고 `songsLeft −1` |
| 대상 ×120 | 120 × 총 베팅 (불 대상 아님. 불 켜진 안쪽 최고 코인 ×50→×100보다 항상 크다) | `songsLeft −1` — 코인 칸과 같다. **공연을 끝내지 않는다** |

종료: `songsLeft = 0` 또는 지급 캡 도달.

> 원안의 «피날레 ×150 = 공연 즉시 종료»는 검수에서 뺐다. 안쪽 고리에 곡 3개를 들고 들어간 순간(위로·위로로 시작) 남은 공연의 기대값이 130~187×라 ×150에 서면서 **오히려 손해를 보는 «최고 상»**이 됐다(검수 반영 R1).

### 3-4. 종료 보장 (카탈로그 §4 규칙 1~3)

- **단조 감소 척도** `M = songsLeft + (2 − ring) + (maxEncores − encoresUsed)`. 코인·대상·위로·앙코르(상한 전)·앙코르(상한 후) 모두 정확히 1씩 줄인다. 시작값은 바깥 고리 7, 가운데 고리 6이므로 **회전은 최대 7회**다.
- **정수 하드 캡**: `maxEncores = 2`, 고리 수 3(위로 최대 2회), `songs = 3`. 스키마가 `songs + (rings − 1) + maxEncores ≤ 12`를 정적으로 검사하고, 엔진은 회전 7회 초과 시 예외(도달 불가 단언).
- **재진입 없음**: 룰렛 안에 트리거가 없으므로 `count × p < 1` 검사 대상이 아니다.
- **지급 캡**: 한 스핀 합(ways + 룰렛)이 `2,000 × 총 베팅`을 넘으면 넘는 몫을 자르고 `winCapped` 피처를 남긴다. 룰렛은 그 자리에서 끝낸다(남은 곡 무효). 감사 도구에 똑같이 적용된다(같은 엔진 경로).

### 3-5. 응원봉 불빛 (재미 장치)

- `cheer = 트리거 스핀 grid의 lightstick 칸 수`(와일드 제외). `lit = min(cheer, maxLit=6)`.
- 고리마다 `litOrder`의 앞 `min(lit, 그 고리 litOrder 길이)`개 코인 칸에 불이 켜진다. 불 켜진 칸의 코인 상은 `litMultiplier = 2`배.
- **RNG를 쓰지 않는다.** 켜지는 칸은 개수와 고정 순서로만 정해진다 → 도움말에 번호로 그릴 수 있다.
- 유료 스핀 사이로 넘어가지 않는다(다음 스핀의 응원봉은 다음 스핀의 룰렛에만 쓰인다).
- 응원봉이 7개 이상이면 칩은 «응원봉 ×7 · 불 6칸»처럼 실제로 켜지는 칸 수를 함께 쓴다(개수와 불 수가 달라 보이는 혼란 방지).

### 3-6. 수치 미리보기 (DP 정확값, 4장 시작 비율은 4%로 가정)

| 응원봉 수 | 0 | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---:|---:|---:|---:|---:|---:|---:|
| 바깥 시작 평균 | 36.9× | 41.1× | 44.3× | 48.3× | 51.6× | 55.8× | 59.3× |
| 가운데 시작 평균 | 78.3× | 86.7× | 92.8× | 101.5× | 109.0× | 120.2× | 124.5× |

- (검수 재계산, 대상 ×120·공연 계속 기준) 혼합 평균 약 45.3×. 트리거 스핀은 20칸 중 3칸이 초대권이라 응원봉 수는 평균 **1.7**의 포아송으로 근사했다(원안 2.0). 표준편차 약 45×, `E[X²]` 약 4,100.
- 분포(MC 100만): 15× 미만 8.0% · 15~20× 16.0% · 20~40× 43.9% · 40~80× 17.9% · 80~150× 8.8% · 150× 이상 5.3%.
- 가운데 고리 도달 50%, 안쪽 고리 도달 22%, 대상 착지 약 5.8%(진입 대비), 평균 회전 4.4회. 최대 390×(위로·위로·앙코르 ×15·앙코르 ×15·대상 세 번).
- 검산 스크립트: `D:/park/tgslot-wt/_qa/new-c-critic/ev3.mjs`(저장소 밖).

---

## 4. RNG·상태·API 계약

### 4-1. RNG 소비 순서 (계약)

```
릴 정지 5회 (nextInt(strip.length)) → 뮤테이션 없음 → ways 평가 (0회) → 초대권 수 (0회)
→ [트리거 스핀] 응원봉 수·불 켜진 칸 (0회) → 룰렛 회전마다 nextInt(ring.segments.length) 1회 (3~7회)
→ [API] 잭팟 판정 1회
```

- 비트리거 스핀은 `nextInt` 5회, 트리거 스핀은 5 + 회전 수. 회전 수는 결과로 결정되므로 `seedInput + totalBet`만으로 전부 재생된다(`stateBefore` 불필요 — 유료 스핀만 있다).
- 잭팟은 엔진 밖(API)에서 엔진 호출 **뒤에** 뽑으므로 순서가 저절로 지켜진다(`routes/games.ts`의 `spinWithState → jackpotRoll`).
- `stageRoulette.test.ts`가 호출 수를 고정한다(비트리거 5, 트리거 5 + steps.length).

### 4-2. 엔진 타입 (`packages/slot-engine/src/types.ts`, 추가만)

```ts
export type RouletteSegmentKind = 'coin' | 'stepUp' | 'encore' | 'grand'
export interface RouletteStep {
  ring: number            // 돌린 고리
  segment: number         // 선 칸 인덱스
  kind: RouletteSegmentKind
  lit: boolean            // 불 켜진 코인 칸이었나
  win: number             // 이 회전 지급 코인 (캡 적용 후)
  encoreCounted: boolean  // 앙코르가 곡을 늘렸나 (상한 전이면 true)
  songsLeft: number       // 이 회전 뒤 남은 곡
}
export interface StageRouletteTrigger {
  type: 'stageRoulette'
  bonusCount: number
  positions: GridPosition[]       // 초대권 칸 (강조용)
  cheer: number                   // 응원봉 수 (상한 전 원래 개수)
  cheerPositions: GridPosition[]  // 응원봉 칸 (불빛 토큰 출발점)
  lit: number[][]                 // 고리별 불 켜진 칸 인덱스
  startRing: number               // 0 또는 1
  steps: RouletteStep[]
  total: number                   // 룰렛 지급 합 코인 (캡 적용 후)
  endedBy: 'songs' | 'capped'
}
// FeatureTrigger 유니온에 StageRouletteTrigger 추가
// SpinResult += rouletteWin?: number   (감사 기여도용. totalWin에 이미 포함)
```

`RoundState`는 건드리지 않는다. 룰렛은 스핀 안에서 끝나므로 `nextState`도 `carry`도 없다.

### 4-3. 응답 계약 (`packages/shared`)

- `FeatureTriggerSchema` 유니온에 `stageRoulette` 객체 추가(위 모양 그대로, 정수·인덱스 범위 검사).
- `SpinResponse`는 **필드 추가 없음.** 룰렛은 `features[]` 안의 피처 하나다. 허브는 `feature.total`을 읽는다.
- 응답 크기: 회전 7회 최악에서 피처 약 0.7KB.
- `GET /games/:id/math`가 이미 math를 공개하므로 허브는 **결과 전에** 판(칸 라벨·불 순서)을 그릴 수 있다. 어느 칸에 설지는 스핀 응답에만 있다(카탈로그 §2 #10의 "당첨 인덱스는 응답에서만" 원칙).

### 4-4. API 경로별 영향

| 경로 | 바뀌는 것 | 근거 |
|---|---|---|
| `POST /games/:id/spin` | 없음(엔진이 피처를 더 낼 뿐). `engineSpin.ts toSharedFeature`에 `stageRoulette` 명시 분기 | candy O17: 미지의 피처는 `scatterWin`으로 떨어진다 → 반드시 분기 |
| 멱등 재전송 | 없음. `RoundRecord.features`(jsonb)에 피처가 통째로 저장되고 재전송은 저장값으로 조립한다 → **바이트 동일** | `routes/games.ts` 응답 조립이 `round.features`를 그대로 싣는다 |
| 시드 공개 `GET /rounds/:id/seed` | 없음. 허브 `handleRevealSeed`의 `replaySpin(math, bet, rng)`가 엔진을 다시 돌려 회전까지 재현하고 `totalWin`을 비교한다 | §4-1 RNG 계약 |
| `GET /games/:id/state` | 없음. 룰렛은 상태를 남기지 않는다 | — |
| 원장·미션·리더보드 | 없음. `round.win`에 룰렛 몫이 이미 들어 있다 | — |
| DB 마이그레이션 | **없음** | 새 컬럼 불필요 |
| 디버그 프리셋 | shared `SpinDebugPresetSchema`에 `roulette` · `rouletteInner` · `roulette4` 추가. `debugSpin.ts` 판정 함수, `routes/games.ts`에 «피처 없는 팩 409» 가드 한 줄 | candy H7과 같은 방식 |
| 체험판(`--mode demo`) | 없음. 같은 Hono 앱·같은 엔진이 탭 안에서 돈다. 디버그는 체험판에서 원래 닫혀 있다 | `apps/hub/src/demo/server.ts` |

디버그 탐색 확률: `roulette` 약 1/230(기본 5,000회로 충분), `rouletteInner` 약 1/1,100, `roulette4` 약 1/5,500 → 허브가 이 둘은 `maxTries: 20000`(스키마 상한)을 보낸다. ways 스핀은 약 10µs라 2만 회 약 0.2s, 락 15s에 여유롭다.

### 4-5. 새로고침·재진입 복원

- **정산은 응답 시점에 끝난다.** 지갑·원장은 이미 확정이고 새로고침해도 코인은 그대로다.
- **연출만 이어 본다.** 허브는 응답을 받는 즉시 `sessionStorage['tgslot.roulette.v1']`에 `{ gameId, roundId, feature, baseWin, totalWin, shownSteps }`를 쓰고, 회전 연출 하나가 끝날 때마다 `shownSteps`를 올리고, 종료 팝업에서 지운다(접근은 전부 try/catch).
- 캐시는 쓴 지 **10분**이 지났거나 `gameId`가 다르면 버린다(오래된 연출이 다음 날 튀어나오지 않게). 이어 보기 중에도 스핀 버튼은 잠그지 않고, 새 스핀을 누르면 캐시를 지운다.
- 같은 게임 화면에 다시 들어왔을 때 캐시가 있으면 «무대 룰렛 이어 보기»로 `shownSteps` 다음 회전부터 재생한다. 캐시는 **표시용**이다. 잔액은 언제나 `/me`의 서버 값이다.
- 캐시가 없으면(다른 기기, 지워진 저장소) 이어 보기 없이 잔액만 반영된다. 결과가 이미 지급됐으므로 손해는 없다.

---

## 5. 수학·튜닝·감사

### 5-1. RTP 분해 목표

| 몫 | 목표 | 손잡이 |
|---|---:|---|
| 기본 ways (트리거 스핀의 ways 포함) | 75.0 | 스트립 밀도 → 적중률, 페이테이블 선형 배율 → 몫 |
| 무대 룰렛 | 19.5 | 초대권 밀도 → 진입률(약 1/230), 판 값 선형 배율 → 평균(약 45×) |
| 합 | **94.5 ± 0.5** | |

- 룰렛 몫 = P(진입) × E[룰렛 | 진입]. E는 판 값에 **정확히 선형**이다(불빛 2배도 선형). 값을 α배 하면 룰렛 몫이 α배다.
- 응원봉은 지급 심볼이기도 해서 밀도를 바꾸면 기본 몫과 룰렛 몫이 함께 움직인다 → 튜닝 1단계에서 먼저 고정한다.

### 5-2. 튜닝 순서 (HOWTO §3-e를 따른다)

1. **스트립**: 적중률 28~32%, 응원봉 화면당 평균 2.0, 초대권 릴당 2(간격 ≥ 4). 적중률만 본다(표준오차가 작다).
2. **페이테이블 선형 배율** → 기본 몫 75.0. 100 미만은 정수 반올림.
3. **초대권 밀도·스트립 길이** → 진입률 1/230 ± 10%, 4장 이상 비율 3~6%.
4. **판 값 선형 배율** → 룰렛 몫 19.5. 값은 정수로 반올림하고 남는 오차는 칸 하나(예: 바깥 ×4 ↔ ×5)로 맞춘다. 1~2회 반복이면 끝난다.
5. 정식 감사, 다른 시드로 교차 확인.

체감 하한 게이트: 룰렛 결과 **15× 미만 비율 ≤ 10%**(초안 7.1%). 넘으면 바깥 고리 최저 칸을 올리고 안쪽 상위 칸을 내린다(평균 유지).

### 5-3. 감사 도구 변경 (`tools/rtp-sim`)

| 작업 | 파일 | 내용 |
|---|---|---|
| **해석 경로 차단 (1순위)** | `packages/slot-engine/src/analytic.ts` `isAnalytic` | `stageRoulette`가 있으면 false. **안 막으면 ways 닫힌 식이 룰렛을 뺀 RTP를 «정확값»으로 낸다**(뮤테이션 없는 ways 팩은 지금 `isAnalytic = true`다. astral은 뮤테이션이 있어 MC로 갔을 뿐이고 이 팩은 뮤테이션이 없다). 막지 않으면 `computeExactRtp`의 전수·표본 경로가 `rng` 없이 정산을 부르게도 된다 |
| 같은 경로 확인 | `src/audit/spinner.ts` | `drawSpin`이 `spinUnchecked`를 부르는지 확인(candy O3에서 고쳤음). 테스트 1건 |
| 룰렛 통계 | `src/audit/rouletteStats.ts`(새 파일), `contributions.ts`, `report.ts` | 분해 `ways / roulette`, 진입률, 시작 고리 비율, 응원봉 수 분포(0~6+), 고리 도달률, 칸별 착지율(기대값 = 칸 수 비율과 비교), 앙코르 사용 수 분포, 대상 착지율, 회전 수 분포(3~7, 7 초과 0건), 룰렛 결과 구간 분포, `endedBy` 비율, 캡 도달률 |
| 튜닝 화면 | `src/tune-cli.ts` | 위 지표 중 진입률·룰렛 평균·15× 미만 비율·적중률·σ·n*를 한 화면에 |

### 5-4. 파일럿 σ → n*

- 예상 σ: 기본 ways 약 3 + 룰렛 분산 몫 `E[X²]/230 ≈ 18` → σ² ≈ 27, **σ ≈ 5.2**.
- `n* = ⌈(1.96·σ̂·1.1/0.002)²⌉` ≈ (1.96 × 5.2 × 1.1 / 0.002)² ≈ **3,140만** → `manifest.auditSpins = 40,000,000`.
- 시간: ways 스핀 약 8~12µs(astral 8.4µs + 룰렛 분기) → 4천만 회 단일 약 6~8분, `--shards 4`면 약 2분. 파일럿 500만 약 15초.
- σ̂ > 7이면 대상을 낮추고(120 → 100, 단 불 켜진 안쪽 최고 코인보다는 커야 한다) 안쪽 코인을 올려 평균을 유지한 채 꼬리만 깎는다.

### 5-5. 게이트

| 관문 | 기준 |
|---|---|
| CI(40만, `games.test.ts`) | `\|rtp − target\| ≤ max(0.5%p, 3·SE)` + 재현성 + 정밀도 필드 |
| 정식 감사 | `\|rtp − target\| ≤ 0.5%p` **그리고** ci95 반폭 ≤ 0.2%p, `n ≥ n*` (`pnpm --filter @tgslot/rtp-sim run audit idol-stage-live --shards 4` → `docs/RTP_AUDIT_idol-stage-live.md`) |
| 기존 | 레벨별 ±0.5%p · 적중률 10~60%(목표 28~32) · 최대 배수 ≥ 100x · 분포 합 1 · 잭팟 포함 96.0 ± 0.5 |
| 룰렛 | 회전 수 ≤ 7(위반 0건) · 칸별 착지율이 칸 수 비율과 3SE 안 · 진입률 1/200~1/260 · 룰렛 평균 30~80× · 15× 미만 ≤ 10% · ways 몫 + 룰렛 몫 = 전체 |
| 캡 | 도달률과 캡 on/off 차를 명시 |
| 회귀 | 골든 6팩 해시 동일(`__golden__/hashes.json`) + candy 테스트 통과 + live 2M 수치 동일 |

---

## 6. 엔진·공용 패키지 변경 목록

원칙: **피처 로직은 새 파일, 공용 파일은 «추가 한 갈래»만.** 다른 두 신작이 같은 유니온·스위치·사전을 동시에 고치므로 병합 충돌이 줄 끝 추가에서만 나게 한다.

### 6-1. 새 파일

| 파일 | 내용 |
|---|---|
| `packages/slot-engine/src/stageRoulette.ts` | `countCheer(grid, math)`, `litSegments(math, lit): number[][]`, `playStageRoulette(math, startRing, lit, totalBet, capRemaining, rng): { steps, total, endedBy }`(순수 + rng), `resolveRouletteSpin(...)`(ways 평가 → 초대권 → 룰렛 → 캡 → `SpinResult`) |
| `packages/slot-engine/src/stageRoulette.test.ts` | 손으로 고른 RNG 시퀀스 8개(코인만 / 위로·위로 / 앙코르 상한 / 대상 뒤 공연 계속 / 가운데 시작 / 불빛 0·3·6 / 캡 절단), 척도 단조 감소, 최대 7회, RNG 호출 수, 스키마 거부 사례 |
| `packages/renderer/src/rouletteFeature.ts` (+test) | `stageRoulette` 피처 → 강조 단계 계획(초대권 칸 → 응원봉 칸) 순수 함수 |
| `apps/hub/src/lib/rouletteShow.ts` (+test) | 순수 계획: 회전마다 시작·끝 각도(결과 칸 중앙 ± 칸 폭 30% 안 지터는 시드 고정), 회전 바퀴 수, 모드별 시간, 줌 배율, 요약 합계. 같은 피처 → 같은 계획 |
| `apps/hub/src/lib/rouletteResume.ts` (+test) | §4-5 세션 캐시 읽기·쓰기·삭제(try/catch) |
| `apps/hub/src/lib/rouletteSfx.ts` | 룰렛 전용 효과음(틱·정지 4종·위로·앙코르·대상·불빛). audio.ts의 컨텍스트·버스를 import |
| `apps/hub/src/components/game/StageRoulette.tsx` + `.css` | 룰렛 오버레이(판·포인터·남은 돌리기·합계·돌리기/빠르게 멈춤/건너뛰기·요약 카드) |
| `apps/hub/src/components/game/RouletteWheel.tsx` | SVG 3겹 판 그리기(칸 경로는 math로 메모, 고리별 회전 transform만 바뀜) |
| `apps/hub/src/components/game/RouletteHelp.tsx` + `.css` | 도움말 «무대 룰렛» 절(§11) |
| `games/idol-stage-live/*` | manifest·math·theme·art·README·CHECKLIST |

### 6-2. 공용 파일 (추가 한 갈래씩)

| 파일 | 변경 |
|---|---|
| `slot-engine/src/schema.ts` | `stageRoulette` 선택 스키마 + refine(아래) |
| `slot-engine/src/types.ts` | §4-2 타입, 유니온 한 줄, `SpinResult.rouletteWin?` |
| `slot-engine/src/spin.ts` | `resolveSpin` 맨 앞 `if (math.stageRoulette) return resolveRouletteSpin(...)` 한 줄(+import). `rng`가 없으면 주문 라운드처럼 던진다(정산에 회전 추첨이 필요). 다른 팩 경로는 한 글자도 안 바뀐다 |
| `slot-engine/src/evaluate.ts` | `featureTriggerCount`에 `?? math.stageRoulette?.trigger` |
| `slot-engine/src/analytic.ts` | `isAnalytic` 제외 조건 한 개(§5-3 1순위) |
| `slot-engine/src/index.ts` | export 한 줄 |
| `shared/src/schemas.ts` | `FeatureTriggerSchema` 유니온 + 디버그 프리셋 3개 |
| `api/src/games/engineSpin.ts` | `toSharedFeature` 분기 |
| `api/src/games/debugSpin.ts` | 프리셋 판정 3개 |
| `api/src/routes/games.ts` | 409 가드 한 줄 |
| `renderer/src/features.ts`, `pixi/pixiRenderer.ts` | 피처 단계에 `stageRoulette` 갈래(초대권 강조 + `featureTriggered`), 응원봉 칸 강조는 기존 fx glow 재사용 |
| `renderer/src/types.ts`, `game-sdk/src/theme.ts` | `SoundPreset`에 `'idol'`(두 곳, candy O16) |
| `hub/src/components/game/GameScreen.tsx` | 피처 감지 → `StageRoulette` 마운트, 도움말 features 탭에 `RouletteHelp` 한 줄 |
| `hub/src/store/game.ts` | `roulette: StageRouletteTrigger \| null`(서버 응답으로만 채움), 연출 끝까지 잔액 표시 지연 |
| `hub/src/lib/debugPreset.ts` | `presetsFor`: `stageRoulette`면 3개 추가, `scatter.freeSpins` 없으면 `freeSpins` 제외(조건 일반화) |
| `hub/src/lib/audio.ts`, `bgm.ts`, `bgmVoices.ts` | `idol` 레시피·배경음 스타일을 표 끝에 추가 |
| `hub/src/i18n/ko.ts`, `en.ts` | `stageRoulette.*` 키를 사전 **끝에** |
| `tools/rtp-sim/src/audit/contributions.ts`, `report.ts`, `src/tune-cli.ts` | §5-3 |
| `tools/game-sdk validate`(pack:check) | 초대권 간격 경고 |

### 6-3. 스키마 (`math.json` 모양)

```json
"stageRoulette": {
  "trigger": 3,
  "startInnerAt": 4,
  "songs": 3,
  "maxEncores": 2,
  "cheer": { "symbol": "lightstick", "maxLit": 6, "litMultiplier": 2 },
  "rings": [
    { "id": "outer",  "segments": [{"kind":"coin","value":3},{"kind":"coin","value":5},{"kind":"stepUp"}, …], "litOrder": [5,1,10,6,3,8] },
    { "id": "middle", "segments": [ … ], "litOrder": [4,2,9,5,0,7] },
    { "id": "inner",  "segments": [ …, {"kind":"grand","value":120}, … ], "litOrder": [2,4,0,5,7] }
  ]
},
"round": { "maxWinCap": 2000 }
```

refine:
- 고리 2~3개, 고리당 칸 6~12개. `stepUp`은 마지막 고리 금지, 마지막 아닌 고리엔 1개 이상. `grand`는 마지막 고리에만, 정확히 1개, `value`는 모든 고리의 `coin.value × litMultiplier` 최댓값보다 크다(«최고 상»이 정말 최고인지 정적으로 보장). 고리마다 `coin` ≥ 1.
- `value`는 양의 정수(총 베팅 배수 → 코인 정수 보장).
- `litOrder`: 중복 없음, 그 고리의 `coin` 칸만 가리킴.
- `cheer.symbol`은 비와일드·비스캐터 심볼. `litMultiplier`는 1~3.
- `trigger ≤ reels`, `startInnerAt > trigger`(또는 생략), `songs + (rings − 1) + maxEncores ≤ 12`.
- `stageRoulette`가 있으면 `scatter`(초대권) 필수, `scatter.freeSpins`·`orderRound`·`cascade`와 동시 금지, `round.maxWinCap` 필수.

---

## 7. 화면 스토리보드 (390×844 / 430×932)

### 7-1. 기본 화면

```
430×932                               390×844
┌──────────────────────────┐ 0        ┌────────────────────────┐ 0
│ 헤더 (잔액·뒤로·메뉴) 56   │          │ 헤더 52                 │
├──────────────────────────┤          ├────────────────────────┤
│ 배경: 응원봉 바다 (어둡게)  │ ~110     │ 배경 ~95               │
│ ┌──────────────────────┐ │          │ ┌────────────────────┐ │
│ │ 마퀴: 조명 트러스 10%  │ │          │ │                    │ │
│ │ 5×4 릴 창 셀 78.8px   │ │ 프레임    │ │ 셀 71.5px          │ │ 프레임
│ │ (x 2–98%, y 11–88%)  │ │ 430×430  │ │                    │ │ 390×390
│ │ 받침: 무대 끝·풋라이트  │ │          │ │                    │ │
│ └──────────────────────┘ │          │ └────────────────────┘ │
│ WinStrip (당첨 금액) 48    │          │ WinStrip 48            │
│ 컨트롤 (베팅·스핀·오토) 120 │          │ 컨트롤 112              │
└──────────────────────────┘          └────────────────────────┘
```

- 당첨은 경로 이펙트(셀 glow + 펄스)로만 보인다. 선을 긋지 않는다. 금액은 WinStrip(컨트롤 위).
- 기대감: 초대권 2장 착지 → 남은 릴 감속 + 상승음(`featureTriggerCount` 경유, normal·quick만).

### 7-2. 피처 진입

| 단계 | 화면 | normal | quick | turbo | 모션 축소 |
|---|---|---:|---:|---:|---:|
| E1 | 릴 착지, ways 승리 A단계 | 기존 | 기존 | 기존 | 기존 |
| E2 | 초대권 칸 강조(금빛 glow, 티켓 뒤집힘 시트) + 진입음 | 900 | 700 | 450 | 300 |
| E3 | 응원봉 칸이 분홍으로 빛나고 작은 불빛이 프레임 위 칩 «응원봉 ×4»로 모임(`getCellRect` → DOM 토큰, 최대 6개) | 700 | 500 | 300 | 0(칩만) |
| E4 | 진입 클립(리본 테이프가 쏟아져 덮음), 덮인 순간 배경 → 룰렛 무대(`setMode` 기존 경로) | 3,000 | 3,000 | 1,500(앞부분 컷) | 0(즉시 컷) |
| E5 | 판이 아래서 떠오름(scale 0.85→1, 투명 → 불투명) | 500 | 400 | 250 | 0 |
| E6 | 칩에서 불빛 토큰이 하나씩 날아와 칸 점등(고리 순서: 바깥 → 가운데 → 안쪽, 토큰 1개가 세 고리의 같은 순번 칸을 차례로 켬) + 점등음 상행 | 160 × lit | 120 × lit | 60 × lit | 0(한 번에 켬) |

### 7-3. 룰렛 화면 (진행)

```
430 폭: 판 지름 395 (390 폭: 358)
┌──────────────────────────┐
│ 헤더 (메뉴 잠금)            │
│ 무대 룰렛 · 바깥 고리 «객석» │  ← 지금 고리 이름 16px
│ 남은 돌리기 ♪♪♪  앙코르 ◇◇ │  ← 돌리기 점 3 + 앙코르 칸 2 (쓰면 채워짐)
│ 응원봉 ×4                   │  ← E3 칩이 그대로 남음
│        ▼ (포인터)           │
│   ╭──── 바깥 12칸 ────╮      │  바깥 띠 두께 0.24R, 칸 호 폭 약 82px(@358)
│   │ ╭── 가운데 10칸 ─╮ │      │  가운데 띠 0.22R, 호 약 73px
│   │ │ ╭─ 안쪽 8칸 ─╮ │ │      │  안쪽 띠 0.22R, 호 약 60px
│   │ │ │  중앙: 합계  │ │ │      │  중앙 원 0.32R
│   │ │ ╰───────────╯ │ │      │
│   │ ╰──────────────╯ │      │
│   ╰──────────────────╯      │
│ 무대 룰렛 합계  12,500       │  ← WinStrip 자리 (컨트롤 위)
│ [   돌리기   ] [건너뛰기]     │  ← 스핀 버튼 자리 재사용
└──────────────────────────┘
```

- **칸 라벨**: 코인 «×6»(굵게 16px@390, 18px@430), 불 켜진 칸은 분홍 바탕 + 작은 응원봉 아이콘 + **이미 2배 된 값** «×12». 위로 칸 «▲ 위로», 앙코르 «앙코르» + 아래 작은 «×3», 대상 «★ 대상» + «×120». 최소 글자 13px.
- **고리 강조**: 지금 고리만 원색, 나머지는 밝기 40%·채도 낮춤. 지금 고리 가장자리 전구가 순서대로 깜박인다(원 둘레를 도는 점멸, 사선 광택 없음).
- **포인터**: 12시 고정, 지금 고리의 띠 위를 가리킨다. 위로 칸에 서면 안쪽 띠로 미끄러져 내려간다.
- **탭 «돌리기»**: 결과는 이미 정해져 있다. 탭은 시작 신호일 뿐이고 타이밍이 결과를 바꾸지 않는다(도움말에 명시). 오토스핀 중이거나 **2초** 동안 탭이 없으면 자동으로 돈다(원안 3초 — 탭 없이 보는 사람은 회전마다 기다림이 쌓여 평균 공연이 35s를 넘는다).

회전 연출 시간(지금 고리만 돈다, 감속은 ease-out cubic, **결과 칸으로 단조 감속** — 정해진 칸을 지나쳤다 되돌아오는 가짜 아슬아슬 연출 금지):

| 모드 | 회전 | 결과 연출: 코인 / 위로 / 앙코르 / 대상 |
|---|---:|---|
| normal | 2,400 (3~4바퀴) | 700 / 1,100(줌인) / 900 / 2,000 |
| quick | 1,600 | 500 / 800 / 600 / 1,500 |
| turbo | 1,000 | 300 / 500 / 400 / 1,000 |
| 모션 축소 | 350(회전 없이 칸 점프 + 페이드) | 300 / 300 / 300 / 600 |

- **코인**: 선 칸이 펄스, 금액이 중앙 합계로 날아가 더해진다. 롤업은 단조 증가.
- **위로**: «한 단계 위로!» 배지, 판 전체가 줌인(가운데 고리 시 scale 1.25, 안쪽 고리 시 1.5 — 안쪽 칸 라벨이 커져 390px에서도 읽힌다). 바깥 고리는 화면 밖으로 일부 나가도 된다. 곧바로 안쪽 고리 회전(자동, 탭 없음).
- **앙코르**: 함성 + 앙코르 칸 하나 채움 + 곡 점 하나 되살아남. 상한 뒤 앙코르 칸은 «앙코르» 글자가 흐려지고 값만 남는다.
- **대상**: 판 정지 → 안쪽 고리 전구 전부 점등 → 별 파티클 → «대상 ×120» 배지 → 돌리기가 남았으면 곡 점 하나를 끄고 다음 회전, 없으면 요약.
- **STOP**: 회전 중 탭 = **빠르게 멈춤**(남은 감속을 350ms로 압축, 같은 칸). 두 번째 탭 무시.
- **건너뛰기**: 남은 회전을 회전당 300ms로 압축 재생(효과음은 정지음만) 후 요약. 결과·금액 동일.

### 7-4. 종료

| 단계 | 화면 | normal | turbo |
|---|---|---:|---:|
| X1 | 요약 카드(중앙): 회전 기록 줄(«바깥 ×12 · ▲ · 가운데 앙코르 ×5 · 가운데 ×15 …»), 룰렛 합계, 이번 스핀 총 당첨. 탭으로 닫기 / 자동 2.5s | 2,500 | 1,200 |
| X2 | 퇴장 클립(하트 풍선이 터지며 걷힘), 덮인 순간 기본 배경 복귀 | 3,000 | 1,500 |
| X3 | WinStrip «무대 룰렛 +12,500» 롤업, 잔액 반영 | 기존 | 기존 |
| X4 | 빅윈 등급이면 셀레브레이션 1회(스핀 `totalWin` 기준, 룰렛 끝난 뒤에만) | 기존 | 기존 |

### 7-5. 시간 예산 (평균 회전 4.4회, 탭 대기 제외)

| 모드 | 합 | 게이트 |
|---|---:|---:|
| normal | 약 1.6 + 3.0 + 1.1 + 4.4 × 3.2 + 2.5 + 3.0 ≈ 25s | ≤ 28s |
| quick | ≈ 17s | ≤ 19s |
| turbo | ≈ 9s | ≤ 10s |
| 모션 축소 | ≈ 4s | ≤ 5s |
| 건너뛰기 누른 뒤 | ≤ 300ms × 남은 회전 + 요약 | ≤ 2.4s |

### 7-6. 레이아웃 고정 규칙

- 룰렛은 **허브 DOM 오버레이**(캔버스 위). 캔버스 리사이즈 0회.
- 판 지름 = `min(프레임 폭 × 0.92, 가용 높이 × 0.62)`, **가용 높이 = 화면 높이 − 헤더 − WinStrip − 컨트롤**(430: 708 → 439, 390: 632 → 392). 430에서 395px, 390에서 358px.
- 세로 검산: 판 + 위 정보 3줄(고리 이름·남은 돌리기·응원봉 칩, 약 96px) + 포인터 ≤ 프레임 상단~WinStrip 위 거리(430: 약 598px → 495px, 390: 약 537px → 458px). 넘치면 정보 줄을 2줄로 합친다.
- 헤더·컨트롤 높이 불변. 오버레이는 프레임 상단부터 WinStrip 위까지.

---

## 8. 아트

### 8-1. 컨셉

**애니 셀셰이딩 콘서트.** 깨끗한 진보라 선화 + 2단 셀 음영, 빛나는 것(응원봉·조명)에만 소프트 블룸. magi-stella(셀셰이딩 마법)와는 채도·조명 대비로 구분한다(카탈로그 §2 #11).
- 팔레트: 네온 핑크 `#ff5fa2`, 일렉 블루 `#4aa8ff`, 스포트 골드 `#ffd166`, 무대 암전 `#14101f`, 은 `#d9dde8`.
- 오리지널 3인조: 핑크 센터(긴 분홍 사이드 포니테일 + 금별 핀, 분홍·흰 리본 깃 의상), 블루 보컬(파란 웨이브 단발 + 헤드셋 마이크, 은색 테 재킷), 골드 댄서(금발 땋은 머리 + 별 달린 모자, 크롭 재킷). **실존 그룹·인물·기존 캐릭터를 닮게 하지 않는다**(눈 검수 항목).

`art/prompts.json` 공통 문구:

```
stylePrefix: Anime idol concert slot icon, clean 2D anime cel-shaded illustration with crisp dark plum line art and two-tone cel shading, soft bloom only on glowing light sources, vivid neon pink (#ff5fa2), electric blue (#4aa8ff) and spotlight gold (#ffd166) accents against deep stage night (#14101f), bold simple silhouette that reads at 64px, centered single subject, no watermark, no baked-in drop shadow, premium mobile slot game asset quality —
negative: photorealistic photography, 3D render, glossy plastic, diagonal light streaks, lens flare streaks, blurry, out of focus, watermark, signature, text, letters, numbers, random glyphs, logos, busy cluttered background, baked-in drop shadow, cropped edges, multiple duplicate objects, real person likeness, cheap clip-art look
```

(candy의 negative에 있던 `faces, eyes`는 멤버 심볼 때문에 뺀다. `diagonal light streaks`는 사용자 취향 «사선 광택 금지»라 넣는다.)

### 8-2. 자산 목록 (생성 18장 + 클립 2편, 판·포인터·도움말 그림은 코드)

| id | kind | size → out | 프롬프트 초안 / 메모 |
|---|---|---|---|
| `wild` | symbol | 1024² → 512 | golden stage microphone standing upright, small star on the grille, pink ribbon wrapped around the handle, tiny sparkles |
| `bonus` | symbol | 1024² → 512 | glowing pink-and-gold concert pass ticket tilted 15°, star-shaped punch hole, short lanyard, completely blank face (no text) |
| `idol_pink` | symbol | 1024² → 512 | head-and-shoulders bust of an original anime idol girl, long pink hair in a high side ponytail with a gold star clip, pink and white stage outfit with a ribbon collar, winking with a warm smile, facing front |
| `idol_blue` | symbol | 1024² → 512 | bust of an original anime idol girl, short wavy blue bob, slim headset microphone, blue jacket with silver piping, singing with eyes closed |
| `idol_gold` | symbol | 1024² → 512 | bust of an original anime idol girl, gold blonde braided hair under a small cap with a star, cropped gold jacket, energetic grin |
| `lightstick` | symbol | 1024² → 512 | concert penlight standing upright on its own, slim cylindrical handle, round glowing pink orb head with soft bloom — 토큰 @128, 판 아이콘 @24에서도 읽혀야 함 |
| `album` | symbol | 1024² → 512 | square music album case with a shiny disc half slid out, pink cover with a star pattern, no text |
| `heart_balloon` | symbol | 1024² → 512 | electric blue foil heart balloon with a curly ribbon string |
| `star_badge` | symbol | 1024² → 512 | gold star-shaped fan badge pin with a pink rim |
| `note` | symbol | 1024² → 512 | neon pink double music note |
| `ribbon` | symbol | 1024² → 512 | silver and pink ribbon bow |
| `frame` | frame | 1024² → 1080 | 무대 트러스 프레임. **창 x 2–98%, y 11–88%(약 5:4 가로형)**, 창 안 순수 `#00FF00`·아무것도 그리지 않음, 위 띠 y 0–10%: 조명 트러스 + 작은 둥근 PAR 조명(분홍·파랑·금) + 가운데 작은 별, 아래 띠 y 89–100%: 무대 앞끝 + 풋라이트 + 작은 스피커, 좌우 레일 ≤ 1.5%. candy frame 문장 구조(«EXACT LAYOUT…», «창이 캔버스 좌우 끝에 거의 닿는다») 그대로 |
| `bg` | bg | 1024×1536 → 1080 | 무대에서 본 밤 공연장: 분홍·파랑 응원봉 바다, 관객은 얼굴 없는 실루엣, 위에서 아래로 곧게 떨어지는 조명 기둥, 채도 낮게, 릴 뒤 가운데는 더 어둡게(`reelBackdrop`) |
| `bgFreeSpins` | bg | 1024×1536 → 1080 | **룰렛 무대**: 정면 낮은 시점의 둥근 무대, 바닥에 원형 LED 고리 무늬, 위에서 곧게 내리는 분홍·파랑·금 조명, 양옆 LED 스크린엔 추상 별, **가운데는 비워 둠**(판이 그 위에 놓인다), 공연자 없음. theme 키 이름은 기존대로 |
| `thumb` | thumb | 1536×1024 → 640 | 세 멤버가 거대한 3겹 룰렛 앞에 서 있고 분홍 불 켜진 칸들이 빛나며 리본 테이프가 흩날린다, 글자 없음 |
| `wild-win` | sheet 3×3 @12fps | 1024² → 768 | 마이크가 한 바퀴 돌며 별이 튄다 |
| `bonus-win` | sheet 3×3 @12fps | 1024² → 768 | 초대권이 뒤집히며 금빛으로 빛난다(진입 E2에 사용) |
| `idol_pink-win` | sheet 3×3 @12fps | 1024² → 768 | 윙크하며 별 반짝 — **선택 자산**(Codex 한도·일정이 남을 때 D3 끝에. 없으면 기존 공용 심볼 승리 이펙트) |
| 무대 룰렛 판 | **코드(SVG)** | — | 칸 경로·라벨·불 켜짐·전구 점멸·고리 밝기. 숫자가 math와 반드시 같아야 하므로 이미지 생성 금지 |
| 포인터 | **코드** | — | 분홍 삼각 + 금 테두리, 착지 때 살짝 튐 |
| 불빛 토큰 | **코드 + `lightstick` @128** | — | 같은 DOM 노드 6개를 풀로 재사용 |
| 요약 카드·곡 점·칩 | **코드(CSS)** | — | |
| 도움말 그림 | **코드(SVG 미니 판)** | — | math 값으로 그린다 |
| `fs-enter` / `fs-exit` | 전환 클립(SeeDance) | 360×640, 3.0s, 16fps q60 | §10 |
| `celebration` | theme.json | — | `shapes: ['star','confetti','spark','badge']`, `motion: 'flutter'`, 광선 스타일 `halo`(`beams`·`sunburst`는 사선 광택처럼 보여 쓰지 않음), font `rounded` |
| `sound` | theme.json | — | `{ "preset": "idol" }` |

### 8-3. 생성 절차와 검수 (지난 실패에서 나온 것)

- `pnpm --filter @tgslot/theme-gen gen games/idol-stage-live --provider codex --only <자산>`으로 **한 번에 1~2장.** 순서: `lightstick`(스타일 락) → 멤버 3 → 나머지 심볼 → frame → bg 2 → thumb → 시트 3.
- 매 회 `pnpm --filter @tgslot/theme-gen contact games/idol-stage-live`로 컨택트 시트를 열어 id ↔ 그림 1:1 확인(회수 오류로 다른 자산이 들어온 적 있음). 멤버 셋이 같은 얼굴로 나오면 재생성.
- 프레임: 창 안 흰 칠에 자동 감지가 속는다 → 알파 투명 영역을 실측해 `frameLayout.window`가 x 0.02/0.96, y 0.11/0.77 ±1%인지 확인. 430px에서 5열이 창에 맞는지 브라우저로 본다.
- 중단된 gen은 `theme.json`에 마지막 자산만 남긴다 → `--reprocess`로 다시 채우고 `pack:check` 0/0.
- 한도 소진 시 로컬 SDXL로 대체하지 않는다. 멈추고 남은 목록을 리드에게 보고.

---

## 9. 효과음·배경음 (`idol` 프리셋)

### 9-1. 효과음 레시피 (기존 프리셋과 구별되는 축)

| 이벤트 | 레시피 | 노리는 판독 | 기존과 구별 |
|---|---|---|---|
| 스핀 시작 | 짧은 신스 상승 스윕(saw + 로우패스 열림 250ms) | "a synth whoosh" | candy 거품·fruit 팝과 다름 |
| 릴 정지 | **손뼉**: 대역 잡음 1.4~2.2kHz 25ms × 2겹(8ms 어긋남) + 3kHz 짧은 사인 핑 | "a hand clap" z ≥ 2.5, 킥 판독 금지 | bell 나무 노크·western 스네어·shrine 딱따기와 다름 |
| 작은 당첨 | 신스 브라스 3음 장조 아르페지오(saw, 필터 엔벨로프) | "a pop synth jingle" | candy 글로켄과 음색 다름 |
| 큰 당첨 | 4박 킥 2마디 + 코드 스탭 + 짧은 상승 | "an upbeat EDM stinger" | |
| 기대감 | 공용 상승음 + 손뼉 롤 가속 | "a rising noise sweep" + clap roll | |
| 피처 진입 | **함성**: 대역 잡음 0.5~3kHz 0.8s 스웰 + 빠른 트레몰로(8Hz) + 코드 스탭 | "a crowd cheering" | 유일한 함성 |
| 룰렛 틱 | 2.8kHz 사각파 8ms, 칸 경계를 지날 때마다(최소 간격 25ms로 묶음), 회전이 느려질수록 간격이 벌어짐 | "a clicking ratchet" | |
| 정지 · 코인 | 코인 차임 2음(5도) | "a coin chime" | |
| 정지 · 위로 | 신스 상승 스윕 + 탐 필 4타(900ms) | "a drum fill" | |
| 정지 · 앙코르 | 함성 짧게 + 손뼉 3번 | "crowd cheering and clapping" | |
| 정지 · 대상 | 풀 코드 + 크래시(잡음 버스트) + 함성 2s | "a triumphant fanfare" | |
| 불빛 점등 | 고역 '휭' 120ms, 점등마다 반음씩 올라감 | "a magic sparkle" | |

### 9-2. 배경음 (`bgm.ts BGM_STYLES.idol`, `bgmVoices.ts`)

- 기본: 128bpm 장조 신스팝, 4박 킥, 옥타브 베이스, 사각·톱니 리드, 2·4박 손뼉. candy(116bpm 글로켄)·fruit(스틸팬 계열)와 템포·음색 둘 다 다르게.
- 룰렛 모드(기존 `freeSpins` 변주 슬롯 재사용): +1키, 하이햇 16분, 하프타임 드럼 롤 빌드업. 회전 중엔 덕킹(−6dB), 대상 순간 −12dB.
- 기본값은 끔(허브 정책 그대로).

### 9-3. earshot 판정 (기록: `docs/SOUND_CHECK.md` «idol» 절)

- 이벤트별 WAV를 기존 하네스(OfflineAudioContext)로 렌더 → `match`(의도 문구 + 혼동 후보), `measure`(LUFS·true peak·decay), 꼬리 레벨.
- 기준: 의도 문구 z ≥ 2.5(짧은 원샷은 ≥ 2.0), 릴 정지 최상위가 "kick drum"이 아님, 같은 이벤트끼리 다른 프리셋과 CLAP 코사인 < 0.90, 꼬리 ≤ −60dB, 클리핑 0, 믹스 SFX − BGM ≥ +3dB, BGM LUFS −30~−32.
- 합성 함성이 "wind"/"rain"으로 읽히면 함성을 빼고 손뼉 롤로 대체한다.
- **수치는 참고값이고 최종 귀 판정은 사용자 몫**이라고 기록에 적는다.

---

## 10. 전환 클립 2편 (`TRANSITION_DESIGN` 규칙)

발주: 방향별 1편씩 2편($1.86), 실패 시 재발주 1편까지(총 ≤ 3편, $2.79). 13초로 뽑아 3초를 자른다(R2). 스크립트는 `D:/park/tgslot-wt/_tools/vidgen-t2v.mjs`가 있으면 재사용, 없으면 candy 때처럼 `vidgen.mjs`에서 이미지 첨부·16:9를 걷어 낸 t2v 변형을 그 자리에 만든다(`ratio 9:16`, `camera_fixed` 미전달, `generate_audio:false`). 키는 `node --env-file=D:/park/YD_Claude_RND/ben_suno/.env`로만. 컷 후 `pnpm --filter @tgslot/theme-gen check:clips`.

**손 회피 판단(R4).** 응원봉은 원래 손에 쥐는 물건이라 클립 주어로 쓰면 손·팔이 튀어나올 위험이 크다. 그래서 클립 주어는 **스스로 움직여도 어색하지 않은 콘서트 기물** — 테이프 캐논 리본과 하트 풍선 — 로 정했다.

### 10-1. 진입 — 리본 테이프가 쏟아진다

> 무대 바닥의 작은 캐논들에서 분홍·파랑·은빛 리본 테이프가 터져 올라와 점점 빽빽해지고, **흩날리며 겹쳐 쌓이는 그 동작으로** 화면 전체를 덮는다. 덮인 뒤에도 리본은 계속 나부낀다.

**왜 이 팩인가.** 테이프 캐논은 공연의 클라이맥스 신호다. "지금부터 특별 무대"가 소리 없이 읽힌다. 리본은 겹치면 구조적으로 불투명해지고(R1), 가장자리가 계속 나부껴 단색 정지로 굳지 않는다(R11).

**규칙 적용.** R1 · R2(3초 사이클 ×4) · R3(본문 고정 문구) · R4(손·사람·글자 금지, 리본은 무늬 없음) · R5 · R7/R12(stylePrefix의 셀셰이딩·hex, negative의 photorealistic) · R8(터져 오름 = 덮임 한 동작) · R9(주어 «ribbon streamers»를 첫 문장에) · R11 · R13(겪은 실패만 금지 — «사선 광선»은 사용자 취향이라 예외로 넣음).

```
Vertical full-screen game transition effect, clean 2D anime cel-shaded illustration with crisp line art and two-tone cel shading, soft bloom only on glowing lights, not photorealistic, premium mobile game art. Shiny ribbon streamers in neon pink, electric blue and silver burst up from small confetti cannons along the bottom edge of a dark concert stage with round pink and blue stage lights behind. One continuous motion repeats: the streamers shoot up and pour in thicker and thicker, curling, overlapping and piling up in that same fluttering motion until the whole frame is completely opaque edge to edge, corner to corner, a seamless tangled mass of ribbons, holding fully covered for a beat while the ribbons keep fluttering and rippling so the covered frame is never a flat still color, then the ribbons fall away and the stage shows through before the next burst. The streamers bursting up and the frame being covered are one single motion, never separate steps. Each full cycle lasts about three seconds and repeats about four times across the clip. Neon pink #ff5fa2, electric blue #4aa8ff, spotlight gold #ffd166 and silver accents on deep stage night #14101f. The ribbons are completely plain. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals, no diagonal light streaks. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

### 10-2. 복귀 — 하트 풍선이 터지며 걷힌다

> 화면을 가득 채운 분홍 하트 풍선 표면이 출렁이다가 **펑 터지고, 그 터짐이 그대로 반짝이 조각을 바깥으로 날려 보내며** 무대가 드러난다.

**왜 이 팩인가.** 하트 풍선은 기본 심볼(하트 풍선)과 같은 소품이라 "룰렛 끝 → 기본 무대로"가 한 소품으로 이어진다. 진입이 «아래에서 쌓임»이니 복귀는 «가운데서 터져 바깥으로 흩어짐»으로 방향을 바꾼다(R6, 역재생 아님). 풍선은 덮인 상태에서 출렁임이 자연스럽다(R11). 복귀는 덮인 채 시작하므로 `opaqueMs: 0` 후보.

```
Vertical full-screen game transition effect, clean 2D anime cel-shaded illustration with crisp line art and two-tone cel shading, soft bloom only on glowing lights, not photorealistic, premium mobile game art. One giant matte pink heart-shaped balloon fills the entire frame edge to edge, corner to corner, its surface gently wobbling and rippling. One continuous motion repeats: the balloon pops with a soft burst and that same burst blows a shower of pink, blue and gold sparkle confetti outward to every edge of the frame, revealing a calm dark concert stage with round pink and blue stage lights, fully clear for a moment, then a new pink heart balloon swells up from the center and fills the whole frame again in complete opacity, holding fully covered for a beat while its surface keeps wobbling so the covered frame is never a flat still color, before it pops again. The pop and the confetti flying outward are one single motion, never separate steps. Each full cycle lasts about three seconds and repeats about four times across the clip. Neon pink #ff5fa2, electric blue #4aa8ff, spotlight gold #ffd166 accents on deep stage night #14101f. The balloon is completely plain. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals, no diagonal light streaks. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

### 10-3. 컷·검수

- 컷: 진입은 «맑음 → 완전 덮임»이 들어간 3.0s, 스왑 오프셋은 완전 덮임 시작 + 0.1s. 복귀는 덮인 프레임에서 시작하는 3.0s, 스왑 +0.0s.
- 규격: 360×640, 16fps, q60, 48프레임, 최대 프레임 ≤ 70ms(정지 구간 없음), 편당 ≤ 500KiB.
- 눈 검수: 손·사람·글자 0, 덮인 구간이 화면 전체(candy exit 1차처럼 65%만 덮으면 R1 위반 → 재발주), 사선 광선 없음, 애니 톤(실사 질감이면 R12 위반 기록).

---

## 11. 도움말 페이지

탭 구성은 기존 `paytable | ways | features | fairness`. 숫자는 전부 `math.json`에서 읽어 그린다(하드코딩 금지).

| 탭 | 절 | 내용 (그림 위주) |
|---|---|---|
| paytable | 배당표 | 심볼 이미지 + 3/4/5개 배당. 머리 문구 «웨이당 베팅액(총 베팅 ÷ 50) 기준». 응원봉 칸에 작은 «룰렛 불빛» 표시 |
| ways | 1024 ways | 기존 ways 그림(왼쪽 릴부터 인접 3개 이상, 칸 수 곱) |
| features | ① 진입 | 초대권 3장 그림 → 무대 룰렛. 4장 이상 그림 → «가운데 고리에서 시작» |
| | ② 판 | SVG 미니 판(3겹, 실제 칸 값). 고리 이름 객석·무대·센터. «모든 칸은 크기가 같고, 서는 확률도 같다» |
| | ③ 칸 네 종류 | 카드 4장: 코인(상 받고 곡 하나 씀) / ▲ 한 단계 위로(곡을 쓰지 않고 안쪽 고리로, 바로 다시 돌림, 다시 바깥으로 나오지 않음) / 앙코르(상 받고 곡 하나 더, 공연당 2번까지, 그 뒤엔 상만) / ★ 대상(가장 큰 상, 코인처럼 돌리기 하나 씀) |
| | ④ 응원봉 불빛 | 기본 화면에 응원봉 4개 그림 → 고리마다 코인 칸 4개에 번호 1~4로 불. «불 켜진 칸은 상이 2배 · 최대 6개(센터는 5개) · 켜지는 순서는 그림의 번호 순서로 고정 · 그 스핀에만 적용» |
| | ⑤ 돌리기와 끝 | 돌리기 점 3개 그림. «돌리기를 다 쓰면 끝 · 최대 7번 돌린다 · 룰렛 최대 390배 · 한 스핀 최대 2,000배» |
| | ⑥ 공정성 | «결과는 스핀하는 순간 서버가 정한다. ‘돌리기’ 버튼은 시작 신호일 뿐, 누르는 때가 결과를 바꾸지 않는다.» |
| fairness | 기존 | 시드 공개 검증이 룰렛 회전까지 재현한다는 한 줄 추가 |

i18n 키(사전 끝에 덧붙임, ko/en 동시): `stageRoulette.title`(무대 룰렛 / Stage Roulette), `.ring.outer|middle|inner`(바깥 고리 «객석» / Outer ring), `.seg.coin|stepUp|encore|grand`(코인 / 한 단계 위로 / 앙코르 +1번 / 대상 — Coin / Step Up / Encore +1 / Grand Prize), `.songsLeft`(남은 돌리기 / Spins left), `.cheer`(응원봉 ×{n} / Lightsticks ×{n}), `.lit`(불 켜진 칸 2배 / Lit spaces pay ×2), `.spin`(돌리기 / Spin), `.quickStop`(빠르게 멈춤), `.skip`(건너뛰기 / Skip), `.total`(무대 룰렛 합계), `.resume`(무대 룰렛 이어 보기), `.help.*`, 심볼 이름 11개(`idolStage.sym.*`).

---

## 12. 기능별 QA 확인표 (각 1회, 디버그 프리셋으로 상황을 만든다)

브라우저: `http://localhost:5330/#/play/idol-stage-live?debug=1`, 헤드리스 크롬 390×844·430×932 DSF 2, 스크린샷은 `D:/park/tgslot-wt/_qa/new-c-plan/`에서 직접 연다.

| 기능 | 만드는 법 | 확인 |
|---|---|---|
| 팩 계약 | `pnpm pack:check idol-stage-live` | 오류 0 · 경고 0 · 초대권 간격 경고 없음 |
| 기본 판독 | 일반 스핀 | 430 셀 ≥ 78, 390 셀 ≥ 71 · 11종 실루엣 구분 · 프레임 좌우 잘림 0 |
| 당첨 경로 | `win` | 선 없음, 셀 이펙트만 · WinStrip이 컨트롤 위 |
| 기대감 | 초대권 2장 착지 판(`roulette` 반복) | normal·quick 감속, turbo·모션 축소 꺼짐 |
| 진입 | `roulette` | 초대권 강조 → 응원봉 칩 수 = 서버 `cheer` → 클립 → 판 등장 |
| 응원봉 불빛 | `roulette`(응원봉 ≥ 1 판) | 켜진 칸 = 서버 `lit[]` · 표시 값이 2배 · 순서가 `litOrder` |
| 회전 결과 | `roulette` | 모든 회전에서 포인터 칸 = 서버 `steps[i].segment` · 되돌아오는 감속 없음 |
| 한 단계 위로 | `rouletteInner` | 줌인 · 포인터 안쪽 이동 · 곡 점 그대로 · 바깥으로 안 돌아감 |
| 4장 시작 | `roulette4` | 첫 회전이 가운데 고리 |
| 앙코르 | `roulette` 중 앙코르 판 | 곡 점 되살아남 · 3번째 앙코르는 «앙코르» 흐림 + 곡 소비 |
| 대상 | `rouletteInner` 반복(대상 착지는 안쪽 도달의 약 4번에 1번) | «대상 ×120» 연출 뒤 돌리기 점 하나 줄고 남았으면 다음 회전 · 표시 값 = 서버 `steps[i].win` |
| 종료 | 아무 진입 | 요약 합계 = 서버 `total` · WinStrip 총액 = `totalWin` · 롤업 되돌아감 0 |
| 빅윈 | 큰 룰렛 판 | 룰렛 끝난 뒤 셀레브레이션 1회만 |
| 빠르게 멈춤·건너뛰기 | 회전 중 탭 / 건너뛰기 | 같은 칸·같은 금액 · 압축 ≤ 2.4s · 두 번째 탭 무시 |
| 오토스핀 | 오토 10회 중 진입 | 탭 없이 자동 회전 · 끝나면 오토 계속 |
| 새로고침 이어 보기 | 회전 2번째에 `location.reload()` | «이어 보기»가 3번째 회전부터 · 잔액은 서버 값 · 캐시 삭제 확인 |
| 멱등 재전송 | 같은 `idempotencyKey`로 두 번 | 응답 바이트 동일 · 원장 1건 |
| 시드 공개 | 진입 라운드 검증 | `replaySpin` stops·steps·totalWin 일치 |
| 체험판 | `pnpm --filter @tgslot/hub build:demo` 후 정적 서빙 | ① 단위: 체험판 서버 앱(`demo/server.ts`)에 스핀을 반복 요청해 `stageRoulette` 피처가 실린 응답이 나오는지(평균 230회, 빠름) ② 눈: turbo 오토스핀으로 자연 진입 1회(제한 15분, 넘기면 ①만으로 통과 처리하고 기록). 서버 없이 스핀·진입·요약 동작 |
| 디버그 경계 | 다른 게임에서 `roulette` | 409 · 이 게임 패널에만 3종 노출 · `freeSpins` 프리셋 없음 |
| 도움말 | 도움말 열기 | 판 그림 값 = math · ko/en 키 누락 0 · 390에서 잘림 0 |
| 사운드 | 각 이벤트 1회 | earshot 기록 존재 · 틱이 감속에 따라 벌어짐 · 사용자 귀 판정 1회 |
| 배경음 | 진입·종료 | 기본 → 룰렛 변주 → 기본 · 회전 중 덕킹 |
| 메모리 | 진입 3회 후 디버그 패널 `diagnostics()` | 텍스처 수·풀 크기가 첫 진입 뒤와 같음 · 토큰 DOM 6개 유지 · 언마운트 후 진행 중 애니메이션 0 |
| 레이아웃 | 진입·종료 | 캔버스 리사이즈 0 · 헤더·컨트롤 높이 불변 |
| 로비 | 로비 카드 | `5×4 · 1024 ways` · 썸네일 |
| 회귀 | `pnpm -r --no-bail test` | 골든 6팩 · candy · 기존 7종 스핀 정상 |

---

## 13. 위험과 대안

| # | 위험 | 대안·완화 |
|---|---|---|
| K1 | 해석 경로가 룰렛을 빼고 RTP를 «정확값»으로 낸다 | §5-3 1순위로 `isAnalytic` 차단 + 감사 리포트 `RTP 계산` 줄이 몬테카를로인지 확인 테스트 |
| K2 | 390px에서 안쪽 고리 라벨이 작다 | 안쪽 진입 시 줌 1.5배. 그래도 13px 미만이면 바깥 고리를 12 → 10칸으로 줄여 띠 두께를 안쪽에 몰아 준다(수학은 칸 비율로 재튜닝) |
| K3 | 공연이 길어 지루하다(평균 25s) | quick/turbo, 건너뛰기, 오토 자동 회전. 위로 뒤 회전은 탭 없이 자동. 게이트 초과 시 결과 연출 시간부터 줄인다 |
| K4 | «탭 타이밍이 결과를 바꾼다»는 오해 | 결과 칸으로 단조 감속(가짜 아슬아슬 금지), 도움말 공정성 문장, 탭은 «시작»만(멈춤 타이밍 UI 없음) |
| K5 | 새로고침으로 연출이 끊긴다 | 정산은 이미 끝났다. 세션 캐시 이어 보기(§4-5). 캐시 없으면 잔액만 반영 |
| K6 | 체감 하한(작은 룰렛)이 실망스럽다 | 15× 미만 ≤ 10% 게이트, 바깥 최저 칸 상향으로 조정 |
| K7 | 응원봉 밀도가 기본 몫과 룰렛 몫을 같이 흔든다 | 튜닝 1단계에서 밀도 고정 후 두 손잡이(페이 배율·판 배율)는 서로 독립이라 선형으로 따로 맞춘다 |
| K8 | 생성 멤버가 실존 인물·기존 캐릭터를 닮는다 | 오리지널 외형 명세(머리색·머리모양·소품 조합), 컨택트 시트 눈 검수, 닮으면 머리모양부터 바꿔 재생성 |
| K9 | 클립에 손·사람이 나온다 | 주어를 리본·풍선으로(§10). 나오면 재발주 1편 안에서 해결, 그래도 실패면 단색 커튼 폴백 + 남은 문제 보고 |
| K10 | 합성 함성이 바람 소리로 읽힌다 | earshot 판독, 실패 시 손뼉 롤로 교체 |
| K11 | 다른 신작과 공용 파일 병합 충돌 | 새 파일 위주, 공용은 줄 끝 추가, i18n은 사전 끝. 유니온·스위치는 한 갈래씩 |
| K12 | hanbok 팀도 휠을 쓴다(카탈로그 원문) | 리드가 병합 전 확인(§0). 이름은 `stageRoulette`로 분리돼 코드 충돌은 없다 |
| K13 | 비연쇄 경로에 캡을 새로 건다 | 캡은 `resolveRouletteSpin` 안에서만. 다른 팩은 `math.round`가 없거나 연쇄 경로라 영향 0(골든) |
| K14 | Codex 사용 한도 소진 | 생성 순서를 판독 중요도 순으로(응원봉·멤버·프레임 먼저). 소진 시 중단·보고 |
| K15 | 판 점등·토큰·줌이 메모리를 쌓는다 | SVG 경로 메모, 토큰 6개 풀, 언마운트 시 WAAPI 애니메이션 cancel, 진입 3회 진단 비교 |

---

## 14. 팀 레인과 일정 (코어·연출·아트·사운드 각 1명 + 팀장)

| 레인 | 소유 | 핵심 산출 |
|---|---|---|
| 팀장(기획·통합) | `docs/*`, 계약 커밋 초안, 통합 QA, 이미지·클립 눈 검수 | 이 문서, 계약 동결, §12 |
| 코어 | `slot-engine`(새 파일 + 공용 한 줄들), `shared`, `apps/api`, `tools/rtp-sim`, `games/idol-stage-live/{math,manifest}.json` | 엔진·스키마·API·감사·튜닝 |
| 연출 | `renderer` 피처 단계, `apps/hub`(룰렛·도움말·store·디버그·i18n·복원) | 화면 전부 |
| 아트 | `games/idol-stage-live/{art,theme}/**`, `thumb.webp`, 클립 | 생성 18장 + 클립 2편 |
| 사운드 | `lib/audio.ts`(idol 표), `rouletteSfx.ts`, `bgm*.ts`, `SOUND_CHECK.md` 절 | 프리셋·earshot 기록 |

```
D0  팀장: 계약 동결 — §4-2 타입, §6-3 스키마, shared 피처·프리셋, 사운드 함수 스텁, math v0(판 초안 그대로)
D1  코어: stageRoulette.ts + 테스트 + isAnalytic   연출: rouletteShow.ts·RouletteWheel(픽스처 피처로)
    아트: 스타일 락(lightstick) → 멤버 3            사운드: 레시피 초안
D2  코어: API 분기·디버그·감사 통계·스트립 1차      연출: StageRoulette·진입/종료 흐름·도움말·복원
    아트: 나머지 심볼·frame·bg 2                   사운드: rouletteSfx·BGM
D3  코어: 튜닝 §5-2 → 파일럿 → 정식 감사(샤드 4)   연출: 시간 예산·STOP·건너뛰기·메모리
    아트: thumb·시트 3·클립 발주/컷                 사운드: earshot 판정·기록
D4  팀장: 통합(430/390) · §12 전부 · QA_LOG · 카탈로그 §2 #11 갱신 → status live 요청
```

임계 경로: **스키마 → stageRoulette.ts → isAnalytic 차단 → 튜닝 → 정식 감사.** 화면은 D1부터 픽스처 피처로 병렬 진행한다.

---

## 검수 반영 (기획 비평, 2026-11-26)

판정: **고쳐서 진행(revised).** 골격(세 곡 휠·응원봉 불빛·한 응답 정산)은 서버 권위·감사·병합 면에서 건전해서 유지했다. 재미를 거꾸로 만드는 규칙 1개와 용어·세부 몇 가지를 고쳤다. 검산 스크립트는 `D:/park/tgslot-wt/_qa/new-c-critic/`(`ev.mjs` 이어 하기 기대값, `ev2.mjs` 대안 비교, `ev3.mjs` 최종 수치).

| # | 무엇을 | 왜 |
|---|---|---|
| R1 | «피날레 ×150 = 공연 즉시 종료» → **«대상 ×120», 코인처럼 곡 하나 쓰고 공연 계속**. 스키마 `finale` → `grand`(마지막 고리 정확히 1개, 모든 불 켜진 코인보다 큼), `endedBy`에서 `finale` 삭제, 최대 380× → 390× | 위로·위로로 시작해 안쪽에 곡 3개를 들고 들어가면 이어 하기 기대값이 130×(응원봉 0)~187×(5+)라, «최고 상»에 서는 순간이 평균보다 손해가 됐다(`ev.mjs`). 가장 기다리던 칸이 실망이 되는 건 재미 (a)의 정면 위반. 대안 중 «종료 유지 + 값 상향(≥200)»은 꼬리만 무거워져서, «계속 + 120»을 골랐다 — 평균 45.3×(원안 45.2×)·σ 45×로 경제 거의 그대로, 대상 뒤에도 «한 번 더»가 남아 긴장이 이어지고, 엔진에서 즉시 종료 분기가 빠져 더 단순하다 |
| R2 | 화면 용어 «남은 곡» → **«남은 돌리기 N번»**, «앙코르» → «앙코르 +1번» 표기(내부 이름 `songs`는 유지) | 곡=돌리기 기회라는 비유는 설명 없이 읽히지 않는다(사용자 취향: 뜻이 바로 보이는 쉬운 말) |
| R3 | 수치 미리보기 재계산(응원봉 평균 1.7 포아송, 4장 시작 4%) | 트리거 스핀은 20칸 중 3칸이 초대권이라 응원봉 기대 개수가 2.0보다 작다. 원안 MC는 가운데 시작 7%로 돌아 본문(4%)과 어긋났다. 15× 미만 8.0%로 게이트(≤ 10%) 안 |
| R4 | `isAnalytic` 근거 문장 정정 + `resolveRouletteSpin`은 `rng` 없으면 던짐 | astral은 뮤테이션 때문에 MC였다. 이 팩은 뮤테이션 없는 ways라 차단하지 않으면 해석·전수 경로를 탄다(1순위 위험 K1 그대로 유지) |
| R5 | 탭 없을 때 자동 회전 3초 → 2초 | 진입당 탭이 필요한 회전이 평균 약 3.7번이라 3초면 지켜만 보는 사람의 공연이 35s를 넘는다(시간 예산 게이트 28s의 취지) |
| R6 | 초대권 간격은 **원형**(스트립 끝↔처음 포함), `pack:check` 경고도 원형 | 이음매에서 한 창 2장이 되면 진입 계산(릴당 최대 1장 전제)이 깨진다 |
| R7 | 응원봉 7개 이상이면 칩에 «불 6칸» 병기 | 개수 ≠ 불 수 혼란 방지(430px 판독) |
| R8 | 세션 캐시 10분 만료·새 스핀 시 삭제, 판 지름의 «가용 높이» 정의와 세로 검산 추가 | 오래된 연출 재생 방지 / 판 크기 식이 «프레임 높이» 해석이면 242px로 줄어드는 모호함 제거 |
| R9 | 응원봉 비중이 크면 밀도 대신 배당을 내린다(튜닝 메모), 장르 메커닉 선례 명시와 차별점 | 재미 장치 손잡이(밀도)를 기본 몫 튜닝이 흔들지 않게 / 독창성 (b): 여러 겹 화살표 휠은 상용 선례가 있어 판 배치·색·명칭을 따르지 않는다고 못 박음 |
| R10 | 범위: `idol_pink-win` 시트를 선택 자산으로, 체험판 QA를 «단위 반복 요청 + 눈 확인(15분 제한)» 2단으로 | 한 팀 4일 범위 유지 / 체험판은 디버그 강제가 닫혀 있어 1/230 자연 진입을 화면으로만 기다리면 QA 시간이 불확정이다 |

검토했지만 그대로 둔 것:
- **종료·감사**: 척도 `M` 단조 감소, 최대 7회, 정수 하드 캡, 재진입 없음 — R1 뒤에도 대상이 곡 하나를 써서 성립. n* ≈ 3,100만(σ ≈ 5.2) → `auditSpins` 4천만, 샤드 4로 약 2분. `E[X²]`가 4,150 → 4,100으로 거의 같다.
- **골든 불변**: `resolveSpin` 맨 앞 `math.stageRoulette` 분기·`featureTriggerCount`의 `??` 한 갈래·유니온 추가뿐이라 기존 7팩 경로는 바뀌지 않는다. `scatter.pays`·`freeSpins`가 이미 optional이라 스캐터 스키마도 손대지 않는다.
- **서버 권위·재전송·시드 공개**: 결과가 스핀 응답 하나에 다 있고 회전 추첨은 엔진 RNG 연속 소비라 `seedInput + totalBet`만으로 재현된다. 탭은 시작 신호, 결과 칸으로 단조 감속(가짜 아슬아슬 금지) — 그대로 좋다.
- **다른 신작과 겹침**: 이 시점에 new-a·new-b 폴더에 기획서가 없다. 리드 확인 1건(§0)을 유지한다.
- **사용자 취향**: 당첨 선 없음·사선 광택 없음(halo·전구 점멸)·당첨 금액 컨트롤 위·규칙은 도움말·빈칸 없음·한국어 기본+영어 사전 — 위반 없음.

---

## 구현 계약 (코어 레인 완료, 2026-11-26)

연출·아트·사운드 레인이 기대어도 되는 확정 계약이다. 숫자는 `games/idol-stage-live/math.json`(튜닝 확정본)과 `docs/RTP_AUDIT_idol-stage-live.md`(정식 감사)가 정본이다.

### C-1. 응답 필드

- `SpinResponse`에 **새 최상위 필드는 없다.** 룰렛은 `features[]`의 `{ type: 'stageRoulette', ... }` 하나다(`packages/shared` `StageRouletteFeatureSchema`, 타입 `StageRouletteFeature`).
- 피처 순서: `scatterWin`(이 팩은 초대권 배당이 없어 나오지 않음) → `stageRoulette` → `winCapped`(상한에 걸렸을 때만).
- `totalWin = Σ wins[].win + stageRoulette.total` (캡 적용 후). `freeSpins`는 항상 `null`, `isFreeSpin`은 항상 `false`, `freeSpinsSummary` 없음.
- `stageRoulette` 필드 (§4-2 그대로, 키 순서 고정):

| 필드 | 뜻 |
|---|---|
| `bonusCount` | 화면의 초대권 수(3~5) |
| `positions` | 초대권 칸 `[reel, row]` |
| `cheer` | 응원봉 수(상한 전 원래 개수, 7 이상 가능) |
| `cheerPositions` | 응원봉 칸 `[reel, row]`, reel→row 오름차순(불빛 토큰 출발점) |
| `lit` | 고리별 불 켜진 칸 인덱스 = `litOrder.slice(0, min(cheer, maxLit, litOrder.length))`. 7개 이상이면 칩에 «불 6칸»(안쪽은 5칸) |
| `startRing` | 0 바깥 / 1 가운데(초대권 4장+) |
| `steps[]` | 회전마다 `{ ring, segment, kind, lit, win, encoreCounted, songsLeft }`. `ring`은 **그 회전을 돌린** 고리. `stepUp` 회전 다음 회전부터 `ring+1`. `win`은 실지급 코인, `songsLeft`는 그 회전 **뒤** 남은 돌리기 |
| `total` | 룰렛 지급 합(= Σ steps.win) |
| `endedBy` | `'songs'` 또는 `'capped'`(지급 상한에서 끊김, 그 회전 `win`이 잘리고 `songsLeft` 0) |

- `kind`별: `coin` → `win = value × (lit ? 2 : 1) × totalBet`, 돌리기 −1 · `stepUp` → `win 0`, 돌리기 그대로, 곧바로 안쪽 고리 회전 · `encore` → `win = value × totalBet`(불 대상 아님), `encoreCounted`면 돌리기 그대로(앙코르 +1번), 아니면 −1 · `grand` → `win = 120 × totalBet`, 돌리기 −1, **공연 계속**.
- 판(칸 라벨·불 순서)은 `GET /games/idol-stage-live/math`의 `stageRoulette.rings[].segments/litOrder`로 결과 전에 그린다. 화면은 숫자를 하드코딩하지 말고 math에서 읽는다.
- 엔진 쪽(`@tgslot/slot-engine`): `SpinResult.rouletteWin`(트리거 스핀만), 타입 `StageRouletteTrigger`·`RouletteStep`·`RouletteSegmentKind`, 함수 `countCheer`·`litSegments`·`startRingFor`·`maxRouletteSteps`·`playStageRoulette`·`resolveRouletteSpin`, 스키마 `StageRouletteConfigSchema`(math `stageRoulette`). `featureTriggerCount(math)` = 3.

### C-2. 이벤트·RNG

- RNG 소비: 릴 정지 5회 → (트리거면) 회전마다 `nextInt(고리 칸 수)` 1회 → [API] 잭팟 1회. 비트리거 5회, 트리거 5 + `steps.length`. 응원봉 불빛은 RNG 0회.
- 회전 수 3~7(척도 `songs + (2 − ring) + (2 − encoresUsed)`가 회전마다 1씩 감소). 엔진은 7회를 넘으면 던진다(도달 불가 단언).
- 화면의 «돌리기» 탭·빠르게 멈춤·건너뛰기는 `steps`를 보여 주는 연출이다. 입력이 결과를 바꾸지 않는다.
- **렌더러 레인 할 일 1건**: `packages/renderer/src/anticipation.ts`의 `featureTriggerCount`가 아직 `orderRound`·`freeSpins`만 본다. 기대감(초대권 2장 뒤 감속)을 켜려면 `?? math.stageRoulette?.trigger` 한 갈래를 더하고 `AnticipationMath`에 `stageRoulette` 픽을 넣는다(엔진 함수와 비교 테스트 있음).

### C-3. 디버그 프리셋 (개발 스택 전용, 체험판·프로덕션은 닫힘)

| 프리셋 | 조건 | 평균 탐색 | 허브 `maxTries` |
|---|---|---:|---:|
| `roulette` | 유료 스핀 룰렛 진입 | ~221 | 5000 |
| `rouletteInner` | 안쪽 고리(ring 2) 도달 | ~1,000 | 20000 |
| `roulette4` | 가운데 고리 시작(초대권 4장+) | ~5,300 | 20000 |
| `rouletteGrand` | 대상 착지 1회 이상 | ~3,800 | 20000 |
| `rouletteBig` | 룰렛 합 ≥ 총 베팅 100배 | ~2,400 | 20000 |

- 룰렛 없는 팩에 위 5종을 보내면 `409 DEBUG_NO_MATCH`(탐색 없음). 2만 회 실패 탐색은 3초 미만(테스트 고정, 실측 40~80ms에 수천 회).
- 허브: `presetsFor(math)`가 룰렛 팩에 5종을 붙이고 `freeSpins`를 뺀다. `debugMaxTries(preset)`가 탐색 횟수를 고른다. 라벨 i18n 키 `stageRouletteDebugEntry/Inner/Start4/Grand/Big`(ko·en 사전 끝).
- «큰 결과 강제»는 `rouletteBig`(룰렛 100배+), `rouletteGrand`(대상), 기존 `bigWin`(10배+)이다.

### C-4. 상태 복원·재전송·시드 공개

- 서버 상태 없음: `game_states`·`nextState`·`carry`·DB 마이그레이션 없음. `GET /games/:id/state`는 그대로.
- 멱등 재전송: `RoundRecord.features`(jsonb)를 그대로 싣는다 → **응답 바이트 동일**(테스트·개발 스택에서 확인, `debug` 블록만 빠짐).
- 시드 공개: `GET /rounds/:id/seed`의 `seedInput`으로 `spin(math, {totalBet}, createSeededRng(seedInput))`을 돌리면 `stops`·`features`(회전 포함)·`totalWin`이 같다(`stateBefore`는 `null`). 허브 `replaySpin` 경로가 그대로 쓴다.
- 새로고침 이어 보기는 §4-5대로 허브 `sessionStorage` 캐시(연출 레인). 정산은 응답 시점에 끝났으므로 캐시가 없어도 손해가 없다.
- 체험판(`--mode demo`): 같은 Hono 앱·엔진이 탭 안에서 돈다. 코드 변경 없음. 임시로 status를 live로 바꿔 `demoFetch` 반복 스핀에서 `stageRoulette` 응답과 `totalWin` 합을 확인한 뒤 hidden으로 되돌렸다. `build:demo` 통과.
- **아트 전 주의**: API 부팅은 `thumb.webp`가 없는 hidden 팩을 «로드 실패»로 건너뛴다(정상). 아트 전 개발 스택 확인은 `GAMES_DIR`을 저장소 밖 사본(manifest live + 임시 썸네일)으로 돌려서 했다. 허브는 theme가 없어 «그래픽을 불러올 수 없어요»를 띄우고 스핀·빅윈은 동작했다(390·430 확인).

### C-5. 수치 결과 (확정)

- 페이테이블(웨이당): 핑크 26/71/212 · 블루 21/53/159 · 골드 18/44/124 · 응원봉 14/32/88 · 앨범 11/26/71 · 하트 9/21/53 · 별 5/14/35 · 음표 5/11/26 · 리본 4/9/21.
- 판: 바깥 `×4 ×5 위로 ×4 앙코르×3 ×6 ×4 위로 ×8 앙코르×3 ×5 ×9` · 가운데 `×5 위로 ×8 앙코르×5 ×10 ×6 위로 ×12 앙코르×5 ×18` · 안쪽 `×12 앙코르×12 ×20 대상×120 ×16 ×24 앙코르×12 ×40`. `litOrder`는 §3-2 그대로. 룰렛 최대 384×(위로·위로·앙코르×12 두 번·대상 셋).
- 스트립: 릴당 100칸, 초대권 2(원형 간격 50), 응원봉 10, 와일드 릴 2~5에 3.
- 정식 감사(시드 42, 4샤드, 4천만): **RTP 94.562%**(CI ±0.162%p), 잭팟 포함 96.062%, ways 74.88 + 룰렛 19.61, 적중률 31.19%, σ 5.243 → n* 3,194만(`auditSpins` 4천만), 진입 1/221, 가운데 시작 4.19%, 룰렛 평균 43.39×(σ 40.9×), 15× 미만 4.19%, 가운데 도달 50.3%·안쪽 22.3%, 대상 5.85%, 평균 회전 4.41(최장 7, 위반 0), 칸별 착지 max |z| 1.94, 캡 도달 0. 게이트 15개 전부 통과.
- 응원봉별 룰렛 평균: 0개 35.9× · 1개 40.0× · 2개 42.7× · 3개 46.9× · 4개 50.0× · 5개 54.2× · 6+ 56.2×.
- 정확값 교차 확인(저장소 밖 `D:/park/tgslot-wt/_qa/new-c-core/exact.ts`): ways 해석 74.84 + 룰렛 DP 19.70 = 94.54%.

### C-6. 바뀐 파일

엔진 `stageRoulette.ts`(+test)·`types.ts`·`schema.ts`·`spin.ts`(맨 앞 분기 한 줄)·`evaluate.ts`·`analytic.ts`(`isAnalytic` 제외)·`index.ts` / shared `schemas.ts`(피처·프리셋) / API `engineSpin.ts`·`debugSpin.ts`·`routes/games.ts`(409 가드)·`routes/stageRoulette.test.ts` / game-sdk `validate.ts`(초대권 원형 간격 경고, +test) / rtp-sim `audit/rouletteStats.ts`(+`roulette.test.ts`)·`sampleDistribution.ts`·`compute.ts`·`report.ts`·`types.ts`·`index.ts`·`strips.ts`(`payGridFor`·`scaleRoulette`)·`tune-cli.ts`(룰렛 팩 요약·`--roulette-scale`) / 허브 타입 연결만 `lib/debugPreset.ts`·`store/game.ts`(maxTries)·`DebugPanel.tsx`(라벨)·`i18n/ko.ts`·`en.ts` / 팩 `games/idol-stage-live/{manifest.json, math.json, README.md}`.
