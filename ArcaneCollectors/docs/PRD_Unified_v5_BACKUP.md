# ArcaneCollectors 통합 PRD v5.2

> 최종 업데이트: 2026-02-06
> PRD v1~v4 + Backend + Character Design 통합 및 GAP 분석 기반
> v5.1: 부록 A 사양 불일치 8항목 결정 완료
> v5.2: 속성(Element) 시스템 삭제, 성격→분위기(Mood) 리네이밍, 팀 문서화 에이전트 추가, Git Worktree 계획
> 상태: 개발 진행 중 (코드 ~97% 작성, 통합/상호작용 ~60% 완성)

---

## 1. 프로젝트 개요

### 1.1 기본 정보
| 항목 | 내용 |
|------|------|
| **프로젝트명** | Arcane Collectors (아르케인 컬렉터스) |
| **플랫폼** | Web (HTML5 + JavaScript) |
| **장르** | 방치형 수집 RPG |
| **해상도** | 720×1280 (9:16 세로, Phaser.Scale.FIT + CENTER_BOTH) |
| **엔진** | Phaser 3 (v3.80.1) |
| **빌드** | Vite 5 (dev port 3000) |
| **백엔드** | Supabase (PostgreSQL + Auth + Realtime) + localStorage 폴백 |
| **모듈** | ES Modules (type: "module") |
| **레퍼런스** | 블루아카이브(UI), 아크나이츠(세계관), AFK아레나(방치), 쿠키런킹덤(수집) |

### 1.2 세계관
다섯 신화의 교단이 충돌하는 판타지 세계. 플레이어는 각 교단의 영웅을 수집하고 육성하여 던전을 탐험하는 수집가(Collector).

### 1.3 교단 (Cult) 시스템 - 5개 진영
| 교단 | 신화 | 테마 컬러 | 비주얼 테마 |
|------|------|-----------|-------------|
| **Olympus** (올림포스) | 그리스 | #FFD700 골드 | 신전, 토가, 월계관 |
| **Takamagahara** (타카마가하라) | 일본 | #FF6B9D 핑크 | 신사, 기모노, 벚꽃 |
| **Valhalla** (발할라) | 북유럽 | #4FC3F7 빙하 | 바이킹, 룬, 빙하 |
| **Asgard** (아스가르드) | 북유럽 신전 | #AB47BC 보라 | 빛나는 갑옷, 오라, 왕관 |
| **Yomi** (요미) | 일본 명계 | #66BB6A 암록 | 영적 불꽃, 귀신 모티브 |

---

## 2. 핵심 게임 시스템

### 2.1 캐릭터 시스템

#### 등급 체계
| 등급 | 별 | 가챠 확률 | 기본 스탯 범위 | 최대 레벨 |
|------|-----|----------|---------------|-----------|
| **N** (2성) | ★★ | 60% | HP 300-400, ATK 30-40 | 40 |
| **R** (3성) | ★★★ | 30% | HP 500-700, ATK 50-80 | 50 |
| **SR** (4성) | ★★★★ | 8.5% | HP 800-1100, ATK 90-130 | 60 |
| **SSR** (5성) | ★★★★★ | 1.5% | HP 1200-1600, ATK 140-200 | 80 |

#### 분위기 (Mood) 시스템 — v4에서 Element 대체, v5.2에서 성격→분위기 리네이밍

> **변경 이력**: Element(속성) → Personality(성격) → **Mood(분위기)** 로 최종 확정
> **코드 필드명**: `mood` (기존 `personality` → `mood` 마이그레이션 필요)
> **컨셉**: 캐릭터의 전투 스타일과 존재감을 나타내는 "분위기/오라" 개념

| 분위기 | 한글명 | 유리 상대 | 불리 상대 | 배율 | 전투 스타일 |
|--------|--------|----------|----------|------|------------|
| **Brave** | 열혈 | Cunning | Wild | ×1.2 / ×0.8 | 공격적, 돌진형 |
| **Cunning** | 냉철 | Calm | Brave | ×1.2 / ×0.8 | 전략적, 약점 공략 |
| **Calm** | 고요 | Wild | Cunning | ×1.2 / ×0.8 | 방어적, 지구전형 |
| **Wild** | 광폭 | Brave | Calm | ×1.2 / ×0.8 | 속공형, 연타형 |
| **Mystic** | 신비 | 범용 +10% | 약점 없음 | ×1.1 | 특수효과, 마법형 |

> **상성 구조**: Brave → Cunning → Calm → Wild → Brave (순환), Mystic은 모든 상대에 ×1.1
> **기존 속성(Element) 시스템은 v5.2에서 완전 삭제됨** — fire/water/wind/light/dark 참조 119개 마이그레이션 필요

#### 역할 (Role)
| 역할 | 특성 | 스탯 경향 |
|------|------|----------|
| **Warrior** (전사) | 높은 HP/DEF, 근접 물리 | HP↑, DEF↑, ATK중 |
| **Mage** (마법사) | 높은 ATK, 원거리 마법 | ATK↑↑, HP↓, DEF↓ |
| **Archer** (궁수) | 높은 SPD, 원거리 물리 | SPD↑, ATK↑, HP중 |
| **Healer** (힐러) | 아군 회복, 버프 | HP중, DEF중, SPD↑ |

#### 캐릭터 데이터 스키마 (v5.2 확정)
```javascript
{
  id: "olympus_athena",        // {cult}_{name}
  name: "Athena",              // 영문 이름
  nameKo: "아테나",             // 한글 이름
  rarity: "SSR",               // N, R, SR, SSR
  mood: "calm",                // brave, cunning, calm, wild, mystic ← v5.2: personality→mood
  cult: "olympus",             // 교단
  role: "mage",                // warrior, mage, archer, healer
  baseStats: { hp: 1400, atk: 180, def: 90, spd: 105 },
  growthStats: { hp: 45, atk: 8, def: 3, spd: 1 },
  skills: ["skill_athena_basic", "skill_athena_active", "skill_athena_ultimate"],
  description: "지혜의 여신, 전략적 마법으로 전장을 지배한다",
  lore: "올림포스 최고의 전략가..."
  // ※ element 필드 삭제됨 (v5.2)
  // ※ personality → mood 리네이밍 (v5.2)
}
```

#### 현재 데이터 현황 & 목표
| 교단 | 현재 | 목표 | 누락 |
|------|------|------|------|
| Olympus | 9 | 16 | 7 |
| Takamagahara | 9 | 16 | 7 |
| Valhalla | 9 | 16 | 7 |
| **Asgard** | **3** | 16 | **13** |
| Yomi | 9 | 16 | 7 |
| **합계** | **39** | **81** | **42** |

등급 목표 분포: N:16 / R:24 / SR:24 / SSR:17

### 2.2 가챠 (소환) 시스템

#### 확률 테이블 (PRD v4 최종)
| 등급 | 확률 | 천장 |
|------|------|------|
| N | 60% | - |
| R | 30% | - |
| SR | 8.5% | - |
| SSR | 1.5% | 90회 확정 |

#### 소프트 피티 (Soft Pity)
- 70회부터 SSR 확률 점진적 증가
- 70회: +2%, 71회: +4%, ... 89회: +40%
- 90회: 100% SSR 확정

#### 비용
| 소환 타입 | 비용 | 비고 |
|-----------|------|------|
| 단일 소환 | 보석 300개 | - |
| 10연차 | 보석 2,700개 | 10% 할인 |
| 단일 티켓 | 소환권 1장 | - |
| 10연차 티켓 | 소환권 10장 | SR 이상 1회 보장 |

#### 픽업 배너
- 픽업 캐릭터 확률 UP (SSR 중 50% 픽업 대상)
- 180회 내 픽업 캐릭터 확정 (50/50 실패 시 보장)

#### ⚠️ 현재 구현 문제점
```
[치명적] GachaScene.rollGacha()가 GachaSystem을 사용하지 않음
- 인라인 확률: SSR:3%, SR:15%, R:50%, N:32% (PRD와 불일치)
- element 기반 랜덤 생성 → **mood 기반으로 교체 필요** (v5.2)
- characters.json 데이터를 사용하지 않고 랜덤 이름/스탯 생성
- GachaSystem의 소프트피티, 픽업, 배너 기능 완전 무시
→ 해결: GachaScene이 GachaSystem.pull()을 호출하도록 전면 교체

[치명적] 하드코딩 UI 텍스트 (동적이어야 함)
- 천장 카운터 "87/90" 하드코딩 (GachaScene:273) → registry.get('pityCounter') 사용
- 소환권 "5개 보유 중" 하드코딩 (GachaScene:297) → SaveManager 인벤토리 참조
- 표시 확률 "SSR 1.5%" (GachaScene:280) vs 실제 코드 확률 SSR 3% → 불일치

[치명적] GachaSystem.saveGachaInfo() 메서드가 SaveManager에 미존재
- GachaSystem.js:147에서 호출하지만 SaveManager에 해당 메서드 없음
→ 해결: SaveManager에 saveGachaInfo() 추가 또는 GachaSystem 저장 로직 수정
```

### 2.3 전투 시스템

#### 턴제 자동전투 + 카드덱 스킬
- **파티 구성**: 4인 편성
- **턴 순서**: SPD 기반 정렬
- **스킬 카드**: 매 턴 3장 드로우, 1장 선택
- **자동전투**: AI가 최적 카드 선택
- **배속**: 1x, 2x, 3x

#### 데미지 공식
```
baseDamage = ATK × skillMultiplier - DEF × 0.5
moodBonus = baseDamage × matchupMultiplier (±20%)
synergyBonus = baseDamage × synergyMultiplier
finalDamage = (baseDamage + moodBonus + synergyBonus) × random(0.9~1.1)
criticalDamage = finalDamage × 1.5 (critRate: 5% + SPD×0.1%)
```

#### 별점 계산 (클리어 평가)
```
3성: 전원 생존 AND 10턴 이내 클리어
2성: 과반 생존 (≥50%) OR 20턴 이내 클리어
1성: 클리어만 하면 달성
```

#### ⚠️ 현재 구현 문제점
```
[치명적] calculateElementBonus()가 fire/water/wind/light/dark 사용 → **삭제 후 calculateMoodBonus()로 교체** (v5.2)
- PersonalitySystem이 import/호출되지 않음
→ 해결: calculateElementBonus → calculateMoodBonus 교체 (v5.2: personality→mood)

[치명적] BattleSystem 클래스가 BattleScene에서 import조차 안 됨
- 전투 로직 전체가 BattleScene 내부 인라인 구현
→ 해결: BattleSystem 메서드를 BattleScene에서 호출하도록 리팩터링

[치명적] EXP 보상 UI 표시만 ("+50 EXP"), 영웅 데이터에 실제 미적용
- BattleScene:1362에서 텍스트 표시만, ProgressionSystem.addExp() 미호출
→ 해결: ProgressionSystem 연결 + 레벨업 체크

[중요] showBattleResult()에서 newStars = 3 하드코딩
→ 해결: 별점 계산 로직 구현

[중요] SynergySystem 미사용 (인라인 시너지 계산)
- BattleScene에서 자체 인라인으로 시너지 계산 (class 2+: ATK+10%, mood 2+: DEF+10%) ← element→mood 교체 필요
- SynergySystem 클래스의 교단/성격/역할/특수 시너지와 다름
→ 해결: 인라인 로직 제거, SynergySystem.calculate() 호출로 교체
```

### 2.4 에너지 시스템

#### 스펙
| 항목 | 값 |
|------|-----|
| 기본 최대 | 50 |
| 회복 속도 | 5분당 1 |
| 스테이지 비용 | 챕터 × 2 + 스테이지번호 |
| 보석 충전 | 50보석 → 최대 에너지 |
| 레벨 보너스 | 10레벨당 최대+5 |

#### ⚠️ 현재 구현 문제점
```
[치명적] StageSelectScene.startBattle()에서 에너지 체크/소비 없음
- EnergySystem 미 import
- "⚡ 50/50" 하드코딩 표시
→ 해결: startBattle() 전에 canEnterStage() 체크, consumeEnergy() 호출
```

### 2.5 소탕 (Sweep) 시스템

#### 스펙
- 조건: 해당 스테이지 3성 클리어
- 비용: 소탕권 1장 + 에너지 (스테이지 비용과 동일)
- 일일 한도: 50회
- 보상: 해당 스테이지 보상의 90%

#### ⚠️ 현재 구현 문제점
```
[치명적] UI 버튼이 어디에도 없음
- SweepSystem 완전 구현됨, 호출 경로 없음
→ 해결: StageSelectScene에 소탕 버튼 추가
```

### 2.6 무한의 탑 (Tower)

#### 스펙
- 최대 100층
- 10층마다 보스
- 보스 처치 시 장비 드롭
- 시즌 리셋 (선택적)

#### ⚠️ 현재 구현 문제점
```
[치명적] TowerScene.js 미존재
- TowerSystem(531줄) 완전 구현됨
- TowerSystem.jumpToFloor() 등 API 존재
→ 해결: TowerScene 신규 생성
```

### 2.7 장비 시스템

#### 슬롯
| 슬롯 | 주요 스탯 |
|------|----------|
| Weapon (무기) | ATK |
| Armor (방어구) | DEF, HP |
| Accessory (악세서리) | SPD, CritRate |
| Relic (유물) | 특수 효과 |

#### 강화
- 최대 +15
- 강화 비용: 골드 × (현재 강화 레벨 × 100)
- 성공률: +1~5(100%), +6~10(80%), +11~15(50%)

#### ⚠️ 현재 구현 문제점
```
[중요] equipment.json에 4개 아이템만 존재 (목표: 81개)
[중요] 장비 가챠 탭 비활성화 ("준비 중")
→ 해결: 데이터 확장 + 가챠 탭 활성화
```

### 2.8 스테이지 시스템

#### 구성
| 챕터 | 교단 테마 | 스테이지 수 | 보스 |
|------|----------|------------|------|
| Chapter 1 | Olympus | 5 | Zeus |
| Chapter 2 | Takamagahara | 5 | Amaterasu |
| Chapter 3 | Valhalla | 5 | Odin |
| Chapter 4 | Asgard | 5 | Thor |
| Chapter 5 | Yomi | 5 | Izanami |

