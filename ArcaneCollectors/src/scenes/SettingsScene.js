/**
 * SettingsScene - 더보기 / 설정 메뉴
 * 서브메뉴 (퀘스트/탑/설정), 사운드 토글, 쿠폰 입력, 계정 정보
 */
import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
import { CouponSystem } from '../systems/CouponSystem.js';
import transitionManager from '../utils/TransitionManager.js';
import navigationManager from '../systems/NavigationManager.js';

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
    } catch (error) {
      console.error('[SettingsScene] create() 실패:', error);
      this.add.text(s(360), s(640), '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
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
    // DESIGN_SYSTEM: TopBar s(80), 구분선 alpha 0.3
    const bar = this.add.graphics();
    bar.fillStyle(0x0F172A, 0.95);
    bar.fillRect(0, 0, GAME_WIDTH, s(80));
    bar.lineStyle(s(2), COLORS.primary, 0.3);
    bar.lineBetween(0, s(80), GAME_WIDTH, s(80));

    // Back button (최소 터치 s(50)×s(44))
    const backBg = this.add.rectangle(s(30), s(40), s(50), s(44), 0x0F172A, 0.8)
      .setInteractive({ useHandCursor: true });
    this.add.text(s(30), s(40), '← 뒤로', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14), color: '#94A3B8'
    }).setOrigin(0.5);
    backBg.on('pointerdown', () => {
      navigationManager.goBack(this);
    });

    this.add.text(GAME_WIDTH / 2, s(40), '더보기', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(24),
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);
  }

  createMenuGrid() {
    const startY = s(100); // DESIGN_SYSTEM: TopBar s(80) + 간격 s(20)
    const cols = 3;
    const cellW = (GAME_WIDTH - s(60)) / cols;
    const cellH = s(100);
    const gap = s(10);

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
      const x = s(30) + col * (cellW + gap);
      const y = startY + row * (cellH + gap);

      const cell = this.add.graphics();
      cell.fillStyle(0x1E293B, 1);
      cell.fillRoundedRect(x, y, cellW, cellH, s(12));

      this.add.text(x + cellW / 2, y + s(30), menu.icon, {
        fontSize: sf(32)
      }).setOrigin(0.5);

      this.add.text(x + cellW / 2, y + s(70), menu.label, {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14),
        fontStyle: 'bold', color: '#F8FAFC'
      }).setOrigin(0.5);

      const hitArea = this.add.rectangle(x + cellW / 2, y + cellH / 2, cellW, cellH)
        .setAlpha(0.001).setInteractive({ useHandCursor: true });

      hitArea.on('pointerover', () => cell.clear().fillStyle(0x334155, 1).fillRoundedRect(x, y, cellW, cellH, s(12)));
      hitArea.on('pointerout', () => cell.clear().fillStyle(0x1E293B, 1).fillRoundedRect(x, y, cellW, cellH, s(12)));

      hitArea.on('pointerdown', () => {
        if (menu.action === 'coupon') {
          this.showCouponModal();
        } else if (menu.scene) {
          transitionManager.fadeTransition(this, menu.scene);
        }
      });
    });
  }

  createSettingsSection() {
    const sectionY = s(320);

    this.add.text(s(30), sectionY, '설정', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(20),
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
      const y = sectionY + s(45) + i * s(55);
      this.createSettingRow(setting, y, settingsData);
    });
  }

  createSettingRow(setting, y, settingsData) {
    const rowBg = this.add.graphics();
    rowBg.fillStyle(0x1E293B, 0.8);
    rowBg.fillRoundedRect(s(20), y, GAME_WIDTH - s(40), s(45), s(10));

    this.add.text(s(40), y + s(12), setting.label, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16), color: '#F8FAFC'
    });

    const isOn = settingsData[setting.key] !== false;

    // 토글
    const toggleX = GAME_WIDTH - s(70);
    const toggleBg = this.add.graphics();
    const toggleColor = isOn ? COLORS.success : 0x475569;
    toggleBg.fillStyle(toggleColor, 1);
    toggleBg.fillRoundedRect(toggleX, y + s(10), s(44), s(24), s(12));

    const knobX = isOn ? toggleX + s(28) : toggleX + s(16);
    const knob = this.add.circle(knobX, y + s(22), s(9), 0xffffff);

    // DESIGN_SYSTEM: 최소 터치 영역 s(44) x s(44)
    const hitArea = this.add.rectangle(toggleX + s(22), y + s(22), s(50), s(44))
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
    const y = s(580);

    this.add.text(s(30), y, '계정 정보', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(20),
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
      this.add.text(s(40), y + s(35) + i * s(28), text, {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15), color: '#94A3B8'
      });
    });

    // 데이터 초기화 버튼
    const resetY = y + s(35) + infoItems.length * s(28) + s(20);
    const resetBtn = this.add.graphics();
    resetBtn.fillStyle(0x334155, 1);
    resetBtn.fillRoundedRect(s(30), resetY, s(180), s(40), s(10));

    this.add.text(s(120), resetY + s(20), '🗑️ 데이터 초기화', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14), color: '#EF4444'
    }).setOrigin(0.5);

    const resetHit = this.add.rectangle(s(120), resetY + s(20), s(180), s(40))
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
    modal.fillRoundedRect(GAME_WIDTH / 2 - s(160), GAME_HEIGHT / 2 - s(100), s(320), s(200), s(16));
    modal.lineStyle(s(2), COLORS.primary, 0.5);
    modal.strokeRoundedRect(GAME_WIDTH / 2 - s(160), GAME_HEIGHT / 2 - s(100), s(320), s(200), s(16));
    elements.push(modal);

    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(75), '쿠폰 입력', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(20),
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
      left: ${canvasRect.left + (GAME_WIDTH / 2 - s(130)) * scaleX}px;
      top: ${canvasRect.top + (GAME_HEIGHT / 2 - s(35)) * scaleY}px;
      width: ${s(260) * scaleX}px;
      height: ${s(40) * scaleY}px;
      font-size: ${s(14) * Math.min(scaleX, scaleY)}px;
      font-family: "Noto Sans KR", sans-serif;
      text-align: center;
      background: #0F172A;
      color: #F8FAFC;
      border: 1px solid #6366F1;
      border-radius: ${s(8)}px;
      padding: 0 ${s(12)}px;
      outline: none;
      z-index: 10000;
      text-transform: uppercase;
    `;
    document.body.appendChild(inputEl);
    inputEl.focus();

    const submitBtn = this.add.graphics().setDepth(5002);
    submitBtn.fillStyle(COLORS.primary, 1);
    submitBtn.fillRoundedRect(GAME_WIDTH / 2 - s(60), GAME_HEIGHT / 2 + s(20), s(120), s(40), s(10));
    elements.push(submitBtn);

    const submitLabel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(40), '적용', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(5003);
    elements.push(submitLabel);

    const submitHit = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(40), s(120), s(40))
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
    const closeLabel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(75), '닫기', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14), color: '#94A3B8'
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
    dialog.fillRoundedRect(GAME_WIDTH / 2 - s(160), GAME_HEIGHT / 2 - s(80), s(320), s(160), s(16));
    elements.push(dialog);

    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(35),
      '모든 데이터가 삭제됩니다.\n정말 초기화하시겠습니까?', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
        color: '#F8FAFC', align: 'center'
      }).setOrigin(0.5).setDepth(5002);
    elements.push(msg);

    const confirmBg = this.add.rectangle(GAME_WIDTH / 2 - s(75), GAME_HEIGHT / 2 + s(35), s(120), s(40), 0xEF4444)
      .setDepth(5002).setInteractive({ useHandCursor: true });
    elements.push(confirmBg);
    const confirmLabel = this.add.text(GAME_WIDTH / 2 - s(75), GAME_HEIGHT / 2 + s(35), '초기화', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(5003);
    elements.push(confirmLabel);

    confirmBg.on('pointerdown', () => {
      localStorage.removeItem('arcane_collectors_save');
      location.reload();
    });

    const cancelBg = this.add.rectangle(GAME_WIDTH / 2 + s(75), GAME_HEIGHT / 2 + s(35), s(120), s(40), 0x475569)
      .setDepth(5002).setInteractive({ useHandCursor: true });
    elements.push(cancelBg);
    const cancelLabel = this.add.text(GAME_WIDTH / 2 + s(75), GAME_HEIGHT / 2 + s(35), '취소', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16), color: '#94A3B8'
    }).setOrigin(0.5).setDepth(5003);
    elements.push(cancelLabel);

    cancelBg.on('pointerdown', () => {
      elements.forEach(e => e.destroy());
    });
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(200), message, {
      fontSize: sf(16), fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF', backgroundColor: '#334155', padding: { x: s(20), y: s(12) }
    }).setOrigin(0.5).setDepth(6000);

    this.tweens.add({
      targets: toast, y: toast.y - s(50), alpha: 0,
      duration: 1500, delay: 800, onComplete: () => toast.destroy()
    });
  }
}
