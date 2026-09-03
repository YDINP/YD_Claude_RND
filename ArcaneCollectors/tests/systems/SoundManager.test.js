/**
 * SoundManager.test.js
 * SND-01 / SND-02 — 음량 계산 · 키 매핑 · 설정 저장 왕복
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  soundManager,
  computeVolume,
  clamp01,
  normalizeAudioSettings,
  BGM_TRACKS,
  SFX_LIST,
  SCENE_BGM_MAP,
  DEFAULT_AUDIO_SETTINGS,
  BGM_CROSSFADE_MS
} from '../../src/systems/SoundManager.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { BGM_KEYS, SFX_KEYS, audioUrlsFor, eagerAudioKeys, lazyBgmKeys } from '../../src/config/audioAssets.js';

/** 캐시에 항상 오디오가 있다고 답하는 최소 Phaser 씬 더미 */
function makeFakeScene({ locked = false, cached = true } = {}) {
  const played = [];
  const added = [];
  return {
    played,
    added,
    cache: { audio: { exists: () => cached } },
    sound: {
      locked,
      play: (key, cfg) => played.push({ key, ...cfg }),
      add: (key, cfg) => {
        const snd = {
          key,
          isPlaying: false,
          volume: cfg?.volume ?? 0,
          loop: cfg?.loop ?? false,
          play() { this.isPlaying = true; return this; },
          stop() { this.isPlaying = false; return this; },
          setVolume(v) { this.volume = v; return this; }
        };
        added.push(snd);
        return snd;
      }
    },
    // 트윈은 즉시 완료시켜 헤드리스에서도 최종 음량을 검증할 수 있게 한다
    tweens: {
      add: (cfg) => {
        if (typeof cfg.volume === 'number') {
          [].concat(cfg.targets).forEach((t) => t.setVolume?.(cfg.volume));
        }
        cfg.onComplete?.();
        return { remove() {} };
      }
    },
    input: { once: () => {} },
    load: { audio: () => {}, once: () => {}, start: () => {} }
  };
}

function installLocalStorage() {
  const store = {};
  vi.stubGlobal('localStorage', {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  });
  return store;
}

/** 싱글톤이라 테스트마다 내부 상태를 되돌린다 */
function resetManager() {
  soundManager.scene = null;
  soundManager.currentBGM = null;
  soundManager.currentBGMKey = null;
  soundManager._desiredBGMKey = null;
  soundManager._initialized = false;
  soundManager._loadingKeys.clear();
  soundManager.masterVolume = DEFAULT_AUDIO_SETTINGS.master;
  soundManager.bgmVolume = DEFAULT_AUDIO_SETTINGS.bgm;
  soundManager.sfxVolume = DEFAULT_AUDIO_SETTINGS.sfx;
  soundManager.bgmMuted = false;
  soundManager.sfxMuted = false;
}