#### ⚠️ 현재 구현 문제점
```
[치명적] StageSelectScene.generateStages()가 3챕터×10스테이지 하드코딩
- stages.json은 5챕터×5스테이지
→ 해결: generateStages() 제거, stages.json 동적 로드
```

### 2.9 시너지 시스템

#### 타입
| 시너지 타입 | 조건 | 효과 예시 |
|------------|------|----------|
| 교단 시너지 | 같은 교단 2/3/4인 | ATK+10%/+20%/+30% |
| 성격 시너지 | 특정 성격 조합 | 다양한 버프 |
| 역할 시너지 | 특정 역할 조합 | 밸런스 보너스 |
| 특수 시너지 | 특정 캐릭터 조합 | 고유 효과 |

### 2.10 퀘스트 시스템

| 타입 | 갱신 | 개수 | 보상 |
|------|------|------|------|
| 일일 | 매일 00:00 | 5개 | 보석, 골드, 소환권 |
| 주간 | 매주 월요일 | 3개 | 보석(대), 소환권, 장비 |
| 업적 | 영구 | 5개+ | 칭호, 보석, 특수 아이템 |

### 2.11 오프라인 보상

| 항목 | 시간당 | 상한 |
|------|--------|------|
| 골드 | 100 | 24시간 (2,400) |
| 경험치 | 50 | 24시간 (1,200) |
| 장비 파편 | 5 | 24시간 (120) |

---

## 3. 기술 아키텍처

### 3.1 프로젝트 구조
```
src/
├── main.js              # 진입점 (Phaser.Game 초기화)
├── api/                 # 외부 API (supabaseClient, pexelsClient)
├── config/              # 설정 (gameConfig, layoutConfig)
├── data/                # JSON 데이터 + index.js 접근 함수
├── scenes/              # Phaser Scene (8개 → 12개 확장 예정)
├── systems/             # 게임 로직 시스템 (17개, 싱글톤)
├── services/            # Supabase 연동 서비스 (7개)
├── components/          # UI 컴포넌트 (13개 + battle/ 3개)
└── utils/               # 유틸리티 (constants, helpers, animations, draw, textStyles)
```

### 3.2 아키텍처 패턴
- **Scene 기반**: Phaser.Scene 상속, 화면 단위 관리
- **System 싱글톤**: 각 시스템은 싱글톤 인스턴스로 export
- **Service 함수**: Supabase 연동은 함수 기반 export
- **Component Container**: Phaser.GameObjects.Container 상속 UI
- **EventBus**: 커스텀 Pub/Sub로 시스템간 통신
- **Barrel Export**: index.js를 통한 모듈 접근

### 3.3 ⚠️ 아키텍처 문제점

#### 치명적 (CRITICAL)
```
[C1] systems/index.js: 17개 시스템 중 4개만 export
[C2] DebugManager: require() 사용 (ES Module 환경에서 런타임 에러)
[C3] GachaScene: GachaSystem 미사용, 자체 인라인 로직 사용 (확률 불일치)
[C4] GachaScene: 천장 카운터 "87/90" 하드코딩 (registry 미참조)
[C5] GachaScene: 소환권 "5개 보유 중" 하드코딩 (실제 수량 무관)
[C6] GachaScene: 표시 확률(SSR 1.5%) ≠ 실제 코드 확률(SSR 3%)
[C7] HeroDetailScene: 레벨업/진화/스킬강화 시 SaveManager 미호출 (새로고침 시 골드 복원)
[C8] BattleScene: EXP UI 표시만, 영웅 데이터에 실제 미적용
[C9] GachaSystem.saveGachaInfo(): SaveManager에 해당 메서드 미존재 → 연결 시 에러
```

#### 중요 (HIGH)
```
[H1] BattleScene: calculateElementBonus() → calculateMoodBonus()로 교체 필요 (v5.2)
[H2] BattleScene: BattleSystem import조차 안 함 (인라인 전투 로직)
[H3] BattleScene: SynergySystem 미사용 (인라인 시너지 계산)
[H4] BattleScene: 별점 항상 3 하드코딩 (newStars = 3)
[H5] StageSelectScene: 파티 슬롯 5개(코드) vs PARTY.PARTY_SIZE=4(설정)
[H6] StageSelectScene: 에너지 "⚡ 50/50" 하드코딩 (EnergySystem 미연동)
[H7] HeroDetailScene: EquipmentSystem, ProgressionSystem Dead Import (import 후 미호출)
[H8] HeroDetailScene: 빈 장비 슬롯 → "준비 중" (장비 선택 UI 미구현)
[H9] EquipmentSystem: data.inventory.equipment 참조 vs SaveManager flat 배열 → 구조 불일치
[H10] PartyManager: 어떤 Scene에서도 사용하지 않음 (완전 미사용)
```

#### 중간 (MEDIUM)
```
[M1] data/index.js: Element 함수 잔존 → Mood 함수로 교체 필요 (v5.2)
[M2] getSummonRates(): SSR 3% (PRD 기준 1.5%)
[M3] EventBus 사용 일관성 미검증
[M4] Scene 전환 시 cleanup 검증 필요
```

#### Dead 버튼 목록 (5개)
```
[D1] MainMenuScene: 설정(⚙) 버튼 → "설정 준비 중!"
[D2] MainMenuScene: 하단 "메뉴" 네비 → "준비 중입니다!" (scene: null)
[D3] GachaScene: "장비 소환" 탭 → "장비 소환 모드 (준비 중)"
[D4] GachaScene: 장비 탭 소환 버튼 → "장비 소환은 준비 중입니다!"
[D5] HeroDetailScene: 빈 장비 슬롯 → "${slotName} 장비 선택 준비 중!"
```

### 3.4 Supabase 백엔드

#### DB 테이블 (7개)
| 테이블 | 용도 | RLS |
|--------|------|-----|
| players | 플레이어 프로필/리소스 | 본인만 CRUD |
| heroes | 보유 영웅 | 본인만 CRUD |
| parties | 파티 편성 | 본인만 CRUD |
| inventory | 인벤토리 | 본인만 CRUD |
| gacha_history | 가챠 기록 | 본인만 Read |
| stages | 스테이지 클리어 기록 | 본인만 CRUD |
| tower | 탑 진행도 | 본인만 CRUD |

#### 하이브리드 저장
- 온라인: Supabase 우선 + localStorage 백업
- 오프라인: localStorage 전용
- 재접속: 서버 데이터 우선 동기화

---

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

## 5. 세분화된 TASK (상호작용 로직 중심)

> 모든 TASK는 "발견→연결"이 아닌 **"유저가 터치→시스템 반응→UI 갱신→저장"** 완전 체인으로 구현

### 팀별 추론 프로토콜

모든 TASK 실행 전, 담당 팀은 다음 추론 단계를 수행:

```
1. [탐색] explore 에이전트가 관련 코드 전체 스캔
2. [분석] analyst가 잠재적 이슈 5가지 이상 도출
3. [설계] architect가 구현 방안 + 에지 케이스 대응 설계
4. [리뷰] code-reviewer가 설계 리뷰 (LGTM 필요)
5. [구현] executor가 코드 작성
6. [검증] qa-tester가 유저 시나리오 테스트
7. [빌드] build-fixer가 빌드 성공 확인
```

---

### TEAM A TASK (전투 통합) - 상세

#### A-1: systems/index.js 완전 barrel export
**유저 상호작용**: 없음 (인프라)
**서브 태스크**:
- A-1.1: 17개 시스템 파일 모두 import 문 추가
- A-1.2: 각 시스템의 싱글톤 인스턴스 또는 클래스 export 패턴 통일
- A-1.3: 순환 의존성(circular dependency) 검사 및 해결
- A-1.4: 각 Scene에서 import 테스트 (tree-shaking 확인)
**추론 체크리스트**:
- [ ] BattleSystem ↔ SaveManager 순환 참조?
- [ ] EventBus를 import하는 시스템이 EventBus보다 먼저 초기화되는가?
- [ ] 지연 로딩(lazy import) vs 즉시 로딩(eager import) 전략 결정
**확장 아이디어**: 시스템 초기화 순서 매니저 구현 (SystemBootstrap)

#### A-2: PersonalitySystem → BattleScene 완전 연결
**유저 상호작용 체인**:
```
유저가 전투 시작 → 적 공격 시 성격 상성 계산 →
데미지 숫자 색상 변화(유리=노랑↑, 불리=파랑↓) →
전투 로그에 "상성 유리!" 표시
```
**서브 태스크**:
- A-2.1: BattleScene에 PersonalitySystem import
- A-2.2: `calculateElementBonus()` → `calculateMoodBonus()` 교체 (v5.2)
  - 기존 element 기반 로직 완전 제거, mood 상성 적용
  - PersonalitySystem.getMatchupMultiplier(attacker, defender) 호출
- A-2.3: 데미지 표시 UI에 상성 인디케이터 추가
  - 유리: 데미지 텍스트 노란색 + "▲" + 스케일 1.3x
  - 불리: 데미지 텍스트 파란색 + "▼" + 스케일 0.8x
  - Mystic: 중립 흰색 표시
- A-2.4: 전투 로그에 상성 정보 추가
- A-2.5: 턴 오더 바에 성격 아이콘 표시
**추론 체크리스트**:
- [x] 적(enemy)에게도 mood 속성 필요 → enemies.json의 element→mood 마이그레이션 (v5.2 결정)
- [x] 적에 mood 없으면 기본값 'neutral' 처리
- [ ] Mystic 성격의 중립 처리가 모든 조합에서 정확한가?
- [ ] 상성 보너스가 시너지 보너스와 중첩될 때 밸런스 문제?
- [x] 기존 세이브 데이터의 element→mood 마이그레이션: SaveManager.load() 시 자동 변환 (v5.2 결정)

#### A-3: SynergySystem 실시간 전투 반영
**유저 상호작용 체인**:
```
파티 편성 시 시너지 미리보기 → 전투 시작 시 시너지 버프 적용 →
SynergyDisplay에 활성 시너지 표시 → 스탯 패널에 버프 수치 반영
```
**서브 태스크**:
- A-3.1: 파티 편성 시 실시간 시너지 미리보기 UI
- A-3.2: 전투 시작 시 SynergySystem.calculate(party) → 버프 목록 생성
- A-3.3: 버프를 BattleUnit 스탯에 실제 적용
- A-3.4: SynergyDisplay 컴포넌트에 활성 시너지 이름+아이콘+수치 표시
- A-3.5: 시너지 변경 시 (캐릭터 사망) 실시간 재계산
**확장 아이디어**: 시너지 조합 도감 (어떤 캐릭터 조합이 어떤 시너지 발동하는지)

#### A-4: 별점(Star Rating) 성과 기반 계산
**유저 상호작용 체인**:
```
전투 클리어 → 성과 분석 (턴수, 생존자, HP잔량) →
1~3성 결과 애니메이션 → 별점별 보상 차등 지급
```
**서브 태스크**:
- A-4.1: `newStars = 3` 하드코딩 제거
- A-4.2: 별점 계산 함수 구현
  ```javascript
  calculateStarRating(turns, survivors, totalParty, avgHpPercent) {
    if (survivors === totalParty && turns <= 10) return 3;
    if (survivors >= totalParty * 0.5 || turns <= 20) return 2;
    return 1;
  }
  ```
- A-4.3: 별점별 보상 배율: 1성(60%), 2성(80%), 3성(100%)
- A-4.4: 결과 화면에 별 애니메이션 (하나씩 점등)
- A-4.5: 최초 3성 클리어 시 소탕 해금 알림 표시
**추론 체크리스트**:
- [ ] 기존 clearedStages 데이터와 호환성 (기존 3 하드코딩 데이터)
- [ ] 별점이 기존보다 낮아질 때 갱신 여부 (최고 기록만 유지)

#### A-5: 카드 덱 스킬 시스템 완전 검증
**유저 상호작용 체인**:
```
매 턴 스킬 카드 3장 표시 → 유저가 카드 터치 →
타겟 선택 (수동 모드) → 스킬 발동 + 이펙트 →
스킬 게이지 충전 → 궁극기 충전 완료 시 빛남 표시
```
**서브 태스크**:
- A-5.1: 카드 드로우 로직 검증 (중복 방지, 덱 소진 시 리셔플)
- A-5.2: 수동 모드: 카드 선택 → 타겟 선택 → 실행 체인 검증
- A-5.3: 자동 모드: AI 카드 선택 로직 (가장 효율적 카드)
- A-5.4: 궁극기 게이지: 충전 조건, 충전 속도, 발동 조건
- A-5.5: 스킬 카드 비활성 조건 (MP 부족, 쿨다운)

#### A-6: 자동전투 AI 스마트 로직
**서브 태스크**:
- A-6.1: 적 HP 기반 스킬 선택 (광역 vs 단일 판단)
- A-6.2: 아군 HP 기반 힐 우선순위 (HP<30% 시 힐러 우선 행동)
- A-6.3: 상성 유리 타겟 우선 공격
- A-6.4: 궁극기 자동 사용 타이밍 (보스전 시 보존)
- A-6.5: 배속 1x/2x/3x 실제 애니메이션 속도 조절
**확장 아이디어**: AI 전략 프리셋 (공격적/수비적/밸런스)

#### A-7: 전투 결과 → 보상 → 저장 완전 체인
**유저 상호작용 체인**:
```
전투 승리 → 골드 획득 + 캐릭터 EXP 획득 + 아이템 드롭 →
레벨업 시 알림 → SaveManager 저장 → 
registry 갱신 → StageSelectScene 복귀 시 UI 반영
```
**서브 태스크**:
- A-7.1: 골드 보상 → SaveManager.addGold() + registry 갱신
- A-7.2: 캐릭터 EXP → ProgressionSystem.addExp() → 레벨업 체크
- A-7.3: 레벨업 시 스탯 갱신 + 알림 UI
- A-7.4: 아이템 드롭 → SaveManager.addToInventory()
- A-7.5: 캐릭터 조각(fragment) 드롭 (스테이지별 특정 캐릭터)
- A-7.6: 첫 클리어 보너스 (보석 추가 지급)
**확장 아이디어**: MVP(Most Valuable Player) 선정 및 보너스 EXP

