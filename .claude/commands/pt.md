멀티 에이전트 팀을 구성하여 아래 작업을 병렬로 구현합니다.

**요청**: $ARGUMENTS

---

## 전역 규칙 1: Task 호출 형식

**모든 Task 호출 시 `description`은 반드시 `에이전트명: 작업내용` 형식으로 작성.**

```
✅ description: "architect: 시스템 아키텍처 분석"
✅ description: "qa-tester: 이슈 시나리오 도출"
✅ description: "executor: AlarmRepository 구현"
❌ description: "analyze system"   ← 에이전트명 누락 금지
```

이 규칙은 Simple/Consensus 모드 전 단계에 예외 없이 적용됩니다.

---

## 전역 규칙 2: 에이전트 실패 처리 (Retry Policy)

에이전트 Task 실패 시 아래 순서로 처리합니다.

```
1단계 재시도       → 동일 에이전트 최대 2회 재실행 (간격: 1초 → 2초)
2단계 폴백         → 2회 모두 실패 시 하위 모델로 교체 (opus → sonnet)
3단계 에스컬레이션  → 폴백도 실패 시 사용자에게 보고 후 해당 단계 건너뜀
```

**부분 실패 임계값**: 병렬 실행 에이전트 중 60% 이상 완료 시 다음 단계 진입 가능.
누락된 에이전트 항목은 다음 단계 에이전트가 추론으로 보완.

---

## Phase 0: 복잡도 판단 (자동)

아래 기준으로 실행 모드를 결정합니다.

| 모드 | 조건 |
|------|------|
| **Simple** | 수정 파일 3개 이하 / 단일 도메인 / 명확한 요구사항 |
| **Consensus** | 수정 파일 4개 이상 / 다중 도메인 / 아키텍처 결정 포함 / 의존성 3단계+ |

판단 불명확 → Consensus로 취급

---

## Phase 0.5: 전문 에이전트 자동 선택

요구사항 키워드 감지 시 해당 전문 에이전트를 워크플로우에 자동 추가합니다.

| 요구사항 키워드 | 추가 에이전트 | 추가 시점 |
|--------------|------------|---------|
| DB / 스키마 / 마이그레이션 / Room | `db-expert` | Step 4 병렬 |
| API / REST / GraphQL / 엔드포인트 | `api-designer` | Step 4 병렬 |
| CI/CD / Docker / 배포 / 파이프라인 | `devops` | Step 4 병렬 |
| 보안 / 인증 / 권한 / 암호화 | `security` | Step 1 동시 분석 |
| 성능 / 메모리 / 최적화 / 속도 | `performance` | Step 4 읽기 전용 |
| 번역 / 다국어 / i18n / strings | `localizer` | Step 4 병렬 |
| UI 변경 / Compose / 접근성 | `accessibility` | Step 4 읽기 전용 |

---

## Simple 모드

```
1. planner(sonnet) + qa-tester(sonnet)  → 동시 실행 (서로 독립적이므로 병렬화)
2. prompt-engineer(sonnet)              → 방어 로직 포함 프롬프트 최적화
                                           ※ qa-tester HIGH 시나리오 0건이면 스킵
3. 실행 에이전트 병렬 실행
4. code-reviewer(sonnet)                → 최종 검증
```

**Simple 모드 실패 처리:**
- Step 1 실패 → 재시도 2회 후 최소 1개 결과로 Step 2 진입
- Step 4 검증 HIGH → 해당 에이전트 수정 후 code-reviewer(sonnet) 재검증 (최대 2회)
- 2회 초과 → 사용자 에스컬레이션 (하단 보고 형식 참조)

---

## Consensus 모드

### Step 1: 4인 동시 분석

아래 Task를 **동시에** 호출합니다. 보안 키워드 감지 시 Task D 추가.
각각 `.claude/agents/{에이전트명}.md`를 읽어 시스템 프롬프트를 추출하여 주입합니다.

