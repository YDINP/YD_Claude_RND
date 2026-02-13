import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
import { isSupabaseConfigured, supabase, getLocalData } from '../api/supabaseClient.js';
import { getGuestUserId } from '../services/AuthService.js';
import { normalizeHeroes } from '../data/index.js';
import { validateAllGameData } from '../schemas/validator.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  async create() {
    try {
      // H-9.2: 스플래시 화면 배경
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0a1a);

      // 장식 파티클 (별)
      for (let i = 0; i < 20; i++) {
        const x = Phaser.Math.Between(50, GAME_WIDTH - 50);
        const y = Phaser.Math.Between(100, GAME_HEIGHT - 100);
        const star = this.add.circle(x, y, Phaser.Math.Between(1, 2), 0x6366f1, Phaser.Math.FloatBetween(0.1, 0.4));
        this.tweens.add({
          targets: star,
          alpha: { from: star.alpha, to: Phaser.Math.FloatBetween(0.05, 0.3) },
          duration: Phaser.Math.Between(1000, 2500),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }

      // H-9.1: 로고 구성
      const logoY = GAME_HEIGHT * 0.4;

      // 마법진 배경 (장식)
      const magicRing = this.add.circle(GAME_WIDTH / 2, logoY, 100, 0x000000, 0);
      magicRing.setStrokeStyle(1, 0x6366f1, 0.3);
      this.tweens.add({
        targets: magicRing,
        scaleX: 1.2, scaleY: 1.2,
        alpha: 0,
        duration: 2500,
        ease: 'Quad.easeOut'
      });

      const magicRing2 = this.add.circle(GAME_WIDTH / 2, logoY, 80, 0x000000, 0);
      magicRing2.setStrokeStyle(1, 0xEC4899, 0.2);
      this.tweens.add({
        targets: magicRing2,
        angle: 360,
        scaleX: 1.3, scaleY: 1.3,
        alpha: 0,
        duration: 2800,
        ease: 'Quad.easeOut'
      });

      // 메인 타이틀
      const titleArcane = this.add.text(GAME_WIDTH / 2, logoY - 25, 'ARCANE', {
        fontSize: '52px',
        fontFamily: 'Georgia, serif',
        color: '#6366F1',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5).setAlpha(0);

      const titleCollectors = this.add.text(GAME_WIDTH / 2, logoY + 30, 'COLLECTORS', {
        fontSize: '28px',
        fontFamily: 'Georgia, serif',
        color: '#a5b4fc',
        letterSpacing: 6
      }).setOrigin(0.5).setAlpha(0);

      const subtitle = this.add.text(GAME_WIDTH / 2, logoY + 70, '신화의 교단에서 영웅을 모아라', {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: '#64748b'
      }).setOrigin(0.5).setAlpha(0);

      // 하단 저작권
      const copyright = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, 'YD Studio © 2025', {
        fontSize: '11px',
        fontFamily: 'Arial',
        color: '#334155'
      }).setOrigin(0.5).setAlpha(0);

      // H-9.2: 페이드 인 (600ms)
      this.tweens.add({
        targets: titleArcane,
        alpha: 1,
        y: logoY - 30,
        duration: 600,
        ease: 'Back.easeOut'
      });

      this.tweens.add({
        targets: titleCollectors,
        alpha: 1,
        duration: 600,
        delay: 200,
        ease: 'Quad.easeOut'
      });

      this.tweens.add({
        targets: [subtitle, copyright],
        alpha: 1,
        duration: 400,
        delay: 500,
        ease: 'Quad.easeOut'
      });

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

      // 세션 확인 (스플래시 중 비동기)
      const hasSession = await this._checkExistingSession();

      // H-9.2: 3초 스플래시 후 페이드 아웃
      this.time.delayedCall(2400, () => {
        this.cameras.main.fadeOut(500, 10, 10, 26);
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
      this.add.text(360, 640, '씬 로드 실패\n로그인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('LoginScene');
      });
    }
  }

  /**
   * 기존 Supabase 세션 확인
   * @returns {Promise<boolean>} 세션 유효 여부
   */
  async _checkExistingSession() {
    try {
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
   * 게임 레지스트리 초기화 (PreloadScene 진입 전)
   */
  _initRegistry() {
    const saveData = SaveManager.load();

    this.registry.set('saveData', saveData);
    this.registry.set('gems', saveData.resources.gems);
    this.registry.set('gold', saveData.resources.gold);
    this.registry.set('pityCounter', saveData.gacha.pityCounter);
    this.registry.set('ownedHeroes', normalizeHeroes(saveData.characters));
    this.registry.set('clearedStages', saveData.progress.clearedStages);
    this.registry.set('battleSpeed', saveData.settings.battleSpeed);
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
