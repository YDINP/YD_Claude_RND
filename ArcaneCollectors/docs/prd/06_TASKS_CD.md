# 5-2. TASK 상세: Team C (데이터 & 백엔드) + Team D (통합 QA)
> 원본: PRD_Unified_v5.md §5 (lines 883-1037)

### TEAM C TASK (데이터 & 백엔드) - 상세

#### C-1: data/index.js Element→Mood 전면 마이그레이션 (v5.2 업데이트) `[DONE]`
**서브 태스크**:
- C-1.1: `getCharactersByElement()` → `getCharactersByMood()` 교체
- C-1.2: `getCharactersByCult()` 신규 추가
- C-1.3: `getElementAdvantages()` → `getMoodMatchups()` 교체
- C-1.4: `calculateElementMultiplier()` → `calculateMoodMultiplier()` 교체
- C-1.5: 레거시 Element/Personality 함수 완전 삭제 (v5.2: deprecated 대신 삭제)
- C-1.6: 모든 import처에서 새 함수명 사용 확인
- C-1.7: default export 객체 업데이트

#### C-2: GachaScene ↔ GachaSystem 완전 교체 `[DONE]`
**유저 상호작용 체인**:
```
소환 버튼 터치 → 보석 확인 → GachaSystem.pull() 호출 →
characters.json에서 실제 캐릭터 데이터 반환 →
소환 연출 → 캐릭터 카드 표시 → SaveManager 저장
```
**서브 태스크**:
- C-2.1: GachaScene.rollGacha() **완전 삭제**
- C-2.2: GachaScene.performSummon()에서 GachaSystem.pull() 호출
- C-2.3: GachaSystem.RATES를 PRD 확률로 수정 (N:60%, R:30%, SR:8.5%, SSR:1.5%)
- C-2.4: pull() 결과가 characters.json 실제 캐릭터 반환하도록 수정
- C-2.5: 중복 캐릭터 → 조각(fragment) 변환 로직 연결
- C-2.6: data/index.js의 getSummonRates() PRD 일치화
- C-2.7: 10연차 SR 이상 1회 보장 로직 검증
- C-2.8: 배너 데이터(banners.json) 연결 → 픽업 확률 적용
- C-2.9: SaveManager에 `saveGachaInfo()` 메서드 추가 (GachaSystem:147에서 호출, 현재 미존재)
- C-2.10: 하드코딩 UI 텍스트 동적화: 천장 카운터(87/90→실제값), 소환권(5개→실제값), 확률 표시 일치
**확장 아이디어**: 소환 히스토리 UI (최근 100회 기록)

#### C-3: Supabase 마이그레이션 SQL 검증 및 적용 `[DONE]`
**유저 상호작용 체인**:
```
앱 실행 → Supabase 연결 → DB 스키마 검증 →
RLS 정책 적용 → 데이터 CRUD 정상 동작
```
**서브 태스크**:
- C-3.1: 7개 테이블(players, heroes, parties, inventory, gacha_history, stages, tower) 스키마 검증
- C-3.2: RLS(Row Level Security) 정책: 본인 데이터만 CRUD 가능
- C-3.3: 서버사이드 가챠 검증 function (확률 조작 방지)
- C-3.4: 마이그레이션 SQL 실행 순서 검증 (외래키 의존성)
- C-3.5: 인덱스 최적화 (자주 조회하는 컬럼)
**추론 체크리스트**:
- [ ] supabase/ 폴더 내 SQL 파일 실행 순서가 올바른가?
- [ ] RLS 정책이 누락된 테이블은 없는가?
- [ ] 가챠 결과를 서버에서 검증하는 RPC function이 있는가?

#### C-4: 하이브리드 저장 시스템 (Local + Supabase) `[DONE]`
**유저 상호작용 체인**:
```
온라인: 저장 → Supabase 우선 + localStorage 백업 →
오프라인: 저장 → localStorage 전용 →
재접속: 로컬↔서버 데이터 동기화 → 충돌 해결
```
**서브 태스크**:
- C-4.1: SaveManager에 온라인/오프라인 상태 감지 로직 추가
- C-4.2: 온라인 저장: Supabase → 성공 시 localStorage 백업
- C-4.3: 오프라인 폴백: localStorage 전용 모드
- C-4.4: 재접속 동기화: 서버 timestamp vs 로컬 timestamp 비교 → 최신 데이터 우선
- C-4.5: 충돌 해결 UI: "서버 데이터 / 로컬 데이터 중 선택" 팝업
**추론 체크리스트**:
- [ ] 네트워크 끊김 → 재연결 시 데이터 손실 없는가?
- [ ] 서버/로컬 데이터가 다를 때 어느 것을 우선하는가?
- [ ] 저장 실패 시 재시도 로직이 있는가?

#### C-5: 오프라인 보상 시스템 검증 `[DONE]`
**유저 상호작용 체인**:
```
앱 종료 → (오프라인 시간 경과) → 앱 재실행 →
BootScene에서 lastOnline 비교 → 보상 계산 →
"오프라인 보상" 팝업 (골드/경험치/장비파편) → "수령" 터치 → 재화 반영
```
**서브 태스크**:
- C-5.1: 최대 24시간 오프라인 보상 상한 검증
- C-5.2: 골드(100/h), 경험치(50/h), 장비 파편(5/h) 계산 정확도 ±5%
- C-5.3: 보상 팝업 UI에 시간/수량 정확히 표시
- C-5.4: VIP 보너스, 장비 효과에 의한 보상 배율 적용 (확장)
**추론 체크리스트**:
- [ ] lastOnline이 미래 시간일 때 (시간 조작) 방어 처리?
- [ ] 보상 계산 시 소수점 처리 (내림 vs 반올림)?

