//! keyclack-core: OS-independent engine.
//!
//! Sound pack loading (Mechvibes format), scancode → pack keycode mapping, the
//! key-state engine that turns key events into play commands, and the mixer that
//! renders them. Nothing in here touches the OS input or audio APIs.
//!
//! Privacy rule: key identity is used only to pick a sound slot. Nothing here
//! logs, stores, or transmits it.

pub mod decode;
pub mod engine;
pub mod keycode;
pub mod mixer;
pub mod pack;
pub mod synth;

use std::sync::Arc;
use std::time::Instant;

pub use engine::{Engine, EngineConfig};
pub use mixer::Mixer;
pub use pack::Pack;

/// One key transition, as produced by a platform input layer.
#[derive(Clone, Copy, Debug)]
pub struct KeyEvent {
    /// PC/XT set-1 scancode (low byte).
    pub scancode: u8,
    /// The E0 prefix (right Ctrl/Alt, arrows, nav cluster, numpad Enter/Divide, Win keys).
    pub extended: bool,
    /// Numpad key acting as navigation (Num Lock off). Mechvibes packs address these
    /// separately from the digit variants.
    pub numpad_nav: bool,
    /// Synthesized by software (SendInput / macros / remote desktop).
    pub injected: bool,
    pub is_down: bool,
    pub t: Instant,
}

/// Mono PCM already resampled to the output device rate.
#[derive(Debug)]
pub struct Sample {
    pub data: Vec<f32>,
}

/// Command for the audio thread.
pub struct PlayCmd {
    pub sample: Arc<Sample>,
    pub gain: f32,
    /// Playback rate multiplier (1.0 = original pitch).
    pub rate: f32,
    pub t: Instant,
}
