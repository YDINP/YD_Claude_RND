/**
 * gen-sfx.mjs - SND-02 SFX 합성 파이프라인
 *
 * synth.mjs 프리미티브로 WAV 를 만들고 ffmpeg 으로
 * public/assets/audio/sfx/<key>.ogg / .mp3 로 굽는다.
 * 레시피 키는 src/systems/SoundManager.js 의 SFX_LIST 키와 정확히 일치해야 한다.
 *
 * 사용법:
 *   node tools/audio/gen-sfx.mjs
 *   node tools/audio/gen-sfx.mjs --only=sfx_click,sfx_coin
 *   node tools/audio/gen-sfx.mjs --keep-wav
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  buffer, addOsc, adsr, decayEnv, lowpass, highpass, echo,
  deClick, normalize, toWav
} from './synth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(PROJECT_ROOT, 'public', 'assets', 'audio', 'sfx');

/** 결과 파일 크기 상한 (바이트). 넘으면 경고 */
const SIZE_WARN_BYTES = 50 * 1024;

/** 서양음계 주파수 (A4=440 기준) */
const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50, E6: 1318.51, G6: 1567.98, C7: 2093.00
};

/** 상승 아르페지오 헬퍼 — 음 하나당 step 초 간격으로 사인+삼각 레이어를 쌓는다 */
function arpeggio(buf, notes, { step = 0.07, gain = 0.4, ring = 0.28, seedBase = 11 }) {
  notes.forEach((f, i) => {
    const env = decayEnv(ring * 0.45, 0.004);
    addOsc(buf, { type: 'sine', freq: f, gain, env, start: i * step, dur: ring, seed: seedBase + i });
    addOsc(buf, { type: 'triangle', freq: f * 2, gain: gain * 0.3, env, start: i * step, dur: ring, seed: seedBase + i });
  });
  return buf;
}

/**
 * SFX 레시피. 각 항목은 Float32Array 를 반환한다.
 * SoundManager.SFX_LIST 의 key 와 1:1 대응.
 */
