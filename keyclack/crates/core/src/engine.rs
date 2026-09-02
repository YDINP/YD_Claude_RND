//! Key-state engine: KeyEvent in, PlayCmd out. Pure logic, no I/O.

use std::collections::HashMap;
use std::sync::Arc;

use crate::keycode::uiohook_code;
use crate::pack::Pack;
use crate::{KeyEvent, PlayCmd, Sample};

#[derive(Clone, Debug)]
pub struct EngineConfig {
    /// Play a sound for auto-repeated keydowns (key held).
    pub allow_repeat: bool,
    /// Play for software-injected events (macros, remote desktop, SendInput).
    pub allow_injected: bool,
    /// Play key-release sounds when the pack has them.
    pub play_up: bool,
    /// Master gain, 0.0 – 1.0 (may exceed 1.0; the mixer clamps).
    pub volume: f32,
    /// Release sounds are scaled by this on top of `volume`.
    pub up_gain: f32,
    /// ± fraction of playback rate, e.g. 0.02 = ±2 %.
    pub pitch_jitter: f32,
    /// ± fraction of gain, e.g. 0.10 = ±10 %.
    pub gain_jitter: f32,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            allow_repeat: false,
            allow_injected: false,
            play_up: true,
            volume: 1.0,
            up_gain: 1.0,
            pitch_jitter: 0.02,
            gain_jitter: 0.10,
        }
    }
}

pub struct Engine {
    cfg: EngineConfig,
    pack: Arc<Pack>,
    /// One bit per uiohook keycode (0..=0xFFFF).
    pressed: Vec<u64>,
    last_variant: HashMap<u32, usize>,
    rng: u32,
}

impl Engine {
    pub fn new(pack: Arc<Pack>, cfg: EngineConfig) -> Self {
        Self { cfg, pack, pressed: vec![0; 1024], last_variant: HashMap::new(), rng: 0x9E37_79B9 }
    }

    pub fn config(&self) -> &EngineConfig {
        &self.cfg
    }

    pub fn set_config(&mut self, cfg: EngineConfig) {
        self.cfg = cfg;
    }

    pub fn set_pack(&mut self, pack: Arc<Pack>) {
        self.pack = pack;
        self.last_variant.clear();
    }

    pub fn pack(&self) -> &Arc<Pack> {
        &self.pack
    }

    fn is_pressed(&self, code: u32) -> bool {
        self.pressed[(code as usize >> 6) & 1023] & (1u64 << (code & 63)) != 0
    }

    fn set_pressed(&mut self, code: u32, v: bool) {
        let w = &mut self.pressed[(code as usize >> 6) & 1023];
        if v { *w |= 1u64 << (code & 63) } else { *w &= !(1u64 << (code & 63)) }
    }

