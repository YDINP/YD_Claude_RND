//! Procedural switch models → Mechvibes multi-mode packs.
//!
//! A keystroke is modelled as: (1) an optional click transient (clicky switches),
//! (2) a tactile bump (tactile), (3) bottom-out: keycap/plate resonances excited by a
//! noise burst, (4) case body low thump. Release: a small upstroke tick and, for clicky
//! switches, the click-bar reset.

use std::collections::BTreeMap;
use std::path::Path;

use crate::dsp::*;

#[derive(Clone, Copy)]
pub enum Kind {
    Clicky,
    Tactile,
    Linear,
}

pub struct Model {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: Kind,
    /// Base pitch of the keycap resonance (Hz) and case thump (Hz).
    pub cap_hz: f32,
    pub body_hz: f32,
    /// Overall brightness of the bottom-out noise (band-pass upper edge).
    pub bright_hz: f32,
    /// Loudness of bottom-out relative to click.
    pub thock: f32,
    pub seed: u32,
}

pub const MODELS: &[Model] = &[
    Model { id: "kc-clicky-blue", name: "KeyClack Clicky (Blue)", kind: Kind::Clicky, cap_hz: 2400.0, body_hz: 170.0, bright_hz: 6500.0, thock: 0.7, seed: 0x1111 },
    Model { id: "kc-tactile-brown", name: "KeyClack Tactile (Brown)", kind: Kind::Tactile, cap_hz: 1900.0, body_hz: 150.0, bright_hz: 4200.0, thock: 1.0, seed: 0x2222 },
    Model { id: "kc-silent-red", name: "KeyClack Silent Linear (Red)", kind: Kind::Linear, cap_hz: 1500.0, body_hz: 130.0, bright_hz: 2600.0, thock: 0.8, seed: 0x3333 },
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

fn down(m: &Model, class: Class, rng: &mut Rng) -> Vec<f32> {
    let len_ms = 110.0 * class.len;
    let n = frames(RATE, len_ms);
    let mut out = vec![0.0f32; n];
    let pitch = class.pitch * rng.range(0.96, 1.04);

    // (1) click transient: very short, bright, sharp
    if let Kind::Clicky = m.kind {
        let cn = frames(RATE, 6.0);
        let mut c = noise(rng, cn);
        bandpass(&mut c, RATE, 2500.0, 9000.0);
        decay(&mut c, RATE, 0.9);
        mix_into(&mut out, &c, 0, 0.9);
        // click-bar ping
        let p = struck_mode(rng, RATE, frames(RATE, 25.0), 5200.0 * pitch, 0.35, 3.0);
        mix_into(&mut out, &p, 0, 1.0);
    }

    // (2) tactile bump: soft mid transient a little before bottom-out
    if let Kind::Tactile = m.kind {
        let bn = frames(RATE, 8.0);
        let mut b = noise(rng, bn);
        bandpass(&mut b, RATE, 600.0, 2200.0);
        decay(&mut b, RATE, 1.5);
        mix_into(&mut out, &b, 0, 0.35);
    }

    // (3) bottom-out: noise burst through the cap band + cap resonances
    let bo_at = match m.kind {
        Kind::Clicky => frames(RATE, 4.0),
        Kind::Tactile => frames(RATE, 3.0),
        Kind::Linear => 0,
    };
    let bn = frames(RATE, 30.0 * class.len);
    let mut burst = noise(rng, bn);
    bandpass(&mut burst, RATE, 300.0 * pitch, m.bright_hz * pitch);
    decay(&mut burst, RATE, 3.5 * class.len);
    attack(&mut burst, RATE, 0.3);
    mix_into(&mut out, &burst, bo_at, 0.8 * m.thock);
    for (k, (mul, amp, tau)) in [(1.0, 0.5, 9.0), (1.83, 0.28, 6.0), (2.71, 0.16, 4.0)].iter().enumerate() {
        let f = m.cap_hz * pitch * mul * rng.range(0.98, 1.02);
        let r = struck_mode(rng, RATE, frames(RATE, 45.0 * class.len), f, amp * m.thock, tau * class.len);
        mix_into(&mut out, &r, bo_at + k, 1.0);
    }

    // (4) case thump: low mode, longer
    let thump = mode(RATE, frames(RATE, 60.0 * class.len), m.body_hz * pitch, 0.55 * m.thock * class.gain, 14.0 * class.len, rng.range(0.0, 6.28));
    mix_into(&mut out, &thump, bo_at, 1.0);

    // silent-linear: dampen highs like a silicone-dampened stem
    if let Kind::Linear = m.kind {
        lowpass(&mut out, RATE, 3200.0);
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
    bandpass(&mut t, RATE, 1200.0, m.bright_hz);
    decay(&mut t, RATE, 1.2);
    mix_into(&mut out, &t, 0, 0.5);
    let r = struck_mode(rng, RATE, frames(RATE, 30.0), m.cap_hz * 1.4 * pitch, 0.3, 4.0);
    mix_into(&mut out, &r, 0, 1.0);
    if let Kind::Clicky = m.kind {
        // click-bar reset: second, quieter click on release
        let cn = frames(RATE, 4.0);
        let mut c = noise(rng, cn);
        bandpass(&mut c, RATE, 3000.0, 9000.0);
        decay(&mut c, RATE, 0.7);
        mix_into(&mut out, &c, frames(RATE, 2.0), 0.6);
    }
    if let Kind::Linear = m.kind {
        lowpass(&mut out, RATE, 3000.0);
    }
    attack(&mut out, RATE, 0.3);
    let peak = match m.kind {
        Kind::Clicky => 0.55,
        Kind::Tactile => 0.35,
        Kind::Linear => 0.25,
    };
    normalize(&mut out, peak);
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
