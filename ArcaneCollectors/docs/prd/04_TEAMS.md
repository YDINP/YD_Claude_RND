# 4. 개발팀 구성 (8팀)
> 원본: PRD_Unified_v5.md §4

## 4. 개발팀 구성 (8팀, 확충 에이전트)

### TEAM A: 전투 통합팀 (Battle Integration)

| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `architect` | opus | 전투 로직 설계 검증, 통합 아키텍처 리뷰 |
| 분석가 | `explore-high` | opus | 전투 관련 심층 코드 탐색 |
| 전략가 | `analyst` | opus | 전투 밸런스 분석, 에지 케이스 추론 |
| 수석 개발자 | `executor-high` | opus | 복잡한 시스템 연결 구현 |
| 개발자 | `executor` | sonnet | 일반 시스템 연결 코드 구현 |
| 개발자 (보조) | `executor-low` | haiku | import/export 수정, 단순 래핑 |
| 데이터 과학 | `scientist` | sonnet | 데미지 공식 시뮬레이션, 밸런스 검증 |
| QA | `qa-tester` | sonnet | 전투 시나리오 테스트 |
| 빌드 | `build-fixer` | sonnet | 통합 빌드 오류 수정 |
| 코드 리뷰 | `code-reviewer-low` | haiku | PR 전 코드 일관성 체크 |

### TEAM B: 신규 씬 & UI팀 (New Scenes & UI)

| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `designer-high` | opus | UI/UX 설계 검증, 씬 구조 리뷰 |
| 아키텍트 | `architect-medium` | sonnet | Scene 아키텍처 설계 |
| 탐색가 | `explore-medium` | sonnet | 기존 Scene 패턴 분석 |
| 수석 개발자 | `executor-high` | opus | 복잡한 Scene 구현 |
| 개발자 | `executor` | sonnet | Scene 코드 구현 |
| 개발자 (보조) | `executor-low` | haiku | 컴포넌트 연결, 단순 UI |
| UI 설계 | `designer` | sonnet | 컴포넌트 스타일링 |
| QA | `qa-tester` | sonnet | 화면 전환/터치 테스트 |
| 빌드 | `build-fixer-low` | haiku | Scene 등록/import 오류 수정 |

### TEAM C: 데이터 & 백엔드팀 (Data & Backend)

| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `architect` | opus | 데이터 아키텍처 설계, API 설계 검증 |
| 분석가 | `explore-high` | opus | 데이터 불일치 심층 탐색 |
| 수석 개발자 | `executor-high` | opus | 복잡한 마이그레이션 구현 |
| 개발자 | `executor` | sonnet | 데이터 마이그레이션, API 구현 |
| 개발자 (보조) | `executor-low` | haiku | JSON 데이터 입력 |
| 보안 | `security-reviewer` | opus | Supabase RLS 정책, 데이터 무결성 검증 |
| 보안 (경량) | `security-reviewer-low` | haiku | 입력 검증, XSS 방지 |
| 연구원 | `researcher` | sonnet | 가챠 확률/밸런스 리서치 |
| QA | `qa-tester` | sonnet | 데이터 정합성 테스트 |

### TEAM D: 통합 QA & 최적화 (Integration QA)

| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `qa-tester-high` | opus | QA 전략 수립, 최종 품질 검증 |
| 탐색가 | `explore-high` | opus | 전체 코드베이스 크로스 레퍼런스 |
| 아키텍트 | `architect` | opus | 성능 병목 분석, 아키텍처 검토 |
| 테스터 | `qa-tester` | sonnet | 기능별 테스트 실행 |
| 빌드 | `build-fixer` | sonnet | 빌드 오류 수정, 번들 최적화 |
| 보안 | `security-reviewer-low` | haiku | 보안 취약점 스캔 |
| 코드 리뷰 | `code-reviewer` | opus | 전체 코드 품질 감사 |
| 코드 리뷰 (경량) | `code-reviewer-low` | haiku | 스타일/패턴 일관성 체크 |

