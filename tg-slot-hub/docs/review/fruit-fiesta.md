# fruit-fiesta 검수 보고서

- 검수일: 2026-11-26 / 대상: `games/fruit-fiesta` (5×3 · 20라인 · 스캐터 프리스핀 ×2)
- 방식: 코드·데이터는 고치지 않고 이 보고서만 썼다. 개발 스택(API 8842, 허브 5242, 디버그 프리셋)에서 헤드리스 크롬으로 390×844·430×932(DSF 2)를 직접 열어 PNG를 눈으로 확인했다. 띄운 서버는 PID로 모두 껐다.
- 스크린샷·스크립트 폴더(저장소 밖): `D:/park/tgslot-wt/_qa/review-fruit-fiesta-audit/`
- 출시 막는 결함(blocker): **없음**. 출시 전에 고칠 것은 major 2건(FF-01, FF-02).

## 1. 확인표 결과 (기능별 1회)

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | 팩 | 통과 | `pnpm pack:check fruit-fiesta` 오류 0·경고 0. manifest↔math 일치(5×3, 20라인, betLevels, rtpTarget 0.945, high). status `live`, 자산 전부 git 추적. `theme.json` 의 `frameLayout` 이 프레임 알파 투명 창 실측과 일치(x 0.0442↔0.0463, w 0.9131↔0.9093, 오차 ≤4px/1080). |
| 2 | 수학 | 통과 (문서만 낡음 → FF-04) | `math.json` 은 a4321d2(2026-09-02) 이후 변경 없음. `RTP_AUDIT_fruit-fiesta.md` 7/7 통과, 현재 `sim --exact` 가 같은 값(기본 94.4930%, 페이라인 61.987 + 스캐터 4.584 + 프리스핀 27.922, 진입 1.7336%). 골든 2M(seed 42)가 소수점까지 재현(94.843% / 30.527% / σ 4.629 / 325.10x / 1.7304%). `pnpm --filter @tgslot/rtp-sim test` 274 통과·2 건너뜀. README의 정확 RTP·적중률 30.7%·최대 100.85x·프리스핀 58스핀당 1회·평균 12.10회는 현재 값과 맞다. README의 몬테카를로 표는 재현되지 않는다(FF-04). 도움말에는 RTP·적중률·최대 당첨 수치가 없다(불일치가 아니라 정보 없음, FF-09). |
| 3 | 화면 | 통과 + 발견 있음 | 기본·스핀 중·당첨·빅윈·프리스핀 진입/진행/종료·도움말 4쪽·설정을 두 폭에서 확인. 잘림·겹침 없음, 프레임 창과 릴 정렬 정확, 배경 cover 정상, 당첨 금액은 컨트롤 바로 위, 설정은 중앙 팝업. 발견: FF-01, FF-03, FF-05, FF-06, FF-07, FF-14. |
| 4 | 연출 | 통과 + 발견 있음 | 당첨 순환은 금빛 둥근 테두리와 딤으로 표시(선 긋기 없음), 스캐터는 링, 롤업 정상, STOP 은 +186ms 에 정지·당첨 연출 진입, 전환 클립(진입 과즙→덮임→스왑, 복귀 과즙 빠짐→등불→크로스페이드)은 보통·빠름에서 재생. 기대감은 마지막 릴 감속+상승음(별도 광 없음). 발견: FF-02, FF-10, FF-12. |
| 5 | 아트 | 통과 + 발견 있음 | 컨택트 시트(`11-contact.png`): 10종 모두 같은 캔디글라스+황동 스타일, dHash 해밍 <14 쌍 없음, 28px 에서도 실루엣 구별. 누락 자산 없음. 발견: FF-02, FF-08. |
| 6 | 사운드 | 코드 확인 통과 | `theme.sound.preset = "fruit"` 지정, 효과음(spin·stop·win·bigwin·feature·mutation·riser·tick)·BGM(기본/프리스핀 변주) 레시피 존재. 귀 판정은 사용자 몫. 소견: FF-11. |
| 7 | 언어 | 발견 있음 | 번역 키 ko/en 202개 완전 일치. 한국어 기본 화면의 영어 잔존: FF-03, FF-07, FF-08. |
| 8 | 성능·메모리 | 통과 | 스핀 약 43회(프리스핀 10회 포함, 터보) 전후 JS 힙(강제 GC 후) 11.4 → 13.6(10회) → 13.8(25회) → 14.4MB(끝), DOM 노드 154~165·리스너 202~210 일정. 첫 10회 뒤 증가는 캐시 워밍이고 이후 40회에 +0.7MB(회당 약 16KB). 콘솔 오류는 `favicon.ico` 404 뿐(FF-13). 텍스처 수는 허브가 렌더러 진단을 노출하지 않아 직접 못 셌다. |
| 9 | 문서 | 발견 있음 | README 낡음, CHECKLIST.md 없음(FF-04). |

## 2. 발견

### FF-01 [major · shared] 프리스핀 중 당첨 표시가 ×2 배수 적용 전 금액이다

프리스핀 한 판의 `당첨` 금액·`합계`·라인 문구가 배수 적용 전 라인 합이고, 지갑·종료 팝업·빅윈 오버레이는 배수 적용 후다. 한 번 도는 동안 눈에 보이는 숫자와 지갑 증가가 두 배씩 어긋난다.

- 실측: 8/10번째 스핀 `당첨 30 / 합계 30`인데 지갑은 10,480 → 10,540(+60). 9/10번째 `합계 5` ↔ +10. 종료 팝업 `획득 100`(첫 실행)인데 스핀별 표시(5 + 30 + 15)를 더하면 50. 430폭 실행도 종료 팝업이 `획득 164`로 지갑 증가와 같았다.
- 서버 응답(`s07-spins.json`): `wins[0].win = 75`, `totalWin = 150`, `freeSpins.multiplier = 2`. 서버 값은 맞고 표시만 다르다.
- 원인: `apps/hub/src/components/game/GameScreen.tsx:1368` 이 `showWins(lastResult.wins, …)` 로 배수 전 라인 승리를 넘기고, `packages/renderer/src/presentation.ts:122` 의 `totalWinOf(wins)` 가 그 합을 `winTotal` 이벤트로 내보낸다. 프리스핀 배수가 있는 모든 게임에 해당한다.
- 증거: `06-fs-390-032-25936.png`, `06-fs-390-028-22302.png`, `06-fs-430-end.png`, `s06-430.log`.
- 고칠 방향: 프리스핀 중 `showWins` 에 `multiplier` 옵션을 넘겨 라인별 금액과 합계에 곱하거나, 합계를 `lastResult.totalWin` 으로 맞춘다. 라인 문구(`7 7 7 · 75`)도 같은 기준으로. 테스트 추가.

