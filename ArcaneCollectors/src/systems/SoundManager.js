/**
 * SoundManager.js - 사운드 & BGM 매니저 (SND-01 / SND-02)
 *
 * Phaser.Sound 기반 사운드 관리 시스템
 * - BGM 크로스페이드 전환 + 미로드 트랙 지연 로드
 * - SFX 재생 (파일이 없으면 조용히 무시 = 무음 폴백)
 * - 음량/음소거 설정을 SaveManager `settings.audio` 에 저장·복원
 * - 모바일 자동재생 잠금 해제 (첫 pointerdown)
 *
 * 사용법:
 *   import { soundManager } from '../systems/SoundManager.js';
 *   soundManager.init(this);
 *   soundManager.playBGM('main_theme');
 *   soundManager.playSFX('button_click');
 *
 * 설계 메모:
 *   Phaser 의 scene.sound 는 기본적으로 게임 전역 매니저라 씬이 바뀌어도 BGM 이 끊기지 않는다.
 *   반면 페이드에 쓰는 트윈은 씬 소유라 전환 중 죽을 수 있다. 그래서 init() 마다
 *   _applyBGMVolume() 으로 목표 음량을 다시 못박아 「페이드 도중 씬이 바뀌어 소리가 작게 남는」
 *   상태를 복구한다.
 */

import { SaveManager } from './SaveManager.js';
import {
  BGM_KEYS, SFX_KEYS, audioUrlsFor, DEFAULT_AUDIO_SETTINGS
} from '../config/audioAssets.js';
import { EventBus, GameEvents } from './EventBus.js';

/**
 * 게임 이벤트 → 효과음 매핑.
 * 각인(진화)처럼 UI 코드를 건드리지 않고 결과만 알려주는 지점은 이벤트로 붙인다.
 */
const EVENT_SFX_MAP = {
  [GameEvents.HERO_EVOLVED || 'heroEvolved']: 'ascend',
  [GameEvents.LEVEL_UP]: 'levelup'
};

/** BGM 크로스페이드 길이(ms) */
export const BGM_CROSSFADE_MS = 600;

export { DEFAULT_AUDIO_SETTINGS };

// BGM 트랙 정의 (트랙 이름 → 에셋 키 · 기준 음량 · 루프 여부)
const BGM_TRACKS = {
  main_theme: { key: 'bgm_main', volume: 0.4, loop: true },
  battle: { key: 'bgm_battle', volume: 0.5, loop: true },
  boss: { key: 'bgm_boss', volume: 0.55, loop: true },
  gacha: { key: 'bgm_gacha', volume: 0.45, loop: true },
  victory: { key: 'bgm_victory', volume: 0.5, loop: false },
  defeat: { key: 'bgm_defeat', volume: 0.4, loop: false }
};

// SFX 정의 (효과음 이름 → 에셋 키 · 기준 음량)
const SFX_LIST = {
  button_click: { key: 'sfx_click', volume: 0.6 },
  card_flip: { key: 'sfx_card_flip', volume: 0.5 },
  gacha_pull: { key: 'sfx_gacha_pull', volume: 0.7 },
  gacha_ssr: { key: 'sfx_gacha_ssr', volume: 0.8 },
  hit_normal: { key: 'sfx_hit', volume: 0.5 },
  hit_critical: { key: 'sfx_crit', volume: 0.7 },
  heal: { key: 'sfx_heal', volume: 0.5 },
  levelup: { key: 'sfx_levelup', volume: 0.7 },
  ascend: { key: 'sfx_ascend', volume: 0.7 },
  skill_cast: { key: 'sfx_skill', volume: 0.6 },
  victory: { key: 'sfx_victory', volume: 0.6 },
  defeat: { key: 'sfx_defeat', volume: 0.5 },
  ui_open: { key: 'sfx_ui_open', volume: 0.4 },
  ui_close: { key: 'sfx_ui_close', volume: 0.3 },
  coin: { key: 'sfx_coin', volume: 0.4 },
  energy: { key: 'sfx_energy', volume: 0.5 },
  error: { key: 'sfx_error', volume: 0.5 }
};

// 씬별 BGM 매핑 (null = 그 씬은 BGM 을 건드리지 않는다)
const SCENE_BGM_MAP = {
  BootScene: 'main_theme',
  LoginScene: 'main_theme',
  MainMenuScene: 'main_theme',
  StageSelectScene: 'main_theme',
  HeroListScene: 'main_theme',
  HeroDetailScene: 'main_theme',
  PartyEditScene: 'main_theme',
  InventoryScene: 'main_theme',
  QuestScene: 'main_theme',
  SettingsScene: 'main_theme',
  TowerScene: 'battle',
  BattleScene: 'battle',
  GachaScene: 'gacha',
  BattleResultScene: null, // 전투 결과에 따라 동적
  CutsceneScene: null
};

