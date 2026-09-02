# 기계식 키보드 타건음 재생 프로그램 경쟁 조사

조사일: 2026-09-02 (researcher 에이전트 조사, 팀리드 정리)

## 0. 핵심 결론

1. 시장은 이미 포화 상태로, 오픈소스(Mechvibes 계열)와 유료 앱스토어 앱(Klack/Klakk/TypeLouder/KeyBell 등)이 공존한다.
2. Mechvibes의 `config.json` 사운드팩 포맷이 사실상 업계 표준이 됐고, Rustyvibes·KeyEcho 등 후발주자가 이를 호환 지원한다. 이 포맷 호환이 채택률에 중요하다. → KeyClack은 Phase 1에서 이미 호환 완료.
3. 가장 흔한 두 가지 고질병은 (a) 전역 키보드 후킹으로 인한 백신/키로거 오탐, (b) Electron 기반 앱들의 리소스 낭비다.
4. Mechvibes 원본은 유지보수가 사실상 정체되어 MechvibesDX(Rust 재작성)로 후계 진행 중이고, Keyboard Sounds도 Pro 버전으로 이전 중이라 "활발히 유지되는 프로젝트"가 의외로 적다.
5. 차별화 여지는 지연시간 체감 최적화, 신뢰할 수 있는 서명/백신 오탐 대응, 앱별 프로필 자동 전환, 커뮤니티 사운드팩 큐레이션 품질, 크로스플랫폼(특히 Mac 네이티브) 완성도에 있다.

## 1. 오픈소스 데스크톱 앱

