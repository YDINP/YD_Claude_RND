//! keyclack-app: the service layer between the pure core and a UI shell.
//!
//! - [`config`]  persisted user settings (`%APPDATA%/keyclack/config.json`)
//! - [`rules`]   pure resolver: (config, foreground app, mic in use, manual mute) → effective state
//! - [`packs`]   scan a directory for Mechvibes packs without decoding audio
//! - [`context`] Windows: foreground process name, microphone-in-use detection
//! - [`service`] owns hook + engine + audio threads; UI talks to it through commands and a status snapshot

pub mod config;
pub mod context;
pub mod packs;
pub mod rules;
pub mod service;

pub use config::{AppConfig, RuleAction, AppRule};
pub use packs::PackInfo;
pub use rules::Effective;
pub use service::{Service, Status};