#### A-8: 전투 이펙트 & 연출 고도화
**서브 태스크**:
- A-8.1: 스킬별 파티클 이펙트 (Phaser.GameObjects.Particles)
- A-8.2: 데미지 숫자 폰트/크기/색상 세분화
- A-8.3: 크리티컬 히트 화면 흔들림 + 특수 사운드
- A-8.4: 궁극기 컷인 연출 (캐릭터 초상 줌인)
- A-8.5: 전투 시작/종료 트랜지션 연출

---

### TEAM B TASK (신규 씬 & UI) - 상세

#### B-1: TowerScene 신규 생성
**유저 상호작용 체인**:
```
메인 메뉴 "탑" 탭 터치 → TowerScene 전환 →
현재 층 표시 + 보상 미리보기 → "도전" 터치 →
파티 선택 → BattleScene(탑 모드) →
클리어 → 다음 층 해금 + 보상 수령
```
**서브 태스크**:
- B-1.1: TowerScene 기본 레이아웃 (세로 스크롤 타워 맵)
- B-1.2: 층별 카드 UI (층 번호, 난이도, 보상, 클리어 여부)
- B-1.3: 보스 층(10의 배수) 특별 표시 (빨간 테두리, 보스 아이콘)
- B-1.4: "도전" 버튼 → 파티 선택 → BattleScene 전달 (mode: 'tower')
- B-1.5: TowerSystem.clearFloor() 연결 → 보상 수령 팝업
- B-1.6: 최고 기록 표시 + 서버 랭킹 (선택)
- B-1.7: gameConfig.js에 Scene 등록
- B-1.8: BottomNav에 "탑" 탭 추가
**추론 체크리스트**:
- [ ] TowerSystem의 `// TODO: 장비 생성 및 지급` (line 194) 해결
- [ ] 에너지 소모 여부? (탑은 무료? 또는 별도 입장권?)
- [ ] 시즌 리셋 시 UI 처리

#### B-2: StageSelectScene → stages.json 동적 로드
**유저 상호작용 체인**:
```
"모험" 탭 터치 → 5개 챕터 탭 표시 →
챕터 터치 → 5개 스테이지 카드 로드 →
잠금/해금/별점 상태 표시 → 스테이지 터치 →
파티 편성 → 전투 시작
```
**서브 태스크**:
- B-2.1: `generateStages()` 하드코딩 완전 제거
- B-2.2: `import { getAllChapters, getChapterStages } from '../data/index.js'` 연결
- B-2.3: 5개 챕터 탭 UI (교단 테마 색상 적용)
- B-2.4: 스테이지 카드: 잠금/해금/클리어 3상태 표시
- B-2.5: 클리어 별점 표시 (SaveManager.getStageStars())
- B-2.6: 스테이지 잠금 해제 조건 (이전 스테이지 클리어)
- B-2.7: 각 챕터 보스 스테이지(5번) 특별 표시
- B-2.8: 파티 슬롯 수 수정: 5개(현재 코드) → 4개(`PARTY.PARTY_SIZE` 일치)
- B-2.9: PartyManager 연동 (현재 완전 미사용 → 파티 저장/로드 기능 활성화)
**확장 아이디어**: 챕터 진행도 % 표시, 올 3성 클리어 보너스 보상

#### B-3: EnergySystem ↔ StageSelectScene 실시간 연결
**유저 상호작용 체인**:
```
StageSelectScene 진입 → 에너지 바 실시간 표시 (45/50) →
스테이지 비용 표시 (⚡6) → 에너지 부족 시 빨간 표시 →
전투 시작 시 consumeEnergy() → 에너지 바 즉시 갱신 →
회복 타이머 표시 (다음 회복: 2:30)
```
**서브 태스크**:
- B-3.1: EnergySystem import 및 initialize()
- B-3.2: EnergyBar 컴포넌트를 StageSelectScene 상단에 배치
- B-3.3: 실시간 에너지 표시 (현재/최대)
- B-3.4: 각 스테이지 카드에 비용 표시 (EnergySystem.getStageCost())
- B-3.5: 에너지 부족 시 스테이지 카드 비활성 + 빨간 텍스트
- B-3.6: startBattle() 전에 canEnterStage() → consumeEnergy() 체인
- B-3.7: 에너지 부족 시 "에너지 충전" 팝업 (보석 충전 옵션)
- B-3.8: 회복 타이머 카운트다운 표시
- B-3.9: update() 메서드에서 매 프레임 에너지/타이머 갱신

#### B-4: SweepSystem UI 완전 구현
**유저 상호작용 체인**:
```
3성 클리어 스테이지에 "소탕" 버튼 표시 →
터치 → 횟수 선택 (1/5/10/최대) →
에너지/소탕권 확인 → 실행 →
보상 요약 팝업 (아이템 목록 + 수량) → 확인
```
**서브 태스크**:
- B-4.1: 3성 클리어 스테이지 카드에 "소탕" 버튼 표시
- B-4.2: 소탕 횟수 선택 모달 (1/5/10/남은 에너지 전부)
- B-4.3: SweepSystem.canSweep() 검증 → 에러 메시지 표시
- B-4.4: SweepSystem.executeSweep() 실행 → 에너지/소탕권 차감
- B-4.5: 보상 요약 팝업 (아이템별 아이콘 + 수량)
- B-4.6: 남은 일일 소탕 횟수 표시

#### B-5: LoginScene 인증 UI
**서브 태스크**:
- B-5.1: 타이틀 화면 (게임 로고 + 배경 애니메이션)
- B-5.2: "게스트로 시작" 버튼 (즉시 게임 진입)
- B-5.3: "이메일 로그인" 버튼 → 로그인 폼 모달
- B-5.4: AuthService 연결
- B-5.5: Scene 흐름: Boot → Login → Preload → MainMenu

#### B-6: QuestScene 퀘스트 UI
**서브 태스크**:
- B-6.1: 일일/주간/업적 3탭 UI
- B-6.2: 퀘스트 카드 (이름, 진행도 바, 보상 미리보기)
- B-6.3: 완료 퀘스트 "수령" 버튼 → claimReward()
- B-6.4: 전체 수령 버튼 → claimAllRewards()
- B-6.5: 리셋 타이머 표시

#### B-7: 장비 가챠 활성화
**서브 태스크**:
- B-7.1: GachaScene 장비 탭 "준비 중" 제거
- B-7.2: EquipmentSystem.createEquipment() 연결
- B-7.3: 장비 등급별 소환 연출
- B-7.4: 결과 장비 → SaveManager 저장

---

### TEAM C TASK (데이터 & 백엔드) - 상세

#### C-1: data/index.js Element→Mood 전면 마이그레이션 (v5.2 업데이트)
**서브 태스크**:
- C-1.1: `getCharactersByElement()` → `getCharactersByMood()` 교체
- C-1.2: `getCharactersByCult()` 신규 추가
- C-1.3: `getElementAdvantages()` → `getMoodMatchups()` 교체
- C-1.4: `calculateElementMultiplier()` → `calculateMoodMultiplier()` 교체
- C-1.5: 레거시 Element/Personality 함수 완전 삭제 (v5.2: deprecated 대신 삭제)
- C-1.6: 모든 import처에서 새 함수명 사용 확인
- C-1.7: default export 객체 업데이트

#### C-2: GachaScene ↔ GachaSystem 완전 교체
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

#### C-3: Supabase 마이그레이션 SQL 검증 및 적용
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

#### C-4: 하이브리드 저장 시스템 (Local + Supabase)
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

#### C-5: 오프라인 보상 시스템 검증
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

#### C-6: 쿠폰 시스템 UI 연결
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

#### C-7: DebugManager 통합 (TEAM G 협업)
**서브 태스크**:
- C-7.1: 개발 모드에서만 활성화 (`import.meta.env.DEV` 체크)
- C-7.2: 프로덕션 빌드에서 DebugManager 코드 tree-shaking 제거
- C-7.3: `window.debug` 글로벌 등록은 개발 환경만
- C-7.4: Vite 빌드 플래그로 디버그 코드 조건부 포함

---

### TEAM D TASK (통합 QA & 최적화) - 상세

#### D-1: 전체 Scene 전환 흐름 테스트
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

#### D-2: 전투 E2E 테스트
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

#### D-3: 가챠 확률 시뮬레이션 검증
**서브 태스크**:
- D-3.1: 10,000회 소환 시뮬레이션 실행
- D-3.2: 등급 분포 검증: N:60%±2%, R:30%±2%, SR:8.5%±1%, SSR:1.5%±0.5%
- D-3.3: 천장(90회) 정확 동작: 90회째 SSR 100% 확인
- D-3.4: 소프트 피티(70회~) 확률 증가 검증
- D-3.5: 10연차 SR 이상 1회 보장 검증
- D-3.6: 픽업 배너 확률 UP (SSR 중 50% 픽업 대상) 검증
**확장 아이디어**: 가챠 시뮬레이터 페이지 (유저가 직접 확률 테스트)

#### D-4: Vite 빌드 최적화
**서브 태스크**:
- D-4.1: 번들 사이즈 분석 (rollup-plugin-visualizer)
- D-4.2: 코드 스플리팅: Scene별 lazy load (dynamic import)
- D-4.3: 에셋 최적화: 이미지 압축, WebP 변환
- D-4.4: 초기 로딩 시간 3초 이내 달성
- D-4.5: tree-shaking 확인: 미사용 코드 제거
- D-4.6: gzip 압축 후 번들 < 2MB 확인

#### D-5: 크로스 브라우저 & 모바일 테스트
**서브 태스크**:
- D-5.1: Chrome/Safari/Firefox 동작 확인
- D-5.2: 모바일 터치 입력 정상 동작 (iOS Safari, Android Chrome)
- D-5.3: 720×1280 해상도 피팅 확인 (다양한 비율)
- D-5.4: WebGL 미지원 브라우저 폴백 처리
- D-5.5: PWA manifest 및 서비스 워커 설정 (선택)

---

### TEAM E TASK (캐릭터 데이터 설계) - 상세

#### E-1: 기존 캐릭터 데이터 감사 (Audit)
**서브 태스크**:
- E-1.1: 39명 캐릭터 필수 필드 완전성 검증 (id, name, nameKo, rarity, mood, cult, role, baseStats, growthStats, skills, description) ← personality→mood
- E-1.2: 등급 분포 확인: 현재 N:0, R:7, SR:16, SSR:16 → N등급 부재 확인
- E-1.3: asgard 교단 캐릭터 3명 → 6명 추가 필요
- E-1.4: 스킬 ID가 skills.json과 정확히 매칭되는지 검증
- E-1.5: baseStats 범위가 등급별 기준에 부합하는지 확인
**추론 체크리스트**:
- [ ] characters.json 스키마와 코드 내 참조 필드가 일치하는가?
- [ ] 중복 ID가 없는가?
- [ ] 각 교단 내 역할(warrior/mage/archer/healer) 분포가 균등한가?

#### E-2: 누락 캐릭터 데이터 설계 (42명)
**서브 태스크**:
- E-2.1: asgard 교단 6명 추가 (현재 3명 → 총 9명)
- E-2.2: N등급(2성) 캐릭터 15명 추가 (각 교단 3명)
- E-2.3: 나머지 교단 확장: 각 교단 ~16명까지 추가
- E-2.4: 역할(warrior/mage/archer/healer) 균등 분포
- E-2.5: 성격(brave/cunning/calm/wild/mystic) 균등 분포
- E-2.6: 캐릭터 이름(영문+한글), 설명, 배경 스토리 작성
- E-2.7: 추가 캐릭터 characters.json에 통합
**설계 원칙**: 각 교단 내에서 역할/성격의 조합이 최대한 다양하도록

#### E-3: 캐릭터 스탯 밸런스 설계
**서브 태스크**:
- E-3.1: 등급별 baseStats 범위 표준화 (N/R/SR/SSR)
- E-3.2: 역할별 스탯 경향 적용 (warrior: HP/DEF↑, mage: ATK↑↑, archer: SPD/ATK↑, healer: HP/SPD↑)
- E-3.3: growthStats 등급/역할별 표준화
- E-3.4: 전투력(power) 계산식 검증: ATK×1 + HP×0.5 + DEF×0.8 + SPD×0.3
- E-3.5: 기존 39명 스탯 재조정 (불균형 수정)

#### E-4: 스킬 데이터 확장 및 밸런스
**서브 태스크**:
- E-4.1: 캐릭터별 스킬 3개(기본/액티브/궁극기) 체계 확인
- E-4.2: 스킬 타입별 효과: damage, heal, buff, debuff, aoe
- E-4.3: 스킬 레벨업 수치 증가율 (레벨당 +5~10%)
- E-4.4: 성격별 특화 스킬 효과 (brave→공격력UP, calm→방어력UP 등)
- E-4.5: 42명 추가 캐릭터용 스킬 126개(42×3) 작성

#### E-5: 장비 데이터 확장 (4→81개)
**서브 태스크**:
- E-5.1: 4슬롯(weapon/armor/accessory/relic) × 등급(N/R/SR/SSR) 구조 설계
- E-5.2: 역할별 특화 장비 (전사용 대검, 마법사용 지팡이 등)
- E-5.3: 장비 기본 스탯 및 강화 수치 (+1~+15)
- E-5.4: 장비 세트 효과 (동일 세트 2/4개 장착 시 보너스)
- E-5.5: 장비 가챠 풀 데이터 구성 (등급별 확률)
- E-5.6: 최소 40개 이상 장비 데이터 1차 구성

