# KeyClack Android — 기획서

작성일: 2026-09-02
상태: 기획. 구현 전
목표: APK 설치 → 백그라운드 상주 → 어떤 앱에서든 키보드 입력이 있으면 타건음 재생

## 0. 먼저 알아야 할 제약 (이게 설계를 결정한다)

Android에는 **Windows의 전역 키 훅에 해당하는 것이 없다.** 앱은 자기 화면 밖의 터치·키 입력을 볼 수 없고, 소프트 키보드(Gboard, 삼성 키보드)의 키 터치는 그 키보드 앱만 안다. 그래서 "백그라운드에서 키 입력을 받는" 방법은 셋뿐이다.

| 방법 | 무엇을 받나 | 장점 | 단점 |
|---|---|---|---|
| **A. 접근성 서비스** (`AccessibilityService`) | 모든 앱의 **텍스트 변경 이벤트**(글자가 늘고 줄었다) + **하드웨어 키보드** 키 이벤트 | 어떤 키보드를 쓰든 동작. 사용자는 설정에서 스위치 하나만 켬 | 텍스트 내용이 앱에 노출되는 권한 = 키로거와 같은 모양. Play 스토어는 접근성 API를 "접근성 목적"이 아니면 거절하는 경우가 많음. 소프트 키보드에서는 어떤 키인지 모르고 "글자가 하나 늘었다"만 앎 |
| **B. 자체 키보드** (`InputMethodService`) | 자기 키보드의 모든 키 터치 (키 종류·누름·뗌 전부) | Play 스토어 정책 문제 없음. 키별 소리·키업·지연 모두 최상 | 사용자가 키보드를 **바꿔야** 한다. 한글 입력·자동완성·스와이프 등 키보드 자체 품질이 곧 앱 품질. 만들 게 많음 |
| **C. 하드웨어 키보드 전용** (A의 부분집합, `FLAG_REQUEST_FILTER_KEY_EVENTS`) | 블루투스/USB 키보드의 키다운·키업 + 스캔코드 | 태블릿 + 외장 키보드 사용자에게는 Windows 판과 동일한 품질 | 폰 소프트 키보드에는 무용 |

**결정**

- **APK 직접 배포판(사용자가 요청한 형태) = A + C.** 접근성 서비스 하나로 소프트 키보드(텍스트 변경)와 하드웨어 키보드(키 이벤트)를 모두 받는다. 사이드로드에는 스토어 정책이 적용되지 않는다.
- **Play 스토어판(나중) = B.** 자체 키보드로 간다. 이건 별도 프로젝트 규모이므로 1차 범위 밖.
- 두 판 모두 **Rust 코어를 공유**한다. `keyclack-core`는 OS 의존이 없으므로 `cargo-ndk`로 `.so`를 만들고 JNI로 붙인다. 팩 포맷·믹서·변주 로직을 다시 쓰지 않는다.

## 1. 사용자 경험

1. APK 설치 → 앱 실행 → 온보딩 3장: (1) 무엇을 하는 앱인지, (2) "접근성 서비스를 켜 주세요" (왜 필요한지 + 키 내용을 저장·전송하지 않는다는 약속 + 소스 공개 링크), (3) 배터리 최적화 제외 안내(선택).
2. 설정 화면(Windows판과 같은 구성): 팩 선택·볼륨·키업·앱별 규칙·회의 자동 음소거(마이크 사용 감지)·진동 옵션.
3. 상주 중에는 **포그라운드 서비스 알림** 한 줄("KeyClack 켜짐 · 청축 · 탭하면 음소거"). Android는 백그라운드 상주에 이 알림을 요구한다.
4. 빠른 설정 타일(Quick Settings Tile)로 음소거 토글.

## 2. 아키텍처

```
접근성 서비스 (KeyclackAccessibilityService)
 ├─ onAccessibilityEvent(TYPE_VIEW_TEXT_CHANGED)   소프트 키보드: 길이 증감 → 슬롯 추정
 ├─ onKeyEvent(KeyEvent)                            하드웨어 키보드: scanCode·action → 정확한 슬롯
 └─ 포그라운드 앱 패키지명 (TYPE_WINDOW_STATE_CHANGED) → 앱별 규칙
            │  (슬롯, down/up, 타임스탬프)  — 텍스트 내용은 여기서 버린다
            ▼
      Rust 코어 (.so, JNI)   keyclack-core: 팩 로드·매퍼·변주·믹서
            │  f32 PCM
            ▼
      Oboe (AAudio, 저지연 모드)  — 콜백 스레드에서 mixer.render()
```

