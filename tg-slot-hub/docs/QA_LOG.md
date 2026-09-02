# QA 로그

기능 추가마다 파트별 검수·통합 검증·고도화 점검 결과를 기록한다. 절차는 `TELEGRAM_SLOT_HUB_PLAN.md` §12.

| 날짜 | 기능 | 파트별 검수 | 통합 검증 | 고도화(즉시/백로그) | 커밋 |
|---|---|---|---|---|---|
| 2026-09-02 | Phase 0~3, 아트, UX 1·2차, 경제 96%, 검수 GUI, Phase 5(fruit-fiesta) | architect 리뷰 각 Phase(반려 1회→수정) | 테스트 1,003개, 브라우저 e2e, audit 8/8·7/7 | 잭팟 시드 튜닝(반영), 사운드(백로그), 리더보드 익명화(백로그) | c5fdae6, a4321d2 |
| 2026-09-03 | UX 3차: 이펙트 당첨 경로·스킵·프레임 v2·프리스핀 배경 전환·베팅 리스트·페이지형 도움말·WinStrip·스프라이트 시트·설정 모달 | 렌더러 architect(반려→블로커5·should-fix5 수정→통과), hub architect(반려→블로커1·should-fix8 수정), API architect(승인, should-fix8 반영), theme-gen code-reviewer(반려→블로커1 수정) | typecheck 10/10, 테스트 1,381개, 브라우저 e2e(스킵 착지·메가윈 연출·베팅 시트·도움말 탭·프레임 v2·게임 전환) | 즉시: 명판 타이밍·등급별 훑기 속도·pulseArrive 이벤트·freeSpinsSummary·expiresAt·state jsonb. 백로그: 심볼 도착 틱 사운드, 라인 광채 방향성, 호 보간, 시트 드리프트 자동 QA, codex 외 프로바이더 병렬 생성 | 4959624 |
| 2026-09-03 | 5b 웨이브 1: royal-diamond-777(미스터리) · sheriff-sixgun(확장 와일드+갬블) · shiba-shrine(243웨이즈+랜덤 와일드) — 엔진 변이·웨이즈·해석식·MC, API 갬블 에스크로·freeSpinsCapped, 렌더러 변이/웨이즈 연출, hub 갬블 UI·웨이즈 도움말, 아트 3게임 42장 + 5릴 정사각 프레임 v3 | 엔진 architect(반려→7건 수정→재검수 APPROVED, should-fix 3 중 1 반영·2 백로그), hub architect(승인, 후속 닛 반영), API architect(승인), 감사 도구(두 단계 게이트 정렬, 방법 선택 오류 2건 자체 발견·수정) | typecheck 10/10, 테스트 1,614개, 정식 감사 5/5 PASS(shiba MC 25M 94.30%±0.17), 브라우저 e2e 3게임(로비→플레이 전환 0오류, 스핀 1.65s, 웨이즈 당첨·프리스핀 자동진행·더블업 모달/서버 판정) | 즉시: 웨이즈 당첨 `line:-1` 스키마 거부(블로커) 수정, 게임 직접 전환 stale-math 가드, 더블업 패배 후 WinStrip, 라인 라벨 로케일, 파싱 실패 시 state/me 재동기화, 5릴 프레임 가로형 창(셀 62→86px), shiba 도달불가 wild 배당 제거. 백로그: 와일드 접기 릴별 정밀화(+shiba 재튜닝), 와일드 1종 제한, 배경 cover 스케일, 프리스핀 카운터 가독성, Wave1 스프라이트 시트, CI 게이트 시간 | 4cab1c9 |
