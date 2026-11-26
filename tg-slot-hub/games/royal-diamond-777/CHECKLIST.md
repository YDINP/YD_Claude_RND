# royal-diamond-777 체크리스트

`games/_template/CHECKLIST.md`의 출시 절차를 이 팩에 맞춰 적은 것이다. 이미 `status: live`이고,
아래 표시는 2026-11-26 출시 수준 감사(`docs/review/royal-diamond-777.md`)와 같은 날 다시 돌린 명령을 근거로 한다.
`[x]`는 확인한 것, `[ ]`는 아직 남은 것이다.

## 1. 수학 모델 (`math.json`)

- [x] `symbols` — 10종. `wild`는 `wild: true`, `scatter`는 `scatter: true`, `mystery`는 페이테이블 없음
- [x] `strips` — 릴 길이 47 / 46 / 49 / 51 / 54, 빈칸 없음, 같은 심볼이 붙어 있는 곳 없음(원형 포함)
- [x] `strips` 0~2번 칸 = 첫 화면 — 와일드·스캐터 없이 당첨 없는 화면이 되게 돌려 둠(README «첫 화면», R10)
- [x] `paylines` — 10라인. `payModel`은 기본(lines)
- [x] `paytable` — 배수 기준은 라인당 베팅액(총 베팅 ÷ 10)
- [x] `betLevels` — 10 / 20 / 50 / 100 / 200 / 500, 전부 10으로 나누어떨어짐
- [x] `scatter` — 3개 2배 / 4개 10배 / 5개 40배(총 베팅 기준), 3개 이상이면 프리스핀 8회 ×2, 리트리거 있음
- [x] `mutations` — `mystery` 한 종. 화면의 모든 `?`가 가중 추첨 한 번으로 같은 심볼이 된다. 후보 `seven 4 / diamond 6 / bar3 8 / bell 14 / cherry 26`, 와일드·스캐터 제외
- [x] `gamble` — 쓰지 않음
- [x] 확인: `pnpm --filter @tgslot/rtp-sim sim royal-diamond-777 --exact`
      → RTP 94.4697%(목표 94.5% 대비 -0.030%p), 프리스핀 진입 1.0725%, 표본 적중률 35.0%대(표본마다 34.8~35.1%)

## 2. 로비 메타데이터 (`manifest.json`)

- [x] `id` = 폴더 이름 = `math.json`의 `id`
- [x] `name.en` / `name.ko`
- [x] `reels` / `rows` / `lines` / `betLevels` / `rtpTarget` / `volatility`가 `math.json`과 동일
- [x] `rtpTotalTarget`(0.96) = `rtpTarget`(0.945) + `jackpotContribution`(0.015)
- [x] `features` — `mystery` `freeSpins` `scatter` `wild`
- [x] `status: live`
- [x] 확인: `pnpm pack:check royal-diamond-777` → 오류 0, 경고 1(프리스핀 배경 없음, 아래 3·4절). 2026-11-26 이후: 경고 0, 새 `bg-freespins.webp`는 커밋(`git add`) 전이라 «git에 추적되지 않는다» 오류가 한 건 나온다

## 3. 아트 프롬프트 (`art/prompts.json`)

- [x] `concept` — 로열 다이아몬드 데코(블랙 벨벳·플래티넘·시안·벨벳 레드, 글로시 토이 렌더)
- [x] `stylePrefix` — 스타일 락 문자열
- [x] `kind: "symbol"` 10종이 `math.json` 심볼과 빠짐없이 일치
- [x] `kind: "sheet"` 3장(`seven-win`, `wild-win`, `diamond-win`)의 `symbol`이 `math.json` 심볼 id
- [x] `frame` — 정사각 캔버스 + 와이드 창. 창 수치는 알파 실측(x 6~95%, y 29~76%)으로 맞춤(2026-11-26 정정). `size`는 생성 해상도(1024²)이고 파일은 `outSize` 1080
- [x] `bgFreeSpins` 항목 추가(R2, 2026-11-26) — 기본 배경과 같은 구도에서 샹들리에 시안 광점 강화·벨벳 레드 조명
- [x] 확인: `pnpm --filter @tgslot/theme-gen gen games/royal-diamond-777 --dry-run` → 자산 16개 전부 «기존 파일 있음, skip 예정»

## 4. 아트 생성

