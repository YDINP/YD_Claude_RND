# ArcaneCollectors v4 - Git Worktree 병렬 개발 가이드

## 1. 개요

### 1.1 목적
- 5명의 Worker가 독립적으로 병렬 작업 가능
- 파일 충돌 최소화
- 빠른 통합 및 테스트

### 1.2 v2 → v4 마이그레이션 요약

| 항목 | v2.0 (현재) | v4.0 (목표) |
|------|------------|-------------|
| 파티 인원 | 5인 | **4인** |
| 특성 시스템 | 속성 (Fire/Water/Wind/Light/Dark) | **분위기 (brave/fierce/wild/calm/stoic/devoted/cunning/noble/mystic - 9종)** |
| 저장소 | LocalStorage | **Supabase** |
| 해상도 | 480x854 | **720x1280** |
| 스테이지 | 1챕터 10스테이지 | **5챕터 25스테이지** |
| 에너지 | 없음 | **신규 추가** |
| 소탕 | 없음 | **신규 추가** |

### 1.2 브랜치 구조
```
main (안정)
├── arcane/w1-backend    ← W1: 백엔드/Supabase
├── arcane/w2-data       ← W2: 게임 데이터 개편
├── arcane/w3-ui         ← W3: UI/화면 개편
├── arcane/w4-system     ← W4: 게임 시스템
├── arcane/w5-config     ← W5: 설정/문서
├── arcane/integration   ← 통합 테스트
└── arcane/experiment    ← 실험용
```

### 1.3 Worktree 폴더 구조
```
D:\park\
├── YD_Claude_RND/           (main - 원본)
├── YD_Claude_RND-w1/        (arcane/w1-backend)
├── YD_Claude_RND-w2/        (arcane/w2-data)
├── YD_Claude_RND-w3/        (arcane/w3-ui)
├── YD_Claude_RND-w4/        (arcane/w4-system)
├── YD_Claude_RND-w5/        (arcane/w5-config)
├── YD_Claude_RND-integration/
└── YD_Claude_RND-experiment/
```

---

## 2. Worker별 담당 영역

### W1: 백엔드/Supabase
| 항목 | 내용 |
|------|------|
| 브랜치 | `arcane/w1-backend` |
| 폴더 | `D:\park\YD_Claude_RND-w1` |
| 파일 소유권 | `supabase/**`, `src/api/**`, `src/services/*Service.js`, `.env.local` |
| 태스크 | Task 1.1~1.4 (Phase 1) |

### W2: 게임 데이터
| 항목 | 내용 |
|------|------|
| 브랜치 | `arcane/w2-data` |
| 폴더 | `D:\park\YD_Claude_RND-w2` |
| 파일 소유권 | `src/data/**` |
| 태스크 | Task 2.1~2.5 (Phase 2) |

### W3: UI/화면
| 항목 | 내용 |
|------|------|
| 브랜치 | `arcane/w3-ui` |
| 폴더 | `D:\park\YD_Claude_RND-w3` |
| 파일 소유권 | `src/scenes/**`, `src/components/**` |
| 태스크 | Task 3.1~3.7 (Phase 3) |

### W4: 게임 시스템
| 항목 | 내용 |
|------|------|
| 브랜치 | `arcane/w4-system` |
| 폴더 | `D:\park\YD_Claude_RND-w4` |
| 파일 소유권 | `src/systems/**` |
| 태스크 | Task 4.1~4.6 (Phase 4) |

### W5: 설정/문서
| 항목 | 내용 |
|------|------|
| 브랜치 | `arcane/w5-config` |
| 폴더 | `D:\park\YD_Claude_RND-w5` |
| 파일 소유권 | `src/config/**`, `src/utils/**`, `docs/**` |
| 태스크 | Task 5.1~5.3 (Phase 5) |

---

## 3. 의존성 및 통합 순서

```
                    ┌──────────────┐
                    │   W5 설정    │ (독립)
                    └──────────────┘

┌──────────────┐    ┌──────────────┐
│ W1 백엔드   │───→│  W4 시스템   │
└──────────────┘    └──────────────┘
        │                  ↑
        ↓                  │
┌──────────────┐    ┌──────────────┐
│  W2 데이터   │───→│   W3 UI     │
└──────────────┘    └──────────────┘
```

### 통합 순서
1. **Phase 1**: W1 완료 → W2, W4가 API 사용 가능
2. **Phase 2**: W2 완료 → W3, W4가 데이터 사용 가능
3. **Phase 3**: W5는 독립적으로 병렬 진행
4. **Phase 4**: W3, W4 완료 후 UI-시스템 통합
5. **Phase 5**: 전체 통합 테스트

---

## 4. 핵심 변경사항 요약 (v4)

### 4.1 파티 시스템
- **5인 → 4인** 변경
- 파티 슬롯 5개 저장 가능

### 4.2 분위기(Mood) 시스템
| 분위기 | 이름 | 색상 | 특징 |
|------|------|------|------|
| brave | 열혈 | #E74C3C | 공격력 특화 |
| fierce | 격렬 | #FF5722 | 폭발적 데미지 |
| wild | 광폭 | #27AE60 | 속도/연속 공격 |
| calm | 고요 | #3498DB | 방어/회복 특화 |
| stoic | 의연 | #607D8B | 지속력/내구 |
| devoted | 헌신 | #E91E63 | 지원/버프 |
| cunning | 냉철 | #9B59B6 | 크리티컬 특화 |
| noble | 고결 | #FFD700 | 균형잡힌 능력치 |
| mystic | 신비 | #F39C12 | 특수 효과 특화 |

### 4.3 해상도
- 기존: 480x854
- 변경: **720x1280** (HD: 1080x1920)

