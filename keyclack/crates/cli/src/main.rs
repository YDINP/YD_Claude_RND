//! Phase 0 spike: global low-level keyboard hook -> click sound, with latency bench.
//!
//! Privacy rule: key identity never leaves this process. We only ever look at the
//! scancode to pick a sound slot; nothing is logged or written to disk.

use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use crossbeam_channel::{bounded, Receiver, Sender};

mod hook;
mod mixer;
mod synth;
mod wasapi3;

/// One key transition, produced by the hook thread.
#[derive(Clone, Copy, Debug)]
pub struct KeyEvent {
    pub scancode: u16,
    pub extended: bool,
    pub injected: bool,
    pub is_down: bool,
    pub t: Instant,
}

/// Command for the audio thread.
pub struct PlayCmd {
    pub sample: Arc<Vec<f32>>,
    pub gain: f32,
    pub t: Instant,
}

#[derive(Default)]
struct Args {
    wav: Option<String>,
    seconds: Option<u64>,
    allow_injected: bool,
    allow_repeat: bool,
    buffer_frames: Option<u32>,
    quiet: bool,
    device: Option<String>,
    list_devices: bool,
    backend: String,
}

fn parse_args() -> Args {
    let mut a = Args { backend: "wasapi3".into(), ..Default::default() };
    let mut it = std::env::args().skip(1);
    while let Some(k) = it.next() {
        match k.as_str() {
            "--wav" => a.wav = it.next(),
            "--seconds" => a.seconds = it.next().and_then(|s| s.parse().ok()),
            "--buffer" => a.buffer_frames = it.next().and_then(|s| s.parse().ok()),
            "--allow-injected" => a.allow_injected = true,
            "--allow-repeat" => a.allow_repeat = true,
            "--quiet" => a.quiet = true,
            "--device" => a.device = it.next(),
            "--list-devices" => a.list_devices = true,
            "--backend" => a.backend = it.next().unwrap_or_default(),
            "-h" | "--help" => {
                eprintln!(
                    "keyclack (phase 0 spike)\n  --wav <file>       use a wav file instead of the synthetic click\n  --seconds <n>      exit after n seconds and print stats\n  --buffer <frames>  request a fixed WASAPI buffer size\n  --allow-injected   also play for injected (SendInput) events\n  --allow-repeat     play auto-repeat keydowns\n  --quiet            do not print per-key lines
  --device <substr>  pick an output device whose name contains <substr>
  --list-devices     print output devices and exit
  --backend <b>      wasapi3 (default, IAudioClient3 min period) | cpal (10 ms shared period)"
                );
                std::process::exit(0);
            }
            _ => {}
        }
    }
    a
}

static STATS: OnceLock<Mutex<Vec<f64>>> = OnceLock::new();

pub fn stats() -> &'static Mutex<Vec<f64>> {
    STATS.get_or_init(|| Mutex::new(Vec::new()))
}

fn print_stats(buffer_ms: f64) {
    let mut v = stats().lock().unwrap().clone();
    if v.is_empty() {
        println!("[stats] no key events captured");
        return;
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pct = |p: f64| v[((v.len() as f64 - 1.0) * p).round() as usize];
    let mean = v.iter().sum::<f64>() / v.len() as f64;
    println!(
        "[stats] n={}  hook->audio-callback: p50={:.2}ms p90={:.2}ms p99={:.2}ms max={:.2}ms mean={:.2}ms | +buffer {:.2}ms => est. p50 output {:.2}ms",
        v.len(),
        pct(0.5),
        pct(0.9),
        pct(0.99),
        v[v.len() - 1],
        mean,
        buffer_ms,
        pct(0.5) + buffer_ms
    );
}

fn load_wav(path: &str, out_rate: u32) -> Vec<f32> {
    let mut r = hound::WavReader::open(path).expect("open wav");
    let spec = r.spec();
    let ch = spec.channels as usize;
    let mono: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => r
            .samples::<f32>()
            .map(|s| s.unwrap())
            .collect::<Vec<_>>()
            .chunks(ch)
            .map(|c| c.iter().sum::<f32>() / ch as f32)
            .collect(),
        hound::SampleFormat::Int => {
            let max = (1u32 << (spec.bits_per_sample - 1)) as f32;
            r.samples::<i32>()
                .map(|s| s.unwrap() as f32 / max)
                .collect::<Vec<_>>()
                .chunks(ch)
                .map(|c| c.iter().sum::<f32>() / ch as f32)
                .collect()
        }
    };
    synth::resample_linear(&mono, spec.sample_rate, out_rate)
}

