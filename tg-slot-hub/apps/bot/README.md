# @tgslot/bot

텔레그램 슬롯 허브의 봇 (grammY). `/start` 딥링크, 추천 payload 전달, 명령어/메뉴 버튼 셋업을 담당한다.
전체 설계는 [../../TELEGRAM_SLOT_HUB_PLAN.md](../../TELEGRAM_SLOT_HUB_PLAN.md) 참고.

## 환경변수

리포 루트의 `.env.example`을 `.env`로 복사한 뒤 아래 값을 채운다.

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | BotFather 발급 토큰. 없으면 기동 즉시 에러 |
| `MINI_APP_URL` | 권장 | `http://localhost:5173` (경고 로그 출력) | hub 미니앱 URL. web_app 버튼·메뉴 버튼에 사용 |
| `BOT_WEBHOOK_URL` | 선택 | 미설정 시 long polling | 설정하면 webhook 모드로 전환. 공인 HTTPS 주소 (`/telegram/webhook` 경로로 Telegram이 POST) |
| `BOT_WEBHOOK_SECRET` | `BOT_WEBHOOK_URL` 설정 시 ✅ (16자 이상) | 없음 | `setWebhook`의 secret_token과 짝을 맞추는 값. `X-Telegram-Bot-Api-Secret-Token` 헤더 검증에 사용. **webhook 모드인데 이 값이 없거나 16자 미만이면 `loadConfig`가 즉시 에러를 던진다** — 시크릿이 없으면 grammY가 헤더를 검증하지 않아 `/telegram/webhook` URL을 아는 누구나 가짜 업데이트를 주입할 수 있기 때문 (Phase 4 결제 위조로 이어질 수 있는 경로) |
| `BOT_PORT` | 선택 | `8788` | webhook 모드에서 로컬 HTTP 서버 포트 |

## 실행 모드

- **Long polling (기본, 로컬 개발용)**: `BOT_WEBHOOK_URL`을 비워두면 `bot.start()`로 폴링한다.
- **Webhook (배포용)**: `BOT_WEBHOOK_URL`을 설정하면 `node:http` 서버가 `BOT_PORT`에서 뜨고,
  `POST /telegram/webhook`에서 업데이트를 받는다. `GET /health`는 헬스체크용.
  실제로 Telegram이 이 서버로 업데이트를 보내게 하려면 별도로 `setWebhook` 호출(배포 스크립트/운영 단계에서 처리)이 필요하다.

## 명령어

```bash
pnpm dev          # tsx watch로 개발 실행
pnpm build        # tsc 빌드 → dist/
pnpm start        # dist/index.js 실행
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm setup:bot    # BotFather API로 명령어/메뉴버튼/설명 설정 (아래 참고)
```

## `setup:bot` — 봇 메타데이터 설정

`src/setup.ts`는 Bot API로 다음을 en+ko 둘 다 설정한다:

- `setMyCommands` — `/start`, `/help`
- `setChatMenuButton` — `{ type: 'web_app', text: 'Play', web_app: { url: MINI_APP_URL } }`
- `setMyDescription` / `setMyShortDescription`

실행: `pnpm setup:bot` (해당 봇의 `TELEGRAM_BOT_TOKEN` 필요).

**주의**: 채팅창에서 t.me 링크로 바로 미니앱을 여는 딥링크(`t.me/<bot>/<app>?startapp=...`)를 쓰려면
BotFather에서 `/newapp`으로 앱을 한 번 등록하거나 Menu Button을 BotFather 쪽에서도 확인해야 한다.
이 스크립트는 Bot API로 설정 가능한 항목만 자동화하며, BotFather 전용 등록 단계를 대신하지 않는다.

## 추천 딥링크 (`/start ref_<telegramId>`)

- 유저가 `t.me/<bot>?start=ref_123`으로 들어오면 grammY가 `ctx.match`로 `ref_123`을 넘겨준다.
- `ref_(\d+)` 패턴에 매칭되면 구조화 로그(`{ event: 'referral_start', referrerTelegramId, newUserTelegramId }`)를 남긴다.
  Phase 4에서 `referrals` 테이블 영속화로 교체 예정 (현재는 로그만).
- 동일한 payload는 web_app 버튼 URL에 `?startapp=ref_123` 쿼리로 실어 미니앱까지 전달한다.
  (허브 쪽에서 이 쿼리를 읽어 추천 흐름을 이어받으면 된다.)

## 테스트 방식

grammY 권장 패턴을 따른다:

- `new Bot(token, { botInfo })`로 `bot.init()`의 `getMe` 네트워크 호출을 생략.
- `bot.api.config.use((prev, method, payload) => ...)` 트랜스포머로 `sendMessage` 호출을 가로채고,
  실제 Telegram API 호출 없이 즉시 성공 응답을 반환.
- `bot.handleUpdate(update)`로 가짜 `/start`, `/help` 업데이트를 직접 주입해 핸들러를 검증.
