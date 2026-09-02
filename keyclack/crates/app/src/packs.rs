//! Scan a directory for Mechvibes packs (config only, no audio decoding).

use std::path::{Path, PathBuf};

use keyclack_core::pack::{DefineType, PackConfig};
use serde::Serialize;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct PackInfo {
    /// Directory name; what `AppConfig.pack` and rules refer to.
    pub id: String,
    pub name: String,
    pub dir: PathBuf,
    pub define_type: String,
    pub key_count: usize,
    pub has_up: bool,
    pub version: u32,
}

pub fn read_pack_info(dir: &Path) -> Option<PackInfo> {
    let json = std::fs::read_to_string(dir.join("config.json")).ok()?;
    let cfg = PackConfig::parse(&json).ok()?;
    Some(PackInfo {
        id: dir.file_name()?.to_string_lossy().to_string(),
        name: cfg.name.clone(),
        dir: dir.to_path_buf(),
        define_type: match cfg.define_type {
            DefineType::Single => "single".into(),
            DefineType::Multi => "multi".into(),
        },
        key_count: cfg.down.len(),
        has_up: !cfg.up.is_empty() || cfg.soundup.is_some(),
        version: cfg.version,
    })
}

/// Every immediate subdirectory with a parseable `config.json`, sorted by name.
pub fn scan(root: &Path) -> Vec<PackInfo> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(root) else {
        return out;
    };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            if let Some(info) = read_pack_info(&p) {
                out.push(info);
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_valid_packs_only() {
        let root = std::env::temp_dir().join("keyclack-scan-test");
        let _ = std::fs::remove_dir_all(&root);
        for (d, json) in [
            ("b-pack", r#"{"name":"Bravo","key_define_type":"single","sound":"s.ogg","defines":{"1":[0,1],"2":[1,1]}}"#),
            ("a-pack", r#"{"name":"alpha","key_define_type":"multi","version":2,"soundup":"u.mp3","defines":{}}"#),
            ("broken", r#"{"name":"x","key_define_type":"nope"}"#),
        ] {
            std::fs::create_dir_all(root.join(d)).unwrap();
            std::fs::write(root.join(d).join("config.json"), json).unwrap();
        }
        std::fs::create_dir_all(root.join("empty")).unwrap();
        std::fs::write(root.join("file.txt"), "x").unwrap();

        let packs = scan(&root);
        assert_eq!(packs.len(), 2);
        assert_eq!(packs[0].id, "a-pack");
        assert_eq!(packs[0].name, "alpha");
        assert!(packs[0].has_up);
        assert_eq!(packs[0].version, 2);
        assert_eq!(packs[1].id, "b-pack");
        assert_eq!(packs[1].key_count, 2);
        assert!(!packs[1].has_up);
        assert_eq!(packs[1].define_type, "single");
    }

    #[test]
    fn missing_root_is_empty() {
        assert!(scan(Path::new("Z:/definitely/not/here")).is_empty());
    }
}
