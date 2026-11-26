# 별의 시계탑 (`astral-clocktower`) 출시 수준 검수 보고서

- 검수일: 2026-11-26, 작업 폴더 `D:/park/tgslot-wt/review/tg-slot-hub` (브랜치 `slot/review`)
- 범위: 확인표 9항목 기능별 1회. 코드·데이터는 고치지 않았고 이 보고서만 썼다.
- 스크린샷·스크립트: `D:/park/tgslot-wt/_qa/review-astral-clocktower-audit/` (저장소 밖). 파일명은 아래 «증거»에 적었다.
- 최종 귀 판정은 사용자 몫이다. 사운드는 코드·기존 수치 확인까지만 했다.

## 한 줄 결론

출시 불가 수준의 문제(blocker)는 없다. 수학·팩 정합·메모리·화면 정렬은 통과다. 다만 **열쇠 심볼이 사실상 보이지 않고**, **프리스핀 전환 클립이 없어 검은 단색 커튼이 나가며**, **게임의 핵심 둘(빛 기둥 확장·층 승급)이 도움말 어디에도 없다.** 이 셋이 major다.

## 확인표 결과

| # | 항목 | 판정 | 요약 |
|---|---|---|---|
| 1 | 팩 | 통과 | `pnpm pack:check` astral-clocktower OK(오류 0·경고 0). manifest·math 수치 일치, theme 심볼 10종·frame·bg·bg-freespins·sheet·thumb 모두 존재, `status: live`. 전환 클립만 없음(AC-02) |
| 2 | 수학 | 통과 | 감사 문서가 현재 math.json과 일치(아래 2절). 게이트 7/7. 문서 숫자 일부 낡음(AC-09) |
| 3 | 화면 390/430 | 대체로 통과 | 정렬·잘림·겹침·카운터 문제 없음. 열쇠 심볼 판독 불량(AC-01), 빅윈 오버레이 밋밋함(AC-04) |
| 4 | 연출 | 부분 통과 | 당첨 순환·롤업·STOP·빅윈·확장·승급 동작함. 프리스핀 전환 클립 없음(AC-02), 승급 구별 약함(AC-08) |
| 5 | 아트 | 부분 통과 | 스타일 일관, 중복 없음(dHash 최소 15). 열쇠·추 실루엣이 셀을 못 채움(AC-01) |
| 6 | 사운드 | 통과(코드 확인) | `sound.preset: clockwork`. 8개 이벤트 레시피 전부 존재. 확장/승급이 같은 소리(AC-08) |
| 7 | 언어 | 부분 통과 | 영어 사전은 한국어와 키 동수·번역 정상. 한국어 화면에 영어 잔존(AC-05, AC-06) |
| 8 | 성능·메모리 | 통과 | 스핀 50회 힙 10.5→14.9MB 수렴, 콘솔 에러는 favicon 404 하나(AC-11). 입·퇴장 4회 누수 없음 |
| 9 | 문서 | 부분 통과 | README·CHECKLIST·카탈로그에 낡은 수치와 미체크 항목(AC-09) |

## 1. 팩

- `pnpm pack:check`: `astral-clocktower: OK`. 전체 7팩 오류 0, 경고 2(candy `art/contact.png` 미참조, royal 프리스핀 배경 없음 — 둘 다 이 게임 밖).
- manifest ↔ math: reels 4, rows 5, lines 625, betLevels 6종(100~4000, 전부 betDivisor 100으로 나눠떨어짐), rtpTarget 0.945, rtpTotalTarget 0.96(=0.945+0.015), volatility high 일치.
- 골든 해시 `packages/slot-engine/src/golden.test.ts` 7/7 통과(엔진이 이 팩의 2,000라운드 결과를 바꾸지 않았다). `@tgslot/game-sdk` 테스트 145/145 통과.
- 스캐터 스택 금지 규칙: 확인함. 스캐터는 릴마다 낱개(1/2/2/1)이고 같은 릴의 두 스캐터는 24칸 떨어져 5행 창에 둘이 못 든다. 와일드도 릴 1·2(0부터 센 인덱스)에만 낱개 2개, 간격 24칸.
- 프리스핀 전환 클립: `theme/transitions/` 없음. 다른 live 6팩은 전부 `fs-enter/fs-exit.webp`가 있고 `check:clips`가 10개 통과한다. 이 팩만 빠져 있다(AC-02).

## 2. 수학

- 감사 `docs/RTP_AUDIT_astral-clocktower.md`(2026-11-10, MC 25M, seed 42): RTP 94.249%(목표 -0.251pp, CI ±0.179pp), 7/7 통과.
- **현재 math.json과 일치한다.** math.json의 마지막 변경은 2026-09-06 커밋(`cf8d910`)이고 감사는 그 뒤에 나왔다. 작업 트리에 math.json 수정 없음.
- 독립 재측정: `sim astral-clocktower --mc 8000000 --mc-seed review-seed-A` → **94.247%**(SE 0.161pp), 적중률 29.098%, 프리스핀 진입 0.4918%, 구성 ways 84.75 / 스캐터 0.562 / 프리스핀 8.935. 감사값과 0.002pp 차이다.
- 세 측정(README 20M 94.484, 감사 25M 94.249, 이번 8M 94.247)을 표본 수로 가중하면 약 **94.33%**. 게이트(±0.5pp) 안이지만 중앙(94.5)보다 낮은 쪽이다(AC-10, 선택).
- 스캐터 확률 정확 계산: P(3개 이상) = 0.489478%(204.3스핀에 1회), P(4개) = 0.0136%, 스캐터 배당 RTP 0.5575%. 감사의 0.4895% / 0.5572%와 일치. README의 0.4887%는 반올림 오차 수준.
- 문서 대조:
  - 적중률: README 29.083%, 감사 29.084%, 재측정 29.098% — 일치.
  - 최대 당첨: README 139.25x(표본), 감사 요약 496.84x, 감사 3절 401.20x(단일 시뮬), 재측정 표본 139.25x/267.88x. 표본·집계 단위가 달라 숫자가 흩어져 있다. 도움말은 최대 당첨을 말하지 않아 도움말과의 충돌은 없다.
  - 프리스핀 진입 빈도: README 0.4887%, 정확값 0.4895% — 일치.
- 참고(결함 아님): 0 초과~1x 미만 당첨이 전체 스핀의 13.8%라 적중 29.1% 중 절반 가까이가 «베팅보다 적은 당첨»이다. 빅윈 오버레이는 10x 이상에서만 뜨므로 문제 없다.

## 3. 화면 (390×844, 430×932, DPR 2)

| 항목 | 390 | 430 |
|---|---|---|
| 스테이지 | 390 × 583 | 430 × 659 |
| 셀 간격(실측) | 87.0px | 96.5px |
| 당첨 강조 상자 | 83.5px | 91px |