/** 0~1 범위로 자른다 (NaN·문자열·null 은 fallback) */
export function clamp01(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

/**
 * 실제 재생 음량 = 트랙 기준 음량 × 채널 음량 × 마스터 음량 (음소거면 0).
 * @param {number} baseVolume 트랙/효과음 고유 기준 음량
 * @param {number} channelVolume BGM 또는 SFX 채널 음량
 * @param {number} masterVolume 마스터 음량
 * @param {boolean} muted 음소거 여부
 * @returns {number} 0~1
 */
export function computeVolume(baseVolume, channelVolume, masterVolume, muted = false) {
  if (muted) return 0;
  return clamp01(clamp01(baseVolume) * clamp01(channelVolume) * clamp01(masterVolume));
}

/**
 * 저장값을 안전한 설정 객체로 정규화한다.
 * 필드가 없거나 형식이 깨져도 항상 기본값이 채워진 완전한 객체를 돌려준다.
 * @param {Object} raw
 * @returns {{master:number,bgm:number,sfx:number,bgmMuted:boolean,sfxMuted:boolean}}
 */
export function normalizeAudioSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    master: clamp01(src.master, DEFAULT_AUDIO_SETTINGS.master),
    bgm: clamp01(src.bgm, DEFAULT_AUDIO_SETTINGS.bgm),
    sfx: clamp01(src.sfx, DEFAULT_AUDIO_SETTINGS.sfx),
    bgmMuted: src.bgmMuted === true,
    sfxMuted: src.sfxMuted === true
  };
}

class SoundManager {
  constructor() {
    this.scene = null;
    this.currentBGM = null;
    this.currentBGMKey = null;
    this.masterVolume = DEFAULT_AUDIO_SETTINGS.master;
    this.bgmVolume = DEFAULT_AUDIO_SETTINGS.bgm;
    this.sfxVolume = DEFAULT_AUDIO_SETTINGS.sfx;
    this.bgmMuted = DEFAULT_AUDIO_SETTINGS.bgmMuted;
    this.sfxMuted = DEFAULT_AUDIO_SETTINGS.sfxMuted;
    this._initialized = false;
    /** 음소거 등으로 지금은 못 트는 트랙 이름. 해제되면 이걸 다시 튼다 */
    this._desiredBGMKey = null;
    /** 지연 로드 중인 오디오 키 */
    this._loadingKeys = new Set();
    /** EventBus 구독을 한 번만 걸기 위한 플래그 */
    this._eventsBound = false;
  }

  /**
   * 씬 연결 (각 씬 create() 에서 호출)
   * @param {Phaser.Scene} scene
   */
  init(scene) {
    this.scene = scene;

    if (!this._initialized) {
      this.loadSettings();
      this._bindGameEvents();
      this._initialized = true;
    }

    this._installUnlockHandler();
    // 씬 전환 중 페이드 트윈이 끊겼을 수 있어 목표 음량을 다시 못박는다
    this._applyBGMVolume();
  }

  // ==================== BGM ====================

  /**
   * BGM 재생. 파일이 아직 없으면 지연 로드 후 재생한다.
   * @param {string} trackName BGM_TRACKS 키
   * @param {number} fadeInDuration 페이드인 시간(ms)
   */
  playBGM(trackName, fadeInDuration = BGM_CROSSFADE_MS) {
    const track = BGM_TRACKS[trackName];
    if (!track) return;

    this._desiredBGMKey = trackName;

    if (!this.scene) return;
    if (this.bgmMuted) return;
    if (this.currentBGMKey === trackName && this.currentBGM?.isPlaying) return;

    if (!this._audioExists(track.key)) {
      this._lazyLoadAudio(track.key, () => {
        // 로드가 끝날 때까지 사용자가 다른 화면으로 갔을 수 있다
        if (this._desiredBGMKey === trackName) this.playBGM(trackName, fadeInDuration);
      });
      return;
    }

    this._fadeOutCurrent(fadeInDuration);

    const sound = this.scene.sound.add(track.key, { volume: 0, loop: track.loop });
    sound.play();
    this.currentBGM = sound;
    this.currentBGMKey = trackName;

    const target = computeVolume(track.volume, this.bgmVolume, this.masterVolume, this.bgmMuted);
    this._tweenVolume(sound, target, fadeInDuration);
  }

