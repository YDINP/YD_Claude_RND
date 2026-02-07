# ArcaneCollectors 개발팀 구성 및 TASK 할당

> 작성일: 2026-02-06
> 프로젝트: ArcaneCollectors (아르케인 컬렉터스)
> 상태: PRD v1~v4 GAP 분석 기반 통합 개발 계획

---

## 핵심 발견사항 요약

### 현재 상태
- **코드 완성도**: ~97% (시스템/서비스 클래스 자체는 대부분 구현됨)
- **실제 동작 완성도**: ~60-65% (시스템 간 연결/통합이 누락)
- **근본 원인**: 시스템이 독립적으로 개발되었으나 Scene에 **통합(wiring)되지 않음**

### 주요 통합 실패 지점
| 시스템 | 문제 | 영향 |
|--------|------|------|
| PersonalitySystem | BattleScene에 import되지 않음 | 성격 상성 데미지 무효 |
| EnergySystem | StageSelectScene에서 호출 없음 | 에너지 무한 사용 가능 |
| SweepSystem | UI 버튼 없음 | 소탕 기능 접근 불가 |
| TowerSystem | TowerScene.js 미존재 | 무한의 탑 플레이 불가 |
| StageSelectScene | stages.json 무시, 3챕터x10스테이지 하드코딩 | 데이터 불일치 |
| BattleScene | 별점 3으로 하드코딩 | 성과 기반 평가 무효 |
| systems/index.js | 17개 중 4개만 export | 대부분 시스템 접근 불가 |
| AuthService | 로그인 UI Scene 없음 | 인증 기능 접근 불가 |
| GachaScene | 장비 가챠 비활성화 | 장비 획득 경로 차단 |
| data/index.js | Element 기반 함수 (v3 이전), Personality 함수 없음 | PRD v4 불일치 |
| data/index.js | getSummonRates() SSR:3% vs PRD:1.5% | 확률 불일치 |

---

## 팀 구성 (6팀)

---

## TEAM A: 전투 통합팀 (Battle Integration Team)

### 역할
기존에 구현된 전투 관련 시스템(BattleSystem, PersonalitySystem, SynergySystem)을
BattleScene에 실제로 연결하고, 누락된 전투 로직을 완성합니다.

### 팀 구성
| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `architect` | opus | 전투 로직 설계 검증, 통합 아키텍처 리뷰 |
| 분석가 | `explore-medium` | sonnet | 전투 관련 코드 탐색 및 의존성 분석 |
| 개발자 | `executor` | sonnet | 시스템 연결 코드 구현 |
| 개발자 (보조) | `executor-low` | haiku | 단순 import/export 수정 |
| QA | `qa-tester` | sonnet | 전투 시나리오 테스트 |

### TASK 목록

#### A-1: systems/index.js 완전한 barrel export 구성
- **우선순위**: P0 (최우선)
- **현재 상태**: 17개 시스템 중 4개만 export (EnergySystem, PersonalitySystem, SweepSystem, TowerSystem)
- **목표**: 모든 시스템(BattleSystem, SaveManager, GachaSystem, EquipmentSystem, EvolutionSystem, PartyManager, ProgressionSystem, QuestSystem, CouponSystem, DebugManager, EventBus, SynergySystem) 추가 export
- **파일**: `src/systems/index.js`

#### A-2: PersonalitySystem → BattleScene 연결
- **우선순위**: P0
- **현재 상태**: PersonalitySystem이 완전 구현되었으나 BattleScene에서 import/사용하지 않음
- **목표**: 
  - BattleScene에서 PersonalitySystem import
  - 데미지 계산 시 성격 상성 배율 적용 (brave/cunning/calm/wild/mystic)
  - 상성 유리/불리 시 UI에 표시 (데미지 숫자 색상/아이콘)
- **파일**: `src/scenes/BattleScene.js`, `src/systems/PersonalitySystem.js`

#### A-3: SynergySystem → BattleScene 완전 통합
- **우선순위**: P1
- **현재 상태**: SynergyDisplay 컴포넌트 존재하나 SynergySystem과의 연결 검증 필요
- **목표**: 
  - 시너지 계산 결과가 실제 전투 스탯에 반영되는지 검증
  - 교단/성격/역할/특수 시너지 4종 모두 동작 확인
  - 시너지 버프 아이콘 UI 표시
- **파일**: `src/systems/SynergySystem.js`, `src/scenes/BattleScene.js`, `src/components/battle/SynergyDisplay.js`

#### A-4: 전투 별점(Star Rating) 성과 기반 계산
- **우선순위**: P1
- **현재 상태**: `BattleScene.js:1333` 에서 `const newStars = 3;` 하드코딩
- **목표**: 
  - 클리어 턴 수, 생존 캐릭터 수, HP 잔량 기반 1~3성 계산
  - 예: 3성(전원 생존+10턴 이내), 2성(과반 생존), 1성(클리어만)
  - 결과 UI에 별점 애니메이션 표시
- **파일**: `src/scenes/BattleScene.js`

#### A-5: 카드 덱 스킬 시스템 밸런스 검증
- **우선순위**: P1
- **현재 상태**: 스킬 카드 시스템 구현됨, 밸런스 미검증
- **목표**: 
  - 수동/자동 전투 모두에서 스킬 카드 선택 동작 확인
  - 스킬 차지 게이지 → 궁극기 발동 검증
  - 스킬 효과(단일공격, 광역, 힐 등) 정상 동작 확인
- **파일**: `src/systems/BattleSystem.js`, `src/components/battle/SkillCard.js`

#### A-6: 자동전투 AI 로직 개선
- **우선순위**: P2
- **현재 상태**: 기본 자동전투 있으나 스킬 선택 지능 미검증
- **목표**: 
  - 적 HP 기반 스킬 선택 (광역 vs 단일)
  - 아군 HP 기반 힐 우선순위
  - 배속 옵션 (1x, 2x, 3x) 동작 확인
- **파일**: `src/scenes/BattleScene.js`, `src/systems/BattleSystem.js`

#### A-7: 전투 결과 보상 시스템 연결
- **우선순위**: P1
- **현재 상태**: 전투 승리 시 보상 지급 로직 검증 필요
- **목표**: 
  - 골드, 경험치, 아이템 드롭 정상 지급 확인
  - ProgressionSystem과 연결하여 경험치 → 레벨업 처리
  - SaveManager로 결과 저장
- **파일**: `src/scenes/BattleScene.js`, `src/systems/ProgressionSystem.js`, `src/systems/SaveManager.js`

#### A-8: 전투 이펙트 및 연출 폴리싱
- **우선순위**: P3
- **현재 상태**: 기본 전투 애니메이션 존재
- **목표**: 
  - 스킬별 차별화된 이펙트
  - 크리티컬 히트 연출
  - 성격 상성 유리 시 특수 이펙트
  - 턴 오더 바 애니메이션 개선
- **파일**: `src/scenes/BattleScene.js`, `src/utils/animations.js`

---

## TEAM B: 신규 씬 & UI팀 (New Scenes & UI Team)

### 역할
현재 누락된 Scene(TowerScene, LoginScene, QuestScene, SettingsScene)을 신규 생성하고,
기존 Scene의 UI를 PRD에 맞게 개선합니다.

### 팀 구성
| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `designer-high` | opus | UI/UX 설계 검증, 씬 구조 리뷰 |
| 설계자 | `architect-medium` | sonnet | Scene 아키텍처 설계 |
| 개발자 | `executor` | sonnet | Scene 코드 구현 |
| 개발자 (보조) | `executor-low` | haiku | 컴포넌트 연결 |
| QA | `qa-tester` | sonnet | 화면 전환 테스트 |

### TASK 목록

#### B-1: TowerScene.js 신규 생성
- **우선순위**: P0
- **현재 상태**: TowerSystem(531줄) 완전 구현, Scene 없음
- **목표**: 
  - 층 선택 UI (현재 층, 최고 기록, 보상 미리보기)
  - 전투 시작 버튼 → BattleScene 연결
  - 층별 보상 표시
  - TowerSystem의 100층 데이터 사용
  - `// TODO: 장비 생성 및 지급` (line 194) 해결
- **파일**: 신규 `src/scenes/TowerScene.js`, gameConfig.js에 Scene 등록

