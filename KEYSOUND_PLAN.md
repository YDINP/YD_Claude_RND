# KeyClack — 기계식 키보드 사운드 시뮬레이터 계획서

작성일: 2026-09-02
상태: **Phase 3 사운드 팩 완료 + 3.5 사용성 (2026-09-02)**. 절차적 합성 팩 9종 내장, 즐겨찾기, 미리듣기, 트레이 메뉴 확장 + 팩 빌더 CLI(녹음 슬라이서) + 첫 실행 자동 설치. 테스트 46개. Phase 0 §10, Phase 1 §11, Phase 2 §12, Phase 3 §13. 안드로이드 기획은 `keyclack/docs/ANDROID_PLAN.md`
프로젝트 폴더: `keyclack/`

## 0. 목표와 전제

| 항목 | 결정 | 근거 |
|---|---|---|
| 한 줄 정의 | OS 전역 키 입력을 가로채 키마다 기계식 스위치 타건음을 재생하는 상주형 데스크톱 앱 | Mechvibes / Klack 계열 |
| 1차 플랫폼 | **Windows 11** | 개발 PC 환경. 훅·오디오 API가 가장 잘 정리됨 |
| 2차 플랫폼 | macOS, Linux | 코어를 플랫폼 독립으로 짜 두고 입력 계층만 교체 |
| 핵심 품질 지표 | **키 누름 → 소리 출력 지연 15 ms 이하** | 20 ms를 넘으면 "따라오는 소리"로 느껴져 체감이 무너짐 |
| 사운드 팩 | **Mechvibes 팩 포맷 호환** | 커뮤니티 팩 수백 종을 그대로 사용. 자체 팩도 같은 포맷 |
| 절대 원칙 | **키 값을 절대 저장·전송하지 않는다** | 전역 키 훅은 구조상 키로거와 같다. 로그·텔레메트리 0. 코드로 증명 가능해야 함 |

## 1. 기술 스택 결정

세 가지 후보를 비교했다.

| 후보 | 지연 | 크기 | 개발 속도 | 판정 |
|---|---|---|---|---|
| Electron + uiohook-napi + WebAudio (Mechvibes 방식) | 20~40 ms | 150 MB+ | 빠름 | ✗ 지연 목표 미달, 상주 앱치고 무거움 |
| C# WPF + NAudio + LL 훅 | 10~15 ms | 작음 | 보통 | △ Windows 전용으로 굳어짐 |
| **Tauri 2 (Rust 백엔드) + Web UI** | **5~12 ms** | 10 MB 안팎 | 보통 | **✓ 채택** |

채택 근거: 훅과 오디오는 Rust가 담당해 지연을 확보하고, 설정 화면은 이 저장소에서 익숙한 React로 만든다. 코어 엔진은 UI와 완전히 분리된 순수 Rust 크레이트로 두어 나중에 CLI·다른 프론트로 재사용한다.

핵심 크레이트:

| 역할 | 크레이트 | 비고 |
|---|---|---|
| 전역 키 훅 (Win) | `windows` (`SetWindowsHookExW` + `WH_KEYBOARD_LL`) | 직접 호출. 스캔코드·확장키 플래그를 그대로 받음 |
| 전역 키 훅 (mac/Linux) | `rdev` 또는 CGEventTap / evdev 직접 | Phase 5 |
| 오디오 출력 | **자체 WASAPI 백엔드** (`windows` 크레이트, IAudioClient3) | Phase 0에서 결정. cpal은 IAudioClient3 미지원이라 주기 조절 불가. 자체 구현이 180줄로 끝남 |
| 믹서 | **자체 믹서** (`mixer.rs`) | 폴리포니 32, 프리디코드 f32. Phase 0에서 이미 작성. kira 불필요 |
| 디코딩 | `symphonia` | ogg/mp3/wav → f32 PCM. 팩 로드 시 1회 전부 디코딩 |
| 트레이 | `tray-icon` (Tauri 내장) | |
| 설정 | `serde` + JSON | `%APPDATA%/keyclack/config.json` |

## 2. 시스템 구성

