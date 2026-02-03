# Arcane Collectors Backend - TASKS

## 개요
- **총 태스크**: 32개
- **예상 기간**: 8일
- **기술 스택**: Supabase (PostgreSQL, Auth, Edge Functions)

---

## Phase 1: 프로젝트 설정 (Day 1)

### Task 1.1: Supabase 프로젝트 생성
- **상태**: `pending`
- **우선순위**: Critical
- **설명**: Supabase 프로젝트 생성 및 초기 설정
- **작업 내용**:
  - [ ] Supabase 계정 생성/로그인
  - [ ] 새 프로젝트 생성 (Region: Northeast Asia)
  - [ ] API Keys 확인 (anon, service_role)
  - [ ] 프로젝트 URL 기록
- **산출물**: Supabase 프로젝트 URL, API Keys

### Task 1.2: 백엔드 프로젝트 초기화
- **상태**: `pending`
- **우선순위**: Critical
- **의존성**: Task 1.1
- **설명**: 로컬 개발 환경 설정
- **작업 내용**:
  - [ ] `ArcaneCollectors/backend/` 폴더 생성
  - [ ] `supabase init` 실행
  - [ ] `.env` 파일 생성 (SUPABASE_URL, SUPABASE_ANON_KEY)
  - [ ] `supabase link` 로 프로젝트 연결
- **산출물**: backend/ 폴더 구조

### Task 1.3: 데이터베이스 스키마 생성
- **상태**: `pending`
- **우선순위**: Critical
- **의존성**: Task 1.2
- **설명**: 모든 테이블 및 인덱스 생성
- **작업 내용**:
  - [ ] `users` 테이블 생성
  - [ ] `player_data` 테이블 생성
  - [ ] `characters` 테이블 생성
  - [ ] `stage_progress` 테이블 생성
  - [ ] `inventory` 테이블 생성
  - [ ] `gacha_history` 테이블 생성
  - [ ] `activity_log` 테이블 생성
  - [ ] 필요한 인덱스 생성
- **산출물**: `supabase/migrations/001_initial_schema.sql`

### Task 1.4: Row Level Security (RLS) 설정
- **상태**: `pending`
- **우선순위**: High
- **의존성**: Task 1.3
- **설명**: 데이터 보안 정책 설정
- **작업 내용**:
  - [ ] 모든 테이블에 RLS 활성화
  - [ ] SELECT 정책 (자신의 데이터만)
  - [ ] INSERT 정책 (자신의 데이터만)
  - [ ] UPDATE 정책 (자신의 데이터만)
  - [ ] DELETE 정책 (관리자만 또는 비활성화)
- **산출물**: `supabase/migrations/002_rls_policies.sql`

---

## Phase 2: 인증 시스템 (Day 2)

### Task 2.1: Supabase Auth 설정
- **상태**: `pending`
- **우선순위**: Critical
- **설명**: 인증 프로바이더 설정
- **작업 내용**:
  - [ ] Email/Password 인증 활성화
  - [ ] 이메일 템플릿 커스터마이징 (한국어)
  - [ ] 리다이렉트 URL 설정
- **산출물**: Auth 설정 완료

### Task 2.2: 소셜 로그인 설정
- **상태**: `pending`
- **우선순위**: Medium
- **의존성**: Task 2.1
- **설명**: Google, Discord OAuth 연동
- **작업 내용**:
  - [ ] Google Cloud Console에서 OAuth 클라이언트 생성
  - [ ] Discord Developer Portal에서 앱 생성
  - [ ] Supabase에 프로바이더 설정
  - [ ] 콜백 URL 설정
- **산출물**: OAuth 프로바이더 연동

### Task 2.3: 게스트 로그인 구현
- **상태**: `pending`
- **우선순위**: High
- **의존성**: Task 2.1
- **설명**: 익명 게스트 로그인 기능
- **작업 내용**:
  - [ ] Supabase Anonymous Sign-in 활성화
  - [ ] 게스트 유저 자동 생성 로직
  - [ ] 게스트 → 정식 계정 연동 로직
- **산출물**: 게스트 로그인 기능

### Task 2.4: 인증 트리거 함수
- **상태**: `pending`
- **우선순위**: High
- **의존성**: Task 1.3, Task 2.1
- **설명**: 신규 유저 생성 시 초기 데이터 설정
- **작업 내용**:
  - [ ] `handle_new_user()` 함수 생성
  - [ ] auth.users INSERT 트리거 설정
  - [ ] 초기 player_data 레코드 생성
  - [ ] 스타터 캐릭터 지급
