/**
 * AudioGenerator.js
 * Web Audio API 오실레이터 기반 8비트 효과음 프로시저럴 생성기
 *
 * 외부 음원 파일(.ogg/.mp3) 없이 즉시 재생 가능
 * 브라우저 환경 전용 (Vitest에서는 자동 mock 처리됨)
 *
 * 사용법:
 *   import { AudioGenerator } from '../systems/AudioGenerator.js';
 *   AudioGenerator.playClick();
 *   AudioGenerator.playGachaRoll();
 *   AudioGenerator.playSSRFanfare();
 *
 * SoundManager와의 관계:
 *   SoundManager는 Phaser.Sound 기반으로 파일 로드 담당
 *   AudioGenerator는 파일 없이 Web Audio API로 즉시 효과음 재생 담당
 *   두 시스템은 독립적으로 사용 가능 (중복 아님)
 */

// AudioContext 싱글톤 (브라우저 정책: 유저 제스처 후 생성 권장)
let _audioCtx = null;
let _bgmNodes = null;  // BGM 루프 상태

/** AudioContext 지연 초기화 */
function _getAudioCtx() {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    return null;
  }

  if (!_audioCtx || _audioCtx.state === 'closed') {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[AudioGenerator] AudioContext 생성 실패:', e);
      return null;
    }
  }

  // 브라우저 자동재생 정책: suspended 상태면 resume 시도
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }

  return _audioCtx;
}

/**
 * 오실레이터 노드 생성 헬퍼
 * @param {AudioContext} ctx
 * @param {string} type         - 'sine' | 'square' | 'sawtooth' | 'triangle'
 * @param {number} freq         - 시작 주파수 (Hz)
 * @param {number} startTime    - 시작 시각
 * @param {number} duration     - 지속 시간 (초)
 * @param {number} volume       - 음량 (0.0 ~ 1.0)
 * @param {Object} [freqEnv]    - 주파수 엔벨로프 { targetFreq, time }
 * @returns {{ osc, gain }}
 */
function _createOscillator(ctx, type, freq, startTime, duration, volume, freqEnv = null) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  if (freqEnv) {
    osc.frequency.linearRampToValueAtTime(freqEnv.targetFreq, startTime + freqEnv.time);
  }

  // ADSR 엔벨로프 (Attack-Decay-Sustain-Release)
  const attack = 0.005;
  const release = Math.min(0.1, duration * 0.3);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + attack);
  gain.gain.setValueAtTime(volume, startTime + duration - release);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);

  return { osc, gain };
}

