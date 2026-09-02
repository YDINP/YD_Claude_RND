//! Windows low-level keyboard hook (WH_KEYBOARD_LL) → [`KeyEvent`].
//!
//! The callback must return fast: Windows silently removes hooks whose callback
//! exceeds the LowLevelHooksTimeout (default 300 ms). We do nothing here except
//! copy a few fields into a channel.
//!
//! Privacy: the virtual-key code is inspected only to tell numpad digits from
//! numpad navigation; it is not stored or forwarded.

use std::sync::OnceLock;
use std::time::Instant;

use crossbeam_channel::Sender;
use keyclack_core::keycode::is_numpad_block;
use keyclack_core::KeyEvent;
use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{MapVirtualKeyW, MAPVK_VK_TO_VSC_EX};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, SetWindowsHookExW, KBDLLHOOKSTRUCT, LLKHF_EXTENDED,
    LLKHF_INJECTED, LLKHF_UP, MSG, WH_KEYBOARD_LL,
};

static TX: OnceLock<Sender<KeyEvent>> = OnceLock::new();

/// VK_NUMPAD0..=VK_DIVIDE: the numpad as digits/operators (Num Lock on).
fn is_numpad_vk(vk: u32) -> bool {
    (0x60..=0x6F).contains(&vk)
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let k = &*(lparam as *const KBDLLHOOKSTRUCT);
        if let Some(tx) = TX.get() {
            // Injected events (SendInput without KEYEVENTF_SCANCODE) carry scanCode 0.
            let mut sc = k.scanCode;
            let mut ext = k.flags & LLKHF_EXTENDED != 0;
            if sc == 0 {
                sc = MapVirtualKeyW(k.vkCode, MAPVK_VK_TO_VSC_EX);
                ext |= sc & 0xE000 == 0xE000;
            }
            let sc8 = (sc & 0xFF) as u8;
            let numpad_nav = !ext && is_numpad_block(sc8) && !is_numpad_vk(k.vkCode);
            let _ = tx.try_send(KeyEvent {
                scancode: sc8,
                extended: ext,
                numpad_nav,
                injected: k.flags & LLKHF_INJECTED != 0,
                is_down: k.flags & LLKHF_UP == 0,
                t: Instant::now(),
            });
        }
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

/// Install the hook on a dedicated thread that runs a message loop.
/// Only the first call's sender is used.
pub fn spawn(tx: Sender<KeyEvent>) {
    let _ = TX.set(tx);
    std::thread::Builder::new()
        .name("keyclack-hook".into())
        .spawn(|| unsafe {
            let h = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), std::ptr::null_mut(), 0);
            if h.is_null() {
                eprintln!("[hook] SetWindowsHookExW failed");
                return;
            }
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {}
        })
        .expect("spawn hook thread");
}
