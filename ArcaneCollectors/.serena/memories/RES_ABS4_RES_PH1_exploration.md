# RES-ABS-4 + RES-PH1 태스크 탐색 분석

## RES-ABS-4: 레이지 로딩 패턴 구현

### 현재 로딩 구조 (PreloadScene.js)
- **Phase 1**: 기본 UI 플레이스홀더 (별, 보석, 골드 캔버스)
- **Phase 2**: 캐릭터 플레이스홀더 (15종 레거시 + 91명 향상된)
- **Phase 3**: 전투 에셋 (적, 이펙트, 배경 캔버스)
- **Phase 4**: 가차 연출 에셋 (마법진 캔버스)
- **Phase 5**: 렌더러 에셋 (조건부 이미지 로드)
- **Phase 6**: 최종 검증

### 추상화 레이어 (Sprint 1)
- **CharacterRenderer.js**: 91명 히어로 에셋 로드/폴백
  - `useAssets` 플래그로 이미지/코드 전환
  - 텍스처 캐시: `_textureCache` Map
  - 폴백: HeroAssetLoader.getTextureKey() 플레이스홀더 사용
  
- **UIRenderer.js**: UI 컴포넌트 에셋 로드/폴백
  - `useAssets` 플래그로 제어
  - 버튼, 패널, 아이콘, 프레임 4가지 타입
  - 텍스처 캐시: `_textureCache` Map

- **HeroAssetLoader.js**: 히어로 플레이스홀더 생성
  - generatePlaceholders(scene, characters) → 91명 캔버스 생성
  - 교단/분위기/등급별 차별화
  - 레이지 로딩 준비됨

### 레이지 로딩 기회점
1. **Scene 진입 시**: CharacterRenderer, UIRenderer의 preloadAssets() 호출
   - 현재: 조건부 (useAssets 플래그)
   - 개선: Scene별 필요한 에셋만 동적 로드
   
2. **데이터 기반 로드**: 캐릭터/장비 필터링 후 필요한 것만 로드
   - 파티 편성 화면 → 파티 4명의 에셋만
   - 스테이지 선택 → 스테이지 적들의 에셋만
   
3. **메모리 해제**: Phaser scene shutdown 시 텍스처 제거
   - scene.textures.remove(key)
   - 캐시 초기화: clearCache()

### 제약 조건
- 코드 기반 폴백 존재 → 에셋 미존재 시 자동 렌더링
- PreloadScene 이후 Scene들도 동적 로드 필요
- 메모리 누적 방지: 텍스처 제거 + 캐시 정리

---

## RES-PH1: UI 아이콘 에셋 교체 (21개)

### 현재 아이콘 구현 상태

#### 재화 (3개) - GachaScene, MainMenuScene, TopBar
1. **보석 (💎)**: 
   - TopBar.js: createResourceIcon() 코드 렌더링 (다이아몬드 모양)
   - GachaScene.js: 텍스트 '💎' 하드코딩 (3군데)
   - UIRenderer.js: renderIcon(type:'currency', key:'gem')

2. **골드 (💰)**:
   - TopBar.js: createResourceIcon() 코드 렌더링 (원형 코인)
   - GachaScene.js: 텍스트 '💰' 사용 없음 (골드는 텍스트만)
   - QuestScene, BattleResultScene: `💰` 하드코딩

3. **소환권 (🎫)**:
   - GachaScene.js: 텍스트 '🎫' 하드코딩

#### 스탯 (4개) - 캐릭터 카드, 전투
1. **HP (❤)**: drawUtils.drawHPBar() 사용
2. **ATK (⚔)**: drawUtils에 정의 없음, 하드코딩 '⚔'
3. **DEF (🛡)**: drawUtils에 정의 없음, 하드코딩 '🛡'
4. **SPD (➶)**: drawUtils에 정의 없음, 하드코딩 '➶'

#### 버튼 (9개) - 각 Scene
1. **뒤로 가기 (←)**: 텍스트 '← 뒤로'
2. **확인 (확인)**: 텍스트 '확인'
3. **탭 (⭐, ⚔️)**: GachaScene 탭 (영웅/장비)
4. **장비 슬롯**: GachaScene 장비 소환 결과 (⚔️, 🛡️, 💍, 🔮)
5. **메뉴 버튼**: BottomNav 메뉴
6. **기타**: 모달, 설정 버튼들

#### 탭 (5개) - BottomNav (home, adventure, inventory, gacha, more)
- 현재: 텍스트 레이블만 (아이콘 없음)

### 아이콘 사용 현황
- **UIRenderer.js**: renderIcon() 메서드
  - MOOD_SYMBOLS, CULT_SYMBOLS, CLASS_SYMBOLS, CURRENCY_SYMBOLS, STAT_SYMBOLS 정의
  - _codeIcon()에서 심볼 매핑
  
- **drawUtils.js**: drawMoodIcon() 유일 구현
  - 원형 배경 + 컬러

- **Scene별 하드코딩**:
  - GachaScene: '💎', '⭐', '🎫', '⚔️'
  - MainMenuScene: '💰', '⭐'
  - BattleResultScene: '⭐'
  - QuestScene: '💰', '💎'
  - 기타: 다수 이모지 사용

### 에셋 디렉토리 구조 (준비됨)
```
public/assets/ui/icons/
├── currency/     (3개)
├── stats/        (4개)
├── moods/        (9개)
├── cults/        (9개)
├── classes/      (4개)
├── tabs/         (5개)
```

### 구현 전략
1. **UIRenderer.renderIcon()** 활용
   - type: 'currency', 'stat', 'tab'
   - key: 'gold', 'gem', 'ticket' / 'hp', 'atk', 'def', 'spd' / 'home', 'adventure', ...
   
2. **Scene별 교체**
   - 하드코딩된 이모지 → uiRenderer.renderIcon() 호출로 변경
   - 기존 TopBar 코드 렌더링 → 유지 (또는 renderIcon로 통일)
   
3. **레이지 로딩**
   - UIRenderer.preloadAssets()에서 필요한 아이콘만 로드
   - 폴백: 코드 렌더링 유지 (CURRENCY_SYMBOLS, STAT_SYMBOLS 사용)