  /**
   * BGM 정지
   * @param {number} fadeOutDuration
   */
  stopBGM(fadeOutDuration = BGM_CROSSFADE_MS) {
    this._desiredBGMKey = null;
    this._fadeOutCurrent(fadeOutDuration);
    this.currentBGM = null;
    this.currentBGMKey = null;
  }

  /** 씬 전환 시 자동 BGM 전환 */
  onSceneChange(sceneName) {
    const trackName = SCENE_BGM_MAP[sceneName];
    if (trackName) this.playBGM(trackName);
  }

  // ==================== SFX ====================

  /**
   * SFX 재생. 파일이 없으면 아무 일도 하지 않는다(무음 폴백).
   * @param {string} sfxName SFX_LIST 키
   */
  playSFX(sfxName) {
    if (!this.scene || this.sfxMuted) return;

    const sfx = SFX_LIST[sfxName];
    if (!sfx || !this._audioExists(sfx.key)) return;

    const volume = computeVolume(sfx.volume, this.sfxVolume, this.masterVolume, this.sfxMuted);
    if (volume <= 0) return;

    try {
      this.scene.sound.play(sfx.key, { volume });
    } catch {
      /* 디코드 실패 등은 무음으로 흡수한다 */
    }
  }

  // ==================== 볼륨 컨트롤 ====================

  setMasterVolume(vol) {
    this.masterVolume = clamp01(vol, DEFAULT_AUDIO_SETTINGS.master);
    this._applyBGMVolume();
    this.saveSettings();
    return this.masterVolume;
  }

  setBGMVolume(vol) {
    this.bgmVolume = clamp01(vol, DEFAULT_AUDIO_SETTINGS.bgm);
    this._applyBGMVolume();
    this.saveSettings();
    return this.bgmVolume;
  }

  setSFXVolume(vol) {
    this.sfxVolume = clamp01(vol, DEFAULT_AUDIO_SETTINGS.sfx);
    this.saveSettings();
    return this.sfxVolume;
  }

  /**
   * BGM 음소거 설정. 해제하면 마지막으로 요청된 트랙을 다시 튼다.
   * @param {boolean} muted
   */
  setBGMMuted(muted) {
    this.bgmMuted = muted === true;
    if (this.bgmMuted) {
      if (this.currentBGM) {
        try { this.currentBGM.stop(); } catch { /* 무시 */ }
      }
      this.currentBGM = null;
      this.currentBGMKey = null;
    } else if (this._desiredBGMKey) {
      this.playBGM(this._desiredBGMKey);
    }
    this.saveSettings();
    return this.bgmMuted;
  }

  setSFXMuted(muted) {
    this.sfxMuted = muted === true;
    this.saveSettings();
    return this.sfxMuted;
  }

  toggleBGMMute() {
    return this.setBGMMuted(!this.bgmMuted);
  }

  toggleSFXMute() {
    return this.setSFXMuted(!this.sfxMuted);
  }

  // ==================== 설정 저장/복원 ====================

  /** 현재 설정 스냅샷 */
  getSettings() {
    return {
      master: this.masterVolume,
      bgm: this.bgmVolume,
      sfx: this.sfxVolume,
      bgmMuted: this.bgmMuted,
      sfxMuted: this.sfxMuted
    };
  }

  /** 설정을 한 번에 적용 (슬라이더 드래그 종료 등) */
  applySettings(partial) {
    const merged = normalizeAudioSettings({ ...this.getSettings(), ...(partial || {}) });
    this.masterVolume = merged.master;
    this.bgmVolume = merged.bgm;
    this.sfxVolume = merged.sfx;
    this.sfxMuted = merged.sfxMuted;
    this.setBGMMuted(merged.bgmMuted); // 내부에서 saveSettings 까지 수행
    this._applyBGMVolume();
    return this.getSettings();
  }

  /** SaveManager `settings.audio` 에 기록 */
  saveSettings() {
    try {
      SaveManager.updateSettings({ audio: this.getSettings() });
    } catch {
      /* 저장 실패는 재생을 막지 않는다 */
    }
  }

  /** SaveManager `settings.audio` 에서 복원 */
  loadSettings() {
    let stored = null;
    try {
      stored = SaveManager.getSettings()?.audio ?? null;
    } catch {
      stored = null;
    }
    const merged = normalizeAudioSettings(stored);
    this.masterVolume = merged.master;
    this.bgmVolume = merged.bgm;
    this.sfxVolume = merged.sfx;
    this.bgmMuted = merged.bgmMuted;
    this.sfxMuted = merged.sfxMuted;
    return this.getSettings();
  }

