# 에이전트 시스템 가이드

> `.claude/agents/` 멀티 에이전트 시스템 — v2.3.1 (29개 에이전트)

---

## 빠른 시작

```
단일 작업  → 그냥 말하기 ("DB 스키마 짜줘", "GitHub Actions 만들어줘")
멀티 팀   → /pt "구현할 기능 설명"
카드 생성  → /create-card 주제명 카테고리
대량 카드  → /card-batch 5개 psychology
에이전트 추가 → "새 에이전트 추가해줘"
```

---

## 전체 에이전트 목록

### 메인 에이전트

| 에이전트 | 역할 | 모델 |
|---------|------|------|
| `agent-manager` | 모든 요청 분석 → 적합한 서브 에이전트에 위임 | sonnet |

---

### 고난도 전문가 (Opus)

*복잡한 추론, 아키텍처 결정, 심층 분석에 사용됩니다.*

| 에이전트 | 역할 | 트리거 키워드 |
|---------|------|------------|
| `architect` | 시스템 구조 분석, 버그 진단, 요구사항 분석 | 아키텍처 분석, 버그 원인, 설계 검토 |
| `code-reviewer` | 코드 품질·보안·사양 준수 종합 리뷰 | 코드 리뷰, PR 리뷰, 품질 검사 |
| `security` | 보안 취약점 탐지, OWASP 감사 | 보안 취약점, 보안 검토, API 키 노출 |
| `planner` | 전략 기획, 마일스톤 계획 수립 | 계획 세워줘, 어떻게 개발할지 |
| `reasoner` | 복잡한 추론, 근본 원인, 트레이드오프 분석 | 근본 원인 분석, 깊게 분석해줘 |

---

### 핵심 개발 (Sonnet)

| 에이전트 | 역할 | 트리거 키워드 |
|---------|------|------------|
| `executor` | 코드 구현, 기능 추가, 버그 수정 | 구현해줘, 만들어줘, 고쳐줘 |
| `explorer` | 코드베이스 탐색, 파일·패턴 검색 | 어디에 있어, 찾아줘, 구조 설명 |
| `qa-tester` | 테스트 작성, TDD 가이드, QA 검증 | 테스트 작성, TDD, 커버리지 |
| `build-fixer` | 빌드 오류, 컴파일 에러, Gradle 문제 | 빌드 안 돼, 컴파일 에러, Gradle 오류 |
| `designer` | Jetpack Compose UI, 컴포넌트, 애니메이션 | UI 만들어, Compose 화면, 컴포넌트 |

---

### 전문 기술 (Sonnet)

| 에이전트 | 역할 | 트리거 키워드 |
|---------|------|------------|
| `devops` | GitHub Actions, Docker, CI/CD, 배포 | GitHub Actions, Docker, 배포 자동화 |
| `prompt-engineer` | LLM 프롬프트 설계·최적화·평가 | 프롬프트 개선, 시스템 프롬프트, Few-shot |
| `db-expert` | DB 스키마, SQL 최적화, Room 마이그레이션 | 스키마 설계, 쿼리 최적화, Room DB |
| `performance` | 성능 프로파일링, Compose recomposition, 메모리 누수 | 앱이 느려, 성능 분석, 메모리 누수 |
| `api-designer` | REST/GraphQL API 설계, OpenAPI 스펙 | API 설계, 엔드포인트, OpenAPI |
| `localizer` | i18n/l10n, strings.xml, 한국어 조사 처리 | 다국어 지원, 번역 파일, 현지화 |
| `git-historian` | Git 이력 분석, bisect, 회귀 추적 | 버그 언제 생겼는지, git blame, 이력 봐줘 |
| `cost-analyzer` | Claude API·Firebase·클라우드 비용 분석 | 비용 분석, Firebase 비용, API 비용 줄이기 |
| `accessibility` | a11y 감사, WCAG, TalkBack, Compose Semantics | 접근성 검사, WCAG, TalkBack |

---

### 리서치 & 데이터 (Sonnet)

| 에이전트 | 역할 | 트리거 키워드 |
|---------|------|------------|
| `researcher` | 공식 문서, API 레퍼런스, 라이브러리 조사 | 사용법 알아봐, 공식 문서, 조사해줘 |
| `data-scout` | 웹 크롤링, 논문 탐색, 시장 조사 | 웹 조사, 논문 찾아줘, 시장 조사 |
| `scientist` | 데이터 분석, 통계, 가설 검증 | 데이터 분석, 통계 분석, 지표 계산 |
| `vision` | 이미지·스크린샷·다이어그램 분석 | 스크린샷 분석, 이미지 분석, 다이어그램 |

---

### SnapWise 콘텐츠 파이프라인 (Sonnet/Haiku)

*shortform-blog MDX 카드 생산 전용 에이전트 체계*

| 에이전트 | 역할 | 트리거 키워드 |
|---------|------|------------|
| `card-scenario` | MDX 카드 시나리오 작성 — 허구 스토리 + 시네마틱 연출 | 카드 만들어, MDX 작성, 시나리오 작성 |
| `mdx-validator` | MDX 구조 검증 — 7가지 규칙 (R-01~R-07) [읽기 전용] | MDX 검증, 카드 검증, 유효성 검사 |
| `card-batch-runner` | 대량 카드 오케스트레이터 — 병렬 생성 + 일괄 검증 | 카드 대량 생성, 배치 생성, 여러 카드 |

**전용 스킬:**
- `/create-card {주제} {카테고리}` — 단일 카드 생성 파이프라인
- `/card-batch {N}개 {카테고리}` — 대량 배치 생성 파이프라인

---

