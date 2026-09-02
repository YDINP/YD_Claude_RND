# @tgslot/api

Telegram 슬롯 허브의 API 서버. Hono + Node로 인증, 공용 지갑, 게임 목록을 제공한다.
`packages/shared`의 zod 스키마가 요청/응답 타입의 단일 진실 공급원(SSOT)이다.

## 엔드포인트

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/health` | - | 헬스체크. `{ ok: true }` |
| POST | `/auth/telegram` | - | `{ initData }` 검증 → 유저 upsert → `{ token, user, wallet }` |
| GET | `/me` | Bearer JWT | `{ user, wallet }` |
| GET | `/games` | - | `{ games: GameSummary[] }`. `hidden` 제외, `sort` 오름차순 |

인증 실패는 `401 { error, code: 'UNAUTHORIZED' | 'INVALID_INIT_DATA' }` 형태로 응답한다.

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Y | - | initData HMAC 서명 검증에 사용 |
| `JWT_SECRET` | Y | - | JWT 서명 시크릿 (HS256) |
| `DATABASE_URL` | N | 없음 | 설정 시 Postgres(drizzle), 없으면 in-memory 레포로 동작 |
| `API_PORT` | N | `8787` | 리슨 포트 |
| `API_ALLOW_DEV_MOCK` | N | `false` | `true`일 때만 `mock:<telegramId>:<firstName>` initData 허용 |
| `CORS_ORIGIN` | N | `*` | CORS allow-origin |

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
- **스핀 API 없음**: 이번 범위(Phase 0)는 로그인/지갑 조회/게임 목록까지만 다룬다.
  스핀 API·Redis 락은 Phase 2에서 추가한다.
