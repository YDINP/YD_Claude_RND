# ArcaneCollectors 아키텍처 문서

> 최종 업데이트: 2026-02-07

## 1. 시스템 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                    Phaser 3 Game Engine                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │BootScene │→ │LoginScene│→ │PreloadSc │→ │MainMenu│  │
│  └──────────┘  └──────────┘  └──────────┘  └───┬────┘  │
│                                                 │       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │       │
│  │BattleSc  │← │StageSel  │← │PartyEdit │←─────┤       │
│  └────┬─────┘  └──────────┘  └──────────┘      │       │
│       ↓                                         │       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │       │
│  │BattleRes │  │GachaSc   │← ─────────────────┤       │
│  └──────────┘  └──────────┘  ┌──────────┐      │       │
│                               │HeroList  │←─────┤       │
│  ┌──────────┐  ┌──────────┐  └──────────┘      │       │
│  │TowerSc   │← │QuestSc   │← ─────────────────┤       │
│  └──────────┘  └──────────┘  ┌──────────┐      │       │
│                               │InventorySc│←────┤       │
│                               └──────────┘      │       │
│                               ┌──────────┐      │       │
│                               │SettingsSc│←─────┘       │
│                               └──────────┘              │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ↓                    ↓                    ↓
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  Systems    │    │  Components  │    │   Services   │
│ (20 모듈)   │    │  (17 UI)     │    │  (8 백엔드)  │
└──────┬──────┘    └──────────────┘    └──────┬───────┘
       │                                       │
       ↓                                       ↓
┌─────────────┐                      ┌──────────────┐
│  Data Layer │                      │  Supabase    │
│ (JSON+index)│                      │ (PostgreSQL) │
└─────────────┘                      └──────────────┘
```

## 2. 씬 전환 흐름

### 2.1 초기화 체인

```
BootScene → LoginScene → PreloadScene → MainMenuScene
   │            │             │
   │ registry   │ 인증         │ 에셋 로드
   │ 초기화     │ (게스트/정식) │ + 진행바
```

### 2.2 메인 네비게이션 (BottomNav)

MainMenuScene에서 5개 탭으로 분기:

| 탭 | 씬 | 역할 |
|----|-----|------|
| 모험 | StageSelectScene | 스테이지 선택 → 전투 |
| 소환 | GachaScene | 캐릭터 소환 |
| 영웅 | HeroListScene | 영웅 목록 → 상세 |
| 가방 | InventoryScene | 아이템 관리 |
| 설정 | SettingsScene | 게임 설정 |

### 2.3 전투 흐름

```
StageSelectScene
  ↓ (파티 편성 → 전투 시작)
BattleScene
  ├→ 승리 → BattleResultScene → MainMenuScene
  └→ 패배 → BattleResultScene → StageSelectScene
```

## 3. 데이터 아키텍처

### 3.1 데이터 계층 구조

```
JSON 파일 (정적 게임 데이터)
     │
     ↓
data/index.js (접근 계층, 25+ 헬퍼 함수)
     │
     ├→ Systems (게임 로직에서 데이터 조회)
     ├→ Scenes (UI 렌더링용 데이터)
     └→ Services (CRUD 작업)
