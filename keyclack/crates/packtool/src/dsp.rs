//! Tiny DSP kit for procedural switch sounds: noise, one-pole filters, resonators,
//! envelopes. Everything works on mono f32 at `rate`.

pub struct Rng(pub u32);
impl Rng {
    pub fn next(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        (self.0 as f32 / u32::MAX as f32) * 2.0 - 1.0
    }
    /// Uniform in [lo, hi].
    pub fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + (self.next() + 1.0) * 0.5 * (hi - lo)
    }
}

pub fn frames(rate: u32, ms: f32) -> usize {
    (rate as f32 * ms / 1000.0) as usize
}

/// White noise, length in frames.
pub fn noise(rng: &mut Rng, n: usize) -> Vec<f32> {
    (0..n).map(|_| rng.next()).collect()
}

/// One-pole low-pass (in place).
pub fn lowpass(buf: &mut [f32], rate: u32, cutoff_hz: f32) {
    let a = 1.0 - (-2.0 * std::f32::consts::PI * cutoff_hz / rate as f32).exp();
    let mut y = 0.0;
    for s in buf.iter_mut() {
        y += a * (*s - y);
        *s = y;
    }
}

/// One-pole high-pass (in place).
pub fn highpass(buf: &mut [f32], rate: u32, cutoff_hz: f32) {
    let a = 1.0 - (-2.0 * std::f32::consts::PI * cutoff_hz / rate as f32).exp();
    let mut lp = 0.0;
    for s in buf.iter_mut() {
        lp += a * (*s - lp);
        *s -= lp;
    }
}

/// Band-pass = high-pass then low-pass.
pub fn bandpass(buf: &mut [f32], rate: u32, lo_hz: f32, hi_hz: f32) {
    highpass(buf, rate, lo_hz);
    lowpass(buf, rate, hi_hz);
}

/// Exponential decay envelope: amp(t) = exp(-t / tau).
pub fn decay(buf: &mut [f32], rate: u32, tau_ms: f32) {
    let k = -1.0 / (rate as f32 * tau_ms / 1000.0);
    for (i, s) in buf.iter_mut().enumerate() {
        *s *= (k * i as f32).exp();
    }
}

/// Linear attack over `ms` (avoids clicks at the start).
pub fn attack(buf: &mut [f32], rate: u32, ms: f32) {
    let n = frames(rate, ms).max(1);
    for (i, s) in buf.iter_mut().take(n).enumerate() {
        *s *= i as f32 / n as f32;
    }
}

/// Damped sine "ping": a resonant mode of the keycap/case.
pub fn mode(rate: u32, n: usize, freq_hz: f32, amp: f32, tau_ms: f32, phase: f32) -> Vec<f32> {
    let w = 2.0 * std::f32::consts::PI * freq_hz / rate as f32;
    let k = -1.0 / (rate as f32 * tau_ms / 1000.0);
    (0..n).map(|i| amp * (w * i as f32 + phase).sin() * (k * i as f32).exp()).collect()
}

/// Excite a resonator with an impulse-ish burst: convolution of a short noise burst
/// with the mode is approximated by ring-modulating the mode with a decaying noise.
pub fn struck_mode(rng: &mut Rng, rate: u32, n: usize, freq_hz: f32, amp: f32, tau_ms: f32) -> Vec<f32> {
    let mut m = mode(rate, n, freq_hz, amp, tau_ms, rng.range(0.0, 6.28));
    // slight per-hit detune wobble in the first ms gives a "struck" character
    let mut ex = noise(rng, n);
    lowpass(&mut ex, rate, freq_hz * 2.0);
    decay(&mut ex, rate, 0.8);
    for (a, b) in m.iter_mut().zip(ex.iter()) {
        *a += *a * b * 0.6;
    }
    m
}

pub fn mix_into(dst: &mut [f32], src: &[f32], offset: usize, gain: f32) {
    for (i, s) in src.iter().enumerate() {
        if let Some(d) = dst.get_mut(offset + i) {
            *d += s * gain;
        }
    }
}

/// Peak-normalize to `peak` (no-op for silence).
pub fn normalize(buf: &mut [f32], peak: f32) {
    let m = buf.iter().fold(0.0f32, |m, v| m.max(v.abs()));
    if m > 1e-6 {
        let g = peak / m;
        buf.iter_mut().for_each(|s| *s *= g);
    }
}

/// Trim trailing samples below `thresh`, keeping a short tail.
pub fn trim_tail(buf: &mut Vec<f32>, thresh: f32, keep_frames: usize) {
    let last = buf.iter().rposition(|v| v.abs() > thresh).unwrap_or(0);
    buf.truncate((last + keep_frames).min(buf.len()));
}
