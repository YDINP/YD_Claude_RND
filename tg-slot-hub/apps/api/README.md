# @tgslot/api

Telegram 슬롯 허브의 API 서버. Hono + Node로 인증, 공용 지갑, 게임 목록, **서버 권위 스핀**을 제공한다.
스핀 결과와 잔액은 서버만 결정한다. 클라이언트는 연출만 담당하고 잔액은 응답 값으로 덮어쓴다.
`packages/shared`의 zod 스키마가 요청/응답 타입의 단일 진실 공급원(SSOT)이다.

## 엔드포인트

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/health` | - | 헬스체크. `{ ok: true }` |
| POST | `/auth/telegram` | - | `{ initData }` 검증 → 유저 upsert → `{ token, user, wallet }` |
| GET | `/me` | Bearer JWT | `MeResponse`. `{ user, wallet, levelInfo, jackpot }` |
| PATCH | `/me` | Bearer JWT | `{ locale }`로 표시 언어 변경 → `MeResponse` (GET과 같은 모양) |
| GET | `/games` | - | `{ games: GameSummary[] }`. `hidden` 제외, `sort` 오름차순 |
| GET | `/games/:id/math` | - | 검증된 `math.json` 원본. `Cache-Control: public, max-age=300` |
| GET | `/games/:id/state` | Bearer JWT | `GameStateResponse`. 진행 중인 프리스핀 세션 (없으면 `{ freeSpins: null }`) |
| POST | `/games/:id/spin` | Bearer JWT | `SpinRequest` → `SpinResponse`. 서버 권위 스핀 1회 |
| GET | `/rounds/:id/seed` | Bearer JWT | 라운드 서버 시드 공개 (소유자만). provably fair 검증용 |
| GET | `/bonus` | Bearer JWT | `BonusStatus`. 데일리·4시간·구제 보너스의 수령 가능 여부 |
| POST | `/bonus/daily/claim` | Bearer JWT | 데일리 로그인 보너스 수령 → `BonusClaimResponse` (`streakDay` 포함) |
| POST | `/bonus/timed/claim` | Bearer JWT | 4시간 보너스 수령 → `BonusClaimResponse` |
| POST | `/bonus/rescue/claim` | Bearer JWT | 파산 구제 보너스 수령 → `BonusClaimResponse` |
| GET | `/jackpot` | - | `Jackpot`. 현재 풀과 최근 당첨. **허브에서 유일한 무인증 조회** |
| GET | `/leaderboard` | Bearer JWT | `LeaderboardResponse`. 이번 ISO 주차 상위 50 + 내 순위 |
| GET | `/missions` | Bearer JWT | `MissionsResponse`. 오늘(UTC)의 미션과 진행도 |
| POST | `/missions/:id/claim` | Bearer JWT | 완료한 미션 보상 수령 → `BonusClaimResponse` |

인증 실패는 `401 { error, code: 'UNAUTHORIZED' | 'INVALID_INIT_DATA' | 'USER_NOT_FOUND' }` 형태로 응답한다.

### 에러 코드

| HTTP | code | 언제 |
|---|---|---|
| 400 | `BAD_REQUEST` | 본문이 요청 스키마를 통과하지 못함 (`SpinRequest`의 `idempotencyKey`는 8~64자, `PATCH /me`의 `locale`은 `en`/`ko`) |
| 400 | `INVALID_BET` | `totalBet`이 게임의 `betLevels`에 없는 값 |
| 400 | `BET_LOCKED` | `totalBet`이 **내 레벨이 해금한 상한**을 넘음 (레벨 1~2: 100, 3~5: 200, 6+: 500) |
| 401 | `UNAUTHORIZED` | 토큰 없음/만료/위조 |
| 401 | `USER_NOT_FOUND` | 토큰 서명은 유효하지만 그 유저가 더 이상 없음. 클라이언트는 재로그인해야 한다 |
| 402 | `INSUFFICIENT_FUNDS` | 잔액 < 베팅액. 지갑과 원장은 그대로 |
| 404 | `NOT_FOUND` | 유저는 있는데 지갑 행이 없는 내부 불일치 (정상 흐름에서는 나오지 않는다) |
| 404 | `GAME_NOT_FOUND` | 없는 게임 id이거나 `status: hidden` |
| 404 | `ROUND_NOT_FOUND` | 없는 라운드이거나 **남의 라운드** (존재 여부를 알려주지 않음) |
| 404 | `MISSION_NOT_FOUND` | 미션 정의에 없는 id |
| 409 | `SPIN_IN_PROGRESS` | 같은 유저의 **다른** 스핀이 진행 중 |
| 409 | `NOT_CLAIMABLE` | 보너스 쿨다운 미경과, 미션 미완료, 또는 이미 수령함 |
| 500 | `INTERNAL` | 라우트가 잡지 못한 예외 |
| 503 | `SPIN_TIMEOUT` | 스핀이 `SPIN_LOCK_TIMEOUT_MS` 안에 끝나지 않음. **같은 키로 재시도**하면 된다 |

### 스핀 요청/응답

```jsonc
// POST /games/classic-777/spin
{ "totalBet": 100, "idempotencyKey": "a-client-generated-key" }