    /// xorshift32 → uniform in [-1, 1).
    fn rand(&mut self) -> f32 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 17;
        self.rng ^= self.rng << 5;
        (self.rng as f32 / u32::MAX as f32) * 2.0 - 1.0
    }

    fn pick(&mut self, code: u32, candidates: &[Arc<Sample>]) -> Option<Arc<Sample>> {
        match candidates.len() {
            0 => None,
            1 => Some(candidates[0].clone()),
            n => {
                let r = ((self.rand() + 1.0) * 0.5 * n as f32) as usize % n;
                let last = self.last_variant.get(&code).copied();
                let idx = if Some(r) == last { (r + 1) % n } else { r };
                self.last_variant.insert(code, idx);
                Some(candidates[idx].clone())
            }
        }
    }

    /// Returns the sound to play for this event, if any.
    pub fn on_key(&mut self, ev: KeyEvent) -> Option<PlayCmd> {
        if ev.injected && !self.cfg.allow_injected {
            return None;
        }
        let code = uiohook_code(ev.scancode, ev.extended, ev.numpad_nav);
        if ev.is_down {
            let was = self.is_pressed(code);
            self.set_pressed(code, true);
            if was && !self.cfg.allow_repeat {
                return None;
            }
        } else {
            self.set_pressed(code, false);
            if !self.cfg.play_up {
                return None;
            }
        }
        let pack = self.pack.clone();
        let candidates = if ev.is_down { pack.down(code) } else { pack.up(code) };
        let sample = self.pick(code, candidates)?;
        let base = if ev.is_down { self.cfg.volume } else { self.cfg.volume * self.cfg.up_gain };
        let gain = base * (1.0 + self.cfg.gain_jitter * self.rand());
        let rate = 1.0 + self.cfg.pitch_jitter * self.rand();
        Some(PlayCmd { sample, gain: gain.max(0.0), rate, t: ev.t })
    }

    /// Forget every held key (e.g. after focus loss, so a missed key-up cannot mute a key).
    pub fn release_all(&mut self) {
        self.pressed.iter_mut().for_each(|w| *w = 0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn ev(scancode: u8, is_down: bool) -> KeyEvent {
        KeyEvent { scancode, extended: false, numpad_nav: false, injected: false, is_down, t: Instant::now() }
    }

    fn engine(cfg: EngineConfig) -> Engine {
        Engine::new(Arc::new(Pack::synthetic(48000)), cfg)
    }

    #[test]
    fn down_and_up_play() {
        let mut e = engine(EngineConfig::default());
        assert!(e.on_key(ev(0x1E, true)).is_some());
        assert!(e.on_key(ev(0x1E, false)).is_some());
    }

    #[test]
    fn auto_repeat_is_suppressed_until_release() {
        let mut e = engine(EngineConfig::default());
        assert!(e.on_key(ev(0x1E, true)).is_some());
        assert!(e.on_key(ev(0x1E, true)).is_none());
        assert!(e.on_key(ev(0x1E, true)).is_none());
        assert!(e.on_key(ev(0x1E, false)).is_some());
        assert!(e.on_key(ev(0x1E, true)).is_some());
    }

    #[test]
    fn repeat_can_be_allowed() {
        let mut e = engine(EngineConfig { allow_repeat: true, ..Default::default() });
        assert!(e.on_key(ev(0x1E, true)).is_some());
        assert!(e.on_key(ev(0x1E, true)).is_some());
    }

    #[test]
    fn different_keys_do_not_block_each_other() {
        let mut e = engine(EngineConfig::default());
        assert!(e.on_key(ev(0x1E, true)).is_some());
        assert!(e.on_key(ev(0x30, true)).is_some());
        // Same scancode, extended → different code, so it is a fresh press.
        let mut ext = ev(0x1E, true);
        ext.extended = true;
        assert!(e.on_key(ext).is_some());
    }

    #[test]
    fn injected_filtered_by_default() {
        let mut e = engine(EngineConfig::default());
        let mut i = ev(0x1E, true);
        i.injected = true;
        assert!(e.on_key(i).is_none());
        let mut e2 = engine(EngineConfig { allow_injected: true, ..Default::default() });
        assert!(e2.on_key(i).is_some());
    }

    #[test]
    fn up_can_be_disabled_and_state_still_tracked() {
        let mut e = engine(EngineConfig { play_up: false, ..Default::default() });
        assert!(e.on_key(ev(0x1E, true)).is_some());
        assert!(e.on_key(ev(0x1E, false)).is_none());
        assert!(e.on_key(ev(0x1E, true)).is_some(), "release still cleared the pressed bit");
    }

    #[test]
    fn jitter_stays_in_bounds() {
        let cfg = EngineConfig { volume: 0.5, pitch_jitter: 0.02, gain_jitter: 0.1, ..Default::default() };
        let mut e = engine(cfg);
        for i in 0..500u32 {
            let sc = (0x10 + (i % 40)) as u8;
            let cmd = e.on_key(ev(sc, true)).unwrap();
            assert!(cmd.gain >= 0.45 - 1e-4 && cmd.gain <= 0.55 + 1e-4, "gain {}", cmd.gain);
            assert!(cmd.rate >= 0.98 - 1e-4 && cmd.rate <= 1.02 + 1e-4, "rate {}", cmd.rate);
            e.on_key(ev(sc, false));
        }
    }

    #[test]
    fn release_all_clears_state() {
        let mut e = engine(EngineConfig::default());
        assert!(e.on_key(ev(0x1E, true)).is_some());
        e.release_all();
        assert!(e.on_key(ev(0x1E, true)).is_some());
    }

    #[test]
    fn variants_avoid_immediate_repeat() {
        // A pack whose generic has 2 variants: consecutive picks for the same key must alternate.
        let dir = std::env::temp_dir().join("keyclack-engine-variants");
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..2 {
            let spec = hound::WavSpec { channels: 1, sample_rate: 48000, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
            let mut w = hound::WavWriter::create(dir.join(format!("g{i}.wav")), spec).unwrap();
            for _ in 0..100 {
                w.write_sample((0.2 * (i + 1) as f32 * 32000.0) as i16).unwrap();
            }
            w.finalize().unwrap();
        }
        std::fs::write(dir.join("config.json"), r#"{"name":"v","key_define_type":"multi","sound":"g{0-1}.wav","defines":{}}"#).unwrap();
        let pack = Arc::new(Pack::load(&dir, 48000).unwrap());
        let mut e = Engine::new(pack, EngineConfig { gain_jitter: 0.0, ..Default::default() });
        let mut prev = None;
        for _ in 0..20 {
            let cmd = e.on_key(ev(0x1E, true)).unwrap();
            let level = cmd.sample.data[5];
            if let Some(p) = prev {
                assert!((level - p as f32).abs() > 0.1, "same variant twice in a row");
            }
            prev = Some(level);
            e.on_key(ev(0x1E, false));
        }
    }
}