### 시스템 관리 & 문서 (Sonnet/Haiku)

| 에이전트 | 역할 | 모델 |
|---------|------|------|
| `agent-architect` | 새로운 에이전트 설계 및 생성 | sonnet |
| `writer` | README, API 문서, 기술 가이드 작성 | haiku |

---

## 사용 방법

### 단일 에이전트 — 그냥 말하기

agent-manager가 자동으로 적합한 에이전트를 선택합니다.

```
"GitHub Actions Android CI/CD 만들어줘"
  → devops 에이전트 자동 선택

"이 버그가 언제 생겼는지 찾아줘"
  → git-historian 에이전트 자동 선택

"알림 기능 Compose UI 만들어줘"
  → designer 에이전트 자동 선택
```

### 멀티 에이전트 팀 — `/pt` 명령어

복잡한 기능을 여러 에이전트가 **동시에** 구현합니다.

```
/pt "지하철 즐겨찾기 기능 추가"
/pt "로그인·회원가입 전체 플로우 구현"
/pt "푸시 알림 시스템 설계부터 구현까지"
```

**내부 동작 (Consensus 모드 기준):**
```
1. 4인 동시 분석     → architect(아키텍처+종속성) + planner(전략) + qa-tester(시나리오)
                       ※ reasoner는 이 단계에서 실행 안 함 (컨텍스트 부족)
2. 합의 + 방어 로직  → 3개 결과 취합 → reasoner가 1회 호출로 합의 중재 + 방어 로직 확정
3. 프롬프트 최적화   → prompt-engineer: 방어 로직 포함 + 파일 영역 충돌 확인
4. 병렬 실행         → 최적화된 프롬프트로 독립 서브태스크 동시 진행
5. 의존성 처리       → planner 정의 의존성 체인 순서대로
6. 최종 검증         → code-reviewer + architect (실패 시 심각도별 재실행)
```

**복잡도 자동 판단:**
- Simple (파일 3개 이하, 단일 도메인) → 경량 모드 실행
- Consensus (파일 4개+, 다중 도메인, 아키텍처 결정) → 협의체 풀 모드

---

## 병렬 구현 예시

### 예시: `/pt "SubwayMate 알림 구독 기능 추가"`

```
Phase 0: Consensus 모드 판단 (다중 도메인, 파일 4개+)

Step 1 (동시 — 4인 분석)
  architect(opus)   → 아키텍처 분석 + 종속성 검사 통합
                      결과: Repository 패턴, 종속성 이슈 2건(HIGH)
  planner(opus)     → DB→Repo→UseCase→ViewModel 순서, 파일 영역 분배
  qa-tester(sonnet) → 7개 시나리오: FCM 만료(HIGH), 동시 쓰기 충돌(MED) 등

Step 2 (순차 — 3개 결과 취합 후)
  reasoner(opus) 1회 호출
  → 합의 중재 + FCM→AlarmWorker, 동시 쓰기→Mutex 방어 로직 확정

Step 3 (순차)
  prompt-engineer(sonnet)
  → 방어 로직 포함 + 파일 충돌 확인 → 4개 에이전트 최적화 프롬프트 (평균 87점)

Step 4 (동시 실행)
  ├── db-expert    담당: data/db/**
  │   Room AlarmEntity + AlarmDao 설계
  ├── designer     담당: ui/alarm/**
  │   AlarmSettingScreen Compose UI
  ├── devops       담당: .github/workflows/**
  │   FCM 연동 CI/CD 파이프라인
  └── qa-tester    담당: test/**
      AlarmRepository 단위 테스트

Step 5 (순차 — db-expert 완료 후)
  executor → AlarmRepository 구현 (DB 스키마 의존)

Step 6 (동시)
  code-reviewer(opus) → 전체 코드 리뷰
  architect(opus)     → 아키텍처 정합성 검증
  → 실패 시 심각도별 재실행 루프
```

---

## 토큰 최적화 (자동 적용)

모든 에이전트에 공통 규칙이 자동으로 주입됩니다:

| 규칙 | 내용 |
|------|------|
| 파일 읽기 최소화 | Grep으로 위치 먼저 파악 → 필요 섹션만 Read |
| 재독 금지 | 이미 읽은 파일 다시 읽지 않음 |
| 출력 압축 | 코드 완성본 + 판단 근거 2-3줄 |
| 모델 적정 선택 | 단순 작업 haiku / 표준 sonnet / 복잡 추론 opus |
| 담당 파일 제한 | 지정된 파일 영역 외 수정 금지 |

---

## 새 에이전트 추가

```
"새 에이전트 추가해줘: {역할 설명}"
```

agent-manager → agent-architect → 파일 생성 + _registry.json 자동 업데이트

---

## 파일 구조

```
.claude/
├── agents/
│   ├── _STANDARDS.md         규격 정의 (토큰 최적화 규칙 포함)
│   ├── _registry.json        에이전트 레지스트리 v2.3.1 (29개)
│   ├── agent-manager.md      중앙 오케스트레이터
│   ├── card-scenario.md      SnapWise MDX 카드 시나리오 작성
│   ├── mdx-validator.md      MDX 구조 검증 (R-01~R-07)
│   ├── card-batch-runner.md  대량 카드 생산 오케스트레이터
│   └── *.md                  서브 에이전트 (25개)
├── commands/
│   ├── pt.md                 /pt 명령어 (멀티 에이전트 팀)
│   ├── create-card.md        /create-card 명령어 (단일 카드 생성)
│   └── card-batch.md         /card-batch 명령어 (대량 배치 생성)
└── AGENTS_GUIDE.md           이 문서
```
