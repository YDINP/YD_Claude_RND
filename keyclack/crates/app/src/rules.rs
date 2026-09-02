//! Pure resolver: what should the engine be doing right now?

use crate::config::{AppConfig, RuleAction};

#[derive(Clone, Debug, PartialEq)]
pub struct Effective {
    pub muted: bool,
    /// Pack directory name, or `None` for the built-in click.
    pub pack: Option<String>,
    pub volume: f32,
    /// Human-readable reason for a non-default state, for the status line.
    pub reason: Option<String>,
}

/// Does `rule_exe` match the foreground process file name?
/// `zoom.exe` matches exactly (case-insensitive); `zoom` matches as a substring.
pub fn exe_matches(rule_exe: &str, foreground: &str) -> bool {
    let r = rule_exe.trim().to_lowercase();
    let f = foreground.to_lowercase();
    if r.is_empty() {
        return false;
    }
    if r.ends_with(".exe") {
        f == r
    } else {
        f.contains(&r)
    }
}

pub fn resolve(cfg: &AppConfig, foreground_exe: Option<&str>, mic_app: Option<&str>, manual_mute: bool) -> Effective {
    let mut eff = Effective { muted: false, pack: cfg.pack.clone(), volume: cfg.volume, reason: None };

    if manual_mute {
        eff.muted = true;
        eff.reason = Some("muted".into());
        return eff;
    }
    if cfg.meeting_auto_mute {
        if let Some(app) = mic_app {
            let ignored = cfg.meeting_ignore.iter().any(|i| exe_matches(i, app));
            if !ignored {
                eff.muted = true;
                eff.reason = Some(format!("microphone in use: {app}"));
                return eff;
            }
        }
    }
    if let Some(fg) = foreground_exe {
        // First enabled matching rule wins.
        if let Some(rule) = cfg.rules.iter().find(|r| r.enabled && exe_matches(&r.exe, fg)) {
            match &rule.action {
                RuleAction::Mute => {
                    eff.muted = true;
                    eff.reason = Some(format!("rule: {}", rule.exe));
                }
                RuleAction::Pack { id } => {
                    eff.pack = Some(id.clone());
                    eff.reason = Some(format!("rule: {} → {}", rule.exe, id));
                }
                RuleAction::Volume { value } => {
                    eff.volume = cfg.volume * value.clamp(0.0, 1.0);
                    eff.reason = Some(format!("rule: {} volume {:.0}%", rule.exe, value * 100.0));
                }
            }
        }
    }
    eff
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppRule;

    fn cfg() -> AppConfig {
        AppConfig {
            pack: Some("blue".into()),
            volume: 0.8,
            meeting_auto_mute: true,
            rules: vec![
                AppRule { exe: "zoom.exe".into(), action: RuleAction::Mute, enabled: true },
                AppRule { exe: "code".into(), action: RuleAction::Pack { id: "quiet".into() }, enabled: true },
                AppRule { exe: "game".into(), action: RuleAction::Volume { value: 0.5 }, enabled: true },
                AppRule { exe: "disabled.exe".into(), action: RuleAction::Mute, enabled: false },
            ],
            ..Default::default()
        }
    }

    #[test]
    fn matching_rules() {
        assert!(exe_matches("Zoom.exe", "zoom.exe"));
        assert!(!exe_matches("zoom.exe", "zoomhelper.exe"));
        assert!(exe_matches("zoom", "zoomhelper.exe"));
        assert!(exe_matches("code", "Code.exe"));
        assert!(!exe_matches("", "anything.exe"));
    }

    #[test]
    fn default_state() {
        let e = resolve(&cfg(), Some("explorer.exe"), None, false);
        assert_eq!(e, Effective { muted: false, pack: Some("blue".into()), volume: 0.8, reason: None });
    }

    #[test]
    fn manual_mute_wins_over_everything() {
        let e = resolve(&cfg(), Some("code.exe"), Some("zoom.exe"), true);
        assert!(e.muted);
        assert_eq!(e.reason.as_deref(), Some("muted"));
    }

    #[test]
    fn mic_in_use_mutes_when_enabled() {
        let e = resolve(&cfg(), None, Some("teams.exe"), false);
        assert!(e.muted);
        assert_eq!(e.reason.as_deref(), Some("microphone in use: teams.exe"));
        let mut c = cfg();
        c.meeting_auto_mute = false;
        assert!(!resolve(&c, None, Some("teams.exe"), false).muted);
    }

    #[test]
    fn ignored_mic_apps_do_not_mute() {
        let mut c = cfg();
        c.meeting_ignore = vec!["discord.exe".into()];
        assert!(!resolve(&c, None, Some("discord.exe"), false).muted);
        assert!(resolve(&c, None, Some("zoom.exe"), false).muted);
    }

    #[test]
    fn rules_apply_in_order_and_skip_disabled() {
        assert!(resolve(&cfg(), Some("zoom.exe"), None, false).muted);
        let e = resolve(&cfg(), Some("Code.exe"), None, false);
        assert_eq!(e.pack.as_deref(), Some("quiet"));
        assert!(!e.muted);
        let e = resolve(&cfg(), Some("mygame.exe"), None, false);
        assert!((e.volume - 0.4).abs() < 1e-6);
        assert!(!resolve(&cfg(), Some("disabled.exe"), None, false).muted);
    }

    #[test]
    fn no_foreground_means_no_rule() {
        let e = resolve(&cfg(), None, None, false);
        assert!(e.reason.is_none());
    }
}
