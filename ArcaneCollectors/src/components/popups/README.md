# Popups

This directory contains popup components that extend `PopupBase`.

## Available Popups

### GachaPopup

소환 팝업 - 영웅/장비 소환, 천장 시스템, 결과 표시

**Usage:**

```javascript
import { GachaPopup } from './components/popups/GachaPopup.js';

// In your scene
const gachaPopup = new GachaPopup(this);
gachaPopup.show();
```

**Features:**
- 영웅/장비 소환 탭 전환
- 보석/소환권 잔액 표시
- 천장 카운터 (90회 SSR 확정)
- 단일/10연차 소환
- 소환 결과 애니메이션
- SSR/SR 특수 효과

**Tab System:**
- 영웅 소환: GachaSystem을 통한 hero pull
- 장비 소환: 간소화된 equipment pull

**Summon Buttons:**
- 단일 소환: 300 gems or 1 ticket
- 10연차: 2700 gems or 10 tickets

**Pity System:**
- 90회 SSR 확정
- 75회부터 소프트 천장 (확률 증가)
- 10연차 SR 이상 1개 보장

## Creating New Popups

1. Extend `PopupBase`:
```javascript
import { PopupBase } from '../PopupBase.js';

export class MyPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: 'My Title',
      width: 680,
      height: 900,
      ...options
    });
  }

  buildContent() {
    const b = this.contentBounds;
    // Add your content using:
    // - this.addText(x, y, text, style)
    // - this.addButton(x, y, w, h, label, color, callback)
    // - this.scene.add.* (add to this.contentContainer)
  }
}
```

2. Use `this.contentBounds` for positioning:
   - `b.left`, `b.top`, `b.right`, `b.bottom`
   - `b.width`, `b.height`
   - `b.centerX`

3. Add elements to `this.contentContainer`

4. Use `this.hide()` to close the popup
