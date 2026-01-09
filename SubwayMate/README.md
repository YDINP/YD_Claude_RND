# SubwayMate

수도권 지하철 실시간 위치 기반 도착 알림 서비스 Android 앱

## 요구사항

### 개발 환경
- **JDK**: 17 이상
- **Android SDK**: API 34 (Android 14)
- **Android Studio**: Koala (2024.1.1) 이상 권장
- **Kotlin**: 2.0.0
- **Gradle**: 8.5+

### 최소 지원 버전
- **minSdk**: 26 (Android 8.0 Oreo)
- **targetSdk**: 34 (Android 14)

## 프로젝트 설정

### 1. 저장소 클론
```bash
git clone <repository-url>
cd YD_Claude_RND/SubwayMate
```

### 2. local.properties 설정
```bash
# 템플릿 파일을 복사
cp local.properties.example local.properties
```

`local.properties` 파일을 열고 다음 값들을 설정:
```properties
# Android SDK 경로 (Android Studio에서 자동 설정됨)
sdk.dir=/path/to/android/sdk

# 서울 열린데이터광장 API 키 (필수)
SEOUL_API_KEY=your_actual_api_key
```

### 3. API 키 발급
1. [서울 열린데이터광장](https://data.seoul.go.kr/) 회원가입
2. 인증키 발급 신청
3. 발급받은 키를 `local.properties`의 `SEOUL_API_KEY`에 입력

## 빌드 명령어

### Debug 빌드
```bash
# Windows
gradlew.bat assembleDebug

# macOS/Linux
./gradlew assembleDebug
```

빌드 결과: `app/build/outputs/apk/debug/app-debug.apk`

### Release 빌드
```bash
# Windows
gradlew.bat assembleRelease

# macOS/Linux
./gradlew assembleRelease
```

빌드 결과: `app/build/outputs/apk/release/app-release.apk`

> **Note**: Release 빌드에는 signing 설정이 필요합니다.
> `local.properties`에 keystore 정보를 설정하세요.

### 전체 빌드 (Debug + Release)
```bash
./gradlew assemble
```

## 테스트 실행

### Unit 테스트
```bash
# 전체 Unit 테스트
./gradlew test

# Debug 빌드 테스트만
./gradlew testDebugUnitTest

# 특정 테스트 클래스 실행
./gradlew test --tests "com.ydinp.subwaymate.*"
```

### Instrumented 테스트 (에뮬레이터/실기기 필요)
```bash
# 전체 Instrumented 테스트
./gradlew connectedAndroidTest

# Debug 빌드 테스트만
./gradlew connectedDebugAndroidTest
```

## 코드 품질 검사

### Lint 검사
```bash
# 전체 Lint 검사
./gradlew lint

# Debug 빌드만
./gradlew lintDebug

# 리포트 생성
./gradlew lintReportDebug
```

Lint 결과: `app/build/reports/lint-results-debug.html`

### Kotlin Lint (ktlint)
```bash
# 검사만
./gradlew ktlintCheck

# 자동 수정
./gradlew ktlintFormat
```

## 프로젝트 구조

```
SubwayMate/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/ydinp/subwaymate/
│   │   │   │   ├── data/           # 데이터 레이어
│   │   │   │   │   ├── local/      # Room DB
│   │   │   │   │   ├── remote/     # Retrofit API
│   │   │   │   │   └── repository/ # Repository 구현
│   │   │   │   ├── di/             # Hilt 모듈
│   │   │   │   ├── domain/         # 도메인 레이어
│   │   │   │   │   ├── model/      # 도메인 모델
│   │   │   │   │   ├── repository/ # Repository 인터페이스
│   │   │   │   │   └── usecase/    # Use Cases
│   │   │   │   ├── notification/   # 알림 관련
│   │   │   │   ├── presentation/   # UI 레이어
│   │   │   │   │   ├── screen/     # Compose Screens
│   │   │   │   │   └── viewmodel/  # ViewModels
│   │   │   │   ├── service/        # Foreground Service
│   │   │   │   └── SubwayMateApp.kt
│   │   │   ├── res/                # 리소스
│   │   │   └── AndroidManifest.xml
│   │   ├── test/                   # Unit 테스트
│   │   └── androidTest/            # Instrumented 테스트
│   ├── build.gradle.kts
│   └── proguard-rules.pro
├── gradle/
│   └── libs.versions.toml          # 버전 카탈로그
├── build.gradle.kts                # 루트 빌드 파일
├── settings.gradle.kts
├── local.properties.example        # 설정 템플릿
└── README.md
```

## 기술 스택

- **Architecture**: MVVM + Clean Architecture
- **UI**: Jetpack Compose + Material 3
- **DI**: Hilt
- **Network**: Retrofit2 + OkHttp + Moshi
- **Database**: Room
- **Async**: Kotlin Coroutines + Flow
- **Background**: WorkManager + Foreground Service

## 트러블슈팅

### 빌드 오류 해결

**Gradle 캐시 문제**
```bash
./gradlew clean
./gradlew --refresh-dependencies
```

**Hilt 관련 오류**
```bash
./gradlew clean
./gradlew kspDebugKotlin
```

### API 키 오류
- `local.properties`에 `SEOUL_API_KEY`가 올바르게 설정되어 있는지 확인
- API 키에 특수문자가 있다면 이스케이프 처리

## 라이선스

This project is for educational and development purposes.