#### B-2: StageSelectScene → stages.json 연결
- **우선순위**: P0
- **현재 상태**: `generateStages()` 메서드가 3챕터x10스테이지 하드코딩, stages.json(5챕터x5스테이지) 무시
- **목표**: 
  - generateStages() 제거, stages.json 데이터 사용
  - 5개 챕터(olympus/takamagahara/valhalla/asgard/yomi) 표시
  - 각 챕터 5개 스테이지 동적 로드
  - 클리어 상태(별점) 표시
- **파일**: `src/scenes/StageSelectScene.js`, `src/data/stages.json`

#### B-3: EnergySystem → StageSelectScene UI 연결
- **우선순위**: P0
- **현재 상태**: 에너지 표시 "⚡ 50/50" 하드코딩, EnergySystem 미연결
- **목표**: 
  - EnergySystem import 및 실시간 에너지 표시
  - 스테이지 입장 시 consumeEnergy() 호출
  - 에너지 부족 시 입장 차단 + 안내 팝업
  - EnergyBar 컴포넌트 활용
  - 에너지 회복 타이머 표시
- **파일**: `src/scenes/StageSelectScene.js`, `src/systems/EnergySystem.js`, `src/components/EnergyBar.js`

#### B-4: SweepSystem UI 버튼 추가
- **우선순위**: P1
- **현재 상태**: SweepSystem 완전 구현(검증/에너지 차감/보상), UI 없음
- **목표**: 
  - 3성 클리어 스테이지에 "소탕" 버튼 표시
  - 소탕 횟수 선택 (1회/5회/10회)
  - 보상 요약 팝업
  - 에너지/소탕권 부족 시 안내
- **파일**: `src/scenes/StageSelectScene.js`, `src/systems/SweepSystem.js`

#### B-5: LoginScene (인증 UI) 신규 생성
- **우선순위**: P2
- **현재 상태**: AuthService 완전 구현(Supabase auth + 게스트), UI 없음
- **목표**: 
  - 게스트 로그인 버튼 (즉시 시작)
  - Supabase 이메일 로그인/회원가입
  - 타이틀 화면 + 로고 연출
  - BootScene → LoginScene → PreloadScene 흐름
- **파일**: 신규 `src/scenes/LoginScene.js`, `src/services/AuthService.js`

#### B-6: QuestScene 신규 생성
- **우선순위**: P2
- **현재 상태**: QuestSystem 구현됨, 퀘스트 데이터 존재(일일5/주간3/업적5), UI 없음
- **목표**: 
  - 일일/주간/업적 탭 UI
  - 퀘스트 진행도 표시
  - 보상 수령 버튼
  - 완료 알림 배지
- **파일**: 신규 `src/scenes/QuestScene.js`, `src/systems/QuestSystem.js`

#### B-7: 장비 가챠 활성화
- **우선순위**: P2
- **현재 상태**: GachaScene에 장비 탭 존재하나 "준비 중입니다" 메시지
- **목표**: 
  - 장비 가챠 로직 활성화
  - EquipmentSystem과 연결
  - 장비 등급별 소환 연출
  - 현재 4개 장비 → 데이터 확장 필요 (TEAM E와 협업)
- **파일**: `src/scenes/GachaScene.js`, `src/systems/EquipmentSystem.js`

---

## TEAM C: 데이터 & 백엔드팀 (Data & Backend Team)

### 역할
PRD와 실제 데이터의 불일치를 수정하고, Supabase 백엔드 연동을 완성합니다.
data/index.js의 Element→Personality 마이그레이션을 수행합니다.

### 팀 구성
| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `architect` | opus | 데이터 아키텍처 설계, API 설계 검증 |
| 분석가 | `explore-medium` | sonnet | 데이터 불일치 탐색 |
| 개발자 | `executor` | sonnet | 데이터 마이그레이션, API 구현 |
| 보안 | `security-reviewer-low` | haiku | Supabase RLS 검증 |
| 연구원 | `researcher` | sonnet | 가챠 확률/밸런스 리서치 |

### TASK 목록

#### C-1: data/index.js Element→Personality 마이그레이션
- **우선순위**: P0
- **현재 상태**: 
  - `getCharactersByElement()` 함수 존재 (v3 이전 잔재)
  - `getElementAdvantages()` 함수 존재 (v3 이전 잔재)
  - `calculateElementMultiplier()` 함수 존재 (v3 이전 잔재)
  - Personality 기반 함수 없음
- **목표**: 
  - `getCharactersByPersonality(personality)` 함수 추가
  - `getCharactersByCult(cult)` 함수 추가
  - `getPersonalityMatchup(attacker, defender)` 함수 추가
  - 레거시 Element 함수 deprecation 또는 제거
  - 관련 import/참조 모두 업데이트
- **파일**: `src/data/index.js`

#### C-2: 가챠 확률 PRD 일치화
- **우선순위**: P0
- **현재 상태**: `getSummonRates()` → SSR:3%, SR:15%, R:82% (PRD: SSR:1.5%, SR:8.5%, R:30%, N:60%)
- **목표**: 
  - PRD v4 기준 확률 적용: N:60%, R:30%, SR:8.5%, SSR:1.5%
  - N등급(2성) 캐릭터 카테고리 추가
  - GachaSystem과 data/index.js 확률 동기화
  - 천장 시스템: 90회 SSR 확정 검증
- **파일**: `src/data/index.js`, `src/systems/GachaSystem.js`

#### C-3: Supabase 마이그레이션 SQL 검증 및 적용
- **우선순위**: P1
- **현재 상태**: `supabase/` 폴더에 마이그레이션 SQL 존재, 적용 상태 미확인
- **목표**: 
  - 7개 테이블(players, heroes, parties, inventory, gacha_history, stages, tower) 스키마 검증
  - RLS(Row Level Security) 정책 적용
  - 서버사이드 가챠 검증 function
- **파일**: `supabase/` 폴더 전체

#### C-4: 하이브리드 저장 시스템 (Local + Supabase)
- **우선순위**: P1
- **현재 상태**: SaveManager(LocalStorage), Services(Supabase) 별도 존재
- **목표**: 
  - 온라인 시: Supabase 우선, LocalStorage 백업
  - 오프라인 시: LocalStorage만 사용
  - 재접속 시: 로컬↔서버 데이터 동기화
  - 충돌 해결 전략(서버 우선 / 최신 우선)
- **파일**: `src/systems/SaveManager.js`, `src/services/*.js`, `src/api/supabaseClient.js`

#### C-5: 오프라인 보상 시스템 검증
- **우선순위**: P2
- **현재 상태**: BootScene에서 오프라인 보상 계산, 정확도 미검증
- **목표**: 
  - 최대 24시간 오프라인 보상 상한 확인
  - 골드/경험치/장비 파편 획득량 밸런스
  - 보상 팝업 UI 검증
- **파일**: `src/scenes/BootScene.js`

#### C-6: 쿠폰 시스템 UI 연결
- **우선순위**: P3
- **현재 상태**: CouponSystem 구현됨, UI 입력 인터페이스 없음
- **목표**: 
  - 설정 화면 또는 메뉴에서 쿠폰 입력 UI
  - 쿠폰 유효성 검사
  - 보상 지급 및 알림
- **파일**: `src/systems/CouponSystem.js`, 메뉴 Scene

#### C-7: 디버그 매니저 통합
- **우선순위**: P3
- **현재 상태**: DebugManager 구현됨, 활성화 경로 미확인
- **목표**: 
  - 개발 모드에서만 활성화
  - 재화 추가, 캐릭터 즉시 획득, 레벨 조정 등
  - 콘솔 또는 숨겨진 UI 접근
- **파일**: `src/systems/DebugManager.js`

---

## TEAM D: 통합 QA & 최적화 (Integration QA & Optimization Team)

### 역할
전체 게임 흐름을 처음부터 끝까지 테스트하고,
성능 최적화 및 빌드 안정성을 보장합니다.

### 팀 구성
| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `qa-tester-high` | opus | QA 전략 수립, 최종 품질 검증 |
| 탐색가 | `explore-high` | opus | 전체 코드베이스 크로스 레퍼런스 |
| 테스터 | `qa-tester` | sonnet | 기능별 테스트 실행 |
| 빌드 | `build-fixer` | sonnet | 빌드 오류 수정 |
| 성능 | `architect-medium` | sonnet | 성능 병목 분석 |

### TASK 목록

#### D-1: 전체 Scene 전환 흐름 테스트
- **우선순위**: P1
- **현재 상태**: 8개 Scene 존재, 신규 Scene 추가 예정
- **목표**: 
  - Boot → Login → Preload → MainMenu 흐름
  - MainMenu → 각 하위 Scene 진입/복귀
  - Scene 전환 시 메모리 누수 확인
  - 뒤로가기 동작 일관성