> **설계 원칙**: reasoner는 Step 1에서 실행하지 않습니다.
> **부분 실패 정책**: 3개 이상 완료 시 Step 2 진입. 2개 이하 완료 시 실패 Task 1회 재시도 후 진입.

**진행 출력:** `[Step 1/6] 동시 분석 중: architect | planner | qa-tester`

```
Task A — architect(opus)
  "아래 두 항목을 통합 분석해줘:

   [1. 아키텍처 분석]
   - 컴포넌트 의존성, 인터페이스 경계, 기술적 리스크

   [2. 종속성 검사]
   - 컴포넌트 간 의존성 방향 (단방향 원칙 위반 여부)
   - 순환 의존성(Circular Dependency) 발생 가능성
   - 레이어 경계 침범 (예: UI가 DB에 직접 접근)
   - 각 컴포넌트 변경 시 파급 범위 (변경 영향도 분석)
   - 외부 시스템(API, DB, FCM 등) 연결 지점의 추상화 수준

   출력: 아키텍처 구조 + 종속성 이슈 목록 (심각도 HIGH/MED/LOW + 권장 수정 방향)"

Task B — planner(opus)
  "실행 전략: 순서, 병렬 가능 항목, 의존성 체인은?
   각 단계의 담당 에이전트와 파일 영역 분리도 포함."

Task C — qa-tester(sonnet)
  "요구사항 기반으로 발생 가능한 이슈 시나리오를 도출해줘:

   [시나리오 카테고리]
   - 네트워크: 연결 실패, 타임아웃, 부분 응답, 재시도 폭발
   - 데이터: null/empty, 형식 불일치, 대용량, 중복 요청
   - 동시성: Race condition, 동시 쓰기 충돌, 상태 불일치
   - 외부 의존: API 서버 다운, FCM 토큰 만료, DB 잠금
   - 경계값: 최대/최소 입력, 빈 목록, 단일 항목
   - 사용자: 빠른 연속 탭, 앱 백그라운드 전환, 강제 종료

   각 시나리오 출력 형식:
   | 시나리오 | 발생 지점 | 발생 확률 | 심각도 | 방어 방향 |"

Task D — security(opus)  ← 보안 키워드 감지 시에만 추가
  "요구사항 기반 보안 리스크 분석:
   인증·인가 취약점, 데이터 노출, 입력 검증 누락 항목 도출."
```

### Step 2: 합의 도출 + 방어 로직 확정

**합의 규칙 (오케스트레이터가 직접 판단):**

```
3/3 일치    → 그대로 채택 (reasoner 호출 불필요)
2/3 일치    → 오케스트레이터가 다수안 채택 + 소수의견 메모 (reasoner 호출 불필요)
1/1/1 분산  → reasoner에게 전달 (아래 단계에서 판단)
A·B vs C    → qa-tester 시나리오 먼저 해결 후 재합의
```

> **비용 최적화**: reasoner(opus)는 1/1/1 완전 분산 케이스에만 호출.

**1/1/1 분산 시에만 `.claude/agents/reasoner.md`를 읽어 reasoner(opus) 1회 호출:**

```
architect 결과(아키텍처 + 종속성 이슈)
+ planner 결과(실행 전략 + 파일 영역)
+ qa-tester 결과(이슈 시나리오)
를 바탕으로:

1. 합의 충돌 해소 (reasoner 최종 결정)

2. 우선순위 결정: 어떤 이슈/시나리오를 반드시 방어해야 하는가?
   - 심각도 HIGH 또는 발생 확률 높음 → 필수 방어
   - 심각도 LOW + 발생 확률 낮음 → 구현 후 모니터링

3. 방어 로직 설계: 각 필수 항목에 대한 구체적 방어 전략
   예시:
   - 네트워크 실패 → Retry with exponential backoff (최대 3회)
   - null 데이터 → Repository 레이어에서 sealed class로 래핑
   - Race condition → Mutex 또는 SingleThread Dispatcher

4. 종속성 구조 최종 수정안: architect 지적사항 반영

출력: 합의된 실행 계획 + 방어 로직 설계서
```