- [x] 심볼 10·시트 3·프레임·배경 2:3·썸네일 생성 완료
- [x] 프레임 창 위치: 알파 투명 영역 실측과 `theme.json`의 `frameLayout`이 0.2~0.4% 이내로 일치
- [x] 58px·28px로 줄여도 심볼 실루엣 구별(감사 컨택트 시트, 해밍 거리 16 미만 쌍 없음)
- [x] 크로마키 가장자리 초록 번짐 없음(감사 컨택트 시트)
- [x] 프리스핀 배경 생성(`bg-freespins`, 1080×1620, 100 KB) — `theme.json`에 `backgroundFreeSpins` 기록됨, 390·430폭 프리스핀 화면 눈 확인(R2)
- [x] 확인: `pnpm pack:check royal-diamond-777` — 오류 0

## 5. 연출 (`art/fx.json`)

- [x] 심볼마다 승리 연출, 빠진 심볼은 `default`(펄스 1.12배)
- [x] `theme.json`의 `fx`는 `art/fx.json`과 같다(생성물이라 직접 고치지 않는다)
- [x] `shine`(세븐 25°, 다이아 20°)은 심볼 모양 마스크 안에 갇힌 광택이라 화면을 가로지르는 사선 광택이 아니다
- [x] 확인: `pnpm pack:check royal-diamond-777` — `art/fx.json와 내용이 다르다` 경고 없음

## 6. 전환 클립 (`theme/transitions/`)

- [x] `fs-enter.webp`·`fs-exit.webp` 각 3.00초, `theme.json`에 `freeSpinsEnter`(`opaqueMs 2500`, `durationMs 3000`)·`freeSpinsExit` 배선
- [x] 확인: `pnpm --filter @tgslot/theme-gen check:clips` — 둘 다 통과(최대 프레임 63ms / 187ms, 정지 0%)
- [x] 진입 클립 이음매 제거(R4, 소스 11.04초 앞에서 끊고 끝을 흐린 판으로 디졸브, 비용 0)
- [ ] 복귀 클립 끝의 쐐기 잔상 25~30%(3-4에 기록된 흠, 손대지 않음)

## 7. 사운드 (`theme.json`의 `sound.preset`)

- [x] `bell` 프리셋 — 이벤트별 소리는 코드에 모두 있다(스핀·정지·당첨·빅윈·피처·미스터리 공개·기대감·롤업·UI·BGM 모드)
- [ ] 이 게임 고유의 소리(미스터리 공개음) — 공용 코드(`apps/hub/src/lib/audio.ts`) 담당(R12). 최종 귀 판정은 사용자 몫

## 8. 게이트

- [x] 생성/추가한 자산 `git add` — `theme/` 아래 자산과 `theme/transitions/*`는 모두 추적 중
- [x] `pnpm pack:check royal-diamond-777` — 오류 0 경고 1
- [x] `pnpm --filter @tgslot/rtp-sim run audit royal-diamond-777 --shards 4` — 게이트 7/7, `docs/RTP_AUDIT_royal-diamond-777.md` 갱신
- [ ] `pnpm --filter @tgslot/slot-engine exec vitest run src/golden.test.ts` — 첫 화면 스트립 회전(R10)으로 이 게임 해시가 바뀐다. 새 해시 `2e65d6ad263c8e759c53b04929c055d2773ccbab98c64762073f607eeaaf55e2`, 통합 담당이 `UPDATE_GOLDEN=1`로 다시 쓸 것
- [x] `README.md`에 페이테이블 표와 실측 수치 기입(적중률·최대 배수는 표본 라벨 포함)
- [x] `manifest.json`의 `status`를 `live`로

## 9. 사용자 결정이 필요한 것

- [ ] 스캐터 이름 «데코 스타» / `Deco Star` — 그림은 받침 위 다이아몬드이고 별은 와일드다. 추천: «프리스핀 보석» / `Free Spin Gem`(뜻이 바로 보이는 쉬운 말). 이름은 `math.json`의 `symbols[].name`에 있다

## 10. 검수 후속 (2026-11-26, `docs/review/royal-diamond-777.md`)

게임 폴더 안에서 끝난 것
- [x] R10 첫 화면이 5와일드 한 줄로 시작 → 스트립 회전(해석 RTP 불변). 골든 해시 갱신만 남음
- [x] R11 README 수치·라벨 정정(적중률·관측 최대 배수), 아트·전환·사운드 구성 추가, `art/prompts.json` frame 창 수치 정정, 이 체크리스트 추가

그림·영상을 새로 만들어야 하는 것
- [x] R2 프리스핀 배경 `bg-freespins` (2026-11-26, 아트 담당)
- [x] R4 진입 클립 이음매 — 원본 재편집으로 해결(재생성 안 함, 비용 0)

공용 코드·문서 담당이 고칠 것: R1, R3, R5, R6, R7, R8, R9, R12, R13과 `docs/GAME_CATALOG.md` #3 갱신(보고서 «수정 내역» 참고)
