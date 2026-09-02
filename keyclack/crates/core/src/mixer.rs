//! Backend-independent voice mixer. Called from the audio thread only.
//!
//! Voices play a mono sample at a per-voice rate (linear interpolation) and gain,
//! summed and written to every output channel. Oldest voice is dropped when the
//! polyphony cap is hit.

use std::sync::{Arc, Mutex};
use std::time::Instant;

use crossbeam_channel::Receiver;

use crate::{PlayCmd, Sample};

pub const MAX_VOICES: usize = 32;

struct Voice {
    sample: Arc<Sample>,
    pos: f64,
    rate: f64,
    gain: f32,
}

pub struct Mixer {
    rx: Receiver<PlayCmd>,
    channels: usize,
    voices: Vec<Voice>,
    /// Optional latency log: ms from PlayCmd.t to the callback that dequeued it.
    stats: Option<Arc<Mutex<Vec<f64>>>>,
}

impl Mixer {
    pub fn new(rx: Receiver<PlayCmd>, channels: usize, stats: Option<Arc<Mutex<Vec<f64>>>>) -> Self {
        Self { rx, channels: channels.max(1), voices: Vec::with_capacity(MAX_VOICES), stats }
    }

    pub fn active_voices(&self) -> usize {
        self.voices.len()
    }

    /// Drain pending commands, then fill `out` (interleaved f32) with the mix.
    pub fn render(&mut self, out: &mut [f32]) {
        let now = Instant::now();
        while let Ok(cmd) = self.rx.try_recv() {
            if let Some(s) = &self.stats {
                if let Ok(mut s) = s.try_lock() {
                    s.push(now.duration_since(cmd.t).as_secs_f64() * 1000.0);
                }
            }
            if self.voices.len() >= MAX_VOICES {
                self.voices.remove(0);
            }
            self.voices.push(Voice { sample: cmd.sample, pos: 0.0, rate: cmd.rate.max(0.25) as f64, gain: cmd.gain });
        }
        let ch = self.channels;
        for frame in out.chunks_mut(ch) {
            let mut acc = 0.0f32;
            for v in self.voices.iter_mut() {
                let d = &v.sample.data;
                let i0 = v.pos as usize;
                if i0 + 1 < d.len() {
                    let f = (v.pos - i0 as f64) as f32;
                    acc += (d[i0] * (1.0 - f) + d[i0 + 1] * f) * v.gain;
                    v.pos += v.rate;
                } else if i0 < d.len() {
                    acc += d[i0] * v.gain;
                    v.pos += v.rate;
                }
            }
            let acc = acc.clamp(-1.0, 1.0);
            for s in frame.iter_mut() {
                *s = acc;
            }
        }
        self.voices.retain(|v| (v.pos as usize) < v.sample.data.len());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crossbeam_channel::unbounded;

    fn cmd(data: Vec<f32>, gain: f32, rate: f32) -> PlayCmd {
        PlayCmd { sample: Arc::new(Sample { data }), gain, rate, t: Instant::now() }
    }

    #[test]
    fn renders_silence_when_idle() {
        let (_tx, rx) = unbounded();
        let mut m = Mixer::new(rx, 2, None);
        let mut out = vec![1.0f32; 64];
        m.render(&mut out);
        assert!(out.iter().all(|v| *v == 0.0));
    }

    #[test]
    fn plays_sample_to_all_channels_then_ends() {
        let (tx, rx) = unbounded();
        let mut m = Mixer::new(rx, 2, None);
        tx.send(cmd(vec![0.5; 10], 1.0, 1.0)).unwrap();
        let mut out = vec![0.0f32; 2 * 16];
        m.render(&mut out);
        assert_eq!(out[0], 0.5);
        assert_eq!(out[1], 0.5);
        assert_eq!(out[2 * 9], 0.5);
        assert_eq!(out[2 * 10], 0.0, "silence after sample end");
        assert_eq!(m.active_voices(), 0);
    }

    #[test]
    fn overlapping_voices_sum_and_clamp() {
        let (tx, rx) = unbounded();
        let mut m = Mixer::new(rx, 1, None);
        tx.send(cmd(vec![0.4; 8], 1.0, 1.0)).unwrap();
        tx.send(cmd(vec![0.4; 8], 1.0, 1.0)).unwrap();
        tx.send(cmd(vec![0.4; 8], 1.0, 1.0)).unwrap();
        let mut out = vec![0.0f32; 8];
        m.render(&mut out);
        assert!((out[0] - 1.0).abs() < 1e-6, "3 × 0.4 clamps to 1.0, got {}", out[0]);
    }

    #[test]
    fn rate_changes_duration() {
        let (tx, rx) = unbounded();
        let mut m = Mixer::new(rx, 1, None);
        tx.send(cmd(vec![1.0; 100], 1.0, 2.0)).unwrap();
        let mut out = vec![0.0f32; 200];
        m.render(&mut out);
        let played = out.iter().filter(|v| **v > 0.0).count();
        assert!((49..=51).contains(&played), "double rate ≈ half length, got {played}");
    }

    #[test]
    fn polyphony_cap_drops_oldest() {
        let (tx, rx) = unbounded();
        let mut m = Mixer::new(rx, 1, None);
        for i in 0..(MAX_VOICES + 4) {
            tx.send(cmd(vec![i as f32 * 0.001; 1000], 1.0, 1.0)).unwrap();
        }
        let mut out = vec![0.0f32; 4];
        m.render(&mut out);
        assert_eq!(m.active_voices(), MAX_VOICES);
    }

    #[test]
    fn logs_latency_when_stats_attached() {
        let (tx, rx) = unbounded();
        let stats = Arc::new(Mutex::new(Vec::new()));
        let mut m = Mixer::new(rx, 1, Some(stats.clone()));
        tx.send(cmd(vec![0.1; 4], 1.0, 1.0)).unwrap();
        m.render(&mut [0.0f32; 4]);
        let s = stats.lock().unwrap();
        assert_eq!(s.len(), 1);
        assert!(s[0] >= 0.0 && s[0] < 1000.0);
    }
}