### Step 3: 프롬프트 최적화 + 파일 영역 확정 (prompt-engineer)

> **스킵 조건**: qa-tester HIGH 시나리오 0건 + 방어 로직 단순 → Step 3 생략, Step 4 직행.

합의된 실행 계획 + **Step 2 방어 로직 설계서**를 바탕으로
`.claude/agents/prompt-engineer.md`를 읽어 Task(general-purpose, model=sonnet)로 호출합니다.

```
아래 실행 계획과 방어 로직 설계서를 바탕으로
각 에이전트에게 줄 task 프롬프트를 최적화하여 작성해줘.

[합의된 실행 계획 전달]
[Step 2 방어 로직 설계서 전달]

각 프롬프트에 포함할 것:
- 에이전트 역할에 맞는 구체적 작업 지시
- 관련 파일 경로 및 담당 파일 영역 (충돌 확인 후 최종 확정)
- 완료 기준 (측정 가능하게)
- 다른 에이전트 결과에 대한 의존성 명시
- 담당 영역에 해당하는 방어 로직 구현 지시
- 토큰 최적화 규칙 포함

출력 형식: 에이전트명별 프롬프트 블록 (100점 체크리스트 총점 포함)
※ 총점 70점 미만 프롬프트는 즉시 재작성
```

### Step 4: 병렬 실행

독립 서브태스크를 단일 응답에서 동시에 Task 호출.
각 Task에 **prompt-engineer가 최적화한 프롬프트** 사용.

**진행 출력:** `[Step 4/6] 병렬 실행 중: {에이전트1} | {에이전트2} | ...`

**모든 프롬프트에 포함되는 토큰 최적화 규칙:**

```
- description은 반드시 "에이전트명: 작업내용" 형식으로 작성
- Grep으로 위치 파악 후 필요 섹션만 Read
- 이미 읽은 파일 재독 금지
- 출력: 코드 완성본 + 판단 근거 2-3줄
- 완료 보고: 수정 파일 목록 + 변경 요약만
- 담당 파일 영역 외 수정 금지
- 상위 오케스트레이터에게는 관련 정보만 필터링해서 반환 (전체 컨텍스트 반환 금지)
```

### Step 4.5: 중간 교차 검증

Step 4 완료 직후, Step 5 진입 전 경량 파일 경계 충돌 검사.

```
architect(sonnet) → "Step 4 병렬 실행 결과의 파일 경계 충돌 여부만 확인.
                     충돌 발견 시 충돌 파일 목록 + 수정 방향만 출력. (분석 아님, 판단만)"
```

- 충돌 없음 → Step 5 즉시 진행
- 충돌 발견 → 해당 에이전트에만 수정 지시 후 Step 5 진행

### Step 5: 의존성 처리

**planner가 Step 1에서 정의한 의존성 체인** 순서대로 후속 Task를 순차 호출합니다.
이전 단계 결과를 다음 에이전트 컨텍스트로 전달합니다.

**진행 출력:** `[Step 5/6] 의존성 체인: {단계1} → {단계2} → ...`

### Step 6: 최종 검증

**1차 검증 (sonnet — 비용 최적화):**

```
code-reviewer(sonnet) + architect(sonnet) → 동시 실행
```

**진행 출력:** `[Step 6/6] 최종 검증 중: code-reviewer | architect`

**검증 결과 분기:**

```
HIGH 이슈 없음  → 완료
HIGH 이슈 발견  → 2차 검증으로 에스컬레이션 (opus 심층 검토)
```

**2차 검증 (opus — HIGH 이슈 발견 시만):**

```
code-reviewer(opus) + architect(opus) → 수정 지시 포함 심층 검토
```

**재실행 규칙:**

```
HIGH 수정 후 Step 6 재실행 → 최대 2회
이슈 심각도 MED  → 수정 후 code-reviewer(sonnet) 경량 재검증
이슈 심각도 LOW  → 완료 보고에 메모 기록 후 종료
```

