//! KeyClack desktop shell: tray icon, settings window, hotkey, autostart.
//! All sound logic lives in `keyclack-app`; this file only wires it to Tauri.

use std::sync::Mutex;

use keyclack_app::{packs, AppConfig, PackInfo, Service, Status};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent, Wry};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const TRAY_ID: &str = "main";

struct AppState {
    service: Service,
    config: Mutex<AppConfig>,
    mute_item: Mutex<Option<CheckMenuItem<Wry>>>,
}

// ---------- commands ----------

#[tauri::command]
fn get_status(state: State<AppState>) -> Status {
    state.service.status()
}

#[tauri::command]
fn get_config(state: State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn set_config(app: AppHandle, state: State<AppState>, config: AppConfig) -> Result<AppConfig, String> {
    let mut config = config;
    config.volume = config.volume.clamp(0.0, 1.0);
    let prev = state.config.lock().unwrap().clone();
    config.save()?;
    *state.config.lock().unwrap() = config.clone();
    state.service.apply_config(config.clone());
    if prev.mute_hotkey != config.mute_hotkey {
        apply_hotkey(&app, &config.mute_hotkey);
    }
    if prev.autostart != config.autostart {
        apply_autostart(&app, config.autostart);
    }
    if prev.pack != config.pack || prev.packs_dir != config.packs_dir {
        rebuild_tray_menu(&app);
    }
    Ok(config)
}

#[tauri::command]
fn list_packs(state: State<AppState>) -> Vec<PackInfo> {
    let dir = state.config.lock().unwrap().packs_dir();
    packs::scan(&dir)
}

#[tauri::command]
fn list_devices() -> Vec<String> {
    keyclack_audio_win_devices()
}

fn keyclack_audio_win_devices() -> Vec<String> {
    // Routed through keyclack-app's dependency so the shell has no direct audio deps.
    keyclack_app::service::list_devices()
}

#[tauri::command]
fn toggle_mute(state: State<AppState>) -> bool {
    state.service.toggle_mute()
}

#[tauri::command]
fn set_mute(state: State<AppState>, muted: bool) {
    state.service.set_manual_mute(muted);
}

#[tauri::command]
fn open_packs_dir(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let dir = state.config.lock().unwrap().packs_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(dir.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())?;
    let _ = app;
    Ok(())
}

#[tauri::command]
fn show_window(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.state::<AppState>().service.shutdown();
    app.exit(0);
}

// ---------- helpers ----------

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn apply_hotkey(app: &AppHandle, hotkey: &str) {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let hk = hotkey.trim();
    if hk.is_empty() {
        return;
    }
    if let Err(e) = gs.register(hk) {
        eprintln!("[hotkey] cannot register {hk:?}: {e}");
    }
}

fn apply_autostart(app: &AppHandle, enabled: bool) {
    let al = app.autolaunch();
    let r = if enabled { al.enable() } else { al.disable() };
    if let Err(e) = r {
        eprintln!("[autostart] {e}");
    }
}

fn rebuild_tray_menu(app: &AppHandle) {
    let state = app.state::<AppState>();
    let cfg = state.config.lock().unwrap().clone();
    let status = state.service.status();
    let Ok(mute) = CheckMenuItem::with_id(app, "mute", "음소거 (Mute)", true, status.manual_mute, None::<&str>) else {
        return;
    };
    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<Wry>>> = vec![Box::new(mute.clone())];
    if let Ok(sep) = PredefinedMenuItem::separator(app) {
        items.push(Box::new(sep));
    }
    if let Ok(i) = CheckMenuItem::with_id(app, "pack:", "내장 합성음", true, cfg.pack.is_none(), None::<&str>) {
        items.push(Box::new(i));
    }
    for p in packs::scan(&cfg.packs_dir()) {
        let checked = cfg.pack.as_deref() == Some(p.id.as_str());
        if let Ok(i) = CheckMenuItem::with_id(app, format!("pack:{}", p.id), &p.name, true, checked, None::<&str>) {
            items.push(Box::new(i));
        }
    }
    if let Ok(sep) = PredefinedMenuItem::separator(app) {
        items.push(Box::new(sep));
    }
    if let Ok(i) = MenuItem::with_id(app, "open", "설정 열기 (Settings)", true, None::<&str>) {
        items.push(Box::new(i));
    }
    if let Ok(i) = MenuItem::with_id(app, "quit", "종료 (Quit)", true, None::<&str>) {
        items.push(Box::new(i));
    }
    let refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = items.iter().map(|b| b.as_ref()).collect();
    if let Ok(menu) = Menu::with_items(app, &refs) {
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            let _ = tray.set_menu(Some(menu));
        }
    }
    *state.mute_item.lock().unwrap() = Some(mute);
}

fn on_menu(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    match id {
        "mute" => {
            state.service.toggle_mute();
        }
        "open" => show_main(app),
        "quit" => {
            state.service.shutdown();
            app.exit(0);
        }
        other => {
            if let Some(pack) = other.strip_prefix("pack:") {
                let mut cfg = state.config.lock().unwrap().clone();
                cfg.pack = if pack.is_empty() { None } else { Some(pack.to_string()) };
                let _ = cfg.save();
                *state.config.lock().unwrap() = cfg.clone();
                state.service.apply_config(cfg);
                rebuild_tray_menu(app);
            }
        }
    }
}

// ---------- entry ----------

pub fn run() {
    let cfg = AppConfig::load();
    let _ = std::fs::create_dir_all(cfg.packs_dir());
    let minimized = std::env::args().any(|a| a == "--minimized");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        app.state::<AppState>().service.toggle_mute();
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_config,
            set_config,
            list_packs,
            list_devices,
            toggle_mute,
            set_mute,
            open_packs_dir,
            show_window,
            hide_window,
            quit
        ])
        .setup(move |app| {
            let service = Service::start(cfg.clone());
            {
                let handle = app.handle().clone();
                service.set_on_change(move |s: &Status| {
                    let _ = handle.emit("status", s.clone());
                    if let Some(state) = handle.try_state::<AppState>() {
                        if let Some(item) = state.mute_item.lock().unwrap().as_ref() {
                            let _ = item.set_checked(s.manual_mute);
                        }
                    }
                    if let Some(tray) = handle.tray_by_id(TRAY_ID) {
                        let tip = if s.effective_muted {
                            format!("KeyClack — {}", s.reason.clone().unwrap_or_else(|| "muted".into()))
                        } else {
                            format!("KeyClack — {}", s.pack_name)
                        };
                        let _ = tray.set_tooltip(Some(tip));
                    }
                });
            }
            app.manage(AppState { service, config: Mutex::new(cfg.clone()), mute_item: Mutex::new(None) });

            let icon = app.default_window_icon().cloned().expect("default icon");
            TrayIconBuilder::with_id(TRAY_ID)
                .icon(icon)
                .tooltip("KeyClack")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| on_menu(app, ev.id().as_ref()))
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            rebuild_tray_menu(app.handle());

            apply_hotkey(app.handle(), &cfg.mute_hotkey);
            apply_autostart(app.handle(), cfg.autostart);

            if cfg.show_window_on_start && !minimized {
                show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running KeyClack");
}
