# Agent Management System - 표준 규격 v1.0

> 이 폴더(`.claude/agents/`)의 모든 에이전트는 이 문서의 규격을 따릅니다.

---

## 폴더 구조

```
.claude/agents/
├── _STANDARDS.md         ← 이 문서 (규격, 수정 금지)
├── _registry.json        ← 에이전트 레지스트리 (등록부)
├── agent-manager.md      ← 메인 에이전트 (tier: main, 1개만 존재)
└── {name}.md             ← 서브 에이전트들 (tier: sub, N개)
```

---

## 티어 시스템

| 티어 | 수량 | 역할 | 파일명 |
|------|------|------|--------|
| **main** | 1개 | 중앙 오케스트레이터. 요청 분석 → 서브 에이전트 위임 → 결과 통합 | `agent-manager.md` |
| **sub** | N개 | 특정 도메인 전문 처리. 단일 책임 원칙 | `{role}-{domain}.md` |

---

## 파일 명명 규칙

- 형식: `{role}-{domain}.md` 또는 `{role}.md`
- 케이스: **kebab-case** (소문자 + 하이픈)
- 내부 파일: 언더스코어 prefix (`_STANDARDS.md`, `_registry.json`)

**예시:**
```
agent-architect.md    (role: agent, domain: architect)
code-reviewer.md      (role: code, domain: reviewer)
api-integrator.md     (role: api, domain: integrator)
test-runner.md        (role: test, domain: runner)
```

---

## Frontmatter 규격

```yaml
---
name: kebab-case-name          # 필수. 파일명과 일치 (확장자 제외)
description: |                 # 필수. 멀티라인 권장
  [한 줄 목적 요약].
  다음 상황에서 사용: [트리거 조건들].
  예시: "[사용 예시 1]", "[사용 예시 2]"
model: claude-sonnet-4-6       # 필수. 아래 모델 선택 기준 참조
tools: Read, Write, Bash       # 필수. 최소 권한 원칙 적용
---
```

### 모델 선택 기준

| 모델 | 사용 기준 |
|------|----------|
| `claude-haiku-4-5-20251001` | 단순 반복, 포맷 변환, 빠른 룩업 |
| `claude-sonnet-4-6` | 표준 개발, 분석, 코드 생성 **(기본값)** |
| `claude-opus-4-6` | 복잡한 추론, 아키텍처 결정, 심층 분석 |

### 툴 선택 기준 (최소 권한 원칙)

| 작업 유형 | 권장 툴 세트 |
|----------|-------------|
| 읽기/탐색 전용 | `Read, Glob, Grep` |
| 코드 생성/수정 | `Read, Write, Edit, Glob, Grep` |
| 시스템 작업 | `Bash, Read, Write` |
| 전체 에이전트 조율 | `Read, Write, Glob, Grep, Bash, Task` |

---

## 시스템 프롬프트 필수 섹션

모든 에이전트의 시스템 프롬프트는 다음 섹션을 포함해야 합니다:

```markdown
## 역할
[에이전트의 역할과 목적 1-3문장]

## 입력/출력 명세
- **입력**: [어떤 정보를 받는지]
- **출력**: [어떤 결과를 생성하는지]

## 작업 방식
[단계별 작업 프로세스]

## 제약 사항
- [해서는 안 되는 것]
- [범위 밖의 작업 명시]
```

---

## 레지스트리 등록 규칙

**새 에이전트를 추가할 때는 반드시 `_registry.json`에 등록해야 합니다.**

```json
{
  "name": "agent-name",
  "tier": "sub",
  "file": "agent-name.md",
  "model": "claude-sonnet-4-6",
  "description": "한 줄 설명 (50자 이내)",
  "capabilities": ["capability-1", "capability-2"],
  "triggers": ["트리거 문구 1", "트리거 문구 2"]
}
```

---

## 에이전트 추가 프로세스 (표준 절차)

```
1. agent-manager 에게 "새 에이전트 필요" 요청
         ↓
2. agent-manager → agent-architect 위임
         ↓
3. agent-architect: 요구사항 분석 → 파일 생성
         ↓
4. agent-architect: _registry.json 업데이트
         ↓
5. agent-manager: 검증 및 완료 보고
```

---

## 품질 기준

에이전트 파일 병합/등록 전 체크리스트:

- [ ] 파일명: kebab-case, 파일명 = `name` frontmatter
- [ ] description: 트리거 조건 + 사용 예시 포함
- [ ] model: 작업 복잡도에 맞는 티어
- [ ] tools: 최소 필요 툴만 포함
- [ ] 시스템 프롬프트: 4개 필수 섹션 포함
- [ ] _registry.json: 등록 완료
- [ ] 기존 에이전트와 역할 중복 없음

---

## 토큰 최적화 공통 규칙 (전 에이전트 필수 적용)

> 이 규칙은 시스템 전체 비용 절감을 위해 **모든 에이전트**가 준수합니다.

### 1. 파일 읽기 최소화

| 상황 | 방법 |
|------|------|
| 특정 함수/클래스만 필요 | Grep으로 위치 파악 → Read(offset, limit) |
| 전체 구조 파악 | Glob으로 파일 목록 → 핵심 파일만 선택 읽기 |
| 이미 읽은 파일 | **재독 금지** — 이미 확인한 내용 활용 |
| 심볼 탐색 | Grep 패턴 검색 → 일치 파일만 Read |

### 2. 출력 형식 원칙

- **코드**: 완성된 형태로 한 번만 제공 (중간 과정 서술 생략)
- **설명**: 판단 근거 핵심 2-3줄 이내 (나열·열거 최소화)
- **완료 보고**: 수정 파일 경로 + 변경 요약 3줄 이내
- **마무리 문장 생략**: "완료했습니다", "도움이 되셨으면" 류 불필요

### 3. 모델 적정 선택

| 작업 유형 | 적합 모델 | 부적합 예시 |
|---------|---------|-----------|
| 파일 검색, 포맷 변환, 단순 조회 | `haiku` | opus로 grep 실행 |
| 코드 구현, 분석, 일반 작업 | `sonnet` | opus로 단순 수정 |
| 아키텍처 결정, 복잡 추론, 심층 리뷰 | `opus` | sonnet으로 아키텍처 설계 |

### 4. 멀티 에이전트 환경 추가 규칙

- **담당 파일 외 수정 금지**: 팀장이 지정한 파일 영역만 수정
- **결과 보고 압축**: 에이전트명 + 수정 파일 목록 + 한 줄 요약만
- **중복 읽기 금지**: 다른 에이전트가 이미 분석한 파일 재분석 금지
- **의존성 명시**: 다른 에이전트의 결과가 필요한 경우 명확히 표시

### 5. 응답 구조화

```
✅ 권장 출력 패턴:
- 수정: SubwayMate/data/db/AppDatabase.kt (AlarmEntity 추가)
- 수정: SubwayMate/data/db/AlarmDao.kt (CRUD 쿼리 3개)

❌ 금지 출력 패턴:
- 파일을 열어서 확인해보니...
- 다음과 같이 작업을 진행했습니다...
- 완료했습니다! 도움이 필요하시면...
```