- **산출물**: `supabase/migrations/003_auth_triggers.sql`

---

## Phase 3: 플레이어 데이터 API (Day 3)

### Task 3.1: 플레이어 데이터 조회 API
- **상태**: `pending`
- **우선순위**: Critical
- **의존성**: Task 1.3
- **설명**: 전체 플레이어 데이터 로드
- **작업 내용**:
  - [ ] GET `/api/player` 엔드포인트
  - [ ] player_data + characters + stage_progress 조인
  - [ ] 응답 포맷 정의
- **산출물**: `supabase/functions/get-player/index.ts`

### Task 3.2: 플레이어 데이터 저장 API
- **상태**: `pending`
- **우선순위**: Critical
- **의존성**: Task 3.1
- **설명**: 플레이어 데이터 upsert
- **작업 내용**:
  - [ ] PUT `/api/player` 엔드포인트
  - [ ] 데이터 검증 로직
  - [ ] upsert 처리
  - [ ] last_online 자동 업데이트
- **산출물**: `supabase/functions/save-player/index.ts`

### Task 3.3: 리소스 업데이트 API
- **상태**: `pending`
- **우선순위**: High
- **의존성**: Task 3.2
- **설명**: 골드/젬 등 리소스만 업데이트
- **작업 내용**:
  - [ ] PATCH `/api/player/resources` 엔드포인트
  - [ ] 증감 연산 지원 (`{ gold: "+100" }`)
  - [ ] 음수 방지 검증
- **산출물**: `supabase/functions/update-resources/index.ts`

### Task 3.4: 오프라인 보상 API
- **상태**: `pending`
- **우선순위**: High
- **의존성**: Task 3.1
- **설명**: 오프라인 보상 계산 및 수령
- **작업 내용**:
  - [ ] GET `/api/player/offline-rewards` - 보상 계산
  - [ ] POST `/api/player/claim-offline` - 보상 수령
  - [ ] 최대 24시간 제한
  - [ ] 플레이어 레벨 기반 보상 스케일링
- **산출물**: `supabase/functions/offline-rewards/index.ts`

---

## Phase 4: 가챠 시스템 (Day 4)

### Task 4.1: 가챠 확률 설정
- **상태**: `pending`
- **우선순위**: Critical
- **설명**: 서버사이드 가챠 확률 테이블
- **작업 내용**:
  - [ ] 등급별 확률 정의 (N:60%, R:30%, SR:8.5%, SSR:1.5%)
  - [ ] 천장 시스템 (90뽑 SSR 확정)
  - [ ] 픽업 배너 확률 (SSR 중 50%)
- **산출물**: `supabase/functions/_shared/gacha-rates.ts`

### Task 4.2: 단일 뽑기 API
- **상태**: `pending`
- **우선순위**: Critical
- **의존성**: Task 4.1
- **설명**: 1회 뽑기 처리
- **작업 내용**:
  - [ ] POST `/api/gacha/pull` 엔드포인트
  - [ ] 젬 300개 차감 검증
  - [ ] 서버사이드 확률 계산
  - [ ] 캐릭터 추가 (중복 시 조각 변환)
  - [ ] 천장 카운터 업데이트
- **산출물**: `supabase/functions/gacha-pull/index.ts`

### Task 4.3: 10연차 API
- **상태**: `pending`
- **우선순위**: Critical
- **의존성**: Task 4.2
- **설명**: 10회 연속 뽑기
- **작업 내용**:
  - [ ] POST `/api/gacha/pull10` 엔드포인트
  - [ ] 젬 2700개 차감 (10% 할인)
  - [ ] SR+ 1개 이상 보장 로직
  - [ ] 배치 처리 최적화
- **산출물**: `supabase/functions/gacha-pull10/index.ts`

### Task 4.4: 가챠 기록 API
- **상태**: `pending`
- **우선순위**: Medium
- **의존성**: Task 4.2
- **설명**: 뽑기 히스토리 조회
- **작업 내용**:
  - [ ] GET `/api/gacha/history` 엔드포인트
  - [ ] 페이지네이션 지원
  - [ ] 필터링 (배너, 등급)
- **산출물**: `supabase/functions/gacha-history/index.ts`