- **범위**: 모든 Scene 파일

#### D-2: 전투 E2E 테스트
- **우선순위**: P1
- **목표**: 
  - 스테이지 선택 → 파티 편성 → 전투 → 결과 → 보상 전체 흐름
  - 에너지 차감 확인
  - 승리/패배 양쪽 시나리오
  - 자동전투 + 수동전투 모두

#### D-3: 가챠 확률 시뮬레이션 검증
- **우선순위**: P1
- **목표**: 
  - 10,000회 소환 시뮬레이션으로 확률 검증
  - 천장(90회) 정확히 동작하는지
  - 픽업 배너 확률 UP 검증
  - N/R/SR/SSR 분포 PRD 일치

#### D-4: Vite 빌드 최적화
- **우선순위**: P2
- **목표**: 
  - 번들 사이즈 분석 및 최적화
  - 코드 스플리팅 (Scene 별 lazy load)
  - 에셋 최적화 (이미지 압축)
  - 초기 로딩 시간 3초 이내

#### D-5: 크로스 브라우저 & 모바일 테스트
- **우선순위**: P2
- **목표**: 
  - Chrome, Safari, Firefox 동작 확인
  - 모바일 터치 입력 정상 동작
  - 720x1280 해상도 피팅 확인
  - PWA 설정 (선택)

---

## TEAM E: 캐릭터 데이터 구성 및 설계팀 (Character Data Design Team)

### 역할
PRD에 정의된 81명의 캐릭터 데이터를 완성하고,
캐릭터 밸런스, 스킬 설계, 장비 데이터를 체계적으로 구성합니다.

### 팀 구성
| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `architect` | opus | 데이터 아키텍처 & 밸런스 총괄 검증 |
| 분석가 | `analyst` | opus | 기존 캐릭터 데이터 분석, 밸런스 평가 |
| 설계자 | `researcher` | sonnet | 레퍼런스 게임 밸런스 조사 (AFK아레나, 블루아카이브 등) |
| 개발자 | `executor` | sonnet | JSON 데이터 파일 작성 |
| 개발자 (보조) | `executor-low` | haiku | 반복적 데이터 입력 |
| 데이터 과학 | `scientist` | sonnet | 스탯 분포/밸런스 시뮬레이션 |

### TASK 목록

#### E-1: 기존 캐릭터 데이터 감사 (Audit)
- **우선순위**: P0
- **현재 상태**: 39명 존재 (olympus:9, takamagahara:9, yomi:9, asgard:**3**, valhalla:9)
- **목표**: 
  - 39명 캐릭터의 데이터 완전성 검증
  - 필수 필드 누락 확인: id, name, nameKo, rarity, personality, cult, role, baseStats, growthStats, skills, description
  - 등급 분포 확인: 현재 N:0, R:7, SR:16, SSR:16 → N등급 캐릭터 필요
  - asgard 교단 캐릭터 3명 → 6명 추가 필요 (총 9명)
  - 스킬 ID가 skills.json과 매칭되는지 검증
- **파일**: `src/data/characters.json`, `src/data/skills.json`

#### E-2: 누락 캐릭터 데이터 설계 (42명)
- **우선순위**: P0
- **현재 상태**: 39/81명 구현 → 42명 추가 필요
- **목표**: 
  - asgard 교단: 6명 추가 (현재 3명 → 총 9명)
  - N등급(2성) 캐릭터 추가: 각 교단 최소 2-3명씩 (총 약 15명)
  - 교단별 균등 분포: 각 교단 ~16명
  - 역할(warrior/mage/archer/healer) 균등 분포
  - 성격(brave/cunning/calm/wild/mystic) 균등 분포
  - 캐릭터 이름, 설명, 배경 스토리 작성
- **파일**: `src/data/characters.json`
- **산출물**: 캐릭터 설계 스프레드시트, 업데이트된 characters.json

#### E-3: 캐릭터 스탯 밸런스 설계
- **우선순위**: P1
- **현재 상태**: 39명의 baseStats/growthStats 존재, 밸런스 미검증
- **목표**: 
  - 등급별 기본 스탯 범위 정의:
    - N: HP 300-400, ATK 30-40, DEF 25-35, SPD 80-90
    - R: HP 500-700, ATK 50-80, DEF 40-60, SPD 85-100
    - SR: HP 800-1100, ATK 90-130, DEF 60-90, SPD 90-110
    - SSR: HP 1200-1600, ATK 140-200, DEF 80-120, SPD 95-120
  - 역할별 스탯 경향:
    - warrior: 높은 HP/DEF, 중간 ATK
    - mage: 낮은 HP/DEF, 높은 ATK
    - archer: 중간 HP, 높은 ATK/SPD
    - healer: 중간 HP, 낮은 ATK, 높은 특수 스탯
  - 성장 계수(growthStats) 등급/역할별 표준화
  - 전투력(power) 계산식 검증
- **파일**: `src/data/characters.json`, `src/data/index.js`

#### E-4: 스킬 데이터 확장 및 밸런스
- **우선순위**: P1
- **현재 상태**: skills.json에 스킬 데이터 존재, 42명 추가 캐릭터용 스킬 필요
- **목표**: 
  - 캐릭터별 스킬 3개(기본/액티브/궁극기) 체계
  - 스킬 타입별 효과 정의: damage, heal, buff, debuff, aoe
  - 스킬 레벨업 시 수치 증가율
  - 성격별 특화 스킬 효과 (brave→공격력UP, calm→방어력UP 등)
  - 42명 추가 캐릭터용 새 스킬 작성
- **파일**: `src/data/skills.json`

#### E-5: 장비 데이터 확장 (4→81개)
- **우선순위**: P1
- **현재 상태**: equipment.json에 4개 아이템만 존재, PRD v4 기준 81개 필요
- **목표**: 
  - 4개 슬롯(weapon/armor/accessory/relic) × 등급(N/R/SR/SSR) × 역할별
  - 장비 기본 스탯 및 강화 수치
  - 장비 세트 효과 (선택)
  - 장비 가챠 풀 데이터 구성
  - 최소 40개 이상 장비 데이터 1차 구성
- **파일**: `src/data/equipment.json`

#### E-6: 적(Enemy) 데이터 확장
- **우선순위**: P2
- **현재 상태**: 11명 적 데이터
- **목표**: 
  - 5챕터 × 5스테이지 × 3-4적 = 최소 60종 이상 필요
  - 보스 몬스터 (각 챕터 5스테이지): 5종
  - 엘리트 몬스터: 챕터당 2종 × 5 = 10종
  - 일반 몬스터: 챕터당 테마 맞춤 5-8종
  - 무한의 탑 전용 적: 10층마다 특수 보스
  - 적 성격 속성 부여 (상성 시스템 활용)
- **파일**: `src/data/enemies.json`

#### E-7: 시너지 데이터 검증 및 확장
- **우선순위**: P2
- **현재 상태**: 교단 시너지 3개, 성격 시너지 6개, 특수 시너지 10개
- **목표**: 
  - 교단 시너지: 5개 교단 모두 커버 (현재 3개 → 5개)
  - 성격 시너지: 조합별 균등 (5C2 = 10개 가능)
  - 특수 시너지: 특정 캐릭터 조합 보너스
  - 시너지 효과 밸런스 (너무 강력하지 않게)
- **파일**: `src/data/synergies.json`

#### E-8: 캐릭터 비주얼 에셋 가이드
- **우선순위**: P3
- **현재 상태**: PRD_Character_Design.md에 AI 생성 가이드 존재
- **목표**: 
  - 42명 추가 캐릭터의 외형 설명서 (AI 이미지 생성용 프롬프트)
  - 교단별 비주얼 테마:
    - olympus: 그리스 신화, 흰색/금색 의상
    - takamagahara: 일본 신화, 전통 의상/사무라이
    - valhalla: 북유럽 신화, 바이킹/룬 문양
    - asgard: 북유럽 신전, 빛나는 갑옷/오라
    - yomi: 일본 명계, 어두운 색상/영적 모티브
  - n8n 워크플로우 연동 (Huggingface, Fooocus)
- **파일**: `docs/PRD_Character_Design.md`, `n8n/`

---

## TEAM F: 씬/패널 로직 검증 분석 및 개발팀 (Scene/Panel Logic Verification & Development Team)