### FF-02 [major · art] seven·scatter 승리 시트가 정지 심볼과 다른 그림이다

시트가 재생되는 순간 심볼 모양이 바뀐다.

- seven: 정지 그림은 얇은 금테 7(보석 없음), 시트는 더 굵고 파란 보석 2개가 박힌 7. 430 당첨 화면에서 이긴 7 네 개만 굵고 보석이 있고 옆의 정지 7은 얇다(`09-win-430.png`).
- scatter: 정지 그림은 남색 별+금색 별 중심, 시트는 청록 보석+날개가 중심인 별(`16-scatter-end.png` 왼쪽 위). 프리스핀 트리거 순간마다 보인다.
- wild 시트는 정지 그림과 같은 디자인이라 문제없다(`15-sheet-wild.png`).
- 원인: `art/prompts.json` 의 시트 프롬프트가 글로만 심볼을 묘사하고 정지 이미지를 참조하지 않는다.
- 비교: `19-static-vs-sheet.png`, `15-sheet-seven.png`, `15-sheet-scatter.png`.
- 고칠 방향(택1): ① 시트 프롬프트에 정지 디자인을 정확히 적어(7: 보석 없음·얇은 금테, 스캐터: 금별 중심) `gen --only seven-win,scatter-win --force` 후 컨택트로 눈 검수. ② `theme.json` 의 `sheets` 에서 seven·scatter 를 빼고 `art/fx.json` 의 절차적 연출(pulse·shine·glow·spin)만 쓴다(game-local, 즉시 가능). 시트에도 `shine` fx 가 겹쳐 있어 7 은 빛이 이중이다.

### FF-03 [minor · shared] 빅윈 등급 이름이 한국어 화면에서 영어다

`BLAST` 등 `SURGE/BLAST/STORM/CATACLYSM` (`apps/hub/src/i18n/ko.ts:104-107`). 사용자 규칙은 한국어 기본·쉬운 말. 팩의 `celebration.labels` 로 덮어쓸 수 있지만 문자열 한 개라 언어별 구분이 안 되므로 `ko.ts` 에서 고치는 게 맞다. 증거 `05-bigwin-390-t5800.png`, `09-bigwin-430.png`.

### FF-04 [minor · game-local] README가 낡았고 CHECKLIST.md가 없다

- 첫 문단 "코드는 없고 `math.json` + `manifest.json`만 있다"는 사실이 아니다(art·theme·sheets·transitions·celebration·sound 존재).
- 몬테카를로 표(5M, seed 42: 94.5081%·적중률 30.572%·진입 1.736%·유료 스핀당 0.2102·최대 285.6x·σ 4.586)가 현재 엔진에서 재현되지 않는다. 같은 명령 실측: 94.435%·30.567%·1.7297%·0.2094·325.10x·σ 4.582. 골든 기준점·RTP 감사 문서는 재현되므로 README 표만 낡은 것이다. 해석값 대비 차이는 -0.058%p(표준오차 약 0.28배)로 통계적으로는 정상.
- 아트·사운드·전환 클립·빅윈 스킨 설명이 없고, `CHECKLIST.md` 가 없다(candy-cluster-pop 에는 있음).
- 고칠 방향: 위 실측으로 표를 갱신하고 첫 문단·피처 절을 고친다. 문서만 손보면 된다.

### FF-05 [minor · shared] 첫 화면이 와일드 5연속 줄이다

허브가 `initialStops` 를 넘기지 않아 모든 릴이 정지 위치 0이고, fruit 의 스트립 인덱스 0이 전부 `wild` 라 윗줄이 `WILD ×5`다. 열자마자 대박이 난 것처럼 보이고, 새로고침 때마다 같다. 증거 `01-idle-390.png`, `08-help-390-1-페이라인.png`. 고칠 방향: 허브에서 무작위·마지막 정지 위치를 넘기거나 팩별 초기 위치를 둔다(스트립을 돌려 쓰면 RTP는 같지만 골든 해시가 바뀌므로 공용 담당이 정할 일).

### FF-06 [minor · shared] 390폭에서 상단 제목이 말줄임된다

잭팟·도움말·코인(시작 잔액 10,000 이상) 알약이 폭을 먹어 `프루트 피에…` 로 잘린다. 430폭에서는 정상. 증거 `01-idle-390.png`, `06-fs-390-*.png`.

### FF-07 [minor · shared] 로비 카드에 영어 `20 lines`

`5×3 · 20 lines` (`apps/hub/src/components/GameCard.tsx` 의 `specLabel`). 증거 `10-lobby-390.png`.

### FF-08 [minor · art] 스캐터 그림 안의 `FREE SPINS` 영어 글자

리본 글자가 58px 이하에서 읽히지 않고 한국어 기본 화면에 영어로 남는다(프레임의 `FRUIT FIESTA` 마퀴는 브랜드 표기로 본다). FF-02 에서 스캐터를 다시 만들 때 글자 없는 리본이나 기호로 바꾸는 방안. 증거 `11-contact.png`.

### FF-09 [minor · shared] 도움말 문구 정확도와 정보 부족

- 와일드 문구 `와일드는 모든 심볼을 대체합니다`는 스캐터를 대체하지 않는다는 점이 빠져 있다(README·엔진은 스캐터 제외). 도움말 피처 쪽 3줄은 `10회, 배수 ×2`·`재발동하면 스핀이 추가돼요`뿐이라 ×2가 라인·스캐터 승리 모두에 걸린다는 것, 프리스핀은 베팅을 다시 차감하지 않는다는 것, 재발동 +10회라는 수치가 없다.
- 라인 도움말 쪽에 연속 규칙(왼쪽부터·한 라인 최고 하나만 지급)이 없다. 체리만 2개 지급이라는 점은 칩(`2: ×1`)으로만 보인다.
- 공정성 쪽은 한 판 돌린 뒤에만 채워진다(의도).
- 증거 `08-help-390-0-배당표.png`, `08-help-390-2-피처.png`, `08-help-390-3-공정성.png`.

### FF-10 [minor · game-local] 빅윈 광선 `beams` 가 취향에 걸릴 수 있다