```
키보드 ──▶ Windows LL 훅 (훅 스레드)
              │  scancode + down/up 만 추출, 즉시 return  (< 1 ms, 여기서 아무것도 하지 않음)
              ▼
         crossbeam channel (lock-free)
              │
              ▼
        Engine 스레드 (keyclack-core)
         ├─ KeyState: 눌림 추적, 오토리피트 억제
         ├─ Mapper : scancode → 사운드 슬롯 (팩 config.json)
         ├─ Variation: 라운드로빈 샘플, 피치 ±2 %, 볼륨 ±10 %
         └─ Mixer  : 폴리포니 32, 프리디코드 PCM 재생
              │
              ▼
          자체 WASAPI 렌더 스레드 (IAudioClient3 shared, 주기 = 드라이버 최소값, 이 PC는 10 ms)
              │
              ▼
           스피커

Tauri 웹뷰 (설정 UI) ◀──IPC──▶ Engine   (팩 선택·볼륨·제외 앱·핫키)
트레이 아이콘: 음소거 토글 / 팩 빠른 전환 / 종료
```

**훅 콜백 규칙**: Windows는 LL 훅 콜백이 느리면(기본 300 ms 초과 시) 훅을 조용히 떼어 버린다. 콜백은 채널 push 한 줄만 하고 반환한다. 디코딩·믹싱은 절대 훅 스레드에서 하지 않는다.

## 3. 저장소 구조

```
keyclack/
├── Cargo.toml                 # workspace
├── crates/
│   ├── core/                  # keyclack-core. OS 의존 0. 팩 파서·매퍼·믹서·상태머신
│   │   ├── src/pack.rs        #   Mechvibes config.json 파서 + 자체 확장
│   │   ├── src/mapper.rs      #   scancode → 슬롯
│   │   ├── src/engine.rs      #   KeyEvent 받아 PlayCmd 내놓는 순수 함수 층
│   │   └── src/mixer.rs       #   자체 믹서. 프리디코드 캐시 (Phase 0에서 작성)
│   ├── audio-win/             # WASAPI IAudioClient3 백엔드 (Phase 0의 wasapi3.rs 이관) + exclusive 옵션
│   ├── input-win/             # WH_KEYBOARD_LL. KeyEvent{scancode, extended, is_down, t}
│   ├── input-mac/             # (Phase 5)
│   └── cli/                   # keyclack-cli. 훅+엔진만 있는 헤드리스 실행 파일. 스파이크·벤치·서버용
├── apps/
│   └── desktop/               # Tauri 2. src-tauri/(트레이·IPC·자동시작) + src/(React 설정 UI)
├── packs/
│   ├── _schema/               # config.json JSON Schema + 검증 스크립트
│   ├── cherry-mx-blue/        # 자체 제작 팩 1
│   └── ...
└── tools/
    ├── latency-bench/         # 키 이벤트 → 오디오 콜백 도달 시간 측정
    └── pack-builder/          # 원본 녹음 → 스프라이트 ogg + config.json 생성 CLI
```

## 4. 사운드 팩 포맷

Mechvibes 포맷을 1:1로 읽는다. 두 가지 모드가 있다.

```jsonc
// 스프라이트 모드: 파일 1개, 키마다 [시작 ms, 길이 ms]
{
  "id": "cherry-mx-blue", "name": "Cherry MX Blue",
  "key_define_type": "single", "sound": "sound.ogg",
  "defines": { "1": [0, 120], "28": [130, 160], "57": [300, 200] }
}
// 멀티 모드: 키마다 파일
{ "key_define_type": "multi", "defines": { "1": "esc.ogg", "28": "enter.ogg" } }
```

`defines`의 키는 **libuiohook 키코드**다. Windows에서는 set-1 스캔코드에 접두사가 붙은 값이며, 실제 팩으로 검증한 대응표 (`keycode.rs`):

| 키 종류 | 코드 | 예 |
|---|---|---|
| 일반 키 | `sc` | Enter 28, Space 57, A 30 |
| E0 확장 화살표 | `0xE000 \| sc` | ↑ 57416, ← 57419, → 57421, ↓ 57424 |
| 그 외 E0 확장키 | `0x0E00 \| sc` | 오른쪽 Ctrl 3613, 오른쪽 Alt 3640, 왼쪽 Win 3675, Delete 3667, 키패드 Enter 3612 |
| 넘록 꺼진 키패드(내비 동작) | `0xEE00 \| sc` | KP Home 60999, KP ↑ 61000 |

