//! The running service: hook thread + engine thread + audio thread + context poller.
//!
//! A UI shell drives it with [`Service`] methods (all non-blocking) and reads a
//! [`Status`] snapshot. Config persistence is the shell's job; the service only
//! needs the current [`AppConfig`] pushed in via [`Service::apply_config`].

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crossbeam_channel::{bounded, select, unbounded, Receiver, Sender};
use keyclack_core::{Engine, EngineConfig, KeyEvent, Mixer, Pack, PlayCmd};
use serde::Serialize;

use crate::config::AppConfig;
use crate::context;
use crate::rules::{self, Effective};

#[derive(Clone, Debug, Default, Serialize)]
pub struct Status {
    pub pack_id: Option<String>,
    pub pack_name: String,
    pub pack_keys: usize,
    pub pack_has_up: bool,
    /// User toggled mute (hotkey / tray).
    pub manual_mute: bool,
    /// What the engine is doing after rules and auto-mute.
    pub effective_muted: bool,
    pub effective_volume: f32,
    pub reason: Option<String>,
    pub device: String,
    pub sample_rate: u32,
    pub period_ms: f64,
    pub foreground_exe: Option<String>,
    pub mic_in_use: bool,
    /// Which app holds the microphone (exe name or package family name).
    pub mic_app: Option<String>,
    /// Count only; never which keys.
    pub key_count: u64,
    pub latency_p50_ms: Option<f64>,
    pub latency_p99_ms: Option<f64>,
    pub last_error: Option<String>,
    pub hook_installed: bool,
}

enum Cmd {
    Config(AppConfig),
    ManualMute(bool),
    Context { foreground: Option<String>, mic: Option<String> },
    Preview(Option<String>),
    Shutdown,
}

pub struct Service {
    cmd_tx: Sender<Cmd>,
    status: Arc<Mutex<Status>>,
    on_change: Arc<Mutex<Option<Box<dyn Fn(&Status) + Send>>>>,
}

impl Service {
    /// Starts every thread. Returns immediately; audio/pack errors show up in `Status.last_error`.
    pub fn start(cfg: AppConfig) -> Service {
        let (cmd_tx, cmd_rx) = unbounded::<Cmd>();
        let status = Arc::new(Mutex::new(Status::default()));
        let on_change: Arc<Mutex<Option<Box<dyn Fn(&Status) + Send>>>> = Arc::new(Mutex::new(None));

        let (key_tx, key_rx) = bounded::<KeyEvent>(256);
        keyclack_input_win::spawn(key_tx);
        status.lock().unwrap().hook_installed = true;

        {
            let status = status.clone();
            let on_change = on_change.clone();
            std::thread::Builder::new()
                .name("keyclack-service".into())
                .spawn(move || run(cfg, key_rx, cmd_rx, status, on_change))
                .expect("spawn service thread");
        }
        {
            let tx = cmd_tx.clone();
            std::thread::Builder::new()
                .name("keyclack-context".into())
                .spawn(move || {
                    let mut last: Option<(Option<String>, Option<String>)> = None;
                    let mut mic: Option<String> = None;
                    let mut mic_at = Instant::now() - Duration::from_secs(10);
                    loop {
                        std::thread::sleep(Duration::from_millis(400));
                        if mic_at.elapsed() >= Duration::from_millis(1500) {
                            mic = context::mic_holder();
                            mic_at = Instant::now();
                        }
                        let fg = context::foreground_exe();
                        let cur = (fg, mic.clone());
                        if last.as_ref() != Some(&cur) {
                            if tx.send(Cmd::Context { foreground: cur.0.clone(), mic: cur.1.clone() }).is_err() {
                                return;
                            }
                            last = Some(cur);
                        }
                    }
                })
                .expect("spawn context thread");
        }
        Service { cmd_tx, status, on_change }
    }

    pub fn status(&self) -> Status {
        self.status.lock().unwrap().clone()
    }

