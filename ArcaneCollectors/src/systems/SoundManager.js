/**
 * SoundManager.js - 사운드 & BGM 매니저
 * H-7: Sound & BGM Asset Plan
 *
 * Phaser.Sound 기반 사운드 관리 시스템
 * - BGM 자동 재생/전환 (크로스페이드)
 * - SFX 동시 재생 풀링
 * - 음량 설정 저장/로드
 * - 뮤트/마스터볼륨
 *
 * 사용법:
 *   import { soundManager } from '../systems/SoundManager.js';
 *   soundManager.init(scene);
 *   soundManager.playBGM('main_theme');
 *   soundManager.playSFX('button_click');
 */

import { SaveManager } from './SaveManager.js';

// BGM 트랙 정의
const BGM_TRACKS = {
  main_theme: { key: 'bgm_main', volume: 0.4, loop: true },
  battle: { key: 'bgm_battle', volume: 0.5, loop: true },
  boss: { key: 'bgm_boss', volume: 0.55, loop: true },
  gacha: { key: 'bgm_gacha', volume: 0.45, loop: true },
  victory: { key: 'bgm_victory', volume: 0.5, loop: false },
  defeat: { key: 'bgm_defeat', volume: 0.4, loop: false }
};

// SFX 정의
const SFX_LIST = {
  button_click: { key: 'sfx_click', volume: 0.6 },
  card_flip: { key: 'sfx_card_flip', volume: 0.5 },
  gacha_pull: { key: 'sfx_gacha_pull', volume: 0.7 },
  gacha_ssr: { key: 'sfx_gacha_ssr', volume: 0.8 },
  hit_normal: { key: 'sfx_hit', volume: 0.5 },
  hit_critical: { key: 'sfx_crit', volume: 0.7 },
  heal: { key: 'sfx_heal', volume: 0.5 },
  levelup: { key: 'sfx_levelup', volume: 0.7 },
  skill_cast: { key: 'sfx_skill', volume: 0.6 },
  victory: { key: 'sfx_victory', volume: 0.6 },
  defeat: { key: 'sfx_defeat', volume: 0.5 },
  ui_open: { key: 'sfx_ui_open', volume: 0.4 },
  ui_close: { key: 'sfx_ui_close', volume: 0.3 },
  coin: { key: 'sfx_coin', volume: 0.4 }
};

// 씬별 BGM 매핑
const SCENE_BGM_MAP = {
  MainMenuScene: 'main_theme',
  BattleScene: 'battle',
  GachaScene: 'gacha',
  BattleResultScene: null // 전투 결과에 따라 동적
};

class SoundManager {
  constructor() {
    this.scene = null;
    this.currentBGM = null;
    this.currentBGMKey = null;
    this.masterVolume = 1.0;
    this.bgmVolume = 0.5;
    this.sfxVolume = 0.7;
    this.bgmMuted = false;
    this.sfxMuted = false;
    this._initialized = false;
    this._sfxCache = {};
  }

  /**
   * 씬 연결 (각 씬 create()에서 호출)
   * @param {Phaser.Scene} scene
   */
  init(scene) {
    this.scene = scene;

    if (!this._initialized) {
      this._loadSettings();
      this._initialized = true;
    }
  }

  /**
   * BGM 재생
   * @param {string} trackName - BGM_TRACKS 키
   * @param {number} fadeInDuration - 페이드인 시간(ms)
   */
  playBGM(trackName, fadeInDuration = 500) {
    if (!this.scene || this.bgmMuted) return;

    const track = BGM_TRACKS[trackName];
    if (!track) return;

    // 같은 BGM이면 무시
    if (this.currentBGMKey === trackName && this.currentBGM?.isPlaying) return;

    // 기존 BGM 페이드아웃
    if (this.currentBGM && this.currentBGM.isPlaying) {
      const oldBGM = this.currentBGM;
      this.scene.tweens.add({
        targets: oldBGM,
        volume: 0,
        duration: 300,
        onComplete: () => oldBGM.stop()
      });
    }

    // 새 BGM 재생 (사운드 파일이 로드된 경우에만)
    if (this.scene.cache.audio.exists(track.key)) {
      this.currentBGM = this.scene.sound.add(track.key, {
        volume: 0,
        loop: track.loop
      });
      this.currentBGM.play();

      // 페이드인
      const targetVolume = track.volume * this.bgmVolume * this.masterVolume;
      this.scene.tweens.add({
        targets: this.currentBGM,
        volume: targetVolume,
        duration: fadeInDuration
      });

      this.currentBGMKey = trackName;
    }
  }

