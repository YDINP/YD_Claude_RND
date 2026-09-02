//! Headless keyclack: global hook → engine → WASAPI. Also the latency bench.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crossbeam_channel::bounded;
use keyclack_core::{Engine, EngineConfig, KeyEvent, Mixer, Pack, PlayCmd};

struct Args {
    pack: Option<PathBuf>,
    device: Option<String>,
    list_devices: bool,
    seconds: Option<u64>,
    quiet: bool,
    volume: f32,
    no_up: bool,
    allow_injected: bool,
    allow_repeat: bool,
}

fn parse_args() -> Args {
    let mut a = Args {
        pack: None,
        device: None,
        list_devices: false,
        seconds: None,
        quiet: false,
        volume: 1.0,
        no_up: false,
        allow_injected: false,
        allow_repeat: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(k) = it.next() {
        match k.as_str() {
            "--pack" => a.pack = it.next().map(PathBuf::from),
            "--device" => a.device = it.next(),
            "--list-devices" => a.list_devices = true,
            "--seconds" => a.seconds = it.next().and_then(|s| s.parse().ok()),
            "--volume" => a.volume = it.next().and_then(|s| s.parse().ok()).unwrap_or(1.0),
            "--quiet" => a.quiet = true,
            "--no-up" => a.no_up = true,
            "--allow-injected" => a.allow_injected = true,
            "--allow-repeat" => a.allow_repeat = true,
            "-h" | "--help" => {
                eprintln!(
                    "keyclack\n  --pack <dir>       Mechvibes-format pack directory (default: built-in synthetic click)\n  --device <substr>  output device whose name contains <substr> (default: system default)\n  --list-devices     print output devices and exit\n  --volume <0..1>    master volume (default 1.0)\n  --no-up            do not play key-release sounds\n  --allow-injected   also play for injected (SendInput) events\n  --allow-repeat     play auto-repeat keydowns\n  --seconds <n>      exit after n seconds and print latency stats\n  --quiet            no per-key lines"
                );
                std::process::exit(0);
            }
            other => eprintln!("[args] ignoring {other:?}"),
        }
    }
    a
}

fn print_stats(stats: &Mutex<Vec<f64>>, period_ms: f64) {
    let mut v = stats.lock().unwrap().clone();
    if v.is_empty() {
        println!("[stats] no key events captured");
        return;
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pct = |p: f64| v[((v.len() as f64 - 1.0) * p).round() as usize];
    println!(
        "[stats] n={} hook->audio: p50={:.2}ms p90={:.2}ms p99={:.2}ms max={:.2}ms | +period {:.2}ms => est. p50 output {:.2}ms",
        v.len(),
        pct(0.5),
        pct(0.9),
        pct(0.99),
        v[v.len() - 1],
        period_ms,
        pct(0.5) + period_ms
    );
}

fn main() {
    let args = parse_args();
    if args.list_devices {
        for d in keyclack_audio_win::list_devices() {
            println!("{d}");
        }
        return;
    }

    let (key_tx, key_rx) = bounded::<KeyEvent>(256);
    let (play_tx, play_rx) = bounded::<PlayCmd>(256);
    let stats = Arc::new(Mutex::new(Vec::<f64>::new()));
    let stop = Arc::new(AtomicBool::new(false));

    // ---- audio ----
    let info = {
        let rx = play_rx.clone();
        let st = stats.clone();
        match keyclack_audio_win::start(args.device.clone(), move |ch, rate| Mixer::new(rx, ch, rate, Some(st)), stop.clone()) {
            Ok(i) => i,
            Err(e) => {
                eprintln!("[audio] failed to open output: {e}");
                std::process::exit(1);
            }
        }
    };
    let period_ms = info.period_frames as f64 * 1000.0 / info.sample_rate as f64;
    println!(
        "[audio] device={:?} rate={} ch={} period={:.2}ms",
        info.name, info.sample_rate, info.channels, period_ms
    );

    // ---- pack ----
    let t0 = Instant::now();
    let pack = match &args.pack {
        Some(dir) => match Pack::load(dir, info.sample_rate) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[pack] {e}");
                std::process::exit(1);
            }
        },
        None => Pack::synthetic(info.sample_rate),
    };
    println!(
        "[pack] {:?} keys={} up_sounds={} loaded in {:.0}ms",
        pack.name,
        pack.mapped_key_count(),
        pack.has_up_sounds(),
        t0.elapsed().as_secs_f64() * 1000.0
    );
    let cfg = EngineConfig {
        allow_repeat: args.allow_repeat,
        allow_injected: args.allow_injected,
        play_up: !args.no_up,
        volume: args.volume,
        up_gain: if args.pack.is_none() { 0.6 } else { 1.0 },
        ..Default::default()
    };
    let mut engine = Engine::new(Arc::new(pack), cfg);

    // ---- engine thread ----
    let quiet = args.quiet;
    std::thread::Builder::new()
        .name("keyclack-engine".into())
        .spawn(move || {
            for ev in key_rx.iter() {
                let hook_to_engine = ev.t.elapsed();
                if let Some(cmd) = engine.on_key(ev) {
                    let _ = play_tx.try_send(cmd);
                    if !quiet {
                        // Slot index only, never a character.
                        println!(
                            "[key] {} sc={:#04x}{} hook->engine {:.2}ms",
                            if ev.is_down { "down" } else { "up  " },
                            ev.scancode,
                            if ev.extended { " ext" } else { "" },
                            hook_to_engine.as_secs_f64() * 1000.0
                        );
                    }
                }
            }
        })
        .expect("spawn engine thread");

    // ---- hook ----
    keyclack_input_win::spawn(key_tx);
    println!("[hook] installed. type anywhere. Ctrl+C to quit.");

    let start = Instant::now();
    let mut last_report = 0usize;
    loop {
        std::thread::sleep(Duration::from_millis(250));
        let n = stats.lock().unwrap().len();
        if n >= last_report + 20 {
            last_report = n;
            print_stats(&stats, period_ms);
        }
        if let Some(s) = args.seconds {
            if start.elapsed() >= Duration::from_secs(s) {
                print_stats(&stats, period_ms);
                stop.store(true, Ordering::Relaxed);
                std::thread::sleep(Duration::from_millis(100));
                break;
            }
        }
    }
}
