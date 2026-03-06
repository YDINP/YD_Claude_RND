# ArcaneCollectors 비-PRD 문서 검토 결과 (2026-02-07)

## 검토 범위
13개 파일 검토 (character_prompts.md는 동일 내용)

## 현재 사양 기준
- **분위기**: 9종 (brave/fierce/wild/calm/stoic/devoted/cunning/noble/mystic)
- **교단**: 9개 (기존 5개 + tartarus/avalon/helheim/kunlun)
- **캐릭터**: 91명 (hero_001~hero_091)
- **구버전 삭제**: personality(용어) → mood, element 시스템 완전 삭제

## 주요 문제점 요약

### CRITICAL (즉시 조치)
1. **character_prompts.md**: 완전 구버전 (속성 기반, 15명만 존재)
2. **TEAM_COMPOSITION.md**: 팀 수 불일치 (6팀 vs 8팀)

### HIGH (단기 조치)
3. **WORKTREE_GUIDE.md**: personality/5종 성격 용어 다수 사용
4. **W1~W5 워커 문서**: 구버전 계획 미업데이트

### MEDIUM/LOW
5. 날짜/히스토리 태그 정리

## 상세 파일별 문제

### 문서 정합성 체크시트
- CHANGELOG_v5.3: ✅ 정확함
- TEAM_COMPOSITION: ❌ 팀 수 불일치
- WORKTREE_GUIDE: ⚠️ 구버전 용어
- character_prompts: ❌ 완전 재작성 필요
- W1~W5: ⚠️ 구버전 참조
- dev-logs: ⚠️ 날짜/히스토리 태그 필요

## 개발팀 가이드
- 현재 활성 사양: v5.3 (분위기 9종, 교단 9개, 91명)
- personality/element 참조 금지 (히스토리만 예외)
- 8팀 기반 개발팀 구조 확인 필요