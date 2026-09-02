//! Procedural switch models → Mechvibes multi-mode packs.
//!
//! A keystroke is modelled as: (1) an optional click transient (clicky switches),
//! (2) a tactile bump (tactile), (3) bottom-out: keycap/plate resonances excited by a
//! noise burst, (4) case body low thump, plus per-model extras (typewriter ring,
//! bubble chirp, rubber-dome collapse). Release: a small upstroke tick and, for
//! clicky switches, the click-bar reset.

use std::collections::BTreeMap;
use std::path::Path;

use crate::dsp::*;

#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    Clicky,
    Tactile,
    Linear,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Extra {
    None,
    /// Metallic type-bar ring + platen thud.
    Typewriter,
    /// Downward sine chirp, almost no noise: soft "pop".
    Bubble,
    /// Rubber-dome collapse: mid "thup" before a soft bottom-out (Topre-like).
    Dome,
}

pub struct Model {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: Kind,
    pub extra: Extra,
    /// Base pitch of the keycap resonance (Hz) and case thump (Hz).
    pub cap_hz: f32,
    pub body_hz: f32,
    /// Keycap partials: (frequency multiple, amplitude, decay ms). Harmonic ratios sound
    /// plasticky; inharmonic ratios sound like stone/glass.
    pub modes: &'static [(f32, f32, f32)],
    /// Bottom-out noise band (Hz) and its decay (ms).
    pub burst_lo_hz: f32,
    pub burst_hi_hz: f32,
    pub burst_tau_ms: f32,
    /// Loudness of bottom-out relative to click.
    pub thock: f32,
    /// Case thump amplitude and decay ms.
    pub body_amp: f32,
    pub body_tau_ms: f32,
    /// Final low-pass (dampened stems / thick cases). 0 = none.
    pub damp_hz: f32,
    /// Peak of the release sound (0..1).
    pub up_peak: f32,
    pub seed: u32,
}

const PLASTIC: &[(f32, f32, f32)] = &[(1.0, 0.5, 9.0), (1.83, 0.28, 6.0), (2.71, 0.16, 4.0)];
const DEEP: &[(f32, f32, f32)] = &[(1.0, 0.6, 14.0), (1.5, 0.25, 9.0), (2.2, 0.1, 5.0)];
const STONE: &[(f32, f32, f32)] = &[(1.0, 0.45, 5.0), (1.42, 0.4, 4.0), (2.37, 0.3, 3.0), (3.11, 0.2, 2.2), (4.7, 0.12, 1.5)];
const GLASS: &[(f32, f32, f32)] = &[(1.0, 0.5, 20.0), (2.76, 0.25, 14.0), (5.4, 0.12, 9.0)];
const SOFT: &[(f32, f32, f32)] = &[(1.0, 0.4, 7.0), (1.6, 0.15, 4.0)];