`theme.json` 의 `celebration.rays.style = "beams"` 는 굵은 사선 광선이 화면 전체를 가른다(`05-bigwin-390-t2800.png`). «화면을 가로지르는 사선 광택 금지» 에 해당하는지는 사용자 눈 판정이 필요하다. 걸리면 `sunburst` 나 `halo` 로 바꾸면 된다(royal-diamond-777·astral-clocktower 도 `beams`).

### FF-11 [minor · shared] 사운드 소견 (귀 판정 전)

- candy 배경음과 fruit 배경음이 CLAP 코사인 0.91로 거의 같다(`docs/SOUND_CHECK.md` 의 candy 절, 힌트와 일치). 공용 사운드 담당이 구분을 더해야 한다. 기대감 상승음도 fruit/clockwork 가 0.968 로 거의 같은 소리다.
- fruit 항목 중 `docs/SOUND_CHECK.md` 가 '주의'로 남긴 것: 릴 정지 5연속(z 1.35), mutation(z 1.60), 롤업(z 1.73). 작은 당첨은 -30.9 LUFS 로 믹스에서 BGM 위 +3.6dB 뿐이라 가장 가려지기 쉽다.
- 코드상 프리스핀 종료 팝업과 빅윈 오버레이의 롤업에는 틱·마감음 호출이 없다(`playRollupTick`·`playRollupEnd` 는 렌더러 `winTotal` 경로에만 연결). 빅윈 오버레이가 몇 초씩 이어지는데 소리는 `playWin` 한 번뿐일 수 있다. 귀로 확인 필요.

### FF-12 [minor · shared] 터보에서는 전환 클립이 단색 커튼으로 대체된다

`speed: turbo` 에서 두 클립 모두 `coveredTooShort` 로 접힌다(콘솔 로그). 보통·빠름에서는 재생된다(진입 덮임 2.25초 후 스왑, 복귀는 마지막에 크로스페이드). 설계된 폴백이지만 터보 사용자는 팩 전환 연출을 보지 못한다. 복귀 클립의 끝 장면은 남색 밤 등불이고 기본 배경은 황혼이라 크로스페이드로 이어질 때 색이 한 번 바뀐다(`14-exit-clip-montage.png`).

### FF-13 [minor · shared] 콘솔 잡음

오류는 `favicon.ico` 404 한 가지(로드마다 1건). 아이콘 링크가 없다. 그리고 `[transition-clip]` 정보 로그가 `console.warn` 으로 나간다.

### FF-14 [minor · shared] 릴 크기 («릴은 크게» 실측)

정사각 프레임+가로형 창(5릴 프레임 v3) 구조라 390폭에서 릴 창이 356×211px(스테이지 390×582 높이의 36%, 화면 높이의 25%), 칸은 약 71×71px다. 심볼은 칸의 `SYMBOL_FILL_RATIO 0.86` × 아트 알파 0.60~0.84라 최대 51px, 좁은 모양(레몬 0.60·세븐 0.68)은 더 작다. 판독에는 문제 없다. 위아래 배경이 크게 남아 릴이 더 커 보일 여지가 있다. 증거 `01-idle-390.png`, 아트 여백 실측은 §3.

### FF-15 [minor · game-local] 체리 2개(0.25x) 당첨이 전체 스핀의 8.8%

README가 밝힌 설계다. 적중의 약 4분의 1 이상이 총 베팅보다 적게 돌려주는 «당첨»이라 당첨 연출·카운터가 돈다. 제품 판단 사항이라 바꿀 필요는 없고 알려 둔다.

## 3. 측정값 기록

- 심볼 알파 영역(512 캔버스 대비 가로×세로): wild 0.84×0.77, scatter 0.84×0.79, seven 0.68×0.84, bell 0.69×0.84, watermelon 0.81×0.84, grape 0.69×0.84, plum 0.78×0.84, orange 0.83×0.84, lemon 0.60×0.84, cherry 0.84×0.83. 모두 중앙 정렬.
- 프레임 1080², 배경 1080×1620(스테이지 비율과 일치), 전환 클립 360×640·48프레임·3.00초·정지 0%(`check:clips` 통과).
- 스핀 응답 예시(프리스핀 중 벨 4연속): `wins[].win` 75 → `totalWin` 150.
- 프리스핀 흐름 로그: 트리거 스핀 → 스캐터 링 → 진입 팝업(×2, 약 9초 뒤 자동 닫힘) → 클립 → 10회 → 종료 팝업 → 복귀 클립. 재발동(+10회, 총 20)도 한 번 지나갔다(로그만 확인, 화면 캡처는 남기지 않음).

## 4. 스크린샷 목록

`D:/park/tgslot-wt/_qa/review-fruit-fiesta-audit/` 아래.

- 기본·스핀: `01-idle-390.png`, `02-spinning-a.png`, `02-after-spin-final.png`, `08-idle-390.png`, `09-idle-430.png`
- 일반 당첨: `04-win-t1500.png`~`t5200.png`, `09-win-430.png`
- 빅윈: `05-bigwin-390-t2800.png`·`t5800.png`·`t9000.png`·`t14000.png`, `09-bigwin-430.png`, `09-bigwin-after-tap-430.png`
- 프리스핀: `06-fs-390-*.png`(진입 popup 007·012, 클립 019, 진행 024~056, 종료 059, end), `06-fs-430-*.png`, 전환 `13-enter-clip-montage.png`·`14-exit-clip-montage.png`, 클립 프레임 `12-clip-fs-enter.png`·`12-clip-fs-exit.png`
- 도움말: `08-help-390-0-배당표.png`, `08-help-390-1-페이라인.png`, `08-help-390-2-피처.png`, `08-help-390-3-공정성.png`, `09-help-430.png`
- 설정·로비: `10-settings-390.png`, `10-lobby-390.png`
- 아트: `11-contact.png`, `15-sheet-wild.png`, `15-sheet-seven.png`, `15-sheet-scatter.png`, `19-static-vs-sheet.png`
- 기대감·스캐터: `16-scatter-montage.png`, `16-scatter-anticip.png`, `16-scatter-end.png`
- 디버그 패널: `03-debug-panel.png`
- 스크립트: `lib.mjs`, `s01`~`s16.mjs`, `contact.mts`, `frame.mts`, `bbox.mts`, `clip.mts`

## 5. 팀에 넘길 우선순위

1. FF-01 (공용 허브/렌더러) — 프리스핀이 있는 모든 게임이 같은 증상. 출시 전.
2. FF-02 (아트 또는 theme.json 에서 시트 제거) — fruit 단독으로 처리 가능.
3. FF-04 (README·CHECKLIST) — 문서만.
4. FF-03·05·06·07·09·13 — 공용 담당에게 묶어서.
5. FF-10 — 사용자 눈 판정 후.
6. FF-11 — 공용 사운드 담당, 귀 판정은 사용자.