  // ==================== 내부 ====================

  /**
   * 게임 이벤트에 효과음을 한 번만 연결한다.
   * 씬이 바뀌어도 구독은 유지되며, 씬이 없으면 playSFX 가 알아서 무시한다.
   */
  _bindGameEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    Object.entries(EVENT_SFX_MAP).forEach(([event, sfxName]) => {
      try {
        EventBus.on(event, () => this.playSFX(sfxName));
      } catch {
        /* EventBus 가 없는 환경(단위 테스트)에서는 조용히 넘어간다 */
      }
    });
  }

  /** 해당 키의 오디오가 캐시에 있는지 */
  _audioExists(key) {
    return !!this.scene?.cache?.audio?.exists?.(key);
  }

  /**
   * 미로드 오디오를 씬 로더로 받아온다. 실패해도 조용히 무시(무음 폴백).
   * @param {string} key
   * @param {Function} onDone
   */
  _lazyLoadAudio(key, onDone) {
    const loader = this.scene?.load;
    if (!loader || this._loadingKeys.has(key)) return;
    if (!BGM_KEYS.includes(key) && !SFX_KEYS.includes(key)) return;
    // 아직 사용자 제스처가 없어 재생 자체가 막힌 상태라면 받아봐야 소용이 없다.
    // 스플래시(BootScene)에서 ~900KB BGM 을 미리 받는 것도 이 가드가 막는다.
    if (this.scene?.sound?.locked) return;

    this._loadingKeys.add(key);
    try {
      loader.audio(key, audioUrlsFor(key));
      loader.once('complete', () => {
        this._loadingKeys.delete(key);
        if (this._audioExists(key)) onDone();
      });
      loader.once('loaderror', () => {
        this._loadingKeys.delete(key);
        console.warn(`[SoundManager] 오디오 로드 실패, 무음 폴백: ${key}`);
      });
      loader.start();
    } catch {
      this._loadingKeys.delete(key);
    }
  }

  /** 현재 BGM 을 페이드아웃 후 정지 */
  _fadeOutCurrent(duration) {
    const old = this.currentBGM;
    if (!old || !old.isPlaying) return;

    const stop = () => { try { old.stop(); } catch { /* 무시 */ } };
    if (!this.scene?.tweens) { stop(); return; }
    this.scene.tweens.add({ targets: old, volume: 0, duration, onComplete: stop });
  }

  /** 트윈이 없으면 즉시 목표 음량을 적용한다(테스트/헤드리스 안전) */
  _tweenVolume(sound, target, duration) {
    if (!this.scene?.tweens || duration <= 0) {
      try { sound.setVolume(target); } catch { /* 무시 */ }
      return;
    }
    this.scene.tweens.add({
      targets: sound,
      volume: target,
      duration,
      onComplete: () => { try { sound.setVolume(target); } catch { /* 무시 */ } }
    });
  }

  /** 현재 재생 중인 BGM 에 목표 음량을 즉시 반영 */
  _applyBGMVolume() {
    if (!this.currentBGM || !this.currentBGMKey) return;
    const track = BGM_TRACKS[this.currentBGMKey];
    if (!track) return;
    const target = computeVolume(track.volume, this.bgmVolume, this.masterVolume, this.bgmMuted);
    try { this.currentBGM.setVolume(target); } catch { /* 무시 */ }
  }

  /**
   * 모바일 자동재생 잠금 해제.
   * 첫 pointerdown 에서 AudioContext 를 깨우고, 대기 중이던 BGM 을 재생한다.
   */
  _installUnlockHandler() {
    const scene = this.scene;
    if (!scene?.sound || !scene.input?.once) return;
    if (!scene.sound.locked) return;

    scene.input.once('pointerdown', () => {
      try {
        scene.sound.context?.resume?.();
        scene.sound.unlock?.();
      } catch { /* 무시 */ }
      if (this._desiredBGMKey && !this.bgmMuted) {
        this.playBGM(this._desiredBGMKey, 0);
      }
    });
  }
}

// 싱글톤
export const soundManager = new SoundManager();

// 상수 export (외부에서 트랙/SFX 목록 참조 가능)
export { BGM_TRACKS, SFX_LIST, SCENE_BGM_MAP };

export default soundManager;
