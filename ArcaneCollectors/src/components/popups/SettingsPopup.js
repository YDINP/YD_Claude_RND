/**
 * SettingsPopup - 설정 팝업
 * SettingsScene 로직을 팝업 형태로 변환 (퀵 네비게이션 제거)
 */
import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf, GAME_WIDTH, GAME_HEIGHT } from '../../config/gameConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { CouponSystem } from '../../systems/CouponSystem.js';
import { DebugManager } from '../../systems/DebugManager.js';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';
import { soundManager } from '../../systems/SoundManager.js';

/** 헤더 타이틀 */
const TITLE = '설정';

/** 설정 행 높이 · 간격 (기획 px) */
const ROW_HEIGHT = 45;
const ROW_GAP = 10;

/** 음량 슬라이더 트랙 기하 (기획 px) */
const SLIDER = {
  labelWidth: 78,
  trailingGap: 66,
  trackHeight: 6,
  knobRadius: 9
};

export class SettingsPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.brand.primary,
      ...options
    });

    this.couponInput = null;
  }

  buildContent() {
    this.setTitle(TITLE);
    this.applySummary();
    this.applyActions();

    this.createSettingsSection();
    this.createDebugToggle();
    this.createAccountManagement(); // AUTH-1.2: 계정 관리 섹션
    this.createAccountInfo();
  }

  /** 슬롯 2 — 계정 요약 */
  applySummary() {
    const data = SaveManager.load();
    const player = data.player || {};
    const charCount = Object.keys(data.characters || {}).length;
    this.setSummary([
      { label: '레벨', value: `${player.level || 1}` },
      { label: '보유 캐릭터', value: `${charCount}명` },
      { label: '계정', value: this._getAccountShortText() }
    ]);
  }

  /** 슬롯 4 — 쿠폰 / 계정 변경 / 데이터 초기화. 모달을 여는 콜백은 한 프레임 미룬다 */
  applyActions() {
    const defer = (fn) => this.scene.time.delayedCall(0, fn);
    this.setActions([
      { label: '쿠폰 입력', variant: 'primary', onClick: () => defer(() => this.showCouponModal()) },
      { label: '계정 변경', variant: 'secondary', onClick: () => defer(() => this.showAccountChangeConfirm()) },
      { label: '데이터 초기화', variant: 'ghost', onClick: () => defer(() => this.showResetConfirm()) }
    ]);
  }

  /** 요약 슬롯용 짧은 계정 표기 */
  _getAccountShortText() {
    const authData = this._loadAutoLoginData();
    if (!authData) return '게스트';
    if (authData.authType === 'email' && authData.email) return authData.email.split('@')[0];
    return '게스트';
  }

  createSettingsSection() {
    const { top } = this.contentBounds;
    const rowY = (i) => top + i * s(ROW_HEIGHT + ROW_GAP);

    const data = SaveManager.load();
    const settingsData = data.settings || {};

    // SND-01: 음량 슬라이더 2행 — 값은 soundManager 가 SaveManager settings.audio 에 저장한다
    this.createVolumeRow({
      label: 'BGM',
      getVolume: () => soundManager.getSettings().bgm,
      setVolume: (v) => soundManager.setBGMVolume(v),
      isMuted: () => soundManager.getSettings().bgmMuted,
      toggleMute: () => soundManager.toggleBGMMute()
    }, rowY(0));

    this.createVolumeRow({
      label: '효과음',
      getVolume: () => soundManager.getSettings().sfx,
      setVolume: (v) => soundManager.setSFXVolume(v),
      isMuted: () => soundManager.getSettings().sfxMuted,
      toggleMute: () => soundManager.toggleSFXMute()
    }, rowY(1));

    // 기존 온오프 설정 2행 (행 수는 4로 유지 — 아래 섹션 좌표가 이 값에 묶여 있다)
    [
      { label: '진동', key: 'vibration', type: 'toggle' },
      { label: '알림', key: 'notification', type: 'toggle' }
    ].forEach((setting, i) => {
      this.createSettingRow(setting, rowY(2 + i), settingsData);
    });
  }

  /**
   * SND-01: 음량 행 — 라벨 + 드래그 슬라이더 + 음소거 토글.
   * 값 변경은 soundManager 를 통해 즉시 반영·저장되고, 이 행은 그래픽만 다시 그린다
   * (팝업 전체 refresh 를 하면 드래그 중 히트영역이 사라진다).
   * @param {{label:string,getVolume:Function,setVolume:Function,isMuted:Function,toggleMute:Function}} cfg
   * @param {number} y 행 상단 y
   */
  createVolumeRow(cfg, y) {
    const { left, width } = this.contentBounds;

    const rowBg = this.scene.add.graphics();
    rowBg.fillStyle(DESIGN.colors.bg.secondary, 0.8);
    rowBg.fillRoundedRect(left, y, width, s(ROW_HEIGHT), s(DESIGN.radius.md));
    this.contentContainer.add(rowBg);

    this.addText(left + s(20), y + s(12), cfg.label, {
      fontSize: sf(15),
      color: DESIGN.colors.text.primary
    });

    const trackX = left + s(SLIDER.labelWidth);
    const trackW = Math.max(s(40), width - s(SLIDER.labelWidth) - s(SLIDER.trailingGap));
    const trackY = y + s(ROW_HEIGHT / 2) - s(SLIDER.trackHeight / 2);
    const centerY = y + s(ROW_HEIGHT / 2);

    const track = this.scene.add.graphics();
    this.contentContainer.add(track);
    const knob = this.scene.add.circle(trackX, centerY, s(SLIDER.knobRadius), 0xffffff);
    this.contentContainer.add(knob);
    const percent = this.scene.add.text(0, 0, '', {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: sf(12),
      color: DESIGN.colors.text.secondary
    }).setOrigin(0.5);
    this.contentContainer.add(percent);

    const muteX = left + width - s(38);
    const muteIcon = this.scene.add.text(muteX, centerY, '', { fontSize: sf(18) }).setOrigin(0.5);
    this.contentContainer.add(muteIcon);

    const redraw = () => {
      const value = cfg.getVolume();
      const muted = cfg.isMuted();
      const knobX = trackX + trackW * value;

      track.clear();
      track.fillStyle(DESIGN.colors.bg.surface, 1);
      track.fillRoundedRect(trackX, trackY, trackW, s(SLIDER.trackHeight), s(SLIDER.trackHeight / 2));
      track.fillStyle(muted ? DESIGN.colors.bg.surface : DESIGN.colors.brand.primary, 1);
      track.fillRoundedRect(trackX, trackY, Math.max(1, trackW * value), s(SLIDER.trackHeight), s(SLIDER.trackHeight / 2));

      knob.setPosition(knobX, centerY);
      knob.setFillStyle(muted ? 0x64748B : 0xffffff);
      percent.setPosition(knobX, centerY - s(16));
      percent.setText(`${Math.round(value * 100)}`);
      muteIcon.setText(muted ? '🔇' : '🔊');
    };

    const applyFromPointer = (pointer) => {
      const ratio = (pointer.x - trackX) / trackW;
      cfg.setVolume(Math.max(0, Math.min(1, ratio)));
      redraw();
    };

    const hit = this.scene.add.rectangle(
      trackX + trackW / 2, centerY, trackW + s(2 * SLIDER.knobRadius), s(DESIGN.touch.minTarget)
    ).setAlpha(0.001).setInteractive({ useHandCursor: true });
    this.contentContainer.add(hit);
    hit.on('pointerdown', applyFromPointer);
    hit.on('pointermove', (pointer) => { if (pointer.isDown) applyFromPointer(pointer); });

    const muteHit = this.scene.add.rectangle(muteX, centerY, s(DESIGN.touch.minTarget), s(DESIGN.touch.minTarget))
      .setAlpha(0.001).setInteractive({ useHandCursor: true });
    this.contentContainer.add(muteHit);
    muteHit.on('pointerdown', () => {
      cfg.toggleMute();
      redraw();
    });

    redraw();
  }

  /**
   * BUG-10: 개발자 모드(치트패널) 토글
   */
  createDebugToggle() {
    const { left, top, width } = this.contentBounds;
    const y = top + 4 * s(ROW_HEIGHT + ROW_GAP); // 4개 설정 행 아래

    const rowBg = this.scene.add.graphics();
    rowBg.fillStyle(DESIGN.colors.bg.secondary, 0.8);
    rowBg.fillRoundedRect(left, y, width, s(ROW_HEIGHT), s(DESIGN.radius.md));
    this.contentContainer.add(rowBg);

    this.addText(left + s(20), y + s(12), '개발자 모드', {
      fontSize: sf(16),
      color: hexToCSS(DESIGN.colors.status.warning)
    });

    const isOn = DebugManager.isDebugMode;
    const toggleX = left + width - s(50);
    const toggleBg = this.scene.add.graphics();
    toggleBg.fillStyle(isOn ? 0xF59E0B : DESIGN.colors.bg.surface, 1);
    toggleBg.fillRoundedRect(toggleX, y + s(10), s(44), s(24), s(12));
    this.contentContainer.add(toggleBg);

    const knobX = isOn ? toggleX + s(28) : toggleX + s(16);
    const knob = this.scene.add.circle(knobX, y + s(22), s(9), 0xffffff);
    this.contentContainer.add(knob);

    const hitArea = this.scene.add.rectangle(toggleX + s(22), y + s(22), s(50), s(30))
      .setAlpha(0.001).setInteractive({ useHandCursor: true });
    this.contentContainer.add(hitArea);

    hitArea.on('pointerdown', () => {
      const newVal = !DebugManager.isDebugMode;
      DebugManager.setDebugMode(newVal);

      // FAB 토글: 활성화 시 디버그 FAB 부착, 비활성화 시 제거
      if (newVal) {
        DebugManager.attachToScene(this.scene);
        this.showToast('🛠️ 개발자 모드 활성화! 디버그 버튼이 화면에 표시됩니다.');
      } else {
        if (DebugManager.currentFAB) {
          DebugManager.currentFAB.destroy();
          DebugManager.currentFAB = null;
        }
        if (DebugManager.currentPanel) {
          DebugManager.currentPanel.destroy();
          DebugManager.currentPanel = null;
        }
        this.showToast('개발자 모드 비활성화');
      }
      this.refresh();
    });
  }

  createSettingRow(setting, y, settingsData) {
    const { left, width } = this.contentBounds;

    const rowBg = this.scene.add.graphics();
    rowBg.fillStyle(DESIGN.colors.bg.secondary, 0.8);
    rowBg.fillRoundedRect(left, y, width, s(ROW_HEIGHT), s(DESIGN.radius.md));
    this.contentContainer.add(rowBg);

    this.addText(left + s(20), y + s(12), setting.label, {
      fontSize: sf(16),
      color: DESIGN.colors.text.primary
    });

    const isOn = settingsData[setting.key] !== false;

    // Toggle
    const toggleX = left + width - s(50);
    const toggleBg = this.scene.add.graphics();
    const toggleColor = isOn ? COLORS.success : DESIGN.colors.bg.surface;
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
    const y = top + 5 * s(ROW_HEIGHT + ROW_GAP) + s(16); // 설정 4행 + 개발자 모드 행 아래

    this.addText(left + s(10), y, '계정 관리', {
      fontSize: sf(20),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    });

    // 현재 로그인 정보 표시
    const authData = this._loadAutoLoginData();
    const currentAccountText = this._getAccountDisplayText(authData);

    const accountInfoBg = this.scene.add.graphics();
    accountInfoBg.fillStyle(DESIGN.colors.bg.secondary, 0.8);
    accountInfoBg.fillRoundedRect(left, y + s(35), width, s(50), s(10));
    this.contentContainer.add(accountInfoBg);

    this.addText(left + s(20), y + s(47), '현재 계정:', {
      fontSize: sf(14),
      color: DESIGN.colors.text.secondary
    });

    this.addText(left + s(20), y + s(67), currentAccountText, {
      fontSize: sf(15),
      color: DESIGN.colors.text.primary,
      fontStyle: 'bold'
    });

    // '계정 변경' 버튼은 액션 바(슬롯 4)로 옮겼다
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
    dialog.fillStyle(DESIGN.colors.bg.secondary, 1);
    dialog.fillRoundedRect(centerX - s(180), dialogY - s(100), s(360), s(200), s(16));
    dialog.lineStyle(s(2), 0xEF4444, 0.5);
    dialog.strokeRoundedRect(centerX - s(180), dialogY - s(100), s(360), s(200), s(16));
    elements.push(dialog);

    const msg = this.scene.add.text(centerX, dialogY - s(50),
      '계정을 변경하시겠습니까?\n\n로그인 화면으로 이동하며,\n현재 데이터는 저장됩니다.', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15),
        color: DESIGN.colors.text.primary, align: 'center'
      }).setOrigin(0.5).setDepth(3002);
    elements.push(msg);

    const confirmBg = this.scene.add.rectangle(centerX - s(85), dialogY + s(55), s(140), s(40), 0xEF4444)
      .setDepth(3002).setInteractive({ useHandCursor: true });
    elements.push(confirmBg);
    const confirmLabel = this.scene.add.text(centerX - s(85), dialogY + s(55), '변경', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
      fontStyle: 'bold', color: DESIGN.colors.text.primary
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

    const cancelBg = this.scene.add.rectangle(centerX + s(85), dialogY + s(55), s(140), s(40), DESIGN.colors.bg.surface)
      .setDepth(3002).setInteractive({ useHandCursor: true });
    elements.push(cancelBg);
    const cancelLabel = this.scene.add.text(centerX + s(85), dialogY + s(55), '취소', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16), color: DESIGN.colors.text.secondary
    }).setOrigin(0.5).setDepth(3003);
    elements.push(cancelLabel);

    cancelBg.on('pointerdown', () => {
      elements.forEach(e => e.destroy());
    });
  }

  createAccountInfo() {
    const { left, top, width } = this.contentBounds;
    const y = top + 5 * s(ROW_HEIGHT + ROW_GAP) + s(140); // 계정 관리 섹션 아래

    this.addText(left + s(10), y, '계정 정보', {
      fontSize: sf(20),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
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
        color: DESIGN.colors.text.secondary
      });
    });

    // '쿠폰 입력' · '데이터 초기화' 버튼은 액션 바(슬롯 4)로 옮겼다
  }

  showCouponModal() {
    const elements = [];
    const { centerX } = this.contentBounds;
    const modalY = s(500);

    const overlay = this.scene.add.rectangle(centerX, modalY,
      this.contentBounds.width + s(30), s(200), 0x000000, 0.7).setDepth(3000).setInteractive();
    elements.push(overlay);

    const modal = this.scene.add.graphics().setDepth(3001);
    modal.fillStyle(DESIGN.colors.bg.secondary, 1);
    modal.fillRoundedRect(centerX - s(160), modalY - s(100), s(320), s(200), s(16));
    modal.lineStyle(s(2), COLORS.primary, 0.5);
    modal.strokeRoundedRect(centerX - s(160), modalY - s(100), s(320), s(200), s(16));
    elements.push(modal);

    const title = this.scene.add.text(centerX, modalY - s(75), '쿠폰 입력', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(20),
      fontStyle: 'bold', color: DESIGN.colors.text.primary
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
      fontStyle: 'bold', color: DESIGN.colors.text.primary
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
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14), color: DESIGN.colors.text.secondary
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
    dialog.fillStyle(DESIGN.colors.bg.secondary, 1);
    dialog.fillRoundedRect(centerX - s(160), dialogY - s(80), s(320), s(160), s(16));
    elements.push(dialog);

    const msg = this.scene.add.text(centerX, dialogY - s(35),
      '모든 데이터가 삭제됩니다.\n정말 초기화하시겠습니까?', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
        color: DESIGN.colors.text.primary, align: 'center'
      }).setOrigin(0.5).setDepth(3002);
    elements.push(msg);

    const confirmBg = this.scene.add.rectangle(centerX - s(75), dialogY + s(35), s(120), s(40), 0xEF4444)
      .setDepth(3002).setInteractive({ useHandCursor: true });
    elements.push(confirmBg);
    const confirmLabel = this.scene.add.text(centerX - s(75), dialogY + s(35), '초기화', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
      fontStyle: 'bold', color: DESIGN.colors.text.primary
    }).setOrigin(0.5).setDepth(3003);
    elements.push(confirmLabel);

    confirmBg.on('pointerdown', () => {
      localStorage.removeItem('arcane_collectors_save');
      location.reload();
    });

    const cancelBg = this.scene.add.rectangle(centerX + s(75), dialogY + s(35), s(120), s(40), DESIGN.colors.bg.surface)
      .setDepth(3002).setInteractive({ useHandCursor: true });
    elements.push(cancelBg);
    const cancelLabel = this.scene.add.text(centerX + s(75), dialogY + s(35), '취소', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16), color: DESIGN.colors.text.secondary
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
      color: DESIGN.colors.text.primary, backgroundColor: hexToCSS(DESIGN.colors.bg.surface), padding: { x: s(20), y: s(12) }
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
