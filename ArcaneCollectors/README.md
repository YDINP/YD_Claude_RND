# ArcaneCollectors

[![CI](https://github.com/YDINP/ArcaneCollectors/actions/workflows/ci.yml/badge.svg)](https://github.com/YDINP/ArcaneCollectors/actions/workflows/ci.yml)
[![Deploy](https://github.com/YDINP/ArcaneCollectors/actions/workflows/deploy.yml/badge.svg)](https://github.com/YDINP/ArcaneCollectors/actions/workflows/deploy.yml)

서브컬처 스타일 방치형 수집 RPG 웹 게임

## 개요

ArcaneCollectors는 Phaser 3 기반의 모바일 최적화 웹 RPG 게임입니다.
9개 신화 교단에서 91명의 영웅을 수집하고, 분위기(Mood) 상성 시스템을 활용한 전략적 턴제 전투를 즐길 수 있습니다.

## 기술 스택

| 항목 | 기술 |
|------|------|
| 게임 엔진 | Phaser 3.80.1 |
| 번들러 | Vite 5 |
| 언어 | JavaScript (ES Modules) |
| 백엔드 | Supabase (PostgreSQL + Auth) |
| 코드 품질 | ESLint 9 + Prettier 3 |

## 빠른 시작

```bash
# 의존성 설치
npm install

# 개발 서버 (http://localhost:3002)
npm run dev

# 프로덕션 빌드
npm run build

# 린트 검사
npm run lint

# 단위 테스트 (Vitest)
npm run test

# E2E 테스트 (Playwright)
npm run test:e2e

# E2E 테스트 (브라우저 표시)
npm run test:e2e:headed
```

### 환경 변수 (선택)

Supabase 연동 시 `.env` 파일 생성:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

설정하지 않으면 오프라인 모드(localStorage 전용)로 동작합니다.

## 프로젝트 구조

```
src/
├── main.js                 # 진입점 (Phaser Game 초기화)
├── config/                 # 설정
│   ├── gameConfig.js       # Phaser 설정 (720×1280, 씬 목록)
│   ├── layoutConfig.js     # UI 레이아웃 상수
│   └── particleConfig.js   # 파티클 효과 설정
├── scenes/                 # 15개 게임 씬
│   ├── BootScene.js        # 초기화 + 세션 복원
│   ├── LoginScene.js       # 인증 (게스트/이메일)
│   ├── PreloadScene.js     # 에셋 프리로드
│   ├── MainMenuScene.js    # 메인 메뉴
│   ├── StageSelectScene.js # 스테이지 선택
│   ├── BattleScene.js      # 턴제 전투 (핵심)
│   ├── BattleResultScene.js# 전투 결과
│   ├── GachaScene.js       # 캐릭터 소환
│   ├── HeroListScene.js    # 영웅 목록
│   ├── HeroDetailScene.js  # 영웅 상세 (육성)
│   ├── PartyEditScene.js   # 파티 편성
│   ├── InventoryScene.js   # 인벤토리
│   ├── TowerScene.js       # 무한탑 모드
│   ├── QuestScene.js       # 일일 퀘스트
│   └── SettingsScene.js    # 설정
├── systems/                # 20개 게임 시스템
│   ├── BattleSystem.js     # 전투 로직 (데미지, 턴, AI)
│   ├── MoodSystem.js       # 분위기 9종 상성 계산
│   ├── SynergySystem.js    # 교단/분위기/클래스 시너지
│   ├── GachaSystem.js      # 소환 확률 + 천장
│   ├── EnergySystem.js     # 에너지 회복 관리
│   ├── SaveManager.js      # 하이브리드 저장 (Local+Cloud)
│   ├── PartyManager.js     # 파티 5슬롯 관리
│   ├── ProgressionSystem.js# 레벨업/경험치
│   ├── EquipmentSystem.js  # 장비 착용/강화
│   ├── EvolutionSystem.js  # 캐릭터 진화
│   ├── TowerSystem.js      # 타워 층수 관리
│   ├── QuestSystem.js      # 퀘스트 추적
│   ├── SweepSystem.js      # 소탕 시스템
│   ├── CouponSystem.js     # 쿠폰 코드
│   ├── EventBus.js         # 글로벌 이벤트
│   ├── SoundManager.js     # 오디오
│   ├── ParticleManager.js  # 파티클 이펙트
│   ├── HeroAssetLoader.js  # 에셋 로더
│   ├── DebugManager.js     # 디버그 콘솔
│   └── index.js            # barrel export
├── services/               # 8개 서비스 (Supabase 연동)
│   ├── AuthService.js      # 인증 (게스트 → 정식 전환)
│   ├── PlayerService.js    # 플레이어 데이터
│   ├── HeroService.js      # 캐릭터 CRUD
│   ├── GachaService.js     # 가챠 기록
│   ├── StageService.js     # 스테이지 진행도
│   ├── PartyService.js     # 파티 저장
│   ├── InventoryService.js # 인벤토리 관리
│   └── MigrationService.js # Local→Cloud 마이그레이션
├── components/             # 17개 UI 컴포넌트
│   ├── BottomNav.js        # 하단 네비게이션 (5탭)
│   ├── TopBar.js           # 상단 자원 표시
│   ├── Button.js           # 범용 버튼
│   ├── Modal.js            # 모달 다이얼로그
│   ├── Panel.js            # 패널 컨테이너
│   ├── HeroCard.js         # 영웅 카드
│   ├── EnergyBar.js        # 에너지 바
│   ├── ProgressBar.js      # 진행 바
│   ├── StarRating.js       # 별등급 표시
│   ├── StatBar.js          # 스탯 바
│   ├── Toast.js            # 토스트 알림
│   ├── LoadingSpinner.js   # 로딩 스피너
│   └── battle/             # 전투 전용 컴포넌트
│       ├── SkillCard.js    # 스킬 카드
│       ├── SynergyDisplay.js # 시너지 표시
│       └── TurnOrderBar.js # 턴 순서 바
├── data/                   # JSON 데이터 + 헬퍼
│   ├── index.js            # 데이터 접근 계층 (25+ 함수)
│   ├── characters.json     # 91명 캐릭터
│   ├── enemies.json        # 65종 적
│   ├── items.json          # 29종 아이템
│   ├── stages.json         # 5챕터 25스테이지
│   ├── synergies.json      # 시너지 데이터
│   └── banners.json        # 5개 가챠 배너
├── utils/                  # 유틸리티
│   ├── constants.js        # 게임 상수 (MOOD, CULT, 상성)
│   ├── helpers.js          # 범용 함수
│   ├── drawUtils.js        # Phaser 그리기 유틸
│   ├── textStyles.js       # 텍스트 스타일 프리셋
│   ├── animations.js       # 애니메이션 프리셋
│   └── TouchManager.js     # 터치 입력 관리
└── api/                    # 외부 API
    ├── supabaseClient.js   # Supabase 클라이언트 (오프라인 큐 포함)
    └── pexelsClient.js     # 이미지 API
```

## 핵심 시스템

### 분위기(Mood) 상성 시스템

9종 분위기의 가위바위보식 상성 관계:

| 분류 | 분위기 | 유리 상대 | 불리 상대 |
|------|--------|----------|----------|
| 공격형 | brave(열혈) | wild, cunning | fierce, devoted |
| 공격형 | fierce(격렬) | brave, noble | wild, calm |
| 공격형 | wild(광폭) | fierce, mystic | brave, stoic |
| 방어형 | calm(고요) | cunning, wild | brave, mystic |
| 방어형 | stoic(의연) | brave, wild | fierce, cunning |
| 방어형 | devoted(헌신) | fierce, cunning | noble, mystic |
| 전략형 | cunning(냉철) | stoic, noble | calm, devoted |
| 전략형 | noble(고결) | devoted, brave | wild, cunning |
| 전략형 | mystic(신비) | calm, stoic | brave, fierce |

유리 시 데미지 ×1.2, 불리 시 ×0.8

### 교단(Cult) 시스템

9개 신화 문화권 기반 교단:

| 교단 | 문화권 | 대표 분위기 | 보너스 |
|------|--------|-----------|--------|
| valhalla | 북유럽(전사) | brave | ×1.15 |
| takamagahara | 일본 | fierce | ×1.15 |
| olympus | 그리스(천상) | noble | ×1.15 |
| asgard | 북유럽(신) | stoic | ×1.15 |
| yomi | 일본(명계) | mystic | ×1.15 |
| tartarus | 그리스(지하) | wild | ×1.15 |
| avalon | 켈트 | calm | ×1.15 |
| helheim | 북유럽(명계) | devoted | ×1.15 |
| kunlun | 중국 | cunning | ×1.15 |

### 가챠 시스템

| 항목 | 값 |
|------|-----|
| SSR(★5) 기본 확률 | 3% |
| SR(★3~4) 확률 | 15% |
| R(★1~2) 확률 | 82% |
| SSR 천장 | 90연차 |
| 픽업 천장 | 180연차 |
| 단일 소환 비용 | 300 젬 |
| 10연 소환 비용 | 2,700 젬 |

### 전투 데미지 공식

```
데미지 = ATK × 스킬배율 × 분위기상성 × (1 - DEF/(DEF+200)) × 크리티컬 × 난수(0.9~1.1)
```

## 데이터 규모

| 항목 | 수량 |
|------|------|
| 캐릭터 | 91명 (★1=9, ★2=13, ★3=18, ★4=25, ★5=26) |
| 스킬 | 273개 (캐릭터당 3스킬) |
| 적 | 65종 (normal 30, elite 22, boss 8, tower_boss 5) |
| 장비 | 82종 |
| 아이템 | 29종 |
| 스테이지 | 25개 (5챕터) |
| 가챠 배너 | 5개 |
| 클래스 | 4종 (warrior 42, mage 25, healer 13, archer 11) |

## 저장 시스템

하이브리드 방식으로 오프라인/온라인 모두 지원:

```
사용자 액션 → localStorage (즉시) → Supabase (2초 디바운스)
                                        ↓
                              온라인: 클라우드 동기화
                              오프라인: 오프라인 큐 → 재접속 시 처리
```

## 빌드 최적화

| 청크 | gzip 크기 |
|------|----------|
| phaser (vendor) | ~340 KB |
| index (app) | ~120 KB |
| data (JSON) | ~44 KB |
| **합계** | **~504 KB** |

프로덕션 빌드 시 `console.log` 자동 제거 (esbuild pure).

## 개발 도구

### 디버그 모드

개발 서버에서 브라우저 콘솔 입력:
```javascript
debug.help()           // 전체 명령어 목록
debug.addGold(10000)   // 골드 추가
debug.addGems(1000)    // 젬 추가
debug.unlockAll()      // 전체 해금
debug.setLevel(id, 50) // 캐릭터 레벨 설정
debug.clearStage(id)   // 스테이지 클리어
debug.godMode()        // 무적 모드
```

### 테스트

#### 단위 테스트 (Vitest)

```bash
# 전체 테스트 실행
npm run test

# Watch 모드
npm run test:watch

# 커버리지
npm run test:coverage
```

#### E2E 테스트 (Playwright)

개발 서버 실행 후 E2E 테스트:

```bash
# 1. 개발 서버 시작 (별도 터미널)
npm run dev

# 2. E2E 테스트 실행 (headless)
npm run test:e2e

# 3. 브라우저를 보면서 테스트 (headed)
npm run test:e2e:headed
```

**테스트 시나리오** (총 34개 테스트):
- ✅ 로그인 플로우 (3개)
- ✅ 메인 메뉴 확인 (3개)
- ✅ 팝업 테스트 (21개) - 7개 팝업 × 3 단계
- ✅ 자동전투 관찰 (4개)
- ✅ 자동 로그인 (3개)

자세한 내용은 [`tests/e2e/README.md`](tests/e2e/README.md) 참조

## 문서

| 문서 | 위치 | 설명 |
|------|------|------|
| PRD (기획서) | `docs/prd/00_INDEX.md` | 15개 도메인별 분할 문서 |
| 태스크 추적 | `docs/TASK_TRACKER.md` | 팀별 작업 현황 |
| 진행 기록 | `docs/TASK_PROGRESS.md` | 브랜치별 개발 이력 |
| 밸런스 리포트 | `docs/testing/BALANCE_SIMULATION.md` | 1000라운드 시뮬레이션 결과 |
| DB 스키마 | `supabase/migrations/` | 3개 마이그레이션 SQL |

## 라이선스

MIT