```

### 3.2 주요 데이터 스키마

#### characters.json

```javascript
{
  "characters": [
    {
      "id": "hero_001",
      "name": "아레스",
      "nameEn": "Ares",
      "rarity": 5,               // ★1~★5
      "class": "warrior",         // warrior|mage|healer|archer
      "mood": "fierce",           // 9종 중 1
      "cult": "olympus",          // 9종 중 1
      "stats": {                  // 기본 스탯 (레벨 1)
        "hp": 1200, "atk": 180, "def": 85, "spd": 90
      },
      "skills": [
        { "id": "basic", "name": "기본 공격", "multiplier": 1.0, "gaugeCost": 0, "target": "single" },
        { "id": "skill1", "name": "전쟁의 창", "multiplier": 2.8, "gaugeCost": 50, "target": "single" },
        { "id": "skill2", "name": "분노의 전장", "multiplier": 1.8, "gaugeCost": 80, "target": "all", "debuff": {...} }
      ],
      "description": "올림포스의 전쟁신",
      "design": {                 // 비주얼 디자인 정보
        "visualTheme": "...",
        "colorPalette": {...},
        "battleEffects": {...}
      }
    }
  ]
}
```

#### enemies.json

```javascript
{
  "enemies": [
    {
      "id": "goblin_warrior",
      "name": "고블린 전사",
      "mood": "brave",
      "type": "normal",           // normal|elite|boss|tower_boss
      "baseStats": { "hp": 200, "atk": 45, "def": 20, "spd": 35 },
      "growthStats": { "hp": 30, "atk": 5, "def": 3, "spd": 2 },
      "skills": [...],
      "expReward": 30,
      "goldReward": 50
    }
  ]
}
```

### 3.3 저장 데이터 구조

```javascript
// SaveManager가 관리하는 전체 세이브 데이터
{
  version: 1,
  player: { name, level, exp },
  resources: { gold, gems, summonTickets, skillBooks, characterShards },
  characters: [{
    instanceId: "uuid",
    characterId: "hero_001",
    level: 50,
    exp: 12000,
    stars: 3,
    skillLevels: [5, 3, 1],
    equipped: { weapon: "item_001", armor: null }
  }],
  inventory: [{ id: "item_001", quantity: 3, metadata: {} }],
  progress: {
    currentChapter: "chapter_3",
    clearedStages: { "stage_1_1": 3, "stage_1_2": 2 },
    towerFloor: 15,
    totalBattles: 342
  },
  gacha: { pityCounter: 45, totalPulls: 200 },
  quests: { daily: {}, dailyProgress: {}, lastReset: "2026-02-07T00:00:00Z" },
  settings: { bgmVolume: 0.8, sfxVolume: 1.0, autoSkip: false, battleSpeed: 2 },
  statistics: { totalGoldEarned: 500000, totalGemsSpent: 15000, charactersCollected: 35, highestDamage: 99999 },
  lastOnline: 1738886400000,
  createdAt: 1738800000000
}
```

## 4. 시스템 상세

### 4.1 전투 시스템 (BattleSystem.js)

**패턴**: Strategy + Observer + State Machine

```
BattleSystem
├── BattleUnit (전투 유닛 클래스)
│   ├── stats: {hp, maxHp, atk, def, spd}
│   ├── skillGauge: 0~100
│   ├── buffs/debuffs: []
│   └── isAlive: boolean
├── BattleEventEmitter (Observer)
│   ├── turn_start, turn_end
│   ├── action_executed
│   ├── unit_damaged, unit_healed
│   └── battle_won, battle_lost
├── Skill Strategies
│   ├── BasicAttackStrategy (×1.0, 게이지 +20)
│   ├── PowerStrikeStrategy (×2.5, 게이지 소비)
│   ├── HealStrategy (ATK×2 회복)
│   └── AoeAttackStrategy (×1.5 전체)
└── SynergyCalculator
    ├── 클래스 시너지 (동일 클래스 2~4명)
    ├── 분위기 시너지 (동일 분위기 2~3명)
    └── 교단 시너지 (동일 교단 2~4명)
```

**데미지 계산**:
```
1. baseDamage = ATK × skillMultiplier
2. defense = 1 - DEF / (DEF + 200)
3. moodMultiplier = 1.2 (유리) | 0.8 (불리) | 1.0 (중립)
4. critMultiplier = isCrit ? critDamage : 1.0
5. randomRange = 0.9 + Math.random() * 0.2
6. finalDamage = max(1, floor(baseDamage × defense × mood × crit × random))
```

### 4.2 저장 시스템 (SaveManager.js)

**패턴**: Singleton + Hybrid Storage

```
┌──────────────┐     ┌──────────────┐
│  게임 액션    │────→│ SaveManager  │
└──────────────┘     └──────┬───────┘
                            │
                    ┌───────┼───────┐
                    ↓               ↓
           ┌──────────────┐  ┌──────────────┐
           │ localStorage │  │  Supabase    │
           │ (즉시 동기)   │  │ (2초 디바운스)│
           └──────────────┘  └──────┬───────┘
                                    │
                             ┌──────┴───────┐
                             │ 온라인?       │
                             ├─Y→ 클라우드 저장│
                             └─N→ 오프라인 큐  │
                                  (재접속 시  │
                                   일괄 처리) │
                                  └──────────┘
```

**충돌 해결**: 타임스탬프 + 진행도 점수 기반

### 4.3 가챠 시스템 (GachaSystem.js)

```
소환 요청
  ↓
천장 카운터 확인 (90회 = SSR 확정, 180회 = 픽업 확정)
  ↓
확률 테이블: SSR 3% | SR 15% | R 82%
  ↓
등급 결정 → 해당 등급 캐릭터 풀에서 랜덤 선택
  ↓
결과 반환 + SaveManager 업데이트
  ↓
연출 (별 등급에 따른 이펙트)
```

### 4.4 에너지 시스템 (EnergySystem.js)

```
기본 에너지: 100 + (레벨 × 2)
회복: 5분마다 1 에너지
소비: 스테이지당 10~20 에너지
충전: 50젬으로 전체 회복
```

## 5. Supabase 데이터베이스 스키마

### 5.1 테이블 구조

```sql
-- 사용자 기본 (001)
users (id, email, nickname, created_at, last_login)