pub const MODELS: &[Model] = &[
    Model {
        id: "kc-clicky-blue", name: "KeyClack Clicky (Blue)", kind: Kind::Clicky, extra: Extra::None,
        cap_hz: 2400.0, body_hz: 170.0, modes: PLASTIC, burst_lo_hz: 300.0, burst_hi_hz: 6500.0, burst_tau_ms: 3.5,
        thock: 0.7, body_amp: 0.55, body_tau_ms: 14.0, damp_hz: 0.0, up_peak: 0.55, seed: 0x1111,
    },
    Model {
        id: "kc-tactile-brown", name: "KeyClack Tactile (Brown)", kind: Kind::Tactile, extra: Extra::None,
        cap_hz: 1900.0, body_hz: 150.0, modes: PLASTIC, burst_lo_hz: 300.0, burst_hi_hz: 4200.0, burst_tau_ms: 3.5,
        thock: 1.0, body_amp: 0.55, body_tau_ms: 14.0, damp_hz: 0.0, up_peak: 0.35, seed: 0x2222,
    },
    Model {
        id: "kc-silent-red", name: "KeyClack Silent Linear (Red)", kind: Kind::Linear, extra: Extra::None,
        cap_hz: 1500.0, body_hz: 130.0, modes: PLASTIC, burst_lo_hz: 300.0, burst_hi_hz: 2600.0, burst_tau_ms: 3.5,
        thock: 0.8, body_amp: 0.55, body_tau_ms: 14.0, damp_hz: 3200.0, up_peak: 0.25, seed: 0x3333,
    },
    // 도각도각: lubed linear on a thick, foam-filled case. Low, round, no highs.
    Model {
        id: "kc-thock", name: "KeyClack Thock (도각도각)", kind: Kind::Linear, extra: Extra::None,
        cap_hz: 900.0, body_hz: 105.0, modes: DEEP, burst_lo_hz: 150.0, burst_hi_hz: 1800.0, burst_tau_ms: 5.0,
        thock: 1.2, body_amp: 0.9, body_tau_ms: 22.0, damp_hz: 2400.0, up_peak: 0.3, seed: 0x4444,
    },
    // 조약돌: stone-on-stone clack. Inharmonic partials, very short, bright but dry.
    Model {
        id: "kc-pebble", name: "KeyClack Pebble (조약돌)", kind: Kind::Linear, extra: Extra::None,
        cap_hz: 3100.0, body_hz: 220.0, modes: STONE, burst_lo_hz: 1200.0, burst_hi_hz: 9000.0, burst_tau_ms: 1.6,
        thock: 1.0, body_amp: 0.3, body_tau_ms: 6.0, damp_hz: 0.0, up_peak: 0.4, seed: 0x5555,
    },
    // 유리구슬: glassy, ringing, marble-like. Long high partials.
    Model {
        id: "kc-marble", name: "KeyClack Marble (유리구슬)", kind: Kind::Linear, extra: Extra::None,
        cap_hz: 2600.0, body_hz: 260.0, modes: GLASS, burst_lo_hz: 1500.0, burst_hi_hz: 10000.0, burst_tau_ms: 1.2,
        thock: 0.9, body_amp: 0.25, body_tau_ms: 8.0, damp_hz: 0.0, up_peak: 0.35, seed: 0x6666,
    },
    // 토프레: rubber dome collapse "thup" then soft bottom-out.
    Model {
        id: "kc-topre", name: "KeyClack Topre (토프레)", kind: Kind::Tactile, extra: Extra::Dome,
        cap_hz: 1300.0, body_hz: 120.0, modes: SOFT, burst_lo_hz: 200.0, burst_hi_hz: 2200.0, burst_tau_ms: 4.0,
        thock: 0.9, body_amp: 0.7, body_tau_ms: 16.0, damp_hz: 3600.0, up_peak: 0.3, seed: 0x7777,
    },
    // 타자기: type-bar strike, metallic ring, platen thud.
    Model {
        id: "kc-typewriter", name: "KeyClack Typewriter (타자기)", kind: Kind::Clicky, extra: Extra::Typewriter,
        cap_hz: 3400.0, body_hz: 140.0, modes: GLASS, burst_lo_hz: 800.0, burst_hi_hz: 9000.0, burst_tau_ms: 2.5,
        thock: 0.8, body_amp: 0.6, body_tau_ms: 18.0, damp_hz: 0.0, up_peak: 0.45, seed: 0x8888,
    },
    // 버블: soft pop, almost no noise. For people who want "cute".
    Model {
        id: "kc-bubble", name: "KeyClack Bubble (버블)", kind: Kind::Linear, extra: Extra::Bubble,
        cap_hz: 700.0, body_hz: 160.0, modes: SOFT, burst_lo_hz: 300.0, burst_hi_hz: 1500.0, burst_tau_ms: 2.0,
        thock: 0.3, body_amp: 0.2, body_tau_ms: 10.0, damp_hz: 4000.0, up_peak: 0.2, seed: 0x9999,
    },
];

/// Per-key-class multipliers: (pitch, gain, length).
#[derive(Clone, Copy)]
struct Class {
    pitch: f32,
    gain: f32,
    len: f32,
}

const GENERIC: Class = Class { pitch: 1.0, gain: 1.0, len: 1.0 };
const SPACE: Class = Class { pitch: 0.62, gain: 1.25, len: 1.6 }; // big stabilised cap: deep, long
const ENTER: Class = Class { pitch: 0.8, gain: 1.15, len: 1.3 };
const BACKSPACE: Class = Class { pitch: 0.85, gain: 1.1, len: 1.2 };
const MODIFIER: Class = Class { pitch: 0.9, gain: 1.05, len: 1.1 };

/// Keycodes (libuiohook) that get their own file.
const SPECIAL: &[(u32, &str, Class)] = &[
    (57, "SPACE", SPACE),
    (28, "ENTER", ENTER),
    (3612, "ENTER", ENTER), // keypad enter shares the file
    (14, "BACKSPACE", BACKSPACE),
    (15, "TAB", MODIFIER),
    (58, "CAPS", MODIFIER),
    (42, "SHIFT", MODIFIER),
    (54, "SHIFT", MODIFIER),
    (29, "CTRL", MODIFIER),
    (3613, "CTRL", MODIFIER),
    (56, "ALT", MODIFIER),
    (3640, "ALT", MODIFIER),
    (3675, "WIN", MODIFIER),
    (3676, "WIN", MODIFIER),
];

const VARIANTS: u32 = 5;
const RATE: u32 = 48000;