export class AudioGenerator {
  /**
   * 8비트 클릭음 (UI 버튼 탭)
   * - 짧은 square wave 버스트
   */
  static playClick() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    _createOscillator(ctx, 'square', 880, now, 0.08, 0.15);
    _createOscillator(ctx, 'square', 660, now + 0.04, 0.06, 0.1);
  }

  /**
   * UI 오픈 효과음 (팝업/패널 열기)
   * - 상승 슬라이드
   */
  static playUIOpen() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    _createOscillator(ctx, 'triangle', 440, now, 0.12, 0.2, {
      targetFreq: 880,
      time: 0.12
    });
  }

  /**
   * UI 닫기 효과음 (팝업/패널 닫기)
   * - 하강 슬라이드
   */
  static playUIClose() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    _createOscillator(ctx, 'triangle', 880, now, 0.12, 0.15, {
      targetFreq: 440,
      time: 0.12
    });
  }

  /**
   * 가챠 롤 효과음 (상승 글리산도)
   * - 저→고 주파수 연속 스윕 + 노이즈 트레몰로
   */
  static playGachaRoll() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 메인 글리산도 (스위프)
    _createOscillator(ctx, 'sawtooth', 200, now, 1.2, 0.25, {
      targetFreq: 1200,
      time: 1.0
    });

    // 하모닉 레이어 (5도 화음)
    _createOscillator(ctx, 'triangle', 300, now, 1.2, 0.12, {
      targetFreq: 1800,
      time: 1.0
    });

    // 트레몰로 모방 (빠른 AM 변조)
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(600, now + 1.0);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(20, now);
    lfoGain.gain.setValueAtTime(0.08, now);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 1.2);

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 1.2);
    lfo.start(now);
    lfo.stop(now + 1.2);
  }

  /**
   * SSR 팡파레 (4음 상승 아르페지오 + 서스테인)
   * - C4 → E4 → G4 → C5 + 오케스트라 느낌
   */
  static playSSRFanfare() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 아르페지오 음정 (C, E, G, C 옥타브)
    const notes = [261.63, 329.63, 392.00, 523.25];
    const delays = [0, 0.12, 0.24, 0.36];
    const duration = 0.6;

    notes.forEach((freq, i) => {
      const t = now + delays[i];

      // 메인 사인파 (부드러운)
      _createOscillator(ctx, 'sine', freq, t, duration, 0.25);

      // 배음 (square - 8비트 느낌)
      _createOscillator(ctx, 'square', freq * 2, t, duration * 0.7, 0.08);
    });

    // 마지막 음 서스테인 + 글리터 이펙트
    const lastT = now + 0.36 + 0.5;
    _createOscillator(ctx, 'sine', 523.25, lastT, 0.8, 0.2);
    _createOscillator(ctx, 'triangle', 1046.5, lastT, 0.5, 0.1);

    // 빛나는 피콜로 느낌
    for (let i = 0; i < 5; i++) {
      const sparkFreq = 800 + i * 200;
      const sparkT = lastT + i * 0.05;
      _createOscillator(ctx, 'sine', sparkFreq, sparkT, 0.15, 0.06);
    }
  }

  /**
   * 전투 타격음 (단타)
   * - 임팩트 노이즈 + 피치 다운
   */
  static playHit() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 메인 타격 (square + 피치 다운)
    _createOscillator(ctx, 'square', 400, now, 0.1, 0.3, {
      targetFreq: 80,
      time: 0.08
    });

    // 노이즈 층 (sawtooth 버스트)
    _createOscillator(ctx, 'sawtooth', 200, now, 0.06, 0.2, {
      targetFreq: 50,
      time: 0.06
    });
  }

  /**
   * 크리티컬 타격음 (강타)
   * - 더 강하고 낮은 임팩트
   */
  static playHitCritical() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    _createOscillator(ctx, 'square', 600, now, 0.15, 0.4, {
      targetFreq: 60,
      time: 0.12
    });
    _createOscillator(ctx, 'sawtooth', 300, now, 0.08, 0.3, {
      targetFreq: 40,
      time: 0.08
    });
    // 충격 잔향
    _createOscillator(ctx, 'sine', 120, now + 0.05, 0.2, 0.15, {
      targetFreq: 40,
      time: 0.2
    });
  }

  /**
   * 스킬 발동음
   * - 마법/에너지 충전 느낌 (상승 + 방출)
   */
  static playSkill() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 충전 단계 (상승)
    _createOscillator(ctx, 'sine', 300, now, 0.3, 0.2, {
      targetFreq: 800,
      time: 0.25
    });
    _createOscillator(ctx, 'triangle', 450, now, 0.3, 0.1, {
      targetFreq: 1200,
      time: 0.25
    });

    // 방출 (폭발)
    _createOscillator(ctx, 'sawtooth', 600, now + 0.28, 0.2, 0.3, {
      targetFreq: 100,
      time: 0.15
    });
  }

  /**
   * 각성 완료 사운드 (히어로 각성)
   * - 장엄한 오케스트라 빌드업 + 팡파레
   */
  static playAwakening() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 빌드업 (저음 럼블)
    _createOscillator(ctx, 'sawtooth', 60, now, 0.8, 0.3, {
      targetFreq: 120,
      time: 0.8
    });

    // 중음 상승
    _createOscillator(ctx, 'triangle', 220, now + 0.4, 0.6, 0.2, {
      targetFreq: 660,
      time: 0.5
    });

    // 클라이맥스 (높은 아르페지오)
    const awakeNotes = [440, 554.37, 659.25, 880];
    awakeNotes.forEach((freq, i) => {
      const t = now + 0.8 + i * 0.1;
      _createOscillator(ctx, 'sine', freq, t, 0.5, 0.25);
      _createOscillator(ctx, 'square', freq * 2, t, 0.3, 0.06);
    });

    // 마무리 글리터
    for (let i = 0; i < 8; i++) {
      const t = now + 1.2 + i * 0.04;
      const freq = 880 + i * 150;
      _createOscillator(ctx, 'sine', freq, t, 0.12, 0.08);
    }
  }

  /**
   * 레벨업 효과음
   * - 경쾌한 상승 멜로디
   */
  static playLevelUp() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    const lvlNotes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
    lvlNotes.forEach((freq, i) => {
      const t = now + i * 0.08;
      _createOscillator(ctx, 'sine', freq, t, 0.25, 0.2);
    });
  }

  /**
   * 코인/골드 획득음
   * - 경쾌한 동전 소리
   */
  static playCoin() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    _createOscillator(ctx, 'sine', 1200, now, 0.1, 0.2, {
      targetFreq: 800,
      time: 0.08
    });
    _createOscillator(ctx, 'sine', 1600, now + 0.06, 0.08, 0.15, {
      targetFreq: 1000,
      time: 0.06
    });
  }

  /**
   * 전투 BGM 루프 시작 (간단한 8비트 멜로디 패턴)
   * - 루프 기반 패턴 플레이어
   */
  static startBattleBGM() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    this.stopBGM();  // 기존 BGM 중지

    // 간단한 8비트 배틀 멜로디 (C단조)
    const melodyPattern = [
      // [freq, duration(초), volume]
      [261.63, 0.2, 0.15],  // C4
      [311.13, 0.1, 0.12],  // Eb4
      [392.00, 0.2, 0.15],  // G4
      [349.23, 0.1, 0.12],  // F4
      [329.63, 0.2, 0.13],  // E4
      [261.63, 0.1, 0.10],  // C4
      [349.23, 0.2, 0.13],  // F4
      [311.13, 0.4, 0.15],  // Eb4 (롱)
    ];

    // 베이스 패턴
    const bassPattern = [
      [65.41,  0.4, 0.1],   // C2
      [98.00,  0.4, 0.1],   // G2
      [87.31,  0.4, 0.1],   // F2
      [82.41,  0.4, 0.1],   // E2
    ];

    const totalDuration = melodyPattern.reduce((sum, n) => sum + n[1], 0);

    let _loopActive = true;
    let _startTime = ctx.currentTime;

    const scheduleLoop = () => {
      if (!_loopActive) return;

      const now = _startTime;
      let t = now;

      // 멜로디 스케줄
      melodyPattern.forEach(([freq, dur, vol]) => {
        _createOscillator(ctx, 'square', freq, t, dur * 0.85, vol);
        t += dur;
      });

      // 베이스 스케줄
      let bt = now;
      bassPattern.forEach(([freq, dur, vol]) => {
        _createOscillator(ctx, 'sine', freq, bt, dur * 0.9, vol);
        bt += dur;
      });

      _startTime = now + totalDuration;

      // 다음 루프 예약 (루프 끊김 방지를 위해 100ms 전에 스케줄)
      const timeout = (totalDuration - 0.1) * 1000;
      const timerId = setTimeout(() => {
        if (_loopActive) scheduleLoop();
      }, Math.max(0, timeout));

      _bgmNodes = { loopActive: () => _loopActive, stopLoop: () => {
        _loopActive = false;
        clearTimeout(timerId);
      }};
    };

    scheduleLoop();
  }

  /**
   * 메인메뉴 BGM 루프 시작 (잔잔한 8비트 멜로디)
   */
  static startMainMenuBGM() {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    this.stopBGM();

    const melodyPattern = [
      [523.25, 0.3, 0.1],   // C5
      [659.25, 0.15, 0.08], // E5
      [783.99, 0.3, 0.1],   // G5
      [659.25, 0.15, 0.08], // E5
      [587.33, 0.3, 0.09],  // D5
      [523.25, 0.15, 0.08], // C5
      [493.88, 0.3, 0.09],  // B4
      [440.00, 0.45, 0.1],  // A4 (롱)
    ];

    const totalDuration = melodyPattern.reduce((sum, n) => sum + n[1], 0);
    let _loopActive = true;
    let _startTime = ctx.currentTime;

    const scheduleLoop = () => {
      if (!_loopActive) return;

      const now = _startTime;
      let t = now;

      melodyPattern.forEach(([freq, dur, vol]) => {
        _createOscillator(ctx, 'triangle', freq, t, dur * 0.8, vol);
        t += dur;
      });

      _startTime = now + totalDuration;

      const timeout = (totalDuration - 0.1) * 1000;
      const timerId = setTimeout(() => {
        if (_loopActive) scheduleLoop();
      }, Math.max(0, timeout));

      _bgmNodes = { loopActive: () => _loopActive, stopLoop: () => {
        _loopActive = false;
        clearTimeout(timerId);
      }};
    };

    scheduleLoop();
  }

  /**
   * BGM 정지
   */
  static stopBGM() {
    if (_bgmNodes && typeof _bgmNodes.stopLoop === 'function') {
      _bgmNodes.stopLoop();
    }
    _bgmNodes = null;
  }

  /**
   * AudioContext 재개 (유저 제스처 후 호출)
   * - 모바일 브라우저 자동재생 정책 대응
   */
  static resume() {
    const ctx = _getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      return ctx.resume();
    }
    return Promise.resolve();
  }

  /**
   * AudioContext 종료 (앱 종료 시)
   */
  static dispose() {
    this.stopBGM();
    if (_audioCtx && _audioCtx.state !== 'closed') {
      _audioCtx.close().catch(() => {});
      _audioCtx = null;
    }
  }
}

export default AudioGenerator;
