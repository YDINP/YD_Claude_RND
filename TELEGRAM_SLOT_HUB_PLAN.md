# Telegram 슬롯 허브 — 구조 계획서

작성일: 2026-09-02
상태: Phase 2 첫 게임 완료 (2026-09-02). 아트 생성(Phase A)은 이미지 API 키 대기. 실제 텔레그램 클라이언트 검증은 봇 토큰·공개 URL 확보 후

## 0. 전제와 가정

| 항목 | 결정 | 근거 |
|---|---|---|
| 화폐 | **가상 코인 전용, 현금화 없음** (소셜 카지노 모델) | 실머니 베팅은 Telegram 플랫폼 정책과 국내법 모두 불가 |
| 타깃 | 글로벌(영어/러시아어 1차), 한국어는 2차 | TMA 유저 기반이 해외 중심. 국내는 게임물관리위원회의 "사행성 모사" 등급분류 거부 리스크 |
| 진입점 | 봇 1개 + 미니앱 URL 1개 = 허브 | 게임은 허브 안의 라우트로 로드. 게임마다 봇을 만들지 않음 |
| 수익 | Telegram Stars 코인 구매 + 리워드 광고(Adsgram) | 미니앱 디지털 상품 결제의 유일한 공식 경로가 Stars |
| 핵심 원칙 | **서버 권위(server-authoritative)** | 스핀 결과·잔액은 서버만 결정. 클라이언트는 연출만 담당. goldrush/silkworm에서 얻은 교훈 그대로 |

## 1. 시스템 구성

```
Telegram 앱
 ├─ Mini App (apps/hub)  ──HTTPS──▶  API (apps/api)  ──▶ Postgres (지갑·원장·라운드)
 │    React 19 + Vite                Hono / Node 22   ──▶ Redis (스핀 락·레이트리밋·리더보드)
 │    PixiJS 게임 캔버스
 └─ Bot (apps/bot) ◀──webhook──  Telegram (start 딥링크, Stars 결제, 알림)
```

허브가 하는 일: 로그인, 공용 지갑, 로비(게임 목록), 보너스, 잭팟, 리더보드, 상점.
게임이 하는 일: 릴 연출과 게임별 수학 모델. **지갑을 직접 만지지 않는다.**

## 2. 모노레포 구조

```
tg-slot-hub/
├── apps/
│   ├── hub/            # Telegram Mini App. 로비·지갑·게임 셸 (React 19 + Vite + Zustand)
│   ├── api/            # Hono. 인증·지갑·스핀·보너스·결제 webhook
│   ├── bot/            # grammY. /start 딥링크, Stars 결제, 푸시 알림 (api와 동일 프로세스로 시작)
│   └── admin/          # 운영 대시보드 (Phase 6)
├── packages/
│   ├── shared/         # zod 스키마 + API 타입 + 상수. 클라·서버 공용 SSOT
│   ├── slot-engine/    # 순수 수학 엔진. 릴 스트립·페이라인·피처·RTP 시뮬레이터. DOM/네트워크 의존 0
│   ├── game-sdk/       # 게임 플러그인 계약 (GameManifest, GameMath, GameContext)
│   ├── renderer/       # PixiJS 릴 렌더러·심볼 애니메이션·공통 이펙트(승리 라인, 코인 샤워)
│   └── ui/             # 허브 디자인 시스템. silkworm의 BottomSheet/Odometer 등 이식
├── games/
│   ├── _template/      # 새 게임 스캐폴드 (복사해서 시작)
│   ├── classic-777/    # 1호. 3x3, 5라인
│   └── fruit-fiesta/   # 2호. 5x3, 20라인 + 프리스핀
└── tools/
    ├── rtp-sim/        # CLI. math.json → 1천만 스핀 → RTP·분산·히트율·최대배수 리포트
    └── theme-gen/      # 심볼·프레임·배경 생성 CLI. 프로바이더: OpenAI gpt-image-1 / Gemini 이미지 / 로컬 ComfyUI
```

