/**
 * BootScene — 스플래시 · 세션 확인 (REDESIGN_PLAN §3-8, T-19)
 *
 * 부팅 화면과 로그인 화면은 배경(`bg_login`)과 로고를 공유한다. 좌표는
 * `utils/loginLayout.js` 한 곳에 있고 두 씬이 같은 값을 읽는다 — 그래야 씬이 바뀔 때
 * 그림이 제자리에 있고 한 장면처럼 이어진다.
 *
 * BootScene 은 게임의 첫 씬이라 PreloadScene 의 에셋 로드보다 먼저 뜬다. 그래서 이 화면과
 * 로그인 화면이 쓰는 최소한의 텍스처(배경 · 로고 · 버튼 프레임)를 여기서 직접 받는다.
 * 로드 실패는 조용히 흡수한다 — 각 소비처가 textures.exists() 로 폴백한다.
 *
 * 하단 문구는 story.json 에서 뽑는다(`utils/bootTips.js`). 대본 SSOT 를 복사하지 않기 위해서다.
 */
import { GAME_WIDTH, GAME_HEIGHT, s, sf } from '../config/gameConfig.js';
import { DESIGN, hexToCSS } from '../config/designSystem.js';
import { ts } from '../utils/textStyles.ts';
import { SaveManager } from '../systems/SaveManager.js';
import { isSupabaseConfigured, supabase, getLocalData } from '../api/supabaseClient.js';
import { normalizeHeroes } from '../data/index.js';
import { GachaSystem } from '../systems/GachaSystem.js';
import { soundManager } from '../systems/SoundManager.js';
import { validateAllGameData } from '../schemas/validator.js';
import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import { buildBootTips, cycleIndex } from '../utils/bootTips.js';
import {
  BOOT_LAYOUT as L,
  LOGO_SCRIM,
  TIP_ROTATE_MS,
  TIP_FADE_MS,
  resolveLogoDisplaySize,
  combineBootProgress
} from '../utils/loginLayout.js';
import STORY_DATA from '../data/story.json';
import ASSET_MANIFEST from '../../tools/art/asset-manifest.json';

/** 부팅 화면과 로그인 화면이 함께 쓰는 최소 텍스처 */
export const BOOT_ASSET_KEYS = Object.freeze([
  'bg_login',
  'bg_login_blur',
  'logo_arcane_collectors',
  'btn_primary',
  'btn_ghost'
]);

/** 스플래시 유지 시간 (ms) */
const SPLASH_MS = 2400;

