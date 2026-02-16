import { s, sf, GAME_WIDTH } from '../../config/scaleConfig.js';
import { DebugManager } from '../../systems/DebugManager.js';

export class DebugFAB {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;
    this.onToggle = null; // 콜백: 패널 열기/닫기
    this._pointerDownTime = 0;
    this._create();
  }

  _create() {
    // FAB 버튼: 우측 상단, TopBar 아래
    const x = GAME_WIDTH - s(40);
    const y = s(120);
    const size = s(44);

    // 배경 원
    this.bg = this.scene.add.circle(x, y, size / 2, 0x1a1a2e, 0.9)
      .setDepth(8000)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(s(2), 0x6366F1);

    // 아이콘 텍스트
    this.icon = this.scene.add.text(x, y, '🐛', {
      fontSize: sf(20), fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(8001);

    // 활성 치트 뱃지 (빨간 원 + 숫자)
    this.badge = this.scene.add.circle(x + s(14), y - s(14), s(10), 0xEF4444)
      .setDepth(8002).setVisible(false);
    this.badgeText = this.scene.add.text(x + s(14), y - s(14), '0', {
      fontSize: sf(10), fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(8003).setVisible(false);

    // 탭 이벤트
    this.bg.on('pointerdown', (pointer) => {
      this._pointerDownTime = pointer.downTime;
    });
    this.bg.on('pointerup', (pointer) => {
      const elapsed = pointer.upTime - this._pointerDownTime;
      if (elapsed < 800) {
        // 짧은 탭: 패널 토글
        this.isOpen = !this.isOpen;
        if (this.onToggle) this.onToggle(this.isOpen);
        this._updateVisual();
      }
    });

    // 뱃지 업데이트 타이머
    this.updateTimer = this.scene.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.updateBadge()
    });

    this.updateBadge();
  }

  updateBadge() {
    const count = this._getActiveCheatCount();
    if (count > 0) {
      this.badge.setVisible(true);
      this.badgeText.setVisible(true).setText(String(count));
      this.bg.setStrokeStyle(s(2), 0xEF4444);
    } else {
      this.badge.setVisible(false);
      this.badgeText.setVisible(false);
      this.bg.setStrokeStyle(s(2), 0x6366F1);
    }
  }

  _getActiveCheatCount() {
    let count = 0;
    if (DebugManager.invincible) count++;
    if (DebugManager.oneHitKill) count++;
    if (DebugManager.infiniteEnergy) count++;
    if (DebugManager.freeGachaMode) count++;
    if (DebugManager.forcePickupMode) count++;
    if (DebugManager.alwaysMoodAdvantage) count++;
    if (DebugManager.battleSpeedMultiplier > 1) count++;
    return count;
  }

  _updateVisual() {
    if (this.isOpen) {
      this.icon.setText('✕');
      this.bg.setFillStyle(0xEF4444, 0.9);
    } else {
      this.icon.setText('🐛');
      this.bg.setFillStyle(0x1a1a2e, 0.9);
    }
  }

  show() {
    this.bg?.setVisible(true);
    this.icon?.setVisible(true);
    this.updateBadge();
  }

  hide() {
    this.bg?.setVisible(false);
    this.icon?.setVisible(false);
    this.badge?.setVisible(false);
    this.badgeText?.setVisible(false);
  }

  destroy() {
    this.bg?.destroy();
    this.icon?.destroy();
    this.badge?.destroy();
    this.badgeText?.destroy();
    this.updateTimer?.destroy();
  }
}
