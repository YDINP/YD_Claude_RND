# shiba-shrine 체크리스트

`games/_template/CHECKLIST.md`의 순서를 따라 출시 상태를 기록한다(2026-11-26 검수 기준).
체크하지 못한 항목은 이유와 담당을 옆에 적었다. 정본 수치는 `docs/RTP_AUDIT_shiba-shrine.md`, 검수 전체는 `docs/review/shiba-shrine.md`.

## 1. 수학 모델 (`math.json`)

- [x] `symbols` 10종 — 와일드 `wild`(이름 «발자국 와일드»), 스캐터 `scatter`(이름 «신사 방울»). 이름을 그림에 맞췄다. RTP 영향 없음
- [x] `strips` — 릴 51·56·53·46·45칸, 고배당 심볼일수록 적게. 릴 0번이 전부 `wild`라 정지 위치 0이면 윗줄이 와일드 5개로 보인다(8번 항목, 공용)
- [x] `payModel: "ways"` 243 — 페이라인 없음
- [x] `paytable` — 배수 기준은 웨이당 베팅액(총 베팅액 / 25)
- [x] `betLevels` 6종 — 전부 25로 나누어떨어짐
- [x] `scatter`(프리스핀 8회 ×2, 리트리거) / `mutations`(`randomWild` 20%, 릴 2·3·4에 1~3개)
- [x] 확인: 몬테카를로 25M 스핀(시드 42, 4샤드) RTP **94.881%**(목표 ±0.5%p 안), 적중률 35.41%(5릴 25~35% 권장보다 높지만 «당첨 62%가 베팅 미만»인 설계, 아래 메모), 관측 최대 배수 421.04x(100x 이상), 게이트 7/7
- [ ] RTP가 목표 위쪽에 +0.3~0.4%p 치우쳐 있다(독립 두 표본 합 약 94.84%). 게이트 안이고 골든 해시가 걸려 있어 `math.json` 배당은 건드리지 않았다. 중심을 당기고 싶으면 시바 5연속 155 → 152 등 한 배당을 낮추고 재감사 + 골든 해시 갱신(공용 담당)

## 2. 로비 메타데이터 (`manifest.json`)

- [x] `id` = 폴더 이름 = `math.json`의 `id`
- [x] `name.en` Shiba Shrine / `name.ko` 시바 신사
- [x] `reels` 5 / `rows` 3 / `lines` 243 / `betLevels` / `rtpTarget` 0.945 / `volatility` medium — `math.json`과 동일
- [x] `rtpTotalTarget` 0.96 = 0.945 + 0.015
- [x] `features` 태그 (`ways`, `randomWild`, `freeSpins`, `scatter`, `wild`)
- [x] `status: live`
- [x] 확인: `pnpm pack:check shiba-shrine` — 오류 0, 경고 0

## 3. 아트 프롬프트 (`art/prompts.json`)

- [x] `concept` / `stylePrefix`
- [x] `kind: "symbol"` asset 10종 = `math.json` 심볼 id
- [x] `kind: "sheet"` asset(`shiba-win`·`wild-win`·`scatter-win`)의 `symbol`
- [x] `frame` — 정사각 1080 + 가로형 창
- [x] 확인: `pnpm --filter @tgslot/theme-gen gen games/shiba-shrine --dry-run`

## 4. 아트 생성

- [x] 심볼 10·frame·bg·bg-freespins·thumb·시트 3종 생성 완료
- [x] 프레임 창 실측: 알파 불투명도 50% 선(가장자리 번짐 약 7px의 가운데)에서 x 0.0603 · y 0.2595 · w 0.8833 · h 0.5044. `theme.json` 값과 일치한다. 완전 투명한 안쪽 상자(x 0.0639 · y 0.2630 · w 0.8778 · h 0.4991)로 줄이면 번짐 구간이 릴 마스크 밖으로 나가 배경이 비쳐 보이므로 현재 값을 유지한다
- [x] 64px로 줄여도 심볼 실루엣이 서로 구분됨(dHash 해밍 거리 최소 14)
- [x] 크로마키 가장자리에 초록 번짐 없음(390/430 화면 확인)
- [x] 승리 시트 재생성(2026-11-26, codex): `scatter-win`은 금빛 방울·분홍 벚꽃 2송이·하트 구멍·적백 꼬임 끈·분홍 매듭 꽃·민트 구슬·적백 술을 정지 심볼과 같게 하고 자세(왼쪽으로 기울어진 방울, 끈 고리가 오른쪽)까지 맞췄다. `shiba-win`은 열린 눈·벚꽃 무늬 하오리·민트 리본(작은 금 방울)으로 바꾸고 금 발바닥 메달을 없앴다. 두 시트 모두 컨택트 시트 눈 검수 통과, 정지 심볼과 정면·3/4 각도 차이는 남는다. 390 화면에서 스캐터 당첨 순간 금빛 방울로 이어짐을 확인
- [x] `koi`·`dango` 외곽선을 굵게 재생성(2026-11-26). 둘 다 균일한 굵은 검은 외곽선, 컨택트 시트 dHash 최소 거리 8 이상 유지. dango 1차는 얼굴이 멋대로 붙어 폐기하고 «얼굴 없음»을 못 박아 다시 뽑았다
- [x] 기본 배경 `bg.webp`는 의도한 소프트 포커스(낮은 대비)라 그대로 둔다(눈 판정). 릴 판독이 되고, 새 복귀 클립의 마지막 장면(낮 경내)과 구도·색이 이어진다. 프리스핀 배경과의 선명도 차이는 모드 구분 역할도 한다
- [x] 확인: `pnpm pack:check shiba-shrine` — 오류 0