### Task 4.5: 가챠 정보 API
- **상태**: `pending`
- **우선순위**: Medium
- **설명**: 현재 배너 및 확률 정보
- **작업 내용**:
  - [ ] GET `/api/gacha/info` 엔드포인트
  - [ ] 현재 천장 카운터
  - [ ] 배너 정보 (픽업 캐릭터, 기간)
  - [ ] 확률표 반환
- **산출물**: `supabase/functions/gacha-info/index.ts`

---

## Phase 5: 스테이지/전투 시스템 (Day 5)

### Task 5.1: 스테이지 진행도 API
- **상태**: `pending`
- **우선순위**: High
- **설명**: 스테이지 클리어 현황 조회
- **작업 내용**:
  - [ ] GET `/api/stages/progress` 엔드포인트
  - [ ] 챕터별 그룹핑
  - [ ] 총 별 개수 계산
- **산출물**: `supabase/functions/stage-progress/index.ts`

### Task 5.2: 전투 시작 API
- **상태**: `pending`
- **우선순위**: High
- **설명**: 전투 시작 시 에너지 차감
- **작업 내용**:
  - [ ] POST `/api/stages/:stageId/start` 엔드포인트
  - [ ] 에너지 확인 및 차감
  - [ ] 전투 세션 토큰 발급 (치팅 방지)
- **산출물**: `supabase/functions/battle-start/index.ts`

### Task 5.3: 전투 완료 API
- **상태**: `pending`
- **우선순위**: High
- **의존성**: Task 5.2
- **설명**: 전투 결과 처리 및 보상 지급
- **작업 내용**:
  - [ ] POST `/api/stages/:stageId/complete` 엔드포인트
  - [ ] 세션 토큰 검증
  - [ ] 결과 검증 (비정상 클리어 시간 체크)
  - [ ] 보상 지급 (골드, 경험치)
  - [ ] 별 기록 업데이트
- **산출물**: `supabase/functions/battle-complete/index.ts`

### Task 5.4: 에너지 자동 회복
- **상태**: `pending`
- **우선순위**: Medium
- **설명**: 시간 기반 에너지 회복 계산
- **작업 내용**:
  - [ ] 에너지 회복 로직 (5분당 1)
  - [ ] 최대 에너지 제한
  - [ ] 클라이언트/서버 동기화
- **산출물**: `supabase/functions/_shared/energy-system.ts`

---

## Phase 6: 클라이언트 통합 (Day 6-7)

### Task 6.1: Supabase 클라이언트 설치
- **상태**: `pending`
- **우선순위**: Critical
- **설명**: 프론트엔드에 Supabase SDK 추가
- **작업 내용**:
  - [ ] `npm install @supabase/supabase-js`
  - [ ] Supabase 클라이언트 초기화
  - [ ] 환경변수 설정
- **산출물**: `src/config/supabase.js`

### Task 6.2: AuthManager 구현
- **상태**: `pending`
- **우선순위**: Critical
- **의존성**: Task 6.1
- **설명**: 인증 관리 클래스
- **작업 내용**:
  - [ ] 로그인/로그아웃 메서드
  - [ ] 게스트 로그인 메서드
  - [ ] 소셜 로그인 메서드
  - [ ] 세션 상태 관리
  - [ ] 토큰 자동 갱신
- **산출물**: `src/systems/AuthManager.js`

### Task 6.3: HybridSaveManager 구현
- **상태**: `pending`
- **우선순위**: Critical
- **의존성**: Task 6.1, Task 6.2
- **설명**: 로컬+서버 하이브리드 저장 시스템
- **작업 내용**:
  - [ ] 기존 SaveManager 확장
  - [ ] 서버 동기화 (debounced)
  - [ ] 오프라인 모드 폴백
  - [ ] 충돌 해결 로직
- **산출물**: `src/systems/HybridSaveManager.js`

### Task 6.4: 로그인 씬 구현
- **상태**: `pending`
- **우선순위**: High
- **의존성**: Task 6.2
- **설명**: 로그인/회원가입 UI
- **작업 내용**:
  - [ ] LoginScene 생성
  - [ ] 게스트 로그인 버튼
  - [ ] 소셜 로그인 버튼 (Google, Discord)
  - [ ] 이메일 로그인 폼
  - [ ] 회원가입 폼
- **산출물**: `src/scenes/LoginScene.js`