    /// Called (from the service thread) whenever the status changes.
    pub fn set_on_change(&self, f: impl Fn(&Status) + Send + 'static) {
        *self.on_change.lock().unwrap() = Some(Box::new(f));
    }

    pub fn apply_config(&self, cfg: AppConfig) {
        let _ = self.cmd_tx.send(Cmd::Config(cfg));
    }

    pub fn set_manual_mute(&self, muted: bool) {
        let _ = self.cmd_tx.send(Cmd::ManualMute(muted));
    }

    pub fn toggle_mute(&self) -> bool {
        let next = !self.status.lock().unwrap().manual_mute;
        self.set_manual_mute(next);
        next
    }

    /// Play a short typing sequence with `pack` (dir name, or None for the built-in
    /// click) without changing the active pack.
    pub fn preview(&self, pack: Option<String>) {
        let _ = self.cmd_tx.send(Cmd::Preview(pack));
    }

    pub fn shutdown(&self) {
        let _ = self.cmd_tx.send(Cmd::Shutdown);
    }
}

/// Keycodes of the preview phrase: a few letters, space, more letters, enter, backspace.
const PREVIEW_SEQ: &[u32] = &[20, 23, 24, 57, 19, 24, 31, 28, 14];

fn spawn_preview(pack: Arc<Pack>, play_tx: Sender<PlayCmd>) {
    std::thread::Builder::new()
        .name("keyclack-preview".into())
        .spawn(move || {
            let mut engine = Engine::new(pack, EngineConfig { allow_injected: true, volume: 0.9, ..Default::default() });
            for &code in PREVIEW_SEQ {
                let (sc, ext) = if code >= 0x0E00 { ((code & 0xFF) as u8, true) } else { (code as u8, false) };
                let mut ev = KeyEvent { scancode: sc, extended: ext, numpad_nav: false, injected: true, is_down: true, t: Instant::now() };
                if let Some(c) = engine.on_key(ev) { let _ = play_tx.try_send(c); }
                std::thread::sleep(Duration::from_millis(70));
                ev.is_down = false;
                ev.t = Instant::now();
                if let Some(c) = engine.on_key(ev) { let _ = play_tx.try_send(c); }
                std::thread::sleep(Duration::from_millis(if code == 57 || code == 28 { 160 } else { 95 }));
            }
        })
        .expect("spawn preview thread");
}

struct Audio {
    stop: Arc<AtomicBool>,
    sample_rate: u32,
    period_ms: f64,
    device: String,
}

fn start_audio(device: Option<String>, play_rx: Receiver<PlayCmd>, stats: Arc<Mutex<Vec<f64>>>) -> Result<Audio, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let rx = play_rx;
    let st = stats;
    let info = keyclack_audio_win::start(device, move |ch| Mixer::new(rx, ch, Some(st)), stop.clone())
        .map_err(|e| e.to_string())?;
    Ok(Audio {
        stop,
        sample_rate: info.sample_rate,
        period_ms: info.period_frames as f64 * 1000.0 / info.sample_rate as f64,
        device: info.name,
    })
}

fn load_pack(cfg: &AppConfig, id: Option<&str>, rate: u32) -> Result<Pack, String> {
    match id {
        None => Ok(Pack::synthetic(rate)),
        Some(id) => Pack::load(&cfg.packs_dir().join(id), rate),
    }
}

fn engine_config(cfg: &AppConfig, eff: &Effective, is_synthetic: bool) -> EngineConfig {
    EngineConfig {
        allow_repeat: cfg.allow_repeat,
        // Test hook: lets SendInput-driven checks exercise the whole pipeline.
        allow_injected: std::env::var_os("KEYCLACK_ALLOW_INJECTED").is_some(),
        play_up: cfg.play_up,
        volume: if eff.muted { 0.0 } else { eff.volume },
        up_gain: if is_synthetic { 0.6 } else { 1.0 },
        ..Default::default()
    }
}

