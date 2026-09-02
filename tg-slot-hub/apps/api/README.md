# @tgslot/api

Telegram 슬롯 허브의 API 서버. Hono + Node로 인증, 공용 지갑, 게임 목록, **서버 권위 스핀**을 제공한다.
스핀 결과와 잔액은 서버만 결정한다. 클라이언트는 연출만 담당하고 잔액은 응답 값으로 덮어쓴다.
`packages/shared`의 zod 스키마가 요청/응답 타입의 단일 진실 공급원(SSOT)이다.

## 엔드포인트

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/health` | - | 헬스체크. `{ ok: true }` |
| POST | `/auth/telegram` | - | `{ initData }` 검증 → 유저 upsert → `{ token, user, wallet }` |
| GET | `/me` | Bearer JWT | `{ user, wallet }` |
| GET | `/games` | - | `{ games: GameSummary[] }`. `hidden` 제외, `sort` 오름차순 |
| GET | `/games/:id/math` | - | 검증된 `math.json` 원본. `Cache-Control: public, max-age=300` |
| POST | `/games/:id/spin` | Bearer JWT | `SpinRequest` → `SpinResponse`. 서버 권위 스핀 1회 |
| GET | `/rounds/:id/seed` | Bearer JWT | 라운드 서버 시드 공개 (소유자만). provably fair 검증용 |

인증 실패는 `401 { error, code: 'UNAUTHORIZED' | 'INVALID_INIT_DATA' }` 형태로 응답한다.

### 에러 코드

| HTTP | code | 언제 |
|---|---|---|
| 400 | `BAD_REQUEST` | 본문이 `SpinRequestSchema`를 통과하지 못함 (`idempotencyKey`는 8~64자) |
| 400 | `INVALID_BET` | `totalBet`이 게임의 `betLevels`에 없는 값 |
| 401 | `UNAUTHORIZED` | 토큰 없음/만료/위조 |
| 402 | `INSUFFICIENT_FUNDS` | 잔액 < 베팅액. 지갑과 원장은 그대로 |
| 404 | `GAME_NOT_FOUND` | 없는 게임 id이거나 `status: hidden` |
| 404 | `ROUND_NOT_FOUND` | 없는 라운드이거나 **남의 라운드** (존재 여부를 알려주지 않음) |
| 409 | `SPIN_IN_PROGRESS` | 같은 유저의 **다른** 스핀이 진행 중 |
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
  "nonce": 1                             // 유저별 스핀 카운터
}
```

같은 `idempotencyKey`로 다시 보내면 지갑을 건드리지 않고 **완전히 같은 응답**을 돌려준다
(네트워크 재전송 대비). 진행 중인 스핀이 있는 상태에서 **다른** 키가 오면 409다.

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
  `DEFAULT_LOCALE`(`en`)로 저장한다. 재로그인마다 `locale`/`first_name`/`username`을 최신 initData로 갱신한다
  (username이 없는 로그인은 기존 값을 유지).
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