### Task 6.5: 가챠 씬 서버 연동
- **상태**: `pending`
- **우선순위**: High
- **의존성**: Task 6.3
- **설명**: GachaScene을 서버 API와 연동
- **작업 내용**:
  - [ ] 로컬 가챠 로직 제거
  - [ ] 서버 API 호출로 대체
  - [ ] 로딩 상태 UI
  - [ ] 에러 처리
- **산출물**: `src/scenes/GachaScene.js` 수정

### Task 6.6: 전투 씬 서버 연동
- **상태**: `pending`
- **우선순위**: High
- **의존성**: Task 6.3
- **설명**: BattleScene을 서버 API와 연동
- **작업 내용**:
  - [ ] 전투 시작 시 서버 API 호출
  - [ ] 전투 완료 시 서버 API 호출
  - [ ] 에너지 실시간 표시
- **산출물**: `src/scenes/BattleScene.js` 수정

### Task 6.7: 데이터 마이그레이션 로직
- **상태**: `pending`
- **우선순위**: High
- **의존성**: Task 6.3
- **설명**: 기존 로컬 데이터 서버 이전
- **작업 내용**:
  - [ ] 최초 로그인 시 로컬 데이터 체크
  - [ ] 서버에 데이터 없으면 업로드
  - [ ] 마이그레이션 완료 플래그
- **산출물**: `src/systems/DataMigration.js`

---

## Phase 7: 테스트 및 배포 (Day 8)

### Task 7.1: API 테스트
- **상태**: `pending`
- **우선순위**: High
- **설명**: 모든 API 엔드포인트 테스트
- **작업 내용**:
  - [ ] 인증 API 테스트
  - [ ] 플레이어 데이터 API 테스트
  - [ ] 가챠 API 테스트
  - [ ] 스테이지 API 테스트
  - [ ] 엣지 케이스 테스트
- **산출물**: 테스트 결과 문서

### Task 7.2: 보안 테스트
- **상태**: `pending`
- **우선순위**: High
- **설명**: 보안 취약점 점검
- **작업 내용**:
  - [ ] RLS 정책 테스트 (타인 데이터 접근 시도)
  - [ ] 가챠 조작 시도 테스트
  - [ ] Rate limiting 테스트
  - [ ] SQL Injection 테스트
- **산출물**: 보안 점검 결과

### Task 7.3: 성능 테스트
- **상태**: `pending`
- **우선순위**: Medium
- **설명**: API 응답 시간 측정
- **작업 내용**:
  - [ ] 각 API 응답 시간 측정
  - [ ] 동시 접속 테스트 (10, 50, 100명)
  - [ ] 병목 구간 식별
- **산출물**: 성능 측정 결과

### Task 7.4: 프로덕션 배포
- **상태**: `pending`
- **우선순위**: Critical
- **의존성**: Task 7.1, Task 7.2
- **설명**: 프로덕션 환경 배포
- **작업 내용**:
  - [ ] Supabase 프로덕션 설정 확인
  - [ ] 환경변수 프로덕션 값 설정
  - [ ] Edge Functions 배포
  - [ ] 클라이언트 빌드 및 배포
- **산출물**: 프로덕션 URL

### Task 7.5: 모니터링 설정
- **상태**: `pending`
- **우선순위**: Medium
- **의존성**: Task 7.4
- **설명**: 운영 모니터링 설정
- **작업 내용**:
  - [ ] Supabase Dashboard 알림 설정
  - [ ] 에러 로깅 설정
  - [ ] 주요 지표 대시보드 구성
- **산출물**: 모니터링 대시보드

---

## 요약

| Phase | 태스크 수 | 상태 |
|-------|----------|------|
| Phase 1: 프로젝트 설정 | 4 | pending |
| Phase 2: 인증 시스템 | 4 | pending |
| Phase 3: 플레이어 데이터 API | 4 | pending |
| Phase 4: 가챠 시스템 | 5 | pending |
| Phase 5: 스테이지/전투 시스템 | 4 | pending |
| Phase 6: 클라이언트 통합 | 7 | pending |
| Phase 7: 테스트 및 배포 | 5 | pending |
| **Total** | **33** | - |

---

## 우선순위 범례

- **Critical**: 필수, 다른 작업의 선행 조건
- **High**: 핵심 기능, MVP에 필요
- **Medium**: 중요하지만 나중에 추가 가능
- **Low**: 있으면 좋은 기능