  /**
   * BGM 정지
   * @param {number} fadeOutDuration
   */
  stopBGM(fadeOutDuration = 500) {
    if (!this.scene || !this.currentBGM) return;

    const bgm = this.currentBGM;
    this.scene.tweens.add({
      targets: bgm,
      volume: 0,
      duration: fadeOutDuration,
      onComplete: () => {
        bgm.stop();
      }
    });

    this.currentBGM = null;
    this.currentBGMKey = null;
  }

  /**
   * SFX 재생
   * @param {string} sfxName - SFX_LIST 키
   */
  playSFX(sfxName) {
    if (!this.scene || this.sfxMuted) return;

    const sfx = SFX_LIST[sfxName];
    if (!sfx) return;

    if (this.scene.cache.audio.exists(sfx.key)) {
      const volume = sfx.volume * this.sfxVolume * this.masterVolume;
      this.scene.sound.play(sfx.key, { volume });
    }
  }

  /**
   * 씬 전환 시 자동 BGM 전환
   * @param {string} sceneName
   */
  onSceneChange(sceneName) {
    const bgmKey = SCENE_BGM_MAP[sceneName];
    if (bgmKey !== undefined) {
      if (bgmKey) {
        this.playBGM(bgmKey);
      } else {
        // null이면 BGM 유지
      }
    }
  }

  // ==================== 볼륨 컨트롤 ====================

  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    this._updateBGMVolume();
    this._saveSettings();
  }

  setBGMVolume(vol) {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
    this._updateBGMVolume();
    this._saveSettings();
  }

  setSFXVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    this._saveSettings();
  }

  toggleBGMMute() {
    this.bgmMuted = !this.bgmMuted;
    if (this.bgmMuted && this.currentBGM) {
      this.currentBGM.pause();
    } else if (!this.bgmMuted && this.currentBGM) {
      this.currentBGM.resume();
    }
    this._saveSettings();
    return this.bgmMuted;
  }

  toggleSFXMute() {
    this.sfxMuted = !this.sfxMuted;
    this._saveSettings();
    return this.sfxMuted;
  }

  _updateBGMVolume() {
    if (this.currentBGM && this.currentBGMKey) {
      const track = BGM_TRACKS[this.currentBGMKey];
      if (track) {
        this.currentBGM.setVolume(track.volume * this.bgmVolume * this.masterVolume);
      }
    }
  }

  _saveSettings() {
    try {
      localStorage.setItem('arcane_sound_settings', JSON.stringify({
        masterVolume: this.masterVolume,
        bgmVolume: this.bgmVolume,
        sfxVolume: this.sfxVolume,
        bgmMuted: this.bgmMuted,
        sfxMuted: this.sfxMuted
      }));
    } catch (e) { /* 무시 */ }
  }

  _loadSettings() {
    try {
      const saved = localStorage.getItem('arcane_sound_settings');
      if (saved) {
        const s = JSON.parse(saved);
        this.masterVolume = s.masterVolume ?? 1.0;
        this.bgmVolume = s.bgmVolume ?? 0.5;
        this.sfxVolume = s.sfxVolume ?? 0.7;
        this.bgmMuted = s.bgmMuted ?? false;
        this.sfxMuted = s.sfxMuted ?? false;
      }
    } catch (e) { /* 무시 */ }
  }

  /**
   * 사운드 설정 조회
   */
  getSettings() {
    return {
      masterVolume: this.masterVolume,
      bgmVolume: this.bgmVolume,
      sfxVolume: this.sfxVolume,
      bgmMuted: this.bgmMuted,
      sfxMuted: this.sfxMuted
    };
  }
}

// 싱글톤
export const soundManager = new SoundManager();

// 상수 export (외부에서 트랙/SFX 목록 참조 가능)
export { BGM_TRACKS, SFX_LIST, SCENE_BGM_MAP };

export default soundManager;