패키지 매니저는 pnpm workspace. 처음엔 hub 하나로 게임을 코드 스플리팅(`import()`)해 한 번에 배포하고, 게임 수가 늘어 배포 분리가 필요해지면 그때 게임별 번들로 쪼갠다.

## 3. 게임 플러그인 계약 (핵심 설계)

목표: **새 게임 = 코드 0줄, 데이터 팩 1개.** 코드는 엔진과 렌더러에만 있고, 게임은 설정과 에셋만 가진다.

```
games/classic-777/
├── manifest.json   # id, name, version, thumbnail, betLevels, rtpTarget, volatility, features
├── math.json       # reels(스트립), paylines 또는 ways, paytable, wild/scatter, freeSpins, bonus
├── theme/          # symbols/*.webp, bg.webp, sfx/*.ogg, palette.json
└── client.ts       # (선택) 커스텀 연출 훅. 없으면 renderer 기본 연출
```

### 3.1 서버 쪽 계약

```ts
// packages/slot-engine
export function spin(math: GameMath, bet: Bet, rng: Rng): SpinResult
// 같은 seed → 같은 결과. 순수함수라서 단위테스트와 RTP 시뮬을 그대로 공유한다.

export interface SpinResult {
  stops: number[]            // 릴별 정지 위치
  grid: SymbolId[][]         // 화면에 보이는 심볼
  wins: WinLine[]            // 라인, 심볼, 개수, 배수
  totalWin: number
  features: FeatureTrigger[] // 프리스핀 진입, 보너스 진입 등
  nextState?: RoundState     // 프리스핀 잔여 횟수 같은 다음 상태
}
```

### 3.2 클라이언트 쪽 계약

```ts
// packages/game-sdk
export interface GameContext {
  wallet: { balance$: Signal<number> }          // 읽기 전용. 서버 값을 그대로 반영
  api: { spin(bet: Bet): Promise<SpinResult> }  // 유일한 결과 소스
  audio: AudioBus
  haptic: (kind: 'light' | 'medium' | 'success') => void  // TMA HapticFeedback
  i18n: (key: string) => string
  track: (event: string, props?: object) => void
}

export interface GameClient {
  mount(container: HTMLElement, ctx: GameContext): Promise<void>
  unmount(): void
}
```

렌더러는 `math.json`의 릴 크기, 심볼 목록, 페이라인 좌표를 읽어 자동으로 릴을 그린다. 게임별 `client.ts`는 승리 연출이나 보너스 미니게임을 덧붙일 때만 쓴다.

## 4. 서버 권위 스핀 플로우

1. 클라이언트가 `POST /games/:id/spin` 호출. 본문은 베팅액과 idempotencyKey.
2. 서버가 JWT 검증 후 Redis에서 유저 스핀 락을 잡는다. 동시 스핀은 409로 거절.
3. 지갑 잔액을 `SELECT ... FOR UPDATE`로 잠근 뒤 베팅액 차감 가능 여부 확인.
4. `crypto.randomInt` 기반 RNG로 `spin()` 실행. `Math.random`은 금지.
5. 한 트랜잭션에서 차감(debit) → 적립(credit) → 원장 2건 → 라운드 저장 → 잭팟 풀 적립.
6. 응답으로 정지 위치, 승리 라인, **서버 잔액**을 돌려준다.
7. 클라이언트는 릴을 돌리는 연출만 하고, 잔액 표시는 서버 값으로 덮어쓴다.

옵션: provably fair. 라운드 전에 serverSeed 해시를 공개하고 라운드 후 seed를 공개하면 유저가 결과를 검증할 수 있다. 소셜 카지노에선 신뢰 마케팅 요소로 쓸 수 있으니 엔진의 RNG 인터페이스만 seed 주입 가능하게 만들어 둔다.

## 5. 데이터 모델

