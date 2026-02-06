# 3. 기술 아키텍처
> 원본: PRD_Unified_v5.md §3

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
