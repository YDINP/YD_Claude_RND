import { s, sf, GAME_WIDTH, GAME_HEIGHT } from '../../config/scaleConfig.js';
import { DebugManager } from '../../systems/DebugManager.js';

const FAB_POS_KEY = 'arcane_debug_fab_pos';
const DRAG_THRESHOLD = 5; // px, 이 값 초과 이동 시 드래그로 처리

export class DebugFAB {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;
    this.onToggle = null; // 콜백: 패널 열기/닫기
    this._pointerDownTime = 0;
    this._isDragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragStartFabX = 0;
    this._dragStartFabY = 0;
    this._fabX = 0;
    this._fabY = 0;
    this._onPointerMove = null;
    this._onPointerUp = null;
    this._create();
  }

  _loadSavedPosition(defaultX, defaultY) {
    try {
      const saved = localStorage.getItem(FAB_POS_KEY);
      if (saved) {
        const { x, y } = JSON.parse(saved);
        const size = s(44);
        const half = size / 2;
        // 저장된 위치가 현재 화면 범위 내인지 검증
        if (x >= half && x <= GAME_WIDTH - half && y >= half && y <= GAME_HEIGHT - half) {
          return { x, y };
        }
      }
    } catch (e) {
      // localStorage 파싱 실패 시 기본값 사용
    }
    return { x: defaultX, y: defaultY };
  }

  _savePosition(x, y) {
    try {
      localStorage.setItem(FAB_POS_KEY, JSON.stringify({ x, y }));
    } catch (e) {
      // localStorage 저장 실패 시 무시
    }
  }

  _create() {
    const size = s(44);
    const half = size / 2;

    // 기본 위치: 우측 상단, TopBar 아래
    const defaultX = GAME_WIDTH - s(40);
    const defaultY = s(120);

    // 저장된 위치 복원 (없으면 기본값)
    const pos = this._loadSavedPosition(defaultX, defaultY);
    this._fabX = pos.x;
    this._fabY = pos.y;

    const x = this._fabX;
    const y = this._fabY;

    // 배경 원
    this.bg = this.scene.add.circle(x, y, half, 0x1a1a2e, 0.9)
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

    // 드래그 구현
    this.bg.on('pointerdown', (pointer) => {
      this._pointerDownTime = pointer.downTime;
      this._isDragging = false;
      this._dragStartX = pointer.x;
      this._dragStartY = pointer.y;
      this._dragStartFabX = this._fabX;
      this._dragStartFabY = this._fabY;

      // scene 레벨 pointermove/pointerup 이벤트 등록
      this._onPointerMove = (movePointer) => {
        const dx = movePointer.x - this._dragStartX;
        const dy = movePointer.y - this._dragStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (!this._isDragging && dist > DRAG_THRESHOLD) {
          this._isDragging = true;
          // 커서를 grabbing으로 변경
          const canvas = this.scene.sys.game.canvas;
          if (canvas) canvas.style.cursor = 'grabbing';
        }

        if (this._isDragging) {
          const size44 = s(44);
          const h = size44 / 2;
          const newX = Math.max(h, Math.min(GAME_WIDTH - h, this._dragStartFabX + dx));
          const newY = Math.max(h, Math.min(GAME_HEIGHT - h, this._dragStartFabY + dy));
          this._moveFabTo(newX, newY);
        }
      };

      this._onPointerUp = () => {
        // 커서 복원
        const canvas = this.scene.sys.game.canvas;
        if (canvas) canvas.style.cursor = '';

        if (this._isDragging) {
          // 드래그 종료: 위치 저장
          this._savePosition(this._fabX, this._fabY);
        } else {
          // 클릭: 패널 토글
          this.isOpen = !this.isOpen;
          if (this.onToggle) this.onToggle(this.isOpen);
          this._updateVisual();
        }

        this._isDragging = false;
        // 이벤트 리스너 해제
        this.scene.input.off('pointermove', this._onPointerMove);
        this.scene.input.off('pointerup', this._onPointerUp);
        this._onPointerMove = null;
        this._onPointerUp = null;
      };

      this.scene.input.on('pointermove', this._onPointerMove);
      this.scene.input.on('pointerup', this._onPointerUp);
    });

    // 뱃지 업데이트 타이머
    this.updateTimer = this.scene.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.updateBadge()
    });

    this.updateBadge();
  }

  _moveFabTo(x, y) {
    this._fabX = x;
    this._fabY = y;
    this.bg?.setPosition(x, y);
    this.icon?.setPosition(x, y);
    this.badge?.setPosition(x + s(14), y - s(14));
    this.badgeText?.setPosition(x + s(14), y - s(14));
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
    // 드래그 중 destroy 시 이벤트 리스너 정리
    if (this._onPointerMove) {
      this.scene.input.off('pointermove', this._onPointerMove);
      this._onPointerMove = null;
    }
    if (this._onPointerUp) {
      this.scene.input.off('pointerup', this._onPointerUp);
      this._onPointerUp = null;
    }
    // 커서 복원
    const canvas = this.scene?.sys?.game?.canvas;
    if (canvas) canvas.style.cursor = '';

    this.bg?.destroy();
    this.icon?.destroy();
    this.badge?.destroy();
    this.badgeText?.destroy();
    this.updateTimer?.destroy();
  }
}