- 프레임 투명 창을 알파로 실측: x 0.0519 · y 0.1784 · w 0.8972 · h 0.7432. `theme.json`의 `frameLayout`(x 0.0583 · y 0.1802 · w 0.8833 · h 0.742)은 안쪽으로 0.6~1.4% 들어가 있어 정렬이 맞는다. 첫 행 위가 창 위와 일치하고(157px), 5행 끝이 석조 받침 시작(약 590px)과 맞는다.
- 스핀 중 릴이 창 위·아래에서 깨끗이 잘린다(배너·받침을 가리지 않음).
- 배경은 2:3이 스테이지와 거의 같아 cover 문제 없음. 430에서는 프레임이 높이에 묶여 좌우 4~5px씩 잘리지만 눈에 띄지 않는다.
- 당첨 금액은 컨트롤 위 WinStrip에 있고 가독성 양호. 라인 그리기 없음, 당첨 칸에 둥근 사각 강조와 심볼 연출만 쓴다(취향 부합). 빈칸 심볼 없음.
- 프리스핀 중에도 스테이지·셀 크기 불변. 진입 팝업(10회 ×2)·종료 팝업(획득 1,164 / 프리스핀 10회)·카운터 행(`프리스핀 n/10 ×2`) 정상.
- 설정은 로비의 중앙 팝업(공유 컴포넌트), 자동 스핀도 중앙 팝업. 도움말 4탭(배당표·웨이즈·피처·공정성) 전부 잘림 없이 열림.
- 문제: 열쇠 심볼(AC-01), 빅윈 오버레이 밋밋함(AC-04), 프리스핀 복구 시 배경(AC-07).

증거: `01-base-390.png`, `01-base-430.png`, `02-help-390-*.png`, `02-help-430-*.png`, `04-win-390-t*.png`, `12-430-win.png`, `12-430-fsentry.png`, `06-fs-390-*.png`, `10-lobby-astral.png`, `10-settings.png`, `13-auto.png`.

## 4. 연출

- 일반 당첨: 릴 정지 → 당첨 칸 강조·심볼 연출 → WinStrip 롤업(8→20→24 → «6 ways · 24») 정상. 순환 길이 약 2.3초(정지 후), 다음 스핀 버튼으로 건너뛰기 정상.
- STOP: 스핀 700ms에 누르면 269ms 안에 정지·`스핀`으로 복귀. 압축 정상(`09-stop-300.png`).
- 확장 와일드: 일반 스핀 13회 중 5회 발생(승급은 3회, 둘이 겹친 스핀 3회). 빛 기둥이 자라고 5칸이 와일드로 바뀌며 와일드 승리 시트(빛 기둥)가 재생된다(`07-sheet-expandWild-2.png`). 릴 1·2 동시 확장(7칸)도 정상, 롤업 46→960.
- 층 승급: 동작함. 그러나 확장과 비슷한 빛 번쩍임 뒤 심볼이 바뀌는 정도라 «사다리»로 읽히지 않는다(AC-08, `07-sheet-upgrade-1.png`).
- 빅윈: `celebration` 스킨(파편·톱니·별 파티클, 빔 광선, 세리프 제목)이 적용된다. 13.9x는 SURGE, 26.8x는 BLAST. 롤업 → «총 획득» → 탭하면 닫힘 흐름, 1회 탭은 감기·2회 탭은 닫기 정상. STORM·CATACLYSM 등급은 눈으로 못 봤다(디버그 `빅윈` 프리셋을 두 번 써서 13.9x·26.8x만 나왔다). 밋밋함은 AC-04.
- 프리스핀: 진입 팝업 → 커튼 → 10회 자동 진행(리트리거는 나오지 않아 확인하지 못했다) → 종료 팝업 → 커튼. 커튼이 **클립이 없을 때의 단색 대체**라 거의 검은 직사각형이 화면을 덮는다(`06-fs-390-12.png`, 콘솔 `[transition-clip] 클립을 접었다 — noClip`). AC-02.
- 기대감 연출: `anticipation.ts` 규칙 확인(앞 릴에 스캐터가 `trigger-1`개 이상일 때). 이 팩은 릴당 스캐터가 최대 1개라 «릴 0·1에 스캐터» 또는 «릴 1·2 스캐터 후 릴 3»에서만 걸린다. 진입 팝업 캡처에서 스캐터 고리 강조는 확인했고, 기대감 상승음 자체는 희귀해 화면으로는 못 잡았다.
- 새로고침 복구: 프리스핀 진행 중 새로고침해도 `프리스핀 10/10 ×2`·`프리스핀 (10)` 버튼이 복구돼 이어서 진행된다(좋음). 배경 문제는 AC-07.

## 5. 아트 (컨택트 시트: `contact.png`, dHash 거리표 포함)

- 스타일(검은 납선·평면 유리·황동)은 10종 모두 일관. 중복 의심 쌍 없음(dHash 최소 15: scatter↔quill, 최대 38). 누락 자산 없음.
- 알파 실측(512 캔버스 안 내용 크기):

| 심볼 | 내용 가로 | 내용 세로 | 비고 |
|---|---:|---:|---|
| wild·scatter·gear | 84% | 84% | 양호 |
| owl·starjar·quill | 77~80% | 84% | 양호 |
| astrolabe | 70% | 84% | 양호 |
| moondial | 62% | 84% | 약간 좁음 |
| pendulum | **49%** | 84% | 좁음 |
| key | 84% | **24%** | **셀의 1/4도 못 채움** |

