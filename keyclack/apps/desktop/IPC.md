# KeyClack desktop — Rust ↔ WebView IPC 계약

프론트엔드는 `@tauri-apps/api/core`의 `invoke`와 `@tauri-apps/api/event`의 `listen`만 쓴다. 아래 이름과 JSON 형태는 Rust `serde` 구조체에서 나오며 **snake_case** 다.

## Commands (`invoke(name, args)`)

| name | args | returns | 설명 |
|---|---|---|---|
| `get_status` | – | `Status` | 현재 상태 스냅샷 |
| `get_config` | – | `AppConfig` | 저장된 설정 |
| `set_config` | `{ config: AppConfig }` | `AppConfig` | 저장 + 즉시 적용. 반환값이 정본 |
| `list_packs` | – | `PackInfo[]` | `config.packs_dir` 스캔 결과 (이름순) |
| `list_devices` | – | `string[]` | 출력 장치 이름 목록 |
| `toggle_mute` | – | `boolean` | 수동 음소거 토글, 새 값 반환 |
| `set_mute` | `{ muted: boolean }` | – | 수동 음소거 설정 |
| `open_packs_dir` | – | – | 탐색기로 팩 폴더 열기 (없으면 생성) |
| `preview_pack` | `{ id: string \| null }` | – | 현재 팩을 바꾸지 않고 해당 팩으로 짧은 타건 시퀀스(약 1초)를 재생. null = 내장 합성음 |
| `show_window` / `hide_window` | – | – | 설정 창 표시/숨김 |
| `quit` | – | – | 앱 종료 |

## Events (`listen(name, cb)`)

| name | payload | 언제 |
|---|---|---|
| `status` | `Status` | 상태가 바뀔 때마다 (팩 로드, 음소거, 규칙 적용, 포그라운드 앱 변경, 2초마다 지연 통계) |

## Types

```ts
type Status = {
  pack_id: string | null;        // 디렉터리 이름. null = 내장 합성음
  pack_name: string;
  pack_keys: number;
  pack_has_up: boolean;
  manual_mute: boolean;          // 사용자가 끈 상태
  effective_muted: boolean;      // 규칙·회의 감지까지 반영한 실제 상태
  effective_volume: number;      // 0..1
  reason: string | null;         // "muted" | "microphone in use: zoom.exe" | "rule: zoom.exe" | ...
  device: string;
  sample_rate: number;
  period_ms: number;
  foreground_exe: string | null; // 예: "code.exe"
  mic_in_use: boolean;
  mic_app: string | null;        // 마이크를 잡고 있는 앱, 예: "discord.exe"
  key_count: number;             // 개수만. 어떤 키인지는 절대 없음
  latency_p50_ms: number | null;
  latency_p99_ms: number | null;
  last_error: string | null;
  hook_installed: boolean;
};

type RuleAction =
  | { type: "mute" }
  | { type: "pack"; id: string }
  | { type: "volume"; value: number }; // 0..1, 마스터 볼륨에 곱함

type AppRule = { exe: string; action: RuleAction; enabled: boolean };
// exe: "zoom.exe" 처럼 .exe로 끝나면 정확히 일치, 아니면 부분 일치 (대소문자 무시)

type AppConfig = {
  pack: string | null;
  packs_dir: string;             // "" = %APPDATA%/keyclack/packs
  volume: number;                // 0..1
  play_up: boolean;
  allow_repeat: boolean;
  device: string | null;         // 장치 이름의 부분 문자열. null = 시스템 기본
  exclusive: boolean;            // WASAPI 독점 모드 (아직 미구현, 토글만 저장)
  mute_hotkey: string;           // Tauri 단축키 문법. "Ctrl+Shift+M". "" = 없음
  autostart: boolean;
  meeting_auto_mute: boolean;    // 마이크 사용 중이면 자동 음소거
  meeting_ignore: string[];      // 이 앱들의 마이크 사용은 회의로 치지 않음 (규칙과 같은 매칭). 예: ["discord.exe"]
  rules: AppRule[];
  show_window_on_start: boolean;
  favorites: string[];           // 즐겨찾기 팩 id 목록. 목록 상단·트레이 메뉴에 먼저 표시
};

type PackInfo = {
  id: string;                    // 디렉터리 이름
  name: string;
  dir: string;
  define_type: "single" | "multi";
  key_count: number;
  has_up: boolean;
  version: number;
};
```

## 규칙

- 설정 변경은 항상 `set_config`로 전체 객체를 보낸다 (부분 갱신 없음). 디바운스 300 ms 권장.
- `status` 이벤트를 구독하고, 마운트 시 `get_status`/`get_config`/`list_packs`/`list_devices`를 한 번 호출한다.
- 키 값을 표시하거나 저장하는 UI는 만들지 않는다. `key_count`만 쓴다.
