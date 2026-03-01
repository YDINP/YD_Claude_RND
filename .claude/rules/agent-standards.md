# 커스텀 에이전트 시스템 규칙

## 에이전트 위치
- `.claude/agents/` — 에이전트 파일 (`.md`)
- `.claude/agents/_registry.json` — 레지스트리
- `.claude/agents/_STANDARDS.md` — 상세 규격 (수정 금지)

## 에이전트 추가 절차
1. `agent-manager`에게 "새 에이전트 필요" 요청
2. `agent-manager` → `agent-architect` 위임
3. `agent-architect`: 요구사항 분석 → 파일 생성
4. `agent-architect`: `_registry.json` 업데이트
5. `agent-manager`: 검증 및 완료 보고

## Frontmatter 필수 필드
```yaml
name: kebab-case-name        # 파일명과 일치 (확장자 제외)
description: |               # 트리거 조건 + 사용 예시 포함
  한 줄 목적 요약.
  다음 상황에서 사용: [트리거].
  예시: "예시 1", "예시 2"
model: claude-sonnet-4-6     # 작업 복잡도에 맞는 모델
tools: Read, Write, Bash     # 최소 권한 원칙
```

## 모델 선택 기준
| 모델 | 사용 기준 |
|------|----------|
| `claude-haiku-4-5-20251001` | 단순 반복, 포맷 변환, 빠른 룩업 |
| `claude-sonnet-4-6` | 표준 개발, 분석, 코드 생성 (기본값) |
| `claude-opus-4-6` | 복잡한 추론, 아키텍처 결정, 심층 분석 |

## 시스템 프롬프트 필수 섹션
1. `## 역할` — 에이전트 목적 1-3문장
2. `## 입력/출력 명세` — 입력/출력 명세
3. `## 작업 방식` — 단계별 프로세스
4. `## 제약 사항` — 금지 사항 및 범위 밖 작업

## 품질 체크리스트
- [ ] 파일명 kebab-case = `name` frontmatter 값
- [ ] `description`에 트리거 조건 + 예시 포함
- [ ] `model`: 작업 복잡도에 맞는 티어
- [ ] `tools`: 최소 필요 툴만
- [ ] 시스템 프롬프트 4섹션 포함
- [ ] `_registry.json` 등록 완료
- [ ] 기존 에이전트와 역할 중복 없음

## 토큰 최적화 규칙
- 특정 함수/클래스만 필요 → Grep으로 위치 파악 → Read(offset, limit)
- 이미 읽은 파일 **재독 금지**
- 완료 보고: 수정 파일 경로 + 변경 요약 3줄 이내
- "완료했습니다", "도움이 되셨으면" 등 마무리 문장 생략