### 역할
모든 Scene과 UI 패널의 데이터 바인딩, 이벤트 처리, 시스템 연결 상태를 
체계적으로 검증하고, 발견된 불일치를 수정합니다.

### 팀 구성
| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `architect` | opus | 전체 씬 아키텍처 검증, 데이터 흐름 감사 |
| 탐색가 | `explore-high` | opus | 심층 코드 탐색, 참조 추적 |
| 분석가 | `analyst` | opus | 로직 정합성 분석, 에지 케이스 발견 |
| 개발자 | `executor` | sonnet | 발견된 버그/불일치 수정 |
| 코드 리뷰 | `code-reviewer` | opus | 코드 품질, 패턴 일관성 검증 |
| QA | `qa-tester` | sonnet | 수정 후 회귀 테스트 |

### TASK 목록

#### F-1: BootScene 로직 검증
- **우선순위**: P0
- **검증 항목**:
  - SaveManager 초기화 및 데이터 로드 정상 동작
  - 오프라인 보상 계산 정확도 (lastOnline → 현재 시간 차이)
  - registry 값 설정 (gems, gold, pityCounter, ownedHeroes, clearedStages, battleSpeed)
  - Scene 전환 타이밍 (Splash → PreloadScene)
  - 첫 실행 시 초기 데이터 설정
- **파일**: `src/scenes/BootScene.js`

#### F-2: PreloadScene 에셋 로딩 검증
- **우선순위**: P1
- **검증 항목**:
  - 모든 필요 에셋 프리로드 완료 여부
  - 로딩 진행바 정확도
  - 에셋 로딩 실패 시 에러 핸들링
  - 추가 Scene(Tower, Login, Quest)용 에셋 로드 추가 필요 여부
- **파일**: `src/scenes/PreloadScene.js`

#### F-3: MainMenuScene 데이터 바인딩 검증
- **우선순위**: P0
- **검증 항목**:
  - TopBar: 골드/보석 표시가 실시간 갱신되는지
  - BottomNav: 각 탭 터치 → 올바른 Scene 전환
  - 대표 캐릭터 표시: ownedHeroes[0] 기반 동적 렌더링
  - 오프라인 보상 팝업: 보상 수령 → 재화 반영
  - "메뉴" 탭: "준비 중" 토스트 → 실제 기능 연결 (설정/쿠폰/디버그)
  - 에너지 표시 여부 (현재 MainMenu에 에너지 바 없음)
- **파일**: `src/scenes/MainMenuScene.js`, `src/components/TopBar.js`, `src/components/BottomNav.js`

#### F-4: GachaScene 데이터 흐름 검증
- **우선순위**: P0
- **검증 항목**:
  - 보석 소비: 단일(300), 10연차(2,700) 정확한 차감
  - 소환 결과: GachaSystem의 확률 테이블과 일치하는지
  - 천장(pity) 카운터: 90회 진행 시 SSR 확정
  - 픽업 배너: banners.json 데이터 반영
  - 소환 연출: N/R/SR/SSR 등급별 차별화 (현재 SSR/SR만?)
  - 결과 캐릭터 → ownedHeroes에 저장
  - 중복 캐릭터 → 캐릭터 조각(fragment) 변환
  - 장비 탭: 비활성화 상태("준비 중") → 활성화 필요
- **파일**: `src/scenes/GachaScene.js`, `src/systems/GachaSystem.js`, `src/data/banners.json`

#### F-5: HeroListScene 표시 로직 검증
- **우선순위**: P1
- **검증 항목**:
  - 보유 캐릭터 목록 정확히 표시
  - 정렬 기능: 등급순, 레벨순, 전투력순
  - 필터 기능: 교단별, 성격별, 역할별
  - HeroCard 컴포넌트: 올바른 데이터 바인딩 (이름, 등급색상, 레벨, 전투력)
  - 카드 터치 → HeroDetailScene 전환 (올바른 캐릭터 ID 전달)
  - 빈 목록 시 안내 메시지
- **파일**: `src/scenes/HeroListScene.js`, `src/components/HeroCard.js`

#### F-6: HeroDetailScene 육성 시스템 검증
- **우선순위**: P0
- **검증 항목**:
  - 레벨업: 경험치 물약 소비 → 레벨 증가 → 스탯 갱신
  - 스킬 강화: 스킬북 소비 → 스킬 레벨업 → 효과 증가
  - 진화(Evolution): 캐릭터 조각 소비 → 성급 증가
    - `HeroService.js:336` TODO: "조각 소모 로직 (InventoryService 연동)" 미구현
  - 장비 장착: 4슬롯(weapon/armor/accessory/relic) 동작
  - 장비 교체/해제 동작
  - 스탯 그래프(레이더 차트) 정확도
  - 성격/교단 정보 표시
  - 전투력 실시간 계산
- **파일**: `src/scenes/HeroDetailScene.js`, `src/services/HeroService.js`, `src/systems/EvolutionSystem.js`, `src/systems/EquipmentSystem.js`

#### F-7: StageSelectScene 전체 로직 검증
- **우선순위**: P0
- **검증 항목**:
  - 챕터 데이터: stages.json 기반 동적 로드 (하드코딩 제거 후)
  - 스테이지 잠금/해금: 이전 스테이지 클리어 기반
  - 클리어 별점 표시: SaveManager의 clearedStages 데이터
  - 파티 선택 모달: PartyManager 연동
  - autoFillParty: 자동 최강 파티 편성 동작
  - 전투 시작: 올바른 스테이지 데이터 → BattleScene 전달
  - 에너지 표시/차감: EnergySystem 연동 (연결 후)
  - 소탕 버튼: SweepSystem 연동 (추가 후)
  - 총 전투력 계산: 파티 4인 전투력 합산 정확도
- **파일**: `src/scenes/StageSelectScene.js`

#### F-8: BattleScene 전체 로직 검증
- **우선순위**: P0
- **검증 항목**:
  - 전투 초기화: 아군/적 유닛 생성 (스탯 정확도)
  - 턴 순서: SPD 기반 정렬 정확도
  - 스킬 카드: 덱에서 3장 드로우, 선택 시 효과 적용
  - 데미지 계산: ATK - DEF + 랜덤 요소 + 성격 상성 (연결 후)
  - HP 바: 실시간 갱신
  - 자동전투 토글: 수동↔자동 전환
  - 배속: 1x/2x/3x 실제 속도 변경
  - 전투 종료 조건: 전멸 판정 정확도
  - 승리 시: 보상 지급, 별점 계산, 스테이지 클리어 기록
  - 패배 시: 결과 화면, 재도전 옵션
  - 시너지 표시: SynergyDisplay 데이터 정확도
- **파일**: `src/scenes/BattleScene.js`, `src/systems/BattleSystem.js`

#### F-9: 공통 컴포넌트 일관성 검증
- **우선순위**: P1
- **검증 항목**:
  - Button: 터치/클릭 반응, 비활성 상태, 그라데이션 스타일
  - Panel: 배경 처리, 둥근 모서리(12px), 그림자
  - TopBar: 재화 표시 갱신, 레이아웃 일관성
  - BottomNav: 선택 상태 표시, 아이콘 정확도, 새 탭 추가 대응
  - Modal: 오버레이 터치 닫기, 애니메이션
  - Toast: 자동 소멸 타이머, 위치 일관성
  - ProgressBar: 퍼센트 정확도, 색상 변화
  - StarRating: 1~6성 표시 (진화 포함)
  - StatBar: min/max 범위 표시 정확도
  - EnergyBar: 실시간 업데이트, 회복 타이머
- **파일**: `src/components/*.js`

#### F-10: EventBus 이벤트 흐름 매핑
- **우선순위**: P1
- **검증 항목**:
  - 발행(emit)되는 모든 이벤트 목록 작성
  - 구독(on)하는 모든 이벤트 리스너 매핑
  - 이벤트 발행 → 구독 짝(pair) 매칭 확인
  - 구독만 있고 발행 없는 이벤트 (dead listener)
  - 발행만 있고 구독 없는 이벤트 (dead event)
  - Scene 전환 시 리스너 해제(cleanup) 확인 → 메모리 누수 방지
  - constants.js의 EVENTS 상수와 실제 사용 일치
- **파일**: `src/systems/EventBus.js`, `src/utils/constants.js`, 모든 Scene/System 파일

---

## 실행 계획 (Phase)

