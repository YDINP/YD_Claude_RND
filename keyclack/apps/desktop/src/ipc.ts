/**
 * Rust <-> WebView IPC 계약 (apps/desktop/IPC.md 참고).
 * 이 파일이 백엔드와 주고받는 타입과 invoke 래퍼의 단일 진실 공급원이다.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ---------- Types ----------

export type Status = {
  pack_id: string | null; // 디렉터리 이름. null = 내장 합성음
  pack_name: string;
  pack_keys: number;
  pack_has_up: boolean;
  manual_mute: boolean; // 사용자가 끈 상태
  effective_muted: boolean; // 규칙·회의 감지까지 반영한 실제 상태
  effective_volume: number; // 0..1
  reason: string | null; // "muted" | "microphone in use" | "rule: zoom.exe" | ...
  device: string;
  sample_rate: number;
  period_ms: number;
  foreground_exe: string | null; // 예: "code.exe"
  mic_in_use: boolean;
  mic_app: string | null; // 마이크를 잡고 있는 앱, 예: "discord.exe"
  key_count: number; // 개수만. 어떤 키인지는 절대 없음
  latency_p50_ms: number | null;
  latency_p99_ms: number | null;
  last_error: string | null;
  hook_installed: boolean;
};

export type RuleAction =
  | { type: "mute" }
  | { type: "pack"; id: string }
  | { type: "volume"; value: number }; // 0..1, 마스터 볼륨에 곱함

export type AppRule = { exe: string; action: RuleAction; enabled: boolean };

export type AppConfig = {
  pack: string | null;
  packs_dir: string; // "" = %APPDATA%/keyclack/packs
  volume: number; // 0..1
  play_up: boolean;
  allow_repeat: boolean;
  device: string | null; // 장치 이름의 부분 문자열. null = 시스템 기본
  exclusive: boolean; // WASAPI 독점 모드 (아직 미구현, 토글만 저장)
  mute_hotkey: string; // Tauri 단축키 문법. "Ctrl+Shift+M". "" = 없음
  autostart: boolean;
  meeting_auto_mute: boolean; // 마이크 사용 중이면 자동 음소거
  meeting_ignore: string[]; // 이 앱들의 마이크 사용은 회의로 치지 않음 (규칙과 같은 매칭)
  rules: AppRule[];
  show_window_on_start: boolean;
  favorites: string[]; // 즐겨찾기 팩 id 목록. 목록 상단·트레이 메뉴에 먼저 표시
};

export type PackInfo = {
  id: string; // 디렉터리 이름
  name: string;
  dir: string;
  define_type: "single" | "multi";
  key_count: number;
  has_up: boolean;
  version: number;
};

// ---------- Commands ----------

export const getStatus = () => invoke<Status>("get_status");
export const getConfig = () => invoke<AppConfig>("get_config");
export const setConfig = (config: AppConfig) =>
  invoke<AppConfig>("set_config", { config });
export const listPacks = () => invoke<PackInfo[]>("list_packs");
export const listDevices = () => invoke<string[]>("list_devices");
export const toggleMute = () => invoke<boolean>("toggle_mute");
export const setMute = (muted: boolean) =>
  invoke<void>("set_mute", { muted });
export const openPacksDir = () => invoke<void>("open_packs_dir");
export const previewPack = (id: string | null) =>
  invoke<void>("preview_pack", { id });
export const showWindow = () => invoke<void>("show_window");
export const hideWindow = () => invoke<void>("hide_window");
export const quitApp = () => invoke<void>("quit");

// ---------- Events ----------

export const onStatus = (cb: (status: Status) => void): Promise<UnlistenFn> =>
  listen<Status>("status", (event) => cb(event.payload));