-- 게임 데이터 (001)
player_data (user_id, gold, gems, energy, player_level, exp, ...)
heroes (user_id, hero_id, level, exp, stars, skill_levels, equipment)
parties (user_id, slot_number, hero_ids, party_name, is_active)
stage_progress (user_id, stage_id, stars, clear_count)

-- 가챠 (002)
gacha_history (user_id, banner_id, pull_type, results, pity_count)
gacha_pity (user_id, banner_id, pity_count, guaranteed_5star)

-- 마이그레이션 (003)
gacha_data (user_id, pity_counter, total_pulls, banner_pulls)
quest_data (user_id, daily_quests, daily_progress, last_reset)
user_settings (user_id, bgm_volume, sfx_volume, auto_skip, battle_speed)
user_statistics (user_id, total_gold_earned, total_battles, ...)
migration_status (user_id, migration_completed, migration_version)
```

### 5.2 보안

- 모든 테이블에 RLS(Row Level Security) 적용
- `auth.uid() = user_id` 정책으로 자기 데이터만 접근 가능
- `updated_at` 자동 갱신 트리거

## 6. 인증 흐름

```
┌───────────┐
│ LoginScene│
└─────┬─────┘
      │
  ┌───┴───┐
  │       │
  ↓       ↓
게스트    정식 로그인
  │       │
  │       ├→ 이메일/비밀번호 → Supabase Auth
  │       └→ OAuth (Google/Apple)
  │                │
  │                ↓
  │         토큰 발급 + SaveManager.setUserId()
  │                │
  ↓                ↓
localStorage      클라우드 동기화
전용              (하이브리드 모드)
  │                │
  └──→ 나중에 convertGuestToUser()로 전환 가능
```

## 7. 이벤트 시스템 (EventBus)

글로벌 이벤트 버스로 씬 간, 시스템 간 통신:

| 이벤트 | 발행자 | 구독자 | 데이터 |
|--------|--------|--------|--------|
| `hero:levelup` | ProgressionSystem | HeroDetailScene | {heroId, newLevel} |
| `battle:start` | StageSelectScene | BattleScene | {stageId, party} |
| `battle:end` | BattleSystem | BattleResultScene | {result, rewards} |
| `energy:changed` | EnergySystem | TopBar, StageSelectScene | {current, max} |
| `resource:changed` | SaveManager | TopBar | {gold, gems} |
| `gacha:pull` | GachaScene | GachaService | {bannerId, count} |

## 8. UI 컴포넌트 계층

```
TopBar (자원 표시: 골드, 젬, 에너지)
├── 현재 씬 콘텐츠
│   ├── Panel (컨테이너)
│   │   ├── HeroCard (캐릭터 표시)
│   │   ├── Button (인터랙션)
│   │   ├── ProgressBar (진행도)
│   │   └── StarRating (등급)
│   ├── Modal (팝업)
│   │   └── 확인/취소 Button
│   └── Toast (알림)
└── BottomNav (5탭 네비게이션)
```

## 9. 빌드 파이프라인

```
소스코드 (src/)
     ↓
Vite 5 (개발: HMR, 빌드: esbuild)
     ↓
코드 스플리팅:
  ├── phaser.js (~1,479 KB → gzip 340 KB)
  ├── index.js (~439 KB → gzip 120 KB)
  └── data.js (~124 KB → gzip 44 KB)
     ↓
최적화:
  ├── console.log 제거 (esbuild pure)
  ├── Tree-shaking
  └── Minification
     ↓
dist/ (총 gzip ~504 KB)
```

## 10. 코드 품질

### 적용된 방어 조치

| 조치 | 범위 | 설명 |
|------|------|------|
| Error Boundary | 15개 전 씬 | create() try/catch + 안전한 씬 복귀 |
| Memory Leak 방지 | 15개 전 씬 | shutdown() 메서드로 타이머/트윈/리스너 정리 |
| Console.log 제거 | 프로덕션 빌드 | esbuild pure 옵션 |
| RLS | 전 테이블 | Row Level Security 정책 |
| 오프라인 대응 | SaveManager | 오프라인 큐 + 재접속 시 동기화 |

### 등급별 스탯 밸런스 기준

| 등급 | HP 범위 | ATK 범위 |
|------|---------|---------|
| ★1 | 250~400 | 45~75 |
| ★2 | 350~550 | 65~110 |
| ★3 | 600~850 | 85~145 |
| ★4 | 800~1,100 | 110~180 |
| ★5 | 950~1,400 | 140~220 |

1000라운드 시뮬레이션 검증 완료 (상세: `docs/testing/BALANCE_SIMULATION.md`)
