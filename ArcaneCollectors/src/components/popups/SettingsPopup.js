/**
 * SettingsPopup - 설정 팝업
 * SettingsScene 로직을 팝업 형태로 변환 (퀵 네비게이션 제거)
 */
import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf, GAME_WIDTH, GAME_HEIGHT } from '../../config/gameConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { CouponSystem } from '../../systems/CouponSystem.js';

export class SettingsPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '설정',
      width: s(680),
      height: s(900),
      ...options
    });

    this.couponInput = null;
  }

  buildContent() {
    this.createSettingsSection();
    this.createAccountManagement(); // AUTH-1.2: 계정 관리 섹션
    this.createAccountInfo();
  }

  createSettingsSection() {
    const { left, top, width } = this.contentBounds;
    const sectionY = top;

    this.addText(left + s(10), sectionY, '설정', {
      fontSize: sf(20),
      fontStyle: 'bold',
      color: '#F8FAFC'
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
    const { left, width } = this.contentBounds;

    const rowBg = this.scene.add.graphics();
    rowBg.fillStyle(0x1E293B, 0.8);
    rowBg.fillRoundedRect(left, y, width, s(45), s(10));
    this.contentContainer.add(rowBg);

    this.addText(left + s(20), y + s(12), setting.label, {
      fontSize: sf(16),
      color: '#F8FAFC'
    });

    const isOn = settingsData[setting.key] !== false;

    // Toggle
    const toggleX = left + width - s(50);
    const toggleBg = this.scene.add.graphics();
    const toggleColor = isOn ? COLORS.success : 0x475569;
    toggleBg.fillStyle(toggleColor, 1);
    toggleBg.fillRoundedRect(toggleX, y + s(10), s(44), s(24), s(12));
    this.contentContainer.add(toggleBg);

    const knobX = isOn ? toggleX + s(28) : toggleX + s(16);
    const knob = this.scene.add.circle(knobX, y + s(22), s(9), 0xffffff);
    this.contentContainer.add(knob);

    const hitArea = this.scene.add.rectangle(toggleX + s(22), y + s(22), s(50), s(30))
      .setAlpha(0.001).setInteractive({ useHandCursor: true });
    this.contentContainer.add(hitArea);

    hitArea.on('pointerdown', () => {
      const newVal = !isOn;
      const data = SaveManager.load();
      if (!data.settings) data.settings = {};
      data.settings[setting.key] = newVal;
      SaveManager.save(data);
      this.refresh();
    });
  }

  /**
   * AUTH-1.2: 계정 관리 섹션 생성
   */
  createAccountManagement() {
    const { left, top, width } = this.contentBounds;
    const y = top + s(280);

    this.addText(left + s(10), y, '계정 관리', {
      fontSize: sf(20),
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    // 현재 로그인 정보 표시
    const authData = this._loadAutoLoginData();
    const currentAccountText = this._getAccountDisplayText(authData);

    const accountInfoBg = this.scene.add.graphics();
    accountInfoBg.fillStyle(0x1E293B, 0.8);
    accountInfoBg.fillRoundedRect(left, y + s(35), width, s(50), s(10));
    this.contentContainer.add(accountInfoBg);

    this.addText(left + s(20), y + s(47), '현재 계정:', {
      fontSize: sf(14),
      color: '#94A3B8'
    });

    this.addText(left + s(20), y + s(67), currentAccountText, {
      fontSize: sf(15),
      color: '#F8FAFC',
      fontStyle: 'bold'
    });

    // 계정 변경 버튼
    const changeBtnY = y + s(100);
    const changeBtn = this.scene.add.graphics();
    changeBtn.fillStyle(0xEF4444, 1);
    changeBtn.fillRoundedRect(left + s(10), changeBtnY, s(200), s(40), s(10));
    this.contentContainer.add(changeBtn);

    this.addText(left + s(110), changeBtnY + s(20), '🔄 계정 변경', {
      fontSize: sf(14),
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);

    const changeHit = this.scene.add.rectangle(left + s(110), changeBtnY + s(20), s(200), s(40))
      .setAlpha(0.001).setInteractive({ useHandCursor: true });
    this.contentContainer.add(changeHit);

    changeHit.on('pointerdown', () => {
      this.showAccountChangeConfirm();
    });
  }

  /**
   * AUTH-1.2: 자동로그인 데이터 로드
   */
  _loadAutoLoginData() {
    try {
      const data = localStorage.getItem('arcane_auth');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * AUTH-1.2: 계정 정보 표시 텍스트 생성
   */
  _getAccountDisplayText(authData) {
    if (!authData) {
      return '자동 로그인 미설정';
    }

    if (authData.authType === 'guest') {
      const shortId = authData.userId ? authData.userId.substring(0, 20) : 'unknown';
      return `게스트: ${shortId}...`;
    } else if (authData.authType === 'email' && authData.email) {
      return `이메일: ${authData.email}`;
    }

    return '알 수 없는 계정';
  }

  /**
   * AUTH-1.2: 계정 변경 확인 모달
   */
  showAccountChangeConfirm() {
    const elements = [];
    const { centerX } = this.contentBounds;
    const dialogY = s(500);

    const overlay = this.scene.add.rectangle(centerX, dialogY,
      this.contentBounds.width + s(30), s(200), 0x000000, 0.7).setDepth(3000).setInteractive();
    elements.push(overlay);

    const dialog = this.scene.add.graphics().setDepth(3001);
    dialog.fillStyle(0x1E293B, 1);
    dialog.fillRoundedRect(centerX - s(180), dialogY - s(100), s(360), s(200), s(16));
    dialog.lineStyle(s(2), 0xEF4444, 0.5);
    dialog.strokeRoundedRect(centerX - s(180), dialogY - s(100), s(360), s(200), s(16));
    elements.push(dialog);

    const msg = this.scene.add.text(centerX, dialogY - s(50),
      '계정을 변경하시겠습니까?\n\n로그인 화면으로 이동하며,\n현재 데이터는 저장됩니다.', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15),
        color: '#F8FAFC', align: 'center'
      }).setOrigin(0.5).setDepth(3002);
    elements.push(msg);

    const confirmBg = this.scene.add.rectangle(centerX - s(85), dialogY + s(55), s(140), s(40), 0xEF4444)
      .setDepth(3002).setInteractive({ useHandCursor: true });
    elements.push(confirmBg);
    const confirmLabel = this.scene.add.text(centerX - s(85), dialogY + s(55), '변경', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(3003);
    elements.push(confirmLabel);

    confirmBg.on('pointerdown', () => {
      // 자동로그인 정보 삭제
      localStorage.removeItem('arcane_auth');

      // Registry 초기화
      this.scene.scene.registry.destroy();
      this.scene.scene.registry.events.off();

      // LoginScene으로 이동
      elements.forEach(e => e.destroy());
      this.destroy();
      this.scene.scene.start('LoginScene');
    });

    const cancelBg = this.scene.add.rectangle(centerX + s(85), dialogY + s(55), s(140), s(40), 0x475569)
      .setDepth(3002).setInteractive({ useHandCursor: true });
    elements.push(cancelBg);
    const cancelLabel = this.scene.add.text(centerX + s(85), dialogY + s(55), '취소', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16), color: '#94A3B8'
    }).setOrigin(0.5).setDepth(3003);
    elements.push(cancelLabel);

    cancelBg.on('pointerdown', () => {
      elements.forEach(e => e.destroy());
    });
  }

  createAccountInfo() {
    const { left, top, width } = this.contentBounds;
    const y = top + s(460); // AUTH-1.2: Y 위치 조정 (계정 관리 섹션 아래로)

    this.addText(left + s(10), y, '계정 정보', {
      fontSize: sf(20),
      fontStyle: 'bold',
      color: '#F8FAFC'
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
      this.addText(left + s(20), y + s(35) + i * s(28), text, {
        fontSize: sf(15),
        color: '#94A3B8'
      });
    });

    // Coupon button
    const couponY = y + s(35) + infoItems.length * s(28) + s(15);
    const couponBtn = this.scene.add.graphics();
    couponBtn.fillStyle(COLORS.primary, 1);
    couponBtn.fillRoundedRect(left + s(10), couponY, s(180), s(40), s(10));
    this.contentContainer.add(couponBtn);

    this.addText(left + s(100), couponY + s(20), '🎫 쿠폰 입력', {
      fontSize: sf(14),
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);

    const couponHit = this.scene.add.rectangle(left + s(100), couponY + s(20), s(180), s(40))
      .setAlpha(0.001).setInteractive({ useHandCursor: true });
    this.contentContainer.add(couponHit);

    couponHit.on('pointerdown', () => {
      this.showCouponModal();
    });

    // Data reset button
    const resetY = couponY + s(50);
    const resetBtn = this.scene.add.graphics();
    resetBtn.fillStyle(0x334155, 1);
    resetBtn.fillRoundedRect(left + s(10), resetY, s(180), s(40), s(10));
    this.contentContainer.add(resetBtn);

    this.addText(left + s(100), resetY + s(20), '🗑️ 데이터 초기화', {
      fontSize: sf(14),
      color: '#EF4444'
    }).setOrigin(0.5);

    const resetHit = this.scene.add.rectangle(left + s(100), resetY + s(20), s(180), s(40))
      .setAlpha(0.001).setInteractive({ useHandCursor: true });
    this.contentContainer.add(resetHit);

    resetHit.on('pointerdown', () => {
      this.showResetConfirm();
    });
  }

  showCouponModal() {
    const elements = [];
    const { centerX } = this.contentBounds;
    const modalY = s(500);

    const overlay = this.scene.add.rectangle(centerX, modalY,
      this.contentBounds.width + s(30), s(200), 0x000000, 0.7).setDepth(3000).setInteractive();
    elements.push(overlay);

    const modal = this.scene.add.graphics().setDepth(3001);
    modal.fillStyle(0x1E293B, 1);
    modal.fillRoundedRect(centerX - s(160), modalY - s(100), s(320), s(200), s(16));
    modal.lineStyle(s(2), COLORS.primary, 0.5);
    modal.strokeRoundedRect(centerX - s(160), modalY - s(100), s(320), s(200), s(16));
    elements.push(modal);

    const title = this.scene.add.text(centerX, modalY - s(75), '쿠폰 입력', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(20),
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5).setDepth(3002);
    elements.push(title);

    // HTML DOM input
    const canvas = this.scene.game.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.scene.game.config.width;
    const scaleY = canvasRect.height / this.scene.game.config.height;

    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.placeholder = '쿠폰 코드를 입력하세요';
    inputEl.maxLength = 20;
    inputEl.style.cssText = `
      position: fixed;
      left: ${canvasRect.left + (centerX - s(130)) * scaleX}px;
      top: ${canvasRect.top + (modalY - s(35)) * scaleY}px;
      width: ${s(260) * scaleX}px;
      height: ${s(40) * scaleY}px;
      font-size: ${s(14) * Math.min(scaleX, scaleY)}px;
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
    this.couponInput = inputEl;

    const submitBtn = this.scene.add.graphics().setDepth(3002);
    submitBtn.fillStyle(COLORS.primary, 1);
    submitBtn.fillRoundedRect(centerX - s(60), modalY + s(20), s(120), s(40), s(10));
    elements.push(submitBtn);

    const submitLabel = this.scene.add.text(centerX, modalY + s(40), '적용', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(3003);
    elements.push(submitLabel);

    const submitHit = this.scene.add.rectangle(centerX, modalY + s(40), s(120), s(40))
      .setAlpha(0.001).setDepth(3004).setInteractive({ useHandCursor: true });
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
      this.couponInput = null;
      elements.forEach(e => e.destroy());
    };

    submitHit.on('pointerdown', redeemCoupon);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') redeemCoupon();
    });

    // Close
    const closeLabel = this.scene.add.text(centerX, modalY + s(75), '닫기', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14), color: '#94A3B8'
    }).setOrigin(0.5).setDepth(3003).setInteractive({ useHandCursor: true });
    elements.push(closeLabel);

    closeLabel.on('pointerdown', () => {
      inputEl.remove();
      this.couponInput = null;
      elements.forEach(e => e.destroy());
    });
  }

  showResetConfirm() {
    const elements = [];
    const { centerX } = this.contentBounds;
    const dialogY = s(500);

    const overlay = this.scene.add.rectangle(centerX, dialogY,
      this.contentBounds.width + s(30), s(160), 0x000000, 0.7).setDepth(3000).setInteractive();
    elements.push(overlay);

    const dialog = this.scene.add.graphics().setDepth(3001);
    dialog.fillStyle(0x1E293B, 1);
    dialog.fillRoundedRect(centerX - s(160), dialogY - s(80), s(320), s(160), s(16));
    elements.push(dialog);

    const msg = this.scene.add.text(centerX, dialogY - s(35),
      '모든 데이터가 삭제됩니다.\n정말 초기화하시겠습니까?', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
        color: '#F8FAFC', align: 'center'
      }).setOrigin(0.5).setDepth(3002);
    elements.push(msg);

    const confirmBg = this.scene.add.rectangle(centerX - s(75), dialogY + s(35), s(120), s(40), 0xEF4444)
      .setDepth(3002).setInteractive({ useHandCursor: true });
    elements.push(confirmBg);
    const confirmLabel = this.scene.add.text(centerX - s(75), dialogY + s(35), '초기화', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(3003);
    elements.push(confirmLabel);

    confirmBg.on('pointerdown', () => {
      localStorage.removeItem('arcane_collectors_save');
      location.reload();
    });

    const cancelBg = this.scene.add.rectangle(centerX + s(75), dialogY + s(35), s(120), s(40), 0x475569)
      .setDepth(3002).setInteractive({ useHandCursor: true });
    elements.push(cancelBg);
    const cancelLabel = this.scene.add.text(centerX + s(75), dialogY + s(35), '취소', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16), color: '#94A3B8'
    }).setOrigin(0.5).setDepth(3003);
    elements.push(cancelLabel);

    cancelBg.on('pointerdown', () => {
      elements.forEach(e => e.destroy());
    });
  }

  showToast(message) {
    const { centerX, top } = this.contentBounds;
    const toast = this.scene.add.text(centerX, top + s(200), message, {
      fontSize: sf(16), fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF', backgroundColor: '#334155', padding: { x: s(20), y: s(12) }
    }).setOrigin(0.5).setDepth(4000);

    this.scene.tweens.add({
      targets: toast, y: toast.y - s(50), alpha: 0,
      duration: 1500, delay: 800, onComplete: () => toast.destroy()
    });
  }

  refresh() {
    // Clear current content
    this.contentContainer.removeAll(true);

    // Rebuild content
    this.buildContent();
  }

  destroy() {
    // Clean up HTML input if exists
    if (this.couponInput) {
      this.couponInput.remove();
      this.couponInput = null;
    }
    super.destroy();
  }
}
