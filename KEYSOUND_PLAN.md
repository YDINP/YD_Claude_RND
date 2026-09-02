# KeyClack — 기계식 키보드 사운드 시뮬레이터 계획서

작성일: 2026-09-02
상태: **Phase 0 스파이크 완료 (2026-09-02)**. 훅·재생·지연 측정 동작 확인. 결과는 §10
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

`defines`의 키는 **PC/XT 스캔코드(set 1)** 이며 확장키는 `0xE000 | scancode`다 (예: Enter 28, Space 57, 오른쪽 Ctrl 0xE01D = 57373, 위 화살표 0xE048 = 57416). WH_KEYBOARD_LL이 주는 `scanCode`와 `LLKHF_EXTENDED` 플래그로 바로 만들 수 있어 변환 테이블이 필요 없다. 키보드 레이아웃(한/영, Dvorak)과 무관하게 물리 키 기준으로 동작한다.

자체 확장 (없으면 기본값으로 동작, 기존 팩과 호환 유지):

| 필드 | 의미 |
|---|---|
| `defines_up` | 키 뗄 때 소리. 청축·백축은 up 소리가 체감을 크게 좌우 |
| `variants` | 슬롯당 샘플 여러 개. 라운드로빈 + 랜덤 |
| `groups` | `space`, `enter`, `backspace`, `modifier`, `default` 그룹 폴백. 미정의 키는 그룹 소리로 |
| `pitch_jitter`, `gain_jitter` | 기본 0.02 / 0.1 |

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

### 5.4 UI (Tauri)
- 팩 목록 + 미리듣기, 마스터 볼륨, 키 up 소리 on/off, 제외 앱, 핫키, Windows 시작 시 실행, 지연 측정값 표시.
- 창을 닫으면 트레이로 내려감. 첫 실행에만 창을 띄움.

## 6. 개발 단계

| Phase | 내용 | 완료 기준 | 예상 |
|---|---|---|---|
| **0 스파이크** | `cli/`에서 훅 + wav 1개 재생. `latency-bench`로 지연 측정 | 지연 수치 확인, 15 ms 이하 달성 가능 판정 | 0.5일 |
| **1 코어 엔진** | 팩 파서(Mechvibes 2모드), 매퍼, 그룹 폴백, 리피트 억제, 믹서 변주(피치·게인), 프리디코드 | 커뮤니티 팩 3종 그대로 로드해 정상 재생. core 유닛 테스트 통과 | 2일 |
| **2 상주 앱** | Tauri 골격, 트레이, 설정 저장, 팩 전환, 볼륨, 음소거 핫키, 제외 앱, 자동 시작 | 하루 종일 켜 두고 일해도 크래시·훅 탈락 없음 | 2일 |
| **3 사운드 팩** | `pack-builder` CLI, 자체 팩 2~3종 (청축·갈축·저소음적축), 키 up 소리, 변주 | 팩 스키마 검증 통과, 실제 타건과 A/B 청취 | 2일 |
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