// 200
{
  "roundId": "ffc79468-743f-40f7-b06d-8e34e07f2a8a",
  "stops": [15, 23, 14],                 // 릴별 정지 위치
  "grid": [["bar1","bell","cherry"], ...], // grid[row][reel]
  "wins": [],                            // { line, symbol, count, multiplier, win, positions[[reel,row]] }
  "totalBet": 100,
  "totalWin": 0,
  "wallet": { "coins": 9900, "gems": 0 },// 스핀 반영 후 **서버** 잔액
  "seedHash": "fdfab40a...",             // sha256(라운드 서버 시드)
  "nonce": 1,                            // 유저별 스핀 카운터
  "jackpot": 50001,                      // 이 스핀 반영 후 잭팟 풀
  "jackpotWin": 50001,                   // 터졌을 때만. wallet에 이미 반영됨
  "levelUp": { "from": 1, "to": 2, "bonus": 400 },  // 올랐을 때만. bonus도 wallet에 반영됨
  "missions": [                          // 이 스핀으로 갱신된 오늘의 진행도
    { "id": "spin_50", "name": { "en": "Spin 50 times" }, "target": 50,
      "progress": 1, "reward": 1000, "claimed": false, "completed": false }
  ]
}
```

같은 `idempotencyKey`로 다시 보내면 지갑을 건드리지 않고 **완전히 같은 응답**을 돌려준다
(네트워크 재전송 대비). 진행 중인 스핀이 있는 상태에서 **다른** 키가 오면 409다.

## 허브 경제 (Phase 3)

**튜닝 값은 전부 `src/economy/config.ts` 한 파일에 있다.** 로직(판정·계산)은 옆 파일이 갖고
config는 숫자만 갖는다. 운영이 값을 바꿀 때 다른 파일을 볼 필요가 없게 하기 위해서다.

| 기능 | 규칙 | 원장 사유 |
|---|---|---|
| 데일리 로그인 | 연속 1~7일차 `500 / 800 / 1200 / 1600 / 2000 / 2500 / 3500`, 8일차부터 3500 반복. **UTC 날짜**가 하루 넘어가면 수령 가능, 하루를 건너뛰면 1일차로 리셋 | `daily_bonus` |
| 4시간 보너스 | 마지막 수령으로부터 4시간 뒤 300 코인 | `timed_bonus` |
| 파산 구제 | 코인 < 10이고 마지막 구제로부터 6시간 경과 시 500 코인 | `rescue_bonus` |
| 잭팟 | 시드 25,000코인. 스핀마다 베팅의 1%를 **1/100 코인 단위**로 적립, `rng.nextInt(5_000_000) < 적립액`이면 당첨 | `jackpot_win` |
| 주간 리더보드 | ISO 주차(UTC, 월요일 시작) 단위로 `totalWin` / `bestMultiplier` / `spins` 집계. 상위 50 + 내 순위 | - |
| 데일리 미션 | `spin_50`(50스핀 → 1000), `win_3`(당첨 3회 → 500), `classic_20`(classic-777 20스핀 → 500). UTC 날짜 단위 | `mission_reward` |
| 레벨 | `xp` = 누적 베팅. 레벨 n 문턱 = `round(2000 * n^1.6)` (레벨 1은 0). 레벨업 시 `200 × 도달 레벨` 지급 | `level_up` |

베팅 상한은 레벨로 해금된다: 레벨 1~2 → 100, 3~5 → 200, 6+ → 500. 게임의 `betLevels`에 있는
값이라도 레벨이 낮으면 400 `BET_LOCKED`로 막힌다.

### RTP 회계

플레이어가 돌려받는 총액은 **기본 게임 + 잭팟** 두 갈래다.

| 갈래 | 값 | 근거 |
|---|---|---|
| 기본 게임 | 94.5% | `games/classic-777/README.md`의 전수조사값 (SSOT). `pnpm --filter @tgslot/rtp-sim sim games/classic-777`로 재확인 가능 |
| 잭팟 | 1.5% | 아래 계산. **모든 베팅 레벨에서 같다** |
| 합계 | **96.0%** | 계획서 §0의 목표치 |

잭팟 기여를 계산하는 방법 (단위는 전부 1/100 코인):

```
적립       = 베팅 x 1% x 100 = 베팅                # 10 베팅 -> 10 (=0.1 코인), 100 -> 100
당첨 확률   = 적립 / 5,000,000                     # 100 베팅이면 정확히 1/50,000
당첨 시 평균 풀 = 시드 + 5,000,000 = 7,500,000      # 적립 1단위당 위험률이 일정하므로
                                                  # 리셋 이후 누적액의 평균이 분모와 같다