const RECIPES = {
  /** 버튼 클릭 — 짧고 건조한 상승 블립 */
  sfx_click: () => {
    const b = buffer(0.09);
    addOsc(b, { type: 'square', freq: 1100, freqEnd: 1700, gain: 0.35, env: decayEnv(0.018), duty: 0.35 });
    addOsc(b, { type: 'sine', freq: 2200, freqEnd: 3300, gain: 0.15, env: decayEnv(0.012) });
    addOsc(b, { type: 'noise', gain: 0.10, env: decayEnv(0.006), seed: 7 });
    return highpass(b, 400);
  },

  /** 카드 뒤집기 — 노이즈 스와이프 + 종이 스냅 */
  sfx_card_flip: () => {
    const b = buffer(0.22);
    addOsc(b, { type: 'noise', gain: 0.55, env: adsr({ attack: 0.03, decay: 0.06, sustain: 0.35, release: 0.11 }), seed: 21 });
    lowpass(b, 3600);
    highpass(b, 700);
    addOsc(b, { type: 'sine', freq: 520, freqEnd: 1400, gain: 0.22, env: decayEnv(0.05), start: 0.02, dur: 0.15 });
    return b;
  },

  /** 소환 시작 — 상승 스윕 + 하모닉 슈머 */
  sfx_gacha_pull: () => {
    const b = buffer(1.1);
    addOsc(b, { type: 'saw', freq: 110, freqEnd: 1500, gain: 0.22, env: adsr({ attack: 0.25, decay: 0.2, sustain: 0.8, release: 0.35 }) });
    addOsc(b, { type: 'sine', freq: 220, freqEnd: 3000, gain: 0.18, env: adsr({ attack: 0.3, decay: 0.2, sustain: 0.7, release: 0.35 }) });
    addOsc(b, { type: 'noise', gain: 0.14, env: adsr({ attack: 0.4, decay: 0.2, sustain: 0.6, release: 0.3 }), seed: 33 });
    lowpass(b, 7000);
    arpeggio(b, [NOTE.C5, NOTE.G5, NOTE.C6], { step: 0.1, gain: 0.2, ring: 0.3, seedBase: 40 });
    return b;
  },

  /** SSR 등장 — 크고 밝은 화음 + 반짝임 꼬리 */
  sfx_gacha_ssr: () => {
    const b = buffer(1.7);
    const chord = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
    chord.forEach((f, i) => {
      addOsc(b, { type: 'sine', freq: f, gain: 0.26, env: adsr({ attack: 0.01, decay: 0.5, sustain: 0.35, release: 0.9 }), seed: 50 + i });
      addOsc(b, { type: 'triangle', freq: f * 2, gain: 0.09, env: decayEnv(0.4, 0.01), seed: 60 + i });
    });
    addOsc(b, { type: 'noise', gain: 0.2, env: decayEnv(0.12, 0.004), seed: 71 });
    arpeggio(b, [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7], { step: 0.09, gain: 0.22, ring: 0.5, seedBase: 80 });
    echo(b, 0.14, 0.35, 0.28);
    return lowpass(b, 12000);
  },

  /** 일반 피격 — 저역 임팩트 + 짧은 노이즈 */
  sfx_hit: () => {
    const b = buffer(0.2);
    addOsc(b, { type: 'sine', freq: 220, freqEnd: 60, gain: 0.7, env: decayEnv(0.045) });
    addOsc(b, { type: 'noise', gain: 0.4, env: decayEnv(0.025), seed: 91 });
    return lowpass(b, 5000);
  },

  /** 치명타 — 날카로운 임팩트 + 금속 링 */
  sfx_crit: () => {
    const b = buffer(0.45);
    addOsc(b, { type: 'sine', freq: 320, freqEnd: 55, gain: 0.7, env: decayEnv(0.05) });
    addOsc(b, { type: 'noise', gain: 0.55, env: decayEnv(0.035), seed: 101 });
    addOsc(b, { type: 'square', freq: 1850, gain: 0.16, env: decayEnv(0.12, 0.002), duty: 0.3 });
    addOsc(b, { type: 'sine', freq: 2770, gain: 0.14, env: decayEnv(0.15, 0.002) });
    echo(b, 0.06, 0.25, 0.2);
    return b;
  },

  /** 회복 — 부드러운 상승 벨 아르페지오 */
  sfx_heal: () => {
    const b = buffer(0.85);
    arpeggio(b, [NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5], { step: 0.075, gain: 0.34, ring: 0.5, seedBase: 111 });
    addOsc(b, { type: 'sine', freq: NOTE.C5, gain: 0.12, env: adsr({ attack: 0.15, decay: 0.2, sustain: 0.4, release: 0.4 }) });
    echo(b, 0.11, 0.3, 0.25);
    return lowpass(b, 9000);
  },

  /** 레벨업 — 밝은 4음 상승 팡파르 */
  sfx_levelup: () => {
    const b = buffer(1.0);
    arpeggio(b, [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], { step: 0.085, gain: 0.4, ring: 0.55, seedBase: 121 });
    addOsc(b, { type: 'square', freq: NOTE.C6, gain: 0.12, env: decayEnv(0.25, 0.01), start: 0.255, duty: 0.25 });
    addOsc(b, { type: 'noise', gain: 0.1, env: decayEnv(0.08, 0.005), start: 0.255, seed: 131 });
    echo(b, 0.12, 0.28, 0.24);
    return b;
  },

  /** 각인/승급 — 길게 차오르는 상승 슈머 + 임팩트 */
  sfx_ascend: () => {
    const b = buffer(1.4);
    addOsc(b, { type: 'saw', freq: 160, freqEnd: 1800, gain: 0.2, env: adsr({ attack: 0.5, decay: 0.15, sustain: 0.85, release: 0.35 }), dur: 0.95 });
    addOsc(b, { type: 'noise', gain: 0.16, env: adsr({ attack: 0.6, decay: 0.1, sustain: 0.8, release: 0.25 }), dur: 0.95, seed: 141 });
    highpass(b, 300);
    arpeggio(b, [NOTE.E5, NOTE.A5, NOTE.C6, NOTE.E6], { step: 0.075, gain: 0.3, ring: 0.6, seedBase: 151 });
    addOsc(b, { type: 'sine', freq: 140, freqEnd: 45, gain: 0.5, env: decayEnv(0.09), start: 0.9 });
    echo(b, 0.16, 0.32, 0.26);
    return b;
  },

  /** 스킬 시전 — 위로 휘는 마법 스윕 */
  sfx_skill: () => {
    const b = buffer(0.6);
    addOsc(b, { type: 'saw', freq: 700, freqEnd: 180, gain: 0.24, env: adsr({ attack: 0.02, decay: 0.15, sustain: 0.45, release: 0.3 }) });
    addOsc(b, { type: 'sine', freq: 900, freqEnd: 2400, gain: 0.2, env: adsr({ attack: 0.06, decay: 0.1, sustain: 0.6, release: 0.35 }) });
    addOsc(b, { type: 'noise', gain: 0.2, env: adsr({ attack: 0.08, decay: 0.12, sustain: 0.4, release: 0.3 }), seed: 161 });
    lowpass(b, 8000);
    return highpass(b, 220);
  },

  /** 전투 승리 스팅 — 짧은 장조 3화음 팡파르 */
  sfx_victory: () => {
    const b = buffer(1.3);
    const seq = [NOTE.C5, NOTE.E5, NOTE.G5];
    seq.forEach((f, i) => {
      addOsc(b, { type: 'triangle', freq: f, gain: 0.34, env: decayEnv(0.13, 0.006), start: i * 0.11, dur: 0.35, seed: 171 + i });
      addOsc(b, { type: 'square', freq: f * 2, gain: 0.09, env: decayEnv(0.09, 0.006), start: i * 0.11, dur: 0.3, duty: 0.3 });
    });
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => {
      addOsc(b, { type: 'triangle', freq: f, gain: 0.26, env: decayEnv(0.35, 0.008), start: 0.36, dur: 0.9, seed: 181 + i });
    });
    addOsc(b, { type: 'noise', gain: 0.12, env: decayEnv(0.2, 0.004), start: 0.36, seed: 191 });
    echo(b, 0.13, 0.3, 0.25);
    return b;
  },

  /** 전투 패배 스팅 — 하강 단조 3음 */
  sfx_defeat: () => {
    const b = buffer(1.3);
    const seq = [NOTE.G4, NOTE.E4, NOTE.C4];
    seq.forEach((f, i) => {
      addOsc(b, { type: 'triangle', freq: f, gain: 0.36, env: decayEnv(0.2, 0.01), start: i * 0.16, dur: 0.6, seed: 201 + i });
      addOsc(b, { type: 'sine', freq: f / 2, gain: 0.2, env: decayEnv(0.25, 0.012), start: i * 0.16, dur: 0.7 });
    });
    addOsc(b, { type: 'sine', freq: 90, freqEnd: 45, gain: 0.4, env: decayEnv(0.3, 0.02), start: 0.48 });
    echo(b, 0.18, 0.25, 0.22);
    return lowpass(b, 4500);
  },

  /** 팝업 열기 — 부드럽게 올라가는 블립 */
  sfx_ui_open: () => {
    const b = buffer(0.18);
    addOsc(b, { type: 'sine', freq: 480, freqEnd: 900, gain: 0.4, env: adsr({ attack: 0.01, decay: 0.05, sustain: 0.4, release: 0.11 }) });
    addOsc(b, { type: 'triangle', freq: 960, freqEnd: 1800, gain: 0.14, env: decayEnv(0.05, 0.006) });
    return b;
  },

  /** 팝업 닫기 — 부드럽게 내려가는 블립 */
  sfx_ui_close: () => {
    const b = buffer(0.16);
    addOsc(b, { type: 'sine', freq: 820, freqEnd: 380, gain: 0.38, env: adsr({ attack: 0.008, decay: 0.05, sustain: 0.35, release: 0.09 }) });
    addOsc(b, { type: 'triangle', freq: 1640, freqEnd: 760, gain: 0.1, env: decayEnv(0.04, 0.005) });
    return b;
  },

  /** 재화 획득 — 고전 2음 코인 */
  sfx_coin: () => {
    const b = buffer(0.42);
    addOsc(b, { type: 'square', freq: NOTE.B5, gain: 0.3, env: decayEnv(0.05, 0.003), dur: 0.08, duty: 0.4 });
    addOsc(b, { type: 'square', freq: NOTE.E6, gain: 0.28, env: decayEnv(0.16, 0.003), start: 0.075, duty: 0.4 });
    addOsc(b, { type: 'sine', freq: NOTE.E6 * 2, gain: 0.09, env: decayEnv(0.12, 0.004), start: 0.075 });
    return highpass(b, 500);
  },

  /** 에너지 충전/소모 — 짧은 전기 펄스 */
  sfx_energy: () => {
    const b = buffer(0.35);
    addOsc(b, { type: 'square', freq: 180, freqEnd: 640, gain: 0.22, env: adsr({ attack: 0.01, decay: 0.08, sustain: 0.5, release: 0.2 }), duty: 0.25 });
    addOsc(b, { type: 'sine', freq: 1200, freqEnd: 2400, gain: 0.16, env: decayEnv(0.09, 0.005) });
    addOsc(b, { type: 'noise', gain: 0.12, env: decayEnv(0.05, 0.004), seed: 211 });
    return highpass(b, 260);
  },

  /** 오류/거부 — 낮은 2음 버즈 */
  sfx_error: () => {
    const b = buffer(0.34);
    addOsc(b, { type: 'square', freq: 220, gain: 0.3, env: decayEnv(0.06, 0.004), dur: 0.12, duty: 0.5 });
    addOsc(b, { type: 'square', freq: 165, gain: 0.32, env: decayEnv(0.09, 0.004), start: 0.13, duty: 0.5 });
    addOsc(b, { type: 'saw', freq: 110, gain: 0.14, env: decayEnv(0.1, 0.006), start: 0.13 });
    return lowpass(b, 2600);
  }
};