WH_KEYBOARD_LL이 주는 `scanCode`·`LLKHF_EXTENDED`·`vkCode`(넘록 판별용)로 바로 만들 수 있어 변환 테이블이 필요 없다. 키보드 레이아웃(한/영, Dvorak)과 무관하게 물리 키 기준으로 동작한다. (계획 초안의 "0xE000 | sc 단일 규칙"은 틀렸고 Phase 1에서 실제 팩으로 바로잡음.)

**v2 포맷이 이미 키업·변주를 지원한다.** 자체 확장을 만들 필요가 없었다:

| 필드 | 의미 |
|---|---|
| `"28-up": ...` | 키 뗄 때 소리 (single 모드의 스프라이트 구간, multi 모드의 파일 모두 가능) |
| `"sound": "GENERIC_R{0-4}.mp3"` | multi 모드의 기본 소리. `{a-b}` 범위 = 변주 파일 5개, 랜덤 재생 |
| `"soundup": "release/GENERIC.mp3"` | 기본 키업 소리 |
| `"version": 2` | 위 기능이 있는 팩 |

엔진 쪽 추가: single 팩(키업 없음)의 미정의 키는 알파벳 줄 소리 중 하나로 폴백, 같은 키 연속 입력 시 같은 변주 회피, 피치 ±2 %·게인 ±10 % 지터는 엔진 설정.

## 5. 실행 계층 상세

### 5.1 입력 (input-win)
- `SetWindowsHookExW(WH_KEYBOARD_LL)`은 메시지 루프가 있는 전용 스레드에서 설치한다.
- 오토리피트: 눌린 키를 `[bool; 512]`로 추적. 이미 down인 키의 down은 버린다 (옵션으로 리피트음 허용).
- 주입 이벤트(`LLKHF_INJECTED`)는 무시한다. 매크로·원격 데스크톱이 타건음을 내지 않게.
- 자기 자신이 보낸 핫키(음소거 토글)는 처리 후 소리 내지 않는다.

### 5.2 엔진 (core)
- 팩 로드 시 모든 샘플을 출력 디바이스 샘플레이트로 리샘플링해 f32로 메모리에 올린다. 재생 경로에 디스크 I/O·디코딩 0.
- `engine.rs`는 `fn on_key(&mut self, ev: KeyEvent) -> Option<PlayCmd>` 순수 함수. 오디오 없이 유닛 테스트 가능.
- 폴리포니 상한 도달 시 가장 오래된 보이스를 끊는다. 빠른 타이핑(초당 15타)에서도 뭉개지지 않게.
- 제외 앱 목록: 포그라운드 창의 프로세스 이름을 500 ms마다 폴링해 게임·DAW 등에서는 무음.

### 5.3 오디오
- WASAPI shared 모드, IAudioClient3로 드라이버 최소 주기 요청 (이 PC 10 ms, 최신 Realtek 온보드는 2.67 ms).
- 옵션으로 exclusive 모드 제공 (지연 더 줄지만 다른 앱 소리를 뺏음. 기본 off).
- 출력 디바이스 변경(이어폰 꽂기)을 감지해 스트림을 다시 연다.

### 5.4 서비스 계층 (`crates/app`) — Phase 2에서 추가
- `config.rs` `%APPDATA%/keyclack/config.json`. 팩·볼륨·장치·핫키·자동시작·규칙.
- `rules.rs` 순수 함수 `resolve(cfg, 포그라운드 exe, 마이크 사용중, 수동음소거) → Effective{muted, pack, volume, reason}`. 우선순위: 수동 음소거 > 회의 자동 음소거 > 앱 규칙(첫 매치) > 기본.
- `context.rs` 400 ms마다 포그라운드 프로세스 이름, 1.5 s마다 마이크 사용 여부(레지스트리 `CapabilityAccessManager\ConsentStore\microphone`의 `LastUsedTimeStop == 0`).
- `service.rs` 훅·엔진·오디오·컨텍스트 스레드 소유. UI는 `apply_config`/`toggle_mute`와 `Status` 스냅샷·변경 콜백만 쓴다. 장치 변경 시 오디오 재시작, 샘플레이트 바뀌면 팩 재로드.
- **앱별 프로필** = 규칙의 동작 3종: 음소거 / 팩 지정 / 볼륨 배율. 리서치에서 확인한 차별화 포인트(컨텍스트 자동 전환)를 여기서 가져간다.