> **Step 6 재실행 상한 (무한 루프 방지)**: 최대 2회. 초과 시 중단하고 미해결 이슈 목록을 사용자에게 에스컬레이션.

---

## 완료 보고 형식

**Simple 모드 — 성공:**

```
[Simple] 완료
- executor: AlarmEntity 컬럼 추가 (data/db/AlarmEntity.kt)
- 검증: code-reviewer ✅
```

**Consensus 모드 — 성공:**

```
[Consensus] 완료

협의체 분석 요약 (Step 1+2):
- architect: 레이어드 아키텍처 유지, Repository 패턴 추가 / 종속성 이슈 2건 해결
- planner: DB→Repository→UseCase→ViewModel 순서
- qa-tester: 7개 시나리오 도출 (HIGH 2건, MED 3건, LOW 2건)
- reasoner: FCM 토큰 갱신 → AlarmWorker, 동시 쓰기 → Mutex 방어 로직 확정

프롬프트 최적화: prompt-engineer ✅ (각 에이전트 프롬프트 품질 점수 평균 87점)

실행 결과:
| 에이전트   | 작업                   | 수정 파일                           |
|-----------|----------------------|-------------------------------------|
| db-expert  | AlarmEntity + Dao    | data/db/AlarmEntity.kt              |
| executor   | AlarmRepository 구현  | data/repository/AlarmRepository.kt  |
| designer   | AlarmSettingScreen   | ui/alarm/AlarmSettingScreen.kt      |
| qa-tester  | 단위 테스트 작성        | test/alarm/AlarmRepositoryTest.kt   |

검증: code-reviewer ✅ | architect ✅
```

**부분 완료 / 에스컬레이션 필요:**

```
[Consensus] ⚠️ 에스컬레이션 필요

완료된 단계: Step 1~5 완료, Step 6 검증 2회 실패
미해결 이슈:
- [HIGH] src/api/AuthService.kt:42 — API 키 하드코딩 (executor 2회 수정 실패)
- [HIGH] data/repository/AlarmRepo.kt:87 — Race condition 미해결

사용자 조치 필요:
1. AuthService.kt의 API 키를 환경변수로 수동 이동 후 /pt 재실행
2. AlarmRepo.kt의 Mutex 적용 방식 확인

완료된 작업(Step 1~5)은 그대로 유지됩니다.
```

---

## 사용 가능한 에이전트 목록

| 에이전트 | 역할 | 모델 | 자동 선택 키워드 |
|---------|------|------|--------------|
| `architect` | 아키텍처 분석 + 종속성 검사 (협의체) | opus | — |
| `planner` | 실행 계획 수립 (협의체) | opus | — |
| `reasoner` | 합의 중재 + 방어 로직 확정 (협의체) | opus | — |
| `prompt-engineer` | 각 에이전트 프롬프트 최적화 작성 | sonnet | — |
| `executor` | 코드 구현·수정 | sonnet | — |
| `designer` | Compose UI·컴포넌트 | sonnet | — |
| `qa-tester` | 이슈 시나리오 분석·테스트 작성 | sonnet | — |
| `db-expert` | DB 스키마·Room·마이그레이션 | sonnet | DB, 스키마, 마이그레이션 |
| `devops` | CI/CD·Docker·배포 | sonnet | CI/CD, Docker, 배포 |
| `api-designer` | REST/GraphQL API 설계 | sonnet | API, REST, GraphQL |
| `performance` | 성능 분석 (읽기 전용) | sonnet | 성능, 메모리, 최적화 |
| `security` | 보안 분석 | opus | 보안, 인증, 권한, 암호화 |
| `code-reviewer` | 코드 리뷰 (검증) | opus | — |
| `localizer` | 다국어·번역 | sonnet | 번역, 다국어, i18n |
| `build-fixer` | 빌드 오류 수정 | sonnet | — |
| `accessibility` | 접근성 감사 (읽기 전용) | sonnet | UI, 접근성 |
| `writer` | 문서 작성 | haiku | — |