## 6. 수정 내역 (수정 1차, 2026-11-26)

수정 허용 범위(`games/fruit-fiesta/**`, 이 보고서, `docs/RTP_AUDIT_fruit-fiesta.md`) 안의 game-local 항목만 고쳤다.
그림 생성은 하지 않았고(art 항목은 요청서로 정리), 공용 파일은 건드리지 않았다. 커밋·푸시는 하지 않았다.

| id | 처리 | 변경 | 확인 |
|---|---|---|---|
| FF-04 | 고침 | `games/fruit-fiesta/README.md` — 첫 문단을 사실대로(데이터 팩이지만 art·theme·시트·전환 클립·빅윈 스킨·사운드가 있음) 고치고, 몬테카를로 표를 현재 엔진 재측정값(94.435%·적중률 30.567%·진입 1.7297%·유료 스핀당 0.2094회·최대 325.10x·σ 4.582, 해석값 대비 -0.058%p = 0.28 표준오차)으로 갱신. 상위 구간 표의 «20만 스핀 표본»은 사실 해석적 정확값이라 문구를 바로잡음. «릴 창»·«아트·테마·사운드 구성»(파일 표·심볼별 당첨 연출·전환 클립·빅윈 연출·사운드)·«알려진 한계» 절 추가. `games/fruit-fiesta/CHECKLIST.md` 신규(템플릿 순서, 통과/남은 일 표시) | `sim fruit-fiesta --exact`(94.4930%, 문서와 일치), `sim --spins 5000000 --seed 42` 재실행(위 값, 약 27초), `pnpm pack:check fruit-fiesta` 오류 0·경고 0 |
| FF-10 | 고침 | `theme/theme.json` `celebration.rays.style` `beams` → `sunburst`(classic-777·candy-cluster-pop·sheriff-sixgun과 같은 기본 해 광선, 살 폭 11° → 4°·주기 30° → 16°). 취향 규칙이 확실히 «금지»라 사용자 확인을 기다리지 않고 덜 굵은 쪽으로 바꿈 | 개발 스택(API 8812·허브 5212, 디버그 «빅윈» 프리셋)에서 390×844·430×932 빅윈 캡처를 눈으로 확인: 굵은 사선 띠가 얇은 방사 광선으로 바뀌고 제목·금액·파티클 가독성 유지. `halo`(광선 없음)도 390에서 시험했고 더 조용하다. 광선이 아직 거슬리면 `halo` 한 줄 교체. 렌더러 `celebration.test.ts` 통과(여섯 게임 스킨 겹침 없음). 캡처 `D:/park/tgslot-wt/_qa/review-fruit-fiesta-fix1/big-sun-390-t2800.png`·`big-sun-390-t5800.png`·`big-sun-430-t4600.png`·`big-halo-390-t4600.png` |
| FF-15 | 변경 없음 | 제품 판단 사항. README «알려진 한계»에 설계임을 명시 | - |

넘긴 것(이 팀이 고치지 않음)

- **art** FF-02(seven·scatter 승리 시트), FF-08(스캐터 영어 글자): `artRequests`로 정리. 시트를 쓰지 않는 폴백(`theme.json`의 `sheets`에서 seven·scatter 제거)도 가능하지만 그림 요청과 겹쳐서 이번에는 건드리지 않았다.
- **shared** FF-01, 03, 05, 06, 07, 09, 11, 12, 13, 14: `sharedIssues`로 파일·원인·수정안을 넘김(FF-11 사운드는 `kind: sound`).
- `math.json` 변경 없음 → 재감사·`docs/RTP_AUDIT_fruit-fiesta.md` 갱신 불필요. 골든 해시도 그대로.

검증 결과

- `pnpm pack:check fruit-fiesta`: OK(오류 0·경고 0). 전체 `pack:check`의 오류 2건은 classic-777 `bar3-win` 시트 미추적(다른 팀 작업)이다.
- `pnpm --filter @tgslot/rtp-sim test`: 274 통과·2 건너뜀. `pnpm --filter @tgslot/theme-gen check:clips`: fruit-fiesta 두 클립 OK.
- `pnpm --filter @tgslot/slot-engine test`: fruit-fiesta 골든 통과. 실패 1건은 royal-diamond-777 골든(다른 팀이 그 팩의 `math.json`을 바꾸는 중).
- `pnpm --filter @tgslot/renderer test`: fruit-fiesta 관련 실패 없음. 실패는 `purity.test.ts`(CRLF 기준선)와 classic-777 BAR 테스트(다른 팀 작업 파일)다.
- 띄운 개발 서버(API·허브)는 PID로 모두 껐다.

## 7. 아트 조치 (FF-02·FF-08, 아트·전환 담당, 2026-11-26)

그림은 theme-gen codex 로 만들고 컨택트 시트·브라우저(390×844, 430×932, DSF 2)에서 눈으로 확인했다. 전환 클립 요청은 없었다. 스크린샷·스크립트: `D:/park/tgslot-wt/_qa/review-fruit-fiesta-art/`(원본 백업 `backup/`, 회차별 raw·합성 비교 PNG 포함).

| 자산 | 조치 | 결과 |
|---|---|---|
| `scatter` 정지 (FF-08) | 글자 없는 리본(작은 금별 엠블럼 하나)으로 다시 생성 1회. 남색 별 + 금테 + 중심 금색 별 + 청록 리벳 5개 구조는 그대로 | `FREE SPINS` 글자 사라짐. 컨택트 58·28px 에서 별 배지로 식별, 10종 dHash 해밍 모두 8 이상 |
| `scatter-win` 시트 (FF-02) | 새 정지 그림 묘사를 그대로 넣고 «중심은 금색 면 별, 청록 보석·날개 금지» 명시, 생성 1회 | 9프레임 모두 남색 별 + 금색 중심 별 + 리본 + 리벳 5개. 정지와 같은 그림 |
| `seven-win` 시트 (FF-02) | 3회 생성. 1차 보석은 없어졌지만 7이 넓음(가로세로비 0.94, 정지 0.81), 2차 너무 좁고 금테가 얇음(0.74), **3차 채택** | 보석·날개 없음, 굵은 금테와 옆면 두께 있음, 가로세로비 0.78~0.79, 채움 비율 0.62(정지 0.63) |