const DEPTH = {
  BASE: -1,
  BG: 0,
  FADE: 5,
  CONTENT: 10
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
    this._loadProgress = 0;
    this._bootProgress = 0;
  }

  async create() {
    try {
      // SND-01: 사운드 초기화 + 로비 테마 예약(자동재생 잠금이 풀리면 재생된다)
      soundManager.init(this);
      soundManager.playBGM('main_theme');

      // 바탕과 진행바를 먼저 세우고, 에셋은 create 안에서 받는다.
      // preload() 로 받으면 씬이 LOADING 상태에 머물러 scene.isActive() 가 false 가 되고,
      // "부팅 후 활성 씬이 있는가"를 보는 boot-smoke 가 로드 타이밍에 따라 흔들린다.
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, DESIGN.colors.bg.primary)
        .setDepth(DEPTH.BASE);
      this.createProgressBar();
      this.createFooter();
      this.loadBootAssets(() => this.buildSplash());
      this.startProgressAnimation();

      // COMPAT-1.5: 개발 모드 스키마 검증 (비동기)
      if (import.meta.env.DEV) {
        this.time.delayedCall(100, () => {
          try {
            validateAllGameData();
          } catch (err) {
            console.warn('[BootScene] Schema validation error:', err);
          }
        });
      }

      // PRD-1: 가챠 풀 초기화 (부팅 시 1회 — pull()에도 lazy 초기화 이중 방어 존재)
      GachaSystem.initializePool();

      // 세션 확인 (스플래시 중 비동기)
      const hasSession = await this._checkExistingSession();

      // H-9.2: 스플래시 후 페이드 아웃
      this.time.delayedCall(SPLASH_MS, () => {
        this.cameras.main.fadeOut(200, 13, 15, 26);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          if (hasSession) {
            this._initRegistry();
            this.scene.start('PreloadScene');
          } else {
            this.scene.start('LoginScene');
          }
        });
      });
    } catch (error) {
      console.error('[BootScene] create() 실패:', error);
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '씬 로드 실패\n로그인으로 돌아갑니다', {
        fontSize: sf(18), fontFamily: 'Noto Sans KR', fill: '#EF4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('LoginScene');
      });
    }
  }

  // ================================================================
  // 화면
  // ================================================================

  /**
   * 이 화면과 로그인 화면이 쓰는 텍스처만 받는다.
   * 전체 에셋은 PreloadScene 이 맡는다 — 여기서 다 받으면 스플래시가 로딩 화면이 된다.
   * @param {Function} onDone 로드가 끝났을 때(실패 포함) 호출
   */
  loadBootAssets(onDone) {
    const textures = (ASSET_MANIFEST && ASSET_MANIFEST.textures) || {};
    let queued = 0;

    BOOT_ASSET_KEYS.forEach((key) => {
      const meta = textures[key];
      if (!meta || !meta.path) return;
      if (this.textures.exists(key)) return;
      this.load.image(key, meta.path);
      queued += 1;
    });

    if (queued === 0) {
      this._loadProgress = 1;
      this.drawProgress();
      onDone();
      return;
    }

    this.load.on('progress', (value) => {
      this._loadProgress = value;
      this.drawProgress();
    });

    // 로드 실패는 조용히 흡수한다. 소비처가 각자 폴백한다
    this.load.on('loaderror', (file) => {
      console.warn(`[BootScene] 부팅 에셋 로드 실패, 폴백 사용: ${file?.key}`);
    });

    this.load.once('complete', () => {
      this._loadProgress = 1;
      this.drawProgress();
      onDone();
    });

    this.load.start();
  }

  /** 배경·로고·문구. 부팅 에셋 로드가 끝난 뒤에 한 번 그린다 */
  buildSplash() {
    if (!this.sys || !this.sys.isActive()) return;
    this.createBackground();
    this.createLogo();
    this.createTips();
  }

  createBackground() {
    BackgroundFactory.createSceneBg(this, 'login', { dimAlpha: 0.30, depth: DEPTH.BG });

    const bg = DESIGN.colors.bg.primary;
    const g = this.add.graphics().setDepth(DEPTH.FADE);
    g.fillGradientStyle(bg, bg, bg, bg, 0, 0, 0.96, 0.96);
    g.fillRect(0, s(L.fade.y), GAME_WIDTH, s(L.fade.h));
    g.fillStyle(bg, 0.96);
    g.fillRect(0, s(L.fade.y + L.fade.h), GAME_WIDTH, GAME_HEIGHT - s(L.fade.y + L.fade.h));

    // 로고·부제 뒤 어둠 띠 — 배경과 로고 사이(DEPTH.FADE)에 깔아 로고는 밝게 남긴다
    const scrim = this.add.graphics().setDepth(DEPTH.FADE);
    LOGO_SCRIM.forEach((band) => {
      scrim.fillGradientStyle(bg, bg, bg, bg, band.from, band.from, band.to, band.to);
      scrim.fillRect(0, s(band.y), GAME_WIDTH, s(band.h));
    });
  }

  createLogo() {
    let logo;

    if (this.textures.exists('logo_arcane_collectors')) {
      const source = this.textures.get('logo_arcane_collectors').getSourceImage();
      const size = resolveLogoDisplaySize(source.width, source.height, L.logo.w, L.logo.h);
      logo = this.add.image(s(L.logo.x), s(L.logo.y), 'logo_arcane_collectors')
        .setDisplaySize(s(size.w), s(size.h))
        .setDepth(DEPTH.CONTENT)
        .setAlpha(0);
    } else {
      // 폴백 — 로고 에셋이 없어도 화면은 성립해야 한다
      logo = this.add.container(s(L.logo.x), s(L.logo.y)).setDepth(DEPTH.CONTENT).setAlpha(0);
      logo.add(this.add.text(0, s(-22), 'ARCANE', ts('display.xl', {
        color: hexToCSS(DESIGN.colors.brand.primary)
      })).setOrigin(0.5));
      logo.add(this.add.text(0, s(26), 'COLLECTORS', ts('display.lg', {
        color: DESIGN.colors.text.primary
      })).setOrigin(0.5));
    }

    this.tweens.add({
      targets: logo,
      alpha: 1,
      y: logo.y - s(6),
      duration: 620,
      ease: 'Back.easeOut'
    });

    // 배경 한가운데가 밝은 그림이라 획을 두껍게 두르지 않으면 부제가 묻힌다
    const subtitle = this.add.text(s(L.subtitle.x), s(L.subtitle.y), '신화의 교단에서 영웅을 모아라',
      ts('label', { color: DESIGN.colors.text.primary, stroke: '#0D0F1A', strokeThickness: 5 }))
      .setOrigin(0.5).setDepth(DEPTH.CONTENT).setAlpha(0);

    this.tweens.add({ targets: subtitle, alpha: 0.92, duration: 420, delay: 320, ease: 'Power2' });
  }

  /** 세계관 문구를 story.json 에서 뽑아 순환시킨다 */
  createTips() {
    this.tips = buildBootTips(STORY_DATA?.scenes);
    // 매번 같은 문장으로 시작하면 부팅이 한 장면으로 굳는다. 시작점만 무작위로 돌린다
    this.tipIndex = Math.floor(Math.random() * this.tips.length);

    this.tipText = this.add.text(s(L.tip.x), s(L.tip.y), this.tips[this.tipIndex], ts('label', {
      color: DESIGN.colors.text.secondary,
      align: 'center',
      wordWrap: { width: s(L.tip.wrapWidth) }
    })).setOrigin(0.5).setDepth(DEPTH.CONTENT).setAlpha(0);

    this.tweens.add({ targets: this.tipText, alpha: 0.85, duration: TIP_FADE_MS, delay: 420 });

    if (this.tips.length < 2) return;

    this.time.addEvent({
      delay: TIP_ROTATE_MS,
      loop: true,
      callback: () => this.rotateTip()
    });
  }

  rotateTip() {
    if (!this.tipText || !this.tipText.scene) return;
    this.tipIndex = cycleIndex(this.tipIndex + 1, this.tips.length);
    const next = this.tips[this.tipIndex];

    this.tweens.add({
      targets: this.tipText,
      alpha: 0,
      duration: TIP_FADE_MS,
      onComplete: () => {
        if (!this.tipText || !this.tipText.scene) return;
        this.tipText.setText(next);
        this.tweens.add({ targets: this.tipText, alpha: 0.85, duration: TIP_FADE_MS });
      }
    });
  }

  /** 글래스 진행바. preload 에서 세워 로드 중에도 화면이 살아 있게 한다 */
  createProgressBar() {
    const bar = L.progress;
    this.progressBar = this.add.graphics().setDepth(DEPTH.CONTENT);
    this.progressLabel = this.add.text(s(L.progressLabel.x), s(L.progressLabel.y), '', ts('num.sm', {
      color: DESIGN.colors.text.muted
    })).setOrigin(0.5).setDepth(DEPTH.CONTENT).setAlpha(0.75);
    this._progressRect = {
      x: s(bar.x - bar.w / 2),
      y: s(bar.y - bar.h / 2),
      w: s(bar.w),
      h: s(bar.h)
    };
    this.drawProgress();
  }

  drawProgress() {
    if (!this.progressBar || !this.progressBar.scene) return;
    const rect = this._progressRect;
    const radius = rect.h / 2;
    const value = combineBootProgress(this._loadProgress, this._bootProgress);

    this.progressBar.clear();
    // 글래스 트랙 — 배경을 비추는 대신 어두운 틴트 + 얇은 림으로 두께를 만든다
    this.progressBar.fillStyle(DESIGN.colors.bg.primary, 0.72);
    this.progressBar.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, radius);

    const fill = rect.w * value;
    if (fill > 0) {
      this.progressBar.fillStyle(DESIGN.colors.brand.primary, 0.95);
      this.progressBar.fillRoundedRect(rect.x, rect.y, Math.max(fill, rect.h), rect.h, radius);
    }

    this.progressBar.lineStyle(Math.max(1, s(1)), DESIGN.glass.rim.topColor, 0.16);
    this.progressBar.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, radius);

    if (this.progressLabel && this.progressLabel.scene) {
      this.progressLabel.setText(`${Math.round(value * 100)}%`);
    }
  }

  /** 로드가 끝난 뒤에도 막대가 멈춰 있지 않도록 스플래시 구간을 채운다 */
  startProgressAnimation() {
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: SPLASH_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        this._bootProgress = tween.getValue();
        this.drawProgress();
      }
    });
  }

  createFooter() {
    this.add.text(s(L.footer.x), s(L.footer.y), 'YD Studio © 2025', ts('caption', {
      color: DESIGN.colors.text.muted
    })).setOrigin(0.5).setDepth(DEPTH.CONTENT).setAlpha(0.5);
  }

  // ================================================================
  // 세션
  // ================================================================

  /**
   * AUTH-1.1: 기존 세션 또는 자동로그인 확인
   * @returns {Promise<boolean>} 세션 유효 여부
   */
  async _checkExistingSession() {
    try {
      // AUTH-1.1: 자동로그인 정보 확인
      const authData = this._loadAutoLoginData();
      if (authData && authData.autoLogin) {
        const isValid = this._isAuthDataValid(authData);
        if (isValid) {
          console.log('BootScene: 자동로그인 적용', authData.authType, authData.userId);

          if (authData.authType === 'email' && authData.userId) {
            // 이메일 계정: Supabase 세션 확인
            if (isSupabaseConfigured && supabase) {
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user && session.user.id === authData.userId) {
                SaveManager.setUserId(session.user.id);
                await SaveManager.loadFromCloud();
                return true;
              }
            }
          } else if (authData.authType === 'guest') {
            // 게스트 계정: 로컬 데이터 확인
            const guestData = getLocalData('guest_user');
            if (guestData && guestData.id === authData.userId) {
              SaveManager.setUserId(null);
              SaveManager.load();
              return true;
            }
          }
        }
        // 자동로그인 정보가 있지만 유효하지 않으면 삭제
        this._clearAutoLoginData();
      }

      // 기존 Supabase 세션 확인 (자동로그인 없을 때)
      if (isSupabaseConfigured && supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          SaveManager.setUserId(session.user.id);
          await SaveManager.loadFromCloud();
          console.log('BootScene: 기존 세션 복원', session.user.id);
          return true;
        }
      }

      // 게스트 세션 확인 (이전에 게스트로 시작한 적이 있으면)
      const guestData = getLocalData('guest_user');
      const saveData = localStorage.getItem(SaveManager.SAVE_KEY);
      if (guestData) {
        // 이전 게스트 세이브가 있으면 바로 진행 (세이브 없어도 자동 생성됨)
        SaveManager.setUserId(null);
        if (!saveData) {
          // 첫 로그인 후 세이브가 아직 없으면 기본값 생성
          SaveManager.load();
        }
        console.log('BootScene: 기존 게스트 세션 복원', guestData.id);
        return true;
      }

      return false;
    } catch (error) {
      console.warn('BootScene: 세션 확인 실패', error);
      // 로컬 세이브가 있으면 진행 허용
      return !!localStorage.getItem(SaveManager.SAVE_KEY);
    }
  }

  /**
   * AUTH-1.1: 자동로그인 데이터 로드
   * @returns {Object|null} 자동로그인 정보
   */
  _loadAutoLoginData() {
    try {
      const data = localStorage.getItem('arcane_auth');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn('BootScene: 자동로그인 데이터 파싱 실패', error);
      return null;
    }
  }

  /**
   * AUTH-1.1: 자동로그인 데이터 유효성 검증
   * @param {Object} authData 자동로그인 정보
   * @returns {boolean} 유효 여부
   */
  _isAuthDataValid(authData) {
    if (!authData || !authData.userId || !authData.authType) {
      return false;
    }

    // 7일 이상 지난 자동로그인 정보는 무효화
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const lastLogin = authData.lastLogin || 0;
    if (Date.now() - lastLogin > SEVEN_DAYS) {
      console.log('BootScene: 자동로그인 만료 (7일 초과)');
      return false;
    }

    return true;
  }

  /**
   * AUTH-1.1: 자동로그인 데이터 삭제
   */
  _clearAutoLoginData() {
    localStorage.removeItem('arcane_auth');
  }

  /**
   * 게임 레지스트리 초기화 (PreloadScene 진입 전)
   */
  _initRegistry() {
    const saveData = SaveManager.load();
    if (!saveData) return;

    this.registry.set('saveData', saveData);
    this.registry.set('gems', saveData.resources?.gems ?? 0);
    this.registry.set('gold', saveData.resources?.gold ?? 0);
    this.registry.set('pityCounter', saveData.gacha?.pityCounter ?? 0);
    this.registry.set('ownedHeroes', normalizeHeroes(saveData.characters || []));
    this.registry.set('clearedStages', saveData.progress?.clearedStages ?? {});
    this.registry.set('battleSpeed', saveData.settings?.battleSpeed ?? 1);
    this.registry.set('autoBattle', false);

    // Check for offline rewards
    const offlineRewards = SaveManager.calculateOfflineRewards();
    if (offlineRewards.gold > 0) {
      this.registry.set('pendingOfflineRewards', offlineRewards);
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
