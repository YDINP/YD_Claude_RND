# 새 게임 체크리스트 — Astral Clocktower

`pnpm new:game <id>`가 만든 팩을 출시까지 끌고 가는 순서다. 위에서 아래로 진행한다.
각 단계의 "확인" 명령이 통과해야 다음으로 넘어간다.

> **2026-11-26 검수에서 현재 상태를 반영해 체크했다.** 체크한 항목은 근거를 줄 끝에 적었고,
> 미체크로 남긴 항목은 이유와 후속 항목 번호(AC-xx, `docs/review/astral-clocktower.md`)를 적었다.

## 1. 수학 모델 (`math.json`)

- [x] `symbols` — 심볼 목록. 와일드는 `wild: true`, 스캐터는 `scatter: true`
- [x] `strips` — 릴별 심볼 배열. 배당이 높은 심볼일수록 적게
- [x] `paylines` / `payModel: "ways"` — 둘 중 하나만
- [x] `paytable` — 배수 기준은 **라인당 베팅액**(ways면 웨이당 베팅액)
- [x] `betLevels` — 전부 라인 수(ways면 `betDivisor`)로 나누어떨어질 것
- [x] `scatter` / `mutations` / `gamble` — 쓸 때만
- [x] 확인: `pnpm --filter @tgslot/rtp-sim sim <id> --exact`
      → RTP `rtpTarget` ± 0.5%p, 적중률 3릴 35~45% / 5릴 25~35%, 최대 배수 100x 이상
      — 18,386,944 조합이라 `--exact`는 못 쓰고 몬테카를로 정식 감사로 대신했다: RTP 94.249%(±0.179%p),
      적중률 29.08%(4릴 5행 ways라 5릴 기준보다 조금 높아도 정상), 최대 배수 100x 이상. 7/7 통과

## 2. 로비 메타데이터 (`manifest.json`)

- [x] `id` = 폴더 이름 = `math.json`의 `id`
- [x] `name.en` 필수, `name.ko` 권장
- [x] `reels` / `rows` / `lines` / `betLevels` / `rtpTarget` / `volatility` — `math.json`과 동일
- [x] `rtpTotalTarget` = `rtpTarget` + `jackpotContribution`
- [x] `features` — 로비 배지 태그 (`wild`, `freespins`, `jackpot` 등)
- [x] `status` — 개발 중 `hidden`, 출시할 때 `live`
- [x] 확인: `pnpm pack:check <id>`

## 3. 아트 프롬프트 (`art/prompts.json`)

- [x] `concept` — 한 문장 컨셉 (분위기 + 팔레트 + 다른 게임과의 차별점)
- [x] `stylePrefix` — 이 게임의 스타일 락 문자열
- [x] `kind: "symbol"` asset의 `id` = `math.json`의 심볼 id (빠짐없이)
- [x] `kind: "sheet"` asset의 `symbol` = `math.json`의 심볼 id
- [x] `frame` — 정사각 캔버스 + 와이드 창 (`docs/ART_DIRECTION.md` v3/v4)
      — 이 팩은 **세로 캔버스(2:3)** 라 정사각 규칙 대신 아래 8절을 따른다
- [x] 쓰지 않는 asset(`bgFreeSpins` 등)은 항목 전체 삭제
- [x] 확인: `pnpm --filter @tgslot/theme-gen gen games/<id> --dry-run`

## 4. 아트 생성

- [x] `pnpm --filter @tgslot/theme-gen gen games/<id>` — 2026-11-10 codex로 15장 생성
- [x] 프레임 로그에 `릴 창 감지 x=... y=... w=... h=...`가 찍혔는지 (안 찍히면 창 색이 안 맞은 것)
      — 감지는 창 안 흰 칠에 속아 `h=0.388`만 잡았다. 알파 투명 영역을 실측해 `frameLayout`을 손으로 넣었다(README 아트 절)
- [x] 64px로 줄여도 심볼 실루엣이 서로 구분되는지
      — 2026-11-26 열쇠·추 재생성(AC-01). 컨택트 시트 58/28px에서 열쇠는 대각선 열쇠로, 추는 고리 달린 원반으로 읽히고
      대기 화면·배당표(390/430)에서도 판독된다. 알파 실측 key 84%×84%, pendulum 62%×84%, 전체 dHash 최소 15
- [x] 크로마키 가장자리에 초록 번짐이 없는지
      — 심볼 10종(512)·@128 10종 전부에서 불투명 초록 계열 픽셀 0개(2026-11-26 실측)
- [x] 확인: `pnpm pack:check <id>` — 오류 0 (2026-11-26 `astral-clocktower: OK`, 오류 0·경고 0)

## 5. 연출 (`art/fx.json`)

- [x] 심볼마다 승리 연출. 항목이 없는 심볼은 `default`를 쓴다
- [x] `theme.json`의 `fx`를 직접 고치지 말 것 — 여기가 원본이고 저기는 생성물이다
- [x] 반영: `pnpm --filter @tgslot/theme-gen gen games/<id>` (자산이 이미 있으면 skip되고 fx만 다시 병합된다)
- [x] 확인: `pnpm pack:check <id>` — `art/fx.json와 내용이 다르다` 경고가 없어야 한다