### Mechvibes
- **플랫폼:** Windows, macOS(Intel/Apple Silicon), Linux
- **기술 스택:** Electron + Node.js(iohook 네이티브 모듈)
- **오픈소스/라이선스:** 완전 오픈소스, MIT
- **가격:** 무료 (앱+사운드팩 전부)
- **사운드팩 포맷:** 자체 `config.json` 포맷. v1/v2 존재. `key_define_type`이 `single`(오디오 스프라이트 하나에 키별 재생 구간 타이밍 지정) 또는 `multi`(키마다 별도 파일)로 나뉨. 커뮤니티가 자유롭게 팩 제작·배포(mechvibes.com/soundpacks).
- **특징:** 커뮤니티 사운드팩 생태계가 가장 크고 사실상 업계 표준 포맷으로 자리잡음.
- **알려진 문제:** ① 전역 키보드 후킹 때문에 Avira 등 일부 백신이 키로거로 오탐(VirusTotal 자체는 0 detection). ② Electron 기반이라 리소스 소비가 큼. ③ 원본 저장소는 사실상 레거시화 선언, 후속 프로젝트 MechvibesDX로 이전 중.
- **GitHub 스타:** 약 2,300
- **출처:** [GitHub](https://github.com/hainguyents13/mechvibes), [공식 사이트](https://mechvibes.com), [키로거 오탐 이슈](https://github.com/hainguyents13/mechvibes/issues/196)

### MechvibesDX (Mechvibes 후속)
- **플랫폼:** Windows/Linux 정식, macOS는 실험적·미검증
- **기술 스택:** Rust + Dioxus, 오디오는 rodio, 입력 캡처는 rdev
- **라이선스:** MIT
- **특징:** 완전 재작성으로 지연시간 약 15ms 목표, 전용 오디오 엔진 스레드, 로드 시점 리샘플링, SHA-256 서명 원클릭 업데이트, 기존 v1 사운드팩 자동 호환 변환 지원.
- **GitHub 스타:** 약 292 (포크 24)
- **출처:** [GitHub](https://github.com/hainguyents13/mechvibes-dx)

### Rustyvibes
- **플랫폼:** 크로스플랫폼 (Rust CLI, 별도 GUI 포크 존재 `rustyvibes-gui`)
- **기술 스택:** Rust
- **오픈소스/라이선스:** 완전 오픈소스, MIT, 네트워크 통신 전혀 없음
- **가격:** 무료
- **사운드팩 포맷:** Mechvibes 사운드팩 직접 지원(호환성 이슈 있는 팩은 `packfixer-rustyvibes` 도구로 변환)
- **특징:** Electron 기반 Mechvibes 대비 리소스 효율이 10~100배라고 주장
- **GitHub 스타:** 약 260
- **출처:** [GitHub](https://github.com/KunalBagaria/rustyvibes)

### Keyboard Sounds (nathan-fiscaletti)
- **플랫폼:** Windows, Linux (CLI는 크로스플랫폼)
- **기술 스택:** Python CLI
- **라이선스:** GPL-3.0
- **가격:** 무료
- **사운드팩:** 내장 키보드 프로필 16개 + 마우스 프로필 1개, `.wav`/`.mp3` 지원, 프로필 에디터·앱별 규칙(application rules) 제공
- **알려진 문제:** 더 이상 활발히 개발되지 않음("no longer under active development"), 버그 수정만 진행. 후속작 Keyboard Sounds Pro로 개발 이전.
- **GitHub 스타:** 약 150
- **출처:** [GitHub](https://github.com/nathan-fiscaletti/keyboardsounds), [공식 사이트](https://keyboardsounds.net/)

### Keyboard Sounds Pro
- **기술 스택:** 데스크톱 앱(백엔드+프론트엔드), 상세 미확인
- **라이선스:** MIT, 오픈소스
- **가격:** 무료
- **사운드팩:** 내장 20개 프로필(키보드 13 + 마우스 7), `.wav`/`.mp3` 커스텀 프로필 에디터 지원
- **GitHub 스타:** 약 93
- **출처:** [GitHub](https://github.com/keyboard-sounds/keyboardsounds-pro)

### KeyEcho
- **플랫폼:** Windows(x64/ARM64), macOS(Intel/Apple Silicon), Linux(x64/ARM64)
- **기술 스택:** Tauri + Rust + Solid(프론트엔드), Vite
- **라이선스:** AGPL-3.0, 오픈소스
- **가격:** 무료(오픈소스 기능) + 프리미엄 사운드팩 "founding bundle" $9.99
- **특징:** 로컬 키 이벤트 처리로 저지연 강조, 계정/클라우드 동기화/타이핑 분석 없음(프라이버시 강조)
- **GitHub 스타:** 약 860
- **출처:** [GitHub](https://github.com/ZacharyL2/KeyEcho)

### Tickeys
- **플랫폼:** macOS(메인), Linux, Windows(비공식/부실 지원)
- **라이선스:** MIT, 오픈소스
- **가격:** 무료
- **특징:** Bubble, Typewriter, Mechanical, Sword 등 7가지 사운드 스킴 내장, 앱 화이트/블랙리스트 지원
- **알려진 문제:** 유지보수 정체 — 마지막 릴리즈가 0.5.0, Open Issue 50개에 병합 PR은 1개뿐. Windows 버전은 저자 사이트에서 `.rar`로만 배포(WinRAR 필요).
- **GitHub 스타:** 약 1,500
- **출처:** [GitHub](https://github.com/yingDev/Tickeys)

### MechaKeys
- **플랫폼:** Windows(데스크톱), macOS "Hopefully soon™"(미출시), Android 네이티브 버전도 별도 저장소 존재
- **기술 스택:** iohook(Node.js 전역 키/마우스 리스너) 기반으로 추정, 정확한 스택 비공개
- **오픈소스 여부:** 명시 안 됨 — 배포용 저장소(mechakeys-distro)만 공개, 독점 앱으로 추정
- **가격:** 앱 자체 무료, 유료 사운드팩·디지털 키캡 인앱 구매
- **특징:** 키 카테고리별 다른 소리, 다운스트로크/업스트로크 분리 재생, 계정 생성 시 키스트로크 카운트·리더보드, 무광고
- **출처:** [공식 사이트](https://mechakeys.robolab.io/), [GitHub](https://github.com/robolab-io/mechakeys-distro)

### Bucklespring
- **플랫폼:** Linux(Debian/Ubuntu/Arch/Fedora/Void), FreeBSD, macOS, Windows
- **기술 스택:** OpenAL + ALURE(3D 사운드 믹싱), libXtst
- **라이선스:** GPL-2.0, 오픈소스
- **가격:** 무료
- **특징:** IBM Model M 버클링 스프링 키보드 소리를 3D 공간감 있게 재현. ScrollLock 두 번으로 임시 음소거(비밀번호 입력 시 유용).
- **유지보수:** 활발 (이슈 30개, PR 11개)
- **GitHub 스타:** 약 1,600
- **출처:** [GitHub](https://github.com/zevv/bucklespring)

### Keysound (fgheng, Linux 전용) / VSCode 확장들
- Linux용 keysound 소프트웨어(fgheng/keysound), 별도로 VSCode 마켓플레이스에는 "vscode-keysound-extension"(otnansirk) 등 IDE 내 타건음 확장이 여러 개 존재 — 에디터 한정 틈새 시장.
- **출처:** [GitHub](https://github.com/fgheng/keysound), [GitHub](https://github.com/otnansirk/vscode-keysound-extension)

## 2. 유료/앱스토어 앱 (주로 macOS/Windows/iOS)

| 이름 | 플랫폼 | 가격 | 비고 |
|---|---|---|---|
| Klack | macOS (App Store) | $4.99 일회성 | 메뉴바 앱, 실제 스위치 녹음 사용. 2023년 출시 후 화제 |
| Klakk | macOS (App Store, tryklakk.com) | $4.99 | Klack과 이름·설명이 매우 유사한 별개 앱 — 브랜드 유사 SEO 클로닝 사례로 보임, 혼동 주의. 사운드팩 14개(7개 브랜드) |
| TypeLouder | macOS (App Store) | $2.99 | 저지연 강조, 키 입력 자체는 접근/기록하지 않는다고 명시 |
| KeyBell | macOS (App Store) | 무료+인앱 $6.99~$9.99 평생권 | 25개+ 프로필(기계식/타자기/전자음/재미/마우스), 앱별 설정, 헤드폰 전용 옵션 |
| MechanicalKeys / Mechanical Key Sounds | Windows (Microsoft Store) | $2.49 | EvlarSoft LLC 개발, 프리셋 토글 |
| Thocky | iPadOS (App Store) | 무료 | ASMR 지향, 실제 스위치 31종 녹음 |
| KeyClicker, KeySound 등 | macOS/iOS (App Store) | 각각 소액 유료/부분 유료 | 기능은 대동소이(프로필 여러 개, 백그라운드 재생) |
| FunKey | macOS | 확인 불가(사이트 접근 차단 403) | huntscreens.com에서 배포. "Hunter's Sound"라는 명칭은 검색으로 확인되지 않았고 가장 근접한 후보가 이것 |

## 3. 시장 요약

1. 오픈소스 진영(Mechvibes 계열)은 커뮤니티 사운드팩 생태계로 진입장벽을 낮췄지만 원본 프로젝트들의 유지보수가 정체되어 후계 프로젝트(MechvibesDX, Keyboard Sounds Pro)로 세대교체가 진행 중이다.
2. macOS 앱스토어 쪽은 $2.99~$4.99대 일회성 구매 또는 소액 인앱결제 모델이 표준이며, 이름이 서로 매우 비슷한 앱(Klack vs Klakk)이 공존해 브랜딩 혼선이 실제로 존재한다.
3. Windows 전용 독점 앱(MechaKeys, MechanicalKeys)은 무료+인앱구매 모델로 게임화(리더보드, 키캡 수집) 요소를 추가해 차별화를 시도하는 중이다.

## 4. 사운드팩 포맷과 호환 가치

Mechvibes의 `config.json`(v1/v2, `single`/`multi` 정의 방식)이 사실상 업계 표준으로 자리잡았다. Rustyvibes는 이를 직접 지원하고, KeyEcho·MechvibesDX 등 후발주자도 기존 v1 팩과의 호환을 명시적으로 강조한다. 새 프로젝트가 이 포맷과 호환되면 mechvibes.com에 이미 축적된 방대한 무료 커뮤니티 사운드팩 라이브러리를 그대로 흡수할 수 있어, 초기 콘텐츠 확보 비용을 크게 줄일 수 있다.

## 5. 아직 아무도 잘 못하는 것 (차별화 여지)

1. **백신/보안 신뢰 문제 해결** — 전역 키보드 후킹형 앱 대부분이 키로거로 오탐되는 구조적 문제를 정면으로 해결(코드 서명, 백신사 화이트리스트 등록, 오탐 대응 문서화)한 사례가 드물다.
2. **진짜 저지연 + 경량 조합** — Electron 기반은 무겁고, 가벼운 Rust/Tauri 기반은 아직 생태계·사운드팩 다양성이 부족해 "가볍고 팩도 풍부한" 조합이 비어 있다.
3. **크로스플랫폼 동등 품질** — 대부분 한 플랫폼(Windows 또는 macOS) 위주로 개발되고 타 플랫폼은 실험적/비공식 수준(MechvibesDX의 macOS, MechaKeys의 macOS 등)이라 진짜 멀티플랫폼 1급 지원이 드물다.
4. **앱별/컨텍스트별 지능적 프로필 전환** — 일부(Keyboard Sounds의 application rules)만 앱별 규칙을 지원하고, 화상회의 자동 음소거·게임 자동 전환 같은 스마트 컨텍스트 인식은 거의 없다.
5. **사운드팩 품질 큐레이션/검증** — 커뮤니티 팩 수는 많지만 품질 검증, 저작권(실제 스위치 녹음 라이선스) 명확화, 팩 미리듣기 UX가 표준화되어 있지 않다.

## 6. KeyClack에 대한 시사점 (팀리드 메모)

- 가장 직접적인 경쟁자는 **KeyEcho**(Tauri+Rust, 스타 860, AGPL)와 **MechvibesDX**(Rust+Dioxus, 15 ms 목표). KeyClack의 스택 선택(Tauri+Rust, 자체 WASAPI)은 이 둘과 같은 방향이며 이미 15 ms 안팎을 측정했다.
- 포맷 호환은 이미 끝났으므로, 차별화 5개 중 즉시 착수 가능한 것은 **(1) 백신 신뢰**(오픈소스 + 키 값 미저장 코드 증명 + 코드 서명)와 **(4) 컨텍스트 자동 전환**(Phase 2의 제외 앱을 "앱별 프로필"로 확장).
- 수익화 참고: 앱 무료 + 프리미엄 팩($9.99, KeyEcho) 또는 일회성 $2.99~4.99(맥 앱스토어).

## 7. 참고 자료

- [Mechvibes GitHub](https://github.com/hainguyents13/mechvibes)
- [Mechvibes 공식 사이트](https://mechvibes.com)
- [Mechvibes 키로거 오탐 이슈](https://github.com/hainguyents13/mechvibes/issues/196)
- [MechvibesDX GitHub](https://github.com/hainguyents13/mechvibes-dx)
- [Rustyvibes GitHub](https://github.com/KunalBagaria/rustyvibes)
- [Keyboard Sounds GitHub](https://github.com/nathan-fiscaletti/keyboardsounds)
- [Keyboard Sounds 공식 사이트](https://keyboardsounds.net/)
- [Keyboard Sounds Pro GitHub](https://github.com/keyboard-sounds/keyboardsounds-pro)
- [KeyEcho GitHub](https://github.com/ZacharyL2/KeyEcho)
- [Tickeys GitHub](https://github.com/yingDev/Tickeys)
- [MechaKeys 공식 사이트](https://mechakeys.robolab.io/)
- [MechaKeys 배포 저장소](https://github.com/robolab-io/mechakeys-distro)
- [Bucklespring GitHub](https://github.com/zevv/bucklespring)
- [Keysound(Linux) GitHub](https://github.com/fgheng/keysound)
- [VSCode Keysound 확장](https://github.com/otnansirk/vscode-keysound-extension)
- [Klack App Store](https://apps.apple.com/us/app/klack/id6446206067)
- [Klack 소개 기사 (9to5Mac)](https://9to5mac.com/2023/04/05/klack-app-mechanical-keyboard-sound-effects-for-mac/)
- [Klakk App Store](https://apps.apple.com/us/app/klakk-keyboard-sounds/id6754638652)
- [Klakk 공식 블로그](https://tryklakk.com/en/blog/)
- [TypeLouder App Store](https://apps.apple.com/us/app/typelouder-keyboard-sound/id6756606901)
- [KeyBell App Store](https://apps.apple.com/us/app/keybell-mechanical-keyboard/id1530838633)
- [MechanicalKeys (Microsoft Store)](https://apps.microsoft.com/detail/9nnmm0x52zwc)
- [Thocky App Store](https://apps.apple.com/us/app/thocky-keyboard-sounds/id6788026754)
- [FunKey (Hunt Screens)](https://huntscreens.com/products/funkey-30) (접근 제한으로 상세 미확인)