- **텍스트 변경 → 슬롯 추정**: 길이 +1 = 일반 키(알파벳 줄 랜덤 슬롯), 길이 −1 = Backspace(14), 마지막 글자가 공백 = Space(57), 줄바꿈 = Enter(28). 어떤 글자인지는 슬롯 결정 직후 폐기하고, 절대 로그·저장하지 않는다.
- **하드웨어 키 → 슬롯**: `KeyEvent.getScanCode()`는 Linux evdev 코드다. 메인 블록(문자·숫자·Enter 28·Space 57·Backspace 14)은 PC/XT set-1 스캔코드와 같고, 오른쪽 Ctrl(97)·화살표(103/105/106/108) 등 일부만 변환 테이블이 필요하다. `keycode.rs`에 `evdev → uiohook` 함수 하나 추가.
- **키업**: 소프트 키보드 경로에는 키업 이벤트가 없다. 다운 소리 뒤 60~90 ms에 키업 소리를 자동 재생(설정으로 끔). 하드웨어 경로는 실제 ACTION_UP 사용.
- **지연**: Oboe 저지연 모드로 보통 10~20 ms. 접근성 이벤트 자체가 IME 처리 뒤에 오므로 소프트 키보드 경로는 +10~30 ms가 더 붙는다. 하드웨어 경로는 Windows판과 비슷.

## 3. 프로젝트 구조 (제안)

```
keyclack/
├── crates/core/                 # 그대로 공유
├── crates/ffi-android/          # #[no_mangle] extern "C" JNI: pack_load, on_key, render (cargo-ndk → .so)
└── apps/android/                # Kotlin, Gradle
    ├── app/src/main/java/io/keyclack/
    │   ├── KeyclackAccessibilityService.kt   # 이벤트 수신 → 슬롯 → JNI
    │   ├── AudioEngine.kt                    # Oboe 스트림, 콜백에서 JNI render
    │   ├── ForegroundService.kt              # 상주 알림, 음소거 액션
    │   ├── MicMonitor.kt                     # AudioManager.getActiveRecordingConfigurations() → 회의 감지
    │   ├── QuickTile.kt                      # 빠른 설정 타일
    │   └── ui/                               # Compose 설정 화면 (Windows판 IPC.md의 AppConfig와 같은 필드)
    ├── app/src/main/res/xml/accessibility_service_config.xml
    └── app/src/main/assets/packs/            # 내장 팩 3종 (Windows판과 같은 파일)
```

## 4. 회의 자동 음소거 (Android 판)

`AudioManager.getActiveRecordingConfigurations()`로 마이크를 쓰는 앱을 알 수 있다 (Android 7+). Windows판의 레지스트리 방식과 동일한 의미. `meeting_ignore`도 그대로 (패키지명 기준).

## 5. 단계

| Phase | 내용 | 완료 기준 | 예상 |
|---|---|---|---|
| A0 | `crates/ffi-android` + cargo-ndk 빌드, Oboe로 합성 클릭음 재생하는 최소 앱 | 폰에서 버튼 누르면 소리 남, 지연 체감 | 1일 |
| A1 | 접근성 서비스: 텍스트 변경·하드웨어 키 → 소리. 포그라운드 서비스·알림 | 다른 앱에서 타이핑하면 소리 남 | 1.5일 |
| A2 | 설정 UI(Compose), 팩 로드(assets + 사용자 폴더), 앱별 규칙, 회의 감지, 빠른 설정 타일 | Windows판과 기능 동등 | 2일 |
| A3 | 온보딩·권한 안내·배터리 최적화 제외·APK 서명·GitHub 릴리스 | 새 폰에 APK 설치 후 3분 안에 동작 | 1일 |
| A4 (선택) | Play 스토어용 자체 키보드(IME) | 별도 기획 | — |

## 6. 리스크

| 리스크 | 대응 |
|---|---|
| 접근성 서비스 = 텍스트 노출 권한. 사용자 불신 | 소스 공개, 온보딩에서 "글자는 슬롯 결정 직후 버림"을 코드 위치와 함께 명시, 네트워크 권한 자체를 매니페스트에서 제외 |
| 제조사 배터리 최적화가 서비스를 죽임 (삼성·샤오미) | 포그라운드 서비스 + 배터리 최적화 제외 안내. 죽으면 알림으로 재시작 유도 |
| 비밀번호 필드 | 접근성 이벤트에 `isPassword`가 있으면 슬롯만 랜덤 재생하고 길이 판단조차 하지 않음 |
| 소프트 키보드 지연 체감 | 하드웨어 키보드 경로를 먼저 완성해 "태블릿 + 외장 키보드"를 1차 타깃으로 잡음 |
| Play 스토어 거절 | 1차는 APK 배포로 한정. 스토어는 IME판으로 |

## 7. Windows "앱 프로세스 버전"에 대해

Windows판은 이미 상주 프로세스(트레이 앱)다. 남은 것은 Phase 4 배포: NSIS 인스톨러(현재 `tauri build`로 생성 가능), 코드 서명, Microsoft Store용 MSIX 패키징. 이 세 가지는 KEYSOUND_PLAN.md의 Phase 4에서 다룬다.