- 열쇠는 프롬프트가 «길고 가로로 눕힌, 둥글지 않게»라고 요구해 3.5:1 막대가 나왔다. 셀 안에서 약 62×15px(390)로, 배당표 아이콘·58px 타일·28px 타일에서는 가는 선으로만 보인다. 추도 «엄격히 세로·위가 좁고 아래가 넓게» 때문에 폭 49%의 종 모양이 되어 추라기보다 매다는 등갓으로 읽힌다.
- 대기 화면(정지 0)이 톱니 12 + 열쇠 8(5행 중 두 행)이라 첫 인상이 열쇠 선 두 줄이다(`01-base-*.png`).
- 상위 3종 위계는 부엉이(29x)가 가장 화려하고 성반(53x)이 가장 어두운 편이다. 결함은 아니다(참고).
- 프레임: 마키 영역이 프롬프트 지시(y 0~9.5%)보다 커서(y 0~17.8%) 창 높이가 0.743이다. 셀은 가로 폭(343/4)과 세로(433/5)가 거의 같아 둘 다 묶여 있고, 실측 셀 87/96.5px로 CHECKLIST 하한(70/80)은 넘는다.
- 프레임·썸네일의 «ASTRAL CLOCKTOWER» 영문 워드마크는 다른 팩(ROYAL DIAMOND 777, SHERIFF'S SIX-GUN)도 같은 방식이라 일관성 면에서는 유지 대상이다.

## 6. 사운드·배경음 (코드 확인)

- `theme.json` `sound.preset: "clockwork"`. `audio.ts` `CLOCK_RECIPE`에 spinStart·reelStop·winSmall·winBig·feature·mutation·tick·tickEnd, riser 사양이 모두 있다. BGM `CLOCKWORK`(D장조 96BPM 오르골·첼레스타)·`bgmVoices.clockwork` 존재.
- `docs/SOUND_CHECK.md` clockwork 표: spin·winsmall·winbig·feature ok, reelstop·reelstops «주의(z<2)», mutation·rollup «약함(z 2~2.5)». 기대감 상승음은 fruit와 코사인 0.968로 거의 같다. 전부 «귀 판정 필요»로 적혀 있다. 최종 귀 판정은 사용자 몫.
- 이 팩만의 문제: 확장(`expandWild`)과 승급(`upgrade`)이 같은 `mutation` 레시피 하나를 쓴다(AC-08).

## 7. 언어

- 영어 사전(`en.ts`)으로 같은 화면(도움말 4탭·컨트롤·카운터)을 열어 번역이 정상임을 확인(`15-en-help.png`).
- 한국어 기본 화면에 남은 영어: 당첨 줄 `· 6 ways · 24`, 로비 카드 `4×5 · 625 ways`, 빅윈 등급 `SURGE`, 프레임 아트 워드마크, 스핀 중 버튼 `스탑`(외래어). 도움말 «피처»·«웨이즈»는 업계 용어지만 «쉬운 말» 기준으로는 «특수 기능»·«당첨 경로»가 낫다. AC-05, AC-06.

## 8. 성능·메모리

| 시점 | JS 힙 | 노드 | 리스너 | WebGL 텍스처(생성/삭제/생존) |
|---|---:|---:|---:|---|
| 시작 | 10.5MB | 145 | 188 | 9 / 0 / 9 |
| 스핀 10회 | 13.3MB | 152 | 201 | 19 / 0 / 19 |
| 스핀 30회 | 14.7MB | 154 | 201 | 26 / 0 / 26 |
| 스핀 50회 | 14.8MB | 166 | 201 | 41 / 0 / 41 |

- 힙은 20스핀 이후 14~15.8MB에서 수렴. 리스너 201 고정. 텍스처 증가는 처음 만나는 연출(프리스핀 배경·와일드 시트 등)의 지연 생성이고 반복 스핀으로 늘지 않는다(30→40회 26 유지).
- 입·퇴장 4회: 입장마다 텍스처 9 생성, 퇴장에 9 삭제(생존 0), 힙 11.4→12.1MB(+0.2MB/회). 누수 없음. 풀·텍스처 수명 설계가 이 팩에서 제대로 동작한다.
- 콘솔: 에러는 `favicon.ico` 404 하나(AC-11), 경고는 `[transition-clip] noClip`(AC-02). 그 외 없음.
- 단위 테스트(slot-engine 골든·game-sdk)는 위 1절. 전체 `pnpm -r test`·typecheck는 7개 팀이 같은 폴더를 쓰므로 돌리지 않았다.

## 9. 문서

AC-09 참고.

## 발견 목록

### AC-01 [major / art] 열쇠·추 실루엣이 셀을 못 채워 판독 불량
- 증거: `contact.png`(58/28px 열쇠가 선), `01-base-390.png`(대기 화면 열쇠 선 두 줄), `04-win-390-t1800.png`, `02-help-390-0-배당표.png`(배당표 열쇠 아이콘이 점), `bbox.mjs` 실측(key 84%×24%, pendulum 49%×84%).
- 원인: `art/prompts.json`의 key는 «distinctly long and horizontal», pendulum은 «strictly vertical, top-heavy-to-bottom-wide»라는 실루엣 지시를 넣었다.
- 제안: key를 약 45° 대각선으로 눕히고 둥근 손잡이를 키워 짧고 굵게, pendulum은 막대를 줄이고 추 덩어리를 키워 폭 65% 이상으로 `prompts.json`의 두 항목 문구를 고친 뒤 `pnpm --filter @tgslot/theme-gen gen games/astral-clocktower --provider codex --only key --force`(추도 같은 방식)로 1~2장씩 재생성. 컨택트 시트로 눈 검수하고 알파 bbox가 가로·세로 모두 60% 이상인지 재측정. scatter(대각선)가 좋은 선례다.

### AC-02 [major / clip] 프리스핀 진입·종료 전환 클립 없음, 검은 단색 커튼
- 증거: `06-fs-390-12.png`(화면 전체가 거의 검은 직사각형), 콘솔 `[transition-clip] 클립을 접었다 — 단색 커튼으로 진행한다 {reason: noClip}`. 다른 live 6팩은 전부 클립이 있다.
- 제안: `docs/TRANSITION_DESIGN.md` §2-5의 v2 프롬프트(빛 기둥이 솟으며 장미창을 닫고 유리 전체를 호박빛으로 태움, 숫자·시계 바늘 금지어 포함)를 R10대로 **한 편($0.93)에서 양방향**을 잘라 쓴다. 규격은 다른 팩과 같게 360×640 WebP 약 48프레임 3.00초 loop=1. 생성 뒤 `theme.json`에 `transitions.freeSpinsEnter/freeSpinsExit`(`opaqueMs`, `durationMs`)를 넣고 `pnpm --filter @tgslot/theme-gen check:clips`로 정지 구간을 확인(R11). 문서의 «보류» 표기도 갱신.

### AC-03 [major / shared] 도움말에 확장 와일드·층 승급 설명이 없다
- 증거: `02-help-390-2-피처.png`. 피처 탭은 «와일드는 모든 심볼을 대체합니다»와 스캐터·프리스핀만 보여 준다. `GameScreen.tsx`의 피처 페이지는 `math.mutations`를 전혀 다루지 않는다.
- 영향: 이 게임의 핵심 두 메커닉(릴 2·3의 와일드가 5칸 빛 기둥으로 확장 / 같은 심볼 3개 이상이면 한 층 위로 승급, 승급 사다리)을 플레이어가 알 방법이 없다. «규칙은 도움말 페이지로» 취향에도 어긋난다. 웨이즈 탭도 «왼쪽 릴부터 이어져야 한다»·«와일드는 2·3번째 릴에만 나온다»를 말하지 않는다.
- 제안: `apps/hub`의 피처 페이지에 뮤테이션 종류별 공용 설명(확장·승급·무작위 와일드 등)을 ko/en으로 추가하고 팩의 `mutations` 값(어느 릴, 어느 심볼이 어느 심볼로)을 채워 보여 준다. 팩에 규칙 문구를 담는 필드가 없어 게임 폴더만으로는 못 고친다. 용어는 쉬운 말로(«피처» → «특수 기능»).

### AC-04 [minor / game-local] 빅윈 오버레이가 어둡고 파티클이 적다
- 증거: `05-bigwin-390-t3200.png`, `05-bigwin-390-t5200.png`, `12-430-bigwin.png`. 화면 전체가 거의 검게 눌리고, 롤업이 끝나면 광선이 흐려지며 파티클이 10개 안팎만 느리게 떨어진다. 팩 심볼이 하나도 보이지 않는다. `docs/QA_LOG.md`에 «astral 입자 밀도·밝기 보강» 백로그가 이미 있다.
- 제안: `theme.json` `celebration`에서 `rays`(세기)·`particles.size/density`·`tiers.*.glow/density`를 올리고, `particles.symbols`에 `owl`·`astrolabe`·`scatter` 같은 심볼 id를 넣어 심볼이 흩날리게 한다. STORM·CATACLYSM까지 눈으로 확인한다.

### AC-05 [minor / game-local] 빅윈 등급 이름이 영어(SURGE·BLAST·STORM·CATACLYSM)
- 증거: `05-bigwin-390-t3200.png`(SURGE). 허브 기본 i18n이 한국어에서도 영어다. 팩이 `celebration.labels`로 덮어쓸 수 있는데 이 팩은 쓰지 않는다.
- 제안: `celebration.labels`에 시계탑 분위기의 쉬운 한국어 4개를 넣는다(조어 금지). 허브 기본값 자체는 공용 담당이 판단.

### AC-06 [minor / shared] 한국어 화면의 영어 `ways`·`스탑`
- 증거: `04-win-390-t3600.png`(`· 6 ways · 24`), `10-lobby-astral.png`(`4×5 · 625 ways`). `WinStrip.tsx` 호출부와 `GameCard.tsx`에 `ways`가 하드코딩돼 있다. 스핀 중 버튼 `스탑`.
- 제안: 로케일 키로 빼서 «웨이»·«멈춤»처럼 한국어를 쓴다.

### AC-07 [minor / shared] 프리스핀 도중 새로고침하면 배경이 일반 배경
- 증거: `14-fs-live.png`(호박빛 프리스핀 배경) ↔ `14-fs-after-reload.png`, `14-fs-after-reload-spin.png`(복구 후 9/10까지 진행해도 파란 일반 배경). 카운터·버튼·세션은 정상 복구된다.
- 제안: 복구 경로에서도 `backgroundFreeSpins`를 즉시 적용.

### AC-08 [minor / shared] 층 승급이 확장과 구별되지 않고 소리도 같다
- 증거: `07-sheet-upgrade-1.png`(승급은 열 한 줄 빛 번쩍임 후 심볼 교체), `audio.ts` `mutation` 레시피 하나를 `expandWild`·`upgrade`가 공유. SOUND_CHECK는 mutation을 «약함(z 2~2.5)»로 적었다.
- 제안: 승급에 «한 단계 위로» 읽히는 연출(위로 올라가는 화살·사다리 한 칸)과 별도 소리를 더한다. AC-03의 도움말과 함께 처리하면 효과가 크다.

### AC-09 [minor / game-local] 문서가 낡았다
- `games/astral-clocktower/README.md`: ① «실측 수치» 표(94.484%, 최대 139.25x)를 «아트 이전 측정»이라 적었지만 math.json은 그 뒤 안 바뀌었다 — 감사(94.249%·최대 496.84x)와 한 표로 합치고 «측정 시드가 달라 생긴 차이»로 설명 ② 셀 크기 표(88.3/74.9px)가 실측(96.5/87.0px)과 다르다(스테이지 높이가 달라짐) ③ 프레임 캔버스를 1024×1536으로 적었으나 파일은 1080×1620(같은 비율) ④ «릴 1·2»(0부터)와 표의 «릴 1~4»(1부터) 표기가 섞여 있다.
- `CHECKLIST.md`: 1~7절이 전부 미체크인데 완료 상태(pack:check OK, 감사 통과, live). #25는 창 h 0.742 < 0.78이라 문자 그대로는 미달인데 결과(셀 87/96.5px)는 하한을 넘는다 — 게이트 문구를 «셀 크기 기준»으로 바꾸고 체크. #27은 감사에 σ 4.557·n 25M 기록돼 충족.
- `docs/GAME_CATALOG.md` #16: 승급 5단 중 2단만 예시, σ 4.46·n* 19.1M(감사는 4.557·19.8M). `docs/TRANSITION_DESIGN.md` §2-5·표의 «아트 미착수·`status: hidden`»은 이제 사실과 다르다.
- `docs/RTP_AUDIT_astral-clocktower.md`는 현재 math.json과 일치한다(수정 불필요). 다만 요약의 최대 496.84x와 3절의 401.20x가 어긋나 보이는 점은 집계 단위(라운드 vs 단일 시뮬) 주석을 달면 좋다.

### AC-10 [minor / game-local, 선택] 기본 게임 RTP가 중앙보다 약 0.2pp 낮다
- 세 측정 가중 평균 약 94.33%(목표 94.5%, 게이트 ±0.5pp 안). astrolabe 4연속 +1이 약 +0.27pp이므로 53→54면 중앙 근처다.
- 고치면 정식 감사(MC 25M)를 다시 돌려 README·감사 문서·골든 해시를 함께 갱신해야 한다. 현 상태로 출시해도 규칙 위반은 아니다.

### AC-11 [minor / shared] `favicon.ico` 404
- 모든 페이지에서 콘솔 에러 1건. `apps/hub/index.html`에 아이콘이 없다. 이 팩과 무관한 공용 문제.

## 확인했고 문제 없는 것

- 스캐터 스택 금지, 와일드 릴 제한, 625 ways 경로, 정수 배당(betDivisor 100), 잭팟 1.5% 분리.
- 프레임 창·릴 정렬(실측), 스핀 중 마스크, 배경 cover.
- 당첨 선 없음·사선 광택 없음(심볼 `shine`은 심볼 마스크 안에서만 돈다, 코드 확인)·빈칸 심볼 없음·당첨 금액 컨트롤 위·중앙 팝업.
- 영어 사전 키 동수, 공정성 탭, 프리스핀 세션 복구, 메모리(힙 수렴·입퇴장 누수 0).

---

## 수정 내역 (수정 담당 1차, 2026-11-26)

- 범위: `scope=game-local` 항목 전부(AC-04·05·09·10)와, 이 폴더 규칙상 고칠 수 없는 항목의 인계 정리.
  수정 허용 범위(`games/astral-clocktower/**`, 이 문서, `docs/RTP_AUDIT_astral-clocktower.md`) 밖은 건드리지 않았다.
- 스크린샷·스크립트: `D:/park/tgslot-wt/_qa/review-astral-clocktower-fix1/` (저장소 밖). 변경 전 `tier-before-390-*.png`,
  변경 후 `tier-after3-390-*.png`·`tier-after3-430-*.png`.
- 최종 귀 판정과 눈 판정은 사용자 몫이다.

### 항목별 처리

| 항목 | 담당 | 처리 | 내용 |
|---|---|---|---|
| AC-01 열쇠·추 실루엣 | art | **넘김 → 아래 «아트·전환 처리»에서 고침** | `artRequests` 2건(key, pendulum). 프롬프트 초안 포함. `prompts.json`은 그림이 바뀔 때 같이 고치도록 그대로 둠 |
| AC-02 전환 클립 | clip | **넘김 → 아래 «아트·전환 처리»에서 고침** | `clipRequests` 1건(한 편에서 양방향, $0.93). 규격·`theme.json` 반영 방법 포함 |
| AC-03 도움말에 확장·승급 설명 | shared | **넘김** | `sharedIssues`(code) — `GameScreen` 피처 페이지가 `math.mutations`를 안 다룸 |
| AC-04 빅윈 밋밋함 | game-local | **고침** | `theme.json` `celebration` 광선·파티클·심볼·등급별 색. 4개 등급 전부 눈으로 확인 |
| AC-05 영어 등급명 | game-local | **고침(주의 있음)** | `celebration.labels` 한국어 4개. 단 허브 `labels`가 언어 무관이라 영어 화면에도 한국어가 나옴 → `sharedIssues` |
| AC-06 `ways`·`스탑` | shared | **넘김** | `sharedIssues`(code) |
| AC-07 프리스핀 복구 배경 | shared | **넘김** | `sharedIssues`(code) |
| AC-08 승급 연출·소리 | shared | **넘김** | `sharedIssues`(code, sound) |
| AC-09 문서 낡음 | game-local | **고침(일부 넘김)** | README·CHECKLIST·RTP_AUDIT 주석은 고침. `docs/GAME_CATALOG.md`·`docs/TRANSITION_DESIGN.md`는 범위 밖이라 `sharedIssues`(other) |
| AC-10 RTP 중앙 조정 | game-local(선택) | **하지 않음** | 아래 «하지 않은 것» |
| AC-11 favicon | shared | **넘김** | `sharedIssues`(code) |

### AC-04 빅윈 연출 — `theme.json` `celebration`

원인 파악: 광선 색이 짙은 코발트 `#2a5fbf80`이고 세기가 허브 기본(0.38~0.62)이라 허브의 어두운 오버레이 위에서 거의 묻혔고,
파티클은 모양 조각뿐이라 팩의 정체성이 없었다. 허브 오버레이 배경(`.hub-win-overlay`의 거의 검은 방사형 그라디언트)은 공용이라 팩에서 못 바꾼다 —
대신 광선을 밝고 진하게 올렸다.

| 항목 | 전 | 후 |
|---|---|---|
| 기본 광선 색(`palette.glow`) | `#2a5fbf80` | `#5a92ffcc` |
| 광선 세기(`rays`) | 기본값(0.38/0.46/0.54/0.62) | 0.8 / 0.8 / 0.85 / 0.9 |
| 등급별 광선 색 | storm만 루비 | surge 코발트 · blast 호박 · storm 루비 · cataclysm 금백색 |
| 파티클 재료 | 조각·별·톱니 | + **팩 심볼 `owl`·`astrolabe`** (`particles.symbols`) |
| 파티클 크기(`size`) | 1.5 | 1.2 (허브가 심볼을 2.6배로 그려서 — 1.5~1.9는 금액을 가림) |
| 밀도(`density`) | 1.3 / - / - / 1.3 | 1.6 / 1.8 / 2.0 / 1.9 (허브 상한 56개 안) |
| 제목 외곽선 | 1.5px `#0a0f24cc` | 2.5px `#0a0f24e6` (밝은 광선 위 가독성) |

시행착오(기록): ① 심볼 3종(성반·부엉이·스캐터)+크기 1.9는 금액 글자를 통째로 가려 폐기, 스캐터(혜성)는 꼬리가 길어 뺐다.
② 금백색 `#fff1c4`는 어두운 바탕 위에서 회갈색으로 탁해서 금색 `#ffd45a`로 올렸다.

확인(390×844, 430×932, DPR 2): 4개 등급을 모두 눈으로 봤다 — 큰 당첨(14x)·대박 당첨(25x)·초대박 당첨(60x)·시계탑의 기적(120x).
STORM·CATACLYSM은 `bigWin` 프리셋(10x 이상)으로는 안 나와서, 스핀 응답의 `totalWin`만 배수에 맞춰 바꿔 화면에 흘리는 방식으로 봤다
(**화면 연출 확인용이고 서버·잔액은 그대로**). 금액 숫자·제목이 모든 등급에서 읽히고, 파티클이 순간적으로 숫자 한 자리를 가리는 일은 남아 있다(허브 공용 구조,
파티클이 카드 앞 층이라). 프리스핀 종료 팝업(390, 획득 992 = 10x 미만이라 «획득» 등급)도 열어 같은 스킨의 광선·심볼 파티클이 입혀진 것을 확인했다.

### AC-05 등급 이름

`celebration.labels`: surge `큰 당첨` · blast `대박 당첨` · storm `초대박 당첨` · cataclysm `시계탑의 기적`(조어 없이 쉬운 말).
⚠ 허브의 `labels` 덮어쓰기는 언어를 가리지 않는다(`winTiers.ts` `overrideLabel`). 영어 사전으로 켜도 이 이름이 나온다.
한국어 기본 언어 원칙을 우선해 적용했고, 영어 쪽 해결안은 `sharedIssues`에 올렸다.

### AC-09 문서

- `README.md`: 실측 수치를 **세 측정(개발 20M·정식 감사 25M·검수 8M)을 한 표**로 합치고 «시드 차이»로 설명, 최대 배수는 «표본 극단값»임을 명시.
  셀 크기·스테이지 표를 실측(87.0/96.5px, 스테이지 390×583 / 430×659)으로 교체, 캔버스 `1080×1620`(2:3) 정정, 릴 번호를 **1부터**로 통일하고 코드 인덱스(0부터)는 괄호로 구분.
  «아트» 절에 열쇠·추·전환 클립 대기 상태와 «빅윈 연출» 절 추가.
- `CHECKLIST.md`: 근거를 적으며 체크. #25는 창 h 0.742(<0.78)의 원인(마키가 큼)을 적고 **게이트를 셀 크기 기준으로 바꿔** 체크.
  유일한 미체크는 «64px 실루엣 구분»(AC-01 대기).
- `docs/RTP_AUDIT_astral-clocktower.md`: 3절 아래에 «최대 배수 496.84x vs 401.20x»가 달라 보이는 이유를 수동 주석으로 추가
  (둘 다 라운드 단위 최대 승리이고 서로 다른 표본 실행의 극단값 — 코드로 확인). 생성물이라 감사를 다시 돌리면 주석은 사라진다.
- `docs/GAME_CATALOG.md` #16, `docs/TRANSITION_DESIGN.md`의 astral 행은 범위 밖이라 `sharedIssues`로 넘김.

### 하지 않은 것

- **AC-10(astrolabe 4연속 53→54)**: 하지 않았다. 가중 평균 94.34%는 게이트(94.5% ± 0.5%p) 안이고 규칙 위반도 «뚜렷한 목표 미달»도 아니다.
  바꾸면 25M 정식 감사·골든 해시(`kind=golden`)·README·감사 문서·도움말 수치를 전부 다시 맞춰야 해서 득보다 비용이 크다.
  원하면 위 README 「실측 수치」 절의 조정 방법을 따르면 된다.
- `art/prompts.json`: 그림 파일을 새로 만들지 않으므로 고치지 않았다. 재생성 때 `artRequests`의 문구로 바꾸고 같이 커밋할 것.
- `math.json`·골든·공용 코드: 변경 없음.

### 검증

- `pnpm pack:check astral-clocktower`: OK(오류 0·경고 0, `theme.json` 수정 뒤).
- `pnpm --filter @tgslot/theme-gen gen games/astral-clocktower --dry-run`: 통과, `theme.json`·`prompts.json` 해시 불변 확인.
- `pnpm --filter @tgslot/game-sdk test`: 145/145. `typecheck`: 통과.
- `pnpm --filter @tgslot/rtp-sim test`: 274 통과·2 skip(8파일 전부 통과, 82초).
- 크로마 초록 번짐: 심볼 10종·@128 10종 불투명 초록 계열 픽셀 0.
- 브라우저: 위 AC-04 확인(390·430). 띄운 API(8816)·허브(5216)는 PID로 종료했고 두 포트 모두 닫힌 것을 확인했다.

---

## 아트·전환 처리 (아트·전환 담당, 2026-11-26)

- 범위: AC-01(열쇠·추 재생성)과 AC-02(프리스핀 전환 클립). `games/astral-clocktower/**`, 이 문서, `docs/TRANSITION_DESIGN.md` 2-5와 그 표의 astral 행, `D:/park/tgslot-wt/_tools/`만 건드렸다.
- 증거(저장소 밖): `D:/park/tgslot-wt/_qa/review-astral-clocktower-art/`. 컨택트 시트 `contact-after.png`, 심볼 비교 `prev-key-v1.png`·`prev-pend-v1~v4.png`,
  화면 `base-390.png`·`base-430.png`·`help-390.png`, 전환 프레임 `sheet-fs-enter-390.png`·`sheet-fs-exit-390.png`·`sheet-fs-enter-430.png`·`sheet-fs-exit-430.png`,
  영상 원본·컷 `clips/ac-v1.mp4`·`clips/webp/`, 스크립트 `measure.mjs`(알파 bbox·dHash)·`s_fs2.mjs`(전환 캡처).
- 최종 귀 판정과 눈 판정은 사용자 몫이다.

### 결과 요약

| 항목 | 결과 | 핵심 수치 |
|---|---|---|
| AC-01 열쇠 | **고침** | 알파 bbox 84% x 24% → **84% x 84%**, dHash 가장 가까운 이웃 28, 대기 화면·배당표에서 열쇠로 읽힘 |
| AC-01 추 | **부분 고침** | 49% x 84% → **62% x 84%**, 가장 가까운 이웃 astrolabe 18. 폭 65% 목표는 못 맞췄다(아래) |
| AC-02 전환 클립 | **고침** | 한 편($0.93)에서 양방향 컷. 48프레임·3.00초·loop 1·정지 0%, 두 파일 1,112 KiB. `check:clips` 12개 통과, `pack:check astral-clocktower` 오류 0·경고 0 |

### AC-01 심볼 재생성

codex 이미지 5장(열쇠 1 + 추 4). 한도 소진 없음. 매번 `--only <id> --force` 한 장씩, 컨택트 시트·`prev-*.png`로 눈 검수 후 채택.

- **열쇠(1차 채택).** 요청 초안 그대로. 45° 대각선(왼쪽 위 손잡이 → 오른쪽 아래 이빨), 둥근 손잡이 한가운데 루비 유리, 짧고 굵은 몸통.
  알파 431x428/512. 크로마 초록 픽셀 0. 가장 가까운 dHash 이웃은 moondial·pendulum 28, 그다음 scatter 31·owl 32다(기존 열쇠는 24). 깃펜·혜성이 쓰는 왼쪽 아래→오른쪽 위 대각선을 피해
  왼쪽 위→오른쪽 아래로 눕힌 선택이 먹혔다.
- **추(4차 채택).** 폭 65%는 끝내 못 맞췄다. 알파 bbox는 «가장 긴 변을 84%로 맞추는» 후처리 때문에 폭 % = 추 지름 / (고리·막대 + 지름) x 0.84라서,
  막대를 줄이면 추가 아니라 목걸이 장식으로 읽히고 막대를 두면 폭이 62~63%에서 멈춘다. 60% 이상(요청의 «가로·세로 모두 60%»)은 지켰다.

| 시도 | 모양 | 폭 | 가장 가까운 dHash | 판정 |
|---|---|---:|---|---|
| 1 요청 초안 | 방패꼴 매다는 등갓(렌즈형 추 지시가 방패로 나옴) | 62% | moondial **13** (<15) | 폐기: 원래 지적(등갓)이 그대로 |
| 2 «둥근 원반 78%» | 꽃무늬 원반, 갈고리가 **물음표(?)** 모양 | 63% | astrolabe 19 | 폐기: 글자처럼 보이는 갈고리 |
| 3 «고리 + 원반 84%» | 주황 단색 원반(바큇살 3개) | 63% | starjar 17 | 폐기: 바퀴·피자로 읽힘, 스테인드글라스 결이 약함 |
| **4 «둥근 고리 + 코발트 바탕 호박 꽃잎 4장 + 루비»** | 고리·짧은 막대에 매달린 원반 추 | **62%** | **astrolabe 18**, starjar 19 | **채택** |

  한계: 작은 크기에서 «추»라기보다 «고리 달린 원반(펜던트)»로 읽힌다. 열쇠만큼 확실한 개선은 아니다. 무게추로 더 분명히 읽히게 하려면 막대를 길게 두고 원반을 키우는 대신
  실루엣이 덜 원형인 추(예: 종 모양 위에 원반)가 필요한데, 그러면 폭이 줄어드는 상충이 있다.
- `art/prompts.json`의 key·pendulum `prompt`를 **실제로 생성에 쓴 문구**로 교체했다(`stylePrefix` + 본문). 추 본문(4차):
  *a clock pendulum: a small plain round brass ring loop at the very top (a simple circle, not a curl and not a question mark), a short thick brass rod below it, together under 22% of the frame height, ending in one big heavy round disc bob of amber glass seen face-on, about 80% of the frame width, with a thick smooth brass rim without any teeth, a single ruby glass jewel at its center surrounded by four amber glass petals on a cobalt glass ground divided by black lead lines, the disc the dominant mass of the silhouette, clearly a hanging weight on a rod and not a gear, not a lantern, centered composition with 8% padding, isolated on a flat solid #00FF00 chroma-key green background.*
- 화면 확인(390·430): 대기 화면 톱니 12 + 열쇠 8이 열쇠 여덟 개로 또렷하다(`base-390.png`, `base-430.png`). 배당표 아이콘에서 열쇠·추가 점·선이 아니다(`help-390.png`).
  프리스핀 판(전환 프레임)에서도 추가 원반으로 보인다. 컨택트 시트 `contact-after.png`의 58/28px 줄에서 열쇠는 28px에서도 대각선 열쇠다.
- 부수: `theme.json`은 gen이 다시 써서 줄 모양(들여쓰기)만 바뀌고 내용은 같다(깊은 비교 동일). 중간에 2차 결과를 잠시 되살렸다가 4차로 다시 생성했으므로 최종 key·pendulum(512·@128)은 gen이 만든 그대로다. `art/contact.png`는 `pack:check` 경고를 부르므로 시트를 QA 폴더에 복사한 뒤 지웠다.

### AC-02 프리스핀 전환 클립

상세(발주 문구·구간별 측정·컷·인코딩 비교)는 `docs/TRANSITION_DESIGN.md` 2-5 «채택 결과». 여기에는 결정만 적는다.

- 한 편($0.93, SeeDance 2.0 t2v, `D:/park/tgslot-wt/_tools/vidgen-t2v.mjs`, 키는 `node --env-file`로만 전달) — 재발주 한도는 쓰지 않았다. 총 지출 **$0.93**.
- 생성기는 «3초 x4 사이클» 대신 약 9.5초 사이클 하나 반을 만들었다. 호박빛이 차올라 아치 창 전체를 덮는 구간이 3.3~6.7초에 3.4초나 되고, 그동안 유리 결·납선·톱니가 움직여
  단색 정지는 없다(R11 통과). 숫자·글자·손·시계 바늘 없음.
- 컷: 진입 0.60→3.90초 @1.1x(`opaqueMs` 2400), 복귀 6.00→9.00초(`opaqueMs` 0). 16fps·q60·loop 1에 스케일 뒤 `gblur=sigma=0.9`로 두 파일 1,112 KiB(블러 없이는 1.72 MiB였다).
- `theme.json` `transitions` 배선, 두 파일 `git add -f`(CHECKLIST 6절 첫 항목 갱신). README 아트 절의 «클립 대기» 문구와 CHECKLIST 4절 64px 항목도 갱신했다.
- 눈 확인(390·430, CDP 스크린캐스트): 진입은 스테이지 영역을 덮고 3.1~3.2초 재생된 뒤 호박빛 채로 페이드아웃해 프리스핀 판이 나온다. 복귀는 호박빛에서 빛이 가라앉아 어두운 시계탑으로 풀리고
  일반 판으로 이어진다(3.0초). 콘솔에서 `[transition-clip] noClip` 경고가 사라지고 `클립 재생 시작 {decoded: true}`가 찍힌다. 스핀 «빠름»으로 확인했다(클립 길이는 속도와 무관, 터보는 접힘).

### 남은 것

- 추: 폭 62%(목표 65%)이고 «펜던트»에 가깝게 읽힌다. 불만이면 다른 형태(막대 길게 + 종형 추)로 한 번 더 시도(codex 한 장 단위).
- 전환 클립의 장면은 사진처럼 빛·결이 있는 유리라 평면 심볼과 결이 다르다(다른 팩 클립도 같음). 텔레그램 iOS WebView의 애니메이션 WebP 재생은 확인되지 않았다(TRANSITION_DESIGN 5-2 경고).
- 진입 클립은 사이클이 길어 컷 앞부분(0.6초)에서 빛 기둥이 이미 하단에 보인 채 시작한다. 처음부터 «맑음»에서 시작하는 컷이 필요하면 소스 0.0초 근처를 쓰되 덮임 유지가 0.3초로 줄어든다.
- 검증 명령: `pnpm pack:check astral-clocktower` OK(오류 0·경고 0), `pnpm --filter @tgslot/theme-gen check:clips` 12개 통과, `pnpm --filter @tgslot/game-sdk test` 145/145,
  `gen games/astral-clocktower --dry-run` 통과. 전체 `pack:check`의 오류 2건은 classic-777의 미추적 시트(`bar3-win`) — 이 팩 밖이다.
- 띄운 API(8836)·허브(5236)는 PID로 종료했고 두 포트 모두 닫힌 것을 확인했다.

---

## 재검수 (재검수 담당, 2026-11-26)

- 범위: 처음 감사(AC-01~11)와 수정 내역(수정 담당 1차, 아트·전환 담당)이 «고쳤다»고 한 항목이 실제로 고쳐졌는지 하나씩 확인하고, 수정 때문에 새로 생긴 문제가 없는지 봤다. 코드·데이터는 고치지 않았고 이 절만 덧붙였다.
- 방법: 알파 실측·dHash는 독립 스크립트로 다시 쟀고, 브라우저는 헤드리스 크롬(390×844·430×932, DPR 2, 디버그 프리셋)으로 열어 PNG·CDP 스크린캐스트 프레임을 직접 봤다. 개발 스택은 API 8816·허브 5216 한 벌만 띄웠고 끝나고 PID로 끈 뒤 두 포트가 닫힌 것을 확인했다.
- 증거(저장소 밖): `D:/park/tgslot-wt/_qa/review-astral-clocktower-verify/`. `01-base-*.png`·`02-help-*-0.png`(대기 화면·배당표), `m-tier-390-t*.png`·`m-tier14-series.png`·`m-tier60-series.png`·`m-tier-430.png`(빅윈 4등급), `m-fs-enter-a/b.png`·`m-fs-exit-a/b.png`·`m-fs430.png`(전환 클립 프레임), `m-resume.png`(새로고침 복구), 스크립트 `measure.mjs`·`s05_tier.mjs`·`s06_fs.mjs`·`s08_bigwin_leak.mjs`·`s14_resume.mjs`·`s16_life.mjs`.
- 최종 눈·귀 판정은 사용자 몫이다. 사운드는 이번에 바뀐 것이 없어 다시 보지 않았다.

### 한 줄 결론

**블로커·메이저는 이 팩 안(game-local·art·clip)에 남지 않았다. 통과.** 처음 감사의 major 3건 중 둘(AC-01 열쇠·추, AC-02 전환 클립)은 실제로 고쳐졌다. 남은 major는 공용 코드인 AC-03(도움말에 확장·승급 설명 없음)뿐이고 공용 담당 몫이다. 수정 때문에 생긴 새 문제는 minor 2건이다(빅윈 심볼 파티클이 금액을 가림, 추가 «추»보다 «펜던트»로 읽힘).

### 항목별 재확인

| 항목 | 처음 지적 | 재검수 판정 | 확인한 것 |
|---|---|---|---|
| AC-01 열쇠 | 가로 84% × 세로 24%, 선으로만 보임 | **고쳐짐** | 알파 실측 **84% × 84%**, 크로마 초록 픽셀 0(512·@128 모두). dHash 가장 가까운 이웃 moondial·pendulum 28. 대기 화면 390·430에서 열쇠 8개가 또렷한 대각선 열쇠로 읽히고(`01-base-390.png`, `01-base-430.png`), 배당표 58px 아이콘도 열쇠다(`02-help-390-0.png`). 채움율 26%는 같은 대각선 계열인 scatter 25%·quill 21%와 같은 수준이라 «가늘다» 문제가 아니다 |
| AC-01 추 | 가로 49%, 매다는 등갓으로 읽힘 | **부분 고쳐짐** | 알파 실측 **62% × 84%**(요청의 «가로·세로 60% 이상»은 충족, 65%는 미달). 가장 가까운 이웃 astrolabe 18·starjar 19·moondial 20으로 전부 15 이상, 전체 최소 15(scatter↔quill)는 그대로. 등갓 인상은 사라졌고 톱니·성반과 헷갈리지 않는다. 다만 배당표·릴에서 «고리 달린 꽃무늬 원반(펜던트)»로 읽혀 시계 추보다 장신구에 가깝다(아래 새 문제 2) |
| AC-02 전환 클립 | 클립 없음, 검은 단색 커튼 | **고쳐짐** | `pack:check` astral-clocktower OK(오류 0·경고 0), `check:clips` 12개 통과(astral 두 편 360×640·48프레임·3.00초·loop=1·최대 프레임 63ms·정지 0.0%). 390·430 모두 진입 클립이 스테이지 영역(`0,52,390,583` / `0,52,430,659`)을 덮고 3.4~3.5초, 종료 2.9~3.0초 재생. 진입은 장미창에 빛 기둥이 솟아 호박빛으로 덮인 뒤 페이드아웃해 프리스핀 판으로 이어지고, 종료는 호박빛에서 빛이 가라앉아 일반 판으로 이어진다(`m-fs-enter-*.png`, `m-fs-exit-*.png`, `m-fs430.png`). 콘솔 `noClip` 경고는 사라졌고 `클립 재생 시작 {decoded: true}`가 찍힌다. 덮인 동안 단색으로 얼어붙지 않는다(납선·유리 결이 움직임) |
| AC-04 빅윈 밋밋함 | 화면이 검게 눌리고 파티클 10개 안팎 | **고쳐짐(부작용 있음)** | 390에서 4등급(14x·25x·60x·120x), 430에서 2등급(14x·120x)을 눈으로 봤다. 광선이 코발트·호박·루비·금색으로 등급마다 또렷이 다르고 팩 심볼(부엉이·성반)이 흩날린다(`m-tier-390-t4000.png`). 4회 반복 뒤 DOM 노드 83개로 고정, 힙 25.7→26.3MB로 수렴, 효과 요소는 닫히면 0개(피크 29~54) — 누수 없음. 부작용은 아래 새 문제 1 |
| AC-05 영어 등급명 | SURGE·BLAST·STORM·CATACLYSM | **고쳐짐** | 화면에 «큰 당첨»·«대박 당첨»·«초대박 당첨»·«시계탑의 기적»이 뜬다(390 4등급, 430 2등급). 조어 없음. 허브 `overrideLabel`(`winTiers.ts`)이 언어를 안 보므로 영어 사전에서도 한국어가 나오는 한계는 코드로 그대로 확인(공용 몫) |
| AC-09 문서 | 수치·체크 낡음 | **고쳐짐(일부 공용 몫)** | README 표를 실물과 대조했다 — 셀 간격 87.0/96.5px(스크린샷 열 간격 174/193px ÷ 2와 일치), 프레임·배경 `1080×1620`(sharp 실측), 릴 번호 1부터, 정확 계산 진입 확률 0.4895%. CHECKLIST는 근거 달린 체크이고 미체크는 없다. RTP_AUDIT에 최대 배수 주석이 들어갔다. **`docs/GAME_CATALOG.md` #16은 아직 낡았다**(승급 2단만 예시, sigma 4.46·n* 19.1M, 캔버스 1024×1536) — 범위 밖이라 공용 몫. TRANSITION_DESIGN의 astral 행은 갱신됨 |
| AC-10 RTP 중앙 조정 | 선택 | **하지 않음에 동의** | 가중 평균 약 94.33~94.34%로 게이트(±0.5pp) 안. 바꾸면 25M 감사·골든 해시·문서를 다시 맞춰야 해서 비용이 득보다 큼 |

### 명령 확인

- `pnpm pack:check`: astral-clocktower OK. 전체는 오류 2(classic-777의 미추적 `bar3-win` 시트, 다른 팀 작업 중)·경고 1(royal 프리스핀 배경) — 둘 다 이 팩 밖.
- `pnpm --filter @tgslot/theme-gen check:clips`: 12개 통과. `gen games/astral-clocktower --dry-run`은 `theme.json`·`prompts.json` 해시가 실행 전후 같다.
- `pnpm --filter @tgslot/game-sdk test`: 145/145.
- `pnpm --filter @tgslot/slot-engine test`: 328 통과·1 실패 — 실패는 `golden.test.ts`의 **royal-diamond-777**이다(다른 팀이 `games/royal-diamond-777/math.json`을 손보는 중이라 해시가 달라짐). **astral-clocktower 골든은 통과**, 이 팩의 `math.json`·`manifest.json`은 `git diff` 0줄.
- `apps/`·`packages/`는 변경 없음(`git status` 빈 결과). 공용 코드는 이번 수정 범위에서 안 건드렸다.
- 입·퇴장 5회: 로비로 나가면 클립용 blob 이미지 2개가 DOM에서 0개로 정리되고, 노드 수는 매번 76으로 같으며 힙은 회당 +0.2MB로 이전 감사(+0.2MB/회)와 같다. 콘솔 에러는 `favicon.ico` 404(AC-11) 하나뿐이다.

### 수정 때문에 새로 생긴 문제

1. **빅윈 심볼 파티클이 금액 숫자를 가린다 (minor / game-local).** AC-04에서 넣은 부엉이·성반 파티클이 허브 공용 CSS로 기본 크기의 2.6배로 그려져 롤업·정착 동안 금액 위를 지나가며 한두 자리를 가린다(`m-tier60-series.png` 2·4·5번째 프레임 «5,0▯0»·«6,▯00», `m-tier-430.png`의 «9,703»). 순간적이고 정착값은 읽히며 fruit·royal 팩도 같은 방식의 심볼 파티클을 쓰지만, 이 팩은 밀도를 1.6~2.0까지 올려 더 자주 걸린다. 수정 담당도 알고 있던 한계다. 제안: `particles.symbols`를 `astrolabe` 하나(둥근 모양이라 덜 가림)로 줄이거나 `tiers.*.density`를 1.3~1.5로 낮춘다. 근본 해결은 공용 쪽(심볼 파티클을 금액 뒤 층으로)이다.
2. **추가 «추»보다 «펜던트»로 읽힌다 (minor / art).** 위 AC-01 추 행. 아트 담당이 한계로 적어 둔 것과 같다. 열쇠만큼 확실한 개선은 아니지만 이전 «등갓» 문제는 풀렸고 다른 심볼과 혼동되지 않아 출시를 막지 않는다. 불만이면 «막대를 길게 두고 종 모양 위에 원반을 얹은» 형태로 한 장 더 시도(codex 한 장 단위).

### 아직 안 고쳐진 공용 항목 (이 팩에서는 못 고침, 공용 담당 몫)

- **AC-03 (major)** 도움말에 확장 와일드·층 승급 설명 없음 — `apps/`가 그대로라 그대로다.
- AC-06 `ways`·`스탑`, AC-08 승급 연출·소리, AC-11 favicon 404 — 그대로(favicon은 이번에도 콘솔 404로 확인).
- **AC-07** 프리스핀 도중 새로고침하면 배경이 일반(파란) 배경으로 남는다 — 이번에도 8/10에서 새로고침해 재현했다(`m-resume.png`). 세션·카운터·버튼은 정상 복구되고, 클립은 복구 직후 재생되지 않아 새 클립이 이 경로를 망가뜨리지는 않았다.
- AC-05 후속: `celebration.labels`가 언어와 무관해 영어 화면에도 한국어 등급명(위 표).
- `docs/GAME_CATALOG.md` #16 낡음(위 AC-09 행).

### 남은 것 (이 팩 몫)

- 새 문제 1·2, 둘 다 minor이고 출시를 막지 않는다.
- 텔레그램 iOS WebView의 애니메이션 WebP 재생은 확인되지 않았다(Chromium만 확인, TRANSITION_DESIGN 5-2 경고와 같은 처지).
