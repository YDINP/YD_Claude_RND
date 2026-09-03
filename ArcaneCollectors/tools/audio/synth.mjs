/**
 * synth.mjs - SND-02 SFX 합성 프리미티브 (jsfxr 계열 감산합성)
 *
 * 외부 의존성 없이 Float32 버퍼를 만들고 16bit PCM WAV 로 직렬화한다.
 * 게임 SFX 는 모두 모노 44.1kHz 로 굽는다.
 */

/** 샘플레이트 (Hz) */
export const SAMPLE_RATE = 44100;
/** 16bit PCM 최대 진폭 */
const PCM_MAX = 32767;
/** WAV 헤더 크기 (바이트) */
const WAV_HEADER_BYTES = 44;

/** 초 → 샘플 수 */
export function secToSamples(sec) {
  return Math.max(1, Math.round(sec * SAMPLE_RATE));
}

/** 길이(초)만큼의 0 버퍼 */
export function buffer(sec) {
  return new Float32Array(secToSamples(sec));
}

/**
 * 지수 보간 (주파수 스윕용). ratio 0→1 을 from→to 로 매핑한다.
 */
function lerpExp(from, to, ratio) {
  if (from <= 0 || to <= 0) return from + (to - from) * ratio;
  return from * Math.pow(to / from, ratio);
}

/**
 * ADSR 엔벨로프 값. 모두 초 단위이며 합이 길이를 넘으면 릴리스가 잘린다.
 * @returns {(t: number, dur: number) => number}
 */
export function adsr({ attack = 0.005, decay = 0.05, sustain = 0.5, release = 0.1 }) {
  return (t, dur) => {
    const relStart = Math.max(attack + decay, dur - release);
    if (t < attack) return t / attack;
    if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
    if (t < relStart) return sustain;
    const relLen = Math.max(1e-6, dur - relStart);
    return sustain * Math.max(0, 1 - (t - relStart) / relLen);
  };
}

/** 지수 감쇠 엔벨로프 (타격음용) */
export function decayEnv(halfLifeSec, attackSec = 0.002) {
  return (t) => {
    const atk = t < attackSec ? t / attackSec : 1;
    return atk * Math.pow(0.5, t / halfLifeSec);
  };
}

/** 결정론적 의사난수 (씨드 고정 → 빌드 재현성 보장) */
export function makeRandom(seed = 1) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

/**
 * 오실레이터 레이어를 버퍼에 더한다.
 * @param {Float32Array} out 대상 버퍼
 * @param {Object} opt
 * @param {'sine'|'square'|'saw'|'triangle'|'noise'} opt.type 파형
 * @param {number} opt.freq 시작 주파수 (noise 는 무시)
 * @param {number} [opt.freqEnd] 끝 주파수 (지수 스윕)
 * @param {number} opt.gain 최대 게인
 * @param {(t:number,dur:number)=>number} opt.env 엔벨로프
 * @param {number} [opt.start] 시작 시각(초)
 * @param {number} [opt.dur] 지속(초). 기본은 버퍼 끝까지
 * @param {number} [opt.seed] noise 시드
 */
export function addOsc(out, opt) {
  const {
    type, freq = 440, freqEnd = null, gain = 0.5, env,
    start = 0, seed = 1, duty = 0.5
  } = opt;
  const s0 = Math.max(0, Math.round(start * SAMPLE_RATE));
  const dur = opt.dur ?? (out.length - s0) / SAMPLE_RATE;
  const n = Math.min(out.length - s0, secToSamples(dur));
  const rand = makeRandom(seed);
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const ratio = n > 1 ? i / (n - 1) : 0;
    const f = freqEnd === null ? freq : lerpExp(freq, freqEnd, ratio);
    phase += f / SAMPLE_RATE;
    const p = phase % 1;

    let sample;
    switch (type) {
      case 'square': sample = p < duty ? 1 : -1; break;
      case 'saw': sample = 2 * p - 1; break;
      case 'triangle': sample = 4 * Math.abs(p - 0.5) - 1; break;
      case 'noise': sample = rand(); break;
      default: sample = Math.sin(2 * Math.PI * p);
    }

    out[s0 + i] += sample * gain * (env ? env(t, dur) : 1);
  }
}

/** 1극 로우패스. cutoff(Hz) 위를 완만히 깎는다 */
export function lowpass(buf, cutoff) {
  const dt = 1 / SAMPLE_RATE;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < buf.length; i++) {
    prev += alpha * (buf[i] - prev);
    buf[i] = prev;
  }
  return buf;
}

/** 1극 하이패스. cutoff(Hz) 아래를 깎는다 */
export function highpass(buf, cutoff) {
  const dt = 1 / SAMPLE_RATE;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = rc / (rc + dt);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    prevOut = alpha * (prevOut + x - prevIn);
    prevIn = x;
    buf[i] = prevOut;
  }
  return buf;
}

/** 단순 피드백 딜레이(잔향 흉내) */
export function echo(buf, delaySec, feedback = 0.3, mix = 0.3) {
  const d = secToSamples(delaySec);
  const wet = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const delayed = i >= d ? wet[i - d] * feedback + buf[i - d] : 0;
    wet[i] = delayed;
  }
  for (let i = 0; i < buf.length; i++) buf[i] += wet[i] * mix;
  return buf;
}

/** 앞뒤 짧은 페이드로 클릭 노이즈 제거 */
export function deClick(buf, fadeSec = 0.004) {
  const f = secToSamples(fadeSec);
  for (let i = 0; i < f && i < buf.length; i++) {
    buf[i] *= i / f;
    buf[buf.length - 1 - i] *= i / f;
  }
  return buf;
}

/** 피크를 target 으로 맞춘다 (클리핑 방지) */
export function normalize(buf, target = 0.89) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak < 1e-6) return buf;
  const g = target / peak;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

/**
 * Float32 모노 버퍼 → 16bit PCM WAV Buffer
 */
export function toWav(samples, sampleRate = SAMPLE_RATE) {
  const dataBytes = samples.length * 2;
  const out = Buffer.alloc(WAV_HEADER_BYTES + dataBytes);

  out.write('RIFF', 0);
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);          // fmt 청크 크기
  out.writeUInt16LE(1, 20);           // PCM
  out.writeUInt16LE(1, 22);           // 모노
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28); // byte rate
  out.writeUInt16LE(2, 32);           // block align
  out.writeUInt16LE(16, 34);          // bit depth
  out.write('data', 36);
  out.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(Math.round(v * PCM_MAX), WAV_HEADER_BYTES + i * 2);
  }
  return out;
}
