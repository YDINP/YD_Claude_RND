# sheriff-sixgun 체크리스트

`games/_template/CHECKLIST.md`의 순서를 따라 출시 상태를 기록한다(2026-11-26 검수 기준).
체크하지 못한 항목은 이유와 담당을 옆에 적었다. 정본 수치는 `docs/RTP_AUDIT_sheriff-sixgun.md`.

## 1. 수학 모델 (`math.json`)

- [x] `symbols` 10종 — 와일드 `wild`, 스캐터 `scatter`(이름은 «현상금 메달»로 그림과 맞춤, RTP 영향 없음)
- [x] `strips` — 릴 50·49·53·50·46칸, 고배당 심볼일수록 적게
- [x] `paylines` 20개
- [x] `paytable` — 배수 기준은 라인당 베팅액(총 베팅액 / 20)
- [x] `betLevels` 6종 — 전부 20으로 나누어떨어짐
- [x] `scatter`(프리스핀 8회 ×2, 리트리거) / `mutations`(`expandWild` 릴 2·3·4) / `gamble`(코인 플립 50%, ×2, 5단)
- [x] 확인: 몬테카를로 25M 스핀(시드 42, 4샤드) RTP **94.575%**(목표 ±0.5%p 안), 적중률 32.05%(5릴 25~35%), 관측 최대 배수 439.6x(100x 이상), 게이트 7/7

## 2. 로비 메타데이터 (`manifest.json`)

- [x] `id` = 폴더 이름 = `math.json`의 `id`
- [x] `name.en` / `name.ko`
- [x] `reels` 5 / `rows` 3 / `lines` 20 / `betLevels` / `rtpTarget` 0.945 / `volatility` medium — `math.json`과 동일
- [x] `rtpTotalTarget` 0.96 = 0.945 + 0.015
- [x] `features` 태그
- [x] `status: live`
- [x] 확인: `pnpm pack:check` — sheriff-sixgun OK(오류 0, 경고 0)

## 3. 아트 프롬프트 (`art/prompts.json`)

- [x] `concept` — 확장 와일드 + 동전 던지기 더블업으로 맞춤(예전 «카드 갬블» 문구 제거)
- [x] `stylePrefix`
- [x] `kind: "symbol"` asset 10종 = `math.json` 심볼 id
- [x] `kind: "sheet"` asset(`wild-win`·`scatter-win`·`sheriff-win`)의 `symbol`
- [x] `frame` — 정사각 캔버스 + 와이드 창. 예전엔 창이 요구보다 좁게 나와 비율 1.95:1로 셀이 높이에 묶였다. 창 규격 문장을 «x 1%-99%, y 19%-79%, 약 1.65:1»로 고쳐 재생성해 비율 1.70:1(2차 시도)
- [x] 쓰지 않는 asset 없음
- [x] 확인: `pnpm --filter @tgslot/theme-gen gen games/sheriff-sixgun --dry-run`

## 4. 아트 생성

- [x] 심볼 10·frame·bg·bg-freespins·thumb·시트 3종 생성 완료
- [x] 프레임 창 실측(알파 투명 영역): x 0.0370 · y 0.2741 · w 0.9269 · h 0.5463, 비율 1.697(이전 1.946). `theme.json` `frameLayout`은 theme-gen이 쓴 값(x 0.0361 · y 0.2744 · w 0.9277 · h 0.5449)이고 실측과 0.1%p 안에서 같다. 가로는 3.6~96.4%라 목표 2~98%에는 못 미친다(모델이 요구보다 약 5% 좁게 그린다). 열 간격 390폭 72.5px · 430폭 79.5px(이전 약 61·67)
- [x] 64px로 줄여도 심볼 실루엣이 서로 구분됨(컨택트 시트 dHash 해밍 거리 12 이상)
- [x] 크로마키 가장자리 초록 번짐 없음(390/430 화면 확인)
- [x] 승리 시트(`wild-win`·`scatter-win`·`sheriff-win`)를 정지 심볼의 문장 묘사로 재생성해 같은 물체로 읽힌다(와일드 1회, 스캐터 2회, 보안관 2회 시도). 눈 대조·인게임 확인은 `docs/review/sheriff-sixgun.md`
- [x] 확인: `pnpm pack:check` — 오류 0

## 5. 연출 (`art/fx.json`)

- [x] 심볼마다 승리 연출, 없는 심볼은 `default`
- [x] `theme.json`의 `fx`는 `art/fx.json`과 같음(`pack:check`에 불일치 경고 없음)
- [x] 빅윈 등급 이름을 `theme.json` `celebration.labels`로 한글화: 명중 / 백발백중 / 현상금 사냥 / 전설의 총잡이
      (손으로 쓰는 키라 theme-gen 재생성에도 살아남는다. 영어 화면에서도 같은 한글이 뜬다 — 공용 스키마가 언어별 문구를 못 받는다)
- [x] 화면을 가로지르는 사선 광택 없음, 당첨 선 그리기 없음(셀 하이라이트·코인 이동으로 당첨 경로 표시)

## 6. 게이트

- [ ] 생성/추가한 자산을 전부 `git add` 했는가 — 커밋하는 리드가 `theme/transitions/fs-enter.webp`·`fs-exit.webp` 포함 여부를 확인한다
- [x] `pnpm pack:check` — 전체 팩 오류 0
- [x] `pnpm --filter @tgslot/rtp-sim test` — RTP 게이트 통과
- [x] `pnpm -r typecheck`
- [x] `README.md`에 페이테이블 표와 실측 수치 기입(`RTP_AUDIT`와 같은 값)
- [x] `manifest.json`의 `status`를 `live`로
- [x] 전환 클립 `pnpm --filter @tgslot/theme-gen check:clips` — 2/2 통과(360×640, 48프레임, 3.00초)

## 7. 출시 후

- [x] `docs/GAME_CATALOG.md`에 한 줄 있음. 단 갬블 설명이 «카드 갬블, 빨강/검정»으로 남아 있어 실제(동전 던지기)와 다르다 — 공용 문서라 팀 밖에서 고친다
- [x] `pnpm --filter @tgslot/rtp-sim run audit sheriff-sixgun --spins 25000000 --seed 42 --shards 4` → `docs/RTP_AUDIT_sheriff-sixgun.md`(2026-11-26 재생성)

## 8. 공용 코드에 걸려 있는 항목 (이 팩 밖에서 고친다)

- [ ] 도움말 «피처» 탭에 확장 와일드·더블업 규칙이 없음
- [ ] 첫 화면이 5-WILD 줄로 시작함(대기 그리드가 정지 위치 0)
- [ ] 더블업 모달 테마·효과음, 총성·확장음 레시피
- [ ] favicon 404, 로비 카드 영어 `lines`, `스탑` 표기
- [ ] 0코인 프리스핀 종료 팝업의 색종이