#### E-6: 적(Enemy) 데이터 확장
**서브 태스크**:
- E-6.1: 5챕터 × 5스테이지 × 3~4적 = 최소 60종 적 데이터
- E-6.2: 보스 몬스터 5종 (각 챕터 마지막 스테이지)
- E-6.3: 엘리트 몬스터 10종 (챕터당 2종)
- E-6.4: 일반 몬스터 테마별 (올림포스: 하피, 미노타우로스 등)
- E-6.5: 무한의 탑 전용 보스 10종 (10/20/30/...층)
- E-6.6: 적 mood 분위기 부여 (enemies.json element→mood 마이그레이션, 상성 시스템 활용)

#### E-7: 시너지 데이터 검증 및 확장
**서브 태스크**:
- E-7.1: 교단 시너지 5개로 확장 (현재 3개)
- E-7.2: 성격 시너지 10개로 확장 (5C2 = 10개 조합)
- E-7.3: 역할 시너지 추가 (전사+힐러, 마법사+궁수 등)
- E-7.4: 특수 시너지: 특정 캐릭터 조합 보너스 (스토리 기반)
- E-7.5: 시너지 효과 밸런스 (너무 강력하지 않게 ±15% 이내)

#### E-8: 캐릭터 비주얼 에셋 가이드
**서브 태스크**:
- E-8.1: 42명 추가 캐릭터 외형 설명서 (AI 이미지 생성용 프롬프트)
- E-8.2: 교단별 비주얼 테마 가이드 (olympus: 그리스 신전/금색, takamagahara: 벚꽃/전통 의상 등)
- E-8.3: 등급별 이미지 퀄리티: SSR(전신+배경), SR(전신), R(반신), N(아이콘)
- E-8.4: n8n 워크플로우 연동 프롬프트 가이드

#### E-9: N등급 캐릭터 설계 (16명)
**서브 태스크**:
- E-9.1: 각 교단 3-4명의 N등급 캐릭터 설계
- E-9.2: N등급 스탯 범위: HP 300-400, ATK 30-40, DEF 25-35, SPD 80-90
- E-9.3: N등급 스킬: 기본 공격 1개만 (no active/ultimate)
- E-9.4: N등급 캐릭터 설명 (간단)
**설계 원칙**: N등급은 초반 파티 구성용, 중후반에는 진화 재료로 사용

#### E-10: 캐릭터 밸런스 시뮬레이션
**서브 태스크**:
- E-10.1: scientist-high가 전 캐릭터 1:1 시뮬레이션 (1000회)
- E-10.2: 등급 간 승률 분석 (SSR vs SR, SR vs R 등)
- E-10.3: 상성 시스템 효과 분석
- E-10.4: 시너지 보너스의 실제 영향도 측정
- E-10.5: 불균형 캐릭터 발견 시 스탯 조정 제안

---

### TEAM F TASK (씬/패널 로직 검증) - 상세

#### F-1: BootScene 로직 검증
**검증 항목**:
- SaveManager 초기화 및 데이터 로드 정상 동작
- 오프라인 보상 계산 정확도 (lastOnline → 현재 시간 차이)
- registry 값 설정 (gems, gold, pityCounter, ownedHeroes, clearedStages, battleSpeed)
- Scene 전환 타이밍 (Splash → PreloadScene)
- 첫 실행 시 초기 데이터 설정

#### F-2: PreloadScene 에셋 로딩 검증
**검증 항목**:
- 모든 필요 에셋 프리로드 완료 여부
- 로딩 진행바 정확도
- 에셋 로딩 실패 시 에러 핸들링
- 추가 Scene(Tower, Login, Quest)용 에셋 로드 추가 필요 여부

#### F-3: MainMenuScene 데이터 바인딩 검증
**검증 항목**:
- TopBar: 골드/보석 표시가 실시간 갱신되는지
- BottomNav: 각 탭 터치 → 올바른 Scene 전환
- 대표 캐릭터 표시: ownedHeroes[0] 기반 동적 렌더링
- 오프라인 보상 팝업: 보상 수령 → 재화 반영
- "메뉴" 탭: "준비 중" 토스트 → 실제 기능 연결 (설정/쿠폰/디버그)
- 에너지 표시 여부 (현재 MainMenu에 에너지 바 없음)

#### F-4: GachaScene 데이터 흐름 검증
**검증 항목**:
- 보석 소비: 단일(300), 10연차(2,700) 정확한 차감
- 소환 결과: GachaSystem의 확률 테이블과 일치하는지
- 천장(pity) 카운터: 90회 진행 시 SSR 확정
- 픽업 배너: banners.json 데이터 반영
- 소환 연출: N/R/SR/SSR 등급별 차별화
- 결과 캐릭터 → ownedHeroes에 저장
- 중복 캐릭터 → 캐릭터 조각(fragment) 변환
- 장비 탭: 비활성화 상태 → 활성화 필요

#### F-5: HeroListScene 표시 로직 검증
**검증 항목**:
- 보유 캐릭터 목록 정확히 표시
- 정렬 기능: 등급순, 레벨순, 전투력순
- 필터 기능: 교단별, 성격별, 역할별
- HeroCard 컴포넌트: 올바른 데이터 바인딩 (이름, 등급색상, 레벨, 전투력)
- 카드 터치 → HeroDetailScene 전환 (올바른 캐릭터 ID 전달)
- 빈 목록 시 안내 메시지

#### F-6: HeroDetailScene 육성 시스템 검증
**검증 항목**:
- 레벨업: 경험치 물약 소비 → 레벨 증가 → 스탯 갱신
- 스킬 강화: 스킬북 소비 → 스킬 레벨업 → 효과 증가
- 진화(Evolution): 캐릭터 조각 소비 → 성급 증가
  - `HeroService.js:336` TODO: "조각 소모 로직 (InventoryService 연동)" 미구현
- 장비 장착: 4슬롯(weapon/armor/accessory/relic) 동작
- 장비 교체/해제 동작
- 스탯 그래프(레이더 차트) 정확도
- 성격/교단 정보 표시
- 전투력 실시간 계산
**⚠️ 신규 발견 치명적 문제**:
- **[C7] 레벨업/진화/스킬강화 시 registry만 업데이트, SaveManager 미호출**
  → 새로고침 시 골드 복원, 변경사항 손실
  → 수정: 모든 재화 변경 후 `SaveManager.spendGold()` 등 호출 필수
- **[H7] EquipmentSystem, ProgressionSystem Dead Import** (import 후 미호출)
  → 수정: ProgressionSystem.levelUp() 활용, EquipmentSystem.equip() 활용
- **[H8] 빈 장비 슬롯 클릭 → "준비 중"** (장비 선택 UI 미구현)
  → 수정: 보유 장비 목록 팝업 UI 구현
- **스탯 증가율 하드코딩** (HP 5%, ATK 3%, DEF 3%, SPD 1%)
  → 수정: ProgressionSystem 또는 gameConfig에서 참조
- **레벨업 비용 하드코딩** (`level * 100 + 200`)
  → 수정: ProgressionSystem.getLevelUpCost() 사용

#### F-7: StageSelectScene 전체 로직 검증
**검증 항목**:
- 챕터 데이터: stages.json 기반 동적 로드 (하드코딩 제거 후)
- 스테이지 잠금/해금: 이전 스테이지 클리어 기반
- 클리어 별점 표시: SaveManager의 clearedStages 데이터
- 파티 선택 모달: PartyManager 연동
- autoFillParty: 자동 최강 파티 편성 동작
- 전투 시작: 올바른 스테이지 데이터 → BattleScene 전달
- 에너지 표시/차감: EnergySystem 연동 (연결 후)
- 소탕 버튼: SweepSystem 연동 (추가 후)
- 총 전투력 계산: 파티 4인 전투력 합산 정확도

#### F-8: BattleScene 전체 로직 검증
**검증 항목**:
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

#### F-9: 공통 컴포넌트 일관성 검증
**검증 항목**:
- Button: 터치/클릭 반응, 비활성 상태, 그라데이션 스타일
- Panel: 배경 처리, 둥근 모서리(12px), 그림자
- TopBar: 재화 표시 갱신, 레이아웃 일관성
- BottomNav: 선택 상태 표시, 아이콘 정확도, 새 탭 추가 대응
- Modal: 오버레이 터치 닫기, 애니메이션
- Toast: 자동 소멸 타이머, 위치 일관성
- ProgressBar: 퍼센트 정확도, 색상 변화
- StarRating: 1~6성 표시 (진화 포함)
- EnergyBar: 실시간 업데이트, 회복 타이머

#### F-10: EventBus 이벤트 흐름 매핑
**검증 항목**:
- 발행(emit)되는 모든 이벤트 목록 작성
- 구독(on)하는 모든 이벤트 리스너 매핑
- 이벤트 발행 → 구독 짝(pair) 매칭 확인
- 구독만 있고 발행 없는 이벤트 (dead listener)
- 발행만 있고 구독 없는 이벤트 (dead event)
- Scene 전환 시 리스너 해제(cleanup) 확인 → 메모리 누수 방지
- constants.js의 EVENTS 상수와 실제 사용 일치

#### F-11: GachaScene ↔ GachaSystem 상호작용 완전 검증
**검증 체인**:
```
1. 보석 300개 보유 확인 → 단일소환 버튼 활성
2. 터치 → GachaSystem.canPull() 체크
3. → GachaSystem.pull() 호출 → rarity 결정
4. → characters.json에서 해당 rarity 캐릭터 랜덤 선택
5. → SaveManager.addCharacter() 호출
6. → registry.ownedHeroes 갱신
7. → pityCounter 갱신 + 저장
8. → 보석 차감 (SaveManager.spendGems())
9. → 소환 연출 재생
10. → 결과 캐릭터 카드 표시
11. → 중복 시 "조각 변환" 표시
```
**서브 태스크**:
- F-11.1: 위 체인 각 단계 정상 동작 확인
- F-11.2: 보석 부족 시 에러 메시지 표시 확인
- F-11.3: 10연차 시 10회 반복 + SR보장 확인
- F-11.4: 천장(90회) 정확 동작 확인
- F-11.5: 배너 전환 시 확률 변경 확인

#### F-12: 전체 데이터 흐름 무결성 검증
**서브 태스크**:
- F-12.1: registry ↔ SaveManager 데이터 동기화 검증
- F-12.2: Scene 전환 시 데이터 손실 여부 확인
- F-12.3: 새로고침(F5) 후 데이터 복원 확인
- F-12.4: 브라우저 탭 비활성→활성 시 데이터 정합성

---

### TEAM G TASK (치트 API) - 상세

#### G-1: DebugManager require() → import() 마이그레이션
**우선순위**: P0
**문제**: 모든 내부 호출이 `require()` (CJS) → ES Modules 프로젝트에서 런타임 에러
**서브 태스크**:
- G-1.1: `require('./SaveManager.js')` → static `import` 변환
- G-1.2: `require('../data/index.js')` → static `import` 변환
- G-1.3: 모든 치트 메서드 정상 동작 확인
- G-1.4: `import.meta.env.DEV` 조건부 활성화 래핑

#### G-2: clearAllStages/skipToChapter stages.json 연동
**우선순위**: P0
**문제**: 10챕터×10스테이지 하드코딩 → stages.json은 5챕터×5스테이지
**서브 태스크**:
- G-2.1: stages.json 데이터 기반 동적 챕터/스테이지 ID 생성
- G-2.2: clearAllStages() → stages.json 전체 순회 클리어
- G-2.3: skipToChapter(n) → 해당 챕터까지만 클리어

#### G-3: 에너지 시스템 치트 API
**우선순위**: P1
**목표 API**:
```javascript
static refillEnergy()                     // 에너지 최대치로 충전
static setEnergy(amount)                  // 에너지 특정 값 설정
static setInfiniteEnergy(enabled)         // 무한 에너지 모드
static setEnergyRecoverySpeed(multiplier) // 회복 속도 배율 (1x~100x)
```

#### G-4: 가챠 시스템 치트 API
**우선순위**: P1
**목표 API**:
```javascript
static setPityCounter(count)              // 천장 카운터 강제 설정
static setNextPullRarity(rarity)          // 다음 소환 등급 강제
static setNextPullCharacter(charId)       // 다음 소환 캐릭터 강제 지정
static freeGacha(enabled)                 // 무료 소환 모드
static simulateGacha(count)              // N회 소환 시뮬레이션 (결과 로그)
static resetPity()                        // 천장 카운터 리셋
static forcePickup(enabled)              // 픽업 확정 모드
```

#### G-5: 장비 시스템 치트 API
**우선순위**: P1
**목표 API**:
```javascript
static giveEquipment(equipId)             // 특정 장비 지급
static giveRandomEquipment(rarity, slot)  // 랜덤 장비 생성 지급
static giveAllEquipment()                 // 모든 장비 지급
static maxEnhanceEquipment(equipId)       // 장비 강화 MAX (+15)
static setEnhanceAlwaysSuccess(enabled)   // 강화 100% 성공
```

#### G-6: 무한의 탑 치트 API
**우선순위**: P1
**목표 API**:
```javascript
static setTowerFloor(floor)               // 현재 층 강제 설정
static clearTowerFloors(from, to)         // 범위 층 클리어
static clearAllTowerFloors()              // 전 층 클리어
static resetTower()                       // 탑 진행도 리셋
static setTowerDifficulty(multiplier)     // 난이도 배율 설정
```

#### G-7: 소탕 & 퀘스트 치트 API
**우선순위**: P1
**목표 API**:
```javascript
// 소탕
static addSweepTickets(amount)            // 소탕권 추가
static setInfiniteSweeps(enabled)         // 무한 소탕 모드
static resetDailySweepCount()             // 일일 소탕 횟수 리셋
// 퀘스트
static completeAllDailyQuests()           // 일일 퀘스트 전체 완료
static completeAllWeeklyQuests()          // 주간 퀘스트 전체 완료
static claimAllQuestRewards()             // 미수령 보상 전체 수령
static resetDailyQuests()                 // 일일 퀘스트 리셋
```