/// Sine chirp from `f0` to `f1` Hz over `n` frames with exponential decay.
fn chirp(rate: u32, n: usize, f0: f32, f1: f32, amp: f32, tau_ms: f32) -> Vec<f32> {
    let k = -1.0 / (rate as f32 * tau_ms / 1000.0);
    let mut phase = 0.0f32;
    (0..n)
        .map(|i| {
            let t = i as f32 / n as f32;
            let f = f0 * (f1 / f0).powf(t);
            phase += 2.0 * std::f32::consts::PI * f / rate as f32;
            amp * phase.sin() * (k * i as f32).exp()
        })
        .collect()
}

fn down(m: &Model, class: Class, rng: &mut Rng) -> Vec<f32> {
    let len_ms = 130.0 * class.len;
    let n = frames(RATE, len_ms);
    let mut out = vec![0.0f32; n];
    let pitch = class.pitch * rng.range(0.96, 1.04);

    // (1) click transient: very short, bright, sharp
    if m.kind == Kind::Clicky {
        let cn = frames(RATE, 6.0);
        let mut c = noise(rng, cn);
        bandpass(&mut c, RATE, 2500.0, 9000.0);
        decay(&mut c, RATE, 0.9);
        mix_into(&mut out, &c, 0, 0.9);
        let p = struck_mode(rng, RATE, frames(RATE, 25.0), 5200.0 * pitch, 0.35, 3.0);
        mix_into(&mut out, &p, 0, 1.0);
    }

    // (2) tactile bump: soft mid transient a little before bottom-out
    if m.kind == Kind::Tactile {
        let bn = frames(RATE, 8.0);
        let mut b = noise(rng, bn);
        bandpass(&mut b, RATE, 600.0, 2200.0);
        decay(&mut b, RATE, 1.5);
        mix_into(&mut out, &b, 0, 0.35);
    }

    // extras that happen before bottom-out
    let mut bo_at = match m.kind {
        Kind::Clicky => frames(RATE, 4.0),
        Kind::Tactile => frames(RATE, 3.0),
        Kind::Linear => 0,
    };
    match m.extra {
        Extra::Dome => {
            // dome collapse: mid "thup", ~6 ms before bottom-out
            let dn = frames(RATE, 14.0);
            let mut d = noise(rng, dn);
            bandpass(&mut d, RATE, 350.0, 1400.0);
            decay(&mut d, RATE, 2.5);
            mix_into(&mut out, &d, 0, 0.6);
            let th = mode(RATE, frames(RATE, 30.0), 420.0 * pitch, 0.5, 6.0, rng.range(0.0, 6.28));
            mix_into(&mut out, &th, 0, 1.0);
            bo_at += frames(RATE, 6.0);
        }
        Extra::Bubble => {
            let c = chirp(RATE, frames(RATE, 45.0 * class.len), 950.0 * pitch, 320.0 * pitch, 0.9, 12.0 * class.len);
            mix_into(&mut out, &c, 0, 1.0);
        }
        Extra::Typewriter => {
            // type bar hits the platen: hard strike + long metallic ring
            let sn = frames(RATE, 5.0);
            let mut st = noise(rng, sn);
            bandpass(&mut st, RATE, 1500.0, 11000.0);
            decay(&mut st, RATE, 0.6);
            mix_into(&mut out, &st, 0, 1.0);
            let ring = mode(RATE, frames(RATE, 90.0), 4300.0 * pitch * rng.range(0.99, 1.01), 0.28, 28.0, rng.range(0.0, 6.28));
            mix_into(&mut out, &ring, 0, 1.0);
            let ring2 = mode(RATE, frames(RATE, 70.0), 6900.0 * pitch, 0.12, 18.0, rng.range(0.0, 6.28));
            mix_into(&mut out, &ring2, 0, 1.0);
        }
        Extra::None => {}
    }

    // (3) bottom-out: noise burst through the cap band + cap resonances
    let bn = frames(RATE, 30.0 * class.len);
    let mut burst = noise(rng, bn);
    bandpass(&mut burst, RATE, m.burst_lo_hz * pitch, m.burst_hi_hz * pitch);
    decay(&mut burst, RATE, m.burst_tau_ms * class.len);
    attack(&mut burst, RATE, 0.3);
    mix_into(&mut out, &burst, bo_at, 0.8 * m.thock);
    for (k, (mul, amp, tau)) in m.modes.iter().enumerate() {
        let f = m.cap_hz * pitch * mul * rng.range(0.98, 1.02);
        let r = struck_mode(rng, RATE, frames(RATE, 45.0 * class.len), f, amp * m.thock, tau * class.len);
        mix_into(&mut out, &r, bo_at + k, 1.0);
    }

    // (4) case thump: low mode, longer
    let thump = mode(
        RATE,
        frames(RATE, 70.0 * class.len),
        m.body_hz * pitch,
        m.body_amp * m.thock * class.gain,
        m.body_tau_ms * class.len,
        rng.range(0.0, 6.28),
    );
    mix_into(&mut out, &thump, bo_at, 1.0);

    if m.damp_hz > 0.0 {
        lowpass(&mut out, RATE, m.damp_hz);
    }

    attack(&mut out, RATE, 0.4);
    normalize(&mut out, 0.85 * class.gain.min(1.0));
    trim_tail(&mut out, 0.002, frames(RATE, 5.0));
    out
}