| 테이블 | 역할 | 비고 |
|---|---|---|
| users | telegram_id, 언어, 레벨, VIP 티어, 추천인 | initData 검증 시 upsert |
| wallets | user_id, coins, gems | row lock 대상. 잔액은 원장 합과 항상 일치해야 함 |
| ledger | 원장. user_id, delta, reason, ref_id, created_at | **append-only**. 수정·삭제 금지 |
| rounds | game_id, bet, result(jsonb), win, seed_hash | 스핀 1회 = 1행. 분쟁 대응과 RTP 실측 |
| games | manifest 캐시, 활성 여부, 정렬 순서 | 로비 목록의 소스 |
| bonus_claims | 데일리/시간 보너스 수령 기록 | 쿨다운 서버 판정 |
| purchases | Stars 결제. telegram_payment_charge_id 유니크 | 환불 webhook 대응 |
| referrals | 추천인, 피추천인, 보상 상태 | 피추천자가 N스핀 이상 해야 보상 지급 |
| jackpot_pools | 풀 잔액, 시드 금액, 마지막 당첨 | 전 게임 베팅의 일정 비율 적립 |
| leaderboard | Redis sorted set (주간) | DB 아님. 주 단위 리셋 |

불변식 검사 잡: 매시간 `SUM(ledger.delta) == wallets.coins` 를 검증하고 어긋나면 알림.

## 6. 허브 기능 (게임을 한 곳에 묶는 이유)

- **공용 지갑**: 어느 게임에서 따도 같은 코인. 게임 간 이동 비용 0.
- **프로그레시브 잭팟**: 모든 게임 베팅의 1%를 풀에 적립. 어떤 게임에서든 터짐. 허브의 존재 이유.
- **보너스 루프**: 데일리 로그인(연속 보너스), 4시간 무료 코인, 파산 구제 코인.
- **미션**: "오늘 아무 게임 100스핀", "신작 게임 20스핀". 신작 유입 장치.
- **리더보드**: 주간 최고 배수·총 승리. 상위 보상은 코인.
- **레벨/VIP**: 누적 베팅으로 레벨업. 베팅 상한과 보너스 크기 해금.
- **추천**: `/start ref_xxx` 딥링크. 피추천자 활동 조건부 보상.
- **상점**: Stars로 코인 팩. 광고 시청으로 소액 코인.

## 7. 기술 선택

| 영역 | 선택 | 이유 |
|---|---|---|
| 허브 프론트 | React 19 + Vite + Zustand | goldrush/silkworm 구조 그대로. `sdk/` 추상화도 재활용 |
| TMA SDK | @telegram-apps/sdk-react | initData, 햅틱, 테마 색, BackButton, 뷰포트 |
| 게임 렌더 | PixiJS 8 + GSAP | 릴은 스프라이트 스크롤이라 물리엔진 불필요. Phaser보다 가볍다. Phaser 경험을 살리고 싶으면 대체 가능 |
| API | Hono + Node 22 | 가볍고 타입 친화적. Render에 배포 |
| DB | Supabase Postgres + Drizzle | 트랜잭션과 row lock이 필수. 확정 |
| 캐시/락 | (Phase 3~) Redis Upstash | 초기엔 Postgres row lock으로 대체. 레이트리밋·리더보드 필요 시 추가 |
| 봇 | grammY | TMA 생태계 표준. Stars 결제 API 지원 |
| 결제 | Telegram Stars | 미니앱 디지털 상품 결제 공식 경로 |
| 광고 | Adsgram | TMA 전용 리워드 광고 |
| 테스트 | Vitest | 엔진 결정론 테스트 + RTP 시뮬 회귀 |
| 배포 | Vercel(hub) + Render(api) | 기존 경험 |

## 8. 개발 페이즈

