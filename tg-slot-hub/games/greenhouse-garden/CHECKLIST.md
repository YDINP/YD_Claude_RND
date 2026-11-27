# greenhouse-garden 체크리스트

계획 `docs/PLAN_greenhouse-garden.md` §12 기능별 확인표와 「구현 계약」 C-1~C-7을 따른다.

- [x] D0 계약: math.json 스키마 통과(`growBoard` 선택 필드), manifest `hidden`으로 시작
- [x] G1 엔진: 클러스터·중력·성장·씨앗·햇살·최저 보장, `foldGarden === finalGrid`, 기존 live 팩 골든 해시 불변(`golden.test.ts`)
- [x] G2 API: carry.garden 저장·복원, 멱등 재전송 바이트 동일, 시드 공개 재생 일치, 정원 프리셋 409 규칙(`apps/api/src/routes/garden.test.ts`)
- [x] G3 렌더러: 카메라(활성 n×n이 창을 채움), 강조 → 팝 → 낙하 위치 트윈, 덮개 열림, 씨앗 배지, 햇살, STOP 압축, 스프라이트 풀 복귀
- [x] G4 수학: 정식 감사 5천만 스핀 · 4샤드 · 18/18 — `docs/RTP_AUDIT_greenhouse-garden.md` (2026-11-28 통합 QA에서 재감사)
- [x] G5 아트: 심볼 9 · frame(정사각 창) · bg 2 · pot · seed 5 · 승리 시트 2 · thumb, 전환 클립 2편(진입 덩굴 / 복귀 장미), `pack:check` 이 팩 오류는 «git 미추적»뿐(커밋하면 해소)
- [x] G6 사운드: 효과음·배경음 프리셋 `garden`, earshot 수치 `docs/SOUND_CHECK.md` (최종 귀 판정은 사용자 몫)
- [x] G7 통합: 기능별 QA 1회 — `docs/QA_LOG.md` 2026-11-28
- [x] `status: live`

## 남은 것

- [ ] 기대감(성장 직전 물뿌리개 2개 상태 지연)은 디버그 프리셋으로 만들 수 없어 단위 테스트로만 확인했다. 화면 확인은 실플레이 중 자연 발생 때
- [ ] 8×8 단계 9개짜리 최악 스핀은 normal 약 8.3초로 게이트(8.2초)를 조금 넘는다(단계 7개 약 8.0초). 필요하면 낙하 시간을 줄일 것
- [ ] 사운드 구별 목표(CLAP ≤ 0.90) 일부 미달: 효과음 winbig·feature vs deepsea 0.91, 배경음 base vs western 0.95 (SOUND_CHECK 기록)
- [ ] 텔레그램 iOS(WKWebView)에서 전환 클립 재생 확인
- [ ] 시트 나비는 몸통이 남색이라 심볼 나비와 몸통 색이 다르다(허용 범위로 판단)
