//! Persisted settings.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuleAction {
    /// No sound while this app is in front.
    Mute,
    /// Use a different pack (directory name under `packs_dir`).
    Pack { id: String },
    /// Scale volume (0.0 – 1.0) while this app is in front.
    Volume { value: f32 },
}

/// Per-application rule. `exe` is matched case-insensitively against the foreground
/// process file name (e.g. `code.exe`); a value without `.exe` is a substring match.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AppRule {
    pub exe: String,
    pub action: RuleAction,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// Directory name under `packs_dir`, or `None` for the built-in synthetic click.
    pub pack: Option<String>,
    /// Where packs live. Empty = `%APPDATA%/keyclack/packs`.
    pub packs_dir: String,
    pub volume: f32,
    pub play_up: bool,
    pub allow_repeat: bool,
    /// Substring of the output device name; `None` = system default.
    pub device: Option<String>,
    /// WASAPI exclusive mode (lower latency, blocks other apps' audio).
    pub exclusive: bool,
    /// Global shortcut in Tauri syntax, e.g. `Ctrl+Shift+M`. Empty = none.
    pub mute_hotkey: String,
    pub autostart: bool,
    /// Mute automatically while any app is capturing the microphone.
    pub meeting_auto_mute: bool,
    /// Apps whose microphone use does not count as a meeting (e.g. `discord.exe`
    /// when you sit in a voice channel all day). Same matching as rules.
    pub meeting_ignore: Vec<String>,
    pub rules: Vec<AppRule>,
    /// Favourite pack ids, shown first in lists and in the tray menu.
    pub favorites: Vec<String>,
    /// Show the settings window on launch (false after first run).
    pub show_window_on_start: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            pack: None,
            packs_dir: String::new(),
            volume: 0.8,
            play_up: true,
            allow_repeat: false,
            device: None,
            exclusive: false,
            mute_hotkey: "Ctrl+Shift+M".into(),
            autostart: false,
            meeting_auto_mute: true,
            meeting_ignore: vec![],
            rules: vec![],
            favorites: vec![],
            show_window_on_start: true,
        }
    }
}

/// `%APPDATA%/keyclack` (falls back to the current directory if APPDATA is unset).
pub fn data_dir() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(|a| PathBuf::from(a).join("keyclack"))
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn config_path() -> PathBuf {
    data_dir().join("config.json")
}

impl AppConfig {
    pub fn packs_dir(&self) -> PathBuf {
        if self.packs_dir.is_empty() {
            data_dir().join("packs")
        } else {
            PathBuf::from(&self.packs_dir)
        }
    }

    pub fn load_from(path: &Path) -> AppConfig {
        match std::fs::read_to_string(path) {
            // Notepad/PowerShell write a UTF-8 BOM, which serde_json rejects.
            Ok(s) => serde_json::from_str(s.trim_start_matches('\u{feff}')).unwrap_or_else(|e| {
                eprintln!("[config] {}: {e}; using defaults", path.display());
                AppConfig::default()
            }),
            Err(_) => AppConfig::default(),
        }
    }

    pub fn load() -> AppConfig {
        Self::load_from(&config_path())
    }

    pub fn save_to(&self, path: &Path) -> Result<(), String> {
        if let Some(p) = path.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let s = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, s).map_err(|e| e.to_string())
    }

    pub fn save(&self) -> Result<(), String> {
        self.save_to(&config_path())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let dir = std::env::temp_dir().join("keyclack-config-test");
        let path = dir.join("config.json");
        let mut c = AppConfig::default();
        c.pack = Some("holy-pandas".into());
        c.rules.push(AppRule { exe: "zoom.exe".into(), action: RuleAction::Mute, enabled: true });
        c.rules.push(AppRule { exe: "code".into(), action: RuleAction::Pack { id: "x".into() }, enabled: false });
        c.save_to(&path).unwrap();
        let back = AppConfig::load_from(&path);
        assert_eq!(back, c);
    }

    #[test]
    fn missing_or_partial_file_gives_defaults() {
        let dir = std::env::temp_dir().join("keyclack-config-test2");
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(AppConfig::load_from(&dir.join("nope.json")), AppConfig::default());
        let p = dir.join("partial.json");
        std::fs::write(&p, r#"{"volume": 0.3}"#).unwrap();
        let c = AppConfig::load_from(&p);
        assert_eq!(c.volume, 0.3);
        assert!(c.play_up);
        assert_eq!(c.mute_hotkey, "Ctrl+Shift+M");
    }

    #[test]
    fn tolerates_utf8_bom() {
        let dir = std::env::temp_dir().join("keyclack-config-test3");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("bom.json");
        std::fs::write(&p, "\u{feff}{\"volume\": 0.25}").unwrap();
        assert_eq!(AppConfig::load_from(&p).volume, 0.25);
    }

    #[test]
    fn rule_action_json_shape() {
        let r = AppRule { exe: "a.exe".into(), action: RuleAction::Volume { value: 0.5 }, enabled: true };
        let j = serde_json::to_string(&r).unwrap();
        assert!(j.contains(r#""type":"volume""#), "{j}");
        assert!(j.contains(r#""value":0.5"#), "{j}");
    }
}
