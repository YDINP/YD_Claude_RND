# volcano-forge 체크리스트

계획 `docs/PLAN_volcano-forge.md` §12 기능별 QA 확인표와 §16 구현 계약을 따른다.

- [x] D0 계약: math.json 스키마 통과(`anywhere`·`forgeRail`), manifest `status: hidden`으로 시작
- [x] G1 엔진: 위치 무관 지불(`anywhere.ts`)·화로 줄(`forge.ts`), RNG 소비 계약 고정, 기존 골든 해시 불변
- [x] G2 API: `forgeRail` 피처·`carry.forge` 이월·요약 3항목·프리셋 4종·다른 게임 409 (`apps/api/src/routes/volcanoForge.test.ts`)
- [x] G3 화면: 화로 줄(불씨 비행·가득·정산)·칸 빛 고리·도움말 4탭·종료 요약·로비 카드 라벨
- [x] G4 수학: 정식 감사 RTP 94.407% ±0.169%p, 게이트 18/18 — `docs/RTP_AUDIT_volcano-forge.md`
- [x] G5 아트: 심볼 10·frame·bg 2·thumb·props 3, 전환 클립 2편(`check:clips` 통과), forge 빅윈 스킨
- [x] G6 사운드: 효과음·배경음 프리셋 `forge`, earshot 수치 `docs/SOUND_CHECK.md` (최종 귀 판정은 사용자 몫)
- [x] G7 통합 QA(§12, 390·430 1회씩) — `docs/QA_LOG.md` 2026-11-27
- [x] `status: live`

## 통합 QA에서 고친 것 (2026-11-27)

- [x] 프리스핀 중 모루 칩이 «모루 n/4»(진입 조건)를 셌다 → 프리스핀 안에서는 추가 스핀 조건 «모루 n/3»을 센다(`GameScreen.tsx` `forgeAnvilNeed`)
- [x] 도움말 «연쇄와 불씨» 그림이 5칸만 터져 «8개 이상» 규칙과 어긋났다 → 같은 그림 8칸이 흩어져 터지고, 채움 칸에 그 그림을 섞지 않는다
- [x] 도움말 모루 지급표가 «4+ / 5+ / 6+»라 4개·5개 구간이 겹쳐 읽혔다 → «4 / 5 / 6+»
- [x] 도움말 조사 «최대 ×300예요» → «×300이에요»
- [x] (공용 테스트) `stageRoulette.test.ts` 2만 공연 테스트가 부하 때 기본 5초를 넘어 시간 초과 → 그 테스트만 30초

## 남은 것

- [ ] 사운드 최종 귀 판정(earshot이 합성 모루·풀무를 의도대로 읽지 못함, `docs/SOUND_CHECK.md` volcano-forge 절의 들어볼 파일)
- [ ] 체험판에서 프리스핀·라운드 중 새로고침은 디버그 프리셋이 없어 직접 보지 못했다(같은 탭 안 API 코드라 개발 스택·API 테스트로 갈음, 체험판 40스핀·잔액 새로고침 유지만 확인)
- [ ] 화로 가득 1회 이상 라운드 36.4%(기획 목표 60%). 올리려면 규칙 결정이 필요하다(README «튜닝 메모», PLAN C-7)
- [ ] 선택 아트: 승리 시트 3장(sword·hammer·anvil-win)은 만들지 않았다