### 4.4 신규 시스템
- 에너지 시스템 (최대 100 + 레벨×2)
- 소탕 시스템 (별 3개 클리어 시)
- Supabase 백엔드

---

## 5. 커밋 컨벤션

```
[Worker][Phase.Task] 설명

예시:
[W1][1.1] Supabase 프로젝트 초기 설정
[W2][2.3] 시너지 데이터 개편 완료
[W3][3.2] 하단 메뉴 탭 구현
```

---

## 6. 병합 전략

### 6.1 Worker → Integration
```bash
# integration 브랜치로 이동
git checkout arcane/integration

# Worker 브랜치 병합 (rebase 권장)
git merge --no-ff arcane/w1-backend -m "[Merge] W1 백엔드 통합"
```

### 6.2 충돌 시 우선순위
1. **W1 (백엔드)** - API 인터페이스 우선
2. **W2 (데이터)** - 데이터 스키마 우선
3. **W4 (시스템)** - 로직 우선
4. **W3 (UI)** - UI 우선
5. **W5 (설정)** - 공유 설정은 협의

---

## 7. 프로젝트 구조 (PRD v2.0 기준)

```
ArcaneCollectors/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js
│   ├── config/
│   │   └── gameConfig.js           # W5 담당
│   ├── scenes/                     # W3 담당
│   │   ├── BootScene.js
│   │   ├── PreloadScene.js
│   │   ├── MainMenuScene.js        # 개편
│   │   ├── GachaScene.js
│   │   ├── HeroListScene.js
│   │   ├── HeroDetailScene.js
│   │   ├── StageSelectScene.js     # 개편
│   │   ├── BattleScene.js          # 개편
│   │   ├── PartyEditScene.js       # 신규
│   │   └── BattleResultScene.js    # 신규
│   ├── components/                 # W3 담당
│   │   ├── Button.js
│   │   ├── Panel.js
│   │   ├── TopBar.js
│   │   ├── BottomNav.js            # 개편
│   │   └── ...
│   ├── systems/                    # W4 담당
│   │   ├── SaveManager.js          # W1 연동
│   │   ├── GachaSystem.js
│   │   ├── BattleSystem.js         # 개편
│   │   ├── SynergySystem.js        # 개편
│   │   ├── EnergySystem.js         # 신규
│   │   ├── SweepSystem.js          # 신규
│   │   ├── PartyManager.js         # 신규
│   │   └── MoodSystem.js           # 신규 (분위기 시스템)
│   ├── data/                       # W2 담당
│   │   ├── characters.json         # 개편 (mood 필드 포함)
│   │   ├── synergies.json          # 개편
│   │   ├── stages.json             # 확장
│   │   ├── equipment.json          # 확장
│   │   └── items.json              # 확장
│   ├── api/                        # W1 담당 (신규)
│   │   └── supabaseClient.js
│   ├── services/                   # W1 담당 (신규)
│   │   ├── AuthService.js
│   │   ├── PlayerService.js
│   │   ├── HeroService.js
│   │   └── ...
│   └── utils/                      # W5 담당
│       ├── constants.js            # 개편
│       └── helpers.js
├── supabase/                       # W1 담당 (신규)
│   └── migrations/
└── docs/
```

---

## 8. 씬 플로우 (PRD v2.0 기준)

```
[시작] → BootScene → PreloadScene → MainMenuScene
                                         ↓
         ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
         ↓           ↓           ↓
    GachaScene  HeroListScene  StageSelectScene
         ↓           ↓           ↓
         ↓      HeroDetailScene  PartyEditScene (신규)
         ↓           ↓           ↓
         ↓           ↓        BattleScene
         ↓           ↓           ↓
         →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
                                    ↓
                            BattleResultScene (신규)
```

---

## 9. 기술 스택

| 분류 | 기술 | 버전 |
|------|------|------|
| 엔진 | Phaser 3 | 3.60+ |
| 빌드 | Vite | 최신 |
| 언어 | JavaScript ES6+ | - |
| 백엔드 | Supabase | 최신 (v4 신규) |
| 해상도 | 720x1280 (v4) | 480x854 (v2) |

---

## 10. 기존 시스템 참조 (PRD v2.0)

### 10.1 속성 시스템 (v4에서 폐지됨)
```
     Fire
    ↗    ↘
Wind  ←  Water

Light ↔ Dark (상호 유리)
```
- 유리: 130%, 불리: 70%
- **v4에서 분위기(Mood) 시스템으로 대체됨**
- 분위기는 9종으로 구성되며 9×9 상성 매트릭스 사용

### 10.2 가챠 확률 (유지)
| 등급 | 확률 |
|------|------|
| SSR | 1.5% (v4: 3%) |
| SR | 8.5% (v4: 15%) |
| R | 30% (v4: 82%) |
| N | 60% |

### 10.3 데미지 공식 (기본)
```
데미지 = ATK × 스킬배율 × (1 - DEF/1000) × 분위기배율
```
- v4에서 속성배율 삭제, **분위기배율** 추가

---

## 11. 참조 문서

| 문서 | 경로 | 내용 |
|------|------|------|
| PRD v2 | `docs/PRD_ArcaneCollectors_v2.md` | 기존 시스템 참조 |
| PRD v4 | `docs/PRD_ArcaneCollectors_v4.md` | v4 전체 기획 |
| TASKS v4 | `docs/TASKS_ArcaneCollectors_v4.md` | Worker별 태스크 |
| GDD | `docs/GameDesignDocument_ArcaneCollectors.md` | 게임 기획서 |
| Backend PRD | `docs/PRD_ArcaneCollectors_Backend.md` | 백엔드 상세 |