## 5. 연출 (`art/fx.json`)

- [x] 심볼마다 승리 연출, 없는 심볼은 `default`
- [x] `theme.json`의 `fx`는 `art/fx.json`과 같음(`pack:check`에 불일치 경고 없음)
- [x] 화면을 가로지르는 사선 광택 없음, 당첨 선 그리기 없음(셀 테두리·어두워짐으로 당첨 경로 표시)
- [ ] 랜덤 와일드 드롭은 발자국 도장이 칸에 찍히는 연출(약 0.5초)이다. «시바가 경내를 가로지르는 마스코트 스윕»과 `SHRINE BLESSING` 배너는 코드에 없다. README·카탈로그 문구는 실제 연출에 맞췄고, 마스코트 스윕은 공용 렌더러 부품 + 시트가 필요하다(공용·아트 요청)
- [ ] 빅윈 등급명이 한국어 화면에 영어(SURGE·BLAST·STORM·CATACLYSM)로 뜬다 — 공용 사전(`apps/hub/src/i18n/ko.ts`)

## 6. 게이트

- [ ] 생성/추가한 자산을 전부 `git add` 했는가 — 커밋하는 리드가 `theme/transitions/fs-enter.webp`·`fs-exit.webp` 포함 여부를 확인한다
- [x] `pnpm pack:check` — 오류 0
- [x] `pnpm --filter @tgslot/rtp-sim test` — RTP 게이트 통과
- [x] `pnpm -r typecheck`
- [x] `README.md`에 페이테이블 표와 실측 수치 기입(`RTP_AUDIT`와 같은 값)
- [x] `manifest.json`의 `status`를 `live`로
- [x] 전환 클립 `fs-enter`·`fs-exit` 재발주·교체(2026-11-26, $1.86 2편): 평면 2D 셀 그림 + 낮 경내 + 소용돌이 주홍 칠. `exit-v1` 한 편에서 양방향을 잘랐다(진입 `opaqueMs` 1812, 복귀 0). `check:clips` 정지 0.0%, 팩 합계 880 KiB. 설계·측정은 `docs/TRANSITION_DESIGN.md` 2-4 «재발주 결과»

## 7. 출시 후

- [x] `docs/GAME_CATALOG.md`에 한 줄 있음. 단 #5가 낡았다 — RTP 구성 «ways 70 + 드롭 16 + 프리스핀 8.5»(실측 ways 59.8 + 스캐터 5.8 + 프리스핀 29.3), 적중률 목표 34%(실측 35.4%), 배수 기준 «총 베팅액»(실제는 웨이당 = 총 베팅액 / 25), 심볼 이름·마스코트 연출 문구. 공용 문서라 팀 밖에서 고친다
- [x] `pnpm --filter @tgslot/rtp-sim run audit shiba-shrine --spins 25000000 --seed 42 --shards 4` → `docs/RTP_AUDIT_shiba-shrine.md`(2026-11-26 재생성)

## 8. 공용 코드에 걸려 있는 항목 (이 팩 밖에서 고친다)

- [ ] 도움말 «피처» 탭에 랜덤 와일드 드롭 규칙이 없다(`GameScreen.tsx`가 `math.mutations`를 안 읽음). «스캐터는 대체하지 않는다»·«와일드만 이어진 줄은 시바 배당»·«리트리거 +8회»도 빠져 있다
- [ ] 첫 화면이 와일드 5개 줄로 시작함(대기 그리드가 정지 위치 0 — 허브가 `initialStops`를 안 넘김)
- [ ] 릴이 화면에 비해 작다(5릴 프레임 v3 규격의 한계)
- [ ] 빅윈 파티클이 금액 숫자를 가림, 프리스핀 «누적» 금액이 롤업보다 먼저 오름
- [ ] shrine 롤업 소리가 약하다(`SOUND_CHECK.md` z 1.90, 귀 판정 필요)
- [ ] favicon 404, 로비 카드 영어 단위(`243 ways`·`10 lines`·`Cluster 5+`)
- [ ] `apps/sim` `workerPurity.test.ts`가 `tools/rtp-sim/src/audit/shards.ts`·`shardWorker.ts`의 `node:worker_threads`를 잡음(이 팩과 무관)

## 메모 — 설계상 의도

- 적중률 35.4% 중 약 62%가 베팅액보다 작은 당첨(오마모리 3연속 1배 등)이다. 적중률을 눌러 높은 배당(시바 5연속 155배, 프리스핀 ×2)을 키운 설계라 바꾸지 않았다. 앞 릴(1·2)은 오마모리, 릴 3은 당고가 대부분이라 같은 심볼 열이 자주 반복된다. 단조롭다고 느껴지면 릴 1~3의 저배당 심볼 비중을 낮추고 재튜닝한다(사용자 판단).
