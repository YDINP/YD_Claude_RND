/**
 * ko/en 사전 + 언어 훅. localStorage("keyclack-lang")에 선택을 저장한다.
 */
import { useCallback, useEffect, useState } from "react";

export type Lang = "ko" | "en";

const STORAGE_KEY = "keyclack-lang";

export type Dict = typeof ko;

const ko = {
  appTitle: "KeyClack",
  langToggle: "EN",

  // Status bar
  statusPlaying: "재생 중",
  statusMuted: "음소거",
  statusLatency: "지연",
  statusDevice: "출력 장치",
  statusForeground: "포그라운드",
  statusMicInUse: "마이크 사용 중",
  statusMuteOn: "음소거 해제",
  statusMuteOff: "음소거",
  statusBuiltin: "내장 합성음",
  statusReasonPrefix: "사유",
  statusHookMissing: "키보드 후킹이 설치되지 않았습니다",
  statusIgnoreThisApp: "이 앱 무시",

  // Packs
  packsHeading: "사운드팩",
  packsOpenFolder: "팩 폴더 열기",
  packsRefresh: "새로고침",
  packsEmpty:
    "설치된 사운드팩이 없습니다. 팩 폴더에 Mechvibes 형식 사운드팩을 넣어보세요.",
  packsKeys: "키",
  packsHasUp: "키업",
  packsYes: "있음",
  packsNo: "없음",
  packsVersion: "버전",
  packsSelected: "선택됨",
  packsSelect: "선택",
  packsFavoritesLabel: "즐겨찾기",
  packsFavoriteAdd: "즐겨찾기에 추가",
  packsFavoriteRemove: "즐겨찾기에서 해제",
  packsPreview: "미리듣기",
  packsPreviewing: "재생 중…",

  // Sound
  soundHeading: "소리",
  soundVolume: "볼륨",
  soundPlayUp: "키업 소리 재생",
  soundAllowRepeat: "반복 입력 소리 허용",
  soundDevice: "출력 장치",
  soundDeviceDefault: "시스템 기본",
  soundExclusive: "독점 모드 (WASAPI)",
  soundExclusiveWarning: "다른 앱의 소리가 끊길 수 있습니다. 아직 미구현.",

  // Rules
  rulesHeading: "앱 규칙",
  rulesExePlaceholder: "예: zoom.exe",
  rulesActionMute: "음소거",
  rulesActionPack: "팩 지정",
  rulesActionVolume: "볼륨",
  rulesActive: "활성",
  rulesDelete: "삭제",
  rulesAdd: "규칙 추가",
  rulesAddCurrent: "이 앱 추가",
  rulesEmpty: "등록된 규칙이 없습니다.",
  rulesMeetingAutoMute: "회의 자동 음소거",
  rulesMeetingAutoMuteDesc: "마이크를 사용하는 앱이 있으면 자동으로 음소거합니다.",
  rulesIgnoreListHeading: "무시 목록",
  rulesIgnoreListDesc: "이 앱들의 마이크 사용은 회의로 치지 않습니다.",
  rulesIgnorePlaceholder: "예: discord.exe",
  rulesIgnoreAdd: "추가",
  rulesIgnoreEmpty: "무시 목록이 비어 있습니다.",
  rulesIgnoreRemove: "무시 목록에서 삭제",

  // General
  generalHeading: "일반",
  generalHotkey: "음소거 단축키",
  generalHotkeyPlaceholder: "예: Ctrl+Shift+M",
  generalAutostart: "Windows 시작 시 실행",
  generalShowOnStart: "시작 시 창 표시",

  // Typing test
  typingTestLabel: "타이핑 테스트",
  typingTestPlaceholder: "여기에 타이핑해서 소리를 확인해 보세요",
  typingTestHint:
    "이 앱은 전역에서 키 입력을 감지하므로, 여기에 입력해도 다른 곳과 동일하게 현재 팩 소리가 재생됩니다. 입력한 내용은 저장·전송되지 않으며 포커스를 벗어나면 지워집니다.",

  // Footer
  footerKeyCount: "입력한 키 수",
  footerPrivacy: "키 값은 저장·전송하지 않습니다. 개수만 셉니다.",
};

