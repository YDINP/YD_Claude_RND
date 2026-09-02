//! Scancode → Mechvibes pack keycode.
//!
//! Mechvibes packs are keyed by libuiohook keycodes, which on Windows are the
//! set-1 scancode with a prefix:
//!
//! | key class                               | code            | example                 |
//! |-----------------------------------------|-----------------|-------------------------|
//! | plain key                               | `sc`            | Enter 0x1C = 28         |
//! | E0-prefixed arrow keys                  | `0xE000 \| sc`  | Up 0xE048 = 57416       |
//! | other E0-prefixed keys                  | `0x0E00 \| sc`  | Right Ctrl 0x0E1D = 3613|
//! | numpad key acting as nav (Num Lock off) | `0xEE00 \| sc`  | KP Up 0xEE48 = 61000    |

pub const ARROW_UP: u8 = 0x48;
pub const ARROW_LEFT: u8 = 0x4B;
pub const ARROW_RIGHT: u8 = 0x4D;
pub const ARROW_DOWN: u8 = 0x50;

pub fn uiohook_code(scancode: u8, extended: bool, numpad_nav: bool) -> u32 {
    let sc = scancode as u32;
    if extended {
        match scancode {
            ARROW_UP | ARROW_LEFT | ARROW_RIGHT | ARROW_DOWN => 0xE000 | sc,
            _ => 0x0E00 | sc,
        }
    } else if numpad_nav {
        0xEE00 | sc
    } else {
        sc
    }
}

/// Scancodes in the numpad block that double as navigation keys when Num Lock is off.
pub fn is_numpad_block(scancode: u8) -> bool {
    matches!(scancode, 0x47..=0x49 | 0x4B..=0x4D | 0x4F..=0x53)
}

/// Letter-row scancodes, used to build a generic fallback for packs that only define
/// individual keys.
pub fn is_letter_row(code: u32) -> bool {
    matches!(code, 16..=25 | 30..=38 | 44..=50)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_keys_pass_through() {
        assert_eq!(uiohook_code(0x1C, false, false), 28); // Enter
        assert_eq!(uiohook_code(0x39, false, false), 57); // Space
        assert_eq!(uiohook_code(0x01, false, false), 1); // Esc
    }

    #[test]
    fn extended_keys_get_0e00_prefix() {
        assert_eq!(uiohook_code(0x1D, true, false), 3613); // Right Ctrl
        assert_eq!(uiohook_code(0x38, true, false), 3640); // Right Alt
        assert_eq!(uiohook_code(0x5B, true, false), 3675); // Left Win
        assert_eq!(uiohook_code(0x1C, true, false), 3612); // KP Enter
        assert_eq!(uiohook_code(0x53, true, false), 3667); // Delete
    }

    #[test]
    fn arrows_get_e000_prefix() {
        assert_eq!(uiohook_code(0x48, true, false), 57416);
        assert_eq!(uiohook_code(0x4B, true, false), 57419);
        assert_eq!(uiohook_code(0x4D, true, false), 57421);
        assert_eq!(uiohook_code(0x50, true, false), 57424);
    }

    #[test]
    fn numpad_nav_gets_ee00_prefix() {
        assert_eq!(uiohook_code(0x47, false, true), 60999); // KP Home
        assert_eq!(uiohook_code(0x48, false, true), 61000); // KP Up
        assert_eq!(uiohook_code(0x48, false, false), 72); // KP 8 with Num Lock on
    }

    #[test]
    fn numpad_block_membership() {
        assert!(is_numpad_block(0x47));
        assert!(is_numpad_block(0x53));
        assert!(!is_numpad_block(0x4A)); // KP minus
        assert!(!is_numpad_block(0x4E)); // KP plus
        assert!(!is_numpad_block(0x1C));
    }
}