fn run(
    mut cfg: AppConfig,
    key_rx: Receiver<KeyEvent>,
    cmd_rx: Receiver<Cmd>,
    status: Arc<Mutex<Status>>,
    on_change: Arc<Mutex<Option<Box<dyn Fn(&Status) + Send>>>>,
) {
    let stats = Arc::new(Mutex::new(Vec::<f64>::new()));
    let (play_tx, play_rx) = bounded::<PlayCmd>(256);

    let mut audio: Option<Audio> = None;
    let mut audio_device_req: Option<String> = cfg.device.clone();
    let mut manual_mute = false;
    let mut foreground: Option<String> = None;
    let mut mic: Option<String> = None;
    let mut eff = rules::resolve(&cfg, None, None, false);
    let mut loaded_pack_id: Option<Option<String>> = None; // Some(id) once something is loaded
    let mut engine = Engine::new(Arc::new(Pack::synthetic(48000)), EngineConfig::default());
    let mut key_count = 0u64;

    let notify = |status: &Arc<Mutex<Status>>| {
        if let Some(f) = on_change.lock().unwrap().as_ref() {
            f(&status.lock().unwrap());
        }
    };

    // (Re)open audio, reload pack, push engine config. Called on any relevant change.
    let reconcile = |cfg: &AppConfig,
                         eff: &Effective,
                         manual_mute: bool,
                         audio: &mut Option<Audio>,
                         audio_device_req: &mut Option<String>,
                         loaded_pack_id: &mut Option<Option<String>>,
                         engine: &mut Engine,
                         force_audio: bool| {
        let mut err: Option<String> = None;
        if audio.is_none() || force_audio || *audio_device_req != cfg.device {
            if let Some(a) = audio.take() {
                a.stop.store(true, Ordering::Relaxed);
                std::thread::sleep(Duration::from_millis(60));
            }
            *audio_device_req = cfg.device.clone();
            match start_audio(cfg.device.clone(), play_rx.clone(), stats.clone()) {
                Ok(a) => *audio = Some(a),
                Err(e) => err = Some(format!("audio: {e}")),
            }
            *loaded_pack_id = None; // sample rate may have changed
        }
        let rate = audio.as_ref().map(|a| a.sample_rate).unwrap_or(48000);
        if loaded_pack_id.as_ref() != Some(&eff.pack) {
            match load_pack(cfg, eff.pack.as_deref(), rate) {
                Ok(p) => {
                    engine.set_pack(Arc::new(p));
                    *loaded_pack_id = Some(eff.pack.clone());
                }
                Err(e) => {
                    err = Some(format!("pack {:?}: {e}", eff.pack));
                    if loaded_pack_id.is_none() {
                        engine.set_pack(Arc::new(Pack::synthetic(rate)));
                        *loaded_pack_id = Some(None);
                    }
                }
            }
        }
        let is_synthetic = loaded_pack_id.as_ref().map(|p| p.is_none()).unwrap_or(true);
        engine.set_config(engine_config(cfg, eff, is_synthetic));

        let mut s = status.lock().unwrap();
        s.pack_id = loaded_pack_id.clone().flatten();
        s.pack_name = engine.pack().name.clone();
        s.pack_keys = engine.pack().mapped_key_count();
        s.pack_has_up = engine.pack().has_up_sounds();
        s.manual_mute = manual_mute;
        s.effective_muted = eff.muted;
        s.effective_volume = eff.volume;
        s.reason = eff.reason.clone();
        if let Some(a) = audio.as_ref() {
            s.device = a.device.clone();
            s.sample_rate = a.sample_rate;
            s.period_ms = a.period_ms;
        }
        s.last_error = err;
    };

    reconcile(&cfg, &eff, manual_mute, &mut audio, &mut audio_device_req, &mut loaded_pack_id, &mut engine, false);
    notify(&status);

    let mut last_stats = Instant::now();
    loop {
        select! {
            recv(key_rx) -> ev => {
                let Ok(ev) = ev else { break };
                if let Some(cmd) = engine.on_key(ev) {
                    key_count += 1;
                    let _ = play_tx.try_send(cmd);
                }
                if last_stats.elapsed() >= Duration::from_secs(2) {
                    last_stats = Instant::now();
                    let mut v = stats.lock().unwrap().clone();
                    if !v.is_empty() {
                        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
                        let pct = |p: f64| v[((v.len() as f64 - 1.0) * p).round() as usize];
                        let mut s = status.lock().unwrap();
                        s.latency_p50_ms = Some(pct(0.5));
                        s.latency_p99_ms = Some(pct(0.99));
                        s.key_count = key_count;
                    }
                    if stats.lock().unwrap().len() > 5000 {
                        stats.lock().unwrap().drain(..2500);
                    }
                    notify(&status);
                }
            }
            recv(cmd_rx) -> cmd => {
                let Ok(cmd) = cmd else { break };
                match cmd {
                    Cmd::Config(new) => {
                        let force_audio = new.device != cfg.device || new.exclusive != cfg.exclusive;
                        let packs_dir_changed = new.packs_dir != cfg.packs_dir;
                        cfg = new;
                        if packs_dir_changed { loaded_pack_id = None; }
                        eff = rules::resolve(&cfg, foreground.as_deref(), mic.as_deref(), manual_mute);
                        reconcile(&cfg, &eff, manual_mute, &mut audio, &mut audio_device_req, &mut loaded_pack_id, &mut engine, force_audio);
                        notify(&status);
                    }
                    Cmd::ManualMute(m) => {
                        manual_mute = m;
                        eff = rules::resolve(&cfg, foreground.as_deref(), mic.as_deref(), manual_mute);
                        reconcile(&cfg, &eff, manual_mute, &mut audio, &mut audio_device_req, &mut loaded_pack_id, &mut engine, false);
                        notify(&status);
                    }
                    Cmd::Context { foreground: fg, mic: m } => {
                        foreground = fg;
                        mic = m;
                        // Focus changed: a key-up may have been lost, so clear held state.
                        engine.release_all();
                        let next = rules::resolve(&cfg, foreground.as_deref(), mic.as_deref(), manual_mute);
                        {
                            let mut s = status.lock().unwrap();
                            s.foreground_exe = foreground.clone();
                            s.mic_in_use = mic.is_some();
                            s.mic_app = mic.clone();
                        }
                        if next != eff {
                            eff = next;
                            reconcile(&cfg, &eff, manual_mute, &mut audio, &mut audio_device_req, &mut loaded_pack_id, &mut engine, false);
                        }
                        notify(&status);
                    }
                    Cmd::Preview(id) => {
                        let rate = audio.as_ref().map(|a| a.sample_rate).unwrap_or(48000);
                        if loaded_pack_id.as_ref() == Some(&id) {
                            spawn_preview(engine.pack().clone(), play_tx.clone());
                        } else {
                            match load_pack(&cfg, id.as_deref(), rate) {
                                Ok(p) => spawn_preview(Arc::new(p), play_tx.clone()),
                                Err(e) => {
                                    status.lock().unwrap().last_error = Some(format!("preview {id:?}: {e}"));
                                    notify(&status);
                                }
                            }
                        }
                    }
                    Cmd::Shutdown => break,
                }
            }
        }
    }
    if let Some(a) = audio.take() {
        a.stop.store(true, Ordering::Relaxed);
    }
}

/// Output device names, for a device picker.
pub fn list_devices() -> Vec<String> {
    keyclack_audio_win::list_devices()
}

/// Where the built-in packs get copied on first run (shell's job) and where users drop packs.
pub fn default_packs_dir() -> PathBuf {
    crate::config::data_dir().join("packs")
}