| Phase | 내용 | 완료 기준 | 기간 |
|---|---|---|---|
| 0 골격 ✅ | pnpm 모노레포, TMA 로그인(initData HMAC 검증 → JWT), mock 지갑, 로비 화면 | 텔레그램에서 미니앱 열고 내 코인이 보임 (브라우저 dev mock 검증 완료, 실기기 검증은 배포 후) | 완료 2026-09-02 |
| 1 엔진 ✅ | slot-engine + rtp-sim CLI + 결정론 테스트 | classic-777 전수조사 RTP 95.996%, 적중률 30.49%, 최대 140.6x. 게이트 테스트가 games/* 전부 검사 | 완료 2026-09-02 |
| 2 첫 게임 ✅ | renderer + classic-777 + 서버 spin API + 원장 | 브라우저 e2e: 스핀→서버 결과→릴 착지→페이라인 오버레이→서버 잔액 반영. 멱등 재전송·provably fair(시드 해시+정지위치 재현) 검증 | 완료 2026-09-02 |
| 3 허브 | 데일리 보너스, 잭팟, 리더보드, 미션, 레벨 | 7일 리텐션 루프가 코드로 존재 | 1~2주 |
| 4 수익화 | Stars 상점, Adsgram, 봇 알림, 추천 딥링크 | 실결제 1건과 광고 리워드 1건 검증 | 1주 |
| 5 양산 | _template + theme-gen → 게임 2·3호 | **게임 1개 추가에 1~2일** | 반복 |
| 6 운영 | admin, 지표(ARPDAU, 세션당 스핀, RTP 실측), 튜닝 | 대시보드에서 RTP·보너스 값 변경 가능 | 이후 |
| A 아트 (Phase 2와 병행) | 이미지 디자인 기획(허브 컨셉·릴 프레임·심볼 세트) → `docs/ART_DIRECTION.md` + 게임별 `art/prompts.json` → `tools/theme-gen`으로 GPT 이미지(gpt-image-1) / Gemini 이미지 / 로컬 ComfyUI 중 가용 프로바이더로 생성 → `theme/` 자동 갱신 | classic-777 심볼 7종·프레임·배경·썸네일이 생성 이미지로 교체되고 렌더러에 표시됨 | 기획·프롬프트·도구 완료. 생성은 `OPENAI_API_KEY` 또는 `GEMINI_API_KEY` 입력 후 `pnpm --filter @tgslot/theme-gen gen games/classic-777` |

각 Phase 완료마다 정리 커밋 + 푸시.

## 9. 리스크

- **플랫폼 정책**: Telegram 이용약관과 Stars 약관의 도박 관련 조항을 구현 전에 확인. 현금화 없는 코인이라도 지역별 차단 가능성이 있음.
- **국내법**: 게임산업법상 슬롯 모사 게임은 등급분류가 거부된 사례가 있음. 국내 미출시 전제로 설계.
- **부정행위**: 클라이언트 조작은 서버 권위로 무력화. 다계정 추천 어뷰징은 피추천자 활동 조건으로 완화.
- **RNG 편향**: `crypto.randomInt`만 사용. rtp-sim이 CI에서 RTP 회귀를 잡는다.
- **지갑 정합성**: append-only 원장 + 시간별 불변식 검사.
- **트래픽 급증**: 스핀 API는 stateless. Redis 락으로 유저별 직렬화만 보장.

## 10. 착수 전 결정 (2026-09-02 확정)

| 항목 | 결정 |
|---|---|
| 렌더러 | **PixiJS 8** |
| 게임 1호 | **3x3 5라인 클래식** (classic-777) |
| 타깃 언어 | **영어 + 한국어** (i18n 키 기반, en 기본) |
| 인프라 | **Supabase 단일** (Postgres). Redis는 Phase 0~2에선 생략, 스핀 직렬화는 Postgres row lock으로. 레이트리밋·리더보드가 필요해지는 Phase 3에서 Upstash 추가 검토 |

프로젝트 폴더: `tg-slot-hub/`