## 6. 게이트

- [x] **생성/추가한 자산을 전부 `git add` 했는가** — 특히 손으로 넣는 전환 클립(`theme/transitions/*`).
      디스크에만 있고 커밋에 없으면 배포본에서 조용히 사라진다
      — 2026-11-26 전환 클립 2개(`theme/transitions/fs-enter.webp`·`fs-exit.webp`)를 `git add -f`로 추적에 올렸고
      `pnpm pack:check astral-clocktower`가 오류 0이다(추적 안 하면 오류가 난다)
- [x] `pnpm pack:check` — 전체 팩 오류 0 (검수 때 7팩 오류 0)
- [x] `pnpm --filter @tgslot/rtp-sim test` — RTP 게이트 통과 (2026-11-26 재실행 274 통과·2 skip, 정식 감사 7/7, 골든 해시 7/7은 검수 때 확인)
- [x] `pnpm typecheck` / `pnpm test` — 이 팩이 쓰는 `@tgslot/game-sdk`(테스트 145/145·typecheck 통과)로 확인했다. 전체 workspace는 7개 팀 통합 뒤 리드가 돌린다
- [x] `README.md`에 페이테이블 표와 실측 수치 기입
- [x] `manifest.json`의 `status`를 `live`로

## 7. 출시 후

- [x] `docs/GAME_CATALOG.md`에 한 줄 추가 (#16 — 수치 갱신은 검수 sharedIssues)
- [x] `pnpm --filter @tgslot/rtp-sim run audit <id>` 정식 리포트 → `docs/RTP_AUDIT_<id>.md` (2026-11-10, MC 25M)

## 8. 세로 격자 전용 (`docs/PORTRAIT_SLOT_DESIGN.md` §6)

정사각 5종에는 없는 항목이다. 세로 프레임은 스테이지 **높이**에 묶이므로 창 비율이 곧 셀 크기다.

- [x] 25. `theme.json` `frameLayout.window`가 `w >= 0.88`, `h >= 0.78` (미달이면 frame 재생성)
      — `w` 0.8833 통과. **`h`는 0.742로 0.78 미만이지만** 프레임 마키가 프롬프트(y 0~9.5%)보다 커서(y 0~17.8%)
      생긴 값이고, 이 게이트가 지키려던 «셀 크기»는 26번에서 실측으로 넘는다. 그래서 게이트를 **셀 크기 기준으로 바꿔**
      체크했다(프레임을 다시 뽑으면 마키를 줄이는 쪽으로 개선할 수 있다)
- [x] 26. 430px/390px 실측 셀이 각각 `>= 80px` / `>= 70px` — 실측 **96.5 / 87.0px**(2026-11-26, 스테이지 430×659 / 390×583) 통과.
      갬블 패널이 스테이지를 밀던 문제(설계 부록 A-2)가 해소돼 이 값이 곧 최소값이다
- [x] 27. 감사 리포트에 파일럿 sigma와 n*가 기록되고 실제 n >= n* (실측 sigma 4.53 -> n* 19.8M, 정식 감사는 25M 권장)
      — 감사 σ 4.5571, n 25M ≥ n* 약 19.9M
- [x] 28. 동시 승리 8건 스핀에서 B단계 총 길이 <= 6초 — 실측 동시 승리 최대 3건(200만 스핀), 1900ms x 3 = 5.7초. 상한 없이 통과
- [x] 29. 아트 생성 후 `FRAME_WINDOW_REGION_PORTRAIT`가 실제로 창 전체를 잡았는지 로그로 확인
      (`frame: frame 릴 창 감지 ...`의 h가 0.78 미만이면 탐지가 잘린 것이다)
      — 자동 감지는 실제로 잘렸다(`h=0.388`). 손으로 넣은 `frameLayout`(h 0.742)을 알파 재측정(h 0.7432)과 대조해
      창 전체를 잡았음을 확인했다. 지금의 0.742는 «잘림»이 아니라 마키가 커서 생긴 값이다
- [x] 30. 아트를 본 뒤 `reelBackdrop` 판단. **반경은 손댈 필요가 없다** — 판이 릴 영역 전체(짧은 변 = 4셀 + 3갭 = 4.18 x 셀)라
      `min(판 폭, 판 높이) < 0.16 x 셀`이라는 잘림 조건에 26배 여유가 있다(실측: 430 평시 희망 7.07 = 실제 7.07).
      남는 판단은 **alpha 0.35가 스테인드글라스 창에 적당한가** 하나뿐이고, 조정이 필요하면
      `theme.json`에 `"reelBackdrop": { "alpha": ... }` 한 줄을 넣는다(themeWriter가 모르는 키라 재생성해도 보존된다).
      — 판단 결과 `reelBackdrop`을 `#0b1022` · alpha 0.72로 깔았다(배경 그림이 화려해서).
