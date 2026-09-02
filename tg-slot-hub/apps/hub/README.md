# @tgslot/hub

텔레그램 미니앱 슬롯 허브의 프론트엔드(React 19 + Vite + Zustand). 전체 설계는
[../../TELEGRAM_SLOT_HUB_PLAN.md](../../TELEGRAM_SLOT_HUB_PLAN.md) 참고.

## 로컬 개발

```
pnpm install
pnpm --filter @tgslot/hub dev
```

기본적으로 `apps/api`(기본 `http://localhost:8787`)와 함께 실행해야 로그인/게임 목록이 동작한다.
루트에서 `pnpm dev`로 hub + api + bot을 한 번에 띄울 수 있다.

## 텔레그램 밖(브라우저)에서 개발하기 — dev mock

미니앱은 텔레그램 안에서 열려야 initData가 존재한다. 브라우저에서 바로 열면
`@telegram-apps/sdk-react`의 `retrieveLaunchParams()`가 실패하고, 앱은 기본적으로
"텔레그램 안에서 열어주세요" 안내 화면을 보여준다.

로컬 개발 중에만 이 검증을 우회하려면 `.env`에 다음을 설정한다.

```
VITE_DEV_MOCK_TMA=true
```

이 플래그가 켜져 있고 텔레그램 밖에서 열렸을 때, 앱은 고정 initData 문자열
`mock:777000:Dev`로 `/auth/telegram`을 호출한다. `apps/api`는 이 형식을
**개발 모드에서만** 허용하도록 구현되어 있어야 한다(HMAC 서명 없이 통과).
프로덕션 빌드/배포에서는 반드시 이 플래그를 꺼야 한다.

## 프로덕션 빌드에는 VITE_API_URL이 필수

`sdk/api.ts`는 개발 편의를 위해 `VITE_API_URL`이 없으면 `http://localhost:8787`로
폴백하지만, 이 폴백은 **dev/preview에서만** 유효하다. `vite.config.ts`는
`mode === 'production'`일 때 `VITE_API_URL`이 비어 있으면 빌드 자체를 에러로
중단시킨다 — 배포 후 "로그인만 안 됨"으로 조용히 실패하는 상황을 막기 위함이다.
Vercel 등에 배포할 때는 반드시 프로젝트 환경변수에 `VITE_API_URL`(예: 배포된
`apps/api`의 공개 URL)을 등록해야 `pnpm build`가 통과한다.

## 텔레그램 안에서 실제로 테스트하기

1. `pnpm --filter @tgslot/hub dev`로 로컬 서버(기본 5173 포트)를 띄운다.
2. ngrok 또는 cloudflared로 HTTPS 터널을 연다.
   ```
   ngrok http 5173
   # 또는
   cloudflared tunnel --url http://localhost:5173
   ```
3. 발급받은 HTTPS URL을 BotFather의 `/setmenubutton` 또는 `/newapp`에 등록한다
   (@BotFather → 봇 선택 → Bot Settings → Menu Button / Mini Apps).
4. 텔레그램 앱에서 봇을 열고 메뉴 버튼 또는 딥링크로 미니앱을 실행하면
   실제 initData가 주입된 상태로 테스트할 수 있다.

`apps/api`도 같은 방식(또는 동일 터널)으로 공개 URL을 확보해 `VITE_API_URL`에
지정해야 텔레그램 클라이언트에서 API 호출이 성공한다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `pnpm dev` | Vite 개발 서버 (포트 5173) |
| `pnpm build` | `tsc --noEmit` 타입체크 후 프로덕션 빌드 |
| `pnpm test` | Vitest (jsdom) |
| `pnpm typecheck` | `tsc --noEmit` |

## 구조

```
src/
├── router.ts             # 해시 기반 라우터 (#/, #/play/:gameId). navigate(), useRoute()
├── sdk/                   # tma.ts(텔레그램 SDK 래퍼), api.ts(타입세이프 fetch 클라이언트)
├── store/                 # session.ts(인증/지갑), games.ts(로비 목록), game.ts(게임 화면 스핀 플로우)
├── i18n/                  # en/ko 플랫 키맵 + t()/useT()
├── components/
│   └── game/GameScreen.tsx  # 게임 화면(릴 캔버스, 베팅, 스핀, provably fair 시트)
└── styles/                # tokens.css(텔레그램 테마 변수), global.css
```

## 라우팅

별도 라우터 라이브러리 없이 해시 기반으로 동작한다 (`src/router.ts`).

| 경로 | 화면 |
|---|---|
| `#/` | 로비 (`Header` + `Lobby`) |
| `#/play/:gameId` | 게임 화면 (`GameScreen`) |

`GameCard`의 Play 버튼이 `navigateToGame(gameId)`를 호출한다. `GameScreen`은 텔레그램
네이티브 BackButton(`sdk/tma.ts`의 `showBackButton`/`hideBackButton`)과 화면 좌상단의
인페이지 뒤로가기 버튼을 함께 제공한다 — 텔레그램 밖(브라우저) dev 환경에서는 네이티브
BackButton이 없으므로 인페이지 버튼이 유일한 복귀 수단이다.

## 게임 테마 에셋 서빙 (`games/<id>/theme/**`)

게임 팩(`games/classic-777` 등)의 `theme/theme.json`과 심볼/사운드 에셋은 저장소 루트의
`games/` 디렉터리에 있고, hub 앱이 `/games/<id>/theme/...` 경로로 직접 서빙한다
(`@tgslot/renderer`의 `loadTheme(baseUrl, math)`가 `<baseUrl>/theme/theme.json`을 읽는다.
`GameScreen`은 `loadTheme(`/games/${gameId}`, math)`로 호출한다).

- **dev**: `vite.config.ts`의 `tgslot-games-assets` 플러그인이 `/games/*` 요청을
  `../../games`에서 직접 스트리밍한다. `configureServer`를 "post" 훅(함수 반환)으로 등록해
  Vite의 기본 `public/` 정적 서빙 다음에 실행되므로, 기존 `public/games/classic-777/thumb.svg`
  (API 게임 레지스트리가 참조)는 그대로 우선 서빙되고 이 미들웨어가 가리지 않는다.
- **build**: 같은 플러그인의 `closeBundle` 훅이 `games/*/theme/**`와(있다면) `games/*/thumb.*`를
  `dist/games/`로 복사한다. `public/`의 파일은 Vite가 이미 `dist/`로 복사하므로 별도 처리가
  필요 없다.

## 게임 화면 상태 (`store/game.ts`)

`useGameStore`는 게임별 수학 모델(`GameMath`, `@tgslot/slot-engine`의 `parseGameMath()`로 검증),
선택된 베팅 레벨(게임별로 `localStorage`에 기억), 스핀 phase(`loading/idle/spinning/showingWin/error`)를
관리한다. `spin()`은 매 시도마다 `idempotencyKey`(`crypto.randomUUID()`)를 생성하고, `SPIN_IN_PROGRESS`나
네트워크 오류로 실패하면 **같은 키를 유지**해 재시도 시 서버가 결과를 재생(replay)할 수 있게 한다.
`INSUFFICIENT_FUNDS`는 키를 버리고 `phase: 'error'` + `errorCode: 'INSUFFICIENT_FUNDS'`로 표시해
`GameScreen`이 코인 소진 시트를 띄운다. 스핀 성공 시 서버가 돌려준 `wallet` 값으로 세션 지갑을
그대로 덮어쓴다 — 클라이언트는 결과를 계산하지 않는다.
