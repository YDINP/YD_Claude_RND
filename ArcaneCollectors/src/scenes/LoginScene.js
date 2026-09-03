/**
 * LoginScene — 인증 화면 (REDESIGN_PLAN §3-8, T-19)
 *
 * 리디자인 이전에는 검은 바탕에 점 30개를 뿌리고 텍스트 두 줄로 로고를 흉내 냈고,
 * 하단에 `v1.0.0 | Supabase ON` 같은 개발용 문자열이 그대로 노출됐다.
 * 이제 배경(`bg_login`)과 로고(`logo_arcane_collectors`)를 부팅 화면과 공유해
 * 씬이 바뀌어도 그림이 끊기지 않고, 개발 문자열은 개발 빌드에서만 남는다.
 *
 * 배경과 로고 텍스처는 BootScene.preload() 가 미리 받는다. LoginScene 은 PreloadScene
 * 보다 먼저 뜨므로 여기서 로드를 기대할 수 없다. 텍스처가 없으면 전부 폴백으로 성립한다.
 *
 * 인증 동작(게스트/이메일/자동 로그인)은 그대로다. 바뀐 것은 표현뿐이다.
 */
import { GAME_WIDTH, GAME_HEIGHT, s, sf } from '../config/gameConfig.js';
import { DESIGN, hexToCSS } from '../config/designSystem.js';
import { ts } from '../utils/textStyles.ts';
import { SaveManager } from '../systems/SaveManager.js';
import { isSupabaseConfigured, supabase } from '../api/supabaseClient.js';
import { guestLogin } from '../services/AuthService.js';
import { normalizeHeroes } from '../data/index.js';
import { TutorialManager } from '../systems/TutorialManager.js';
import { soundManager } from '../systems/SoundManager.js';
import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import { GlassPanel, GLASS_VARIANT } from '../components/GlassPanel.js';
import { UIButton } from '../components/UIButton.js';
import { LOGIN_LAYOUT, LOGO_SCRIM, resolveLogoDisplaySize } from '../utils/loginLayout.js';

/** 배경 텍스처 키 — 부팅 화면과 공유한다 */
export const LOGIN_BG_KEY = 'bg_login';

/** 로고 텍스처 키 */
export const LOGO_KEY = 'logo_arcane_collectors';

const DEPTH = {
  BG: 0,
  FADE: 5,
  CONTENT: 10,
  FORM: 50,
  TOAST: 500
};

