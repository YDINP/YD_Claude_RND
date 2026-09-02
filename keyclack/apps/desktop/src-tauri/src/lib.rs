//! KeyClack desktop shell: tray icon, settings window, hotkey, autostart.
//! All sound logic lives in `keyclack-app`; this file only wires it to Tauri.

use std::sync::Mutex;

use keyclack_app::{packs, AppConfig, PackInfo, Service, Status};
use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
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
    if prev.pack != config.pack || prev.packs_dir != config.packs_dir || prev.favorites != config.favorites || prev.autostart != config.autostart {
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
fn preview_pack(state: State<AppState>, id: Option<String>) {
    state.service.preview(id);
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
    if al.is_enabled().unwrap_or(false) == enabled {
        return;
    }
    let r = if enabled { al.enable() } else { al.disable() };
    if let Err(e) = r {
        eprintln!("[autostart] {e}");
    }
}

fn pack_item(app: &AppHandle, id: &str, label: &str, checked: bool) -> Option<CheckMenuItem<Wry>> {
    CheckMenuItem::with_id(app, format!("pack:{id}"), label, true, checked, None::<&str>).ok()
}

/// Tray menu:
///   [x] 음소거
///   ---
///   ★ favourite packs (checkable)      — only if any
///   ---
///   [x] 내장 합성음 / 사운드팩 ▸ (all packs, checkable)
///   ---
///   설정 열기 / 팩 폴더 열기 / [x] Windows 시작 시 실행
///   ---
///   종료
fn rebuild_tray_menu(app: &AppHandle) {
    let state = app.state::<AppState>();
    let cfg = state.config.lock().unwrap().clone();
    let status = state.service.status();
    let Ok(mute) = CheckMenuItem::with_id(app, "mute", "음소거 (Mute)	Ctrl+Shift+M", true, status.manual_mute, None::<&str>) else {
        return;
    };
    let all = packs::scan(&cfg.packs_dir());
    let is_current = |id: &str| cfg.pack.as_deref() == Some(id);
    let mut items: Vec<Box<dyn IsMenuItem<Wry>>> = vec![Box::new(mute.clone())];
    let sep = |items: &mut Vec<Box<dyn IsMenuItem<Wry>>>| {
        if let Ok(s) = PredefinedMenuItem::separator(app) {
            items.push(Box::new(s));
        }
    };
    sep(&mut items);

    let favs: Vec<_> = all.iter().filter(|p| cfg.favorites.iter().any(|f| f == &p.id)).collect();
    if !favs.is_empty() {
        for p in &favs {
            if let Some(i) = pack_item(app, &p.id, &format!("★ {}", p.name), is_current(&p.id)) {
                items.push(Box::new(i));
            }
        }
        sep(&mut items);
    }
    if let Some(i) = pack_item(app, "", "내장 합성음 (Built-in)", cfg.pack.is_none()) {
        items.push(Box::new(i));
    }
    {
        let mut sub_items: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();
        for p in &all {
            if let Some(i) = pack_item(app, &p.id, &p.name, is_current(&p.id)) {
                sub_items.push(Box::new(i));
            }
        }
        if sub_items.is_empty() {
            if let Ok(i) = MenuItem::with_id(app, "noop", "(팩 없음 — 팩 폴더에 넣으세요)", false, None::<&str>) {
                sub_items.push(Box::new(i));
            }
        }
        let refs: Vec<&dyn IsMenuItem<Wry>> = sub_items.iter().map(|b| b.as_ref()).collect();
        if let Ok(sub) = Submenu::with_items(app, format!("사운드팩 (Packs) — {}", all.len()), true, &refs) {
            items.push(Box::new(sub));
        }
    }
    sep(&mut items);
    if let Ok(i) = MenuItem::with_id(app, "open", "설정 열기 (Settings)", true, None::<&str>) {
        items.push(Box::new(i));
    }
    if let Ok(i) = MenuItem::with_id(app, "folder", "팩 폴더 열기 (Open packs folder)", true, None::<&str>) {
        items.push(Box::new(i));
    }
    if let Ok(i) = CheckMenuItem::with_id(app, "autostart", "Windows 시작 시 실행 (Run at startup)", true, cfg.autostart, None::<&str>) {
        items.push(Box::new(i));
    }
    sep(&mut items);
    if let Ok(i) = MenuItem::with_id(app, "quit", "종료 (Quit)", true, None::<&str>) {
        items.push(Box::new(i));
    }
    let refs: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(|b| b.as_ref()).collect();
    match Menu::with_items(app, &refs) {
        Ok(menu) => {
            if let Some(tray) = app.tray_by_id(TRAY_ID) {
                if let Err(e) = tray.set_menu(Some(menu)) {
                    eprintln!("[tray] set_menu: {e}");
                }
            } else {
                eprintln!("[tray] no tray icon {TRAY_ID:?}");
            }
        }
        Err(e) => eprintln!("[tray] build menu: {e}"),
    }
    *state.mute_item.lock().unwrap() = Some(mute);
}

fn save_and_apply(app: &AppHandle, cfg: AppConfig) {
    let state = app.state::<AppState>();
    if let Err(e) = cfg.save() {
        eprintln!("[config] save: {e}");
    }
    *state.config.lock().unwrap() = cfg.clone();
    state.service.apply_config(cfg);
}

fn on_menu(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    match id {
        "mute" => {
            state.service.toggle_mute();
        }
        "open" => show_main(app),
        "folder" => {
            let dir = state.config.lock().unwrap().packs_dir();
            let _ = std::fs::create_dir_all(&dir);
            let _ = tauri_plugin_opener::open_path(dir.to_string_lossy().to_string(), None::<&str>);
        }
        "autostart" => {
            let mut cfg = state.config.lock().unwrap().clone();
            cfg.autostart = !cfg.autostart;
            apply_autostart(app, cfg.autostart);
            save_and_apply(app, cfg);
            rebuild_tray_menu(app);
        }
        "quit" => {
            state.service.shutdown();
            app.exit(0);
        }
        other => {
            if let Some(pack) = other.strip_prefix("pack:") {
                let mut cfg = state.config.lock().unwrap().clone();
                cfg.pack = if pack.is_empty() { None } else { Some(pack.to_string()) };
                save_and_apply(app, cfg);
                rebuild_tray_menu(app);
            }
        }
    }
}

/// Copy the bundled packs into the user's packs dir once per app version, so they
/// appear in the list on first run but a user's later edits/deletions stick.
fn install_builtin_packs(app: &AppHandle, packs_dir: &std::path::Path) {
    let Ok(res) = app.path().resource_dir() else { return };
    let src = res.join("packs");
    if !src.is_dir() {
        return;
    }
    let marker = packs_dir.join(".builtin-version");
    let version = app.package_info().version.to_string();
    if std::fs::read_to_string(&marker).map(|v| v.trim() == version).unwrap_or(false) {
        return;
    }
    let _ = std::fs::create_dir_all(packs_dir);
    if let Ok(rd) = std::fs::read_dir(&src) {
        for e in rd.flatten() {
            let from = e.path();
            if from.is_dir() {
                let to = packs_dir.join(e.file_name());
                if let Err(err) = copy_dir(&from, &to) {
                    eprintln!("[packs] copy {}: {err}", from.display());
                }
            }
        }
    }
    let _ = std::fs::write(&marker, version);
}

fn copy_dir(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for e in std::fs::read_dir(from)?.flatten() {
        let p = e.path();
        let dest = to.join(e.file_name());
        if p.is_dir() {
            copy_dir(&p, &dest)?;
        } else {
            std::fs::copy(&p, &dest)?;
        }
    }
    Ok(())
}

// ---------- entry ----------

pub fn run() {
    let mut cfg = AppConfig::load();
    let _ = std::fs::create_dir_all(cfg.packs_dir());
    // A pack that was deleted or renamed must not keep erroring on every start.
    let packs_dir = cfg.packs_dir();
    let missing = |id: &String| !packs_dir.join(id).join("config.json").is_file();
    if cfg.pack.as_ref().map(&missing).unwrap_or(false) {
        eprintln!("[config] pack {:?} not found; falling back to built-in", cfg.pack);
        cfg.pack = None;
        let _ = cfg.save();
    }
    let before = cfg.favorites.len();
    cfg.favorites.retain(|id| !missing(id));
    if cfg.favorites.len() != before {
        let _ = cfg.save();
    }
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
            preview_pack,
            show_window,
            hide_window,
            quit
        ])
        .setup(move |app| {
            install_builtin_packs(app.handle(), &cfg.packs_dir());
            let service = Service::start(cfg.clone());
            {
                let handle = app.handle().clone();
                service.set_on_change(move |s: &Status| {
                    // Runs on the service thread. Tray/menu calls must execute on the main
                    // thread and would block here waiting for it, so queue them instead.
                    let _ = handle.emit("status", s.clone());
                    let manual_mute = s.manual_mute;
                    let tip = if s.effective_muted {
                        format!("KeyClack — {}", s.reason.clone().unwrap_or_else(|| "muted".into()))
                    } else {
                        format!("KeyClack — {}", s.pack_name)
                    };
                    let h = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        if let Some(state) = h.try_state::<AppState>() {
                            if let Some(item) = state.mute_item.lock().unwrap().as_ref() {
                                let _ = item.set_checked(manual_mute);
                            }
                        }
                        if let Some(tray) = h.tray_by_id(TRAY_ID) {
                            let _ = tray.set_tooltip(Some(tip));
                        }
                    });
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
