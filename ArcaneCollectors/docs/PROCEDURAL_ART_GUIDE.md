# Procedural Art System Guide

## Overview

ArcaneCollectors는 프로시저럴 아트 시스템을 통해 에셋 파일 없이도 풍부한 비주얼을 제공합니다.
Phaser Graphics API를 활용하여 동적으로 배경, 아이콘, 캐릭터 아바타를 생성합니다.

---

## 1. BackgroundFactory (씬 배경)

**위치**: `src/utils/BackgroundFactory.js`

### 사용법

```javascript
import { BackgroundFactory } from '../utils/BackgroundFactory.js';

// MainMenuScene에서
createBackground() {
  BackgroundFactory.createMainBg(this);
}

// BattleScene에서
createBackground() {
  BackgroundFactory.createBattleBg(this);
}
```

### 사용 가능한 배경

| 메서드 | 씬 | 특징 |
|--------|-----|------|
| `createMainBg(scene)` | MainMenuScene | 남색→보라 그래디언트, 별빛 파티클, 오브 |
| `createBattleBg(scene)` | BattleScene | 어두운 던전, 안개/먼지 파티클 |
| `createGachaBg(scene)` | GachaScene | 보라+골드 그래디언트, 마법진, 빛줄기 |
| `createStageSelectBg(scene)` | StageSelectScene | 녹색~갈색 대지, 나무 실루엣, 나뭇잎 |
| `createTowerBg(scene)` | TowerScene | 검정+진남색, 별, 횃불빛 포인트 |
| `createGradientBg(scene, options)` | 범용 | 커스텀 그래디언트 생성 |

### 커스텀 그래디언트 예시

```javascript
BackgroundFactory.createGradientBg(this, {
  topColor: [15, 23, 42],     // RGB 상단 색상
  bottomColor: [30, 41, 59]   // RGB 하단 색상
});
```

---

## 2. IconFactory (UI 아이콘)

**위치**: `src/utils/IconFactory.js`

### 사용법

```javascript
import { IconFactory } from '../utils/IconFactory.js';

// 아이콘 생성 (텍스처 키 반환)
const swordKey = IconFactory.createIcon(scene, 'sword', 32);
const swordImage = scene.add.image(x, y, swordKey);

// 재화 아이콘 단축 메서드
const goldKey = IconFactory.createCurrencyIcon(scene, 'gold', 24);
const gemKey = IconFactory.createCurrencyIcon(scene, 'gem', 24);

// 스탯 아이콘 단축 메서드
const hpKey = IconFactory.createStatIcon(scene, 'hp', 32);
const atkKey = IconFactory.createStatIcon(scene, 'atk', 32);
```

### 사용 가능한 아이콘

| 타입 | 설명 | 색상 |
|------|------|------|
| `sword` | 공격력 아이콘 | 빨강 (0xEF4444) |
| `shield` | 방어력 아이콘 | 파랑 (0x3B82F6) |
| `heart` | HP 아이콘 | 초록 (0x10B981) |
| `star` | 경험치/속도 아이콘 | 골드 (0xF59E0B) |
| `coin` | 골드 아이콘 | 골드 (0xF59E0B) |
| `gem` | 보석 아이콘 | 핑크 (0xEC4899) |
| `energy` | 에너지 번개 아이콘 | 초록 (0x10B981) |

### PreloadScene에서 일괄 생성

```javascript
import { IconFactory } from '../utils/IconFactory.js';

create() {
  // 24px, 32px, 48px 크기로 모든 아이콘 생성
  IconFactory.preloadAllIcons(this, [24, 32, 48]);
}
```

---

## 3. CharacterRenderer (강화 버전)

**위치**: `src/renderers/CharacterRenderer.js`

### 새로운 기능 (ART-1.3)

#### 3.1 직업별 실루엣

에셋 이미지가 없을 때, 직업별 심볼을 자동으로 렌더링합니다.

| 직업 | 실루엣 | 색상 |
|------|--------|------|
| warrior | 검 | 빨강 (0xEF4444) |
| mage | 지팡이+보석 | 보라 (0x8B5CF6) |
| healer | 십자가 | 초록 (0x10B981) |
| archer | 활 | 파랑 (0x3B82F6) |

#### 3.2 등급별 프레임 강화

| 등급 | 효과 |
|------|------|
| N | 기본 테두리 (1px) |
| R | 기본 테두리 (1px) |
| SR | 두꺼운 테두리 (2px) |
| SSR | 두꺼운 테두리 (3px) + 글로우 + 빛나는 파티클 |
| UR | 초두꺼운 테두리 (4px) + 이중 테두리 + 글로우 + 파티클 |

#### 3.3 분위기(Mood) 배경 색상

각 영웅의 `mood` 속성에 따라 카드 배경에 미세한 색상 오버레이가 적용됩니다.

### 사용법