export class LoginScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoginScene' });
    this.transitioning = false;
    this.autoLoginEnabled = true; // AUTH-1.3: 기본값 ON
  }

  create() {
    this.cameras.main.fadeIn(400);

    try {
      // SND-01: 로비 테마
      soundManager.init(this);
      soundManager.playBGM('main_theme');

      this.createBackground();
      this.createTitle();
      this.createButtons();
      this.createAutoLoginToggle(); // AUTH-1.3: 자동로그인 체크박스
      this.createFooter();
      this.loginForm = null;
    } catch (error) {
      console.error('[LoginScene] create() 실패:', error);
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '씬 로드 실패', {
        fontSize: sf(18), fontFamily: 'Noto Sans KR', fill: '#EF4444', align: 'center'
      }).setOrigin(0.5);
    }
  }

  createBackground() {
    // 딤 0.30 — §3-8. 배경을 더 보여주되 흰 텍스트 대비는 유지한다
    BackgroundFactory.createSceneBg(this, 'login', { dimAlpha: 0.30, depth: DEPTH.BG });

    // 하단 40% 페이드 — 버튼과 체크박스가 놓이는 영역을 배경에서 떼어 낸다
    const fade = LOGIN_LAYOUT.fade;
    const bg = DESIGN.colors.bg.primary;
    const g = this.add.graphics().setDepth(DEPTH.FADE);
    g.fillGradientStyle(bg, bg, bg, bg, 0, 0, 0.96, 0.96);
    g.fillRect(0, s(fade.y), GAME_WIDTH, s(fade.h));
    g.fillStyle(bg, 0.96);
    g.fillRect(0, s(fade.y + fade.h), GAME_WIDTH, GAME_HEIGHT - s(fade.y + fade.h));

    // 로고·부제 뒤 어둠 띠 — 배경과 로고 사이(DEPTH.FADE)에 깔아 로고는 밝게 남긴다
    const scrim = this.add.graphics().setDepth(DEPTH.FADE);
    LOGO_SCRIM.forEach((band) => {
      scrim.fillGradientStyle(bg, bg, bg, bg, band.from, band.from, band.to, band.to);
      scrim.fillRect(0, s(band.y), GAME_WIDTH, s(band.h));
    });
  }

  createTitle() {
    const L = LOGIN_LAYOUT;

    if (this.textures.exists(LOGO_KEY)) {
      const source = this.textures.get(LOGO_KEY).getSourceImage();
      const size = resolveLogoDisplaySize(source.width, source.height, L.logo.w, L.logo.h);
      this.add.image(s(L.logo.x), s(L.logo.y), LOGO_KEY)
        .setDisplaySize(s(size.w), s(size.h))
        .setDepth(DEPTH.CONTENT);
    } else {
      // 폴백 — 로고 에셋이 없어도 화면은 성립해야 한다
      this.add.text(s(L.logo.x), s(L.logo.y - 22), 'ARCANE', ts('display.xl', {
        color: hexToCSS(DESIGN.colors.brand.primary)
      })).setOrigin(0.5).setDepth(DEPTH.CONTENT);

      this.add.text(s(L.logo.x), s(L.logo.y + 26), 'COLLECTORS', ts('display.lg', {
        color: DESIGN.colors.text.primary
      })).setOrigin(0.5).setDepth(DEPTH.CONTENT);
    }

    // 배경 한가운데가 밝은 그림이라 획을 두껍게 두르지 않으면 부제가 묻힌다
    this.add.text(s(L.subtitle.x), s(L.subtitle.y), '신화의 교단에서 영웅을 모아라', ts('label', {
      color: DESIGN.colors.text.primary,
      stroke: '#0D0F1A',
      strokeThickness: 5
    })).setOrigin(0.5).setAlpha(0.92).setDepth(DEPTH.CONTENT);
  }

  createButtons() {
    const L = LOGIN_LAYOUT;

    // B-5.2: 게스트로 시작 (메인 동선)
    this._createButton(
      s(L.guestButton.x), s(L.guestButton.y),
      '게스트로 시작', 'btn_primary', s(L.guestButton.w), s(L.guestButton.h),
      () => this._handleGuestLogin()
    );

    // B-5.3: 계정으로 계속 — 로그인 폼에서 회원가입으로 넘어갈 수 있다
    if (isSupabaseConfigured) {
      this._createButton(
        s(L.accountButton.x), s(L.accountButton.y),
        '계정으로 계속', 'btn_ghost', s(L.accountButton.w), s(L.accountButton.h),
        () => this._showLoginForm()
      );
    }
  }

  /**
   * AUTH-1.3: 자동로그인 체크박스 생성
   */
  createAutoLoginToggle() {
    const L = LOGIN_LAYOUT.autoLogin;
    const toggleY = s(L.y);
    const boxX = s(L.x - 78);

    const box = this.add.graphics().setDepth(DEPTH.CONTENT);
    const size = s(22);
    const drawBox = (checked) => {
      box.clear();
      box.fillStyle(DESIGN.colors.bg.surface, 0.85);
      box.fillRoundedRect(boxX - size / 2, toggleY - size / 2, size, size, s(4));
      box.lineStyle(s(2), DESIGN.colors.brand.primary, checked ? 1 : 0.5);
      box.strokeRoundedRect(boxX - size / 2, toggleY - size / 2, size, size, s(4));
    };
    drawBox(this.autoLoginEnabled);

    const checkmark = this.add.text(boxX, toggleY, '✓', ts('label', {
      color: hexToCSS(DESIGN.colors.brand.primary)
    })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 1).setVisible(this.autoLoginEnabled);

    const label = this.add.text(boxX + s(18), toggleY, '자동 로그인', ts('label', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT);

    // 히트 영역은 체크박스와 라벨을 함께 덮는다 (터치 타겟 하한 확보)
    const hit = this.add.rectangle(
      s(L.x), toggleY, s(L.w), s(Math.max(L.h, DESIGN.touch.minTarget)), 0x000000, 0
    ).setInteractive({ useHandCursor: true }).setDepth(DEPTH.CONTENT + 2);

    hit.on('pointerdown', () => {
      this.autoLoginEnabled = !this.autoLoginEnabled;
      checkmark.setVisible(this.autoLoginEnabled);
      drawBox(this.autoLoginEnabled);
    });

    this.autoLoginCheckbox = { checkbox: box, checkmark, label, hit };
  }

  createFooter() {
    const L = LOGIN_LAYOUT.footer;

    this.add.text(s(L.x), s(L.y), '© YD Studio', ts('caption', {
      color: DESIGN.colors.text.muted
    })).setOrigin(0.5).setDepth(DEPTH.CONTENT);

    // 버전·DB 연결 문자열은 개발 빌드에서만. 프로덕션 화면에 내부 상태를 적지 않는다
    if (import.meta.env.DEV) {
      this.add.text(s(L.x), s(L.y + 22), `dev · Supabase ${isSupabaseConfigured ? 'ON' : 'OFF'}`,
        ts('caption', { color: DESIGN.colors.text.muted }))
        .setOrigin(0.5).setAlpha(0.5).setDepth(DEPTH.CONTENT);
    }
  }

  /**
   * 9-slice 버튼. 텍스처가 없으면 NineSliceFrame 이 폴백 프레임을 그린다.
   * @param {number} x 중심 x (렌더 px)
   * @param {number} y 중심 y (렌더 px)
   * @param {string} label
   * @param {string} frameKey btn_primary | btn_secondary | btn_ghost
   * @param {number} width
   * @param {number} height
   * @param {Function} callback
   * @returns {Phaser.GameObjects.Container}
   */
  _createButton(x, y, label, frameKey, width, height, callback) {
    // 배경이 밝은 로그인 화면이라 라벨 캡슐 없이는 버튼 문구가 아트에 묻힌다
    return UIButton.create(this, {
      x, y, w: width, h: height,
      label,
      variant: frameKey,
      tint: frameKey === 'btn_ghost' ? DESIGN.colors.brand.primary : null,
      token: 'body',
      bold: true,
      depth: DEPTH.CONTENT,
      onClick: callback
    });
  }

  /**
   * B-5.2: 게스트 로그인
   */
  async _handleGuestLogin() {
    if (this.transitioning) return;
    this.transitioning = true;

    try {
      const result = await guestLogin();
      console.log('LoginScene: 게스트 로그인 성공', result.user.id);

      // AUTH-1.3: 자동로그인 정보 저장
      if (this.autoLoginEnabled) {
        this._saveAutoLoginData({
          userId: result.user.id,
          authType: 'guest',
          autoLogin: true,
          lastLogin: Date.now()
        });
      }

      // 게스트는 클라우드 동기화 불가
      SaveManager.setUserId(null);
      // 세이브 데이터가 없으면 기본값 생성 (스타터 캐릭터 포함)
      SaveManager.load();
      this._goToPreload();
    } catch (error) {
      console.error('LoginScene: 게스트 로그인 실패', error);
      this.transitioning = false;
    }
  }

  /**
   * B-5.3: 이메일 로그인 폼 표시
   */
  _showLoginForm() {
    if (this.loginForm) return;
    this._createAuthForm('login');
  }

  _showSignupForm() {
    if (this.loginForm) return;
    this._createAuthForm('signup');
  }

  /** 로그인 ↔ 회원가입 전환 */
  _switchAuthForm(mode) {
    this._destroyForm();
    this._createAuthForm(mode);
  }

  _createAuthForm(mode) {
    const isLogin = mode === 'login';
    const formY = GAME_HEIGHT * 0.44;
    const formW = s(560);
    const formH = s(isLogin ? 420 : 500);

    // 스크림 — 튜토리얼 마스킹과 같은 0.72 (§2-3)
    const overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT,
      DESIGN.colors.bg.primary, DESIGN.glass.scrim.tintAlpha
    ).setInteractive().setDepth(DEPTH.FORM);

    const formBg = GlassPanel.create(this, {
      x: GAME_WIDTH / 2,
      y: formY,
      w: formW,
      h: formH,
      variant: GLASS_VARIANT.POPUP,
      bgKey: LOGIN_BG_KEY,
      depth: DEPTH.FORM + 1
    });

    const title = this.add.text(GAME_WIDTH / 2, formY - formH / 2 + s(44),
      isLogin ? '이메일 로그인' : '회원가입',
      ts('display.lg', { color: DESIGN.colors.text.primary }))
      .setOrigin(0.5).setDepth(DEPTH.FORM + 2);

    // HTML 입력 요소 사용 (Phaser에서는 DOM Element)
    const emailInput = this._createInput(GAME_WIDTH / 2, formY - s(70), 'email', '이메일 주소');
    const passwordInput = this._createInput(GAME_WIDTH / 2, formY, 'password', '비밀번호');

    let nicknameInput = null;
    if (!isLogin) {
      nicknameInput = this._createInput(GAME_WIDTH / 2, formY + s(70), 'text', '닉네임');
    }

    const submitBtnY = formY + s(isLogin ? 96 : 166);
    const submitBtn = this._createButton(
      GAME_WIDTH / 2, submitBtnY,
      isLogin ? '로그인' : '가입하기', 'btn_primary', s(400), s(64),
      async () => {
        const email = emailInput.node?.value || '';
        const password = passwordInput.node?.value || '';
        const nickname = nicknameInput?.node?.value || '';

        if (!email || !password) {
          this._showToast('이메일과 비밀번호를 입력하세요');
          return;
        }

        await this._handleEmailAuth(isLogin, email, password, nickname);
      }
    );
    submitBtn.setDepth(DEPTH.FORM + 2);

    // 모드 전환 — 회원가입 동선을 폼 안에 남긴다
    const switchLabel = this.add.text(
      GAME_WIDTH / 2, formY + formH / 2 - s(34),
      isLogin ? '계정이 없나요?  회원가입' : '이미 계정이 있나요?  로그인',
      ts('label', { color: hexToCSS(DESIGN.colors.brand.primary) })
    ).setOrigin(0.5).setDepth(DEPTH.FORM + 2).setInteractive({ useHandCursor: true });

    switchLabel.on('pointerdown', () => this._switchAuthForm(isLogin ? 'signup' : 'login'));

    // 닫기
    const closeBtn = this.add.text(
      GAME_WIDTH / 2 + formW / 2 - s(36), formY - formH / 2 + s(40), '✕',
      ts('title', { color: DESIGN.colors.text.secondary })
    ).setOrigin(0.5).setDepth(DEPTH.FORM + 2).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => {
      this._destroyForm();
    });

    this.loginForm = {
      overlay, formBg, title, emailInput, passwordInput, nicknameInput,
      submitBtn, switchLabel, closeBtn
    };
  }

  _createInput(x, y, type, placeholder) {
    const input = this.add.dom(x, y, 'input', {
      width: `${s(360)}px`,
      height: `${s(48)}px`,
      fontSize: `${sf(15)}`,
      fontFamily: 'Noto Sans KR, sans-serif',
      padding: `0 ${s(14)}px`,
      border: '1px solid rgba(6, 187, 250, 0.55)',
      borderRadius: `${s(8)}px`,
      backgroundColor: '#0D0F1A',
      color: '#F8FAFC',
      outline: 'none'
    });

    if (input.node) {
      input.node.type = type;
      input.node.placeholder = placeholder;
    }

    input.setDepth(DEPTH.FORM + 2);
    return input;
  }

  _destroyForm() {
    if (!this.loginForm) return;

    const {
      overlay, formBg, title, emailInput, passwordInput, nicknameInput,
      submitBtn, switchLabel, closeBtn
    } = this.loginForm;
    [overlay, formBg, title, switchLabel, closeBtn].forEach(el => el?.destroy());
    emailInput?.destroy();
    passwordInput?.destroy();
    nicknameInput?.destroy();
    submitBtn?.destroy();

    this.loginForm = null;
  }

  /**
   * B-5.4: AuthService 연결 - 이메일 인증 처리
   */
  async _handleEmailAuth(isLogin, email, password, nickname) {
    if (!supabase) {
      this._showToast('Supabase 연결 불가');
      return;
    }

    try {
      let result;
      if (isLogin) {
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        result = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nickname } }
        });
      }

      if (result.error) {
        const errorMessages = {
          'Invalid login credentials': '이메일 또는 비밀번호가 틀렸습니다',
          'User already registered': '이미 가입된 이메일입니다',
          'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 합니다'
        };
        this._showToast(errorMessages[result.error.message] || result.error.message);
        return;
      }

      const userId = result.data?.user?.id;
      if (userId) {
        console.log('LoginScene: 이메일 인증 성공', userId);

        // AUTH-1.3: 자동로그인 정보 저장
        if (this.autoLoginEnabled) {
          this._saveAutoLoginData({
            userId: userId,
            authType: 'email',
            email: email,
            autoLogin: true,
            lastLogin: Date.now()
          });
        }

        SaveManager.setUserId(userId);

        // 클라우드 동기화 시도
        await SaveManager.loadFromCloud();
      }

      this._destroyForm();
      this._goToPreload();
    } catch (error) {
      this._showToast(`인증 오류: ${  error.message}`);
    }
  }

  _showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - s(120), message, ts('label', {
      color: hexToCSS(DESIGN.colors.status.error),
      backgroundColor: '#141627',
      padding: { x: s(16), y: s(10) }
    })).setOrigin(0.5).setDepth(DEPTH.TOAST);

    this.tweens.add({
      targets: toast,
      alpha: { from: 1, to: 0 },
      y: toast.y - s(20),
      duration: 150,
      delay: 2000,
      ease: 'Power2',
      onComplete: () => toast.destroy()
    });
  }

  /**
   * B-5.5: registry 초기화 후 PreloadScene으로 이동
   */
  _goToPreload() {
    // 로그인 후 registry 초기화
    const saveData = SaveManager.load();

    // account_created 트리거 — 신규 계정이면 T-01부터 시작한다.
    // 완주 유저/진행 중 유저에게는 start()가 아무것도 바꾸지 않는다(멱등).
    try {
      TutorialManager.start();
    } catch (error) {
      console.error('[LoginScene] 튜토리얼 시작 실패', error);
    }

    this.registry.set('saveData', saveData);
    this.registry.set('gems', saveData.resources.gems);
    this.registry.set('gold', saveData.resources.gold);
    this.registry.set('pityCounter', saveData.gacha.pityCounter);
    this.registry.set('ownedHeroes', normalizeHeroes(saveData.characters));
    this.registry.set('clearedStages', saveData.progress.clearedStages);
    this.registry.set('battleSpeed', saveData.settings.battleSpeed);
    this.registry.set('autoBattle', false);

    const offlineRewards = SaveManager.calculateOfflineRewards();
    if (offlineRewards.gold > 0) {
      this.registry.set('pendingOfflineRewards', offlineRewards);
    }

    this.cameras.main.fadeOut(200, 13, 15, 26);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('PreloadScene');
    });
  }

  /**
   * AUTH-1.3: 자동로그인 데이터 저장
   * @param {Object} authData 자동로그인 정보
   */
  _saveAutoLoginData(authData) {
    try {
      localStorage.setItem('arcane_auth', JSON.stringify(authData));
      console.log('LoginScene: 자동로그인 정보 저장', authData.authType);
    } catch (error) {
      console.warn('LoginScene: 자동로그인 저장 실패', error);
    }
  }

  shutdown() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }
}
