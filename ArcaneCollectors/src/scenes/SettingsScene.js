/**
 * SettingsScene - 더보기 / 설정 메뉴
 * 서브메뉴 (퀘스트/탑/설정), 사운드 토글, 쿠폰 입력, 계정 정보
 */
import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
import { CouponSystem } from '../systems/CouponSystem.js';
import { BottomNav } from '../components/BottomNav.js';

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SettingsScene' });
  }

  create() {
    try {
    this.cameras.main.fadeIn(300);
    this.createBackground();
    this.createTopBar();
    this.createMenuGrid();
    this.createSettingsSection();
    this.createAccountInfo();
    this.bottomNav = new BottomNav(this, 'more');
    } catch (error) {
      console.error('[SettingsScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  shutdown() {
    if (this.couponInput) {
      this.couponInput.remove();
      this.couponInput = null;
    }
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }

  createBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0F172A);
  }

  createTopBar() {
    const bar = this.add.graphics();
    bar.fillStyle(0x0F172A, 0.95);
    bar.fillRect(0, 0, GAME_WIDTH, 90);
    bar.lineStyle(2, COLORS.primary, 0.5);
    bar.lineBetween(0, 90, GAME_WIDTH, 90);

    this.add.text(GAME_WIDTH / 2, 30, '더보기', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '24px',
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5, 0);
  }

  createMenuGrid() {
    const startY = 110;
    const cols = 3;
    const cellW = (GAME_WIDTH - 60) / cols;
    const cellH = 100;
    const gap = 10;

    const menus = [
      { icon: '📋', label: '퀘스트', scene: 'QuestScene' },
      { icon: '🗼', label: '무한의 탑', scene: 'TowerScene' },
      { icon: '🦸', label: '영웅 목록', scene: 'HeroListScene' },
      { icon: '⚔️', label: '파티 편성', scene: 'PartyEditScene' },
      { icon: '🎒', label: '가방', scene: 'InventoryScene' },
      { icon: '🎫', label: '쿠폰', action: 'coupon' }
    ];

    menus.forEach((menu, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 30 + col * (cellW + gap);
      const y = startY + row * (cellH + gap);

      const cell = this.add.graphics();
      cell.fillStyle(0x1E293B, 1);
      cell.fillRoundedRect(x, y, cellW, cellH, 12);

      this.add.text(x + cellW / 2, y + 30, menu.icon, {
        fontSize: '32px'
      }).setOrigin(0.5);

      this.add.text(x + cellW / 2, y + 70, menu.label, {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '14px',
        fontStyle: 'bold', color: '#F8FAFC'
      }).setOrigin(0.5);

      const hitArea = this.add.rectangle(x + cellW / 2, y + cellH / 2, cellW, cellH)
        .setAlpha(0.001).setInteractive({ useHandCursor: true });

      hitArea.on('pointerover', () => cell.clear().fillStyle(0x334155, 1).fillRoundedRect(x, y, cellW, cellH, 12));
      hitArea.on('pointerout', () => cell.clear().fillStyle(0x1E293B, 1).fillRoundedRect(x, y, cellW, cellH, 12));

      hitArea.on('pointerdown', () => {
        if (menu.action === 'coupon') {
          this.showCouponModal();
        } else if (menu.scene) {
          this.cameras.main.fadeOut(200, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start(menu.scene);
          });
        }
      });
    });
  }

  createSettingsSection() {
    const sectionY = 340;

    this.add.text(30, sectionY, '설정', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '20px',
      fontStyle: 'bold', color: '#F8FAFC'
    });

    const settings = [
      { label: '🔊 사운드', key: 'sound', type: 'toggle' },
      { label: '🎵 BGM', key: 'bgm', type: 'toggle' },
      { label: '📳 진동', key: 'vibration', type: 'toggle' },
      { label: '🔔 알림', key: 'notification', type: 'toggle' }
    ];

    const data = SaveManager.load();
    const settingsData = data.settings || {};

    settings.forEach((setting, i) => {
      const y = sectionY + 45 + i * 55;
      this.createSettingRow(setting, y, settingsData);
    });
  }

  createSettingRow(setting, y, settingsData) {
    const rowBg = this.add.graphics();
    rowBg.fillStyle(0x1E293B, 0.8);
    rowBg.fillRoundedRect(20, y, GAME_WIDTH - 40, 45, 10);

    this.add.text(40, y + 12, setting.label, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px', color: '#F8FAFC'
    });

    const isOn = settingsData[setting.key] !== false;

    // 토글
    const toggleX = GAME_WIDTH - 70;
    const toggleBg = this.add.graphics();
    const toggleColor = isOn ? COLORS.success : 0x475569;
    toggleBg.fillStyle(toggleColor, 1);
    toggleBg.fillRoundedRect(toggleX, y + 10, 44, 24, 12);

    const knobX = isOn ? toggleX + 28 : toggleX + 16;
    const knob = this.add.circle(knobX, y + 22, 9, 0xffffff);

    const hitArea = this.add.rectangle(toggleX + 22, y + 22, 50, 30)
      .setAlpha(0.001).setInteractive({ useHandCursor: true });

    hitArea.on('pointerdown', () => {
      const newVal = !isOn;
      const data = SaveManager.load();
      if (!data.settings) data.settings = {};
      data.settings[setting.key] = newVal;
      SaveManager.save(data);
      this.scene.restart();
    });
  }

  createAccountInfo() {
    const y = 600;

    this.add.text(30, y, '계정 정보', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '20px',
      fontStyle: 'bold', color: '#F8FAFC'
    });

    const data = SaveManager.load();
    const player = data.player || {};
    const charCount = Object.keys(data.characters || {}).length;

    const infoItems = [
      `레벨: ${player.level || 1}`,
      `보유 캐릭터: ${charCount}명`,
      `스테이지 클리어: ${Object.keys(data.progress?.clearedStages || {}).length}`,
      `버전: 1.0.0-beta`
    ];

    infoItems.forEach((text, i) => {
      this.add.text(40, y + 35 + i * 28, text, {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '15px', color: '#94A3B8'
      });
    });

    // 데이터 초기화 버튼
    const resetY = y + 35 + infoItems.length * 28 + 20;
    const resetBtn = this.add.graphics();
    resetBtn.fillStyle(0x334155, 1);
    resetBtn.fillRoundedRect(30, resetY, 180, 40, 10);

    this.add.text(120, resetY + 20, '🗑️ 데이터 초기화', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '14px', color: '#EF4444'
    }).setOrigin(0.5);

    const resetHit = this.add.rectangle(120, resetY + 20, 180, 40)
      .setAlpha(0.001).setInteractive({ useHandCursor: true });

    resetHit.on('pointerdown', () => {
      this.showResetConfirm();
    });
  }

  showCouponModal() {
    const elements = [];

    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setDepth(5000).setInteractive();
    elements.push(overlay);

    const modal = this.add.graphics().setDepth(5001);
    modal.fillStyle(0x1E293B, 1);
    modal.fillRoundedRect(GAME_WIDTH / 2 - 160, GAME_HEIGHT / 2 - 100, 320, 200, 16);
    modal.lineStyle(2, COLORS.primary, 0.5);
    modal.strokeRoundedRect(GAME_WIDTH / 2 - 160, GAME_HEIGHT / 2 - 100, 320, 200, 16);
    elements.push(modal);

    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 75, '쿠폰 입력', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '20px',
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5).setDepth(5002);
    elements.push(title);

    // HTML DOM input 요소 (Phaser canvas 위에 오버레이)
    const canvas = this.game.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.game.config.width;
    const scaleY = canvasRect.height / this.game.config.height;

    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.placeholder = '쿠폰 코드를 입력하세요';
    inputEl.maxLength = 20;
    inputEl.style.cssText = `
      position: fixed;
      left: ${canvasRect.left + (GAME_WIDTH / 2 - 130) * scaleX}px;
      top: ${canvasRect.top + (GAME_HEIGHT / 2 - 35) * scaleY}px;
      width: ${260 * scaleX}px;
      height: ${40 * scaleY}px;
      font-size: ${14 * Math.min(scaleX, scaleY)}px;
      font-family: "Noto Sans KR", sans-serif;
      text-align: center;
      background: #0F172A;
      color: #F8FAFC;
      border: 1px solid #6366F1;
      border-radius: 8px;
      padding: 0 12px;
      outline: none;
      z-index: 10000;
      text-transform: uppercase;
    `;
    document.body.appendChild(inputEl);
    inputEl.focus();

    const submitBtn = this.add.graphics().setDepth(5002);
    submitBtn.fillStyle(COLORS.primary, 1);
    submitBtn.fillRoundedRect(GAME_WIDTH / 2 - 60, GAME_HEIGHT / 2 + 20, 120, 40, 10);
    elements.push(submitBtn);

    const submitLabel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, '적용', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(5003);
    elements.push(submitLabel);

    const submitHit = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 120, 40)
      .setAlpha(0.001).setDepth(5004).setInteractive({ useHandCursor: true });
    elements.push(submitHit);

    const redeemCoupon = () => {
      const code = inputEl.value.trim();
      if (!code) {
        this.showToast('쿠폰 코드를 입력하세요');
        return;
      }
      try {
        const result = CouponSystem.redeemCoupon(code);
        if (result.success) {
          const formatted = CouponSystem.formatRewards(result.rewards);
          this.showToast(`🎁 쿠폰 적용! ${formatted}`);
        } else {
          this.showToast(result.error || '유효하지 않은 쿠폰입니다');
        }
      } catch {
        this.showToast('쿠폰 시스템 오류');
      }
      inputEl.remove();
      elements.forEach(e => e.destroy());
    };

    submitHit.on('pointerdown', redeemCoupon);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') redeemCoupon();
    });

    // 닫기
    const closeLabel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 75, '닫기', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '14px', color: '#94A3B8'
    }).setOrigin(0.5).setDepth(5003).setInteractive({ useHandCursor: true });
    elements.push(closeLabel);

    closeLabel.on('pointerdown', () => {
      inputEl.remove();
      elements.forEach(e => e.destroy());
    });
  }

  showResetConfirm() {
    const elements = [];

    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setDepth(5000).setInteractive();
    elements.push(overlay);

    const dialog = this.add.graphics().setDepth(5001);
    dialog.fillStyle(0x1E293B, 1);
    dialog.fillRoundedRect(GAME_WIDTH / 2 - 160, GAME_HEIGHT / 2 - 80, 320, 160, 16);
    elements.push(dialog);

    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 35,
      '모든 데이터가 삭제됩니다.\n정말 초기화하시겠습니까?', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px',
        color: '#F8FAFC', align: 'center'
      }).setOrigin(0.5).setDepth(5002);
    elements.push(msg);

    const confirmBg = this.add.rectangle(GAME_WIDTH / 2 - 75, GAME_HEIGHT / 2 + 35, 120, 40, 0xEF4444)
      .setDepth(5002).setInteractive({ useHandCursor: true });
    elements.push(confirmBg);
    const confirmLabel = this.add.text(GAME_WIDTH / 2 - 75, GAME_HEIGHT / 2 + 35, '초기화', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(5003);
    elements.push(confirmLabel);

    confirmBg.on('pointerdown', () => {
      localStorage.removeItem('arcane_collectors_save');
      location.reload();
    });

    const cancelBg = this.add.rectangle(GAME_WIDTH / 2 + 75, GAME_HEIGHT / 2 + 35, 120, 40, 0x475569)
      .setDepth(5002).setInteractive({ useHandCursor: true });
    elements.push(cancelBg);
    const cancelLabel = this.add.text(GAME_WIDTH / 2 + 75, GAME_HEIGHT / 2 + 35, '취소', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px', color: '#94A3B8'
    }).setOrigin(0.5).setDepth(5003);
    elements.push(cancelLabel);

    cancelBg.on('pointerdown', () => {
      elements.forEach(e => e.destroy());
    });
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 200, message, {
      fontSize: '16px', fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF', backgroundColor: '#334155', padding: { x: 20, y: 12 }
    }).setOrigin(0.5).setDepth(6000);

    this.tweens.add({
      targets: toast, y: toast.y - 50, alpha: 0,
      duration: 1500, delay: 800, onComplete: () => toast.destroy()
    });
  }
}
