# ArcaneCollectors PRD v5.2 — 문서 인덱스

> 원본 백업: `docs/PRD_Unified_v5_BACKUP.md` (2194줄)
> 분할일: 2026-02-06
> 버전: v5.2 (분위기(Mood) 시스템, Element 삭제, 시너지 스킬)

---

## 문서 구조

| # | 파일명 | 내용 | 예상 크기 |
|---|--------|------|----------|
| 01 | `01_OVERVIEW.md` | 프로젝트 개요, 세계관, 교단 시스템 | ~40줄 |
| 02 | `02_CORE_SYSTEMS.md` | 캐릭터/가챠/전투/에너지/소탕/탑/장비/스테이지/시너지/퀘스트/오프라인 보상 | ~280줄 |
| 03 | `03_ARCHITECTURE.md` | 기술 아키텍처, 프로젝트 구조, Supabase 백엔드 | ~90줄 |
| 04 | `04_TEAMS.md` | 8팀 구성 (A~H), 에이전트 배정, 추론 프로토콜 | ~115줄 |
| 05 | `05_TASKS_AB.md` | TASK 상세: Team A (전투 통합) + Team B (신규 씬 & UI) | ~355줄 |
| 06 | `06_TASKS_CD.md` | TASK 상세: Team C (데이터 & 백엔드) + Team D (통합 QA) | ~155줄 |
| 07 | `07_TASKS_EF.md` | TASK 상세: Team E (캐릭터 데이터) + Team F (씬/패널 검증) | ~275줄 |
| 08 | `08_TASKS_GH.md` | TASK 상세: Team G (치트 API) + Team H (디자인 & 에셋) | ~87줄 |
| 09 | `09_STANDARDS_PHASES.md` | 코딩 표준, 확장 아이디어, Phase별 실행 계획, TASK 요약 | ~112줄 |
| 10 | `10_MIGRATION.md` | Element→Mood 마이그레이션 (119개 참조 삭제) | ~65줄 |
| 11 | `11_WORKTREE_DOCS.md` | Git Worktree 8팀 병렬 계획 + 문서화 에이전트 | ~190줄 |
| 12 | `12_SYNERGY.md` | 시너지 조합 시스템 + 시너지 스킬 (패시브/액티브/궁극기) | ~194줄 |
| 13 | `13_EXPANSION_BALANCE.md` | 확장가능성 평가 + 캐릭터 밸런스 분석 (91명) | ~200줄 |
| 14 | `14_CHARACTER_DESIGN.md` | 캐릭터 디자인 가이드: 분위기별 이펙트, 교단별 테마, 91명 로스터 | ~450줄 |
| A | `APPENDIX.md` | 부록 A: 8개 사양 불일치 결정 + 부록 B: 변경이력 | ~105줄 |

---

## 팀별 필요 문서 매핑

| 팀 | 필수 문서 | 참고 문서 |
|----|----------|----------|
| **Team A** (전투 통합) | `02`, `05_TASKS_AB`, `12_SYNERGY` | `10_MIGRATION`, `APPENDIX` |
| **Team B** (신규 씬 & UI) | `02`, `05_TASKS_AB` | `03_ARCHITECTURE` |
| **Team C** (데이터 & 백엔드) | `02`, `06_TASKS_CD`, `10_MIGRATION` | `03_ARCHITECTURE`, `APPENDIX` |
| **Team D** (통합 QA) | `06_TASKS_CD`, `09_STANDARDS_PHASES` | 전체 |
| **Team E** (캐릭터 데이터) | `02`, `07_TASKS_EF`, `13_EXPANSION_BALANCE` | `12_SYNERGY` |
| **Team F** (씬/패널 검증) | `02`, `07_TASKS_EF` | `03_ARCHITECTURE` |
| **Team G** (치트 API) | `08_TASKS_GH` | `02`, `03_ARCHITECTURE` |
| **Team H** (디자인 & 에셋) | `08_TASKS_GH`, `01_OVERVIEW`, `14_CHARACTER_DESIGN` | `02` |

---

## 핵심 시스템 퀵 레퍼런스

- **분위기(Mood) 9종**: brave(열혈)/fierce(격렬)/wild(광폭)/calm(고요)/stoic(의연)/devoted(헌신)/cunning(냉철)/noble(고결)/mystic(신비) → `02`, `14`
- **교단(Cult) 9교단**: olympus/takamagahara/yomi/asgard/valhalla/tartarus/avalon/helheim/kunlun → `01`, `14`
- **캐릭터 디자인**: 91명 로스터, 분위기별 이펙트, 교단별 테마 → `14`
- **데미지 공식**: `ATK × mult × (1 - DEF/1000, min 10%)` → `APPENDIX` A-3
- **시너지 스킬**: 패시브/액티브/궁극기 3종 → `12`
- **마이그레이션**: personality→mood, element 삭제 (119개) → `10`
- **Git Worktree**: 8팀 브랜치 + mood-migration 전용 → `11`
