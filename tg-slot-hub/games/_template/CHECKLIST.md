# 새 게임 체크리스트 — Template Slot

`pnpm new:game <id>`가 만든 팩을 출시까지 끌고 가는 순서다. 위에서 아래로 진행한다.
각 단계의 "확인" 명령이 통과해야 다음으로 넘어간다.

## 1. 수학 모델 (`math.json`)

- [ ] `symbols` — 심볼 목록. 와일드는 `wild: true`, 스캐터는 `scatter: true`
- [ ] `strips` — 릴별 심볼 배열. 배당이 높은 심볼일수록 적게
- [ ] `paylines` / `payModel: "ways"` — 둘 중 하나만
- [ ] `paytable` — 배수 기준은 **라인당 베팅액**(ways면 웨이당 베팅액)
- [ ] `betLevels` — 전부 라인 수(ways면 `betDivisor`)로 나누어떨어질 것
- [ ] `scatter` / `mutations` / `gamble` — 쓸 때만
- [ ] 확인: `pnpm --filter @tgslot/rtp-sim sim <id> --exact`
      → RTP `rtpTarget` ± 0.5%p, 적중률 3릴 35~45% / 5릴 25~35%, 최대 배수 100x 이상

## 2. 로비 메타데이터 (`manifest.json`)

- [ ] `id` = 폴더 이름 = `math.json`의 `id`
- [ ] `name.en` 필수, `name.ko` 권장
- [ ] `reels` / `rows` / `lines` / `betLevels` / `rtpTarget` / `volatility` — `math.json`과 동일
- [ ] `rtpTotalTarget` = `rtpTarget` + `jackpotContribution`
- [ ] `features` — 로비 배지 태그 (`wild`, `freespins`, `jackpot` 등)
- [ ] `status` — 개발 중 `hidden`, 출시할 때 `live`
- [ ] 확인: `pnpm pack:check <id>`

## 3. 아트 프롬프트 (`art/prompts.json`)

- [ ] `concept` — 한 문장 컨셉 (분위기 + 팔레트 + 다른 게임과의 차별점)
- [ ] `stylePrefix` — 이 게임의 스타일 락 문자열
- [ ] `kind: "symbol"` asset의 `id` = `math.json`의 심볼 id (빠짐없이)
- [ ] `kind: "sheet"` asset의 `symbol` = `math.json`의 심볼 id
- [ ] `frame` — 정사각 캔버스 + 와이드 창 (`docs/ART_DIRECTION.md` v3/v4)
- [ ] 쓰지 않는 asset(`bgFreeSpins` 등)은 항목 전체 삭제
- [ ] 확인: `pnpm --filter @tgslot/theme-gen gen games/<id> --dry-run`

## 4. 아트 생성

- [ ] `pnpm --filter @tgslot/theme-gen gen games/<id>`
- [ ] 프레임 로그에 `릴 창 감지 x=... y=... w=... h=...`가 찍혔는지 (안 찍히면 창 색이 안 맞은 것)
- [ ] 64px로 줄여도 심볼 실루엣이 서로 구분되는지
- [ ] 크로마키 가장자리에 초록 번짐이 없는지
- [ ] 확인: `pnpm pack:check <id>` — 오류 0

## 5. 연출 (`art/fx.json`)

- [ ] 심볼마다 승리 연출. 항목이 없는 심볼은 `default`를 쓴다
- [ ] `theme.json`의 `fx`를 직접 고치지 말 것 — 여기가 원본이고 저기는 생성물이다
- [ ] 반영: `pnpm --filter @tgslot/theme-gen gen games/<id>` (자산이 이미 있으면 skip되고 fx만 다시 병합된다)
- [ ] 확인: `pnpm pack:check <id>` — `art/fx.json와 내용이 다르다` 경고가 없어야 한다

## 6. 게이트

- [ ] **생성/추가한 자산을 전부 `git add` 했는가** — 특히 손으로 넣는 전환 클립(`theme/transitions/*`).
      디스크에만 있고 커밋에 없으면 배포본에서 조용히 사라진다
- [ ] `pnpm pack:check` — 전체 팩 오류 0
- [ ] `pnpm --filter @tgslot/rtp-sim test` — RTP 게이트 통과
- [ ] `pnpm typecheck` / `pnpm test`
- [ ] `README.md`에 페이테이블 표와 실측 수치 기입
- [ ] `manifest.json`의 `status`를 `live`로

## 7. 출시 후

- [ ] `docs/GAME_CATALOG.md`에 한 줄 추가
- [ ] `pnpm --filter @tgslot/rtp-sim run audit <id>` 정식 리포트 → `docs/RTP_AUDIT_<id>.md`
