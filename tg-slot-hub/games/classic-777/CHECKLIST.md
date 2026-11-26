# classic-777 체크리스트

`games/_template/CHECKLIST.md`의 출시 절차를 이 팩에 맞춰 적은 것이다. 허브 1호 게임이라 이미 `status: live`이고,
아래 표시는 2026-11-26 출시 수준 감사(`docs/review/classic-777.md`)와 같은 날 다시 돌린 명령을 근거로 한다.
`[x]`는 확인한 것, `[ ]`는 아직 남은 것이다.

## 1. 수학 모델 (`math.json`)

- [x] `symbols` — 7종. `wild`는 `wild: true`, 스캐터 없음. `bar1`~`bar3`는 `anybar` 그룹
- [x] `strips` — 세 릴 모두 42칸, 빈칸 없음. 높은 배당일수록 적게
- [x] `paylines` — 5라인(가운데·윗·아랫 가로줄, 두 대각선). `payModel`은 기본(lines)
- [x] `paytable` — 배수 기준은 라인당 베팅액(총 베팅 ÷ 5)
- [x] `betLevels` — 10 / 20 / 50 / 100 / 200 / 500, 전부 5로 나누어떨어짐
- [x] `scatter` / `mutations` / `gamble` — 쓰지 않음(프리스핀·더블업 없음이 정상)
- [x] 확인: `pnpm --filter @tgslot/rtp-sim sim classic-777 --exact`
      → RTP 94.4944%(목표 94.5% 대비 -0.006%p), 적중률 41.619%, 최대 131.60x

## 2. 로비 메타데이터 (`manifest.json`)

- [x] `id` = 폴더 이름 = `math.json`의 `id`
- [x] `name.en` / `name.ko`
- [x] `reels` / `rows` / `lines` / `betLevels` / `rtpTarget` / `volatility`가 `math.json`과 동일
- [x] `rtpTotalTarget`(0.96) = `rtpTarget`(0.945) + `jackpotContribution`(0.015)
- [x] `features` — `wild` `any-bar` `single-cherry`
- [x] `status: live`
- [x] 확인: `pnpm pack:check classic-777` → 오류 0 경고 0

## 3. 아트 프롬프트 (`art/prompts.json`)

- [x] `concept` — 브라스 라운지 777(네이비·브라스·시안, 글로시 토이 렌더)
- [x] `stylePrefix` — 스타일 락 문자열
- [x] `kind: "symbol"` 7종이 `math.json` 심볼과 빠짐없이 일치
- [x] `kind: "sheet"` 3장(`seven-win`, `wild-win`, `bar3-win`)의 `symbol`이 `math.json` 심볼 id
- [x] `frame` — 세로 캔버스 1024×1536 + 폭 가득한 거의 정사각 창(`docs/ART_DIRECTION.md` v4.1, C777-01)
- [x] 쓰지 않는 asset(`bgFreeSpins` 등) 없음 — 프리스핀이 없으므로
- [x] 확인: `pnpm --filter @tgslot/theme-gen gen games/classic-777 --dry-run` → 자산 12개 전부 «기존 파일 있음, skip 예정»

## 4. 아트 생성

- [x] 심볼 7·시트 3·프레임(세로 1080×1620)·배경 2:3·썸네일 생성 완료
- [x] 프레임 창 위치: 알파 투명 영역 실측(x .0444 y .1259 w .9157 h .7512)과 `theme.json`의 `frameLayout`이 0.001 이내로 일치
- [x] 58px·28px로 줄여도 심볼 실루엣 구별(감사 컨택트 시트)
- [x] 크로마키 가장자리 초록 번짐 없음(감사 컨택트 시트)
- [x] 확인: `pnpm pack:check classic-777` — 오류 0

## 5. 연출 (`art/fx.json`)

- [x] 심볼마다 승리 연출, 빠진 심볼은 `default`(펄스 1.12배)
- [x] `theme.json`의 `fx`는 `art/fx.json`과 같다(생성물이라 직접 고치지 않는다)
- [x] 확인: `pnpm pack:check classic-777` — `art/fx.json와 내용이 다르다` 경고 없음

## 6. 게이트

- [x] 생성/추가한 자산 `git add` — `theme/` 아래 자산은 모두 추적 중. 프리스핀이 없어 `theme/transitions/*`는 해당 없음
- [ ] 저장소에 들어가면 안 되는 파일 정리 — `art/raw/bell.png`(1.4MB)가 `.gitignore`(`games/*/art/raw/`)를 무시하고 추적 중(C777-07).
      커밋할 때 `git rm --cached games/classic-777/art/raw/bell.png`(파일은 로컬에 남겨도 된다)
- [x] `pnpm pack:check` — 이 팩 오류 0 경고 0
- [x] `pnpm --filter @tgslot/rtp-sim exec vitest run src/games.test.ts` — 88 통과 / 2 건너뜀(README 고정값 회귀 포함)
- [ ] `pnpm typecheck` / `pnpm test` — 이 팩은 코드를 바꾸지 않았다. 전체 실행은 통합 때 한 번에(기준선의 `purity.test.ts` CRLF 실패 1건은 공용 담당 몫)
- [x] `README.md`에 페이테이블 표와 실측 수치 기입
- [x] `manifest.json`의 `status`를 `live`로

## 7. 출시 후

- [x] `docs/GAME_CATALOG.md` — 해당 없음(1호 게임이라 카탈로그의 신작 #3~#12·#16에 속하지 않는다)
- [x] `docs/RTP_AUDIT_classic-777.md` 정식 리포트 — 게이트 8/8. 2026-11-26 전수 재측정과 소수점까지 일치

## 8. 검수 후속 (2026-11-26, `docs/review/classic-777.md`)

게임 폴더 안에서 끝나는 것
- [x] C777-06 README 사실 오류·낡은 문장 정정, 아트·테마·사운드 구성 추가, 이 체크리스트 추가
- [ ] C777-07 `art/raw/bell.png` 추적 해제(커밋 때)

그림 요청(아트·전환 담당, 2026-11-26)
- [x] C777-01 세로 프레임으로 교체: 390px 심볼 84.2 → 114.1px(+35.5%), 430px 92.9 → 125.8px, 360×479 77.8 → 93.8px. `frameLayout` 알파 실측 반영, README «릴 창»·`docs/ART_DIRECTION.md` v4.1 갱신
- [x] C777-04 `prompts.json`의 `wild`·`wild-win` 문구를 정지 그림 묘사(오각별 + 방패 배지 + 구슬 광선 + 명패)로 정정, `wild-win`·`thumb` 재생성. 시트가 정지 그림보다 조금 작고 광선이 가는 차이는 남음(README «알려진 한계»)
- [x] C777-05 `bar3-win` 시트 추가, `theme.json` `sheets.bar3.win` 연결. 시트와 `flash`(3구획)를 겹쳐 재생해도 탁해지지 않아 `flash`는 유지(BAR 3종 구획 테스트 `theme.test.ts`가 고정)
- [ ] 커밋 때 `theme/sheets/bar3-win.json`·`bar3-win.webp`를 `git add` (추적 전에는 `pack:check`가 «git에 추적되지 않는다» 오류 2건)
- [ ] 전환 클립: 요청 없음(프리스핀이 없는 게임)

공용 코드·문서 담당이 고칠 것: C777-02, 03, 08, 09, 10, 11, 12, 13(보고서 «발견 목록» 참고)
