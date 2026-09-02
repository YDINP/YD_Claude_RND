//! keyclack-packtool — make sound packs.
//!
//! ```text
//! keyclack-packtool synth <out_dir>                     # write the built-in procedural packs
//! keyclack-packtool slice <recording> <out_dir> [opts]  # split a recording into GENERIC_R{n}.wav
//!     --name <prefix>   file prefix (default GENERIC_R)   --sub <dir>  write into <out_dir>/<dir>
//!     --threshold 0.25  --gap-ms 120  --len-ms 160  --max 8
//! keyclack-packtool assemble <pack_dir> --name "<pack name>" [--id <id>]
//!     writes config.json for a pack dir laid out as:
//!       GENERIC_R0..N.wav  release/GENERIC_R0..N.wav  SPACE.wav ENTER.wav BACKSPACE.wav ... (optional)
//! keyclack-packtool check <pack_dir>                     # load through the real engine and report
//! ```

mod dsp;
mod slice;
mod synth_pack;

use std::path::{Path, PathBuf};

fn arg_val(args: &[String], key: &str) -> Option<String> {
    args.iter().position(|a| a == key).and_then(|i| args.get(i + 1).cloned())
}

fn cmd_synth(out: &Path) -> Result<(), String> {
    for m in synth_pack::MODELS {
        let n = synth_pack::generate(m, out)?;
        println!("{}: {} files → {}", m.name, n, out.join(m.id).display());
    }
    Ok(())
}

fn cmd_slice(rec: &Path, out: &Path, args: &[String]) -> Result<(), String> {
    let mut o = slice::SliceOpts::default();
    if let Some(v) = arg_val(args, "--threshold") { o.threshold = v.parse().map_err(|_| "bad --threshold")?; }
    if let Some(v) = arg_val(args, "--gap-ms") { o.min_gap_ms = v.parse().map_err(|_| "bad --gap-ms")?; }
    if let Some(v) = arg_val(args, "--len-ms") { o.len_ms = v.parse().map_err(|_| "bad --len-ms")?; }
    if let Some(v) = arg_val(args, "--max") { o.max_slices = v.parse().map_err(|_| "bad --max")?; }
    let name = arg_val(args, "--name").unwrap_or_else(|| "GENERIC_R".into());
    let dir = match arg_val(args, "--sub") { Some(s) => out.join(s), None => out.to_path_buf() };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let slices = slice::slice_file(rec, &o)?;
    if slices.is_empty() {
        return Err("no onsets found; lower --threshold or check the recording".into());
    }
    for (i, s) in slices.iter().enumerate() {
        let p = dir.join(format!("{name}{i}.wav"));
        slice::write_wav(&p, s)?;
        println!("{} ({:.0} ms)", p.display(), s.pcm.len() as f32 * 1000.0 / s.rate as f32);
    }
    Ok(())
}

fn count_variants(dir: &Path, prefix: &str) -> u32 {
    (0..64u32).take_while(|i| dir.join(format!("{prefix}{i}.wav")).exists()).count() as u32
}

fn cmd_assemble(dir: &Path, args: &[String]) -> Result<(), String> {
    let name = arg_val(args, "--name").ok_or("--name required")?;
    let id = arg_val(args, "--id").unwrap_or_else(|| dir.file_name().unwrap().to_string_lossy().to_string());
    let n = count_variants(dir, "GENERIC_R");
    if n == 0 {
        return Err("no GENERIC_R0.wav in pack dir".into());
    }
    let n_up = count_variants(&dir.join("release"), "GENERIC_R");
    let specials: &[(&[u32], &str)] = &[
        (&[57], "SPACE"),
        (&[28, 3612], "ENTER"),
        (&[14], "BACKSPACE"),
        (&[15], "TAB"),
        (&[58], "CAPS"),
        (&[42, 54], "SHIFT"),
        (&[29, 3613], "CTRL"),
        (&[56, 3640], "ALT"),
        (&[3675, 3676], "WIN"),
    ];
    let mut defines = serde_json::Map::new();
    for (codes, file) in specials {
        let f = format!("{file}.wav");
        let up = format!("release/{file}.wav");
        for c in *codes {
            if dir.join(&f).exists() {
                defines.insert(c.to_string(), serde_json::Value::String(f.clone()));
            }
            if dir.join(&up).exists() {
                defines.insert(format!("{c}-up"), serde_json::Value::String(up.clone()));
            }
        }
    }
    let mut cfg = serde_json::json!({
        "id": id,
        "name": name,
        "key_define_type": "multi",
        "version": 2,
        "includes_numpad": true,
        "sound": format!("GENERIC_R{{0-{}}}.wav", n - 1),
        "defines": defines,
        "generator": "keyclack-packtool assemble",
    });
    if n_up > 0 {
        cfg["soundup"] = serde_json::Value::String(format!("release/GENERIC_R{{0-{}}}.wav", n_up - 1));
    }
    std::fs::write(dir.join("config.json"), serde_json::to_string_pretty(&cfg).unwrap()).map_err(|e| e.to_string())?;
    println!("wrote {} ({} down variants, {} up variants, {} key overrides)", dir.join("config.json").display(), n, n_up, defines.len());
    Ok(())
}

fn cmd_check(dir: &Path) -> Result<(), String> {
    let t = std::time::Instant::now();
    let pack = keyclack_core::Pack::load(dir, 48000)?;
    let ms = |code: u32| pack.down(code).iter().map(|s| s.data.len() as f32 * 1000.0 / 48000.0).fold(0.0, f32::max);
    println!(
        "{:?}: keys={} up={} load={:.0}ms | generic variants={} ({:.0} ms) space={:.0} ms enter={:.0} ms",
        pack.name,
        pack.mapped_key_count(),
        pack.has_up_sounds(),
        t.elapsed().as_secs_f64() * 1000.0,
        pack.down(30).len(),
        ms(30),
        ms(57),
        ms(28)
    );
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let r = match args.first().map(|s| s.as_str()) {
        Some("synth") => cmd_synth(&PathBuf::from(args.get(1).cloned().unwrap_or_else(|| "packs/builtin".into()))),
        Some("slice") if args.len() >= 3 => cmd_slice(Path::new(&args[1]), Path::new(&args[2]), &args[3..]),
        Some("assemble") if args.len() >= 2 => cmd_assemble(Path::new(&args[1]), &args[2..]),
        Some("check") if args.len() >= 2 => cmd_check(Path::new(&args[1])),
        _ => {
            eprintln!("usage: keyclack-packtool synth <out_dir> | slice <rec> <out_dir> [--name P --sub D --threshold T --gap-ms G --len-ms L --max N] | assemble <pack_dir> --name N [--id I] | check <pack_dir>");
            std::process::exit(2);
        }
    };
    if let Err(e) = r {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}