### 5.5 UI (Tauri 2, `apps/desktop`)
- IPC 계약: `apps/desktop/IPC.md`. 명령 11개 + `status` 이벤트 1개.
- 트레이: 음소거 체크, 팩 목록(체크), 설정 열기, 종료. 툴팁에 현재 팩/음소거 사유.
- 설정 창(React, 한국어 기본 + 영어): 상태 바, 팩 목록, 소리(볼륨·키업·반복·장치·독점), 앱 규칙 편집, 일반(핫키·자동시작·시작 시 창 표시).
- 전역 핫키(`tauri-plugin-global-shortcut`), 자동 시작(`tauri-plugin-autostart`, `--minimized` 인자로 창 숨김 시작). 창 닫기 = 트레이로.

## 6. 개발 단계

| Phase | 내용 | 완료 기준 | 예상 |
|---|---|---|---|
| **0 스파이크** ✅ | `cli/`에서 훅 + wav 1개 재생. `latency-bench`로 지연 측정 | 지연 수치 확인, 15 ms 이하 달성 가능 판정 | 0.5일 |
| **1 코어 엔진** ✅ | 팩 파서(Mechvibes 2모드), 매퍼, 그룹 폴백, 리피트 억제, 믹서 변주(피치·게인), 프리디코드 | 커뮤니티 팩 3종 그대로 로드해 정상 재생. core 유닛 테스트 통과 | 2일 → 실제 0.5일 |
| **2 상주 앱** ✅ | Tauri 골격, 트레이, 설정 저장, 팩 전환, 볼륨, 음소거 핫키, **앱별 프로필 + 회의 자동 음소거**, 자동 시작 | 하루 종일 켜 두고 일해도 크래시·훅 탈락 없음 | 2일 |
| **3 사운드 팩** ✅ | `packtool` CLI(synth/slice/assemble/check), 절차적 합성 팩 3종 (청축·갈축·저소음적축), 키 up 소리, 변주 5종 | 엔진 로드 통과, 첫 실행 자동 설치 확인. 청취 A/B는 사용자 | 2일 → 0.5일 |
| **4 배포** | Tauri 번들(NSIS 인스톨러), 코드 서명 여부 결정, 자동 업데이트, README | 깨끗한 PC에 설치해 첫 실행 성공 | 1일 |
| **5 크로스플랫폼** | macOS(CGEventTap + 손쉬운 사용 권한), Linux(evdev, `input` 그룹) | 각 OS에서 Phase 2 기능 동작 | 3일 |

Phase마다 커밋·푸시한다 (기존 워크플로우 관례).

## 7. 테스트 전략

| 층 | 방법 |
|---|---|
| core | `cargo test`. 팩 파서 픽스처(스프라이트/멀티/확장), 매퍼 확장키, 리피트 억제 상태머신, 폴리포니 상한 |
| 믹서 | 오프라인 렌더: 이벤트 시퀀스 → PCM 버퍼 → 피크 위치·개수 검증 (실제 디바이스 불필요) |
| 입력 | `SendInput`으로 합성 키를 넣고 채널에 KeyEvent가 도달하는지. 주입 플래그 무시 옵션을 끄고 테스트 |
| 지연 | `latency-bench`: 훅 콜백 타임스탬프 → 오디오 콜백에서 샘플이 쓰이는 시각. p50/p99 기록 |
| 안정성 | 8시간 소크 테스트. 훅 탈락 감지(주기적 자가 점검, 떨어지면 재설치) |