생성은 codex 5회(scatter 1, scatter-win 1, seven-win 3). 한도 소진 없음. `art/prompts.json` 의 `scatter`·`scatter-win`·`seven-win` 프롬프트를 채택본 문구로 갱신했다. 정지 `seven.webp` 는 요청대로 그대로 둔다.

그림만으로 안 풀린 문제 3개와 처리

1. **시트가 정지 심볼보다 크게 그려짐.** 렌더러(`sheetScaleFor`)는 시트 `frameW` 를 정지 스프라이트 폭에 맞추는데, theme-gen 은 프레임을 내용 합집합에 꼭 맞게 잘라 시트의 7이 정지보다 가로 +21%·세로 +25~33% 크게 그려졌다(승리 순간 크기가 튐). `D:/park/tgslot-wt/_tools/fit-sheet-to-symbol.mjs` 로 프레임 둘레에 투명 여백을 더해 표시 배율을 폭 0.98·높이 1.02 로 맞추고, 텍스처 메모리를 아끼려 아틀라스를 0.85배로 줄였다(804×978). 사용법은 스크립트 머리 주석. scatter 는 이미 정지보다 6~9% 작게 그려져(0.91·0.94) 눈에 띄지 않아 크기는 그대로 뒀다.
2. **scatter-win 프레임 6 의 후광이 셀 경계에서 잘려 사각형 모서리가 보임**(가장자리 알파 최대 115, 브라우저에서 확인). 같은 스크립트의 `--feather=0.15` 로 프레임 가장자리 알파를 부드럽게 줄여 해결(가장자리 알파 0, 재확인에서 둥근 후광만 남음).
3. **seven 의 `shine` 효과가 시트와 겹쳐 7 모양 회색 조각이 어긋난 자리에 보임.** 시트에 이미 대각 광택 구간(프레임 4~6)이 있어 `art/fx.json`·`theme.json` 의 seven `win` 에서 `shine` 을 빼고 `pulse` 만 남겼다(제거 후 같은 장면에서 조각이 사라지는 것을 확인). 원인은 `playShine`(`packages/renderer/src/pixi/symbolFx.ts`)이 정지 심볼 텍스처를 마스크로 쓰면서 앵커·위치를 맞추지 않는 것으로 추정한다. 같은 효과를 쓰는 grape·orange 도 같은 조각이 보일 수 있으니 공용 담당이 확인할 것.

확인한 것

- `pnpm pack:check fruit-fiesta`: OK(오류 0·경고 0). `fx.json` 과 `theme.json` 의 `fx` 일치. `theme.json` 은 `shine` 제거 한 줄만 바뀐다(theme-gen 이 다시 쓴 들여쓰기 변경은 되돌림).
- `pnpm --filter @tgslot/theme-gen contact games/fruit-fiesta`: 10종 모두 해밍 거리 8 이상.
- 브라우저 390·430: 정지 스캐터·7, 7 세 개 당첨(3연속 50코인, 큰 당첨 오버레이 없는 값으로 고정 응답 사용), 스캐터 3개 이상 프리스핀 트리거(디버그 프리셋). 정지 → 시트 전환에서 모양·크기 튐 없음, 사각형 후광 없음.
- 개발 서버(API 8832, 허브 5232)와 헤드리스 크롬은 PID로 껐다.

사람이 볼 것: 시트의 광택·불꽃 연출 취향(귀 판정이 아니라 눈 판정), 스캐터 새 정지 그림이 이전보다 다소 평평하다는 점(금색 중심 별의 면 반짝임이 줄었다).

## 8. 재검수 (2026-11-26)

수정 1차(§6)와 아트 조치(§7) 뒤 상태를 명령과 브라우저(390×844·430×932, DSF 2, 디버그 프리셋·고정 응답)로 하나씩 다시 확인했다.
코드·데이터는 고치지 않았다. 스크립트·캡처: `D:/park/tgslot-wt/_qa/review-fruit-fiesta-verify/`. 개발 서버(API 8852·허브 5252)와 헤드리스 크롬은 PID로 껐다.

### 8-1. 고쳤다는 항목 확인

| id | 결과 | 확인 방법과 증거 |
|---|---|---|
| FF-02 seven | 통과 | 고정 응답으로 7 세 개 당첨. 정지 7 → 시트 재생 → 정착까지 같은 그림(보석 없음, 얇은 금테, 붉은 에나멜). 크기 튐 없음, 사각형 후광 없음, 7 모양 회색 조각(shine 잔상) 없음. `m-seven-390-a/b.png`, `m-seven-430-zoom.png`. 시트 7이 정지 7보다 약간 굵어 보이지만 `pulse` 1.15배와 옆면 두께 때문이고 모양·색은 같다 |
| FF-02 scatter | 통과 | 디버그 «프리스핀» 프리셋(430)과 고정 응답(390)에서 스캐터 3개 트리거. 시트가 정지와 같은 남색 별 + 금색 중심 별 + 주황 리본 + 청록 리벳 5개이고 청록 보석·날개 없음. 정점 프레임의 금빛 거품 폭발도 둥글게 퍼지고 셀 경계에서 잘린 사각 모서리가 없다. `m-scatter-390.png`, `m-scatter-430.png`, `m-scatter-peak-zoom.png` |
| FF-08 | 통과 | 컨택트 시트(`games/fruit-fiesta/art/contact.png`)에서 새 스캐터에 글자가 없고 58px·28px에서 별 배지로 식별된다. 10종 dHash 해밍 거리 모두 8 이상. 릴 안에서도 별로 읽힌다 |
| FF-10 | 통과(취향 판정은 사용자) | `rays.style` = `sunburst` 확인. 390(STORM, 라임 녹색)·430(SURGE, 금색) 빅윈에서 굵은 사선 띠가 아니라 중심에서 퍼지는 방사 광선이고, 430에서는 롤업이 끝나면 사라진다. `m-bw-390.png`, `m-bw-430.png`. 방사 광선도 화면 전체를 덮으므로 거슬리면 `halo` 한 줄 교체 |
| FF-04 | 부분 통과 | 몬테카를로 표는 `sim fruit-fiesta --spins 5000000 --seed 42`로 그대로 재현(94.435%, 적중률 30.567%, 진입 1.7297%, 유료 스핀당 0.2094, 325.10x, σ 4.582). `--exact` 94.4930% 일치. 파일 38개·이미지 크기(thumb 640×427, frame 1080², bg 1080×1620)도 맞다. 단 README·CHECKLIST가 아트 조치 이전 상태라 낡은 문장이 남았다(FF-16) |
| FF-15 | 변경 없음 확인 | 제품 판단. README 한계 절에 밝혔다 |

