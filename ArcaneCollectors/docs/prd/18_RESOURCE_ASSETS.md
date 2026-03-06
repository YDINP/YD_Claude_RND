# 18. 리소스·에셋 교체 계획 PRD

## 문서 정보
- **버전**: 1.0
- **작성일**: 2026-02-07
- **프로젝트**: ArcaneCollectors
- **관련 문서**: `14_CHARACTER_DESIGN.md`, `17_UI_UX_ENHANCEMENT.md`

---

## 1. 현재 에셋 상태

### 1.1 기술적 현황
- **에셋 폴더**: `public/assets/` — 완전히 비어있음
- **렌더링 방식**: Phaser Graphics API 100% (코드 기반)
  - `this.add.graphics()`
  - `graphics.fillStyle()`, `graphics.fillRect()`, `graphics.fillCircle()`
  - `graphics.lineStyle()`, `graphics.strokeRoundedRect()`

### 1.2 현재 비주얼 구성
| 요소 | 현재 구현 | 한계점 |
|------|-----------|--------|
| **캐릭터** | 원(circle) + 이니셜 텍스트 | 캐릭터 개성 표현 불가, 시각적 매력 부족 |
| **배경** | 단색 또는 그라데이션 | 몰입감 부족, 세계관 표현 미흡 |
| **UI 요소** | `drawRoundedRect` + 텍스트 | 일관성 부족, 고급스러움 결여 |
| **아이콘** | 텍스트 이모지 (⚔️, 🛡️, 🔮) | 해상도 의존적, 스타일 통제 불가 |
| **이펙트** | Phaser Particles (기본 도형) | 표현력 제한, 스킬 개성 부족 |
| **사운드** | 없음 | 피드백 부족, 몰입감 저하 |

