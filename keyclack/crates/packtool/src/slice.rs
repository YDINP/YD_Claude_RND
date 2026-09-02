//! Recording slicer: one long recording of repeated keystrokes → GENERIC_R{n} variants.
//!
//! Workflow for a real pack: record 10–20 presses of a normal key, then (optionally)
//! separate recordings for space / enter / backspace. Run `slice` on each recording,
//! then `assemble` to write config.json.

use std::path::Path;

use keyclack_core::decode::decode_file;

use crate::dsp::{attack, frames, normalize, trim_tail};

pub struct SliceOpts {
    /// Onset threshold relative to the recording's peak (0..1).
    pub threshold: f32,
    /// Minimum gap between onsets, ms.
    pub min_gap_ms: f32,
    /// Length of each slice, ms.
    pub len_ms: f32,
    /// Lead-in kept before the onset, ms.
    pub pre_ms: f32,
    pub max_slices: usize,
}

impl Default for SliceOpts {
    fn default() -> Self {
        Self { threshold: 0.25, min_gap_ms: 120.0, len_ms: 160.0, pre_ms: 2.0, max_slices: 8 }
    }
}

/// Find onsets: first sample of each burst whose short-window energy exceeds the threshold.
pub fn onsets(pcm: &[f32], rate: u32, o: &SliceOpts) -> Vec<usize> {
    let peak = pcm.iter().fold(0.0f32, |m, v| m.max(v.abs()));
    if peak < 1e-4 {
        return vec![];
    }
    let win = frames(rate, 1.0).max(1);
    let gap = frames(rate, o.min_gap_ms);
    let thr = peak * o.threshold;
    let mut out = Vec::new();
    let mut i = 0;
    while i + win <= pcm.len() {
        let e = pcm[i..i + win].iter().fold(0.0f32, |m, v| m.max(v.abs()));
        if e >= thr {
            out.push(i);
            i += gap;
        } else {
            i += win;
        }
    }
    out
}

pub struct Slice {
    pub pcm: Vec<f32>,
    pub rate: u32,
}

pub fn slice_file(path: &Path, o: &SliceOpts) -> Result<Vec<Slice>, String> {
    let (pcm, rate) = decode_file(path)?;
    let on = onsets(&pcm, rate, o);
    let pre = frames(rate, o.pre_ms);
    let len = frames(rate, o.len_ms);
    let mut out = Vec::new();
    for &at in on.iter().take(o.max_slices) {
        let start = at.saturating_sub(pre);
        let end = (start + len).min(pcm.len());
        let mut s = pcm[start..end].to_vec();
        attack(&mut s, rate, 0.5);
        normalize(&mut s, 0.85);
        trim_tail(&mut s, 0.003, frames(rate, 8.0));
        out.push(Slice { pcm: s, rate });
    }
    Ok(out)
}

pub fn write_wav(path: &Path, s: &Slice) -> Result<(), String> {
    let spec = hound::WavSpec { channels: 1, sample_rate: s.rate, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut w = hound::WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for v in &s.pcm {
        w.write_sample((v.clamp(-1.0, 1.0) * 32767.0) as i16).map_err(|e| e.to_string())?;
    }
    w.finalize().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_separated_bursts() {
        let rate = 48000;
        let mut pcm = vec![0.0f32; rate as usize]; // 1 s
        for &at_ms in &[100.0, 400.0, 700.0] {
            let at = frames(rate, at_ms);
            for i in 0..200 {
                pcm[at + i] = 0.8 * (1.0 - i as f32 / 200.0);
            }
        }
        let on = onsets(&pcm, rate, &SliceOpts::default());
        assert_eq!(on.len(), 3);
        assert!((on[0] as i64 - frames(rate, 100.0) as i64).abs() < 100);
        assert!((on[2] as i64 - frames(rate, 700.0) as i64).abs() < 100);
    }

    #[test]
    fn silence_has_no_onsets() {
        assert!(onsets(&vec![0.0; 48000], 48000, &SliceOpts::default()).is_empty());
    }
}