const en: Dict = {
  appTitle: "KeyClack",
  langToggle: "KO",

  statusPlaying: "Playing",
  statusMuted: "Muted",
  statusLatency: "Latency",
  statusDevice: "Output device",
  statusForeground: "Foreground",
  statusMicInUse: "Mic in use",
  statusMuteOn: "Unmute",
  statusMuteOff: "Mute",
  statusBuiltin: "Built-in synth",
  statusReasonPrefix: "Reason",
  statusHookMissing: "Keyboard hook is not installed",
  statusIgnoreThisApp: "Ignore this app",

  packsHeading: "Sound packs",
  packsOpenFolder: "Open packs folder",
  packsRefresh: "Refresh",
  packsEmpty:
    "No sound packs installed. Drop a Mechvibes-style sound pack into the packs folder.",
  packsKeys: "keys",
  packsHasUp: "key-up",
  packsYes: "yes",
  packsNo: "no",
  packsVersion: "version",
  packsSelected: "Selected",
  packsSelect: "Select",
  packsFavoritesLabel: "Favorites",
  packsFavoriteAdd: "Add to favorites",
  packsFavoriteRemove: "Remove from favorites",
  packsPreview: "Preview",
  packsPreviewing: "Playing…",

  soundHeading: "Sound",
  soundVolume: "Volume",
  soundPlayUp: "Play key-up sound",
  soundAllowRepeat: "Allow repeated-key sound",
  soundDevice: "Output device",
  soundDeviceDefault: "System default",
  soundExclusive: "Exclusive mode (WASAPI)",
  soundExclusiveWarning: "Other apps' audio may glitch. Not implemented yet.",

  rulesHeading: "App rules",
  rulesExePlaceholder: "e.g. zoom.exe",
  rulesActionMute: "Mute",
  rulesActionPack: "Set pack",
  rulesActionVolume: "Volume",
  rulesActive: "Active",
  rulesDelete: "Delete",
  rulesAdd: "Add rule",
  rulesAddCurrent: "Add this app",
  rulesEmpty: "No rules yet.",
  rulesMeetingAutoMute: "Auto-mute during meetings",
  rulesMeetingAutoMuteDesc: "Automatically mute when a mic-using app is running.",
  rulesIgnoreListHeading: "Ignore list",
  rulesIgnoreListDesc: "Mic use by these apps is not treated as a meeting.",
  rulesIgnorePlaceholder: "e.g. discord.exe",
  rulesIgnoreAdd: "Add",
  rulesIgnoreEmpty: "Ignore list is empty.",
  rulesIgnoreRemove: "Remove from ignore list",

  generalHeading: "General",
  generalHotkey: "Mute hotkey",
  generalHotkeyPlaceholder: "e.g. Ctrl+Shift+M",
  generalAutostart: "Run at Windows startup",
  generalShowOnStart: "Show window on startup",

  typingTestLabel: "Typing test",
  typingTestPlaceholder: "Type here to hear the current sound",
  typingTestHint:
    "This app hooks keys system-wide, so typing here plays the current pack's sound just like anywhere else. Nothing you type is stored or sent, and it clears when you leave the field.",

  footerKeyCount: "Keys typed",
  footerPrivacy: "Key values are never stored or sent. Only the count is kept.",
};

const dict: Record<Lang, Dict> = { ko, en };

function detectInitialLang(): Lang {
  if (typeof window === "undefined") return "ko";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "ko" || saved === "en") return saved;
  return "ko";
}

export function useI18n() {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const toggleLang = useCallback(
    () => setLangState((prev) => (prev === "ko" ? "en" : "ko")),
    [],
  );

  return { lang, setLang, toggleLang, t: dict[lang] };
}