// ==================== 실행 ====================

function run(bin, args) {
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function parseArgs(argv) {
  const only = argv.find((a) => a.startsWith('--only='));
  return {
    only: only ? only.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null,
    keepWav: argv.includes('--keep-wav')
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keys = Object.keys(RECIPES).filter((k) => !opts.only || opts.only.includes(k));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wavDir = opts.keepWav
    ? path.join(PROJECT_ROOT, 'tools', 'audio', '.raw')
    : fs.mkdtempSync(path.join(os.tmpdir(), 'ac-sfx-'));
  fs.mkdirSync(wavDir, { recursive: true });

  let oversized = 0;
  for (const key of keys) {
    const samples = normalize(deClick(RECIPES[key]()));
    const wavPath = path.join(wavDir, `${key}.wav`);
    fs.writeFileSync(wavPath, toWav(samples));

    const targets = [
      { file: path.join(OUT_DIR, `${key}.ogg`), args: ['-c:a', 'libvorbis', '-q:a', '3'] },
      { file: path.join(OUT_DIR, `${key}.mp3`), args: ['-c:a', 'libmp3lame', '-q:a', '6'] }
    ];
    const sizes = targets.map((t) => {
      run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', wavPath, '-ar', '44100', '-ac', '1', ...t.args, t.file]);
      const bytes = fs.statSync(t.file).size;
      if (bytes > SIZE_WARN_BYTES) oversized++;
      return `${path.extname(t.file).slice(1)} ${(bytes / 1024).toFixed(1)}KB`;
    });

    console.log(`[gen-sfx] ${key} — ${(samples.length / 44100).toFixed(2)}s / ${sizes.join(' · ')}`);
  }

  if (!opts.keepWav) fs.rmSync(wavDir, { recursive: true, force: true });
  console.log(`[gen-sfx] 완료: ${keys.length}종${oversized ? ` (경고: ${oversized}개 파일이 50KB 초과)` : ''}`);
}

main();

export { RECIPES };