```javascript
import characterRenderer from '../renderers/CharacterRenderer.js';

// 썸네일 (80x80)
const thumbnail = characterRenderer.renderThumbnail(scene, x, y, hero);

// 카드 (200x280)
const card = characterRenderer.renderCard(scene, x, y, hero);

// 전투 스프라이트 (120x120)
const sprite = characterRenderer.renderBattleSprite(scene, x, y, hero);

// 포트레이트 (64x64)
const portrait = characterRenderer.renderPortrait(scene, x, y, hero);
```

---

## 4. 통합 예시: 씬에서 모두 활용

```javascript
import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import { IconFactory } from '../utils/IconFactory.js';
import characterRenderer from '../renderers/CharacterRenderer.js';

export class MyCustomScene extends Phaser.Scene {
  create() {
    // 1. 배경 생성
    BackgroundFactory.createMainBg(this);

    // 2. UI 아이콘 생성
    const goldIcon = IconFactory.createCurrencyIcon(this, 'gold', 24);
    this.add.image(50, 50, goldIcon);

    const swordIcon = IconFactory.createStatIcon(this, 'atk', 32);
    this.add.image(100, 50, swordIcon);

    // 3. 캐릭터 렌더링
    const hero = { id: 'hero_001', name: '아서', class: 'warrior', rarity: 3, mood: 'brave', cult: 'avalon' };
    const card = characterRenderer.renderCard(this, 360, 640, hero);
  }
}
```

---

## 5. 성능 최적화

### 텍스처 캐싱

IconFactory와 CharacterRenderer는 자동으로 텍스처를 캐싱합니다.
동일한 아이콘/캐릭터를 여러 번 생성해도 텍스처는 한 번만 생성됩니다.

```javascript
// 같은 크기의 sword 아이콘은 한 번만 생성됨
IconFactory.createIcon(scene, 'sword', 32); // 텍스처 생성
IconFactory.createIcon(scene, 'sword', 32); // 캐시된 텍스처 재사용
IconFactory.createIcon(scene, 'sword', 48); // 새로운 크기이므로 새 텍스처 생성
```

### 캐시 초기화

씬 전환 시 메모리 정리가 필요하면 캐시를 초기화할 수 있습니다.

```javascript
IconFactory.clearCache();
characterRenderer.clearCache();
```

---

## 6. 향후 확장 가능성

### 6.1 에셋 하이브리드 모드

현재는 프로시저럴 렌더링만 지원하지만, 향후 에셋 파일이 추가되면 자동으로 전환됩니다.

```javascript
// 에셋 모드 활성화 (향후)
characterRenderer.setUseAssets(true);

// bg_main.png가 있으면 이미지 사용, 없으면 프로시저럴 렌더링
BackgroundFactory.createMainBg(this);
```

### 6.2 커스텀 아이콘 추가

IconFactory에 새로운 아이콘 타입을 추가하려면 `_draw{Type}` 메서드를 작성합니다.

```javascript
// IconFactory.js에 추가
static _drawCrown(graphics, half, size) {
  const color = 0xF59E0B;
  graphics.fillStyle(color, 1);
  // 왕관 모양 그리기 로직
  graphics.fillRect(half - 10, half, 20, 10);
  graphics.fillTriangle(half - 8, half, half, half - 15, half + 8, half);
}

// 사용
IconFactory.createIcon(scene, 'crown', 32);
```

---

## 7. 기술 스택

- **Phaser 3.90.0**: Graphics API, Container, Tweens
- **ES Modules**: `import`/`export` 방식
- **싱글톤 패턴**: CharacterRenderer, UIRenderer
- **정적 메서드**: BackgroundFactory, IconFactory

---

## 8. 문제 해결

### 아이콘이 안 보여요

```javascript
// 텍스처가 생성되었는지 확인
const key = IconFactory.createIcon(scene, 'sword', 32);
console.log(scene.textures.exists(key)); // true여야 함
```

### 배경이 깜빡여요

```javascript
// Tween이 중복 생성되지 않도록 확인
// shutdown()에서 tweens.killAll() 호출
shutdown() {
  this.tweens.killAll();
}
```

### 메모리 누수가 의심돼요

```javascript
// 씬 종료 시 모든 그래픽스 객체 파괴 확인
// BackgroundFactory가 반환하는 객체를 저장하고 shutdown에서 destroy
createBackground() {
  this.bgObjects = BackgroundFactory.createMainBg(this);
}

shutdown() {
  if (this.bgObjects?.graphics) {
    this.bgObjects.graphics.destroy();
  }
}
```

---

## 9. 참고 자료

- [Phaser 3 Graphics API](https://photonstorm.github.io/phaser3-docs/Phaser.GameObjects.Graphics.html)
- [Phaser 3 Tweens](https://photonstorm.github.io/phaser3-docs/Phaser.Tweens.Tween.html)
- `src/config/gameConfig.js` - 색상/상수 정의
- `src/config/layoutConfig.js` - 레이아웃 설정