### Phase 1: 기반 통합 (1주차)
| 우선순위 | TASK | 팀 | 의존성 |
|----------|------|-----|--------|
| P0 | A-1: systems/index.js 완전 export | A | 없음 |
| P0 | C-1: Element→Personality 마이그레이션 | C | 없음 |
| P0 | C-2: 가챠 확률 PRD 일치화 | C | 없음 |
| P0 | E-1: 기존 캐릭터 데이터 감사 | E | 없음 |
| P0 | F-1: BootScene 로직 검증 | F | 없음 |
| P0 | F-3: MainMenuScene 검증 | F | 없음 |
| P0 | F-4: GachaScene 검증 | F | C-2 |
| P0 | G-1: DebugManager require→import 마이그레이션 | G | 없음 |
| P0 | G-2: clearAllStages stages.json 연동 | G | 없음 |

### Phase 2: 핵심 통합 (2주차)
| 우선순위 | TASK | 팀 | 의존성 |
|----------|------|-----|--------|
| P0 | A-2: PersonalitySystem→BattleScene | A | A-1, C-1 |
| P0 | B-2: StageSelectScene→stages.json | B | 없음 |
| P0 | B-3: EnergySystem→StageSelectScene | B | A-1 |
| P0 | E-2: 누락 캐릭터 42명 설계 | E | E-1 |
| P0 | F-6: HeroDetailScene 육성 검증 | F | 없음 |
| P0 | F-7: StageSelectScene 검증 | F | B-2, B-3 |
| P0 | F-8: BattleScene 검증 | F | A-2 |

### Phase 3: 확장 (3주차)
| 우선순위 | TASK | 팀 | 의존성 |
|----------|------|-----|--------|
| P1 | A-3: SynergySystem 완전 통합 | A | A-2 |
| P1 | A-4: 별점 성과 기반 계산 | A | A-2 |
| P1 | A-5: 카드 덱 밸런스 검증 | A | A-2 |
| P1 | A-7: 전투 결과 보상 연결 | A | A-2 |
| P1 | B-1: TowerScene 신규 생성 | B | A-1 |
| P1 | B-4: SweepSystem UI | B | B-3 |
| P1 | C-3: Supabase SQL 검증 | C | 없음 |
| P1 | C-4: 하이브리드 저장 시스템 | C | C-3 |
| P1 | E-3: 스탯 밸런스 설계 | E | E-2 |
| P1 | E-4: 스킬 데이터 확장 | E | E-2 |
| P1 | E-5: 장비 데이터 확장 | E | E-1 |
| P1 | F-2: PreloadScene 검증 | F | 없음 |
| P1 | F-5: HeroListScene 검증 | F | 없음 |
| P1 | F-9: 공통 컴포넌트 검증 | F | 없음 |
| P1 | F-10: EventBus 흐름 매핑 | F | 없음 |
| P1 | G-3: 에너지 시스템 치트 API | G | G-1 |
| P1 | G-4: 가챠 시스템 치트 API | G | G-1 |
| P1 | G-5: 장비 시스템 치트 API | G | G-1 |
| P1 | G-6: 무한의 탑 치트 API | G | G-1 |
| P1 | G-7: 소탕 & 퀘스트 치트 API | G | G-1 |
| P1 | H-1: UI 디자인 시스템 정립 | H | 없음 |
| P1 | H-2: 영웅 이미지 에셋 시스템 | H | 없음 |
| P1 | H-3: 가챠 소환 연출 디자인 | H | 없음 |
| P1 | H-4: 전투 이펙트 & 애니메이션 | H | 없음 |
| P1 | D-1: Scene 전환 흐름 테스트 | D | Phase 2 완료 |
| P1 | D-2: 전투 E2E 테스트 | D | A-2, B-3 |
| P1 | D-3: 가챠 확률 시뮬레이션 | D | C-2 |

### Phase 4: 폴리싱 (4주차)
| 우선순위 | TASK | 팀 | 의존성 |
|----------|------|-----|--------|
| P2 | A-6: 자동전투 AI 개선 | A | A-5 |
| P2 | B-5: LoginScene 신규 | B | 없음 |
| P2 | B-6: QuestScene 신규 | B | 없음 |
| P2 | B-7: 장비 가챠 활성화 | B | E-5 |
| P2 | C-5: 오프라인 보상 검증 | C | 없음 |
| P2 | E-6: 적 데이터 확장 | E | 없음 |
| P2 | E-7: 시너지 데이터 확장 | E | 없음 |
| P2 | G-8: 세이브 & 시간 치트 API | G | G-1 |
| P2 | G-9: 성격/시너지/파티 치트 API | G | G-1 |
| P2 | G-10: 디버그 콘솔 UI 확장 | G | G-3~G-9 |
| P2 | H-5: 메인 로비 & Scene 전환 연출 | H | H-1 |
| P2 | H-6: HeroCard & 등급 프레임 디자인 | H | H-1, H-2 |
| P2 | H-8: 반응형 & 모바일 터치 UX | H | H-1 |
| P2 | D-4: Vite 빌드 최적화 | D | 없음 |
| P2 | D-5: 크로스 브라우저 테스트 | D | Phase 3 완료 |
| P3 | A-8: 전투 이펙트 폴리싱 | A | A-5, H-4 |
| P3 | C-6: 쿠폰 시스템 UI | C | 없음 |
| P3 | C-7: 디버그 매니저 통합 | C | G-10 |
| P3 | E-8: 캐릭터 비주얼 가이드 | E | E-2, H-2 |
| P3 | H-7: 사운드 & BGM 에셋 계획 | H | 없음 |

---

## TASK 총괄 요약

| 팀 | P0 | P1 | P2 | P3 | 합계 |
|----|----|----|----|----|------|
| TEAM A: 전투 통합 | 2 | 4 | 1 | 1 | **8** |
| TEAM B: 신규 씬 & UI | 3 | 1 | 3 | 0 | **7** |
| TEAM C: 데이터 & 백엔드 | 2 | 2 | 1 | 2 | **7** |
| TEAM D: 통합 QA | 0 | 3 | 2 | 0 | **5** |
| TEAM E: 캐릭터 데이터 설계 | 2 | 3 | 2 | 1 | **8** |
| TEAM F: 씬/패널 로직 검증 | 5 | 5 | 0 | 0 | **10** |
| TEAM G: 치트 API 개발 | 2 | 5 | 3 | 0 | **10** |
| **합계** | **16** | **23** | **12** | **4** | **55** |

---

## TEAM G: 치트 API 개발팀 (Cheat API Development Team)

### 역할
모든 게임 시스템에 대한 개발/테스트용 치트 API를 설계하고,
DebugManager를 확장하여 콘솔 및 인게임 디버그 UI에서 접근 가능하게 합니다.
QA팀(TEAM D)과 로직 검증팀(TEAM F)의 테스트 효율을 극대화합니다.

### 팀 구성
| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `architect` | opus | 치트 API 아키텍처 설계, 보안 검증 |
| 분석가 | `explore-medium` | sonnet | 기존 DebugManager/시스템 API 분석 |
| 개발자 | `executor` | sonnet | 치트 API 구현 |
| 개발자 (보조) | `executor-low` | haiku | 단순 래퍼 함수 작성 |
| 보안 | `security-reviewer-low` | haiku | 프로덕션 노출 방지 검증 |

### 현재 DebugManager 상태 (src/systems/DebugManager.js)

**구현 완료 (20개 메서드):**
| 카테고리 | 메서드 | 상태 |
|----------|--------|------|
| 시스템 | `setDebugMode(enabled)` | ✅ 동작 |
| 리소스 | `addGold(amount)` | ✅ 동작 |
| 리소스 | `addGems(amount)` | ✅ 동작 |
| 리소스 | `addSummonTickets(amount)` | ✅ 동작 |
| 리소스 | `maxResources()` | ✅ 동작 |
| 캐릭터 | `unlockAllCharacters()` | ✅ 동작 |
| 캐릭터 | `setCharacterLevel(charId, level)` | ✅ 동작 |
| 캐릭터 | `maxAllSkills(charId)` | ✅ 동작 |
| 캐릭터 | `setCharacterStars(charId, stars)` | ✅ 동작 |
| 진행도 | `clearAllStages()` | ⚠️ 10챕터x10스테이지 하드코딩 (stages.json과 불일치) |
| 진행도 | `skipToChapter(chapter)` | ⚠️ 동일 하드코딩 문제 |
| 전투 | `setInvincible(enabled)` | ✅ 동작 (BattleScene 연결 필요) |
| 전투 | `setOneHitKill(enabled)` | ✅ 동작 (BattleScene 연결 필요) |
| 전투 | `setBattleSpeed(speed)` | ✅ 동작 |
| 로그 | `log(category, message, data)` | ✅ 동작 |
| UI | `showDebugUI(scene)` | ✅ 동작 |
| 코드 | `processCheatCode(code)` | ✅ 동작 |