## 8. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| **백신 오탐** — LL 훅 + 상주 = 키로거 시그니처 | 키 값 미저장을 코드로 명시, 오픈소스 공개, 가능하면 코드 서명. 훅 대신 Raw Input(`RegisterRawInputDevices`) 대안도 Phase 0에서 함께 측정 |
| 게임 안티치트가 훅을 차단·경고 | 제외 앱 기본 목록에 주요 런처 포함. 게임 중 자동 음소거 |
| 훅 콜백 지연으로 Windows가 훅을 떼어 냄 | 콜백은 채널 push만. 감시 스레드가 훅 생존 확인 후 재설치 |
| 오디오 디바이스 변경 시 스트림 죽음 | 디바이스 이벤트 구독 + 재오픈 |
| 커뮤니티 팩 라이선스 | 앱에는 자체 팩만 동봉. 외부 팩은 사용자가 폴더에 넣는 방식 |
| 드라이버 최소 주기가 10 ms라 공유 모드로는 15 ms 아래 불가 (Phase 0 확인) | exclusive 모드 옵션 제공. 기본은 공유 모드 유지 |

## 9. 확장 아이디어 (범위 밖, 기록만)

- 마우스 클릭·스크롤 소리 (같은 훅 구조로 `WH_MOUSE_LL` 추가)
- 팩 편집기 UI: 키 누르면 파형에서 구간 지정
- 스테레오 패닝: 키 물리 위치(왼쪽 Tab, 오른쪽 Enter)에 따라 좌우 배치
- 타이핑 통계(초당 타수)를 **키 값 없이** 카운트만 표시
- 오디오 스트림 대신 가상 오디오 케이블로 방송 송출용 출력

## 10. Phase 0 스파이크 결과 (2026-09-02)

환경: Windows 11, Rust 1.98 (이 세션에서 rustup + Windows SDK 10.0.22621 설치), 합성 키 입력(F15 ×40, SendInput)으로 측정.

| 항목 | 결과 |
|---|---|
| 훅 → 엔진 스레드 | 0.02 ms. 파이프라인 오버헤드는 사실상 0 |
| 훅 → 오디오 콜백 | p50 4.8 ms, p99 9.4 ms (= 다음 오디오 주기까지 대기 시간) |
| 오디오 주기 | **10 ms** (480 frames @ 48 kHz) |
| 추정 출력 지연 (p50) | **~15 ms** + 드라이버/하드웨어 출력 지연 수 ms |

**발견 1 — 주기가 전부다.** 지연은 "다음 콜백까지 대기(평균 주기/2) + 주기 1개"로 결정된다. 코드 최적화로 줄일 여지가 없고 오디오 주기를 줄이는 것만이 방법이다.

**발견 2 — cpal은 주기를 못 줄인다.** cpal 0.18 WASAPI 백엔드는 IAudioClient(구형)만 써서 `BufferSize::Fixed(128)`을 받기만 하고 무시한다. 그래서 IAudioClient3 `InitializeSharedAudioStream`을 쓰는 자체 백엔드(`wasapi3.rs`)를 작성했다.

**발견 3 — 이 PC의 드라이버는 공유 모드 최소 주기가 10 ms다.** IAudioClient3로 조회한 `GetSharedModeEnginePeriod` 결과:

| 장치 | min period |
|---|---|
| USB HIFI AUDIO, FxSound, NVIDIA HDMI ×3, Logitech G733, K66 | 480 frames = 10.00 ms (default=min=max) |
| Realtek USB SPDIF | 336 frames = 7.00 ms |

즉 IAudioClient3는 이 장치들에서는 이득이 없다 (다른 PC의 Realtek 온보드 등은 보통 2.67 ms까지 내려가므로 코드는 유지). 10 ms 아래로 가려면 **exclusive 모드**(다른 앱 소리를 뺏음)뿐이다.

**발견 4 — FxSound.** 기본 출력 장치가 FxSound 가상 장치다. 가상 장치는 자체 버퍼를 한 단 더 거치므로 실제 장치를 직접 고르는 편이 낫다. Phase 2 UI에 장치 선택을 넣는다.

**발견 5 — 주입 이벤트는 scancode가 0.** SendInput으로 넣은 키는 `scanCode=0`으로 와서 `MapVirtualKeyW(vk, MAPVK_VK_TO_VSC_EX)`로 폴백했다. 실제 키보드는 항상 scancode를 준다.