명령 결과

- `pnpm pack:check fruit-fiesta`: 오류 0·경고 0. `fx.json`과 `theme.json`의 `fx` 일치.
- `pnpm --filter @tgslot/theme-gen check:clips`: fruit-fiesta 두 클립 OK(12개 전부 통과).
- `pnpm --filter @tgslot/rtp-sim test`: 274 통과·2 건너뜀. `math.json`은 git 변경 없음이라 재감사 불필요.
- `pnpm --filter @tgslot/slot-engine test`: 328 통과·1 실패(royal-diamond-777 골든, 다른 팀이 그 팩 수학을 바꾸는 중). fruit-fiesta 골든은 통과.
- `pnpm -r typecheck`: 전부 통과.
- 시트 크기: seven-win 804×978(프레임 268×326), scatter-win 768×768, wild-win 768×753. 이전보다 텍스처 메모리가 늘지 않았다.
- 메모리(개발 서버, 터보, GC 후): 유휴 힙이 fruit-fiesta·classic-777 모두 19.1MB로 같아 이 팩의 아트와 무관한 기준값. 29스핀 동안 21.0 → 23.8 → 23.7 → 24.8MB로 늘다가 평평해 누수 징후 없음(첫 감사의 +3.0MB와 같은 규모).
- 콘솔: 오류는 `favicon.ico` 404 한 가지(FF-13, 공용). 새 오류·페이지 에러 없음.

### 8-2. 새로 확인한 문제

**FF-16 [minor · game-local] README·CHECKLIST가 아트 조치 이전 상태로 남았다.**
- `README.md` «알려진 한계» 첫 두 줄(7·스캐터 시트가 정지와 다름, `FREE SPINS` 글자)은 이미 고쳐졌다.
- `README.md` «심볼별 당첨 연출» 표의 seven 행은 아직 `shine 25°`를 적는데 `art/fx.json`에서 빠졌다.
- `CHECKLIST.md` §3·§4의 `[ ]` 4줄(FF-02·FF-08)이 이미 끝난 일이다.
- 고칠 곳: 위 세 군데를 «해결됨»으로 바꾸고 아래 FF-17 처리 결과에 맞춰 `shine` 문장을 고친다.

**FF-17 [major · game-local, 뿌리는 shared] grape·orange 당첨 때 회색 반투명 과일 조각이 칸 밖 오른쪽 아래에 뜬다.**
- 보임: 디버그가 아니라 고정 응답으로 grape·orange 3연속을 띄우면(390) 당첨 칸 아래 모서리 바깥에 과일 모양의 회색 반투명 조각이 약 0.5~1초 동안 비스듬히 떠 있다. 고정 응답으로 각 1회씩 재현했고, 두 심볼의 모든 당첨이 같은 `shine` 경로를 지난다. `m-grape.png`, `m-orange.png`.
- 원인: §7 3번에서 art 담당이 seven에서 찾은 것과 같은 증상이다. `packages/renderer/src/pixi/symbolFx.ts`의 `playShine`이 정지 심볼 텍스처를 마스크 스프라이트로 쓰면서 앵커·위치를 심볼 스프라이트에 맞추지 않아 마스크가 반 칸쯤 어긋나고, 그 어긋난 모양으로 빛줄기가 잘려 보인다(코드 읽어서 확인). seven만 `shine`을 뺐고 `art/fx.json`의 grape(`angle -20`)·orange(`angle 25`)는 그대로다. 첫 감사 때는 이 조각을 놓쳤다.
- 고침(game-local, 즉시): `art/fx.json`과 `theme/theme.json`의 `fx.grape.win`·`fx.orange.win`에서 `shine` 항목을 뺀다(seven과 같은 처리, `wobble`·`pulse`는 남김). README 연출 표의 grape·orange 행과 «`shine`은 심볼 칸 안에서만 도는 빛줄기다» 문장도 맞춘다. 공용 담당이 `playShine` 마스크 위치를 고치면 되살려도 된다(§7에서도 넘긴 항목).

### 8-3. 아직 남은 것

- game-local: FF-16(문서 낡음, minor), FF-17(shine 잔상, major).
- 사용자 판정: FF-10 광선 취향(sunburst 유지 vs halo), 시트 광택·불꽃 연출의 눈 판정, 새 스캐터가 이전보다 평평하다는 점.
- shared(공용 담당이 따로): FF-01(프리스핀 당첨 표시 ×2 — 이 체크아웃의 390 프리스핀 빅윈에서도 그대로 확인), FF-03(빅윈 등급명이 `STORM`·`SURGE` 영어 그대로), FF-05~07·09·11~14, 그리고 FF-17의 뿌리(`playShine` 마스크).
- 판정: blocker 없음, major 1건(FF-17) 남음 → 재수정 1회 필요.

## 9. 수정 내역 (수정 2차, 2026-11-26)

§8-2의 game-local 두 건(FF-17, FF-16)을 고쳤다. 수정 허용 범위(`games/fruit-fiesta/**`, 이 보고서, `docs/RTP_AUDIT_fruit-fiesta.md`) 안에서만 손댔다.
그림은 만들지 않았고 `math.json`·`manifest.json`·공용 파일은 그대로다(→ 재감사·골든 영향 없음). 커밋·푸시는 하지 않았다.