**치명적 버그:**
- `require()` 사용 (CJS) → 프로젝트가 ES Modules → **런타임 에러 발생**
- `clearAllStages()`/`skipToChapter()`: 10챕터x10스테이지 하드코딩 → stages.json(5x5)과 불일치

### TASK 목록

#### G-1: DebugManager require() → import() 마이그레이션
- **우선순위**: P0
- **현재 상태**: 모든 내부 호출이 `require('./SaveManager.js')`, `require('../data/index.js')` 사용
- **문제**: 프로젝트가 ES Modules (type: "module") → require()는 런타임 에러
- **목표**: 
  - 파일 상단에 static import 또는 dynamic import()로 변환
  - 모든 치트 메서드 정상 동작 확인
- **파일**: `src/systems/DebugManager.js`

#### G-2: clearAllStages/skipToChapter stages.json 연동
- **우선순위**: P0
- **현재 상태**: 10챕터x10스테이지 하드코딩, stages.json은 5챕터x5스테이지
- **목표**: 
  - stages.json 데이터 기반 동적 스테이지 ID 생성
  - 챕터별 올바른 스테이지 수 반영
- **파일**: `src/systems/DebugManager.js`

#### G-3: 에너지 시스템 치트 API
- **우선순위**: P1
- **현재 상태**: EnergySystem에 addEnergy(), consumeEnergy() 존재, DebugManager에 치트 없음
- **목표**:
  ```javascript
  // 에너지 관련 치트
  static refillEnergy()                    // 에너지 최대치로 충전
  static setEnergy(amount)                 // 에너지 특정 값 설정
  static setInfiniteEnergy(enabled)        // 무한 에너지 모드
  static setEnergyRecoverySpeed(multiplier) // 회복 속도 배율 (1x~100x)
  ```
- **파일**: `src/systems/DebugManager.js`

#### G-4: 가챠 시스템 치트 API
- **우선순위**: P1
- **현재 상태**: GachaSystem에 simulate() 존재, DebugManager에 가챠 치트 없음
- **목표**:
  ```javascript
  // 가챠 관련 치트
  static setPityCounter(count)             // 천장 카운터 강제 설정
  static setNextPullRarity(rarity)         // 다음 소환 등급 강제 (N/R/SR/SSR)
  static setNextPullCharacter(charId)      // 다음 소환 캐릭터 강제 지정
  static freeGacha(enabled)                // 무료 소환 모드
  static simulateGacha(count)              // N회 소환 시뮬레이션 (결과 로그)
  static resetPity()                       // 천장 카운터 리셋
  static forcePickup(enabled)              // 픽업 확정 모드
  ```
- **파일**: `src/systems/DebugManager.js`, `src/systems/GachaSystem.js`

#### G-5: 장비 시스템 치트 API
- **우선순위**: P1
- **현재 상태**: EquipmentSystem에 createEquipment(), enhance() 존재, 치트 없음
- **목표**:
  ```javascript
  // 장비 관련 치트
  static giveEquipment(equipId)            // 특정 장비 지급
  static giveRandomEquipment(rarity, slot) // 랜덤 장비 생성 지급
  static giveAllEquipment()                // 모든 장비 지급
  static maxEnhanceEquipment(equipId)      // 장비 강화 MAX (+15)
  static maxEnhanceAllEquipment()          // 보유 전 장비 강화 MAX
  static setEnhanceAlwaysSuccess(enabled)  // 강화 100% 성공
  ```
- **파일**: `src/systems/DebugManager.js`, `src/systems/EquipmentSystem.js`

#### G-6: 무한의 탑 치트 API
- **우선순위**: P1
- **현재 상태**: TowerSystem에 jumpToFloor(), resetTower() 존재, DebugManager에 치트 없음
- **목표**:
  ```javascript
  // 무한의 탑 관련 치트
  static setTowerFloor(floor)              // 현재 층 강제 설정
  static clearTowerFloors(fromFloor, toFloor) // 범위 층 클리어
  static clearAllTowerFloors()             // 전 층 클리어
  static resetTower()                      // 탑 진행도 리셋
  static setTowerDifficulty(multiplier)    // 난이도 배율 설정
  ```
- **파일**: `src/systems/DebugManager.js`, `src/systems/TowerSystem.js`

#### G-7: 소탕 & 퀘스트 치트 API
- **우선순위**: P1
- **현재 상태**: SweepSystem에 addSweepTickets() 존재, QuestSystem에 claimAllRewards() 존재
- **목표**:
  ```javascript
  // 소탕 관련 치트
  static addSweepTickets(amount)           // 소탕권 추가
  static setInfiniteSweeps(enabled)        // 무한 소탕 모드
  static resetDailySweepCount()            // 일일 소탕 횟수 리셋
  
  // 퀘스트 관련 치트
  static completeAllDailyQuests()          // 일일 퀘스트 전체 완료
  static completeAllWeeklyQuests()         // 주간 퀘스트 전체 완료
  static completeAllAchievements()         // 업적 전체 완료
  static claimAllQuestRewards()            // 미수령 보상 전체 수령
  static resetDailyQuests()                // 일일 퀘스트 리셋
  static resetWeeklyQuests()               // 주간 퀘스트 리셋
  ```
- **파일**: `src/systems/DebugManager.js`, `src/systems/SweepSystem.js`, `src/systems/QuestSystem.js`

#### G-8: 세이브 & 시간 치트 API
- **우선순위**: P2
- **현재 상태**: SaveManager에 exportSaveData(), importSaveData(), reset() 존재
- **목표**:
  ```javascript
  // 세이브 관련 치트
  static exportSave()                      // 세이브 JSON 다운로드
  static importSave(jsonString)            // 세이브 JSON 업로드
  static resetAllData()                    // 전체 데이터 초기화
  static createBackup(slotName)            // 백업 슬롯 생성
  static loadBackup(slotName)              // 백업 슬롯 로드
  
  // 시간 관련 치트
  static fastForwardOffline(hours)         // 오프라인 보상 N시간 빨리감기
  static setLastOnlineTime(hoursAgo)       // 마지막 접속 시간 변경
  static resetDailyTimers()                // 일일 리셋 타이머 초기화
  ```
- **파일**: `src/systems/DebugManager.js`, `src/systems/SaveManager.js`

#### G-9: 성격 & 시너지 & 파티 치트 API
- **우선순위**: P2
- **현재 상태**: PersonalitySystem, SynergySystem, PartyManager 존재, 치트 없음
- **목표**:
  ```javascript
  // 성격 상성 치트
  static setPersonalityAdvantage(enabled)  // 항상 상성 유리
  static viewPersonalityMatchup(a, b)      // 두 성격 상성 확인
  static logAllMatchups()                  // 전체 상성표 로그
  
  // 시너지 치트
  static viewActiveSynergies(partyIds)     // 파티의 활성 시너지 확인
  static forceSynergyBonus(synergyId)      // 특정 시너지 강제 활성화
  static logAllSynergies()                 // 전체 시너지 목록 로그
  
  // 파티 치트
  static autoOptimalParty()                // 최적 파티 자동 편성
  static setPartyMaxSlots(count)           // 파티 슬롯 수 변경 (테스트용)
  static clearParty()                      // 파티 초기화
  ```
- **파일**: `src/systems/DebugManager.js`