fn up(m: &Model, class: Class, rng: &mut Rng) -> Vec<f32> {
    let n = frames(RATE, 50.0);
    let mut out = vec![0.0f32; n];
    let pitch = class.pitch * rng.range(0.96, 1.04);
    // upstroke: stem hits the top housing — light tick
    let tn = frames(RATE, 5.0);
    let mut t = noise(rng, tn);
    bandpass(&mut t, RATE, 1200.0, m.burst_hi_hz.max(2500.0));
    decay(&mut t, RATE, 1.2);
    mix_into(&mut out, &t, 0, 0.5);
    let (f_mul, amp, tau) = m.modes.first().copied().unwrap_or((1.0, 0.4, 5.0));
    let r = struck_mode(rng, RATE, frames(RATE, 30.0), m.cap_hz * 1.4 * f_mul * pitch, amp * 0.7, tau * 0.6);
    mix_into(&mut out, &r, 0, 1.0);
    if m.kind == Kind::Clicky {
        // click-bar reset: second, quieter click on release
        let cn = frames(RATE, 4.0);
        let mut c = noise(rng, cn);
        bandpass(&mut c, RATE, 3000.0, 9000.0);
        decay(&mut c, RATE, 0.7);
        mix_into(&mut out, &c, frames(RATE, 2.0), 0.6);
    }
    if m.extra == Extra::Bubble {
        let c = chirp(RATE, frames(RATE, 25.0), 500.0 * pitch, 900.0 * pitch, 0.6, 7.0);
        mix_into(&mut out, &c, 0, 1.0);
    }
    if m.damp_hz > 0.0 {
        lowpass(&mut out, RATE, m.damp_hz);
    }
    attack(&mut out, RATE, 0.3);
    normalize(&mut out, m.up_peak);
    trim_tail(&mut out, 0.002, frames(RATE, 4.0));
    out
}

fn write_wav(path: &Path, pcm: &[f32]) -> Result<(), String> {
    let spec = hound::WavSpec { channels: 1, sample_rate: RATE, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut w = hound::WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for s in pcm {
        w.write_sample((s.clamp(-1.0, 1.0) * 32767.0) as i16).map_err(|e| e.to_string())?;
    }
    w.finalize().map_err(|e| e.to_string())
}

/// Generate one pack directory. Returns the number of files written.
pub fn generate(m: &Model, out_root: &Path) -> Result<usize, String> {
    let dir = out_root.join(m.id);
    std::fs::create_dir_all(dir.join("release")).map_err(|e| e.to_string())?;
    let mut rng = Rng(m.seed);
    let mut files = 0;

    for i in 0..VARIANTS {
        write_wav(&dir.join(format!("GENERIC_R{i}.wav")), &down(m, GENERIC, &mut rng))?;
        write_wav(&dir.join(format!("release/GENERIC_R{i}.wav")), &up(m, GENERIC, &mut rng))?;
        files += 2;
    }
    let mut defines: BTreeMap<String, String> = BTreeMap::new();
    let mut written: BTreeMap<&str, ()> = BTreeMap::new();
    for (code, name, class) in SPECIAL {
        if !written.contains_key(name) {
            write_wav(&dir.join(format!("{name}.wav")), &down(m, *class, &mut rng))?;
            write_wav(&dir.join(format!("release/{name}.wav")), &up(m, *class, &mut rng))?;
            written.insert(name, ());
            files += 2;
        }
        defines.insert(code.to_string(), format!("{name}.wav"));
        defines.insert(format!("{code}-up"), format!("release/{name}.wav"));
    }
    let cfg = serde_json::json!({
        "id": m.id,
        "name": m.name,
        "key_define_type": "multi",
        "version": 2,
        "includes_numpad": true,
        "sound": format!("GENERIC_R{{0-{}}}.wav", VARIANTS - 1),
        "soundup": format!("release/GENERIC_R{{0-{}}}.wav", VARIANTS - 1),
        "defines": defines,
        "generator": "keyclack-packtool synth",
        "license": "CC0-1.0",
    });
    std::fs::write(dir.join("config.json"), serde_json::to_string_pretty(&cfg).unwrap()).map_err(|e| e.to_string())?;
    Ok(files + 1)
}