### 판정
- **Go.** 추정 ~15 ms는 목표 경계지만 파이프라인 자체는 한계까지 짜여 있고, Mechvibes(Electron, 20~40 ms)보다 확실히 빠르다.
- 목표를 "공유 모드 15 ms 안팎, exclusive 옵션 시 5 ms 안팎"으로 조정한다. exclusive는 Phase 2에서 옵션(기본 off)으로 추가.
- 스택 변경: cpal·kira 제거, 자체 WASAPI + 자체 믹서로 확정. 의존성이 줄고 exclusive 모드도 같은 파일에서 처리 가능.

### 실행 방법
```
cd keyclack
cargo run --release -- --list-devices
cargo run --release -- --device "USB HIFI"          # 실제 키보드로 쳐 보기. Ctrl+C 종료
cargo run --release -- --backend cpal --seconds 10   # 비교용
```

## 11. Phase 1 결과 (2026-09-02)

크레이트 분리 완료: `core`(OS 의존 0) / `input-win` / `audio-win` / `cli`. cpal·kira 제거.

| 검증 | 결과 |
|---|---|
| `cargo test --workspace` | 30 passed (keycode 5, decode 2, pack 7, engine 9, mixer 6, 실제 팩 로드 1) |
| cherrymx-blue-abs (ogg 스프라이트, 114키) | 로드 44 ms, 재생 정상, est. p50 15.1 ms |
| holy-pandas (mp3 멀티 v2, 키업·변주) | 재생 정상, 키업 소리 확인, est. p50 14.5 ms |
| eg-oreo (ogg 스프라이트) | 로드 테스트 통과 |

실행: `cargo run --release -- --pack packs/_external/holy-pandas --device "USB HIFI"`

남은 것 (Phase 2로): 설정 저장, 트레이, 팩 전환 UI, 제외 앱, 핫키, 장치 변경 감지, exclusive 옵션. 알려진 미처리: Pause 키(E1 접두사)의 uiohook 코드 3653 매핑.

## 12. Phase 2 결과 (2026-09-02)

`crates/app`(서비스 계층) + `apps/desktop`(Tauri 2 + React 19). `npm run tauri dev`로 실행.

| 검증 | 결과 |
|---|---|
| `cargo test --workspace` | 44 passed (core 30 + app 14) |
| 설정 창 | 상태 바·팩 목록·소리·앱 규칙·일반 5개 패널, 한/영 전환. 실제 데이터로 렌더링 확인 |
| 회의 자동 음소거 | Discord가 마이크를 잡고 있어 자동 음소거 → UI의 "이 앱 무시" 클릭 → 즉시 재생 상태로 복귀. 설정 파일에 `meeting_ignore` 저장 확인 |
| 팩 전환 | UI 클릭으로 pandas 선택 → 상태 반영, 합성 키 입력으로 키 카운트 증가 확인 |
| 지연 | UI 표시 p50 5.2 ms (훅→오디오 콜백, 디버그 빌드) |
| 트레이 | 음소거 체크·팩 목록·설정 열기·종료. 툴팁에 현재 팩/음소거 사유 |
| 핫키·자동시작 | 코드 연결 완료(`Ctrl+Shift+M`, `--minimized`). 실기기 확인은 사용자 |

**발견**
- Discord처럼 음성 채널에 상주하는 앱은 마이크를 계속 잡고 있어 "회의 중"으로 잡힌다. 그래서 `mic_app`(누가 잡고 있는지)을 상태에 노출하고 `meeting_ignore` 목록을 추가했다. 첫 실행에서 사용자가 한 번 "이 앱 무시"를 누르면 끝.
- 설정 파일을 Notepad/PowerShell로 편집하면 UTF-8 BOM이 붙어 파싱이 실패한다 → 로더에서 BOM 제거.
- 주입 키 테스트는 `KEYCLACK_ALLOW_INJECTED=1` 환경변수로만 허용(기본은 무시). 자동화 검증용.

**미구현 (Phase 2 범위였으나 이월)**: WASAPI exclusive 모드(토글만 저장), 출력 장치 변경 자동 감지(현재는 설정에서 장치를 바꿀 때만 재시작), 실제 핫키/자동시작 실기기 검증, Pause 키 매핑.

**다음 Phase 3**: 자체 사운드 팩(녹음 또는 합성) 2~3종 + 팩 빌더 CLI, 첫 실행 시 내장 팩 복사. 그 다음 Phase 4 배포(NSIS 인스톨러, 코드 서명 검토, Microsoft Store).