### TEAM E: 캐릭터 데이터 설계팀 (Character Data Design)

| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `architect` | opus | 데이터 아키텍처 & 밸런스 총괄 검증 |
| 전략가 | `analyst` | opus | 기존 캐릭터 데이터 분석, 밸런스 평가 |
| 연구원 | `researcher` | sonnet | 레퍼런스 게임 밸런스 조사 |
| 수석 개발자 | `executor-high` | opus | 복잡한 데이터 스키마 설계 |
| 개발자 | `executor` | sonnet | JSON 데이터 파일 작성 |
| 개발자 (보조) | `executor-low` | haiku | 반복적 데이터 입력 |
| 데이터 과학 | `scientist-high` | opus | 스탯 분포 분석, 밸런스 시뮬레이션 |
| 데이터 과학 (경량) | `scientist` | sonnet | 빠른 수치 검증 |
| 문서 | `writer` | haiku | 캐릭터 설명/배경 스토리 작성 |

### TEAM F: 씬/패널 로직 검증 분석 및 개발팀

| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `architect` | opus | 전체 씬 아키텍처 검증, 데이터 흐름 감사 |
| 탐색가 | `explore-high` | opus | 심층 코드 탐색, 참조 추적 |
| 전략가 | `analyst` | opus | 로직 정합성 분석, 에지 케이스 발견 |
| 수석 개발자 | `executor-high` | opus | 복잡한 상호작용 로직 수정 |
| 개발자 | `executor` | sonnet | 발견된 버그/불일치 수정 |
| 개발자 (보조) | `executor-low` | haiku | 단순 연결/수정 |
| 코드 리뷰 | `code-reviewer` | opus | 코드 품질, 패턴 일관성 검증 |
| 빌드 | `build-fixer` | sonnet | 수정 후 빌드 오류 수정 |
| QA | `qa-tester` | sonnet | 수정 후 회귀 테스트 |
| 보안 (경량) | `security-reviewer-low` | haiku | 입력 검증, 경계 조건 |

### TEAM G: 치트 API 개발팀 (Cheat API)

| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `architect` | opus | 치트 API 아키텍처 설계, 보안 검증 |
| 분석가 | `explore-medium` | sonnet | 기존 DebugManager/시스템 API 분석 |
| 수석 개발자 | `executor-high` | opus | 복잡한 치트 로직 (시간 조작, 시뮬레이션) |
| 개발자 | `executor` | sonnet | 치트 API 구현 |
| 개발자 (보조) | `executor-low` | haiku | 래퍼 함수, 치트코드 등록 |
| 보안 | `security-reviewer` | opus | 프로덕션 노출 방지 검증 |
| QA | `qa-tester` | sonnet | 치트 기능 테스트 |
| 코드 리뷰 (경량) | `code-reviewer-low` | haiku | 코드 일관성 체크 |

### TEAM H: 디자인 & 에셋팀 (Design & Asset)

| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `designer-high` | opus | 비주얼 아트 디렉션, 디자인 시스템 총괄 |
| UI 설계 | `designer` | sonnet | UI 컴포넌트 스타일링, 레이아웃 |
| UI 설계 (경량) | `designer-low` | haiku | 단순 스타일 적용 |
| 비전 분석 | `vision` | sonnet | 레퍼런스 이미지 분석, 비주얼 검증 |
| 연구원 | `researcher` | sonnet | 에셋 소스 탐색, AI 이미지 생성 프롬프트 |
| 수석 개발자 | `executor-high` | opus | 복잡한 애니메이션/파티클 구현 |
| 개발자 | `executor` | sonnet | CSS/Phaser 스타일, 애니메이션 코드 |
| 문서 | `writer` | haiku | UI 카피라이팅, 가이드 문서 |
| QA | `qa-tester` | sonnet | 비주얼 일관성 테스트 |

---