#### G-8: 세이브 & 시간 치트 API
**우선순위**: P2
**목표 API**:
```javascript
// 세이브
static exportSave()                       // 세이브 JSON 다운로드
static importSave(jsonString)             // 세이브 JSON 업로드
static resetAllData()                     // 전체 데이터 초기화
static createBackup(slotName)             // 백업 슬롯 생성
// 시간
static fastForwardOffline(hours)          // 오프라인 보상 N시간 빨리감기
static setLastOnlineTime(hoursAgo)        // 마지막 접속 시간 변경
static resetDailyTimers()                 // 일일 리셋 타이머 초기화
```

#### G-9: 성격 & 시너지 & 파티 치트 API
**우선순위**: P2
**목표 API**:
```javascript
// 성격 상성
static setPersonalityAdvantage(enabled)   // 항상 상성 유리
static viewPersonalityMatchup(a, b)       // 두 성격 상성 확인
// 시너지
static viewActiveSynergies(partyIds)      // 파티의 활성 시너지 확인
static forceSynergyBonus(synergyId)       // 특정 시너지 강제 활성화
// 파티
static autoOptimalParty()                 // 최적 파티 자동 편성
static clearParty()                       // 파티 초기화
```

#### G-10: 디버그 콘솔 UI & 치트코드 확장
**우선순위**: P2
**서브 태스크**:
- G-10.1: 카테고리별 탭 UI (리소스/캐릭터/전투/에너지/가챠/장비/탑/시간)
- G-10.2: 실시간 상태 표시 패널 (현재 리소스, 에너지, 천장 카운터)
- G-10.3: 치트코드 25개 등록 (기존 8개 + 신규 17개)
- G-10.4: `window.debug` 글로벌 등록 (개발 모드 전용)
- G-10.5: `debug.help()` 도움말 테이블
**치트코드 목록**:
```
기존: GOLDRAIN, GEMSTORM, SUMMONALL, GODMODE, ONEPUNCH, SPEEDUP, UNLOCKALL, CLEARALL
신규: ENERGYMAX, INFINERGY, SSRFORCE, FREEPULL, PITY89, GEARMAX, GEARALL,
      TOWER100, QUESTDONE, SWEEP999, TIMETRAVEL, MAXALL, NEWGAME, BACKUP 등
```

---

### TEAM H TASK (디자인 & 에셋) - 상세