스핀당 기대 지급 = (적립 / 5,000,000) x 7,500,000 = 1.5 x 적립 = 베팅의 1.5%
```

적립과 당첨 확률이 **둘 다 베팅에 정비례**하므로 이 1.5%는 베팅 레벨과 무관하게 같다.
시드를 바꾸면 이 값이 그대로 움직인다 (시드 5,000,000이면 2%, 2,500,000이면 1.5%).
`economy/economy.test.ts`가 여섯 베팅 레벨 전부에서 이 관계를 검사하므로 시드나 분모를 손대면
테스트가 먼저 깨진다.

**시드는 하우스 돈이고 1% 적립도 플레이어 베팅에서 빼지 않는다.** 베팅 차감은 항상 `totalBet`
그대로이고, 적립분은 하우스 몫에서 나가 원장에 남지 않는다. 그래서 위 1.5%는 플레이어 입장에서
**추가로 얹히는** 환급이다.

> 기본 게임 94.5%는 `games/classic-777/README.md`가 소유하는 값이다. 이 저장소를 읽는 시점에
> 그 문서와 위 표가 다르면 **게임 README가 맞다.** 게임 수학은 `games/` 담당이라 여기서 건드리지 않는다.

### 잭팟 적립과 확률이 묶여 있는 이유

적립은 `round(totalBet * 1% * 100)`(=1/100 코인 단위로 베팅의 1%)이고, 당첨 확률은 베팅액이 아니라
**그 스핀이 실제로 넣은 적립액**에 비례한다 (`rng.nextInt(5_000_000) < accrual`).

| 베팅 | 적립 (1/100 코인) | 당첨 확률 | 잭팟 RTP 기여 |
|---|---|---|---|
| 10 | 10 | 1/500,000 | 1.5% |
| 20 | 20 | 1/250,000 | 1.5% |
| 50 | 50 | 1/100,000 | 1.5% |
| 100 | 100 | 1/50,000 | 1.5% |
| 200 | 200 | 1/25,000 | 1.5% |
| 500 | 500 | 1/10,000 | 1.5% |

**풀을 1/100 코인 단위로 드는 이유가 이 표다.** 코인 단위로 들면 `round(10 x 1%) = 0`이라
10·20 베팅은 한 푼도 넣지 않고, `round(50 x 1%) = 1`은 실효 2%가 되어 베팅 레벨마다 적립률이
제각각이 된다. 100배 단위로 두면 모든 레벨이 정확히 1%를 넣고 RTP 기여도 1.5%로 같아진다.
API 응답(`GET /jackpot`, `SpinResponse.jackpot`)과 실제 지급액은 항상 코인으로 **내림**해서 나가므로
클라이언트는 이 내부 단위를 몰라도 된다.

확률을 적립액이 아니라 베팅액에 비례시키면 10 베팅이 **풀에 0원을 넣고도** 당첨 기회를 갖게 되어
최소 베팅 연타가 지배 전략이 된다. 지금은 적립과 확률이 같은 값에서 나오므로 그런 틈이 없다.
계획서 §6의 "모든 베팅의 1% 적립"도 이제 문자 그대로 성립한다.

### 잭팟이 회계를 건드리지 않는 방식

적립분은 **하우스 몫에서** 나간다. 베팅 차감액은 그대로이고 적립은 원장에 남지 않는다
(유저 잔액이 아니라 풀 잔액이므로). 유저 원장에 찍히는 것은 당첨 지급(`jackpot_win`) 뿐이라
`SUM(ledger.delta) == wallets.coins` 불변식이 그대로 유지된다. 적립을 먼저 하고 판정하므로
당첨자는 자기 스핀의 적립분까지 가져간다.

**추첨 순서가 계약이다.** 라운드 RNG에서 릴을 먼저 뽑고 **그 다음** `nextInt(5_000_000)`으로
잭팟 판정값을 뽑는다. 순서를 바꾸면 공개된 시드로 라운드를 재현했을 때 릴이 달라져 provably fair가 깨진다.

**전역 단일 행이라 맨 마지막에 만진다.** `jackpot_pool`은 허브 전체가 공유하는 한 행이라 모든 유저의
스핀이 여기서 직렬화된다. 그래서 유저 전용 쓰기(레벨·리더보드·미션)를 전부 끝낸 뒤 잭팟을 처리하고,
뒤에는 라운드·원장·지갑 쓰기 세 문장만 남긴다. 락 순서는 항상 `wallets` → `users` → `jackpot_pool`이다.

### 시간 처리

데일리/주간 버킷과 쿨다운은 전부 **UTC**다 (`src/economy/time.ts`). 서버 로컬 타임존에 기대면
배포 리전을 옮기는 순간 보너스 경계가 흔들린다. 현재 시각은 `Clock`(`() => Date`)으로 주입되며
레포와 라우트가 **같은 시계**를 본다. 테스트는 이 시계를 앞으로 돌려 "하루 뒤"를 재현한다.

## 원장 불변식 검사 (시간마다)

계획서 §5의 불변식 잡이다. 모든 유저에 대해 `SUM(ledger.delta) == wallets.<currency>`를 확인하고
어긋난 유저가 있으면 목록을 찍고 **exit 1**로 끝난다 (없으면 exit 0).

```bash
DATABASE_URL=postgres://... pnpm --filter @tgslot/api check:ledger   # 개발 (tsx)
DATABASE_URL=postgres://... node dist/scripts/checkLedger.js         # 배포 (빌드 산출물)
```

**운영: 1시간 주기로 돌린다.** Render Cron Job(`0 * * * *`)에 위 명령을 걸고, exit 1이면 알림이
가도록 설정한다. `DATABASE_URL`이 없으면 exit 2다. 출력은 한 줄 JSON이라 로그 수집기가 바로 파싱한다.

```jsonc
{"evt":"ledger_check","ok":true,"mismatches":0}
{"evt":"ledger_mismatch","userId":"...","currency":"coins","wallet":9900,"ledger":9800,"diff":100}
```

## 프리스핀 (Phase 5)

프리스핀 세션은 **서버가 소유한다.** 클라이언트가 새로고침하거나 앱을 껐다 켜도
`GET /games/:id/state`로 이어서 돌 수 있고, 남은 횟수를 클라이언트가 우길 수 없다.

| 규칙 | 내용 |
|---|---|
| 진입 | 기본 스핀에서 `freeSpins` 피처가 뜨면 세션이 생긴다. 그 스핀의 베팅액이 세션 내내 고정된다 |
| 차감 | 프리스핀은 **코인을 걸지 않는다.** 원장에 `spin_bet` 항목 자체가 생기지 않는다 |
| 베팅액 | 요청의 `totalBet`은 **무시**한다. 진입 시점에 고정된 값으로 계산하고 응답의 `totalBet`에 그 값을 싣는다 |
| 재발동 | 이번 프리스핀을 **먼저 소모**하고 새로 받은 횟수를 더한다. 마지막 스핀에서 재발동해도 1회를 잃지 않는다 |
| 종료 | 남은 횟수가 0이 되면 상태 행을 지우고 응답의 `freeSpins`는 `null`이다 |
| 누적 | `accumulatedWin`은 프리스핀들의 당첨 합계다. 진입 스핀의 당첨은 포함하지 않는다 |

### 다른 시스템과의 관계

| 시스템 | 프리스핀에서 |
|---|---|
| 잭팟 | **적립도 판정도 하지 않는다.** 풀에 넣은 돈이 없으므로 가져갈 자격도 없다 |
| xp / 레벨 | 오르지 않는다. xp는 "실제로 건 돈"이라 프리스핀은 0이다 |
| 미션 | 스핀 수로 **센다** (`spin_50` 등이 올라간다) |
| 리더보드 | 스핀 수와 당첨을 **센다**. 배수는 고정 베팅 기준으로 계산한다 |
| 원장 | 당첨(`spin_win`)만 기록된다. 불변식은 그대로 유지된다 |

### 요청의 totalBet을 막지 않고 무시하는 이유

프리스핀 중에 클라이언트가 다른 `totalBet`을 보내도 400을 주지 않는다. 어차피 코인을 걸지 않는
스핀이라 거절할 실익이 없고, 자동 스핀 UI가 기본 베팅을 계속 실어 보내는 흔한 구현을 깨뜨리기
때문이다. 베팅 레벨 검사와 레벨 상한(`BET_LOCKED`) 검사도 프리스핀 중에는 건너뛴다.
**응답의 `totalBet`이 실제로 적용된 값**이므로 클라이언트는 그것을 보면 된다.

### 저장 위치

- `game_states(user_id, game_id, free_spins jsonb)` — 진행 중인 세션. 유저 단위 행이라
  스핀 트랜잭션의 지갑 락이 그대로 직렬화한다.
- `rounds.is_free_spin` / `features` / `free_spins_after` — 멱등 재전송이 **처음과 똑같은 응답**을
  돌려주기 위한 스냅샷. 재전송은 상태를 다시 소모하지 않는다.
- `rounds.bet`은 프리스핀에서도 계산 기준 베팅이 들어간다. 실제 배팅액 합계를 낼 때는
  `is_free_spin = false`로 걸러야 한다.

프리스핀 트리거를 만드는 것은 `@tgslot/slot-engine`이고, API는 그 결과를 상태로 옮기기만 한다.
`src/games/engineSpin.ts`가 두 패키지 사이의 유일한 접점이다 (라운드 상태 변환, 피처 변환,
부여 횟수 해석). 상태 기계 자체(`economy/freeSpins.ts`)는 엔진 구현을 모르므로,
게임마다 트리거 조건이 달라져도 세션 회계는 그대로 쓰인다.

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Y | - | initData HMAC 서명 검증에 사용 |
| `JWT_SECRET` | Y | - | JWT 서명 시크릿 (HS256) |
| `DATABASE_URL` | N | 없음 | 설정 시 Postgres(drizzle), 없으면 in-memory 레포로 동작 |
| `API_PORT` | N | `8787` | 리슨 포트 |
| `API_ALLOW_DEV_MOCK` | N | `false` | `true`일 때만 `mock:<telegramId>:<firstName>` initData 허용 |
| `CORS_ORIGIN` | N | `*` | CORS allow-origin |
| `GAMES_DIR` | N | 자동 탐색 | 게임 팩 폴더. 지정하지 않으면 `pnpm-workspace.yaml`을 찾아 올라가 `<repo>/games`를 쓴다 |
| `SPIN_LOCK_TIMEOUT_MS` | N | `15000` | 유저별 스핀 락 보유 상한. 넘기면 락을 놓고 503 `SPIN_TIMEOUT` |

## 실행

```bash
# 워크스페이스 루트에서 pnpm install 후
pnpm --filter @tgslot/api dev      # tsx watch
pnpm --filter @tgslot/api build    # tsup -> dist (esm, @tgslot/shared 번들 포함)
pnpm --filter @tgslot/api start    # node dist/index.js
pnpm --filter @tgslot/api test     # vitest run
pnpm --filter @tgslot/api typecheck