### 1.3 현재 번들 사이즈
- **dist/index.html**: ~5KB
- **dist/assets/*.js**: ~503KB (gzip)
- **public/assets/**: 0KB
- **총합**: ~508KB (매우 가벼움, 에셋 추가 시 증가 예상)

---

## 2. 에셋 교체 전략

### 2.1 단계적 교체 방침
```
Phase 1: 핵심 UI 아이콘 (버튼, 재화, 스탯)
Phase 2: 캐릭터 썸네일 (80x80px, 단순 일러스트)
Phase 3: 배경 이미지 (씬별)
Phase 4: 캐릭터 카드 일러스트 (200x280px, 고품질)
Phase 5: 전투 스프라이트 및 이펙트
Phase 6: 사운드 (BGM, SFX)
```

**이유**:
- 점진적 파일 사이즈 증가 관리
- 각 Phase별 독립적 검증 가능
- 코드 렌더링과 에셋 렌더링 혼용 허용 (호환성 유지)

### 2.2 추상화 레이어 전략
모든 비주얼 렌더링을 추상화하여 코드/이미지 전환이 자유롭도록 설계.

**예시: CharacterRenderer.js**
```javascript
// src/renderers/CharacterRenderer.js
export class CharacterRenderer {
  constructor(scene) {
    this.scene = scene;
    this.useAssets = false; // 전환 플래그
  }

  renderHeroCard(x, y, hero) {
    if (this.useAssets && this.scene.textures.exists(`hero_card_${hero.id}`)) {
      // 에셋 기반 렌더링
      return this.scene.add.image(x, y, `hero_card_${hero.id}`);
    } else {
      // 코드 기반 렌더링 (기존 방식)
      return this.renderHeroCardCode(x, y, hero);
    }
  }

  renderHeroCardCode(x, y, hero) {
    const container = this.scene.add.container(x, y);

    // 배경
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x2c3e50);
    bg.fillRoundedRect(-50, -70, 100, 140, 8);
    container.add(bg);

    // 초상화 (원)
    const portrait = this.scene.add.graphics();
    portrait.fillStyle(this.getColorByRarity(hero.rarity));
    portrait.fillCircle(0, -20, 30);
    container.add(portrait);

    // 이니셜
    const initial = this.scene.add.text(0, -20, hero.name[0], {
      fontSize: '24px',
      color: '#fff'
    }).setOrigin(0.5);
    container.add(initial);

    // 이름
    const name = this.scene.add.text(0, 30, hero.name, {
      fontSize: '14px',
      color: '#fff'
    }).setOrigin(0.5);
    container.add(name);

    return container;
  }
}
```

**장점**:
- 에셋 준비 전에도 개발 진행 가능
- 에셋 추가 시 플래그만 전환하면 됨
- A/B 테스트 용이 (성능, 용량 비교)

---

## 3. 에셋 카테고리별 상세 계획

### 3.1 캐릭터 에셋

#### 3.1.1 필요 에셋 목록
| 용도 | 크기 | 개수 | 포맷 | 우선순위 |
|------|------|------|------|----------|
| **썸네일** | 80x80px | 91장 | PNG/WebP | Phase 2 |
| **카드 일러스트** | 200x280px | 91장 | PNG/WebP | Phase 4 |
| **전투 스프라이트** | 120x120px | 91장 | PNG/WebP | Phase 5 |
| **초상화** | 64x64px | 91장 | PNG/WebP | Phase 3 |

**총 용량 추정**:
- 썸네일: 91장 × 5KB = ~455KB
- 카드: 91장 × 30KB = ~2.7MB
- 전투: 91장 × 10KB = ~910KB
- 초상화: 91장 × 3KB = ~273KB
- **합계**: ~4.3MB (WebP 압축 시 ~2.5MB)

#### 3.1.2 스타일 가이드 (14_CHARACTER_DESIGN.md 기반)

**교단별 테마**:
| 교단 | 비주얼 테마 | 색상 톤 | 의상 스타일 |
|------|-------------|----------|-------------|
| **olympus** | 그리스 신화, 대리석, 월계관 | 흰색, 금색 | 토가, 갑옷 |
| **takamagahara** | 일본 신화, 사쿠라, 신사 | 붉은색, 검은색 | 기모노, 갑주 |
| **yomi** | 일본 명계, 어둠, 망자 | 회색, 보라 | 어둠의 로브 |
| **asgard** | 북유럽 신화, 번개, 룬 | 파란색, 은색 | 바이킹 갑옷 |
| **valhalla** | 전사의 전당, 황금, 전투 | 금색, 붉은색 | 중무장 갑옷 |
| **tartarus** | 그리스 지하세계, 용암, 쇠사슬 | 검은색, 빨강 | 파괴된 갑옷 |
| **avalon** | 켈트 신화, 자연, 마법 | 녹색, 금색 | 드루이드 로브 |
| **helheim** | 북유럽 명계, 얼음, 죽음 | 회색, 파랑 | 얼어붙은 갑옷 |
| **kunlun** | 중국 신화, 산, 용 | 붉은색, 금색 | 한푸, 도포 |

**클래스별 실루엣**:
| 클래스 | 실루엣 특징 | 무기 | 포즈 |
|--------|-------------|------|------|
| **warrior** | 넓은 어깨, 중무장 | 검, 도끼, 창 | 정면, 당당 |
| **mage** | 날씬, 로브, 모자 | 지팡이, 마법서 | 측면, 마법 시전 |
| **healer** | 부드러운 곡선, 성직자 의상 | 지팡이, 십자가 | 정면, 기도 |
| **archer** | 경장갑, 민첩함 | 활, 석궁 | 측면, 조준 |

**등급별 카드 프레임**:
| 등급 | 프레임 색상 | 장식 | 효과 |
|------|-------------|------|------|
| **★1** | 은회색 (#808080) | 단순 테두리 | 없음 |
| **★2** | 밝은 은색 (#c0c0c0) | 작은 별 장식 | 미세한 빛 |
| **★3** | 파란색 (#4169e1) | 보석 장식 | 파란 빛 |
| **★4** | 보라색 (#9370db) | 화려한 문양 | 보라 입자 |
| **★5** | 금색 (#ffd700) | 극도로 화려 | 금빛 후광 |

#### 3.1.3 에셋 소싱 방안

**방안 A: AI 생성 (권장)**
- **도구**: Stable Diffusion, DALL-E 3, Midjourney
- **장점**: 빠른 생성, 저비용, 스타일 일관성 유지 가능
- **단점**: 저작권 불확실성, 프롬프트 엔지니어링 필요
- **프로세스**:
  1. 교단/클래스/등급별 베이스 프롬프트 작성
  2. 91명 캐릭터 일괄 생성
  3. Upscale 및 후처리 (Photoshop, GIMP)
  4. WebP 변환 및 최적화

**예시 프롬프트 (olympus, warrior, ★5)**:
```
A majestic Greek warrior from Olympus, white marble armor with gold trim,
laurel crown, holding a glowing sword, heroic pose, detailed face,
fantasy art style, high quality, portrait, white and gold color scheme
```

**방안 B: 무료 에셋 팩**
- **출처**: itch.io, OpenGameArt.org, Kenney.nl
- **장점**: 즉시 사용 가능, 라이선스 명확
- **단점**: 스타일 불일치, 91명 모두 찾기 어려움
- **추천**: UI 아이콘, 이펙트 등 보조 에셋용

**방안 C: 커미션 (예산 충분 시)**
- **비용**: 캐릭터당 $50~$200 (스타일 의존)
- **총 예산**: 91명 × $100 = $9,100
- **장점**: 완전한 저작권, 최고 품질, 일관성 보장
- **단점**: 고비용, 긴 제작 기간 (3~6개월)

**최종 권장**: 방안 A (AI 생성) + 방안 B (UI 아이콘)

#### 3.1.4 에셋 파일 구조
```
public/assets/characters/
├── thumbnails/          # 80x80px (HeroListScene)
│   ├── char_001.webp
│   ├── char_002.webp
│   └── ... (91개)
├── cards/               # 200x280px (HeroDetailScene)
│   ├── char_001.webp
│   ├── char_002.webp
│   └── ... (91개)
├── battle/              # 120x120px (BattleScene)
│   ├── char_001.webp
│   ├── char_002.webp
│   └── ... (91개)
└── portraits/           # 64x64px (PartyEditScene, TopBar)
    ├── char_001.webp
    ├── char_002.webp
    └── ... (91개)
```

**명명 규칙**:
- 파일명: `char_{ID}.webp` (ID는 characters.json의 id 필드와 일치)
- 예: `thor` → `char_thor.webp`

### 3.2 배경 에셋

#### 3.2.1 씬별 배경 목록
| 씬 | 배경 설명 | 크기 | 개수 | 우선순위 |
|-----|----------|------|------|----------|
| **MainMenuScene** | 게임 로고 + 판타지 세계 전경 | 720x1280 | 1장 | Phase 3 |
| **HeroListScene** | 영웅의 전당 내부 | 720x1280 | 1장 | Phase 3 |
| **HeroDetailScene** | 캐릭터 쇼케이스 (어두운 배경) | 720x1280 | 1장 | Phase 3 |
| **GachaScene** | 소환 제단, 신비로운 분위기 | 720x1280 | 1장 | Phase 3 |
| **StageSelectScene** | 월드맵 (5개 챕터) | 720x1280 | 5장 | Phase 3 |
| **BattleScene** | 전투 필드 (챕터별) | 720x1280 | 5장 | Phase 5 |
| **PartyEditScene** | 전술 테이블 | 720x1280 | 1장 | Phase 4 |
| **InventoryScene** | 창고 내부 | 720x1280 | 1장 | Phase 4 |

**총 개수**: 16장
**용량 추정**: 16장 × 150KB (WebP) = ~2.4MB

#### 3.2.2 Parallax 레이어 (선택사항)
복잡한 씬(MainMenu, StageSelect)에 깊이감 추가.

**구조**:
```
배경: 먼 산, 하늘 (스크롤 속도 0.2x)
중간: 건물, 나무 (스크롤 속도 0.5x)
전경: 풀, 바위 (스크롤 속도 1.0x)
```

**용량 추정**: 레이어당 +100KB, 3개 씬 × 3레이어 = +900KB

#### 3.2.3 배경 소싱
- AI 생성 (Stable Diffusion, Midjourney)
- 무료 에셋 (OpenGameArt, itch.io)
- 직접 제작 (Photoshop, Aseprite)

**예시 프롬프트 (MainMenu)**:
```
Fantasy world panorama, floating islands, ancient temples,
epic sky with magical auroras, cinematic lighting,
high quality background, 720x1280 portrait orientation
```

### 3.3 UI 에셋

#### 3.3.1 버튼 스프라이트
| 버튼 타입 | 상태 | 크기 | 개수 | 포맷 |
|----------|------|------|------|------|
| **기본 버튼** | normal, pressed, disabled | 150x50 | 3장 | PNG |
| **큰 버튼** | normal, pressed, disabled | 200x60 | 3장 | PNG |
| **아이콘 버튼** | normal, pressed, disabled | 60x60 | 3장 | PNG |
| **탭 버튼** | inactive, active | 100x40 | 2장 | PNG |

**나인패치(9-slice) 활용**:
- Phaser의 `setSlice()` 메서드로 버튼 크기 자동 조정
- 코너/엣지/센터 영역 정의

**예시 코드**:
```javascript
// PreloadScene.js
this.load.image('button_normal', 'assets/ui/buttons/button_normal.png');

// ButtonComponent.js
const button = this.scene.add.nineslice(
  x, y, 'button_normal',
  { left: 10, right: 10, top: 10, bottom: 10 },
  width, height
);
```

#### 3.3.2 패널/프레임
| 타입 | 크기 | 개수 | 용도 |
|------|------|------|------|
| **기본 패널** | 300x400 | 1장 | Modal, Info Panel |
| **카드 프레임** | 110x150 | 5장 | 등급별 (★1~★5) |
| **장비 슬롯** | 80x80 | 1장 | 빈 장비 슬롯 표시 |
| **스킬 슬롯** | 60x60 | 1장 | 스킬 카드 배경 |

#### 3.3.3 아이콘 세트
| 카테고리 | 아이콘 목록 | 크기 | 개수 | 포맷 |
|----------|-------------|------|------|------|
| **재화** | 골드, 젬, 에너지 | 32x32 | 3개 | PNG |
| **스탯** | HP, ATK, DEF, SPD | 24x24 | 4개 | PNG |
| **분위기** | brave, fierce, wild, calm, stoic, devoted, cunning, noble, mystic | 32x32 | 9개 | PNG |
| **교단** | olympus, takamagahara, yomi, asgard, valhalla, tartarus, avalon, helheim, kunlun | 32x32 | 9개 | PNG |
| **클래스** | warrior, mage, healer, archer | 32x32 | 4개 | PNG |
| **등급** | ★1, ★2, ★3, ★4, ★5 | 24x24 | 5개 | PNG |
| **탭** | 영웅, 인벤토리, 가챠, 퀘스트, 설정 | 40x40 | 5개 | PNG |
| **액션** | 닫기, 뒤로, 정보, 설정, 정렬, 필터 | 32x32 | 6개 | PNG |

**총 개수**: 49개
**용량 추정**: 49개 × 2KB = ~98KB

**소싱**:
- 무료 아이콘 팩 (game-icons.net, flaticon.com)
- AI 생성 (DALL-E icon mode)
- 직접 제작 (Figma, Illustrator)

#### 3.3.4 UI 에셋 파일 구조
```
public/assets/ui/
├── buttons/
│   ├── button_normal.png
│   ├── button_pressed.png
│   ├── button_disabled.png
│   ├── button_large_normal.png
│   └── ...
├── panels/
│   ├── panel_basic.png
│   ├── card_frame_1star.png
│   ├── card_frame_2star.png
│   ├── card_frame_3star.png
│   ├── card_frame_4star.png
│   └── card_frame_5star.png
├── icons/
│   ├── currency/
│   │   ├── gold.png
│   │   ├── gem.png
│   │   └── energy.png
│   ├── stats/
│   │   ├── hp.png
│   │   ├── atk.png
│   │   ├── def.png
│   │   └── spd.png
│   ├── moods/
│   │   ├── brave.png
│   │   └── ... (9개)
│   ├── cults/
│   │   ├── olympus.png
│   │   └── ... (9개)
│   ├── classes/
│   │   ├── warrior.png
│   │   └── ... (4개)
│   └── tabs/
│       ├── heroes.png
│       └── ... (5개)
└── frames/
    └── equipment_slot.png
```

### 3.4 이펙트 에셋

#### 3.4.1 파티클 스프라이트시트
| 타입 | 설명 | 크기 | 프레임 수 | 포맷 |
|------|------|------|-----------|------|
| **불** | 불꽃, 화염 | 64x64 | 8 | PNG (Atlas) |
| **물** | 물방울, 파도 | 64x64 | 8 | PNG (Atlas) |
| **번개** | 전기, 번개 | 64x64 | 6 | PNG (Atlas) |
| **빛** | 빛나는 입자 | 32x32 | 4 | PNG (Atlas) |
| **어둠** | 검은 연기 | 64x64 | 8 | PNG (Atlas) |
| **치유** | 초록 십자가 | 32x32 | 6 | PNG (Atlas) |
| **강화** | 파란 오라 | 64x64 | 8 | PNG (Atlas) |

**텍스처 아틀라스 사용**:
- TexturePacker로 스프라이트시트 생성
- Phaser의 `this.load.atlas()` 로 로드

**예시**:
```javascript
// PreloadScene.js
this.load.atlas('fx_fire', 'assets/effects/particles/fire.png', 'assets/effects/particles/fire.json');

// BattleScene.js
const particles = this.add.particles(x, y, 'fx_fire', {
  frame: ['fire_1', 'fire_2', 'fire_3'],
  lifespan: 1000,
  speed: { min: 50, max: 100 },
  scale: { start: 1, end: 0 },
  blendMode: 'ADD'
});
```

#### 3.4.2 스킬 이펙트 (애니메이션)
| 스킬 타입 | 이펙트 설명 | 크기 | 프레임 수 | 용량 |
|----------|-------------|------|-----------|------|
| **물리 공격** | 검기, 충격파 | 128x128 | 10 | 50KB |
| **마법 공격** | 마법진, 폭발 | 128x128 | 12 | 60KB |
| **힐** | 빛 기둥, 십자가 | 128x128 | 8 | 40KB |
| **버프** | 오라, 상승 화살표 | 64x64 | 6 | 20KB |
| **디버프** | 어둠, 하강 화살표 | 64x64 | 6 | 20KB |

**총 용량**: ~190KB

#### 3.4.3 상태이상 아이콘
| 상태 | 아이콘 | 크기 | 개수 |
|------|--------|------|------|
| **스턴** | 별 | 24x24 | 1개 |
| **독** | 해골 | 24x24 | 1개 |
| **화상** | 불꽃 | 24x24 | 1개 |
| **빙결** | 눈송이 | 24x24 | 1개 |
| **방어력 감소** | 깨진 방패 | 24x24 | 1개 |
| **공격력 증가** | 위 화살표 | 24x24 | 1개 |

**용량**: 6개 × 1KB = ~6KB

#### 3.4.4 이펙트 에셋 파일 구조
```
public/assets/effects/
├── particles/
│   ├── fire.png          # 스프라이트시트
│   ├── fire.json         # 아틀라스 JSON
│   ├── water.png
│   ├── water.json
│   └── ...
├── skills/
│   ├── physical_attack.png
│   ├── physical_attack.json
│   ├── magic_attack.png
│   └── ...
└── status/
    ├── stun.png
    ├── poison.png
    └── ...
```

### 3.5 사운드 에셋 (Phase 6)

#### 3.5.1 BGM (배경 음악)
| 씬 | 곡 설명 | 길이 | 포맷 | 용량 |
|-----|---------|------|------|------|
| **MainMenu** | 웅장한 오케스트라 | 2분 (루프) | OGG | 1.5MB |
| **Battle** | 긴장감 있는 전투 음악 | 3분 (루프) | OGG | 2.2MB |
| **Gacha** | 신비로운 마법 음악 | 1분 (루프) | OGG | 800KB |
| **Victory** | 승리 팡파레 | 10초 | OGG | 150KB |
| **Defeat** | 패배 음악 | 5초 | OGG | 80KB |

**총 용량**: ~4.7MB

#### 3.5.2 SFX (효과음)
| 액션 | 효과음 | 길이 | 개수 | 총 용량 |
|------|--------|------|------|---------|
| **버튼 클릭** | 탁 | 0.1초 | 1개 | 5KB |
| **영웅 획득** | 축하 소리 | 1초 | 1개 | 30KB |
| **공격** | 검 휘두름, 마법 폭발 | 0.5초 | 10개 | 150KB |
| **피격** | 타격음 | 0.3초 | 5개 | 50KB |
| **힐** | 회복 소리 | 0.5초 | 1개 | 20KB |
| **레벨업** | 레벨업 효과음 | 1초 | 1개 | 30KB |
| **에러** | 부정 소리 | 0.3초 | 1개 | 10KB |

**총 용량**: ~295KB

#### 3.5.3 사운드 소싱
- 무료 사운드 라이브러리 (freesound.org, zapsplat.com)
- AI 생성 (Suno AI, Loudly)
- 직접 제작 (GarageBand, FL Studio)

#### 3.5.4 사운드 에셋 파일 구조
```
public/assets/audio/
├── bgm/
│   ├── main_menu.ogg
│   ├── battle.ogg
│   ├── gacha.ogg
│   ├── victory.ogg
│   └── defeat.ogg
└── sfx/
    ├── button_click.ogg
    ├── hero_acquired.ogg
    ├── attack_1.ogg
    ├── attack_2.ogg
    └── ...
```

---

## 4. 에셋 통합 방법

### 4.1 Phaser Loader 활용

#### 4.1.1 PreloadScene 구조화
```javascript
// src/scenes/PreloadScene.js
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    // 로딩 바 UI
    this.createLoadingBar();

    // Phase별 로딩
    this.loadPhase1Assets(); // UI 아이콘
    this.loadPhase2Assets(); // 캐릭터 썸네일
    this.loadPhase3Assets(); // 배경
    this.loadPhase4Assets(); // 캐릭터 카드
    this.loadPhase5Assets(); // 전투 스프라이트, 이펙트
    this.loadPhase6Assets(); // 사운드

    // 로딩 진행률
    this.load.on('progress', (value) => {
      this.progressBar.clear();
      this.progressBar.fillStyle(0xffffff, 1);
      this.progressBar.fillRect(210, 640, 300 * value, 30);
    });

    this.load.on('complete', () => {
      console.log('모든 에셋 로딩 완료');
    });
  }

  createLoadingBar() {
    const { width, height } = this.cameras.main;
    this.progressBar = this.add.graphics();
    this.progressBar.fillStyle(0x222222, 0.8);
    this.progressBar.fillRect(210, 640, 300, 30);

    const loadingText = this.add.text(width / 2, 600, 'Loading...', {
      fontSize: '24px',
      color: '#ffffff'
    }).setOrigin(0.5);
  }

  loadPhase1Assets() {
    // UI 아이콘
    this.load.image('icon_gold', 'assets/ui/icons/currency/gold.png');
    this.load.image('icon_gem', 'assets/ui/icons/currency/gem.png');
    this.load.image('icon_energy', 'assets/ui/icons/currency/energy.png');

    // 스탯 아이콘
    this.load.image('icon_hp', 'assets/ui/icons/stats/hp.png');
    this.load.image('icon_atk', 'assets/ui/icons/stats/atk.png');
    this.load.image('icon_def', 'assets/ui/icons/stats/def.png');
    this.load.image('icon_spd', 'assets/ui/icons/stats/spd.png');

    // 분위기 아이콘
    const moods = ['brave', 'fierce', 'wild', 'calm', 'stoic', 'devoted', 'cunning', 'noble', 'mystic'];
    moods.forEach(mood => {
      this.load.image(`icon_mood_${mood}`, `assets/ui/icons/moods/${mood}.png`);
    });

    // 버튼
    this.load.image('button_normal', 'assets/ui/buttons/button_normal.png');
    this.load.image('button_pressed', 'assets/ui/buttons/button_pressed.png');
    this.load.image('button_disabled', 'assets/ui/buttons/button_disabled.png');
  }

  loadPhase2Assets() {
    // 캐릭터 썸네일 (91개)
    const characters = this.cache.json.get('characters');
    characters.forEach(char => {
      this.load.image(`char_thumb_${char.id}`, `assets/characters/thumbnails/char_${char.id}.webp`);
    });
  }

  loadPhase3Assets() {
    // 배경 이미지
    this.load.image('bg_main_menu', 'assets/backgrounds/scenes/main_menu.webp');
    this.load.image('bg_hero_list', 'assets/backgrounds/scenes/hero_list.webp');
    this.load.image('bg_gacha', 'assets/backgrounds/scenes/gacha.webp');
    this.load.image('bg_battle_1', 'assets/backgrounds/battle/chapter_1.webp');
    // ...
  }

  loadPhase4Assets() {
    // 캐릭터 카드 일러스트 (91개)
    const characters = this.cache.json.get('characters');
    characters.forEach(char => {
      this.load.image(`char_card_${char.id}`, `assets/characters/cards/char_${char.id}.webp`);
    });
  }

  loadPhase5Assets() {
    // 전투 스프라이트
    const characters = this.cache.json.get('characters');
    characters.forEach(char => {
      this.load.image(`char_battle_${char.id}`, `assets/characters/battle/char_${char.id}.webp`);
    });

    // 이펙트 아틀라스
    this.load.atlas('fx_fire', 'assets/effects/particles/fire.png', 'assets/effects/particles/fire.json');
    this.load.atlas('fx_water', 'assets/effects/particles/water.png', 'assets/effects/particles/water.json');
    // ...
  }

  loadPhase6Assets() {
    // BGM
    this.load.audio('bgm_main_menu', 'assets/audio/bgm/main_menu.ogg');
    this.load.audio('bgm_battle', 'assets/audio/bgm/battle.ogg');

    // SFX
    this.load.audio('sfx_button_click', 'assets/audio/sfx/button_click.ogg');
    this.load.audio('sfx_attack_1', 'assets/audio/sfx/attack_1.ogg');
    // ...
  }

  create() {
    // SaveManager 초기화
    const saveManager = SaveManager.getInstance();
    saveManager.initialize(this.registry);

    // MainMenuScene으로 이동
    this.scene.start('MainMenuScene');
  }
}
```

### 4.2 레이지 로딩 (씬별 에셋 분리)

#### 4.2.1 문제점
- 모든 에셋을 PreloadScene에서 로드하면 초기 로딩 시간 증가
- 91명 캐릭터 일러스트 모두 로드 시 메모리 부담

#### 4.2.2 해결책: 씬별 레이지 로딩
```javascript
// HeroDetailScene.js
create(data) {
  const heroId = data.heroId;

  // 해당 캐릭터 일러스트만 로드
  if (!this.textures.exists(`char_card_${heroId}`)) {
    this.load.image(`char_card_${heroId}`, `assets/characters/cards/char_${heroId}.webp`);
    this.load.once('complete', () => {
      this.renderHeroDetail(heroId);
    });
    this.load.start();
  } else {
    this.renderHeroDetail(heroId);
  }
}

renderHeroDetail(heroId) {
  const hero = this.heroManager.getHeroById(heroId);
  const cardImage = this.add.image(360, 400, `char_card_${heroId}`);
  // ...
}
```

**장점**:
- 초기 로딩 시간 단축
- 메모리 효율적
- 필요한 에셋만 로드

**단점**:
- 씬 전환 시 추가 로딩 시간 (해결: 미리 로드 또는 캐싱)

### 4.3 텍스처 아틀라스 (스프라이트시트)

#### 4.3.1 장점
- HTTP 요청 횟수 감소 (91개 파일 → 1개 파일)
- GPU 메모리 효율적
- 렌더링 성능 향상

#### 4.3.2 TexturePacker 사용
1. TexturePacker 다운로드 (https://www.codeandweb.com/texturepacker)
2. 91개 캐릭터 썸네일 드래그&드롭
3. 설정:
   - Framework: Phaser 3
   - Data Format: JSON (Hash)
   - Trim: Yes
   - Extrude: 1px (블리딩 방지)
4. Export → `characters_thumbnails.png` + `characters_thumbnails.json`

#### 4.3.3 Phaser 로드
```javascript
// PreloadScene.js
this.load.atlas('characters_thumbnails',
  'assets/characters/characters_thumbnails.png',
  'assets/characters/characters_thumbnails.json'
);

// HeroListScene.js
const thumbnail = this.add.image(x, y, 'characters_thumbnails', `char_${hero.id}`);
```

**용량 비교**:
- 개별 파일: 91개 × 5KB = 455KB + HTTP 요청 91회
- 아틀라스: 1개 × 400KB = 400KB + HTTP 요청 2회 (PNG + JSON)

### 4.4 에셋 캐싱 전략

#### 4.4.1 브라우저 캐싱
- `public/` 폴더의 에셋은 브라우저 캐시에 저장됨
- Vite 빌드 시 파일명에 해시 추가 (캐시 무효화)

**예시**:
```
dist/assets/characters_thumbnails.a3d7e9f1.png
```

#### 4.4.2 Phaser 텍스처 캐싱
- 한 번 로드된 텍스처는 `this.textures`에 캐싱
- 씬 전환 시 자동으로 유지됨

**확인 코드**:
```javascript
if (this.textures.exists('char_card_thor')) {
  console.log('thor 카드 이미지 이미 로드됨');
}
```

#### 4.4.3 수동 언로드 (메모리 관리)
```javascript
// 사용하지 않는 텍스처 제거
this.textures.remove('char_card_old_hero');
```

---

## 5. 리소스 최적화

### 5.1 이미지 압축

#### 5.1.1 WebP vs PNG
| 포맷 | 압축률 | 브라우저 지원 | 품질 |
|------|--------|---------------|------|
| **WebP** | PNG 대비 ~30% 작음 | Chrome 23+, Firefox 65+, Safari 16+ | 손실/무손실 둘 다 가능 |
| **PNG** | 무손실 압축 | 모든 브라우저 | 무손실 |

**권장**: WebP 우선, PNG 폴백

**변환 도구**:
- cwebp (CLI)
- Squoosh (웹)
- ImageMagick

**예시 (cwebp)**:
```bash
# 무손실 변환
cwebp -lossless char_001.png -o char_001.webp

# 손실 변환 (품질 80)
cwebp -q 80 char_001.png -o char_001.webp
```

#### 5.1.2 이미지 최적화 도구
- **TinyPNG**: PNG/JPG 압축 (https://tinypng.com)
- **ImageOptim**: macOS 전용 (https://imageoptim.com)
- **Squoosh**: 브라우저 기반 (https://squoosh.app)

### 5.2 스프라이트 아틀라스 최적화

#### 5.2.1 TexturePacker 설정
- **Algorithm**: MaxRects
- **Pack Mode**: Best
- **Trim Mode**: Trim (투명 영역 제거)
- **Extrude**: 1px (블리딩 방지)
- **Multipack**: Yes (2048x2048 초과 시 분할)

#### 5.2.2 파워 오브 투 (Power of Two)
GPU 효율을 위해 텍스처 크기를 2의 제곱수로 설정.

**권장 크기**: 512x512, 1024x1024, 2048x2048, 4096x4096

### 5.3 번들 사이즈 관리

#### 5.3.1 현재 상태
- JavaScript: ~503KB (gzip)
- 에셋: 0KB
- **총합**: ~503KB

#### 5.3.2 목표 (Phase 6 완료 후)
| 카테고리 | 용량 | 예산 |
|----------|------|------|
| JavaScript | 503KB | 1MB |
| 캐릭터 에셋 | 2.5MB | 3MB |
| 배경 이미지 | 2.4MB | 3MB |
| UI 에셋 | 300KB | 500KB |
| 이펙트 에셋 | 500KB | 1MB |
| 사운드 | 5MB | 7MB |
| **총합** | **11.2MB** | **15MB** |

**허용 범위**: 10~15MB (모바일 웹 게임 평균)

#### 5.3.3 모니터링 도구
- Vite 빌드 시 번들 분석
```bash
npm run build -- --report
```
- Webpack Bundle Analyzer (선택사항)

---

## 6. 우선순위 및 페이즈

### Phase 1: 핵심 UI 아이콘 (1주)
**목표**: 텍스트 이모지 제거, 아이콘 교체

| Task ID | 설명 | 에셋 개수 | 용량 | 검증 기준 |
|---------|------|-----------|------|-----------|
| RES-1.1 | 재화 아이콘 (골드, 젬, 에너지) | 3개 | 10KB | 모든 씬에서 아이콘 표시 |
| RES-1.2 | 스탯 아이콘 (HP, ATK, DEF, SPD) | 4개 | 10KB | 스탯 바에 아이콘 표시 |
| RES-1.3 | 버튼 스프라이트 (normal, pressed, disabled) | 9개 | 50KB | 버튼 눌림 효과 작동 |
| RES-1.4 | 탭 아이콘 (영웅, 인벤토리, 가챠 등) | 5개 | 15KB | 하단바에 아이콘 표시 |

**검증**:
- [ ] 모든 이모지 제거됨
- [ ] 아이콘 해상도 선명함 (32x32 최소)
- [ ] 버튼 눌림 효과 반응 즉시

### Phase 2: 캐릭터 썸네일 (2주)
**목표**: HeroListScene에서 캐릭터 원 → 썸네일 교체

| Task ID | 설명 | 에셋 개수 | 용량 | 검증 기준 |
|---------|------|-----------|------|-----------|
| RES-2.1 | 캐릭터 썸네일 생성 (AI 또는 커미션) | 91개 | 455KB | 91명 모두 고유한 일러스트 |
| RES-2.2 | 텍스처 아틀라스 생성 (TexturePacker) | 1개 | 400KB | 아틀라스 로드 성공 |
| RES-2.3 | HeroListScene 렌더링 코드 수정 | - | - | 썸네일 표시 정상 |
| RES-2.4 | CharacterRenderer 추상화 레이어 구현 | - | - | 코드/에셋 전환 가능 |

**검증**:
- [ ] HeroListScene에서 91명 썸네일 렌더링
- [ ] 60fps 유지 (300명 로드 시)
- [ ] 캐릭터 클릭 시 상세 화면 이동

### Phase 3: 배경 이미지 및 아이콘 확장 (2주)
**목표**: 씬별 배경 추가, 분위기/교단/클래스 아이콘 추가

| Task ID | 설명 | 에셋 개수 | 용량 | 검증 기준 |
|---------|------|-----------|------|-----------|
| RES-3.1 | 배경 이미지 생성 (AI 또는 무료 에셋) | 16개 | 2.4MB | 모든 씬에 배경 표시 |
| RES-3.2 | 분위기 아이콘 9개 | 9개 | 20KB | 분위기 표시 시 아이콘 |
| RES-3.3 | 교단 엠블럼 9개 | 9개 | 25KB | 캐릭터 카드에 엠블럼 |
| RES-3.4 | 클래스 아이콘 4개 | 4개 | 10KB | 클래스 필터에 아이콘 |
| RES-3.5 | 등급 프레임 5개 | 5개 | 50KB | 카드 프레임 교체 |

**검증**:
- [ ] 모든 씬에서 배경 렌더링
- [ ] 배경 로딩 시간 1초 이내
- [ ] 등급별 카드 프레임 시각적 구분 명확

### Phase 4: 캐릭터 카드 일러스트 (3주)
**목표**: HeroDetailScene에서 고품질 일러스트 표시

| Task ID | 설명 | 에셋 개수 | 용량 | 검증 기준 |
|---------|------|-----------|------|-----------|
| RES-4.1 | 캐릭터 카드 일러스트 생성 (200x280) | 91개 | 2.7MB | 91명 모두 고유 일러스트 |
| RES-4.2 | WebP 변환 및 압축 | 91개 | 1.8MB | 품질 저하 최소화 |
| RES-4.3 | 레이지 로딩 구현 | - | - | 필요 시에만 로드 |
| RES-4.4 | HeroDetailScene 렌더링 코드 수정 | - | - | 카드 일러스트 표시 |

**검증**:
- [ ] HeroDetailScene에서 카드 일러스트 렌더링
- [ ] 레이지 로딩 작동 (초기 로딩 시간 단축)
- [ ] 캐릭터 간 전환 시 1초 이내 로드

### Phase 5: 전투 스프라이트 및 이펙트 (3주)
**목표**: BattleScene 비주얼 고도화

| Task ID | 설명 | 에셋 개수 | 용량 | 검증 기준 |
|---------|------|-----------|------|-----------|
| RES-5.1 | 전투 스프라이트 생성 (120x120) | 91개 | 910KB | 전투 시 스프라이트 표시 |
| RES-5.2 | 파티클 스프라이트시트 (불, 물, 번개 등) | 7개 | 200KB | 파티클 이펙트 작동 |
| RES-5.3 | 스킬 이펙트 애니메이션 | 5개 | 190KB | 스킬 사용 시 이펙트 |
| RES-5.4 | 상태이상 아이콘 6개 | 6개 | 6KB | HP 바 위 아이콘 표시 |
| RES-5.5 | BattleScene 렌더링 코드 수정 | - | - | 전투 비주얼 개선 |

**검증**:
- [ ] 전투 중 캐릭터 스프라이트 렌더링
- [ ] 스킬 이펙트 부드러운 애니메이션 (60fps)
- [ ] 파티클 시스템 성능 (30개 이상 입자 동시 표시)

### Phase 6: 사운드 (2주)
**목표**: BGM 및 SFX 추가

| Task ID | 설명 | 에셋 개수 | 용량 | 검증 기준 |
|---------|------|-----------|------|-----------|
| RES-6.1 | BGM 5곡 | 5개 | 4.7MB | 씬별 BGM 재생 |
| RES-6.2 | SFX 20개 | 20개 | 300KB | 액션 시 SFX 재생 |
| RES-6.3 | 사운드 매니저 구현 | - | - | 볼륨 조절, 음소거 |
| RES-6.4 | 설정 씬에 사운드 옵션 추가 | - | - | BGM/SFX 개별 조절 |

**검증**:
- [ ] 모든 씬에서 BGM 재생
- [ ] 버튼 클릭 시 SFX 재생
- [ ] 설정에서 볼륨 조절 작동
- [ ] 음소거 기능 작동

---

## 7. 에셋 관리 프로세스

### 7.1 에셋 제작 워크플로우
```
1. 요구사항 정의 (크기, 개수, 스타일)
   ↓
2. 에셋 생성 (AI/커미션/무료 에셋)
   ↓
3. 후처리 (크롭, 리사이즈, 배경 제거)
   ↓
4. 최적화 (WebP 변환, 압축)
   ↓
5. 네이밍 규칙 적용
   ↓
6. public/assets/ 폴더에 배치
   ↓
7. PreloadScene에 로드 코드 추가
   ↓
8. 씬에서 렌더링 코드 작성
   ↓
9. 검증 (시각적, 성능, 용량)
```

### 7.2 버전 관리
- 에셋 파일도 Git에 커밋 (LFS 사용 권장)
- 변경 시 커밋 메시지 명확히
  - `[RES] Add character thumbnails (91 files)`
  - `[RES] Replace button sprites with higher quality`

### 7.3 에셋 문서화
`docs/ASSET_REGISTRY.md` 파일 생성:
```markdown
# 에셋 레지스트리

## 캐릭터 썸네일
- 경로: `public/assets/characters/thumbnails/`
- 개수: 91개
- 크기: 80x80px
- 포맷: WebP
- 생성 방법: Stable Diffusion (v1.5, prompt: ...)
- 생성일: 2026-02-15
- 총 용량: 455KB

## 배경 이미지
- 경로: `public/assets/backgrounds/scenes/`
- 개수: 16개
- 크기: 720x1280px
- 포맷: WebP
- 출처: 무료 에셋 팩 (출처 URL)
- 총 용량: 2.4MB
```

---

## 8. 롤백 계획

### 8.1 에셋 교체 실패 시
- 추상화 레이어 덕분에 코드 렌더링으로 즉시 복원 가능
- `CharacterRenderer.useAssets = false` 설정

### 8.2 용량 초과 시
- Phase별 롤백 (Phase 6 → Phase 5 → ...)
- 우선순위 낮은 에셋 제거 (Parallax 레이어, 고해상도 이펙트 등)

### 8.3 성능 저하 시
- 텍스처 아틀라스로 통합
- 이미지 해상도 다운스케일
- 레이지 로딩 강화

---

## 9. 검증 체크리스트

### Phase 1 검증
- [ ] 재화/스탯/탭 아이콘 표시됨
- [ ] 이모지 완전히 제거됨
- [ ] 버튼 눌림 효과 작동
- [ ] 번들 사이즈 +100KB 이내

### Phase 2 검증
- [ ] HeroListScene에서 91명 썸네일 렌더링
- [ ] 60fps 유지
- [ ] 텍스처 아틀라스 로드 성공
- [ ] 번들 사이즈 +500KB 이내

### Phase 3 검증
- [ ] 모든 씬에서 배경 표시
- [ ] 분위기/교단/클래스 아이콘 표시
- [ ] 등급별 카드 프레임 구분 명확
- [ ] 번들 사이즈 +3MB 이내

### Phase 4 검증
- [ ] HeroDetailScene에서 카드 일러스트 렌더링
- [ ] 레이지 로딩 작동
- [ ] 캐릭터 전환 1초 이내
- [ ] 번들 사이즈 +2MB 이내

### Phase 5 검증
- [ ] 전투 스프라이트 렌더링
- [ ] 스킬 이펙트 애니메이션 60fps
- [ ] 파티클 시스템 작동
- [ ] 번들 사이즈 +1.5MB 이내

### Phase 6 검증
- [ ] 모든 씬에서 BGM 재생
- [ ] 버튼 클릭 SFX 재생
- [ ] 볼륨 조절/음소거 작동
- [ ] 번들 사이즈 +5MB 이내

### 최종 검증
- [ ] 총 번들 사이즈 15MB 이하
- [ ] 모든 씬 60fps 유지
- [ ] 초기 로딩 시간 5초 이내
- [ ] 메모리 사용량 200MB 이하

---

## 10. 관련 문서
- `14_CHARACTER_DESIGN.md`: 캐릭터 디자인 상세 가이드
- `17_UI_UX_ENHANCEMENT.md`: UI/UX 개선 계획
- `src/scenes/PreloadScene.js`: 에셋 로딩 코드
- `src/renderers/CharacterRenderer.js`: 캐릭터 렌더링 추상화
- `docs/ASSET_REGISTRY.md`: 에셋 레지스트리 (생성 예정)

---

## 변경 이력
- **1.0** (2026-02-07): 초안 작성
