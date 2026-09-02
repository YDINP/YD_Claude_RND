//! Mechvibes-compatible sound packs.
//!
//! Two layouts:
//!
//! ```jsonc
//! // "single": one sprite file, each key = [start_ms, duration_ms]
//! { "name": "...", "key_define_type": "single", "sound": "sound.ogg",
//!   "defines": { "1": [0, 120], "28": [130, 160], "28-up": [300, 90] } }
//!
//! // "multi" (v2): one file per key, generic fallbacks with {a-b} variant ranges
//! { "name": "...", "key_define_type": "multi", "version": 2,
//!   "sound": "GENERIC_R{0-4}.mp3", "soundup": "release/GENERIC.mp3",
//!   "defines": { "28": "ENTER.mp3", "28-up": "release/ENTER.mp3" } }
//! ```
//!
//! Keys are libuiohook keycodes (see [`crate::keycode`]). A `-up` suffix marks a
//! key-release sound.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Deserialize;

use crate::decode::{decode_file, resample_linear};
use crate::keycode::is_letter_row;
use crate::Sample;

#[derive(Debug, Clone, PartialEq)]
pub enum Define {
    /// Slice of the sprite file: start and duration in milliseconds.
    Sprite { start_ms: f64, dur_ms: f64 },
    /// Path relative to the pack directory.
    File(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DefineType {
    Single,
    Multi,
}

#[derive(Debug, Clone)]
pub struct PackConfig {
    pub id: String,
    pub name: String,
    pub define_type: DefineType,
    pub sound: Option<String>,
    pub soundup: Option<String>,
    pub includes_numpad: bool,
    pub version: u32,
    /// keycode → down define
    pub down: HashMap<u32, Define>,
    /// keycode → up define
    pub up: HashMap<u32, Define>,
}

#[derive(Deserialize)]
struct RawConfig {
    id: Option<String>,
    name: Option<String>,
    key_define_type: String,
    sound: Option<String>,
    soundup: Option<String>,
    includes_numpad: Option<bool>,
    version: Option<u32>,
    #[serde(default)]
    defines: HashMap<String, serde_json::Value>,
}

impl PackConfig {
    pub fn parse(json: &str) -> Result<PackConfig, String> {
        let raw: RawConfig = serde_json::from_str(json).map_err(|e| format!("config.json: {e}"))?;
        let define_type = match raw.key_define_type.as_str() {
            "single" => DefineType::Single,
            "multi" => DefineType::Multi,
            other => return Err(format!("unknown key_define_type {other:?}")),
        };
        let mut down = HashMap::new();
        let mut up = HashMap::new();
        for (k, v) in raw.defines {
            let (code_str, is_up) = match k.strip_suffix("-up") {
                Some(c) => (c, true),
                None => (k.as_str(), false),
            };
            let code: u32 = match code_str.parse() {
                Ok(c) => c,
                Err(_) => continue, // unknown key name; ignore
            };
            let def = match &v {
                serde_json::Value::Array(a) if a.len() == 2 => {
                    let start_ms = a[0].as_f64().unwrap_or(0.0);
                    let dur_ms = a[1].as_f64().unwrap_or(0.0);
                    Define::Sprite { start_ms, dur_ms }
                }
                serde_json::Value::String(s) => Define::File(s.clone()),
                serde_json::Value::Null => continue,
                _ => continue,
            };
            if is_up { up.insert(code, def) } else { down.insert(code, def) };
        }
        Ok(PackConfig {
            id: raw.id.unwrap_or_default(),
            name: raw.name.unwrap_or_else(|| "unnamed".into()),
            define_type,
            sound: raw.sound,
            soundup: raw.soundup,
            includes_numpad: raw.includes_numpad.unwrap_or(false),
            version: raw.version.unwrap_or(1),
            down,
            up,
        })
    }
}

/// Expand `GENERIC_R{0-4}.mp3` → `GENERIC_R0.mp3 … GENERIC_R4.mp3`. Names without a
/// range come back as a single entry.
pub fn expand_pattern(name: &str) -> Vec<String> {
    if let (Some(o), Some(c)) = (name.find('{'), name.find('}')) {
        if o < c {
            let inner = &name[o + 1..c];
            if let Some((a, b)) = inner.split_once('-') {
                if let (Ok(a), Ok(b)) = (a.trim().parse::<u32>(), b.trim().parse::<u32>()) {
                    if a <= b {
                        return (a..=b)
                            .map(|i| format!("{}{}{}", &name[..o], i, &name[c + 1..]))
                            .collect();
                    }
                }
            }
        }
    }
    vec![name.to_string()]
}

/// A loaded pack: every sample decoded and resampled to the output rate.
pub struct Pack {
    pub id: String,
    pub name: String,
    pub sample_rate: u32,
    down: HashMap<u32, Vec<Arc<Sample>>>,
    up: HashMap<u32, Vec<Arc<Sample>>>,
    generic_down: Vec<Arc<Sample>>,
    generic_up: Vec<Arc<Sample>>,
}

struct Loader {
    dir: PathBuf,
    out_rate: u32,
    files: HashMap<String, Arc<Vec<f32>>>, // decoded + resampled, keyed by relative path
}

impl Loader {
    fn file(&mut self, rel: &str) -> Result<Arc<Vec<f32>>, String> {
        if let Some(f) = self.files.get(rel) {
            return Ok(f.clone());
        }
        let path = self.dir.join(rel);
        let (mono, rate) = decode_file(&path)?;
        let pcm = Arc::new(resample_linear(&mono, rate, self.out_rate));
        self.files.insert(rel.to_string(), pcm.clone());
        Ok(pcm)
    }

    fn sample(&mut self, def: &Define, sprite: Option<&str>) -> Result<Option<Arc<Sample>>, String> {
        match def {
            Define::File(rel) => Ok(Some(Arc::new(Sample { data: self.file(rel)?.to_vec() }))),
            Define::Sprite { start_ms, dur_ms } => {
                let Some(sprite) = sprite else {
                    return Err("sprite define without a sprite file".into());
                };
                let pcm = self.file(sprite)?;
                let rate = self.out_rate as f64;
                let start = ((start_ms / 1000.0) * rate) as usize;
                let end = (((start_ms + dur_ms) / 1000.0) * rate) as usize;
                if start >= pcm.len() || end <= start {
                    return Ok(None);
                }
                let end = end.min(pcm.len());
                Ok(Some(Arc::new(Sample { data: pcm[start..end].to_vec() })))
            }
        }
    }

    fn pattern(&mut self, pattern: &str) -> Vec<Arc<Sample>> {
        expand_pattern(pattern)
            .iter()
            .filter_map(|n| self.file(n).ok())
            .map(|pcm| Arc::new(Sample { data: pcm.to_vec() }))
            .collect()
    }
}

impl Pack {
    /// Load `dir/config.json` and every referenced sound.
    pub fn load(dir: &Path, out_rate: u32) -> Result<Pack, String> {
        let json = std::fs::read_to_string(dir.join("config.json"))
            .map_err(|e| format!("{}: {e}", dir.join("config.json").display()))?;
        let cfg = PackConfig::parse(&json)?;
        Self::from_config(dir, out_rate, &cfg)
    }

    pub fn from_config(dir: &Path, out_rate: u32, cfg: &PackConfig) -> Result<Pack, String> {
        let mut ld = Loader { dir: dir.to_path_buf(), out_rate, files: HashMap::new() };
        let sprite = if cfg.define_type == DefineType::Single { cfg.sound.as_deref() } else { None };

        let mut down: HashMap<u32, Vec<Arc<Sample>>> = HashMap::new();
        let mut up: HashMap<u32, Vec<Arc<Sample>>> = HashMap::new();
        for (code, def) in &cfg.down {
            if let Some(s) = ld.sample(def, sprite)? {
                down.insert(*code, vec![s]);
            }
        }
        for (code, def) in &cfg.up {
            if let Some(s) = ld.sample(def, sprite)? {
                up.insert(*code, vec![s]);
            }
        }

        let (mut generic_down, mut generic_up) = (Vec::new(), Vec::new());
        if cfg.define_type == DefineType::Multi {
            if let Some(p) = &cfg.sound {
                generic_down = ld.pattern(p);
            }
            if let Some(p) = &cfg.soundup {
                generic_up = ld.pattern(p);
            }
        }
        if generic_down.is_empty() {
            // Sprite packs have no generic: borrow the letter-row sounds so unmapped keys
            // still click. Fall back to everything if the pack has no letters.
            let mut letters: Vec<_> = down.iter().filter(|(c, _)| is_letter_row(**c)).map(|(_, v)| v[0].clone()).collect();
            if letters.is_empty() {
                letters = down.values().map(|v| v[0].clone()).collect();
            }
            generic_down = letters;
        }
        if down.is_empty() && generic_down.is_empty() {
            return Err("pack defines no sounds".into());
        }
        Ok(Pack {
            id: cfg.id.clone(),
            name: cfg.name.clone(),
            sample_rate: out_rate,
            down,
            up,
            generic_down,
            generic_up,
        })
    }

    /// Built-in synthetic click, used when no pack is configured.
    pub fn synthetic(out_rate: u32) -> Pack {
        Pack {
            id: "synthetic".into(),
            name: "Synthetic click".into(),
            sample_rate: out_rate,
            down: HashMap::new(),
            up: HashMap::new(),
            generic_down: vec![Arc::new(Sample { data: crate::synth::click_down(out_rate) })],
            generic_up: vec![Arc::new(Sample { data: crate::synth::click_up(out_rate) })],
        }
    }

    /// Candidate samples for pressing `code` (never empty for a loaded pack).
    pub fn down(&self, code: u32) -> &[Arc<Sample>] {
        self.down.get(&code).map(|v| v.as_slice()).unwrap_or(&self.generic_down)
    }

    /// Candidate samples for releasing `code` (may be empty).
    pub fn up(&self, code: u32) -> &[Arc<Sample>] {
        self.up.get(&code).map(|v| v.as_slice()).unwrap_or(&self.generic_up)
    }

    pub fn has_up_sounds(&self) -> bool {
        !self.generic_up.is_empty() || !self.up.is_empty()
    }

    pub fn mapped_key_count(&self) -> usize {
        self.down.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_single_sprite_config() {
        let cfg = PackConfig::parse(
            r#"{"id":"x","name":"Blue","key_define_type":"single","includes_numpad":false,
                "sound":"sound.ogg","defines":{"1":[1754,184],"28":[10,20],"28-up":[100,50],"57416":[5,5],"bogus":[1,2]}}"#,
        )
        .unwrap();
        assert_eq!(cfg.define_type, DefineType::Single);
        assert_eq!(cfg.version, 1);
        assert_eq!(cfg.down[&1], Define::Sprite { start_ms: 1754.0, dur_ms: 184.0 });
        assert_eq!(cfg.down[&57416], Define::Sprite { start_ms: 5.0, dur_ms: 5.0 });
        assert_eq!(cfg.up[&28], Define::Sprite { start_ms: 100.0, dur_ms: 50.0 });
        assert_eq!(cfg.down.len(), 3);
    }

    #[test]
    fn parses_multi_v2_config() {
        let cfg = PackConfig::parse(
            r#"{"id":"p","name":"pandas","key_define_type":"multi","sound":"GENERIC_R{0-4}.mp3",
                "soundup":"release/GENERIC.mp3","defines":{"14":"BACKSPACE.mp3","14-up":"release/BACKSPACE.mp3"},"version":2}"#,
        )
        .unwrap();
        assert_eq!(cfg.define_type, DefineType::Multi);
        assert_eq!(cfg.version, 2);
        assert_eq!(cfg.down[&14], Define::File("BACKSPACE.mp3".into()));
        assert_eq!(cfg.up[&14], Define::File("release/BACKSPACE.mp3".into()));
        assert_eq!(cfg.sound.as_deref(), Some("GENERIC_R{0-4}.mp3"));
    }

    #[test]
    fn rejects_unknown_define_type() {
        assert!(PackConfig::parse(r#"{"name":"x","key_define_type":"triple"}"#).is_err());
    }

    #[test]
    fn expands_variant_ranges() {
        assert_eq!(
            expand_pattern("GENERIC_R{0-4}.mp3"),
            vec!["GENERIC_R0.mp3", "GENERIC_R1.mp3", "GENERIC_R2.mp3", "GENERIC_R3.mp3", "GENERIC_R4.mp3"]
        );
        assert_eq!(expand_pattern("plain.ogg"), vec!["plain.ogg"]);
        assert_eq!(expand_pattern("bad{4-0}.ogg"), vec!["bad{4-0}.ogg"]);
    }

    fn write_wav(path: &Path, rate: u32, secs: f32, f: impl Fn(usize) -> f32) {
        let spec = hound::WavSpec { channels: 1, sample_rate: rate, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
        let mut w = hound::WavWriter::create(path, spec).unwrap();
        for i in 0..(rate as f32 * secs) as usize {
            w.write_sample((f(i) * 32000.0) as i16).unwrap();
        }
        w.finalize().unwrap();
    }

    #[test]
    fn loads_sprite_pack_and_slices_by_ms() {
        let dir = std::env::temp_dir().join("keyclack-pack-single");
        std::fs::create_dir_all(&dir).unwrap();
        // 1 s file at 44.1k: silence except a burst from 500 ms to 600 ms.
        write_wav(&dir.join("sound.wav"), 44100, 1.0, |i| if (22050..26460).contains(&i) { 0.5 } else { 0.0 });
        std::fs::write(
            dir.join("config.json"),
            r#"{"name":"t","key_define_type":"single","sound":"sound.wav",
                "defines":{"30":[500,100],"28":[0,100],"57":[5000,10]}}"#,
        )
        .unwrap();
        let pack = Pack::load(&dir, 48000).unwrap();
        // 100 ms at 48k = 4800 frames, loud
        let a = pack.down(30);
        assert_eq!(a.len(), 1);
        assert!((a[0].data.len() as i64 - 4800).abs() <= 2);
        assert!(a[0].data.iter().all(|v| *v > 0.4));
        // Enter slice is silent
        assert!(pack.down(28)[0].data.iter().all(|v| v.abs() < 1e-3));
        // Out-of-range define is dropped, so Space falls back to the generic (letter row = key 30)
        assert_eq!(pack.mapped_key_count(), 2);
        assert!(pack.down(57)[0].data.iter().all(|v| *v > 0.4));
        assert!(!pack.has_up_sounds());
    }

    #[test]
    fn loads_multi_pack_with_patterns_and_up_sounds() {
        let dir = std::env::temp_dir().join("keyclack-pack-multi");
        std::fs::create_dir_all(dir.join("release")).unwrap();
        for i in 0..3 {
            write_wav(&dir.join(format!("G{i}.wav")), 48000, 0.05, |_| 0.1 * (i + 1) as f32);
        }
        write_wav(&dir.join("ENTER.wav"), 48000, 0.05, |_| 0.9);
        write_wav(&dir.join("release/G.wav"), 48000, 0.02, |_| 0.2);
        std::fs::write(
            dir.join("config.json"),
            r#"{"name":"m","key_define_type":"multi","version":2,"sound":"G{0-2}.wav",
                "soundup":"release/G.wav","defines":{"28":"ENTER.wav"}}"#,
        )
        .unwrap();
        let pack = Pack::load(&dir, 48000).unwrap();
        assert_eq!(pack.down(28).len(), 1);
        assert!(pack.down(28)[0].data[10] > 0.8);
        assert_eq!(pack.down(30).len(), 3, "generic has 3 variants");
        assert!(pack.has_up_sounds());
        assert_eq!(pack.up(28).len(), 1);
        assert_eq!(pack.up(30).len(), 1);
    }

    #[test]
    fn missing_file_is_an_error() {
        let dir = std::env::temp_dir().join("keyclack-pack-missing");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("config.json"), r#"{"name":"m","key_define_type":"multi","defines":{"28":"nope.wav"}}"#).unwrap();
        assert!(Pack::load(&dir, 48000).is_err());
    }

    /// Runs only when the community packs are present (gitignored download).
    #[test]
    fn loads_real_mechvibes_packs_if_present() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/_external");
        if !root.exists() {
            eprintln!("skipping: {} not present", root.display());
            return;
        }
        for name in ["cherrymx-blue-abs", "holy-pandas", "eg-oreo"] {
            let dir = root.join(name);
            if !dir.exists() {
                continue;
            }
            let pack = Pack::load(&dir, 48000).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(!pack.down(28).is_empty(), "{name}: Enter has a sound");
            assert!(!pack.down(30).is_empty(), "{name}: A has a sound");
            assert!(pack.down(30)[0].data.len() > 480, "{name}: sample longer than 10 ms");
        }
    }
}