| id | 처리 | 변경 | 확인 |
|---|---|---|---|
| FF-17 | 고침(game-local 부분) | `art/fx.json`과 `theme/theme.json`의 `fx.grape.win`에서 `shine`(−20°), `fx.orange.win`에서 `shine`(25°) 삭제. `wobble` 8°·`pulse` 1.12배는 그대로(seven과 같은 처리). 뿌리인 렌더러 마스크 정렬은 공용 담당에게 넘김(아래) | 같은 고정 응답(grape 3연속)으로 **고치기 전** 390폭에서 재현: 프레임 21~23(약 100ms 간격 캡처)에서 당첨 칸마다 오른쪽 아래 밖에 회색 반투명 포도 조각이 보임(`before-grape-390-22.png`). **고친 뒤** 같은 프레임 구간 grape 390·430, orange 390에서 조각 없음(`after-grape-390-22.png`, `after-grape-430-22.png`, `after-orange-390-22.png`와 몽타주 `montage-after-*-19.png`). 당첨 칸 테두리·흔들림·펄스는 그대로 보임 |
| FF-16 | 고침 | `README.md` — «심볼별 당첨 연출» 표의 seven·grape·orange 행에서 `shine` 삭제, «`shine`은 칸 안에서만 돈다» 문장을 «이 팩은 `shine`을 쓰지 않는다 + 이유 + 되살리는 방법»으로 교체, «알려진 한계» 앞 두 줄을 «해결됨(2026-11-26)»으로 고치고 새 스캐터가 이전보다 평평하다는 점(사람이 볼 것)과 `shine` 제거 사유를 적음. `CHECKLIST.md` — §3·§4의 `[ ]` 4줄(FF-02·FF-08)을 `[x]`로, §5에 `shine` 제거 줄 추가, §7에 «렌더러 `shine` 마스크 앵커 수정» 대기 줄 추가 | 남은 `[ ]`는 §7 두 줄(렌더러 `shine`, 허브 공용 항목)뿐 |
| (부수) | 정리 | `art/contact.png`(theme-gen `contact`가 `art/`에 쓰는 3.3MB 검수용 컨택트 시트, 추적 안 됨)가 폴더에 있으면 `pack:check`가 «아무도 참조하지 않는 파일이다» 경고 1건을 낸다. 팩 밖 `D:/park/tgslot-wt/_qa/review-fruit-fiesta-fix2/contact.png`로 옮기고 지움. 다시 보려면 `pnpm --filter @tgslot/theme-gen contact games/fruit-fiesta` 후 확인하고 지울 것(§8-1에서 이 경로를 증거로 든 문장은 그 시점 기준) | 옮기기 전 경고 1·오류 0, 뒤 경고 0·오류 0 |

**FF-17 뿌리(공용, 이 팀이 고치지 않음)** — `packages/renderer/src/pixi/symbolFx.ts`
- 코드 읽기로 확인한 원인: 심볼 칸 스프라이트는 `anchor 0.5`(`pixiRenderer.ts:669`)인데 `playShine`이 쓰는 마스크 스프라이트는 `createMask: () => new Sprite()`(`SymbolFxPool` 생성자)로 **앵커 0(왼쪽 위 기준)** 상태로 만들어진다. 앵커를 0.5로 되돌리는 `resetMaskSprite`는 풀 `reset` 훅이라 **반납할 때만** 돈다(`pool.ts` release → `spritePool.ts` reset). 새로 만든 마스크의 첫 사용은 앵커 0이므로 칸 중심에서 오른쪽 아래로 반 칸쯤 어긋나고, 상한 0짜리 `UNPOOLED_SYMBOL_FX`는 항상 새로 만들어 매번 어긋난다. 어긋난 심볼 모양으로 빛줄기가 잘려 보인다. 이 수정으로 화면에서 확인한 것은 «`shine`을 빼면 사라진다»까지이고, 렌더러 코드를 고쳐서 확인한 것은 아니다.
- 고칠 곳(한 줄): `playShine`에서 `mask.texture = target.sprite.texture` 바로 뒤에 `mask.anchor.set(0.5)`(또는 `createMask`에서 앵커를 0.5로). 같은 `shine`을 쓰는 classic-777·royal-diamond-777·sheriff-sixgun·astral-clocktower·`games/_template`도 첫 사용에 같은 조각이 보일 수 있다.
- 작은 덤: 마스크는 정지 스프라이트의 위치·크기만 복사하므로 `wobble` 회전·`pulse` 확대·`bounce` 이동 중에는 마스크가 심볼을 따라가지 않는다. 앵커를 고친 뒤 grape(wobble 병행)에서 다시 보고 어긋나면 마스크도 같은 트윈을 받게 한다.

검증 결과
- `pnpm pack:check fruit-fiesta`: OK(오류 0·경고 0). `fx.json`과 `theme.json`의 `fx` 일치.
- `pnpm --filter @tgslot/renderer test`: 833 통과·1 실패. 실패는 `purity.test.ts:308`(CRLF 줄끝 기준선, 공용 담당이 고치는 항목)이고 이 변경과 무관하다.
- `math.json` 변경 없음 → RTP 재감사·`docs/RTP_AUDIT_fruit-fiesta.md` 갱신 불필요, 골든 해시 그대로.
- 브라우저: 개발 스택(API 8862·허브 5262, 디버그 응답 고정)·헤드리스 크롬 390×844·430×932, DSF 2. 캡처·스크립트는 `D:/park/tgslot-wt/_qa/review-fruit-fiesta-fix2/`. 띄운 API·허브는 포트로 찾아 PID로 껐다(다른 팀의 8833 등은 건드리지 않음).

남은 것
- 공용: FF-17 뿌리(`playShine` 앵커), FF-01·03·05·06·07·09·11~14(§8-3과 같음).
- 사용자 판정: FF-10 광선 취향(`sunburst` 유지 vs `halo`), 시트 광택·불꽃의 눈 판정, 새 스캐터가 평평해 보이는지.
- game-local 남은 결함 없음. 판정: blocker 없음, major의 game-local 부분 해소(FF-17은 이 팩에서 증상 제거, 뿌리는 공용).

## 10. 재검수 2차 (2026-11-26)

수정 2차(§9)와 그 앞의 아트 조치(§7) 뒤 상태를 명령과 브라우저로 다시 확인했다. 코드·데이터는 고치지 않았다.
브라우저: 개발 스택(API 8872·허브 5272, 디버그 프리셋), 헤드리스 크롬 390×844·430×932(DSF 2). 심볼별 당첨은 엔진(`buildGrid`·`evaluate`)으로 만든 3연속 고정 응답을 `**/spin` 응답에 덧씌워 띄웠다(그림만 보는 확인이라 지갑 숫자는 보지 않았다).
스크립트·캡처: `D:/park/tgslot-wt/_qa/review-fruit-fiesta-verify/v2/`(`mkforced.mts`가 고정 응답 생성, `t-sym.mjs`가 심볼별 캡처, `montage.mjs`가 몽타주). 띄운 API·허브는 PID로 껐고 포트 8872·5272가 비었다.

### 10-1. 고쳤다는 항목 확인

