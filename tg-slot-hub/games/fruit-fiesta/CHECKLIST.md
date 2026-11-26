# fruit-fiesta 체크리스트

`games/_template/CHECKLIST.md`의 순서를 따라 2026-11-26 검수 시점의 상태를 적었다.
`[x]`는 통과, `[ ]`는 남은 일이다. 남은 일의 근거는 `docs/review/fruit-fiesta.md`.

## 1. 수학 모델 (`math.json`)

- [x] `symbols` 10종 — `wild`(와일드), `scatter`(스캐터), 나머지 8종. 빈칸 심볼 없음
- [x] `strips` 5릴 — 48 / 50 / 48 / 45 / 43칸. 앞 세 릴이 적중률, 뒤 두 릴이 배당 크기를 정한다(README «릴 구성»)
- [x] `paylines` 20개, 배수 기준은 라인당 베팅액(총 베팅액 ÷ 20)
- [x] `paytable` — 체리만 2개 연속 지급(1배)
- [x] `betLevels` 20 / 40 / 100 / 200 / 400 / 1000 — 전부 20으로 나누어떨어짐
- [x] `scatter` — 3개 이상이면 프리스핀 10회, 프리스핀 중 라인·스캐터 승리 ×2, 리트리거 +10회, 베팅 미차감
- [x] 확인: `pnpm --filter @tgslot/rtp-sim sim fruit-fiesta --exact`
      → RTP 94.4930%(목표 94.5% 대비 -0.007%p), 적중률 30.6~30.7%, 최대 배수 100.85x(기본 게임)·325.10x(프리스핀 누적)

## 2. 로비 메타데이터 (`manifest.json`)

- [x] `id` = 폴더 이름 = `math.json`의 `id`
- [x] `name.en` «Fruit Fiesta», `name.ko` «프루트 피에스타»
- [x] `reels` 5 / `rows` 3 / `lines` 20 / `betLevels` / `rtpTarget` 0.945 / `volatility` high — `math.json`과 동일
- [x] `rtpTotalTarget` 0.96 = `rtpTarget` 0.945 + `jackpotContribution` 0.015
- [x] `features` — `freeSpins` `scatter` `wild`
- [x] `status` — `live`
- [x] 확인: `pnpm pack:check fruit-fiesta` — 오류 0, 경고 0

## 3. 아트 프롬프트 (`art/prompts.json`)

- [x] `concept` / `stylePrefix` / `negative`
- [x] `kind: "symbol"` 10종 = `math.json` 심볼 id 전부
- [x] `kind: "sheet"` 3종(`wild-win`, `scatter-win`, `seven-win`)의 `symbol`이 실제 심볼 id
- [x] `frame` — 정사각 캔버스 + 가로형 창(`docs/ART_DIRECTION.md` v3)
- [x] `bg`, `bgFreeSpins`, `thumb`
- [x] `seven-win`·`scatter-win` 프롬프트가 정지 심볼의 실제 모양을 적는다(FF-02, 2026-11-26 갱신)
- [x] `scatter` 프롬프트의 리본 글자(`FREE SPINS`)를 글자 없는 리본으로 바꿈(FF-08)

## 4. 아트 생성

- [x] 심볼 10종·프레임·배경 2장·썸네일·시트 3장 생성, 컨택트 시트로 눈 검수(10종 모두 같은 캔디글라스+황동 스타일, 28px에서도 실루엣 구별)
- [x] `frameLayout.window`가 프레임 알파의 투명 창 실측과 약 4px(1080 기준) 이내로 일치
- [x] 크로마키 가장자리 번짐 없음
- [x] `seven-win`·`scatter-win` 시트를 정지 심볼과 같은 모양으로 재생성하고 컨택트·브라우저 390/430에서 눈 검수(FF-02)
- [x] `scatter` 정지 그림을 글자 없는 리본으로 다시 만든 뒤 `scatter-win`을 맞춤(FF-08)

## 5. 연출 (`art/fx.json`)

- [x] 심볼 10종 승리 연출 + `default` (README «심볼별 당첨 연출»)
- [x] `theme.json`의 `fx`는 `art/fx.json`에서 병합된 값 — `pack:check`에 `art/fx.json와 내용이 다르다` 경고 없음
- [x] 당첨 칸은 금빛 둥근 테두리와 연출로 표시, 당첨 선 긋기 없음
- [x] `shine`은 `seven`·`grape`·`orange` 모두 뺌 — 켜면 회색 반투명 심볼 조각이 칸 밖에 뜸(FF-17). 390·430 고정 응답으로 잔상 없음 확인
- [x] 빅윈 광선을 `beams`에서 `sunburst`로 변경(사선 광택 금지 취향, 2026-11-26). 더 조용하게는 `halo`
- [x] 전환 클립 2편(`fs-enter`·`fs-exit`) — `pnpm --filter @tgslot/theme-gen check:clips` 통과, 정지 0%
- [x] 프리스핀 배경 `bg-freespins.webp`
- [x] 사운드 프리셋 `fruit` — 판정 기록 `docs/SOUND_CHECK.md`, 최종 귀 판정은 사용자 몫

## 6. 게이트

- [x] 자산이 전부 git에 추적됨(전환 클립 포함, `git ls-files games/fruit-fiesta` 38개)
- [x] `pnpm pack:check` — fruit-fiesta 오류 0
- [x] `pnpm --filter @tgslot/rtp-sim test` — RTP 게이트 통과(`docs/RTP_AUDIT_fruit-fiesta.md` 7/7)
- [x] 골든 테스트 — 2M 라운드 시드 42 기준점이 소수점까지 재현(`docs/GOLDEN_BASELINE.md`)
- [x] `README.md`에 페이테이블 표와 실측 수치(해석값 + 500만 몬테카를로 재측정, 2026-11-26)
- [x] `manifest.json`의 `status`를 `live`로

## 7. 출시 후

- [x] `pnpm --filter @tgslot/rtp-sim run audit fruit-fiesta` 정식 리포트 → `docs/RTP_AUDIT_fruit-fiesta.md`
- [x] `docs/GAME_CATALOG.md`는 #3~#12 신작 전용이라 이 게임(2호) 항목은 없다
- [ ] 렌더러 `shine` 마스크 앵커 수정(FF-17의 뿌리, `packages/renderer/src/pixi/symbolFx.ts`) — 고쳐지면 `art/fx.json`에 `shine`을 되살려도 된다
- [ ] 허브 공용 항목(프리스핀 당첨 표시의 ×2 반영, 첫 화면 초기 정지 위치, 390폭 제목 말줄임, 로비 `20 lines`, 빅윈 등급명 한국어화)은
      허브 공용 담당이 고치면 화면에서 다시 확인한다(FF-01·03·05·06·07)