describe('SoundManager', () => {
  beforeEach(() => {
    installLocalStorage();
    resetManager();
  });

  describe('음량 계산', () => {
    it('clamp01 은 범위를 벗어난 값을 0~1 로 자른다', () => {
      expect(clamp01(-0.5)).toBe(0);
      expect(clamp01(1.7)).toBe(1);
      expect(clamp01(0.42)).toBeCloseTo(0.42);
    });

    it('clamp01 은 숫자가 아닌 값에 fallback 을 돌려준다', () => {
      expect(clamp01(undefined, 0.6)).toBe(0.6);
      expect(clamp01(NaN, 0.3)).toBe(0.3);
      expect(clamp01(null, 0.8)).toBe(0.8);
    });

    it('computeVolume 은 기준·채널·마스터 음량을 곱한다', () => {
      expect(computeVolume(0.5, 0.6, 1.0)).toBeCloseTo(0.3);
      expect(computeVolume(0.4, 0.5, 0.5)).toBeCloseTo(0.1);
    });

    it('computeVolume 은 음소거면 0 을 돌려준다', () => {
      expect(computeVolume(0.9, 1.0, 1.0, true)).toBe(0);
    });

    it('computeVolume 결과는 항상 0~1 이다', () => {
      expect(computeVolume(2, 2, 2)).toBe(1);
      expect(computeVolume(-1, 0.5, 0.5)).toBe(0);
    });
  });

  describe('설정 정규화', () => {
    it('빈 입력이면 기본값이 채워진다', () => {
      expect(normalizeAudioSettings(null)).toEqual({ ...DEFAULT_AUDIO_SETTINGS });
      expect(normalizeAudioSettings(undefined)).toEqual({ ...DEFAULT_AUDIO_SETTINGS });
    });

    it('일부 필드만 있어도 나머지는 기본값으로 채운다', () => {
      const out = normalizeAudioSettings({ bgm: 0.2 });
      expect(out.bgm).toBeCloseTo(0.2);
      expect(out.sfx).toBe(DEFAULT_AUDIO_SETTINGS.sfx);
      expect(out.master).toBe(DEFAULT_AUDIO_SETTINGS.master);
    });

    it('깨진 값은 잘리고 음소거는 boolean 으로 강제된다', () => {
      const out = normalizeAudioSettings({ bgm: 5, sfx: -1, bgmMuted: 'yes', sfxMuted: 0 });
      expect(out.bgm).toBe(1);
      expect(out.sfx).toBe(0);
      expect(out.bgmMuted).toBe(false); // 문자열 'yes' 는 true 로 보지 않는다
      expect(out.sfxMuted).toBe(false);
    });
  });

  describe('키 매핑', () => {
    it('BGM_TRACKS 의 모든 에셋 키가 카탈로그에 있다', () => {
      Object.values(BGM_TRACKS).forEach((t) => expect(BGM_KEYS).toContain(t.key));
    });

    it('SFX_LIST 의 모든 에셋 키가 카탈로그에 있다', () => {
      Object.values(SFX_LIST).forEach((s) => expect(SFX_KEYS).toContain(s.key));
    });

    it('카탈로그 키와 SoundManager 정의 수가 일치한다', () => {
      expect(Object.keys(BGM_TRACKS)).toHaveLength(BGM_KEYS.length);
      expect(Object.keys(SFX_LIST)).toHaveLength(SFX_KEYS.length);
    });

    it('DoD-11 최소 수량을 만족한다 (BGM 3종+, SFX 10종+)', () => {
      expect(BGM_KEYS.length).toBeGreaterThanOrEqual(3);
      expect(SFX_KEYS.length).toBeGreaterThanOrEqual(10);
    });

    it('audioUrlsFor 는 ogg → mp3 순서로 폴더까지 맞춘 경로를 만든다', () => {
      expect(audioUrlsFor('bgm_main')).toEqual([
        'assets/audio/bgm/bgm_main.ogg',
        'assets/audio/bgm/bgm_main.mp3'
      ]);
      expect(audioUrlsFor('sfx_click')).toEqual([
        'assets/audio/sfx/sfx_click.ogg',
        'assets/audio/sfx/sfx_click.mp3'
      ]);
    });

    it('선로드 목록은 SFX 전량 + 로비 BGM, 나머지 BGM 은 지연 로드 대상이다', () => {
      const eager = eagerAudioKeys();
      expect(eager).toContain('bgm_main');
      SFX_KEYS.forEach((k) => expect(eager).toContain(k));
      expect(lazyBgmKeys()).not.toContain('bgm_main');
      expect(lazyBgmKeys()).toContain('bgm_boss');
    });

    it('SCENE_BGM_MAP 의 트랙 이름은 모두 BGM_TRACKS 에 존재한다', () => {
      Object.values(SCENE_BGM_MAP).forEach((track) => {
        if (track === null) return;
        expect(BGM_TRACKS).toHaveProperty(track);
      });
    });
  });

  describe('재생', () => {
    it('BGM 을 틀면 목표 음량까지 페이드된다', () => {
      const scene = makeFakeScene();
      soundManager.init(scene);
      soundManager.playBGM('main_theme');

      const expected = computeVolume(BGM_TRACKS.main_theme.volume, soundManager.bgmVolume, soundManager.masterVolume);
      expect(soundManager.currentBGMKey).toBe('main_theme');
      expect(soundManager.currentBGM.key).toBe('bgm_main');
      expect(soundManager.currentBGM.volume).toBeCloseTo(expected);
    });

    it('같은 트랙을 다시 요청하면 재생성하지 않는다', () => {
      const scene = makeFakeScene();
      soundManager.init(scene);
      soundManager.playBGM('main_theme');
      soundManager.playBGM('main_theme');
      expect(scene.added).toHaveLength(1);
    });

    it('없는 트랙 이름은 조용히 무시한다', () => {
      const scene = makeFakeScene();
      soundManager.init(scene);
      soundManager.playBGM('does_not_exist');
      expect(soundManager.currentBGMKey).toBeNull();
      expect(scene.added).toHaveLength(0);
    });

    it('SFX 는 기준 음량 × 채널 × 마스터로 재생된다', () => {
      const scene = makeFakeScene();
      soundManager.init(scene);
      soundManager.setSFXVolume(0.5);
      soundManager.playSFX('button_click');

      expect(scene.played).toHaveLength(1);
      expect(scene.played[0].key).toBe('sfx_click');
      expect(scene.played[0].volume).toBeCloseTo(SFX_LIST.button_click.volume * 0.5);
    });

    it('오디오 파일이 없으면 아무 것도 재생하지 않는다 (무음 폴백)', () => {
      const scene = makeFakeScene({ cached: false });
      soundManager.init(scene);
      soundManager.playSFX('button_click');
      expect(scene.played).toHaveLength(0);
    });

    it('SFX 음소거 상태에서는 재생하지 않는다', () => {
      const scene = makeFakeScene();
      soundManager.init(scene);
      soundManager.setSFXMuted(true);
      soundManager.playSFX('button_click');
      expect(scene.played).toHaveLength(0);
    });

    it('BGM 음소거를 풀면 마지막으로 요청된 트랙이 다시 재생된다', () => {
      const scene = makeFakeScene();
      soundManager.init(scene);
      soundManager.setBGMMuted(true);
      soundManager.playBGM('battle');
      expect(soundManager.currentBGMKey).toBeNull();

      soundManager.setBGMMuted(false);
      expect(soundManager.currentBGMKey).toBe('battle');
    });

    it('마스터 음량을 바꾸면 재생 중인 BGM 에 즉시 반영된다', () => {
      const scene = makeFakeScene();
      soundManager.init(scene);
      soundManager.playBGM('boss');
      soundManager.setMasterVolume(0.25);

      const expected = computeVolume(BGM_TRACKS.boss.volume, soundManager.bgmVolume, 0.25);
      expect(soundManager.currentBGM.volume).toBeCloseTo(expected);
    });

    it('크로스페이드 기본 길이는 600ms 다', () => {
      expect(BGM_CROSSFADE_MS).toBe(600);
    });
  });

  describe('설정 저장 왕복 (SaveManager settings.audio)', () => {
    it('음량 변경이 SaveManager settings.audio 에 기록된다', () => {
      const scene = makeFakeScene();
      soundManager.init(scene);
      soundManager.setBGMVolume(0.33);
      soundManager.setSFXVolume(0.77);

      const saved = SaveManager.getSettings().audio;
      expect(saved.bgm).toBeCloseTo(0.33);
      expect(saved.sfx).toBeCloseTo(0.77);
    });

    it('저장된 값을 새 세션에서 그대로 복원한다', () => {
      const scene = makeFakeScene();
      soundManager.init(scene);
      soundManager.setBGMVolume(0.15);
      soundManager.setSFXMuted(true);

      resetManager();
      soundManager.init(makeFakeScene());

      expect(soundManager.bgmVolume).toBeCloseTo(0.15);
      expect(soundManager.sfxMuted).toBe(true);
    });

    it('음소거 토글도 저장·복원된다', () => {
      soundManager.init(makeFakeScene());
      expect(soundManager.toggleBGMMute()).toBe(true);

      resetManager();
      soundManager.init(makeFakeScene());
      expect(soundManager.bgmMuted).toBe(true);
    });

    it('신규 세이브의 settings.audio 는 기본값을 갖는다', () => {
      const data = SaveManager.getDefaultSave();
      expect(data.settings.audio).toEqual({ ...DEFAULT_AUDIO_SETTINGS });
    });

    it('settings.audio 가 없는 구세이브도 마이그레이션으로 기본값이 채워진다', () => {
      const legacy = {
        version: 1,
        settings: { bgmVolume: 1, sfxVolume: 1, autoSkip: false, battleSpeed: 1 }
      };
      const migrated = SaveManager.migrate(legacy);
      expect(migrated.settings.audio).toEqual({ ...DEFAULT_AUDIO_SETTINGS });
    });

    it('부분 저장된 audio 필드는 누락분만 기본값으로 보강된다', () => {
      const legacy = { version: 1, settings: { audio: { bgm: 0.1 } } };
      const migrated = SaveManager.migrate(legacy);
      expect(migrated.settings.audio.bgm).toBeCloseTo(0.1);
      expect(migrated.settings.audio.sfx).toBe(DEFAULT_AUDIO_SETTINGS.sfx);
      expect(migrated.settings.audio.bgmMuted).toBe(false);
    });

    it('applySettings 는 여러 값을 한 번에 반영하고 저장한다', () => {
      soundManager.init(makeFakeScene());
      const out = soundManager.applySettings({ bgm: 0.4, sfx: 0.2, sfxMuted: true });

      expect(out.bgm).toBeCloseTo(0.4);
      expect(out.sfx).toBeCloseTo(0.2);
      expect(out.sfxMuted).toBe(true);
      expect(SaveManager.getSettings().audio.sfxMuted).toBe(true);
    });
  });
});