#### G-10: 디버그 콘솔 UI & 치트코드 확장
- **우선순위**: P2
- **현재 상태**: showDebugUI()에 8개 버튼, processCheatCode()에 8개 코드
- **목표**:
  ```javascript
  // 확장된 디버그 UI
  static showDebugUI(scene) {
    // 카테고리별 탭 UI:
    // [리소스] [캐릭터] [전투] [진행도] [에너지] [가챠] [장비] [탑] [시간]
    // 각 탭에 관련 치트 버튼 배치
    // 실시간 상태 표시 패널 (현재 리소스, 에너지, 천장 카운터 등)
  }
  
  // 확장된 치트코드
  static CHEAT_CODES = {
    // 기존
    'GOLDRAIN':    () => this.addGold(999999),
    'GEMSTORM':    () => this.addGems(99999),
    'SUMMONALL':   () => this.addSummonTickets(100),
    'GODMODE':     () => this.setInvincible(true),
    'ONEPUNCH':    () => this.setOneHitKill(true),
    'SPEEDUP':     () => this.setBattleSpeed(3.0),
    'UNLOCKALL':   () => this.unlockAllCharacters(),
    'CLEARALL':    () => this.clearAllStages(),
    // 신규
    'ENERGYMAX':   () => this.refillEnergy(),
    'INFINERGY':   () => this.setInfiniteEnergy(true),
    'SSRFORCE':    () => this.setNextPullRarity('SSR'),
    'FREEPULL':    () => this.freeGacha(true),
    'PITY0':       () => this.setPityCounter(0),
    'PITY89':      () => this.setPityCounter(89),      // 다음 SSR 확정
    'GEARMAX':     () => this.maxEnhanceAllEquipment(),
    'GEARALL':     () => this.giveAllEquipment(),
    'TOWER100':    () => this.setTowerFloor(100),
    'QUESTDONE':   () => this.completeAllDailyQuests(),
    'SWEEP999':    () => this.addSweepTickets(999),
    'TIMETRAVEL':  () => this.fastForwardOffline(24),
    'MAXALL':      () => this.maxEverything(),          // 모든 것 최대치
    'NEWGAME':     () => this.resetAllData(),
    'BACKUP':      () => this.createBackup('debug'),
  };
  
  // 브라우저 콘솔 접근용 글로벌 등록
  static registerGlobalDebug() {
    window.debug = this;
    window.cheat = this;
    console.log('%c[ArcaneCollectors Debug]', 'color: #e74c3c; font-size: 16px;');
    console.log('Type debug.help() for available commands');
  }
  
  // 도움말
  static help() {
    console.table({
      '리소스': 'addGold(n), addGems(n), maxResources()',
      '캐릭터': 'unlockAllCharacters(), setCharacterLevel(id, lv)',
      '전투': 'setInvincible(true), setOneHitKill(true)',
      '에너지': 'refillEnergy(), setInfiniteEnergy(true)',
      '가챠': 'setPityCounter(89), freeGacha(true)',
      '장비': 'giveAllEquipment(), maxEnhanceAllEquipment()',
      '탑': 'setTowerFloor(100), clearAllTowerFloors()',
      '퀘스트': 'completeAllDailyQuests(), claimAllQuestRewards()',
      '세이브': 'exportSave(), resetAllData()',
      '시간': 'fastForwardOffline(24)',
    });
  }
  ```
- **파일**: `src/systems/DebugManager.js`

---

### 치트 API 전체 매핑표

| 게임 기능 | 기존 치트 (구현됨) | 신규 치트 (추가 필요) | 담당 TASK |
|-----------|-------------------|---------------------|-----------|
| **리소스** | addGold, addGems, addSummonTickets, maxResources | - | - |
| **캐릭터** | unlockAllCharacters, setCharacterLevel, maxAllSkills, setCharacterStars | maxAllCharacterLevels, addFragments | G-1 |
| **전투** | setInvincible, setOneHitKill, setBattleSpeed | forcePersonalityAdvantage, forceCritical | G-9 |
| **스테이지** | clearAllStages, skipToChapter | - (기존 버그 수정) | G-2 |
| **에너지** | 없음 | refillEnergy, setEnergy, infiniteEnergy, recoverySpeed | G-3 |
| **가챠** | 없음 | setPity, forceRarity, forceCharacter, freeGacha, simulate | G-4 |
| **장비** | 없음 | giveEquipment, giveAll, maxEnhance, alwaysSuccess | G-5 |
| **무한의 탑** | 없음 | setFloor, clearFloors, clearAll, resetTower, difficulty | G-6 |
| **소탕** | 없음 | addTickets, infiniteSweeps, resetDaily | G-7 |
| **퀘스트** | 없음 | completeDaily, completeWeekly, completeAchievements, claimAll, reset | G-7 |
| **세이브** | 없음 | export, import, reset, backup, load | G-8 |
| **시간** | 없음 | fastForward, setLastOnline, resetTimers | G-8 |
| **성격 상성** | 없음 | forceAdvantage, viewMatchup, logAll | G-9 |
| **시너지** | 없음 | viewActive, forceBonus, logAll | G-9 |
| **파티** | 없음 | autoOptimal, setMaxSlots, clear | G-9 |
| **디버그 UI** | showDebugUI (8버튼) | 카테고리 탭 UI, 상태 패널, 콘솔 등록 | G-10 |
| **치트코드** | 8개 코드 | 17개 추가 (총 25개) | G-10 |

### 콘솔 접근 설계

```
개발 모드 활성화:
  1. 브라우저 콘솔에서: window.debug.setDebugMode(true)
  2. 인게임: 설정 → 버전 정보 5회 터치 → 디버그 모드 활성화
  3. URL 파라미터: ?debug=true (개발 환경만)

사용 예시:
  > debug.help()                    // 명령어 목록
  > debug.maxResources()            // 재화 만렙
  > debug.unlockAllCharacters()     // 전캐릭터 해금
  > debug.setPityCounter(89)        // 다음 소환 SSR 확정
  > debug.refillEnergy()            // 에너지 풀충전
  > debug.fastForwardOffline(24)    // 24시간 오프라인 보상
  > debug.exportSave()              // 세이브 백업
```

### 보안 고려사항
- 프로덕션 빌드에서 DebugManager 코드 제거 (tree-shaking 또는 빌드 플래그)
- `import.meta.env.DEV` 체크로 개발 환경만 활성화
- 콘솔 글로벌 등록(`window.debug`)은 개발 모드만
- Supabase 서버사이드 검증으로 클라이언트 치트 방지 (온라인 모드)

---

## TEAM H: 디자인 & 에셋팀 (Design & Asset Team)

### 역할
게임 내 연출, 애니메이션, UI 디자인, 영웅 일러스트를 담당합니다.
레퍼런스 에셋 수집과 AI 생성형 이미지를 활용하여 시각적 완성도를 높입니다.

### 팀 구성
| 역할 | 에이전트 | 모델 | 담당 |
|------|----------|------|------|
| **팀장** | `designer-high` | opus | 비주얼 아트 디렉션, 디자인 시스템 총괄 |
| UI 설계자 | `designer` | sonnet | UI 컴포넌트 스타일링, 레이아웃 |
| 비전 분석 | `vision` | sonnet | 레퍼런스 이미지 분석, 비주얼 검증 |
| 연구원 | `researcher` | sonnet | 에셋 소스 탐색, AI 이미지 생성 프롬프트 |
| 개발자 | `executor` | sonnet | CSS/Phaser 스타일 코드, 애니메이션 구현 |

### TASK 목록

