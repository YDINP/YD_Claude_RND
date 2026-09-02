//! Backend-independent voice mixer. Called from the audio thread only.

use std::sync::Arc;
use std::time::Instant;

use crossbeam_channel::Receiver;

use crate::{stats, PlayCmd};

pub const MAX_VOICES: usize = 32;

struct Voice {
    sample: Arc<Vec<f32>>,
    pos: usize,
    gain: f32,
}

pub struct Mixer {
    rx: Receiver<PlayCmd>,
    channels: usize,
    voices: Vec<Voice>,
}

impl Mixer {
    pub fn new(rx: Receiver<PlayCmd>, channels: usize) -> Self {
        Self { rx, channels, voices: Vec::with_capacity(MAX_VOICES) }
    }

    /// Drain pending commands, then fill `out` (interleaved f32) with the mix.
    pub fn render(&mut self, out: &mut [f32]) {
        let now = Instant::now();
        while let Ok(cmd) = self.rx.try_recv() {
            let lat = now.duration_since(cmd.t).as_secs_f64() * 1000.0;
            if let Ok(mut s) = stats().try_lock() {
                s.push(lat);
            }
            if self.voices.len() >= MAX_VOICES {
                self.voices.remove(0);
            }
            self.voices.push(Voice { sample: cmd.sample, pos: 0, gain: cmd.gain });
        }
        for frame in out.chunks_mut(self.channels) {
            let mut acc = 0.0f32;
            for v in self.voices.iter_mut() {
                if v.pos < v.sample.len() {
                    acc += v.sample[v.pos] * v.gain;
                    v.pos += 1;
                }
            }
            let acc = acc.clamp(-1.0, 1.0);
            for s in frame.iter_mut() {
                *s = acc;
            }
        }
        self.voices.retain(|v| v.pos < v.sample.len());
    }
}