#### H-1: UI 디자인 시스템 정립
**우선순위**: P1
**서브 태스크**:
- H-1.1: 컬러 팔레트 통합: Primary(#6366F1), Secondary(#EC4899), BG(#0F172A~#1E293B), Accent(#F59E0B)
- H-1.2: 등급 컬러 표준: N(#9CA3AF), R(#3B82F6), SR(#A855F7), SSR(#F59E0B)
- H-1.3: 타이포그래피: 제목 Bold 24px, 본문 14px, 숫자 Mono
- H-1.4: 컴포넌트 가이드: 둥근 모서리(12px), 그라데이션 버튼, 글로우 이펙트
- H-1.5: textStyles.js, drawUtils.js 확장

#### H-2: 영웅 이미지 에셋 시스템
**우선순위**: P1
**서브 태스크**:
- H-2.1: AI 생성 파이프라인 (Stable Diffusion/Midjourney/DALL-E) 프롬프트 템플릿
- H-2.2: 교단별 비주얼 가이드 (olympus: 그리스/금색, takamagahara: 벚꽃, valhalla: 바이킹 등)
- H-2.3: 등급별 퀄리티: SSR(전신+배경), SR(전신), R(반신), N(아이콘)
- H-2.4: n8n 워크플로우 + Pexels API 레퍼런스 수집
- H-2.5: fallback: 컬러 실루엣 + 이름 텍스트 (이미지 미완시)
- H-2.6: 최소 10장 테스트 이미지 생성

#### H-3: 가챠 소환 연출 디자인
**우선순위**: P1
**서브 태스크**:
- H-3.1: 등급별 연출: N(0.5초 간단), R(1초 파란 마법진), SR(1.5초 보라+파티클), SSR(3초 금빛+컷인)
- H-3.2: 마법진 이펙트 (Phaser 파티클)
- H-3.3: SSR 전용 캐릭터 등장 애니메이션
- H-3.4: 10연차 카드 뒤집기 연출
- H-3.5: 스킵 기능 (터치로 연출 스킵)

#### H-4: 전투 이펙트 & 애니메이션
**우선순위**: P1
**서브 태스크**:
- H-4.1: 스킬 이펙트: 기본(슬래시), 마법(파티클), 힐(초록 빛기둥), 궁극기(풀스크린)
- H-4.2: 데미지 숫자: 일반(흰), 크리티컬(빨강+흔들림), 유리(노랑↑), 불리(파랑↓), 힐(초록)
- H-4.3: 전투 전환 연출 (페이드, 파티 등장)
- H-4.4: 승리/패배 화면 연출

#### H-5: 메인 로비 & Scene 전환 연출
**우선순위**: P2
**서브 태스크**:
- H-5.1: 배경 일러스트 (AI 생성 판타지 길드 홀)
- H-5.2: 대표 캐릭터 idle 흔들림 (Live2D 스타일 시뮬레이션)
- H-5.3: 터치 반응: 바운스 + 대사 말풍선
- H-5.4: 공통 페이드 트랜지션 (0.3초)
- H-5.5: 배경 파티클 (별/꽃잎/마법진)

#### H-6: HeroCard & 등급 프레임 디자인
**우선순위**: P2
**서브 태스크**:
- H-6.1: 등급별 프레임: N(회색), R(파랑+은), SR(보라 그라데이션+빛남), SSR(금색+홀로그램+파티클)
- H-6.2: 카드 획득 애니메이션 (뒤집기 + 등급 이펙트)
- H-6.3: 교단별 배경 색상 반영

#### H-7: 사운드 & BGM 에셋 계획
**우선순위**: P3
**서브 태스크**:
- H-7.1: BGM: 로비/전투/보스전/가챠 (무료 에셋 또는 AI 생성 Suno/Udio)
- H-7.2: SFX: 버튼/스킬/승리/패배/소환/레벨업
- H-7.3: Phaser 내장 사운드 시스템 또는 Howler.js 통합
- H-7.4: 음량 조절 SaveManager 연동

#### H-8: 반응형 & 모바일 터치 UX
**우선순위**: P2
**서브 태스크**:
- H-8.1: 다양한 비율(16:9, 18:9, 20:9) 대응
- H-8.2: 터치 영역 최소 44×44px 보장
- H-8.3: 스와이프 제스처 (챕터 전환, 영웅 스크롤)
- H-8.4: 롱프레스 (아이템/스킬 상세 팝업)
- H-8.5: 햅틱 피드백 (지원 기기)

#### H-9: 로딩 & 스플래시 스크린
**서브 태스크**:
- H-9.1: 게임 로고 디자인 (AI 생성 또는 텍스트 기반)
- H-9.2: 스플래시 화면 (3초, 로고 + 페이드)
- H-9.3: 프리로드 진행바 디자인 (마법진 회전 + 퍼센트)
- H-9.4: Scene 전환 로딩 스피너

#### H-10: 이펙트 파티클 라이브러리
**서브 태스크**:
- H-10.1: 공통 파티클 프리셋: 별 반짝임, 연기, 불꽃, 빛기둥
- H-10.2: 등급별 파티클: N(없음), R(파랑), SR(보라), SSR(금색)
- H-10.3: 레벨업/진화 축하 파티클
- H-10.4: 파티클 풀링 (성능 최적화)

---

## 6. 최적화 & 코드 품질 기준

### 6.1 코딩 표준
| 항목 | 기준 |
|------|------|
| **모듈** | ES Modules (import/export), require() 금지 |
| **패턴** | 시스템=싱글톤 class, 서비스=함수 export, 컴포넌트=Container 상속 |
| **이벤트** | EventBus 통일 사용, 직접 emit 금지 |
| **상수** | constants.js 또는 gameConfig.js에 중앙 관리, 매직넘버 금지 |
| **에러** | try-catch + 사용자 친화적 메시지 (Toast) |
| **메모리** | Scene shutdown()에서 모든 리스너/타이머 해제 |
| **성능** | 오브젝트 풀링, 불필요한 update() 제거, 지연 로딩 |

### 6.2 빌드 기준
| 항목 | 목표 |
|------|------|
| 빌드 시간 | < 10초 |
| 번들 크기 | < 2MB (gzip) |
| 초기 로딩 | < 3초 (4G 모바일) |
| FPS | 60fps (전투 씬 포함) |
| 메모리 | < 150MB (런타임) |

### 6.3 테스트 기준
- 모든 유저 상호작용 체인 수동 테스트 완료
- 가챠 10,000회 시뮬레이션 확률 ±0.5% 이내
- 5개 챕터 전체 클리어 가능 확인
- 무한의 탑 50층 클리어 가능 확인
- 24시간 오프라인 보상 정확도 ±5% 이내

---

## 7. 확장 아이디어 (향후 적용 가능)

| 아이디어 | 설명 | 우선순위 |
|----------|------|---------|
| **PvP 아레나** | 실시간 PvP 전투, 시즌 랭킹 | 높음 |
| **길드 시스템** | 길드 생성, 길드 레이드, 길드 전쟁 | 높음 |
| **캐릭터 호감도** | 터치 반응, 대사 변화, 전용 스토리 | 중간 |
| **의상 시스템** | 캐릭터 의상 변경, 스탯 보너스 | 중간 |
| **이벤트 배너** | 기간 한정 가챠, 특별 보상 | 중간 |
| **도감 시스템** | 캐릭터/장비/몬스터 도감 | 낮음 |
| **채팅** | 글로벌 채팅, 귓속말 | 낮음 |
| **AI 전략 프리셋** | 자동전투 AI 커스터마이징 | 낮음 |
| **시너지 조합 도감** | 파티 편성 도우미 | 중간 |
| **소환 히스토리** | 최근 100회 소환 기록 | 낮음 |
| **MVP 시스템** | 전투 후 MVP 선정, 보너스 EXP | 낮음 |
| **SystemBootstrap** | 시스템 초기화 순서 관리자 | 높음 |
| **상태 머신** | 게임 흐름 FSM (로딩→로비→전투→결과) | 높음 |

---

## 8. Phase별 실행 계획

### Phase 1: 기반 통합 (1주차) - P0 태스크
| TASK | 팀 | 핵심 목표 |
|------|-----|----------|
| A-1 | A | systems/index.js 17개 시스템 전체 export |
| C-1 | C | data/index.js Element→Mood 전면 교체 |
| C-2 | C | GachaScene↔GachaSystem 교체 + 확률 PRD 일치 |
| E-1 | E | 39명 캐릭터 데이터 완전성 감사 |
| F-1 | F | BootScene 초기화 흐름 검증 |
| F-3 | F | MainMenuScene 데이터 바인딩 검증 |
| F-4 | F | GachaScene 전체 상호작용 검증 |
| G-1 | G | DebugManager require→import 수정 |
| G-2 | G | clearAllStages stages.json 연동 |

### Phase 2: 핵심 통합 (2주차) - P0 계속
| TASK | 팀 | 핵심 목표 |
|------|-----|----------|
| A-2 | A | PersonalitySystem→BattleScene 완전 연결 |
| B-2 | B | StageSelectScene→stages.json 동적 로드 |
| B-3 | B | EnergySystem↔StageSelectScene 실시간 연결 |
| E-2 | E | 42명 캐릭터 설계 시작 |
| F-6 | F | HeroDetailScene 육성 시스템 검증 |
| F-7 | F | StageSelectScene 전체 검증 |
| F-8 | F | BattleScene 전체 검증 |
| F-11 | F | GachaScene↔GachaSystem 교체 후 검증 |

### Phase 3: 확장 (3주차) - P1 태스크
A-3~A-7, B-1, B-4, C-3~C-4, E-3~E-5, E-9~E-10,
F-2, F-5, F-9~F-10, F-12, G-3~G-7,
H-1~H-4, D-1~D-3

### Phase 4: 폴리싱 (4주차) - P2~P3 태스크
A-6, A-8, B-5~B-7, C-5~C-7, E-6~E-8,
G-8~G-10, H-5~H-10, D-4~D-5

---

## 9. TASK 전체 요약

| 팀 | P0 | P1 | P2 | P3 | 합계 |
|----|----|----|----|----|------|
| A: 전투 통합 | 2 | 4 | 1 | 1 | **8** |
| B: 신규 씬 & UI | 3 | 1 | 3 | 0 | **7** |
| C: 데이터 & 백엔드 | 2 | 2 | 1 | 2 | **7** |
| D: 통합 QA | 0 | 3 | 2 | 0 | **5** |
| E: 캐릭터 데이터 | 2 | 5 | 2 | 1 | **10** |
| F: 씬/패널 검증 | 6 | 6 | 0 | 0 | **12** |
| G: 치트 API | 2 | 5 | 3 | 0 | **10** |
| H: 디자인 & 에셋 | 0 | 6 | 3 | 1 | **10** |
| **합계** | **17** | **32** | **15** | **5** | **69** |

---

> 이 문서는 PRD v1~v4, Backend PRD, Character Design PRD를 통합하고,
> 현재 구현 상태의 GAP 분석을 반영한 최종 개발 계획서입니다.
> 각 TASK는 "유저 터치→시스템 반응→UI 갱신→저장" 완전 체인으로 설계되었으며,
> 팀별 추론 프로토콜을 통해 이슈 발생을 최소화합니다.

---

## 10. v5.2 속성(Element) 삭제 및 분위기(Mood) 마이그레이션 계획

### 10.1 마이그레이션 범위 (119개 참조)

| 우선순위 | 영역 | 파일 수 | 참조 수 | 작업 내용 |
|---------|------|--------|--------|----------|
| **P0** | 데이터 JSON | 4 | ~90 | characters.json(personality→mood), enemies.json(element→mood), skills.json(element 삭제), items.json(element 아이템 삭제) |
| **P0** | 설정/상수 | 3 | ~15 | gameConfig.js(ELEMENTS 삭제, PERSONALITIES→MOODS), constants.js(PERSONALITY→MOOD), CULT_INFO.element 삭제 |
| **P1** | 전투 시스템 | 2 | ~25 | BattleSystem.js(getElementBonus→getMoodBonus), BattleScene.js(calculateElementBonus 교체) |
| **P1** | UI 컴포넌트 | 3 | ~10 | HeroCard.js(createElementIcon→createMoodIcon), SynergyDisplay.js(element 시너지→mood), HeroDetailScene.js |
| **P2** | 씬 로직 | 4 | ~15 | GachaScene.js(element 랜덤→mood), HeroListScene.js(정렬), PreloadScene.js(element 텍스처), StageSelectScene.js |
| **P2** | 유틸리티 | 3 | ~8 | textStyles.js(getElementStyle 삭제), drawUtils.js(drawElementIcon 삭제), data/index.js(함수 교체) |
| **P3** | 매니저 | 2 | ~6 | PartyManager.js(element→mood), SaveManager.js(마이그레이션 로직 추가) |

### 10.2 리네이밍 매핑 테이블

| 기존 (코드) | 신규 (v5.2) | 한글 | 비고 |
|-------------|-------------|------|------|
| `personality` | `mood` | 분위기 | 필드명 변경 |
| `PERSONALITY` | `MOOD` | — | 상수명 변경 |
| `PERSONALITIES` | `MOODS` | — | 설정 객체명 |
| `PERSONALITY_MATCHUP` | `MOOD_MATCHUP` | — | 상성 매핑 |
| `PERSONALITY_DAMAGE` | `MOOD_DAMAGE` | — | 상성 배율 |
| `PERSONALITY_INFO` | `MOOD_INFO` | — | 표시 정보 |
| `PERSONALITY_COLORS` | `MOOD_COLORS` | — | 색상 매핑 |
| `PersonalitySystem` | `MoodSystem` | — | 시스템 클래스 |
| `getPersonalityDamageMultiplier` | `getMoodDamageMultiplier` | — | 함수명 |
| `CULT_PERSONALITY_BONUS` | `CULT_MOOD_BONUS` | — | 교단-분위기 보너스 |
| `personalitySynergies` | `moodSynergies` | — | 시너지 데이터 |
| `element` (적 데이터) | `mood` | 분위기 | enemies.json |
| `element` (스킬) | 삭제 | — | skills.json |
| `ELEMENTS` (상수) | 삭제 | — | gameConfig.js |

### 10.3 분위기(Mood) 한글명 확정

| 코드 | 기존 한글 (성격) | **v5.2 한글 (분위기)** | 컨셉 키워드 |
|------|-----------------|---------------------|------------|
| `brave` | 용감 | **열혈** | 뜨거운 투지, 돌진, 공격적 오라 |
| `cunning` | 교활 | **냉철** | 차가운 계산, 약점 공략, 전략적 |
| `calm` | 침착 | **고요** | 잔잔한 호수, 방어적, 지구전 |
| `wild` | 야성 | **광폭** | 폭풍 같은 에너지, 속공, 연타 |
| `mystic` | 신비 | **신비** | 초월적 오라, 마법, 범용 보너스 |

### 10.4 SaveManager 마이그레이션 로직 (신규)
```javascript
// SaveManager.load() 내에서 자동 마이그레이션
function migrateV5_2(saveData) {
  // 1. character.personality → character.mood
  saveData.characters?.forEach(char => {
    if (char.personality && !char.mood) {
      char.mood = char.personality;
      delete char.personality;
    }
    if (char.element) {
      delete char.element; // element 완전 삭제
    }
  });
  // 2. gacha history의 element 참조 삭제
  saveData.version = "5.2";
  return saveData;
}
```

---

## 11. Git Worktree 8팀 병렬 작업 계획

### 11.1 브랜치 전략 (8팀 매핑)

```
main (안정, 릴리스용)
├── arcane/team-a-battle      ← TEAM A: 전투 통합 (systems + battle scenes)
├── arcane/team-b-scenes      ← TEAM B: 신규 씬 & UI (Tower/Login/Quest)
├── arcane/team-c-data        ← TEAM C: 데이터 & 백엔드 (migration, Supabase)
├── arcane/team-d-qa          ← TEAM D: 통합 QA & 최적화
├── arcane/team-e-chars       ← TEAM E: 캐릭터 데이터 설계
├── arcane/team-f-verify      ← TEAM F: 씬/패널 로직 검증
├── arcane/team-g-debug       ← TEAM G: 치트/디버그 API
├── arcane/team-h-design      ← TEAM H: 디자인 시스템 & 에셋
├── arcane/integration        ← 통합 테스트 브랜치
└── arcane/mood-migration     ← v5.2 속성→분위기 마이그레이션 전용
```

### 11.2 Worktree 폴더 구조

```
D:\park\
├── YD_Claude_RND/                    (main - 원본)
├── YD_Claude_RND-integration/        (arcane/integration - 통합)
├── YD_Claude_RND-team-a/             (arcane/team-a-battle)
├── YD_Claude_RND-team-b/             (arcane/team-b-scenes)
├── YD_Claude_RND-team-c/             (arcane/team-c-data)
├── YD_Claude_RND-team-d/             (arcane/team-d-qa)
├── YD_Claude_RND-team-e/             (arcane/team-e-chars)
├── YD_Claude_RND-team-f/             (arcane/team-f-verify)
├── YD_Claude_RND-team-g/             (arcane/team-g-debug)
├── YD_Claude_RND-team-h/             (arcane/team-h-design)
└── YD_Claude_RND-mood-migration/     (arcane/mood-migration)
```

### 11.3 파일 소유권 (충돌 방지)

| 팀 | 소유 파일/디렉터리 | 공유 금지 |
|----|-------------------|----------|
| A | `src/systems/BattleSystem.js`, `src/scenes/BattleScene.js` | BattleSystem 직접 수정 |
| B | `src/scenes/Tower*.js`, `src/scenes/Login*.js`, `src/scenes/Quest*.js` (신규) | 신규 씬 생성 |
| C | `src/data/**`, `src/api/**`, `src/services/**`, `supabase/**` | JSON 데이터, API |
| D | `tests/**`, `docs/test-reports/**` | 테스트 스크립트 |
| E | `src/data/characters.json`, `src/data/enemies.json`, `src/data/equipment.json` | 캐릭터/장비 데이터 |
| F | `src/scenes/*Scene.js` (기존 씬 검증, 수정은 A/B와 협의) | 읽기+검증 위주 |
| G | `src/systems/DebugManager.js`, `src/utils/cheatAPI.js` (신규) | 디버그 도구 |
| H | `src/components/**`, `src/config/gameConfig.js` (스타일), `assets/**` | UI 컴포넌트 |

> **충돌 해결 우선순위**: C(데이터) > A(시스템) > E(캐릭터) > B(씬) > H(디자인) > G(디버그) > F(검증) > D(QA)

### 11.4 Phase별 병렬 실행 계획

```
Week 1 (기반):
  [C] ─── 데이터 마이그레이션 (element→mood, JSON 정리)
  [E] ─── 캐릭터 감사 + 분위기(mood) 재배정
  [G] ─── DebugManager ES Module 수정
  [mood-migration] ─── 119개 element 참조 일괄 교체
  ↓ merge → integration

Week 2 (핵심):
  [A] ─── BattleSystem↔BattleScene 연결, MoodSystem 통합
  [B] ─── TowerScene, PartyEditScene 생성
  [H] ─── 공통 UI 컴포넌트 (BottomNav 5탭, TopBar)
  ↓ merge → integration

Week 3 (확장):
  [A] ─── SynergySystem 통합, 자동전투 AI
  [B] ─── LoginScene, QuestScene
  [C] ─── Supabase 연동
  [E] ─── 42명 추가 캐릭터 + 장비 81개
  [F] ─── 모든 Scene 데이터 바인딩 검증
  ↓ merge → integration

Week 4 (폴리싱):
  [D] ─── E2E 테스트, 크로스 브라우저 검증
  [H] ─── 최종 디자인, 애니메이션 폴리싱
  [ALL] ─── 버그 수정, 최종 통합
  ↓ merge → main (릴리스)
```

### 11.5 커밋 컨벤션 (v5.2)
```
[TEAM-X][TASK-ID] 설명

예시:
[TEAM-A][A-1] BattleSystem↔BattleScene 연결
[TEAM-C][C-1] data/index.js Element→Mood 마이그레이션
[TEAM-E][E-1] 39명 캐릭터 mood 필드 검증 완료
[MOOD] 119개 element 참조 일괄 교체
```

---

## 12. 팀별 문서화 에이전트 구성

> 각 팀에 전담 **문서화 에이전트**를 배정하여 개발 계획/구성/구현을 체계적으로 기록합니다.

### 12.1 문서화 에이전트 역할

| 역할 | 산출물 | 생성 시점 | 저장 위치 |
|------|--------|----------|----------|
| **계획 문서** | `PLAN.md` — 팀 목표, 의존성, 일정 | TASK 시작 전 | `docs/teams/{team}/PLAN.md` |
| **구성 문서** | `ARCHITECTURE.md` — 파일 구조, 데이터 흐름, API 계약 | TASK 설계 시 | `docs/teams/{team}/ARCHITECTURE.md` |
| **구현 로그** | `IMPLEMENTATION.md` — 완료 항목, 변경 이력, 이슈/해결 | TASK 완료 시 | `docs/teams/{team}/IMPLEMENTATION.md` |
| **검증 보고** | `VERIFICATION.md` — 테스트 결과, 미해결 이슈 | Phase 종료 시 | `docs/teams/{team}/VERIFICATION.md` |

### 12.2 팀별 에이전트 배정

| 팀 | 구현 에이전트 (기존) | **문서화 에이전트 (신규)** | 문서화 범위 |
|----|---------------------|--------------------------|------------|
| **TEAM A** | executor-high (opus) | **writer** (haiku) | 전투 시스템 통합 과정, MoodSystem 연동 API |
| **TEAM B** | executor (sonnet) | **writer** (haiku) | 신규 씬 설계서, UI 플로우 다이어그램 |
| **TEAM C** | executor (sonnet) | **writer** (haiku) | 데이터 스키마 변경 이력, Supabase 마이그레이션 가이드 |
| **TEAM D** | qa-tester-high (opus) | **writer** (haiku) | 테스트 케이스 목록, QA 보고서 |
| **TEAM E** | executor (sonnet) | **writer** (haiku) | 캐릭터 밸런스 시트, mood 배정 근거 |
| **TEAM F** | architect (opus) | **writer** (haiku) | 검증 체크리스트, 버그 트래커 |
| **TEAM G** | executor-low (haiku) | **writer** (haiku) | 치트 API 사용 가이드, 디버그 명령어 레퍼런스 |
| **TEAM H** | designer-high (opus) | **writer** (haiku) | 디자인 시스템 가이드, 컴포넌트 카탈로그 |

### 12.3 문서 디렉터리 구조 (신규)
```
docs/
├── PRD_Unified_v5.md          (마스터 문서)
├── TEAM_COMPOSITION.md        (팀 구성 참조)
├── WORKTREE_GUIDE.md          (Git Worktree 가이드)
├── teams/
│   ├── team-a/
│   │   ├── PLAN.md            ← 전투 통합 계획
│   │   ├── ARCHITECTURE.md    ← BattleSystem↔Scene API 계약
│   │   ├── IMPLEMENTATION.md  ← 구현 로그
│   │   └── VERIFICATION.md    ← 전투 시나리오 테스트 결과
│   ├── team-b/
│   │   ├── PLAN.md            ← 신규 씬 생성 계획
│   │   ├── ARCHITECTURE.md    ← 씬 플로우, 데이터 전달 패턴
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   ├── team-c/
│   │   ├── PLAN.md            ← 데이터 마이그레이션 계획
│   │   ├── ARCHITECTURE.md    ← JSON 스키마, Supabase 테이블 설계
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   ├── team-d/
│   │   ├── PLAN.md            ← QA 전략
│   │   ├── ARCHITECTURE.md    ← 테스트 프레임워크 구성
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   ├── team-e/
│   │   ├── PLAN.md            ← 캐릭터 설계 계획
│   │   ├── ARCHITECTURE.md    ← 밸런스 공식, mood 배정 기준
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   ├── team-f/
│   │   ├── PLAN.md            ← 검증 계획
│   │   ├── ARCHITECTURE.md    ← 검증 체크리스트 설계
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   ├── team-g/
│   │   ├── PLAN.md            ← 치트 API 계획
│   │   ├── ARCHITECTURE.md    ← 디버그 명령어 설계
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   └── team-h/
│       ├── PLAN.md            ← 디자인 시스템 계획
│       ├── ARCHITECTURE.md    ← 컴포넌트 카탈로그
│       ├── IMPLEMENTATION.md
│       └── VERIFICATION.md
└── changelogs/
    └── v5.2-mood-migration.md ← 속성→분위기 변경 이력
```

### 12.4 문서화 에이전트 실행 프로토콜

```
1. TASK 시작 시:
   → writer 에이전트가 PLAN.md 생성 (목표, 의존성, 예상 파일 변경 목록)

2. 설계 완료 시:
   → writer 에이전트가 ARCHITECTURE.md 생성 (API 계약, 데이터 흐름도, 인터페이스 명세)

3. 구현 중:
   → writer 에이전트가 IMPLEMENTATION.md에 변경 사항 누적 기록
   (변경 파일, 라인 범위, 변경 이유, 이슈 해결 방법)

4. Phase 종료 시:
   → writer 에이전트가 VERIFICATION.md 생성 (테스트 결과, 미해결 이슈, 다음 Phase 의존사항)
```

---

## 13. 캐릭터별 시너지 조합 시스템 (v5.2 신규)

### 13.1 시너지 유형 (4종)

| 시너지 유형 | 발동 조건 | 효과 | 데이터 소스 |
|------------|----------|------|------------|
| **교단(Cult) 시너지** | 같은 교단 2/3/4명 | ATK/DEF/HP/SPD 비율 증가 | `synergies.json → cultSynergies` |
| **분위기(Mood) 시너지** | 특정 분위기 조합 2명 | 조합별 고유 효과 | `synergies.json → moodSynergies` |
| **역할(Role) 시너지** | 특정 역할 조합 | 팀 전체 버프 | `synergies.json → roleSynergies` (추가 필요) |
| **특수(Special) 시너지** | 특정 캐릭터 2~3명 조합 | 고유 스킬/버프 | `synergies.json → specialSynergies` |

### 13.2 교단 시너지 상세

| 교단 | 2명 | 3명 | 4명 (풀 파티) |
|------|-----|-----|-------------|
| Olympus | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Valhalla | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Takamagahara | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Asgard | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Yomi | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |

### 13.3 분위기(Mood) 시너지 상세 (기존 personalitySynergies → moodSynergies 리네이밍)

| 시너지명 | 조합 | 효과 |
|---------|------|------|
| **전사의 포효** (Warriors Fury) | Brave + Wild | ATK +15%, SPD +10% |
| **냉철한 계산** (Cold Calculation) | Cunning + Calm | CRIT_RATE +12%, DEF +8% |
| **신비의 축복** (Mystic Blessing) | Mystic + 아무나 | 스킬 데미지 +10% |
| **힘의 균형** (Balance of Power) | 3가지 이상 분위기 | 전체 스탯 +5% |
| **맹렬한 돌격** (Fierce Assault) | Brave + Cunning | ATK +12%, CRIT_DMG +15% |
| **그림자 전술** (Shadow Tactics) | Wild + Cunning | SPD +15%, 회피 +8% |

### 13.4 교단-분위기 최적 조합 보너스 (×1.15)

| 교단 | 최적 분위기 | 보너스 | 테마 설명 |
|------|-----------|--------|----------|
| **Valhalla** | Brave (열혈) | 전체 스탯 ×1.15 | 발할라의 전사는 열혈 투지를 높이 평가 |
| **Takamagahara** | Mystic (신비) | 전체 스탯 ×1.15 | 천상계는 신비로운 힘을 환영 |
| **Olympus** | Cunning (냉철) | 전체 스탯 ×1.15 | 올림포스의 신들은 지혜와 전략을 중시 |
| **Asgard** | Calm (고요) | 전체 스탯 ×1.15 | 아스가르드는 고요한 수호자를 필요로 함 |
| **Yomi** | Wild (광폭) | 전체 스탯 ×1.15 | 저승은 광폭한 영혼을 끌어들임 |

### 13.5 특수 시너지 (캐릭터 고유 조합)

| 시너지명 | 캐릭터 조합 | 효과 | 스토리 근거 |
|---------|-----------|------|------------|
| **노르딕 황혼** | Thor + Freya | ATK +20%, HP +15% | 형제의 유대 |
| **일본 삼종신기** | Amaterasu + Tsukuyomi + Susanoo | 전체 스탯 +12% | 삼신의 조화 |
| **올림포스 삼주** | Zeus + Poseidon + Hades | ATK +18%, DEF +12% | 세계 지배자 |
| **사랑과 전쟁** | Aphrodite + Ares | CRIT_RATE +15%, ATK +10% | 전설의 커플 |
| **쌍둥이 별** | Apollo + Artemis | SPD +20%, CRIT_DMG +15% | 쌍둥이 사냥 |
| **지혜의 눈** | Athena + Odin | DEF +15%, 스킬 데미지 +12% | 지혜의 교류 |
| **빛과 어둠** | Amaterasu + Izanami | 전체 스탯 +8%, HP 회복 +5% | 빛과 죽음 |
| **바이킹 맹세** | Thor + Odin + Freya | ATK +15%, DEF +10%, SPD +10% | 발할라 핵심 |
| **화산의 대장장이** | Hephaestus + Ares | ATK +15%, 장비 효과 +10% | 무기 제작자 |
| **저승의 안내자** | Izanami + Susanoo | HP +20%, 부활 확률 5% | 저승의 동맹 |

### 13.6 시너지 UI 표시 (BattleScene, PartyEditScene)

```
파티 편성 시:
┌─────────────────────────────┐
│ 현재 파티 시너지             │
│ ⚔️ 발할라 결속 (3/4)  ATK+15% │
│ 🔥 전사의 포효      ATK+15% │
│ ⭐ 최적 조합 보너스   ×1.15  │
│ 💎 노르딕 황혼       ATK+20% │
└─────────────────────────────┘

전투 시작 시:
→ 활성 시너지 목록 팝업 (1.5초)
→ 버프 아이콘으로 상단 표시
```

### 13.7 시너지 발동 스킬 시스템 (v5.2 신규)

> 특정 캐릭터 조합이 파티에 편성되면, 전투 중 **시너지 스킬**이 자동/수동으로 발동됩니다.

#### 스킬 유형

| 유형 | 발동 조건 | 발동 방식 | 쿨다운 |
|------|----------|----------|--------|
| **시너지 패시브** | 전투 시작 시 자동 적용 | 영구 버프 (전투 종료까지) | 없음 |
| **시너지 액티브** | 게이지 100% 충전 시 | 카드덱에 추가 카드로 등장 | 3~5턴 쿨다운 |
| **시너지 궁극기** | 특수 시너지 3인 조합 시 | 전투 1회 한정, 별도 버튼 | 전투당 1회 |

#### 교단 시너지 발동 스킬

| 교단 | 2명 패시브 | 3명 액티브 | 4명 궁극기 |
|------|-----------|-----------|-----------|
| **Olympus** | `신들의 가호` — 전체 HP 회복 5%/턴 | `올림포스 번개` — 랜덤 적 3회 번개 (ATK×1.5) | `신전의 심판` — 전체 적 ATK×3.0, 1턴 기절 |
| **Valhalla** | `전사의 맹세` — ATK +15% 고정 | `발키리 강림` — 아군 1명 부활(HP 30%) | `라그나로크` — 전체 적 ATK×3.5, 아군 ATK+30% 3턴 |
| **Takamagahara** | `천상의 축복` — SPD +20% | `신풍` — 아군 전체 회피율 +25% 2턴 | `아마테라스의 빛` — 전체 적 ATK×2.5, 아군 전체 회복 50% |
| **Asgard** | `수호자의 방패` — DEF +20% | `비프로스트 방벽` — 데미지 흡수 실드 (HP×30%) | `오딘의 지혜` — 적 전체 DEF -50% 3턴, 아군 CRIT +30% |
| **Yomi** | `저승의 속삭임` — 적 SPD -10% | `원령 소환` — 적 1명에 DOT (ATK×0.5, 3턴) | `이자나미의 저주` — 적 전체 HP 25% 즉사, DOT 5턴 |

#### 분위기(Mood) 시너지 발동 스킬

| 시너지명 | 조합 | 패시브 효과 | 액티브 스킬 |
|---------|------|------------|------------|
| **전사의 포효** | Brave + Wild | ATK +15%, SPD +10% | `열혈 돌격` — 단일 적 ATK×2.5, 자신 HP -10% |
| **냉철한 계산** | Cunning + Calm | CRIT_RATE +12%, DEF +8% | `약점 간파` — 단일 적 DEF -30% 2턴 |
| **신비의 축복** | Mystic + 아무나 | 스킬 데미지 +10% | `마력 폭발` — 전체 적 ATK×1.8 마법 데미지 |
| **맹렬한 돌격** | Brave + Cunning | ATK +12%, CRIT_DMG +15% | `기습 참격` — 단일 적 ATK×3.0, 무시 방어 50% |
| **그림자 전술** | Wild + Cunning | SPD +15%, 회피 +8% | `연환격` — 랜덤 적 5회 연타 (ATK×0.6 각) |
| **힘의 균형** | 3+ 분위기 혼합 | 전체 스탯 +5% | `조화의 파동` — 아군 전체 HP 회복 15%, 버프 1턴 연장 |

#### 특수 시너지 궁극기 (캐릭터 고유)

| 시너지 | 캐릭터 | 궁극기 | 효과 | 연출 |
|--------|--------|--------|------|------|
| **노르딕 황혼** | Thor + Freya | `발할라 폭풍` | 전체 ATK×4.0 + 아군 HP 회복 20% | 천둥+꽃잎 |
| **일본 삼종신기** | Amaterasu + Tsukuyomi + Susanoo | `삼신일체` | 전체 ATK×5.0, 3턴 무적 | 태양+달+폭풍 |
| **올림포스 삼주** | Zeus + Poseidon + Hades | `천지명계` | 전체 ATK×4.5, 적 전체 -30% 올스탯 | 번개+파도+그림자 |
| **사랑과 전쟁** | Aphrodite + Ares | `카오스 하트` | 단일 ATK×6.0, 50% 확률 매혹(1턴 행동불능) | 하트+칼날 |
| **쌍둥이 별** | Apollo + Artemis | `일월사격` | 전체 ATK×3.0 ×2회 (태양+달 연속) | 태양광+달빛 |

#### 시너지 스킬 데이터 스키마 (추가 필요)
```javascript
// synergies.json 확장
{
  "synergySkills": {
    "cult_olympus_2": {
      "type": "passive",
      "name": "신들의 가호",
      "nameKo": "신들의 가호",
      "effect": { "healPerTurn": 0.05 },
      "description": "올림포스 영웅 2명 편성 시 매 턴 HP 5% 회복"
    },
    "cult_olympus_3": {
      "type": "active",
      "name": "올림포스 번개",
      "nameKo": "올림포스 번개",
      "multiplier": 1.5,
      "target": "random_3",
      "cooldown": 4,
      "gaugeCost": 80,
      "description": "랜덤 적 3명에게 번개 공격"
    },
    "cult_olympus_4": {
      "type": "ultimate",
      "name": "신전의 심판",
      "nameKo": "신전의 심판",
      "multiplier": 3.0,
      "target": "all",
      "usesPerBattle": 1,
      "additionalEffect": { "stun": 1 },
      "description": "전체 적에게 강력한 공격 + 1턴 기절"
    },
    "mood_brave_wild": {
      "type": "active",
      "name": "열혈 돌격",
      "multiplier": 2.5,
      "target": "single",
      "cooldown": 3,
      "selfDamage": 0.10,
      "description": "단일 적에게 강력한 돌격, 자신 HP 10% 소모"
    },
    "special_thor_freya": {
      "type": "ultimate",
      "name": "발할라 폭풍",
      "multiplier": 4.0,
      "target": "all",
      "usesPerBattle": 1,
      "healAlly": 0.20,
      "description": "전체 적 공격 + 아군 전체 HP 20% 회복",
      "requiredHeroes": ["hero_017", "hero_019"]
    }
  }
}
```

#### 전투 중 시너지 스킬 발동 플로우
```
1. 전투 시작:
   → SynergySystem.calculateSynergies(party) 호출
   → 활성 시너지 목록 + 발동 가능 스킬 계산
   → 패시브 즉시 적용
   → 액티브 스킬 카드풀에 추가 (3턴 쿨다운 후부터)
   → 궁극기 버튼 UI 표시 (충전 게이지)

2. 매 턴:
   → 패시브 효과 지속 적용 (힐, 버프 등)
   → 카드덱 3장 중 시너지 액티브 카드 확률적 등장 (30%)
   → 궁극기 게이지 충전 (+20%/턴)

3. 궁극기 발동:
   → 게이지 100% 시 별도 [궁극기] 버튼 활성화
   → 터치 시 풀스크린 연출 (1.5초)
   → 전투당 1회 한정
```

---

## 14. 확장가능성 평가 (v5.2)

### 14.1 현재 아키텍처 확장성 등급

| 영역 | 확장성 | 근거 |
|------|--------|------|
| **교단 추가** | ★★★★★ | JSON 기반, 코드 변경 없이 추가 가능 |
| **분위기 추가** | ★★★★☆ | 상성 테이블 수정 필요하나 구조적으로 가능 |
| **캐릭터 추가** | ★★★★★ | characters.json에 데이터만 추가 |
| **스테이지 추가** | ★★★★★ | stages.json에 챕터 추가 |
| **장비 추가** | ★★★★★ | equipment.json에 데이터만 추가 |
| **스킬 추가** | ★★★★☆ | skills.json + BattleSystem 효과 코드 필요 |
| **씬 추가** | ★★★☆☆ | Phaser Scene 생성 + main.js 등록 + BottomNav 연결 |
| **PvP 추가** | ★★☆☆☆ | Supabase Realtime 필요, BattleSystem 대규모 수정 |
| **길드 시스템** | ★★☆☆☆ | 신규 DB 테이블 + 씬 + 시스템 전면 설계 |
| **이벤트 시스템** | ★★★☆☆ | 시간 기반 콘텐츠 로더 + 전용 씬 필요 |

### 14.2 향후 확장 로드맵 (Phase 5+)

| Phase | 기능 | 난이도 | 의존성 |
|-------|------|--------|--------|
| 5 | PvP 아레나 | 높음 | Supabase Realtime, BattleSystem 확장 |
| 5 | 길드 시스템 | 높음 | Supabase, 신규 Scene/System |
| 6 | 이벤트 던전 | 중간 | 스테이지 시스템 확장 |
| 6 | 장비 세트 효과 | 중간 | EquipmentSystem 확장 |
| 7 | 월드보스 | 높음 | 멀티플레이어 기반 |
| 7 | 캐릭터 스킨 | 낮음 | 에셋 추가만 필요 |

---

## 15. 캐릭터 밸런스 분석 및 분위기(Mood) 재구성 (v5.2)

### 15.1 현재 캐릭터 분포 분석 (39명)

#### 분위기(Mood)별 분포 — **불균형 감지**

| 분위기 | 인원 | 비율 | 상태 |
|--------|------|------|------|
| Calm (고요) | 13명 | 33.3% | ⚠️ **과다** |
| Wild (광폭) | 10명 | 25.6% | ✅ 적정 |
| Mystic (신비) | 7명 | 17.9% | ✅ 적정 |
| Brave (열혈) | 5명 | 12.8% | ⚠️ **과소** |
| Cunning (냉철) | 4명 | 10.3% | 🔴 **심각 부족** |

> **밸런스 목표**: 각 분위기당 7~9명 (전체 대비 18~23%)

#### 교단(Cult)별 분포 — **asgard 심각 부족**

| 교단 | 인원 | 비율 | 상태 |
|------|------|------|------|
| Olympus | 9명 | 23.1% | ✅ |
| Valhalla | 9명 | 23.1% | ✅ |
| Takamagahara | 9명 | 23.1% | ✅ |
| Yomi | 9명 | 23.1% | ✅ |
| Asgard | **3명** | **7.7%** | 🔴 **심각 부족** |

#### 교단 × 분위기 크로스탭 — 빈 칸 = 전략적 갭

| 교단 | Brave | Calm | Cunning | Mystic | Wild |
|------|-------|------|---------|--------|------|
| Olympus | 1 | 3 | **0** | 2 | 3 |
| Valhalla | 2 | 2 | 1 | 1 | 3 |
| Takamagahara | 1 | 4 | **0** | 1 | 3 |
| Asgard | 1 | 2 | **0** | **0** | **0** |
| Yomi | **0** | 2 | 3 | 3 | 1 |

> **빈 칸(0) 7개** — 교단-분위기 시너지 조합 불가능 영역

### 15.2 분위기 재배정 검토 (기존 39명)

> 캐릭터 컨셉과 분위기 일치도를 검토하여, 일부 캐릭터의 분위기를 재배정합니다.

#### 재배정 제안

| ID | 캐릭터 | 현재 분위기 | **재배정** | 근거 |
|----|--------|------------|-----------|------|
| hero_006 | 루나 (Olympus 궁수) | calm | **cunning** | "밤의 사냥꾼" 컨셉은 냉철한 전략가에 가까움 |
| hero_013 | 렉스 (Yomi 전사) | calm | **brave** | "어둠의 힘을 사용하는 전사"는 열혈에 가까움 |
| hero_014 | 아이비 (Asgard 마법사) | calm | **mystic** | "물의 마법을 연구"는 신비 분위기에 적합 |
| hero_011 | 테오 (Olympus 마법사) | wild | **brave** | "불장난을 좋아하는"은 열혈에 가까움 |
| hero_022 | 아마테라스 (Taka 마법사) | calm | **mystic** | "태양의 여신"은 신비 분위기가 더 적합 |

#### 재배정 후 예상 분포

| 분위기 | 변경 전 | 변경 후 | 변화 |
|--------|--------|--------|------|
| Calm | 13 | **9** | -4 |
| Wild | 10 | **9** | -1 |
| Mystic | 7 | **9** | +2 |
| Brave | 5 | **7** | +2 |
| Cunning | 4 | **5** | +1 |

### 15.3 Asgard 확장 캐릭터 계획 (6명 추가 → 총 9명)

| 순번 | 이름 | 레어리티 | 분위기 | 역할 | 컨셉 |
|------|------|---------|--------|------|------|
| 1 | **발두르** (Baldur) | 5★ SSR | Brave | Warrior | 빛의 신, 아스가르드의 희망. 불멸의 투지 |
| 2 | **프리그** (Frigg) | 5★ SSR | Mystic | Healer | 오딘의 아내, 예언의 여신. 신비로운 보호 |
| 3 | **티르** (Tyr) | 4★ SR | Brave | Warrior | 전쟁과 정의의 신. 한 팔의 용맹한 전사 |
| 4 | **이둔** (Idun) | 4★ SR | Calm | Healer | 청춘의 여신, 황금 사과의 수호자 |
| 5 | **브라기** (Bragi) | 3★ R | Cunning | Archer | 시와 음악의 신. 영리한 음유시인 |
| 6 | **스카디** (Skadi) | 4★ SR | Wild | Archer | 겨울과 사냥의 여신. 광폭한 설원의 사냥꾼 |

#### 확장 후 Asgard 교단 구성 (9명)

| 분위기 | 인원 | 캐릭터 |
|--------|------|--------|
| Brave | 3 | 핀, 발두르, 티르 |
| Calm | 3 | 로제, 아이비→(mystic 재배정 시 2), 이둔 |
| Cunning | 1 | 브라기 |
| Mystic | 1 | 아이비(재배정) 또는 프리그 |
| Wild | 1 | 스카디 |

### 15.4 추가 캐릭터 확충 계획 요약

| 교단 | 현재 | 추가 | 목표 | 중점 분위기 |
|------|------|------|------|------------|
| Olympus | 9 | +2 | 11 | Cunning +1, Brave +1 |
| Valhalla | 9 | +1 | 10 | Brave +1 (3성 궁수) |
| Takamagahara | 9 | +2 | 11 | Cunning +1, Brave +1 |
| Asgard | 3 | **+6** | **9** | 전 분위기 커버 |
| Yomi | 9 | +1 | 10 | Brave +1 (반항적 영웅) |
| **합계** | **39** | **+12** | **51** | 밸런스 우선 |

> 이후 Phase에서 추가 30명 확충하여 최종 81명 목표 달성

---

## 부록 A: PRD 버전 간 사양 불일치 — 최종 결정 (v5.1 확정)

> 아래 항목들은 PRD v1~v4 문서 간 상충했던 사양입니다. **코드 분석 근거**와 **게임 디자인 원칙**에 기반하여 최종 결정되었습니다.

### A-1. 에너지 최대치 → `100 + (레벨 × 2)`
- **PRD v1~v2**: 최대 50 고정
- **PRD v3~v4**: `100 + (레벨 × 2)`
- **코드**: `ENERGY.BASE_MAX = 100`, `ENERGY.PER_LEVEL = 2` / `GAME_CONSTANTS.baseMaxEnergy = 100`
- **결정 근거**: 코드에 이미 구현 완료. 레벨링 보상감과 장기 플레이 유인력 확보. 50은 MVP 시절 잔재.
- **영향 TASK**: C-4 (EnergySystem 통합)

### A-2. 스테이지 에너지 비용 → 타입별 고정 (NORMAL:6, ELITE:12, BOSS:20)
- **PRD v1~v2**: `챕터×2 + 스테이지번호` (가변)
- **PRD v3~v4**: 일반:6, 엘리트:12, 보스:20
- **코드**: `STAGE_ENERGY_COST = { NORMAL: 6, ELITE: 12, BOSS: 20 }`
- **결정 근거**: 타입별 고정이 UX 예측가능성 높음. 챕터 진행 시 에너지 부담 비선형 급증 방지.
- **영향 TASK**: C-4, A-2 (스테이지 전투 진입)

### A-3. 데미지 공식 → `ATK × 배율 × (1 - DEF/1000)` (최소 10%)
- **PRD v1~v2**: `ATK × 배율 - DEF × 0.5` (감산형)
- **PRD v3~v4**: `ATK × 배율 × (1 - DEF/1000)` (배율형)
- **코드**: BattleSystem.calculateDamage()에 배율형 구현, `defReduction = min(0.9, DEF/1000)`
- **⚠️ 추가 발견**: BattleScene.js의 자체 데미지 로직은 `1 - DEF/(DEF+200)` 사용 → **BattleSystem과 불일치!**
  - BattleSystem: `1 - DEF/1000` (선형 감소, 최소 10%)
  - BattleScene 자동전투: `1 - DEF/(DEF+200)` (비선형, 최소 없음)
  - BattleScene 수동스킬: `1 - DEF/(DEF+200)` + 크리티컬 25% 고정
- **결정**: `ATK × 배율 × (1 - DEF/1000, min 10%)` 통일 — BattleScene의 자체 로직 삭제, BattleSystem으로 일원화
- **결정 근거**: 배율형이 DEF 스케일링에 안정적. DEF+200 공식은 의도치 않은 비선형 스케일링 발생.
- **영향 TASK**: A-1 (BattleSystem ↔ BattleScene 연결) — 데미지 공식 통일 포함

### A-4. 장비 강화 → +15 상한, 실패률 있음
- **PRD v1~v2**: +15, 성공률 감소형
- **PRD v3~v4**: +20, 실패 없음
- **코드**: `MAX_ENHANCE_LEVEL = 15`, `successRate = max(0.3, 1.0 - level × 0.05)`
- **결정 근거**: +15+실패가 이미 구현. 실패 시스템이 전략적 깊이 제공. +20 무실패는 콘텐츠 소진 가속화.
- **영향 TASK**: E-7 (장비 데이터 확장)

### A-5. Mystic 성격 → 모든 대상에 +10% (1.1x)
- **PRD v1~v2**: ×1.0 (완전 중립)
- **PRD v3~v4**: +10% 고정 보너스
- **코드**: `PERSONALITY_DAMAGE.MYSTIC_BONUS = 1.1`, `PERSONALITIES.mystic.specialEffect: '모든 성격에 +10% 데미지'`
- **결정 근거**: 3곳(constants.js, gameConfig.js, SynergySystem.js)에서 일관적으로 +10% 구현. 가위바위보 상성에서 제외되는 대신 범용 보너스.
- **영향 TASK**: A-1, A-3 (PersonalitySystem 전투 연동)

### A-6. 별 평가 → 3단계 복합 기준 (HP잔존율 + 턴 제한)
- **PRD v1~v2**: 전원생존 + 10턴 이내 = 3성
- **PRD v3~v4**: 파티 손상도 ≤ 10% = 3성
- **코드**: `const newStars = 3; // TODO: Calculate based on performance` → **미구현**
- **결정**: 두 버전의 장점 통합
  - ★★★: 파티 총HP ≥ 70% + 턴 제한 이내 클리어
  - ★★: 파티 총HP ≥ 30% + 클리어
  - ★: 클리어 (조건 불문)
- **결정 근거**: HP 기준이 직관적, 턴 제한이 전략적 긴장감 부여. 모바일 RPG 표준 3단계.
- **영향 TASK**: A-1 (전투 결과 계산), F-3 (StageSelectScene 별 표시)

### A-7. 하단 네비게이션 → 홈/모험/소환/영웅/더보기 (5탭)
- **PRD v1~v2**: 모험/소환/영웅/상점/메뉴 (5탭)
- **PRD v3~v4**: 홈/모험/가방/소환/더보기 (5탭)
- **코드**: 모험/소환/영웅/메뉴 (**4탭만 구현**)
- **결정**: `홈 | 모험 | 소환 | 영웅 | 더보기`
  - 홈: MainMenuScene (메인 대시보드)
  - 모험: StageSelectScene
  - 소환: GachaScene
  - 영웅: HeroListScene
  - 더보기: 설정/상점/퀘스트/가방 서브메뉴
- **결정 근거**: 모바일 RPG 표준 5탭. '홈' 복귀 필수. '더보기'로 확장성 확보.
- **영향 TASK**: B-1 (UI 공통 컴포넌트), F-1 (MainMenuScene 검증)

### A-8. 교단-분위기 보너스 → 5조합 ×1.15 확정 (⚠️ 3-way 불일치 발견)
- **PRD v1~v2**: 미정의
- **PRD v3~v4**: 5조합 정의 (발할라+Brave, 타카마가하라+Mystic, 올림푸스+Cunning, 아스가르드+Calm, 요미+Wild)
- **코드 불일치 3건**:
  1. `constants.js`: 정확한 교단명, 1:1 매핑 ×1.15 — **정본(Canon)**
  2. `PersonalitySystem.js`: **잘못된 교단명** (SHADOW/FLAME/FROST/NATURE/VOID 사용) → 수정 필요
  3. `personalities.json`: 교단당 최적 분위기 **2개**, 스탯 보너스 구조 다름 → constants.js 기준 통일
- **결정**: `constants.js` 기준 5조합 ×1.15 확정. PersonalitySystem.js 교단명 수정, personalities.json 1:1 매핑으로 통일.
- **영향 TASK**: A-3 (MoodSystem 통합), C-1 (synergies.json 데이터 보강), C-2 (personalities.json 재구성)

## 부록 B: 버전 변경 이력 요약

| 항목 | v1 (MVP) | v2 | v3 | v4 (최종) |
|------|----------|----|----|-----------|
| 파티 인원 | 5명 | 5명 | 5명 | **4명** |
| 속성 체계 | Fire/Water/Wind/Light/Dark | 동일 | 동일+교단 | **분위기(Mood) 5종** (v5.2) |
| 저장 방식 | LocalStorage | 동일 | 동일 | **Supabase+localStorage** |
| 해상도 | 미지정 | 480×854 | 480×854 | **720×1280** |
| 에너지 시스템 | 없음 | 없음 | 없음 | **신규** |
| 소탕 기능 | 없음 | 없음 | 없음 | **신규** |
| 장비 슬롯 | 3개 | 3개 | **4개(+유물)** | 4개 |
| 전투 방식 | 자동전투 | 턴제 자동 | **카드덱 스킬** | 카드덱 유지 |
| 스테이지 | 1챕터 10스테이지 | 동일 | 미변경 | **5챕터 25스테이지** |
| 상성 배율 | 미지정 | ±25% | ±25% | **±20%(분위기)** |

### 부록 B-2: v5.2 변경 사항 요약

| 변경 항목 | v5.0~v5.1 | **v5.2 (현재)** |
|----------|-----------|----------------|
| 특성 시스템 명칭 | 성격(Personality) | **분위기(Mood)** |
| 코드 필드명 | `personality` | **`mood`** |
| 한글명 | 용감/교활/침착/야성/신비 | **열혈/냉철/고요/광폭/신비** |
| 속성(Element) | 코드에 잔존 (119개 참조) | **완전 삭제** |
| Mystic 배율 | ×1.0 (중립) | **×1.1 (+10%)** |
| 별 평가 | 미구현 (TODO) | **3단계 HP+턴 복합기준** |
| 하단 네비 | 4탭 | **5탭 (홈/모험/소환/영웅/더보기)** |
| 시너지 스킬 | 없음 | **패시브/액티브/궁극기 3종** |
| 팀 문서화 | 없음 | **8팀 각 writer 에이전트 배정** |
| Git Worktree | 5워커 기반 | **8팀 기반 + mood-migration 전용** |
| 캐릭터 밸런스 | 미분석 | **39명 분석 + 5명 재배정 + 12명 추가 계획** |