#### H-1: UI 디자인 시스템 정립
- **우선순위**: P1
- **현재 상태**: gameConfig.js에 COLORS 정의, 컴포넌트별 스타일 파편화
- **목표**:
  - **컬러 팔레트** 통합 관리:
    - Primary: #6366F1 (인디고), Secondary: #EC4899 (핑크)
    - Background: #0F172A → #1E293B (다크 그라데이션)
    - Accent: #F59E0B (골드), Text: #F8FAFC
    - 등급 컬러: N(#9CA3AF), R(#3B82F6), SR(#A855F7), SSR(#F59E0B)
  - **타이포그래피** 표준화:
    - 제목: Bold 24px, 본문: Regular 14px, 숫자: Mono
  - **컴포넌트 스타일 가이드**: 둥근 모서리(12px), 그라데이션 버튼, 글로우 이펙트
  - `src/utils/textStyles.js` 확장
- **파일**: `src/config/gameConfig.js`, `src/utils/textStyles.js`, `src/utils/drawUtils.js`

#### H-2: 영웅 이미지 에셋 시스템
- **우선순위**: P1
- **현재 상태**: 캐릭터 이미지 placeholder 또는 미구현
- **목표**:
  - **AI 생성 파이프라인 설계**:
    - Stable Diffusion / Midjourney / DALL-E 프롬프트 템플릿
    - 교단별 비주얼 가이드:
      - olympus: 그리스 신전, 흰금색 토가, 월계관
      - takamagahara: 일본 신사, 기모노/갑옷, 벚꽃
      - valhalla: 북유럽 빙하, 바이킹 갑옷, 룬 문양
      - asgard: 신전 금빛, 빛나는 오라, 왕관
      - yomi: 명계 어둠, 영적 불꽃, 일본 귀신 모티브
    - 등급별 퀄리티: SSR(전신+배경), SR(전신), R(반신), N(아이콘)
    - 2.5등신 SD 스타일 (PRD_Character_Design.md 기준)
  - **n8n 워크플로우 활용**: 기존 이미지 생성 파이프라인 연동
  - **Pexels API 활용**: pexelsClient.js로 배경/분위기 레퍼런스 수집
  - **fallback**: 컬러 실루엣 + 이름 텍스트 (이미지 없을 때)
- **파일**: `n8n/`, `src/api/pexelsClient.js`, `public/assets/heroes/`
- **산출물**: 프롬프트 가이드 문서, 최소 10장 테스트 이미지

#### H-3: 가챠 소환 연출 디자인
- **우선순위**: P1
- **현재 상태**: GachaScene에 기본 애니메이션, 등급별 차별화 미흡
- **목표**:
  - **등급별 연출 차별화**:
    - N: 간단한 빛 (회색/파랑) → 0.5초
    - R: 파란 마법진 회전 → 1초
    - SR: 보라색 마법진 + 파티클 → 1.5초
    - SSR: 금빛 폭발 + 화면 전환 + 캐릭터 전신 등장 → 3초
  - **마법진 이펙트**: Phaser 파티클 시스템 활용
  - **컷인 연출**: SSR 전용 캐릭터 등장 애니메이션
  - **10연차 결과 화면**: 카드 뒤집기 연출
  - **스킵 기능**: 터치로 연출 스킵
- **파일**: `src/scenes/GachaScene.js`, `src/utils/animations.js`

#### H-4: 전투 이펙트 & 애니메이션
- **우선순위**: P1
- **현재 상태**: 기본 전투 애니메이션, 스킬별 차별화 부족
- **목표**:
  - **스킬 이펙트**:
    - 기본 공격: 슬래시/임팩트 이펙트
    - 마법 공격: 원소(성격) 컬러 파티클
    - 힐: 초록색 빛기둥 상승
    - 궁극기: 화면 전환 + 컷인 + 풀스크린 이펙트
  - **데미지 숫자 연출**:
    - 일반: 흰색 팝업
    - 크리티컬: 빨강 크게 + 흔들림
    - 상성 유리: 노란색 + 화살표↑
    - 상성 불리: 파란색 + 화살표↓
    - 힐: 초록색
  - **전투 전환 연출**: 페이드인/아웃, 파티 등장 애니메이션
  - **승리/패배 화면**: 결과 카드 + 보상 아이템 드롭 연출
- **파일**: `src/scenes/BattleScene.js`, `src/utils/animations.js`, `src/utils/drawUtils.js`

#### H-5: 메인 로비 & Scene 전환 연출
- **우선순위**: P2
- **현재 상태**: Scene 전환이 즉시 변경 (fade 없음 또는 최소)
- **목표**:
  - **메인 로비**:
    - 배경: 판타지 길드 홀 일러스트 (AI 생성 또는 레퍼런스)
    - 대표 캐릭터: idle 흔들림 애니메이션 (Live2D 스타일 시뮬레이션)
    - 터치 반응: 바운스 + 대사 말풍선
    - 시간대별 배경 변화 (선택)
  - **Scene 전환**:
    - 공통 페이드 트랜지션 (0.3초)
    - 전투 진입: 문이 열리는 연출
    - 소환 진입: 마법진 확대 연출
  - **파티클 시스템**: 별/꽃잎/마법진 배경 파티클
- **파일**: `src/scenes/MainMenuScene.js`, `src/scenes/PreloadScene.js`

#### H-6: HeroCard & 등급 프레임 디자인
- **우선순위**: P2
- **현재 상태**: HeroCard 컴포넌트 존재, 등급별 프레임 차별화 미흡
- **목표**:
  - **등급별 카드 프레임**:
    - N: 회색 단색 프레임
    - R: 파란 프레임 + 은색 테두리
    - SR: 보라 그라데이션 프레임 + 빛남 이펙트
    - SSR: 금색 프레임 + 홀로그램 효과 + 파티클
  - **영웅 상세 화면**: 전신 일러스트 + 배경 연출
  - **카드 획득 애니메이션**: 카드 뒤집기 + 등급 이펙트
  - **교단별 배경 색상**: 카드/상세 화면에 교단 테마 반영
- **파일**: `src/components/HeroCard.js`, `src/scenes/HeroDetailScene.js`

#### H-7: 사운드 & BGM 에셋 계획
- **우선순위**: P3
- **현재 상태**: Howler.js 의존성 없음 (PRD에는 있지만 미구현)
- **목표**:
  - **BGM**: 로비, 전투, 보스전, 가챠 (무료 에셋 또는 AI 생성)
  - **SFX**: 버튼 클릭, 스킬 발동, 승리, 패배, 소환, 레벨업
  - **Howler.js 통합** 또는 Phaser 내장 사운드 시스템 활용
  - **음량 조절**: SaveManager.getSoundSettings() 연동
  - **무료 사운드 소스**: freesound.org, pixabay.com/sound-effects
  - **AI 사운드 생성**: Suno AI / Udio 활용 가능
- **파일**: `package.json`, `public/assets/sounds/`, `src/scenes/BootScene.js`

#### H-8: 반응형 & 모바일 터치 UX
- **우선순위**: P2
- **현재 상태**: 720x1280 고정 해상도, Scale.FIT
- **목표**:
  - 다양한 비율(16:9, 18:9, 20:9) 대응
  - 터치 영역 최소 44x44px 보장
  - 스와이프 제스처: 챕터 전환, 영웅 목록 스크롤
  - 롱프레스: 아이템/스킬 상세 정보 팝업
  - 햅틱 피드백 (지원 기기)
- **파일**: `src/config/gameConfig.js`, `src/config/layoutConfig.js`

---

## TASK 총괄 요약 (최종)

| 팀 | P0 | P1 | P2 | P3 | 합계 |
|----|----|----|----|----|------|
| TEAM A: 전투 통합 | 2 | 4 | 1 | 1 | **8** |
| TEAM B: 신규 씬 & UI | 3 | 1 | 3 | 0 | **7** |
| TEAM C: 데이터 & 백엔드 | 2 | 2 | 1 | 2 | **7** |
| TEAM D: 통합 QA | 0 | 3 | 2 | 0 | **5** |
| TEAM E: 캐릭터 데이터 설계 | 2 | 3 | 2 | 1 | **8** |
| TEAM F: 씬/패널 로직 검증 | 5 | 5 | 0 | 0 | **10** |
| TEAM G: 치트 API 개발 | 2 | 5 | 3 | 0 | **10** |
| TEAM H: 디자인 & 에셋 | 0 | 4 | 3 | 1 | **8** |
| **합계** | **16** | **27** | **15** | **5** | **63** |

---

## 팀간 의존성 다이어그램

```
TEAM H (디자인/에셋) ─────────────────────────────────┐
   │ H-2(영웅이미지) ──► E-8(비주얼가이드)             │
   │ H-3(가챠연출) ──► B-7(장비가챠)                   │
   │ H-4(전투이펙트) ──► A-8(전투폴리싱)               │
   │ H-6(카드디자인) ──► F-5(HeroList검증)             │
   ▼                                                    ▼
TEAM E (캐릭터 데이터) ─────► TEAM A (전투 통합)  TEAM G (치트 API)
   │                              │                     │
   │  E-5(장비) ──► B-7(장비가챠) │  G-3~9 ──► D,F     │
   │                              │  (테스트 지원)       │
   ▼                              ▼                     │
TEAM C (데이터/백엔드) ──► TEAM B (신규 씬)             │
   │                              │                     │
   │  C-1,C-2 ──► A-2,F-4       │                     │
   │                              │                     │
   ▼                              ▼                     ▼
TEAM F (로직 검증) ◄────── TEAM D (통합 QA) ◄──────────┘
```

### 팀간 관계 요약
- **TEAM H (디자인)**는 모든 팀의 시각적 요소를 지원, E/A/B/F에 에셋 제공
- **TEAM E (캐릭터 데이터)**는 A, B, F, H의 데이터 기반을 제공
- **TEAM C (데이터/백엔드)**는 데이터 정합성을 보장하여 A, B, F에 영향
- **TEAM G (치트 API)**는 D(QA)와 F(로직 검증)의 테스트 효율을 극대화
- **TEAM F (로직 검증)**는 A, B의 통합 결과를 검증
- **TEAM D (통합 QA)**는 모든 팀의 최종 결과물을 E2E 테스트