| id | 결과 | 확인 방법과 증거 |
|---|---|---|
| FF-17 | 통과 | 같은 고정 응답으로 grape 3연속(390·430)과 orange 3연속(390·430)을 약 100ms 간격으로 캡처했다. 당첨 칸 테두리·딤·흔들림·펄스는 그대로 보이고, 칸 밖 오른쪽 아래의 회색 반투명 과일 조각은 어느 프레임에도 없다. §9가 «고치기 전» 재현했다는 프레임 21~23 구간도 연속 캡처로 확인했다(`montage-grape-390-19.png`, `grape-390-20.png`·`grape-390-22.png`, `montage-orange-390-14.png`, `montage-grape-430-14.png`, `montage-orange-430-14.png`). `art/fx.json`·`theme/theme.json` 어디에도 `shine`이 없다(grep) |
| FF-17 파급 | 통과 | 남은 심볼도 같은 방식으로 한 번씩 돌렸다. seven(390·430), bell·watermelon·plum·lemon·cherry(390, cherry는 와일드 대체 포함)에서 조각·잘림·사각 모서리 없음. `shine`이 이 팩에서 완전히 빠져 같은 증상이 날 경로가 없다(`playSegmentedFlash`의 Graphics 마스크는 이 팩 fx가 쓰지 않는 효과) |
| FF-16 | 통과 | README: 연출 표의 seven·grape·orange 행에 `shine` 없음, `shine` 문장은 «이 팩은 쓰지 않는다 + 이유 + 되살리는 방법», «알려진 한계» 앞 두 줄은 «해결됨». fx 표의 심볼별 연출이 `art/fx.json`과 일치하고, 시트 3×3·12fps, 릴 창 수치(0.0442·0.2356·0.9131·0.5399), 전환 클립 `opaqueMs 2250/0`, 빅윈 `sunburst`·tier 색이 `theme.json`과 일치한다. 추적 파일 38개도 맞다. CHECKLIST: `[ ]`는 §7의 렌더러 `shine` 앵커·허브 공용 두 줄뿐이고 둘 다 이 팀 밖 일이다 |
| FF-02 seven | 통과 유지 | 정지 7 → 시트 재생 → 정착이 같은 그림(보석 없음, 얇은 금테, 붉은 에나멜). 시트 정점 프레임의 빛 번쩍임·반짝이만 더해진다. 390·430 모두 크기 튐·사각 후광 없음. 시트 7이 정지보다 약간 굵어 보이는 것은 `pulse` 1.15배와 옆면 두께 때문(`seven-390-14.png` ↔ `seven-390-32.png`) |
| FF-02·08 scatter | 통과 유지 | 디버그 «프리스핀» 프리셋 390·430. 정지 스캐터는 남색 별 + 금테 + 중심 금별 + 청록 리벳 5개 + 글자 없는 주황 리본, 시트도 같은 그림이고 청록 보석·날개 없음. 정점의 금빛 거품 폭발은 둥글게 퍼지고 셀 경계에서 잘리지 않는다. 시트 원본(`scatter-win.webp`, `seven-win.webp`)을 직접 열어 9프레임이 모두 같은 디자인임을 봤다 |
| FF-10 | 통과 유지(취향은 사용자) | `rays.style` = `sunburst`. 디버그 «빅윈» 390(STORM, 녹색)·430(SURGE, 금색)에서 중심에서 퍼지는 방사 광선이고 굵은 사선 띠는 없다. 다만 390 STORM은 녹색 광선 폭이 화면 대부분을 덮는다(`montage-bw-390-10.png`). 거슬리면 `halo` 한 줄 교체 |
| FF-04 | 통과 | `sim fruit-fiesta --exact` 94.493%(문서와 일치), 적중률 30.729%. `math.json`·`manifest.json`·`docs/RTP_AUDIT_fruit-fiesta.md`는 git 변경 없음 → 재감사 불필요 |
| FF-15 | 변경 없음 확인 | 제품 판단 |

명령 결과

- `pnpm pack:check fruit-fiesta`: 오류 0·경고 0(`art/contact.png`를 팩 밖으로 옮긴 뒤 미참조 경고 없음). 추적 안 된 파일은 새 `CHECKLIST.md` 하나뿐이다(커밋 때 `git add` 필요).
- `pnpm --filter @tgslot/theme-gen check:clips`: 12개 전부 통과, fruit-fiesta 두 클립 OK.
- `pnpm --filter @tgslot/rtp-sim test`: 274 통과·2 건너뜀.
- `pnpm --filter @tgslot/slot-engine test`: 328 통과·1 실패(royal-diamond-777 골든, 다른 팀이 그 팩 수학을 바꾸는 중). fruit-fiesta 골든 통과.
- `pnpm --filter @tgslot/renderer test`: 833 통과·1 실패(`purity.test.ts` CRLF 기준선).
- `pnpm -r typecheck`: 전부 통과.
- 메모리(개발 서버, 터보, GC 후): 28스핀 동안 힙 21.1 → 23.3 → 23.7 → 24.5MB로 늘다가 평평. §8의 29스핀 결과(21.0 → 24.8MB)와 같은 규모라 누수 징후 없음.
- 콘솔: 오류는 `favicon.ico` 404 한 가지(FF-13, 공용). `[transition-clip]` 정보 로그는 여전히 warn 레벨(FF-13). 새 오류·페이지 에러 없음.

### 10-2. 새로 생긴 문제

수정 때문에 생긴 문제는 없다. `shine`을 뺀 grape·orange는 흔들림·펄스·금빛 테두리로 여전히 당첨이 분명하게 보인다.

### 10-3. 아직 남은 것

- game-local·art·clip: blocker·major 없음. 사용자 판정 항목 하나만 남는다.
  - [minor · game-local] FF-10 광선 취향: `sunburst`가 «사선 광택 금지»에 걸리는지는 사용자 눈 판정. 390 STORM 광선이 두꺼워 보일 수 있다. 걸리면 `theme.json`의 `celebration.rays.style`을 `halo`로.
- 사용자 눈 판정(결함 아님): 시트 광택·불꽃 연출 취향, 새 스캐터 정지 그림이 이전보다 평평해 보이는 점(시트 쪽은 입체 기울임이 있어 정지와 약간 다른 인상).
- shared(공용 담당): FF-01(프리스핀 당첨 표시 ×2 미반영 — 이 체크아웃 390·430 «빅윈» 프리셋의 프리스핀 화면에서도 그대로: 당첨 141/합계 650, 88/합계 150처럼 배수 전 금액), FF-03(빅윈 등급명 `STORM`·`SURGE` 영어), FF-05·06(390 상단 제목 `프루트 피에…` 말줄임 재확인)·07·09·11~14, FF-17 뿌리(`playShine` 마스크 앵커). 공용 코드는 이 체크아웃에서 아직 바뀐 것이 없다(`apps/`·`packages/` git 변경 없음).
- 판정: **통과**. game-local·art·clip에 blocker·major 없음.
