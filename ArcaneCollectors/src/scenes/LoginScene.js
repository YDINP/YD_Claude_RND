/**
 * LoginScene - 인증 화면
 * B-5: 타이틀 + 게스트/이메일 로그인
 */
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
import { isSupabaseConfigured, supabase } from '../api/supabaseClient.js';
import { guestLogin } from '../services/AuthService.js';
import { normalizeHeroes } from '../data/index.js';

export class LoginScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoginScene' });
    this.transitioning = false;
    this.autoLoginEnabled = true; // AUTH-1.3: 기본값 ON
  }

  create() {
    this.cameras.main.fadeIn(400);

    try {
      this.createBackground();
      this.createTitle();
      this.createButtons();
      this.createAutoLoginToggle(); // AUTH-1.3: 자동로그인 체크박스
      this.loginForm = null;
    } catch (error) {
      console.error('[LoginScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
    }
  }

  createBackground() {
    // 어두운 그라데이션 배경
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0a1a);

    // 장식적 파티클 (별처럼 반짝이는 점)
    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.Between(20, GAME_WIDTH - 20);
      const y = Phaser.Math.Between(50, GAME_HEIGHT - 200);
      const size = Phaser.Math.Between(1, 3);
      const star = this.add.circle(x, y, size, 0x6366f1, Phaser.Math.FloatBetween(0.2, 0.7));

      this.tweens.add({
        targets: star,
        alpha: { from: star.alpha, to: Phaser.Math.FloatBetween(0.1, 0.5) },
        duration: Phaser.Math.Between(1500, 3000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  createTitle() {
    // B-5.1: 게임 로고
    const titleY = GAME_HEIGHT * 0.3;

    this.add.text(GAME_WIDTH / 2, titleY - 30, 'ARCANE', {
      fontSize: '48px',
      fontFamily: 'Georgia, serif',
      color: '#6366F1',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, titleY + 30, 'COLLECTORS', {
      fontSize: '28px',
      fontFamily: 'Georgia, serif',
      color: '#a5b4fc',
      letterSpacing: 8
    }).setOrigin(0.5);

    // 서브 타이틀
    this.add.text(GAME_WIDTH / 2, titleY + 70, '신화의 교단에서 영웅을 모아라', {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: '#64748b'
    }).setOrigin(0.5);
  }

  createButtons() {
    const btnY = GAME_HEIGHT * 0.6;

    // B-5.2: 게스트로 시작 버튼 (메인)
    this._createButton(
      GAME_WIDTH / 2, btnY,
      '게스트로 시작', COLORS.primary, 280, 52,
      () => this._handleGuestLogin()
    );

    // B-5.3: 이메일 로그인 버튼 (서브)
    if (isSupabaseConfigured) {
      this._createButton(
        GAME_WIDTH / 2, btnY + 70,
        '이메일 로그인', 0x374151, 280, 44,
        () => this._showLoginForm()
      );

      this._createButton(
        GAME_WIDTH / 2, btnY + 125,
        '회원가입', 0x374151, 280, 44,
        () => this._showSignupForm()
      );
    }

    // 버전 정보
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, `v1.0.0 | Supabase ${  isSupabaseConfigured ? 'ON' : 'OFF'}`, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#475569'
    }).setOrigin(0.5);
  }

  /**
   * AUTH-1.3: 자동로그인 체크박스 생성
   */
  createAutoLoginToggle() {
    const toggleY = GAME_HEIGHT - 80;
    const toggleX = GAME_WIDTH / 2;

    // 체크박스 배경
    const checkboxSize = 20;
    const checkbox = this.add.rectangle(
      toggleX - 60, toggleY, checkboxSize, checkboxSize, 0x1e293b, 1
    );
    checkbox.setStrokeStyle(2, COLORS.primary);
    checkbox.setInteractive({ useHandCursor: true });

    // 체크 표시
    const checkmark = this.add.text(toggleX - 60, toggleY, '✓', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#6366F1',
      fontStyle: 'bold'
    }).setOrigin(0.5).setVisible(this.autoLoginEnabled);

    // 레이블
    const label = this.add.text(toggleX - 35, toggleY, '자동 로그인', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#94a3b8'
    }).setOrigin(0, 0.5);

    // 클릭 이벤트
    checkbox.on('pointerdown', () => {
      this.autoLoginEnabled = !this.autoLoginEnabled;
      checkmark.setVisible(this.autoLoginEnabled);
    });

    label.setInteractive({ useHandCursor: true });
    label.on('pointerdown', () => {
      this.autoLoginEnabled = !this.autoLoginEnabled;
      checkmark.setVisible(this.autoLoginEnabled);
    });

    this.autoLoginCheckbox = { checkbox, checkmark, label };
  }

  _createButton(x, y, label, color, width, height, callback) {
    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, width, height, color, 1)
      .setInteractive({ useHandCursor: true });
    bg.setStrokeStyle(1, 0x4f46e5);

    const text = this.add.text(0, 0, label, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    container.add([bg, text]);

    bg.on('pointerover', () => bg.setFillStyle(Phaser.Display.Color.IntegerToColor(color).brighten(20).color, 1));
    bg.on('pointerout', () => bg.setFillStyle(color, 1));
    bg.on('pointerdown', callback);

    return container;
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

  _createAuthForm(mode) {
    const isLogin = mode === 'login';
    const formY = GAME_HEIGHT * 0.45;

    // 오버레이
    const overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7
    ).setInteractive();

    // 폼 컨테이너
    const formBg = this.add.rectangle(GAME_WIDTH / 2, formY, 320, isLogin ? 280 : 340, 0x1e1b4b, 1);
    formBg.setStrokeStyle(2, 0x6366f1);

    const title = this.add.text(GAME_WIDTH / 2, formY - (isLogin ? 110 : 140), isLogin ? '이메일 로그인' : '회원가입', {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#e2e8f0',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // HTML 입력 요소 사용 (Phaser에서는 DOM Element)
    const emailInput = this._createInput(GAME_WIDTH / 2, formY - 50, 'email', '이메일 주소');
    const passwordInput = this._createInput(GAME_WIDTH / 2, formY + 10, 'password', '비밀번호');

    let nicknameInput = null;
    if (!isLogin) {
      nicknameInput = this._createInput(GAME_WIDTH / 2, formY + 70, 'text', '닉네임');
    }

    const submitBtnY = isLogin ? formY + 70 : formY + 130;
    const submitBtn = this._createButton(
      GAME_WIDTH / 2, submitBtnY,
      isLogin ? '로그인' : '가입하기', COLORS.primary, 240, 44,
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

    // 닫기 버튼
    const closeBtn = this.add.text(GAME_WIDTH / 2 + 140, formY - (isLogin ? 120 : 150), '✕', {
      fontSize: '20px', color: '#94a3b8'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => {
      this._destroyForm();
    });

    this.loginForm = { overlay, formBg, title, emailInput, passwordInput, nicknameInput, submitBtn, closeBtn };
  }

  _createInput(x, y, type, placeholder) {
    const input = this.add.dom(x, y, 'input', {
      width: '240px',
      height: '36px',
      fontSize: '14px',
      padding: '0 12px',
      border: '1px solid #4f46e5',
      borderRadius: '6px',
      backgroundColor: '#0f172a',
      color: '#e2e8f0',
      outline: 'none'
    });

    if (input.node) {
      input.node.type = type;
      input.node.placeholder = placeholder;
    }

    return input;
  }

  _destroyForm() {
    if (!this.loginForm) return;

    const { overlay, formBg, title, emailInput, passwordInput, nicknameInput, submitBtn, closeBtn } = this.loginForm;
    [overlay, formBg, title, closeBtn].forEach(el => el?.destroy());
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
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 80, message, {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: '#fca5a5',
      backgroundColor: '#1e1b4b',
      padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: toast,
      alpha: { from: 1, to: 0 },
      y: toast.y - 30,
      duration: 2000,
      delay: 1500,
      onComplete: () => toast.destroy()
    });
  }

  /**
   * B-5.5: registry 초기화 후 PreloadScene으로 이동
   */
  _goToPreload() {
    // 로그인 후 registry 초기화
    const saveData = SaveManager.load();
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

    this.cameras.main.fadeOut(300);
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