# Postgres 스키마 (DATABASE_URL 필요)
pnpm --filter @tgslot/api db:generate   # drizzle/에 SQL 마이그레이션 생성 (이미 커밋됨)
pnpm --filter @tgslot/api db:push       # 실제 DB에 반영. 이 저장소 안에서는 아직 실행 안 함
```

## 마이그레이션

`drizzle/` 아래에 SQL 마이그레이션이 커밋되어 있다.

| 파일 | 내용 |
|---|---|
| `0000_burly_zombie.sql` | `users`/`wallets`/`ledger` 초기 테이블 (drizzle-kit generate 자동 생성) |
| `0001_ledger_append_only_trigger.sql` | `ledger`에 `BEFORE UPDATE OR DELETE` 트리거를 달아 애플리케이션 버그로도 원장을 못 고치게 DB 레벨에서 강제 |
| `0002_harsh_donald_blake.sql` | `rounds` 테이블 + `wallets.nonce`. `(user_id, idempotency_key)` 유니크가 이중 차감을 DB 레벨에서 차단 |
| `0003_parallel_dormammu.sql` | 허브 테이블 5종(`bonus_claims`, `jackpot_pool`, `jackpot_hits`, `leaderboard_weekly`, `mission_progress`) + `users.xp`. 맨 끝의 `INSERT INTO jackpot_pool`은 손으로 덧붙인 시드 행이다 (drizzle-kit은 데이터를 만들지 않는다) |
| `0004_spicy_living_tribunal.sql` | `rounds.jackpot_win` / `level_up_from` / `level_up_to` / `level_up_bonus`. 멱등 재전송이 처음과 **완전히 같은** 응답을 돌려주도록 라운드의 부수 결과를 함께 남긴다 |
| `0008_legal_bromley.sql` | `game_states` 테이블 + `rounds.is_free_spin`/`features`/`free_spins_after`. 프리스핀 세션과 재전송 스냅샷 |
| `0007_jackpot_pool_hundredths.sql` | 잭팟 풀·시드 단위를 코인에서 1/100 코인으로 변환(x100). 금액 자체는 그대로다 |
| `0006_jackpot_seed_25k.sql` | 잭팟 시드를 25,000으로 내린다 (손으로 쓴 커스텀 SQL). 현재 풀은 **아직 아무도 돌리지 않은 초기 상태일 때만** 같이 내린다 |
| `0005_cynical_jane_foster.sql` | `users.locale_explicit`. 유저가 직접 고른 언어를 로그인이 덮어쓰지 못하게 하는 플래그 |

스키마(`src/db/schema.ts`)를 바꾸면 `db:generate`로 새 마이그레이션을 추가하고, 커스텀 SQL(트리거 등)이 필요하면 `drizzle-kit generate --custom --name <name>`으로 빈 파일을 만든 뒤 채운다.

## 구현 노트 / 가정

- **지갑 잠금 & 최초 로그인 레이스**: `upsertFromTelegram`은 먼저 `INSERT ... ON CONFLICT (telegram_id) DO NOTHING`을
  시도한다. 동시에 같은 유저가 최초 로그인해도 한쪽만 실제로 행을 만들고 signup_bonus를 지급하며,
  진 쪽은 unique index 잠금에 걸려 대기하다 빈 반환을 받고 `SELECT ... FOR UPDATE`로 넘어가
  방금 만들어진 행을 갱신만 한다 (재적립 없음). 기존 유저 로그인도 이 `FOR UPDATE` 경로를 탄다.
- **원장 불변식**: `ledger`는 애플리케이션에서 insert만 하고, DB 트리거(`0001_...sql`)로도
  update/delete를 막아 append-only를 이중으로 강제한다.
- **레포 선택**: `DATABASE_URL`이 없으면 자동으로 in-memory 레포로 폴백한다 (Phase 0 목적).
  프로덕션에서는 반드시 `DATABASE_URL`을 설정해야 한다.
- **dev mock**: `src/auth/devMock.ts`는 `API_ALLOW_DEV_MOCK`이 정확히 `"true"`일 때만 동작하며,
  그 외에는 항상 `null`을 반환해 실제 initData 서명 검증 경로로 폴백한다. 켜져 있으면 부팅 시
  `src/config.ts`가 콘솔에 눈에 띄는 경고를 찍는다.
- **로케일/프로필 갱신**: `initData.user.language_code`가 `SUPPORTED_LOCALES`(`en`,`ko`)에 없으면
  `DEFAULT_LOCALE`(`en`)로 저장한다. 재로그인마다 `first_name`/`username`을 최신 initData로 갱신한다
  (username이 없는 로그인은 기존 값을 유지).
- **인증 미들웨어가 유저를 한 번만 읽는다**: 토큰을 검증한 뒤 곧바로 유저 행을 읽어 컨텍스트에 싣는다.
  없으면 401 `USER_NOT_FOUND`다. JWT는 7일짜리라 유저가 지워지거나 in-memory 레포로 뜬 서버가
  재시작된 뒤에도 서명은 통과하는데, 그때 라우트마다 404를 내면 클라이언트가 "재로그인" 신호로
  읽지 못한다. 인증 실패로 통일한 이유다. 라우트(`/me`, 스핀의 베팅 상한 판정 등)는 이 값을 재사용하고
  다시 조회하지 않는다. 트랜잭션 안의 row lock은 그대로다 — 미들웨어가 읽은 값은 게이트 판정용이고,
  잔액·xp를 실제로 바꾸는 계산은 잠근 행을 다시 읽어서 한다.
- **직접 고른 언어가 이긴다**: `PATCH /me`로 언어를 바꾸면 `users.locale_explicit`이 켜지고,
  그 뒤로는 재로그인해도 `language_code`가 이 값을 덮어쓰지 않는다. 텔레그램 앱 언어와 게임 언어를
  다르게 두려는 유저가 매 로그인마다 설정을 잃지 않게 하기 위해서다. 직접 고르기 전에는
  기존대로 로그인이 `language_code`를 반영한다.
- **initData 시간 검증**: `auth_date`가 서버 시각보다 300초 넘게 미래이거나, `INIT_DATA_MAX_AGE_SEC`(24시간)보다
  오래됐으면 거부한다.
- **에러 응답 형식**: 라우트에서 못 잡은 예외는 `app.onError`가 `{ error, code: 'INTERNAL' }` 500 JSON으로
  통일해서 반환한다 (`ApiErrorSchema`와 동일한 모양).
- **게임 레지스트리는 디스크에서 온다**: 부팅 시 `<repo>/games/*/`를 훑어 `manifest.json`(`GameManifestSchema`)과
  `math.json`(`parseGameMath`)을 검증하고, `manifest.id === math.id === 폴더 이름`을 강제한다.
  `_`로 시작하는 폴더(`_template`)는 건너뛴다. 팩이 하나라도 깨져 있으면 **부팅이 실패한다** —
  잘못된 팩으로 스핀을 받는 것보다 낫다. 게임 추가는 폴더 추가가 전부이고 API 코드는 건드리지 않는다.
- **스핀 원자성**: `applySpin`이 한 트랜잭션 안에서 지갑 row lock(`FOR UPDATE`) → 멱등키 확인 →
  잔액 확인 → nonce 증가 → 결과 계산 → 원장 2건(`spin_bet`, `spin_win`) → 라운드 저장 → 지갑 갱신을 처리한다.
  실패하면 아무것도 남지 않으므로 `sum(ledger.delta) == wallets.coins` 불변식이 깨지지 않는다.
  결과 계산(`compute`)은 nonce가 정해진 뒤에야 가능하므로 콜백으로 트랜잭션 안에 주입한다.
- **동시 스핀**: `SpinLock`이 유저별로 인프로세스 직렬화를 한다. 같은 `idempotencyKey`가 겹치면 기다렸다가
  멱등 경로를 타고, 다른 키가 겹치면 409다.
- **락은 프로세스 로컬이다**: `SpinLock`은 이 프로세스의 `Map` 하나일 뿐이다. API 인스턴스를 2대 이상
  띄우면 서로의 락을 보지 못하므로 **인스턴스 간 직렬화는 보장되지 않는다.** 그래도 이중 차감은 생기지
  않는다. 지갑 `SELECT ... FOR UPDATE`가 DB에서 직렬화하고, `(user_id, idempotency_key)` 유니크가
  같은 키의 두 번째 라운드를 막기 때문이다. 인스턴스 간 409 시맨틱까지 필요해지면 Phase 3에서
  Redis 락으로 올린다.
- **락 타임아웃**: `fn()`은 `SPIN_LOCK_TIMEOUT_MS`(기본 15초)와 경주한다. DB 질의 하나가 멈춰 서면
  타임아웃이 락을 놓아주므로 그 유저의 이후 스핀이 프로세스가 죽을 때까지 전부 409가 되는 일은 없다.
  시간을 넘긴 작업 자체는 백그라운드에서 계속될 수 있지만, 트랜잭션이 원자적이고 멱등키가 유니크라
  유저가 **같은 키로** 재시도해도 이중 차감은 없고 원래 작업이 끝났다면 그 결과를 그대로 받는다.
- **허브 상태는 스핀 트랜잭션 안에서 갱신된다**: `applySpin`이 지갑·원장·라운드에 더해 잭팟 적립/판정,
  주간 리더보드 집계, 데일리 미션 진행도, xp/레벨업까지 **한 트랜잭션**에서 처리한다. 스핀이 실패하면
  이것들도 전부 없던 일이 된다. 락 획득 순서는 항상 `wallets`(유저) → `jackpot_pool`(전역)이라
  모든 스핀이 같은 순서를 지키므로 교착이 생기지 않는다. 잭팟 풀은 전역 단일 행이라 스핀이
  이 행에서 직렬화된다 — 처리량이 문제가 되면 풀을 샤딩하거나 적립을 배치로 미루는 것이 다음 수순이다.
- **멱등 재전송은 부수 결과까지 복원한다**: 잭팟 당첨액과 레벨업은 지갑에 이미 반영된 뒤라
  다시 계산할 수 없다. 그래서 라운드 행에 `jackpot_win`/`level_up_*`을 함께 저장하고 재전송 시
  그대로 되돌려준다. 지급은 여전히 한 번뿐이다 (원장 항목도 1건). 잭팟 풀·레벨·미션 진행도는
  "지금" 값을 주는데, 재전송 사이에 다른 스핀이 있었을 수 있기 때문이다.
- **보너스·미션 수령의 중복 방어**: 조회 시점의 판정을 재사용하지 않는다. 지갑 row lock을 잡은 뒤
  트랜잭션 안에서 최신 기록으로 **다시** 판정하고(`decide` 콜백), 판정이 실패하면 `null`을 돌려
  라우트가 409 `NOT_CLAIMABLE`로 번역한다. 조회와 수령 사이에 다른 요청이 끼어들어도 두 번 지급되지 않는다.
- **레벨업 보너스는 도달 레벨 기준 1회**: xp가 크게 튀어 여러 레벨을 한 번에 건너뛰어도
  `200 × 도달 레벨`을 **한 번만** 지급한다 (구간별로 합산하지 않는다).
- **level은 파생 값이다**: `users.level`은 캐시일 뿐이고 응답에 싣는 값은 `xp`에서 다시 계산한다.
  문턱 공식을 바꿔도 기존 행을 마이그레이션할 필요가 없다.
- **grid는 저장하지 않는다**: `stops`와 `math.json`만 있으면 `buildGrid`로 항상 같은 격자가 나온다.
  라운드 테이블에는 `stops`/`wins`만 저장하고 응답의 `grid`는 매번 재구성한다.

## Provably fair 검증

스핀마다 서버가 32바이트 시드를 `node:crypto`로 뽑고, 그 sha256만 응답에 실어 보낸다.
라운드가 끝난 뒤 시드를 공개하므로 유저는 **서버가 결과를 나중에 고르지 않았음**을 스스로 확인할 수 있다.

1. 스핀 응답에서 `roundId`, `seedHash`, `nonce`, `stops`를 받는다.
2. `GET /rounds/:roundId/seed`로 `seed`를 받는다 (본인 라운드만).
3. `sha256(seed) === seedHash`인지 확인한다. 스핀 시점에 이미 공개된 해시이므로 시드는 사후 변경이 불가능하다.
4. `createSeededRng(`${seed}:${nonce}`)`로 RNG를 만들고 `spin(math, { totalBet }, rng)`를 돌린다.
   `math`는 `GET /games/:id/math`로 받는다.
5. 재현된 `stops`/`grid`/`totalWin`이 응답과 같은지 비교한다.

```bash
curl -s localhost:8787/rounds/$ROUND/seed -H "authorization: Bearer $TOKEN"
# { "seed": "d2a9...", "seedHash": "fdfa...", "nonce": 1, "stops": [15,23,14], "seedInput": "d2a9...:1" }
```

```ts
import { createSeededRng, parseGameMath, spin } from '@tgslot/slot-engine'
import { createHash } from 'node:crypto'

createHash('sha256').update(reveal.seed).digest('hex') === round.seedHash   // 시드가 사후 조작되지 않았다
spin(parseGameMath(math), { totalBet: 100 }, createSeededRng(reveal.seedInput)).stops  // === round.stops
```

`nonce`는 유저별 스핀 카운터라 같은 시드가 다시 쓰이더라도 라운드마다 다른 수열이 나온다.
시드 조합 규칙은 `src/spin/provablyFair.ts`의 `roundSeedInput`이 단독으로 소유한다.