## 13. Phase 3 결과 (2026-09-02)

마이크 녹음 없이 진행해야 했으므로 **절차적 합성**으로 팩 3종을 만들고, 녹음이 생기면 바로 팩으로 만들 수 있는 **슬라이서**를 함께 만들었다.

| 산출물 | 내용 |
|---|---|
| `crates/packtool` | `synth <dir>` 내장 팩 생성 / `slice <녹음> <dir>` 온셋 검출로 GENERIC_R{n} 분리 / `assemble <dir> --name` config.json 작성 / `check <dir>` 엔진 로드 검증 |
| `packs/builtin/kc-clicky-blue` | 청축 모델: 클릭 트랜지언트 + 클릭바 핑 + 바텀아웃 + 케이스 썸프. 키업에 클릭바 리셋음 |
| `packs/builtin/kc-tactile-brown` | 갈축: 택타일 범프(중역 짧은 노이즈) + 바텀아웃 |
| `packs/builtin/kc-silent-red` | 저소음 적축: 클릭 없음, 3.2 kHz 로패스로 댐핑 |
| 키별 차별화 | 스페이스(피치 0.62·길게), 엔터, 백스페이스, 탭/캡스/시프트/컨트롤/알트/윈 별도 파일. 일반 키 변주 5종, 키업 변주 5종 |
| 첫 실행 설치 | Tauri 리소스로 번들 → `%APPDATA%/keyclack/packs`에 앱 버전당 1회 복사(`.builtin-version` 마커). 사용자가 지우면 다시 안 생김 |

합성 모델(`synth_pack.rs`): 키스트로크 = 클릭 트랜지언트(청축) / 택타일 범프(갈축) + 바텀아웃(노이즈 버스트 밴드패스 + 키캡 공진 3모드) + 케이스 저역 썸프. 라이선스 CC0.

슬라이서 검증: cherrymx-blue-abs의 스프라이트 원본(실제 녹음)에서 온셋 6개를 정확히 잘라냈다.

**청취 평가는 사용자가 해야 한다.** 합성음은 실제 녹음보다 "장난감 같다"고 느껴질 수 있다. 녹음 팩 제작 절차: 조용한 방에서 키 하나를 15회 누른 wav → `packtool slice rec.wav packs/my --max 8` → 스페이스·엔터·백스페이스도 각각 `--name SPACE --max 1` 등으로 → `packtool assemble packs/my --name "내 키보드"`.

**다음**: Phase 4 배포(NSIS 인스톨러는 `npm run tauri build`로 이미 가능, 코드 서명·MS Store MSIX 검토) 또는 안드로이드 A0.

## 14. Phase 3.5 — 사용자 요청 반영 (2026-09-02)

| 요청 | 구현 |
|---|---|
| 팩 더 많이 (도각도각·조약돌 등) | 합성 모델 9종: 청축·갈축·저소음 적축 + **Thock(도각도각)**·**Pebble(조약돌, 비화성 부분음)**·Marble(유리구슬)·Topre(러버돔 붕괴음)·Typewriter(타자바 링)·Bubble(사인 처프). `synth_pack.rs`의 `Model`에 partials/burst/damp/extra 필드로 일반화 |
| 즐겨찾기 | `AppConfig.favorites`. UI 별표 토글 + 즐겨찾기 먼저 정렬, 트레이 메뉴 상단 ★ 섹션 |
| 앱에서 미리듣기 | `preview_pack(id)`: 현재 팩을 바꾸지 않고 9키 타건 시퀀스(글자·스페이스·엔터·백스페이스) 재생. UI 각 팩 ▶ 버튼. 상태 바에 타이핑 테스트 칸(저장 안 함) |
| 트레이 우클릭 메뉴 | 음소거 / ★즐겨찾기 / 내장 합성음 / 사운드팩 서브메뉴(N개) / 설정 열기 / 팩 폴더 열기 / 시작 시 실행 체크 / 종료. UI 자동화로 실제 표시 검증 |

검증: 릴리스 빌드(`npm run tauri build`) → NSIS 설치 파일 + 단독 exe. UI 클릭으로 미리듣기 호출·팩 선택 저장 확인. 트레이 메뉴 캡처 확인.
