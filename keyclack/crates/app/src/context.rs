//! Windows context probes: which process is in front, is any app using the microphone.
//!
//! Privacy: the process name is used only for rule matching and the status line.

use windows_sys::Win32::Foundation::CloseHandle;
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

/// File name (lowercase, e.g. `code.exe`) of the foreground window's process.
pub fn foreground_exe() -> Option<String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return None;
        }
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len);
        CloseHandle(h);
        if ok == 0 {
            return None;
        }
        let full = String::from_utf16_lossy(&buf[..len as usize]);
        let name = full.rsplit(['\\', '/']).next().unwrap_or(&full);
        Some(name.to_lowercase())
    }
}

/// Name of an app currently holding the microphone, per Windows' capability access
/// store: a subkey whose `LastUsedTimeStop` is 0 while `LastUsedTimeStart` is set.
/// Covers packaged apps (direct subkeys, returned as the package family name) and
/// desktop apps (`NonPackaged\*`, returned as the exe file name, lowercase).
pub fn mic_holder() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const ROOT: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";
    let root = RegKey::predef(HKEY_CURRENT_USER).open_subkey(ROOT).ok()?;
    let active = |k: &RegKey| -> bool {
        let start: u64 = k.get_value("LastUsedTimeStart").unwrap_or(0);
        let stop: u64 = k.get_value("LastUsedTimeStop").unwrap_or(1);
        start != 0 && stop == 0
    };
    for name in root.enum_keys().flatten() {
        let Ok(k) = root.open_subkey(&name) else { continue };
        if name.eq_ignore_ascii_case("NonPackaged") {
            for sub in k.enum_keys().flatten() {
                if let Ok(s) = k.open_subkey(&sub) {
                    if active(&s) {
                        // "C:#Users#me#AppData#...#Discord.exe" -> "discord.exe"
                        let exe = sub.rsplit('#').next().unwrap_or(&sub).to_lowercase();
                        return Some(exe);
                    }
                }
            }
        } else if active(&k) {
            return Some(name.to_lowercase());
        }
    }
    None
}

pub fn mic_in_use() -> bool {
    mic_holder().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probes_do_not_panic() {
        // Values depend on the desktop state; we only check the calls are sound.
        eprintln!("foreground={:?} mic_holder={:?}", foreground_exe(), mic_holder());
    }
}