#### C-6: 쿠폰 시스템 UI 연결 `[DONE]`
**유저 상호작용 체인**:
```
설정/메뉴 → "쿠폰 입력" 터치 → 입력 모달 →
코드 입력 → CouponSystem.redeemCoupon() 호출 →
유효성 검사 → 보상 지급 → 토스트 알림
```
**서브 태스크**:
- C-6.1: 설정 화면(또는 메뉴)에 "쿠폰 입력" 버튼 추가
- C-6.2: 쿠폰 입력 모달 UI (텍스트 입력 + 확인 버튼)
- C-6.3: CouponSystem.redeemCoupon() 연결 → 결과 표시
- C-6.4: 사용 완료 쿠폰 재사용 방지 안내
**확장 아이디어**: 쿠폰 히스토리 목록 (사용한 쿠폰/보상 목록)

#### C-7: DebugManager 통합 (TEAM G 협업) `[DONE]`
**서브 태스크**:
- C-7.1: 개발 모드에서만 활성화 (`import.meta.env.DEV` 체크)
- C-7.2: 프로덕션 빌드에서 DebugManager 코드 tree-shaking 제거
- C-7.3: `window.debug` 글로벌 등록은 개발 환경만
- C-7.4: Vite 빌드 플래그로 디버그 코드 조건부 포함

---

### TEAM D TASK (통합 QA & 최적화) - 상세

#### D-1: 전체 Scene 전환 흐름 테스트 `[DONE]`
**유저 상호작용 체인**:
```
Boot → Login → Preload → MainMenu → 각 하위 Scene →
뒤로가기 → MainMenu → 다른 Scene → 반복
```
**서브 태스크**:
- D-1.1: Boot → Login → Preload → MainMenu 흐름 정상 동작
- D-1.2: MainMenu → 모험/소환/영웅/상점/탑/퀘스트 각 Scene 진입/복귀
- D-1.3: Scene 전환 시 메모리 누수 확인 (Chrome DevTools Memory)
- D-1.4: 뒤로가기 동작 일관성 (모든 Scene에서 MainMenu로 복귀)
- D-1.5: 빠른 Scene 전환 연타 시 에러 없는지 확인
**추론 체크리스트**:
- [ ] 신규 Scene(Tower, Login, Quest) 등록 후 전환 문제?
- [ ] Scene shutdown()에서 리스너/타이머 정리 완전한가?

#### D-2: 전투 E2E 테스트 `[DONE]`
**유저 상호작용 체인**:
```
모험 → 스테이지 선택 → 에너지 확인 → 파티 편성 →
전투 시작 → 자동/수동 전투 → 승리/패배 →
보상 지급 → 별점 계산 → 저장 → 스테이지 복귀
```
**서브 태스크**:
- D-2.1: 5챕터 × 5스테이지 순차 클리어 가능 확인
- D-2.2: 에너지 차감 정확도 (스테이지별 비용 일치)
- D-2.3: 승리 시: 골드/EXP/아이템 정상 지급
- D-2.4: 패배 시: 결과 화면 표시, 재도전 옵션 동작
- D-2.5: 자동전투 + 수동전투 모두에서 완주 가능
- D-2.6: 배속(1x/2x/3x) 전환 시 전투 정상 진행
- D-2.7: 시너지 버프가 실제 데미지에 반영되는지 수치 검증

#### D-3: 가챠 확률 시뮬레이션 검증 `[DONE]`
**서브 태스크**:
- D-3.1: 10,000회 소환 시뮬레이션 실행
- D-3.2: 등급 분포 검증: N:60%±2%, R:30%±2%, SR:8.5%±1%, SSR:1.5%±0.5%
- D-3.3: 천장(90회) 정확 동작: 90회째 SSR 100% 확인
- D-3.4: 소프트 피티(70회~) 확률 증가 검증
- D-3.5: 10연차 SR 이상 1회 보장 검증
- D-3.6: 픽업 배너 확률 UP (SSR 중 50% 픽업 대상) 검증
**확장 아이디어**: 가챠 시뮬레이터 페이지 (유저가 직접 확률 테스트)

#### D-4: Vite 빌드 최적화 `[DONE]`
**서브 태스크**:
- D-4.1: 번들 사이즈 분석 (rollup-plugin-visualizer)
- D-4.2: 코드 스플리팅: Scene별 lazy load (dynamic import)
- D-4.3: 에셋 최적화: 이미지 압축, WebP 변환
- D-4.4: 초기 로딩 시간 3초 이내 달성
- D-4.5: tree-shaking 확인: 미사용 코드 제거
- D-4.6: gzip 압축 후 번들 < 2MB 확인

#### D-5: 크로스 브라우저 & 모바일 테스트 `[TODO]`
**서브 태스크**:
- D-5.1: Chrome/Safari/Firefox 동작 확인
- D-5.2: 모바일 터치 입력 정상 동작 (iOS Safari, Android Chrome)
- D-5.3: 720×1280 해상도 피팅 확인 (다양한 비율)
- D-5.4: WebGL 미지원 브라우저 폴백 처리
- D-5.5: PWA manifest 및 서비스 워커 설정 (선택)

---
