# idol-stage-live 체크리스트

계획 `docs/PLAN_idol-stage-live.md` §12 확인표와 `games/_template/HOWTO.md` §6 게이트를 따른다.

- [x] D0 계약: math.json 스키마 통과(무대 룰렛 `stageRoulette` 검사 포함), 초대권 원형 간격 50
- [x] G1 엔진: `stageRoulette.ts` 정산(회전 최대 7·척도 M 단조 감소), `isAnalytic` 차단, 골든 6팩 해시 불변 — slot-engine 351 통과
- [x] G2 API: 트리거 스핀 응답 하나에 정산, 재전송 바이트 동일, 시드 공개 재현, 룰렛 없는 팩 409 — api 303 통과(2차: hidden 케이스 명시·스키마 상한 비교)
- [x] G3 연출·화면: 3겹 판·응원봉 불빛·위로 줌·앙코르·대상·요약·빠르게 멈춤·건너뛰기·자동 회전·새로고침 이어 보기·도움말 — hub 638 통과
- [x] G4 수학: 정식 감사 4천만(시드 42, 4샤드) RTP 94.562% ±0.162%p, 게이트 15/15 — `docs/RTP_AUDIT_idol-stage-live.md`(통합 QA에서 재실행, 결과 동일)
- [x] G5 아트: 심볼 11·frame·bg 2·thumb·승리 시트 2·전환 클립 2(`check:clips` 통과), 컨택트 시트 눈 검수
- [x] G5b 사운드: `idol` 효과음·룰렛 소리·BGM, earshot 수치 `docs/SOUND_CHECK.md` (최종 귀 판정은 사용자)
- [x] G6 통합 QA: §12 기능별 1회(390·430 스크린샷), 체험판 자연 진입 1회, 메모리 스모크(스핀 50 + 룰렛 2, 텍스처·힙 평탄) — README «통합 QA»
- [x] `pnpm -r typecheck` 통과 · `pnpm -r --no-bail test` 기준선 2건 외 통과 · `build:demo` 통과
- [ ] `pnpm pack:check` 오류 0 — **커밋 때 팩 자산 전부 `git add` 필요**(지금 오류 21건은 전부 «git에 추적되지 않는다», 임시 인덱스 기준 오류 0·경고 1)
- [x] `status: live`, `docs/QA_LOG.md`, `docs/GAME_CATALOG.md` 반영
- [ ] 사용자 귀 판정 1회(효과음·배경음·퇴장 소리)
- [x] 통합 QA 2차(리뷰 반영): API hidden 테스트 수정·스키마 상한 비교 테스트, 룰렛 중 컨트롤 비활성, 서두름 빅윈, 6/9 밑줄, 합계 동기, 도움말 정확성, 안전망 — README «통합 QA 2차»