fn main() {
    let args = parse_args();

    // ---- channels ----
    let (key_tx, key_rx): (Sender<KeyEvent>, Receiver<KeyEvent>) = bounded(256);
    let (play_tx, play_rx): (Sender<PlayCmd>, Receiver<PlayCmd>) = bounded(256);

    // ---- audio backend ----
    let host = cpal::default_host();
    let dev_name = |d: &cpal::Device| d.description().map(|x| x.name().to_string()).unwrap_or_default();
    if args.list_devices {
        for d in host.output_devices().expect("enumerate") {
            println!("{}", dev_name(&d));
        }
        return;
    }
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let mut _cpal_stream: Option<cpal::Stream> = None;
    let (sample_rate, period_frames): (u32, u32) = if args.backend == "wasapi3" {
        let rx = play_rx.clone();
        match wasapi3::start(args.device.clone(), move |ch| mixer::Mixer::new(rx, ch), stop.clone()) {
            Ok(info) => {
                println!(
                    "[audio] backend=wasapi3 device={:?} rate={} ch={} period={} frames ({:.2} ms) buffer={} frames",
                    info.name,
                    info.sample_rate,
                    info.channels,
                    info.period_frames,
                    info.period_frames as f64 * 1000.0 / info.sample_rate as f64,
                    info.buffer_frames
                );
                (info.sample_rate, info.period_frames)
            }
            Err(e) => {
                eprintln!("[audio] wasapi3 failed ({e}); use --backend cpal");
                std::process::exit(1);
            }
        }
    } else {
        let device = match &args.device {
            Some(sub) => host
                .output_devices()
                .expect("enumerate")
                .find(|d| dev_name(d).to_lowercase().contains(&sub.to_lowercase()))
                .expect("no output device matching --device"),
            None => host.default_output_device().expect("no default output device"),
        };
        let supported = device.default_output_config().expect("default output config");
        let sample_rate = supported.sample_rate();
        let channels = supported.channels() as usize;
        let mut config: cpal::StreamConfig = supported.clone().into();
        if let Some(f) = args.buffer_frames {
            config.buffer_size = cpal::BufferSize::Fixed(f);
        }
        let observed = Arc::new(Mutex::new(0u32));
        let make_cb = {
            let observed = observed.clone();
            let play_rx = play_rx.clone();
            move || {
                let observed = observed.clone();
                let mut m = mixer::Mixer::new(play_rx.clone(), channels);
                move |out: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    if let Ok(mut b) = observed.try_lock() {
                        *b = (out.len() / channels) as u32;
                    }
                    m.render(out);
                }
            }
        };
        let err_cb = |e| eprintln!("[audio] stream error: {e}");
        let stream = match device.build_output_stream(config.clone(), make_cb(), err_cb, None) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[audio] requested buffer rejected ({e}); falling back to default buffer");
                let mut c: cpal::StreamConfig = supported.clone().into();
                c.buffer_size = cpal::BufferSize::Default;
                device.build_output_stream(c, make_cb(), err_cb, None).expect("build output stream")
            }
        };
        stream.play().expect("play");
        std::thread::sleep(Duration::from_millis(300));
        let period = *observed.lock().unwrap();
        println!(
            "[audio] backend=cpal device={:?} rate={} ch={} fmt={:?} period={} frames ({:.2} ms)",
            dev_name(&device),
            sample_rate,
            channels,
            supported.sample_format(),
            period,
            period as f64 * 1000.0 / sample_rate as f64
        );
        _cpal_stream = Some(stream);
        (sample_rate, period)
    };
    let buffer_ms = period_frames as f64 * 1000.0 / sample_rate as f64;

    // ---- samples ----
    let (down, up) = if let Some(p) = &args.wav {
        let s = Arc::new(load_wav(p, sample_rate));
        (s.clone(), s)
    } else {
        (
            Arc::new(synth::click_down(sample_rate)),
            Arc::new(synth::click_up(sample_rate)),
        )
    };

    // ---- engine thread: key events -> play commands ----
    let allow_injected = args.allow_injected;
    let allow_repeat = args.allow_repeat;
    let quiet = args.quiet;
    std::thread::spawn(move || {
        let mut pressed = [false; 1024];
        let mut seed: u32 = 0x9E37_79B9;
        let mut rnd = move || {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            (seed as f32 / u32::MAX as f32) * 2.0 - 1.0
        };
        for ev in key_rx.iter() {
            if ev.injected && !allow_injected {
                continue;
            }
            let idx = ev.scancode as usize | if ev.extended { 512 } else { 0 };
            if ev.is_down {
                if pressed[idx] && !allow_repeat {
                    continue;
                }
                pressed[idx] = true;
            } else {
                pressed[idx] = false;
            }
            let (sample, base_gain) = if ev.is_down { (down.clone(), 0.8) } else { (up.clone(), 0.45) };
            let gain = base_gain * (1.0 + 0.1 * rnd());
            let _ = play_tx.try_send(PlayCmd { sample, gain, t: ev.t });
            if !quiet {
                // We print only the slot index, never a character.
                println!(
                    "[key] slot={:#06x} {} hook->engine {:.2}ms",
                    idx,
                    if ev.is_down { "down" } else { "up  " },
                    ev.t.elapsed().as_secs_f64() * 1000.0
                );
            }
        }
    });

    // ---- hook thread (owns the message loop) ----
    hook::spawn(key_tx);

    println!("[hook] installed. type anywhere. Ctrl+C to quit.");
    let start = Instant::now();
    let mut last_report = 0usize;
    loop {
        std::thread::sleep(Duration::from_millis(250));
        let n = stats().lock().unwrap().len();
        if n >= last_report + 20 {
            last_report = n;
            print_stats(buffer_ms);
        }
        if let Some(s) = args.seconds {
            if start.elapsed() >= Duration::from_secs(s) {
                print_stats(buffer_ms);
                stop.store(true, std::sync::atomic::Ordering::Relaxed);
                break;
            }
        }
    }
}
