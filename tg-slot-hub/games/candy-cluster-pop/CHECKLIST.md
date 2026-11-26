# candy-cluster-pop 체크리스트

계획 `docs/PLAN_candy-cluster-pop.md` §8-4 게이트를 따른다.

- [x] D0 계약: math.json v0 스키마 통과, manifest `status: hidden`, `pnpm pack:check` 0 error
- [x] G1 엔진: 클러스터·연쇄·주문 카드, 기존 live 6팩 골든 불변 (candy는 골든 대상이 아니라 `cascade.test.ts` 실제 팩 RNG 계약 테스트로 덮는다)
- [x] G2 API: carry 저장·재전송·공개 (`apps/api` `cascadeDebug.test.ts` 종단)
- [x] G3 렌더러: 연쇄 연출·STOP 압축·`finalGrid` 등식
- [x] G4 수학: RTP 94.56% 감사(4샤드, 게이트 14/14), 주문 완료율 리포트 — `docs/RTP_AUDIT_candy-cluster-pop.md` (2026-11-26 검수 수정 뒤 재감사)
- [x] G5 아트: prompts.json 확정, 심볼 10·frame·bg 2·thumb·시트, 전환 클립 2편, `pack:check` 0/0
- [x] G6 통합: 기능별 QA(§8-5) — `docs/QA_LOG.md` 2026-11-11, 검수 `docs/review/candy-cluster-pop.md`
- [x] `status: live`, QA_LOG

## 검수 뒤 남은 것 (2026-11-26)

- [x] 심볼 색 겹침(F2): 초록 구슬 민트·청록(젤리빈과 평균색 거리 19→124), 하트 마젠타(빨간 물방울과 37→56) + 하트 승리 시트·글로우 색 `#e03a9b` (아트 검수 2026-11-26)
- [x] 프레임 재생성(F5): 창 높이 74.5→76.3%, 셀 59.5px(390)/65.6px(430). 상단 띠 12%는 지시(5%)를 또 못 지켰지만 모양이 더 낫고 한 단계 커져 채택
- [x] 전환 클립(F13): 진입·복귀 둘 다 재발주해 교체. 복귀는 끝 장면이 기본 배경 톤의 캔디 랜드(`docs/TRANSITION_DESIGN.md` §2-7 «2차 재발주»)
- [ ] 로비 썸네일(`thumb.webp`)은 옛 딸기색 하트·라임 구슬 그림이라 게임 안 색과 조금 다르다(선택, 재생성 때 prompts.json의 하트·구슬 문장을 따라 바꿀 것)
- [ ] 평균 연쇄 1.6은 엔진 리필 규칙을 바꿔야 닿는다(README «계획과 다른 점»)
