# 에이전트 전문 지식 강화 계획

> 생성일: 2026-02-23
> 대상: `.claude/agents/` 에이전트 11개
> 실행 방법: 이 문서를 참조하여 `/pt` 명령으로 실제 강화 실행
> 주의: 이 문서는 계획서입니다. agents/*.md 파일을 직접 수정하지 않습니다.

---

## 0. 개요

### 기준 버전 (모든 강화 항목에 적용)

| 라이브러리 / 플랫폼 | 최소 버전 | 비고 |
|-------------------|---------|------|
| Kotlin | 1.9+ | K2 컴파일러 호환성 필수 |
| Android API | 33+ (Target) | minSdk 24 유지 |
| Jetpack Compose | 1.5+ | BOM 관리 권장 |
| Kotlin Coroutines | 1.7+ | `runTest`, `TestCoroutineScheduler` 사용 |
| Hilt | 2.50+ | `@HiltViewModel` 표준 사용 |
| MockK | 1.13+ | `mockk<T>()`, `coEvery`, `coVerify` 사용 |
| Turbine | 1.0+ | Flow 테스트 전용 (`turbine {}`) |
| Room | 2.6+ | KSP 기반 어노테이션 처리 |
| Retrofit2 | 2.9+ | OkHttp 4.x와 쌍 사용 |
| OkHttp | 4.x | `mockwebserver` 포함 |
| Gradle | 8.x | `libs.versions.toml` (Version Catalog) 필수 |
| AGP (Android Gradle Plugin) | 8.x | Gradle 8.x 대응 |
| Detekt | 1.23+ | 정적 분석 lint 대체 |
| Python | 3.10+ | scientist 전용 |
| scipy | 1.11+ | scientist 전용 |
| matplotlib | 3.7+ | scientist 전용 |

### 실행 전략 (LAYERED 병렬 실행)

```
P1 (동시 실행 가능):
  executor.md / build-fixer.md / qa-tester.md / code-reviewer.md / scientist.md

P2 (P1 완료 확인 후 동시 실행):
  architect.md / planner.md / security.md / researcher.md / writer.md

P3 (선택적 — P2 결과 검토 후 결정):
  explorer.md

P4 (선택적 — 마케팅·콘텐츠·디자인 품질 강화):
  designer.md / writer.md / planner.md / researcher.md
  + copywriter.md (신규 에이전트 생성)

P5 (선택적 — Android 인프라 & 클라이언트 통합 강화):
  api-designer.md / vision.md / db-expert.md / devops.md / localizer.md

P6 (선택적 — 분석 지능 강화: 의사결정 품질 + 데이터 수집 전문화):
  data-scout.md / reasoner.md / performance.md / git-historian.md / cost-analyzer.md
```

### 방어 원칙 요약

| 우선순위 | 원칙 | 내용 |
|--------|------|------|
| [HIGH] | Deprecated API 삽입 방지 | `researcher` 선행 조사 의무 + 버전 레이블 `[v{버전}+]` 필수 |
| [HIGH] | 소유 파일 중복 방지 | 에이전트별 독점 섹션 정의 + 타 에이전트는 `→ {담당}.md 위임` 참조만 허용 |
| [HIGH] | 역할 경계 침범 방지 | 타 도메인 직접 기술 금지, SSOT 에이전트에 위임 명시 |

---

## 1. P1 에이전트 강화 계획

### 1.1 executor.md

**현재 상태:** 114줄
**목표 변경량:** +85~105줄 (목표 199~219줄) / 코드 예시 5~7개

#### 강화 내용 테이블

| ID | 강화 항목 | 추가 내용 요약 | 방어 로직 | 코드 예시 |
|----|---------|-------------|---------|---------|
| E-1 | Kotlin Coroutines 패턴 | `viewModelScope`, `launchIn`, `catch` operator 사용법. `GlobalScope` 금지 명시 | `[v1.7+]` 레이블 | `viewModelScope.launch { ... }` |
| E-2 | Hilt 의존성 주입 패턴 | `@HiltViewModel`, `@Inject constructor`, 스코프(`@Singleton`, `@ViewModelScoped`) 선택 기준 | 스코프 선택은 E-5에서 전담 | `@HiltViewModel class VM @Inject constructor(...)` |
| E-3 | Compose 상태 관리 | `remember`, `rememberSaveable`, `collectAsStateWithLifecycle` 구분. `by` 위임 패턴 | Recomposition 이슈 → code-reviewer.md (R-2) 위임 | `val uiState by viewModel.uiState.collectAsStateWithLifecycle()` |
| E-4 | Room DAO 구현 패턴 | `@Query`, `@Insert(onConflict = REPLACE)`, Flow 반환 타입 | DB 스키마 설계는 db-expert 위임 | `@Query("SELECT * FROM alarm WHERE ...") fun getAlarms(): Flow<List<AlarmEntity>>` |
| E-5 | Hilt 스코프 구현 패턴 예시 | `@Singleton` vs `@ViewModelScoped` vs `@ActivityScoped` 구현 코드 예시만 포함 | 스코프 선택 기준 SSOT는 `architect.md` — `→ architect.md 참조` 위임 참조만 | 구현 예시 코드 형식 |

#### DoD 체크리스트 (executor.md 강화 완료 기준)

- [x] E-1~E-5 항목 모두 섹션으로 추가됨
- [x] 각 코드 예시가 Kotlin 1.9+ / Coroutines 1.7+ 문법 준수
- [x] `GlobalScope`, `runBlocking` (프로덕션) 금지 명시됨
- [x] Hilt 스코프 선택 기준은 architect.md A-4 위임 참조 삽입됨
- [x] 방어 로직 레이블(`[v{버전}+]`) 모든 코드 예시에 적용됨
- [x] 기존 114줄 내용 손상 없음

---

### 1.2 build-fixer.md

**현재 상태:** 109줄
**목표 변경량:** +90~110줄 (목표 199~219줄) / 코드 예시 5~6개

#### 강화 내용 테이블

| ID | 강화 항목 | 추가 내용 요약 | 방어 로직 | 코드 예시 |
|----|---------|-------------|---------|---------|
| B-1 | AGP 8.x 마이그레이션 오류 | `namespace` 이동, `buildFeatures { viewBinding }` 방식 변경, `PackagingOptions` → `packaging` 블록 전환 | `[AGP 8.x+]` 레이블 | `android { namespace = "com.example" }` |
| B-2 | Version Catalog 충돌 해결 | `libs.versions.toml` 내 버전 충돌 진단 패턴. `./gradlew dependencies --configuration` 활용법 | `[Gradle 8.x+]` 레이블 | `./gradlew app:dependencies --configuration releaseRuntimeClasspath` |
| B-3 | KSP vs KAPT 충돌 | Room + Hilt + Compose 동시 사용 시 KSP 전환 가이드. `kapt` → `ksp` 마이그레이션 체크리스트 | KSP 버전은 researcher 선행 조사 후 적용 | `ksp("com.google.dagger:hilt-compiler:...")` |
| B-4 | Compose 컴파일러 버전 불일치 | Kotlin 버전 ↔ Compose Compiler 버전 매핑 표. `Compose BOM` 활용으로 버전 자동 맞춤 | `[Compose 1.5+]` 레이블 | `implementation(platform("androidx.compose:compose-bom:..."))` |
| B-5 | ProGuard/R8 빌드 실패 | `-keep` 규칙 누락으로 인한 Release 빌드 실패 패턴. Hilt, Retrofit, Room 각 필수 규칙 포함 | CI/CD 파이프라인 수정은 devops 위임 | `proguard-rules.pro` 섹션별 필수 룰 |

#### DoD 체크리스트 (build-fixer.md 강화 완료 기준)

- [x] B-1~B-5 항목 모두 섹션으로 추가됨
- [x] AGP 8.x 오류 패턴 표가 기존 "오류 유형별 접근" 섹션과 통합됨
- [x] `./gradlew dependencies` 활용 커맨드 실제 실행 예시 포함
- [x] Kotlin ↔ Compose Compiler 버전 매핑 표 최신 기준 반영 (`[v{버전}+]` 레이블)
- [x] 기존 109줄 내용 손상 없음

---

### 1.3 qa-tester.md

**현재 상태:** 134줄
**목표 변경량:** +100~120줄 (목표 234~254줄) / 코드 예시 6~8개

#### 강화 내용 테이블

| ID | 강화 항목 | 추가 내용 요약 | 방어 로직 | 코드 예시 |
|----|---------|-------------|---------|---------|
| Q-1 | MockK 고급 패턴 | `coEvery`, `coVerify`, `slot<T>()`, `every { ... } returns ...` 체이닝. **Q-1 전담 소유** | `[MockK 1.13+]` 레이블, executor.md에서는 위임 참조만 | `coEvery { repo.getData() } returns Result.success(data)` |
| Q-2 | Turbine Flow 테스트 | `turbine {}`, `awaitItem()`, `awaitComplete()`, `cancelAndIgnoreRemainingEvents()` 사용법 | `[Turbine 1.0+]` 레이블 | `viewModel.uiState.test { val item = awaitItem() ... }` |
| Q-3 | Hilt 테스트 환경 | `@HiltAndroidTest`, `@UninstallModules`, `@BindValue`, `HiltAndroidRule` 설정 패턴 | `[Hilt 2.50+]` 레이블 | `@HiltAndroidTest class MyTest { @get:Rule val hiltRule = HiltAndroidRule(this) }` |
| Q-4 | TestCoroutineScheduler | `TestCoroutineScheduler`, `StandardTestDispatcher`, `advanceUntilIdle()`, `runTest {}` 완전 대체 | `runBlockingTest` deprecated → `runTest` 사용 명시 | `@Test fun test() = runTest { advanceUntilIdle() ... }` |
| Q-5 | A/B 테스트 설계 위임 | A/B 테스트 설계 판단은 scientist.md (S-4) 위임, qa-tester는 A/B 결과 검증만 담당 | **역할 경계 명시** — A/B 설계는 scientist 전담 | 위임 참조 메시지 패턴 |

#### DoD 체크리스트 (qa-tester.md 강화 완료 기준)

- [x] Q-1~Q-5 항목 모두 섹션으로 추가됨
- [x] MockK 예시가 `coEvery`/`coVerify` Coroutine 패턴 포함 (`[MockK 1.13+]`)
- [x] Turbine 예시가 `test {}` 블록 형식으로 작성됨 (`[Turbine 1.0+]`)
- [x] `runBlockingTest` deprecated 경고 및 `runTest` 대체 명시됨
- [x] A/B 테스트 설계 → scientist.md 위임 참조 추가됨
- [x] 기존 134줄 내용 손상 없음 (기존 Flaky Test 방지 규칙 유지)
- [x] 기존 Flaky Test 방지 규칙 내 runBlockingTest() → advanceUntilIdle() 대체 명시됨

---

### 1.4 code-reviewer.md

**현재 상태:** 138줄
**목표 변경량:** +100~120줄 (목표 238~258줄)

#### 강화 내용 테이블

| ID | 강화 항목 | 추가 내용 요약 | 방어 로직 | 코드 예시 |
|----|---------|-------------|---------|---------|
| R-1 | Kotlin 코루틴 안티패턴 탐지 | `GlobalScope` 사용, `runBlocking` 메인스레드 사용, `launch { }` 내 예외 미처리, `async` 반환값 미사용(fire-and-forget) 패턴 | `[Coroutines 1.7+]` 레이블 | 코드 리뷰 전용 — 수정은 executor 위임 |
| R-2 | Compose Recomposition 이슈 탐지 | 불필요한 람다 참조로 인한 과도 리컴포지션, `remember` 누락, `derivedStateOf` 미사용 패턴. **R-2 전담 소유** | executor.md, qa-tester.md에서는 위임 참조만 | 성능 프로파일링 판정은 performance 위임 |
| R-3 | Detekt 정적 분석 연계 | 리뷰 전 `./gradlew detekt` 실행 권장. Detekt 규칙 위반 목록을 [HIGH]/[MEDIUM]에 자동 매핑하는 판단 기준 | `[Detekt 1.23+]` 레이블 | CI 연동 여부는 devops 위임 |
| R-4 | MVVM 레이어 경계 위반 탐지 | ViewModel에 `Context` 직접 참조, Repository에 UI 로직, `Activity`에서 DB 직접 접근 패턴 탐지. MVVM 경계 위반 판정 → architect.md (A-1) 위임 참조 | **역할 경계 명시** — MVVM 레이어 설계는 architect 전담 | 탐지만 수행, 재설계는 architect |

#### DoD 체크리스트 (code-reviewer.md 강화 완료 기준)

- [x] R-1~R-4 항목 모두 섹션으로 추가됨
- [x] Kotlin 코루틴 안티패턴 목록이 [HIGH] 카테고리에 통합됨
- [x] Compose Recomposition 이슈가 [MEDIUM] 카테고리에 통합됨
- [x] Detekt 연계 섹션에 실행 커맨드 포함됨
- [x] MVVM 레이어 경계 위반 → architect.md 위임 참조 명시됨
- [x] 기존 138줄 내용 손상 없음 (기존 [CRITICAL]/[HIGH]/[MEDIUM]/[LOW] 구조 유지)

---

### 1.5 scientist.md

**현재 상태:** 119줄
**목표 변경량:** +90~110줄 (목표 209~229줄) / 코드 예시 5~6개

#### 강화 내용 테이블

| ID | 강화 항목 | 추가 내용 요약 | 방어 로직 | 코드 예시 |
|----|---------|-------------|---------|---------|
| S-1 | 앱 성능 지표 분석 | Baseline Profile, Macrobenchmark 결과 CSV 분석. 스타트업 시간, 프레임 드롭 통계 | `[Python 3.10+ / scipy 1.11+]` 레이블 | `df['startup_ms'].describe()` |
| S-2 | 가설 검정 자동화 | t-test, Mann-Whitney U-test, Chi-square test 적용 결정 트리. p-value 해석 기준 명시 | 통계 근거 없는 주장 금지 원칙 강화 | `scipy.stats.ttest_ind(group_a, group_b)` |
| S-3 | 데이터 시각화 위임 | UI 포함 시각화(`matplotlib`, `seaborn` 고급 커스텀)는 designer 위임. `scientist`는 데이터 검증 및 로직만 담당 | **역할 경계 명시** — 데이터 시각화 UI는 designer 전담 | 위임 참조 메시지 패턴 |
| S-4 | A/B 테스트 설계 | 샘플 크기 계산 (`power analysis`), 무작위 배정 방법, 결과 해석 기준. **S-4 전담 소유** | qa-tester.md에서는 위임 참조만 허용 | `from scipy.stats import norm; n = norm.ppf(...)` |

#### DoD 체크리스트 (scientist.md 강화 완료 기준)

- [x] S-1~S-4 항목 모두 섹션으로 추가됨
- [x] A/B 테스트 설계 섹션에 power analysis 공식 포함 (`[scipy 1.11+]`)
- [x] 데이터 시각화 UI → designer 위임 참조 명시됨
- [x] 가설 검정 결정 트리 표 형식으로 추가됨
- [x] 기존 119줄 내용 손상 없음 (기존 분석 마커 시스템 유지)

---

## 2. P2 에이전트 강화 계획

### 2.1 architect.md

**현재 상태:** 136줄
**목표 변경량:** +80~100줄 (목표 216~236줄)

#### 강화 내용 테이블

| ID | 강화 항목 | 추가 내용 요약 | 방어 로직 | 비고 |
|----|---------|-------------|---------|-----|
| A-1 | MVVM 레이어 경계 기준 정의 | ViewModel, Repository, UseCase, DataSource 각 레이어의 허용/금지 의존성 규칙 테이블. **A-1 전담 소유** | code-reviewer.md는 탐지만, 설계는 architect 전담 | MVVM 설계 변경 시 이 섹션 참조 필수 |
| A-2 | Clean Architecture 적용 기준 | UseCase 도입 여부 결정 기준 (복잡도 기반). 오버엔지니어링 경계 명시 | 구현은 executor 위임 원칙 재강조 | 간단한 앱에서 UseCase 미도입 허용 |
| A-3 | 성능 병목 진단 프로세스 | Compose 렌더링 병목, DB 쿼리 N+1, Room DAO `List<T>` vs `Flow<List<T>>` 트레이드오프 | 성능 프로파일링 측정은 performance SSOT 위임 | 진단만 수행, 측정 도구는 위임 |
| A-4 | Hilt 스코프 선택 기준 | `@Singleton` vs `@ViewModelScoped` vs `@ActivityScoped` 결정 트리. **A-4 전담 소유** | executor.md에는 구현 패턴 예시만 허용, 선택 기준 중복 기술 금지 | 결정 트리 표 형식 |

#### DoD 체크리스트 (architect.md 강화 완료 기준)

- [x] A-1~A-4 항목 모두 섹션으로 추가됨
- [x] MVVM 레이어 경계 테이블이 레이어별 허용/금지 컬럼으로 구성됨
- [x] Hilt 스코프 선택 기준 결정 트리가 A-4 섹션으로 추가됨 (SSOT 전담)
- [x] 기존 136줄 내용 손상 없음 (기존 SOLID 원칙 체크리스트 유지)

---

### 2.2 planner.md

**현재 상태:** 108줄
**목표 변경량:** +70~90줄 (목표 178~198줄)

#### 강화 내용 테이블

| ID | 강화 항목 | 추가 내용 요약 | 방어 로직 | 비고 |
|----|---------|-------------|---------|-----|
| PL-1 | Android 기능 개발 계획 템플릿 | 지하철 앱 예시 기반 계획 템플릿. API 통합, DB 스키마, UI 화면 단계별 분리 계획 | 구현 세부 기술 금지 원칙 재강조 | 계획에 기술 선택 이유 포함 허용 |
| PL-2 | 의존성 충돌 사전 감지 | 계획 수립 시 라이브러리 버전 충돌 가능성 사전 체크 항목. `researcher` 선행 조사 의무화 | researcher 선행 조사 연동 명시 | 버전 확정은 researcher에게 위임 |
| PL-3 | 마이그레이션 계획 체크리스트 | KAPT→KSP, Room 버전업, AGP 업그레이드 시 단계별 체크리스트 | `[AGP 8.x+ / Gradle 8.x+]` 레이블 | 실제 마이그레이션은 executor/build-fixer |

#### DoD 체크리스트 (planner.md 강화 완료 기준)

- [x] PL-1~PL-3 항목 모두 섹션으로 추가됨
- [x] Android 기능 개발 계획 템플릿이 `## 실행 계획` 섹션 아래 예시로 포함됨
- [x] `[NEEDS CLARIFICATION]` 플래그 기준에 버전/라이브러리 항목 추가됨
- [x] 기존 108줄 내용 손상 없음

---

### 2.3 security.md

**현재 상태:** 158줄
**목표 변경량:** +80~100줄 (목표 238~258줄)

#### 강화 내용 테이블

| ID | 강화 항목 | 추가 내용 요약 | 방어 로직 | 비고 |
|----|---------|-------------|---------|-----|
| SE-1 | Android Keystore 올바른 사용 | `AndroidKeyStore`, `KeyGenerator`, `Cipher` 올바른 구현 패턴. **SE-1 전담 소유** | architect.md, executor.md는 위임 참조만 | `[Android API 23+]` 레이블 |
| SE-2 | Network Security Config 검토 | `network_security_config.xml` 설정 검토. `cleartext` 허용 범위 판단 기준 | 기존 Android 특화 체크에 통합 | `[Android API 24+]` 레이블 |
| SE-3 | 의존성 CVE 자동 조회 | `./gradlew dependencyCheckAnalyze` 실행 또는 `researcher`에 CVE 조회 위임 패턴 | CVE 데이터 조회는 researcher 위임 원칙 | `[AGP 8.x+]` |
| SE-4 | JWT / Token 취약점 패턴 | `alg:none` 공격, 만료 미검증, Refresh Token 저장 방식 취약점 탐지 | `[HIGH]` 심각도로 분류 기준 명시 | 수정은 executor 위임 원칙 |

#### DoD 체크리스트 (security.md 강화 완료 기준)

- [x] SE-1~SE-4 항목 모두 섹션으로 추가됨
- [x] Android Keystore 섹션이 기존 "Android 특화 보안 체크"에 통합됨
- [x] CVE 조회 → researcher 위임 참조 명시됨
- [x] CVE 조회 → researcher.md RS-2 위임 참조 명시됨
- [x] 기존 158줄 OWASP Top 10 테이블 손상 없음

---

### 2.4 researcher.md

**현재 상태:** 89줄
**목표 변경량:** +70~90줄 (목표 159~179줄)

#### 강화 내용 테이블

| ID | 강화 항목 | 추가 내용 요약 | 방어 로직 | 비고 |
|----|---------|-------------|---------|-----|
| RS-1 | Android 라이브러리 버전 조사 기준 | Maven Central, Google Maven Repository, GitHub Releases 조회 순서. Deprecated API 포함 여부 판단 | **Deprecated API 방지의 핵심 역할** — 모든 에이전트가 버전 조사 시 researcher 선행 호출 | 버전 레이블 `[v{버전}+]` 형식 출력 의무 |
| RS-2 | CVE 조회 프로세스 | NVD(nvd.nist.gov), OSV(osv.dev) 조회 방법. CVSS 점수 기준 심각도 분류 | security.md (SE-3)와 연동 | 조회 결과 security 에이전트에 전달 |
| RS-3 | 공식 마이그레이션 가이드 조사 | AndroidX 마이그레이션, Compose 업그레이드, AGP 업그레이드 공식 가이드 링크 조사 패턴 | planner.md (PL-2)와 연동 | 비공식 블로그보다 공식 문서 우선 |

#### DoD 체크리스트 (researcher.md 강화 완료 기준)

- [x] RS-1~RS-3 항목 모두 섹션으로 추가됨
- [x] 버전 조사 결과 출력 형식에 `[v{버전}+]` 레이블 예시 포함됨
- [x] CVE 조회 → security.md 전달 프로세스 명시됨
- [x] 기존 89줄 내용 손상 없음 (기존 소스 우선순위 유지)

---

### 2.5 writer.md

**현재 상태:** 105줄
**목표 변경량:** +60~80줄 (목표 165~185줄)

#### 강화 내용 테이블

| ID | 강화 항목 | 추가 내용 요약 | 방어 로직 | 비고 |
|----|---------|-------------|---------|-----|
| W-1 | KDoc 문서화 표준 | `@param`, `@return`, `@throws`, `@sample` KDoc 태그 표준 패턴. Compose Preview 문서화 | `[Kotlin 1.9+]` 레이블 | 코드는 수정 안 하고 문서만 추가 |
| W-2 | CHANGELOG 작성 규칙 | Keep a Changelog 형식 준수. `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security` 섹션 | 버전 레이블 형식 통일 | Semantic Versioning 연계 |
| W-3 | ADR (Architecture Decision Record) | 아키텍처 결정 기록 템플릿. 컨텍스트, 결정, 결과 3섹션 형식 | architect.md와 협력 — 결정은 architect, 기록은 writer | ADR 번호 체계 명시 |

#### DoD 체크리스트 (writer.md 강화 완료 기준)

- [x] W-1~W-3 항목 모두 섹션으로 추가됨
- [x] KDoc 예시가 실제 SubwayMate 코드 패턴 반영
- [x] ADR 템플릿이 기존 "문서 유형별 템플릿" 섹션에 통합됨
- [x] 기존 105줄 내용 손상 없음

---

## 3. P3 에이전트 강화 계획

### 3.1 explorer.md

**현재 상태:** 93줄
**강화 방침:** 조건부 강화 (우선순위 낮음)

#### 강화 검토 결과

| 평가 항목 | 결과 | 이유 |
|---------|------|------|
| 현재 충실도 | 양호 | 검색 전략, 복잡도별 접근, 출력 형식 모두 명확 |
| 버전 의존성 | 낮음 | 검색 도구(Glob/Grep)는 버전 중립적 |
| 강화 필요성 | 선택적 | Android 코드 패턴 검색 특화 예시 추가 가능 |

#### 조건부 강화 항목 (P2 완료 후 결정)

| ID | 강화 항목 | 선택 조건 |
|----|---------|---------|
| EX-1 | Android 패턴 검색 레시피 | Hilt 스코프, Room Entity, Compose Screen 위치 찾기 예시 추가 |
| EX-2 | 의존성 역추적 패턴 | "이 클래스를 사용하는 모든 곳" Grep 패턴 표준화 |

### 강화 불필요 에이전트

| 에이전트 | 이유 |
|---------|------|
| `reasoner.md` | Android 특화 강화 계획 범위 외 (도메인 비적합성으로 이번 강화 대상 제외) |
| `data-scout.md` | Android 특화 강화 계획 범위 외 (도메인 비적합성으로 이번 강화 대상 제외) |

---

## P4. 에이전트 강화 계획 (마케팅·콘텐츠·디자인 품질)

> **출처:** skills.sh 9개 외부 스킬 패턴 분석 결과 적용
> **원칙:** 기존 에이전트 SSOT 위반 금지 — 기존 소유권 침범 없이 보완/심화만 추가

### P4.1 designer.md

**현재 상태:** 168줄
**강화 방침:** D-1, D-2 추가 (프로덕션 디자인 품질 + 외부 가이드라인 참조)

#### D-1 프로덕션 디자인 품질 기준 [frontend-design 기반]

**추가 위치:** "구현 전 방향 설정" 섹션 다음

```markdown
### D-1 프로덕션 디자인 품질 기준

**미학적 방향 결정 프로세스 (구현 전 필수):**
1. 개념 한 단어 결정: 이 UI가 전달하는 감성은? (예: "차분함", "역동", "신뢰")
2. 차별화 요소 선택: 다른 앱과 구별되는 시각적 요소는?
3. 색상 이야기: 선택된 색상이 왜 이 앱에 맞는가?

**프로덕션 품질 체크리스트 (구현 후 자기 검토):**
- [ ] 폰트: Roboto/기본 폰트 사용 금지 → 개성 있는 서체 선택
- [ ] 색상: primary 하나로 처리 금지 → 의도된 색상 팔레트 구성
- [ ] 레이아웃: 단순 Column/Row 나열 금지 → 시각적 계층 구조 확인
- [ ] 여백: 요소 간 spacing 일관성 확인 (8dp 배수 권장)
- [ ] 상태: loading/empty/error 상태 UI 모두 구현 확인
```

**금지 패턴 (Generic AI Slop 방지):**
```
□ 기본 Roboto 폰트만 사용 → 앱 정체성 없는 UI
□ 보라색 그라디언트 배경 → 진부한 AI 디자인 클리셰
□ primary 색상 하나로 전체 UI 처리 → 무채색 단조로움
□ padding/margin 없는 요소 나열 → 숨막히는 레이아웃
□ 모든 화면 동일한 CardView 패턴 → 개성 없는 복사본
```

#### D-2 외부 디자인 가이드라인 참조 패턴 [web-design-guidelines 기반]

**추가 위치:** "Android Compose 전문 패턴" 섹션 앞

```markdown
### D-2 외부 디자인 가이드라인 참조

**작업 전 확인 가이드라인 (URL 직접 참조):**
- Material Design 3: https://m3.material.io/components
- Compose API 레퍼런스: 공식 문서에서 컴포넌트별 파라미터 확인

**가이드라인 위반 출력 형식:**
`{파일경로}:{라인번호}` — [위반] {위반 내용} → [올바른 패턴] {대체 코드}

예시:
`ui/HomeScreen.kt:42` — [위반] OutlinedButton에 strokeWidth 직접 지정
→ [올바른 패턴] BorderStroke(1.dp, MaterialTheme.colorScheme.outline) 사용
```

#### P4.1 DoD 체크리스트

- [x] D-1 (미학적 방향 프로세스 3단계) 추가 완료
- [x] D-1 (프로덕션 품질 체크리스트 5항목) 추가 완료
- [x] D-1 (Generic AI Slop 금지 패턴 5항목) 추가 완료
- [x] D-2 (외부 가이드라인 참조 패턴) 추가 완료
- [x] 기존 MD3/Compose/AnimationSpec 패턴과 중복 없음 확인
- [x] 기존 168줄 대비 +60줄 이내 유지 (167→209, +42줄)

---

### P4.2 writer.md

**현재 상태:** 197줄 (P2 강화 후)
**강화 방침:** W-4 추가 (7-Sweep 기반 기술 문서 품질 체크리스트)

#### W-4 기술 문서 품질 체크리스트 (7-Sweep 기반) [copy-editing 기반]

**추가 위치:** "W-3 ADR 아키텍처 결정 기록" 섹션 다음

```markdown
### W-4 기술 문서 7-Sweep 품질 검토

작성 완료 후 아래 7단계 순서로 문서를 검토합니다.

| Sweep | 검토 항목 | 통과 기준 |
|-------|---------|---------|
| 1. 명확성 | 처음 보는 개발자가 이해 가능한가? | 도메인 용어 설명 포함 |
| 2. 일관성 | 같은 개념에 같은 용어 사용하는가? | 용어 사전 일치 |
| 3. So What | "왜 써야 하는가"까지 답하는가? | 이점/목적 1줄 이상 |
| 4. 근거 | 코드 예시 또는 공식 문서 링크 존재? | 주장에 증거 수반 |
| 5. 구체성 | "빠릅니다" → "50ms 이하" 수치 표현? | 수치/예시/비교 포함 |
| 6. 독자 수준 | 신규 기여자 온보딩 가능 수준인가? | README 기준 독립 이해 가능 |
| 7. 행동 유도 | 읽은 후 다음 단계가 명확한가? | 코드 실행 또는 링크 제공 |

**금지 표현 → 대체 방식:**
```
"매우 빠릅니다" → "응답 시간 50ms 이하 (Pixel 6 기준)"
"쉽게 사용할 수 있습니다" → "3단계로 설정 완료" + 코드 예시
"최고의 성능" → "기존 대비 2배 처리량 (벤치마크 링크)"
"간단합니다" → 실제 코드 예시로 대체
```
```

#### P4.2 DoD 체크리스트

- [x] W-4 (7-Sweep 체크리스트 7항목) 추가 완료
- [x] W-4 (금지 표현 → 대체 방식 4항목) 추가 완료
- [x] W-1(KDoc)/W-2(CHANGELOG)/W-3(ADR) 기존 내용 손상 없음
- [x] 기존 197줄 대비 +40줄 이내 유지 (196→218, +22줄)

---

### P4.3 planner.md

**현재 상태:** 108줄
**강화 방침:** PL-4 추가 (바이트 크기 작업 분해 + 명확화 질문 패턴)

#### PL-4 바이트 크기 작업 분해 패턴 [writing-plans + brainstorming 기반]

**추가 위치:** 기존 "PL-3" 또는 마지막 전문 패턴 섹션 다음

```markdown
### PL-4 바이트 크기 작업 분해 패턴 [writing-plans 기반]

**원칙:** 각 실행 단계는 2-5분 단위로 분해 (에이전트 단일 Turn 처리 가능 크기)

**분해 기준 체크리스트:**
- [ ] 한 번에 하나의 파일만 수정
- [ ] 완료 조건이 명확하게 측정 가능한가?
- [ ] 의존성 체인이 최소화되어 있는가?
- [ ] 실패 기준이 사전 정의되어 있는가?

**작업 단계 분해 템플릿:**
| 단계 | 담당 파일 | 완료 조건 | 실패 기준 | 다음 단계 의존 |
|-----|---------|---------|---------|------------|
| 1   | A.kt    | 컴파일 통과 | 타입 오류 | 2단계 |
| 2   | B.kt    | 단위 테스트 통과 | 테스트 실패 | 없음 |

**명확화 질문 패턴 (한 번에 하나씩):**
```
질문 순서:
1. 목적: "이 기능의 최종 사용자가 누구인가요?"
2. 제약: "사용할 수 없는 기술/라이브러리가 있나요?"
3. 성공 기준: "완료를 어떻게 확인할 수 있나요?"
```

**좋은/나쁜 분해 예시:**
```
❌ 나쁜 분해: "인증 시스템 구현" (범위 불명확, 10+ 파일)
✅ 좋은 분해:
  단계 1: LoginUseCase.kt 생성 (입력 검증 로직만)
  단계 2: AuthRepository.kt 인터페이스 정의
  단계 3: AuthRepositoryImpl.kt 구현
  단계 4: LoginViewModel.kt 연결
```
```

#### P4.3 DoD 체크리스트

- [x] PL-4 (분해 기준 체크리스트 4항목) 추가 완료
- [x] PL-4 (작업 단계 분해 템플릿) 추가 완료
- [x] PL-4 (명확화 질문 패턴 3단계) 추가 완료
- [x] PL-4 (좋은/나쁜 분해 예시) 추가 완료
- [x] 기존 108줄 대비 +50줄 이내 유지 (185→222, +37줄)

---

### P4.4 researcher.md

**현재 상태:** 89줄
**강화 방침:** RS-4 추가 (E-E-A-T 기반 정보 신뢰성 평가 프레임워크)

#### RS-4 정보 신뢰성 E-E-A-T 평가 [seo-audit 기반]

**추가 위치:** 기존 "RS-2 CVE 조회" 또는 마지막 전문 패턴 섹션 다음

```markdown
### RS-4 정보 신뢰성 E-E-A-T 평가 [seo-audit 기반]

조사한 정보 출처의 신뢰성을 4요소로 평가합니다.

| 요소 | 평가 질문 | 🟢 HIGH | 🟡 MED | 🔴 LOW |
|-----|---------|---------|--------|--------|
| **Experience** (경험) | 실제 사용 경험 기반인가? | 공식 예제·릴리스 노트 | 기술 블로그 검증 내용 | 의견성 블로그 |
| **Expertise** (전문성) | 도메인 전문가가 작성했는가? | 라이브러리 공식 팀 | 검증된 커뮤니티 기여자 | 출처 불명 |
| **Authoritativeness** (권위) | 공식 또는 1차 출처인가? | 공식 문서·GitHub 공식 | 공인 커뮤니티 (SO, Kotlin Forum) | 3차 블로그 |
| **Trustworthiness** (신뢰) | 최신이며 버전이 명시되었는가? | 현재 버전 명시 | 1년 이내, 버전 추정 가능 | 구버전·날짜 없음 |

**출력 표기 표준 (조사 결과에 반드시 포함):**
```
[출처] {URL 또는 문서명} | [신뢰도] 🟢/🟡/🔴 | [버전] {버전 또는 "불명"} | [확인일] {날짜}
```

**신뢰도 🔴 LOW 출처 처리 원칙:**
- 단독 사용 금지 → 🟢 HIGH 출처로 교차 검증 필수
- 보고 시 "[LOW 신뢰도 — 교차 검증 필요]" 명시
```

#### P4.4 DoD 체크리스트

- [x] RS-4 (E-E-A-T 4요소 평가 표) 추가 완료
- [x] RS-4 (출력 표기 표준) 추가 완료
- [x] RS-4 (LOW 출처 처리 원칙) 추가 완료
- [x] RS-2 (CVE 조회 프로세스) 기존 내용 손상 없음
- [x] 기존 89줄 대비 +40줄 이내 유지 (169→189, +20줄)

---

### P4.5 copywriter.md (신규 에이전트 생성)

**현재 상태:** 없음
**강화 방침:** 마케팅 카피·랜딩 페이지·README 마케팅 섹션 전문 에이전트 신규 생성

**생성 경로:** `.claude/agents/copywriter.md`

#### 에이전트 설계

```yaml
---
name: copywriter
description: |
  마케팅 카피, 랜딩 페이지, README 마케팅 섹션 작성 전문가.
  다음 상황에서 사용: 앱 스토어 설명, README 홍보 섹션, 기능 소개 카피,
  랜딩 페이지 텍스트, 마케팅 이메일 초안.
  예시: "앱 스토어 설명 써줘", "README 마케팅 섹션 추가해줘", "기능 소개 카피 작성해줘"
model: claude-sonnet-4-6
tools: Read, Write, Edit, WebSearch
---
```

#### 핵심 섹션 설계

**CW-1: 기능→혜택→결과 연결 프레임워크 [copywriting 기반]**
```
기능: {앱이 무엇을 하는가}
혜택: {사용자에게 어떤 도움이 되는가}
결과: {사용자의 삶/업무가 어떻게 달라지는가}

예시:
기능: 실시간 지하철 위치 추적
혜택: 정확한 도착 시간 예측
결과: 더 이상 플랫폼에서 무작정 기다리지 않아도 됨
```

**CW-2: 콘텐츠 유형 분류 [content-strategy 기반]**
```
검색가능(Searchable): 지속적으로 트래픽 유입 — 튜토리얼, FAQ, 비교 문서
공유가능(Shareable): 소셜 바이럴 → 인용구, 놀라운 통계, 스토리

각 콘텐츠 작성 전 분류 선택 → 목적에 맞는 형식 적용
```

**CW-3: 7-Sweep 카피 품질 검토**
```
writer.md W-4와 동일한 7-Sweep 적용
→ 카피 특화 추가: 감정 공명(Sweep 6) + 제로 리스크(Sweep 7) 포함
```

**CW-4: 페이지 타입별 카피 지침**
```
홈/메인: 핵심 가치 제안 1줄 + 3개 주요 혜택
랜딩: 문제→해결→증거→행동 유도 구조
앱 스토어: 첫 줄 80자 이내, 키워드 자연스럽게 포함
README 마케팅: 사용 전/후 변화를 코드 예시로 증명
```

#### P4.5 DoD 체크리스트

- [x] `.claude/agents/copywriter.md` 파일 생성 완료
- [x] frontmatter (name/description/model/tools) 형식 준수
- [x] CW-1 (기능→혜택→결과 프레임워크) 구현 완료
- [x] CW-2 (검색가능/공유가능 분류) 구현 완료
- [x] CW-3 (7-Sweep 카피 검토, writer.md 위임 참조 포함) 구현 완료
- [x] CW-4 (플랫폼별 지침 4종: 앱 스토어/README/랜딩/이메일) 구현 완료
- [x] _STANDARDS.md 4개 필수 섹션 (역할/입력출력/작업방식/제약) 포함 확인
- [x] _registry.json 등록 완료 (total_agents: 30)

---

## 4. 방어 로직 전문

### 4.1 [HIGH] Deprecated API 삽입 방지

**문제:** 에이전트가 구버전 API (예: `runBlockingTest`, `KAPT`, `LiveData` 대신 `StateFlow`)를 코드 예시에 삽입할 위험

**적용 규칙:**

```
규칙 1: 모든 코드 예시에 버전 레이블 필수
  형식: `[v{최소버전}+]` (예: `[v1.7+]`, `[Compose 1.5+]`)

규칙 2: researcher 선행 조사 의무
  에이전트가 라이브러리 API를 코드 예시에 추가하기 전,
  researcher.md가 해당 API의 현재 권장 여부를 확인해야 함

규칙 3: Deprecated 명시
  구버전 API는 예시에서 제거하거나 `// [DEPRECATED v{버전}] → {대체 API}` 주석 추가
```

**Deprecated → 대체 API 매핑 (기준 버전 기준):**

| 구버전 API | 대체 API | 레이블 |
|----------|---------|------|
| `runBlockingTest {}` | `runTest {}` | `[Coroutines 1.7+]` |
| `TestCoroutineDispatcher` | `StandardTestDispatcher` | `[Coroutines 1.6+]` |
| `kapt` (Room, Hilt) | `ksp` | `[KSP 1.0+]` |
| `LiveData` (새 코드) | `StateFlow` / `SharedFlow` | `[Coroutines 1.7+]` |
| `AsyncLayoutInflater` | Compose 직접 사용 | `[Compose 1.5+]` |
| `PackagingOptions` (AGP) | `packaging` 블록 | `[AGP 8.x+]` |

---

### 4.2 [HIGH] 소유 파일 중복 방지

**문제:** 동일 개념을 여러 에이전트가 중복 기술하면 일관성 붕괴 및 정보 분산 발생

**소유권 매핑 테이블:**

| 개념 | 전담 에이전트 (전담 섹션 ID) | 타 에이전트 처리 방식 |
|-----|--------------------------|-------------------|
| Hilt 스코프 선택 기준 | `architect.md` | `executor.md`는 구현 패턴 예시만 보유, `→ architect.md 참조` 위임 참조만 |
| Compose Recomposition 탐지 | `code-reviewer.md` (R-2) | `executor.md`, `qa-tester.md`는 `→ code-reviewer.md R-2 참조` |
| MockK API 사용법 | `qa-tester.md` (Q-1) | `executor.md`는 `→ qa-tester.md Q-1 참조` |
| Android Keystore 구현 | `security.md` (SE-1) | `architect.md`, `executor.md`는 `→ security.md SE-1 참조` |
| MVVM 레이어 경계 기준 | `architect.md` (A-1) | `code-reviewer.md`는 탐지만, 설계는 `→ architect.md A-1 참조` |
| A/B 테스트 설계 | `scientist.md` (S-4) | `qa-tester.md`는 검증만, 설계는 `→ scientist.md S-4 참조` |
| CVE 조회 프로세스 | `researcher.md` (RS-2) | `security.md`는 `→ researcher.md RS-2 참조` |
| ADR 작성 형식 | `writer.md` (W-3) | `architect.md`는 결정만, 기록은 `→ writer.md W-3 참조` |

**위임 참조 표준 문구:**

```markdown
> 이 항목은 {담당 에이전트}.md ({섹션 ID})에서 전담합니다.
> 해당 개념이 필요한 경우 → `{담당 에이전트}` 에이전트를 호출하세요.
```

---

### 4.3 [HIGH] 역할 경계 침범 방지

**문제:** 에이전트가 자신의 도메인 외 판단을 직접 내리면 SSOT(Single Source of Truth) 위반

**SSOT 맵 테이블:**

| 도메인 | SSOT 에이전트 | 침범 금지 대상 에이전트 | 위반 예시 |
|-------|------------|-------------------|---------|
| 접근성(a11y) 판정 | `accessibility` | 모든 에이전트 | code-reviewer가 a11y 판정 내리기 |
| 성능 프로파일링 측정 | `performance` | `executor`, `qa-tester`, `scientist` | qa-tester가 Benchmark 측정 결과 판정 |
| 보안 취약점 최종 판정 | `security.md` | `code-reviewer`, `architect`, `executor` | code-reviewer가 CVE 심각도 판정 |
| 데이터 시각화 UI 설계 | `designer` (외부) | `scientist` | scientist가 matplotlib 커스텀 UI 설계 |
| CI/CD 파이프라인 설계 | `devops` | `executor`, `build-fixer` | build-fixer가 CI 스크립트 직접 작성 |
| DB 스키마 설계 | `db-expert` | `executor`, `architect` | executor가 Room Entity 스키마 독단 설계 |
| Git 이력 분석 | `git-historian` | `executor`, `explorer` | explorer가 git blame 기반 결론 도출 |

**현재 존재하는 에이전트 기준 경계 규칙:**

```
executor  → 보안 취약점 판정 금지 → security 위임
executor  → 아키텍처 설계 금지 → architect 위임
architect → 코드 직접 수정 금지 → executor 위임
code-reviewer → 코드 수정 금지 → executor 위임 (Write/Edit 툴 금지 원칙 유지)
scientist → UI 시각화 설계 금지 → designer 위임
qa-tester → A/B 테스트 설계 금지 → scientist 위임
```

---

## 5. 실제 강화 실행 시 DoD (7단계 절차 + 금지 행동)

### 7단계 실행 절차

```
Step 1: researcher.md를 호출하여 강화 대상 에이전트의
        모든 라이브러리 최신 버전 및 Deprecated API 목록 확인

Step 2: 대상 에이전트 파일 Read (현재 상태 확인)

Step 3: 소유권 매핑 테이블(4.2절) 조회
        → 작성할 내용이 다른 에이전트 소유인지 확인

Step 4: SSOT 맵(4.3절) 조회
        → 역할 경계 침범 여부 확인

Step 5: 강화 내용 초안 작성
        → 버전 레이블 `[v{버전}+]` 모든 코드 예시에 적용
        → 위임 참조 표준 문구 삽입

Step 6: code-reviewer 에이전트로 초안 검토
        → 소유권 침범 여부 확인
        → 섹션 구조 일관성 확인

Step 7: 최종 Write — 기존 줄 수 + 목표 변경량 범위 내 확인
```

### 금지 행동

```
[PROHIBITED] researcher 선행 조사 없이 버전 명시 금지
[PROHIBITED] 소유권 확인 없이 타 에이전트 전담 개념 기술 금지
[PROHIBITED] 기존 에이전트 줄 수 목표 범위 초과 (+50줄 이상 차이) 금지
[PROHIBITED] _STANDARDS.md 규격 위반 (역할 / 입력출력 명세 / 작업 방식 / 제약 사항 — 4개 필수 섹션 누락) 금지
[PROHIBITED] 에이전트 간 동일 코드 예시 중복 기술 금지
```

---

## 6. 에이전트 반환 형식 표준 블록 (4블록 형식)

모든 강화 완료 보고는 아래 4블록 형식을 준수합니다.

```
[결과_요약]
{완료한 강화 작업 1-3줄 요약}
예: executor.md에 E-1~E-5 항목 추가 완료 (+97줄, 총 211줄)

[수정_파일]
- {에이전트 파일 절대경로}: {추가된 섹션 ID 목록}
예: D:\park\YD_Claude_RND\.claude\agents\executor.md: E-1, E-2, E-3, E-4, E-5 추가

[이슈_목록]
- [HIGH/MED/LOW] {발견된 이슈} → {해결 방향}
예: [MED] E-3 Compose 버전 레이블 누락 → [Compose 1.5+] 추가 필요
- (없으면 "없음")

[의존성_알림]
- {다음 단계 에이전트 강화에 영향 주는 내용}
예: E-5 (Hilt 스코프) 완료 → architect.md A-4에서 위임 참조 추가 필요
- (없으면 "없음")
```

---

## 7. 토큰 최적화 규칙 (테이블 형식)

강화 실행 시 적용할 토큰 최적화 규칙 (_STANDARDS.md 5절 기준 확장):

| 규칙 번호 | 규칙 내용 | 적용 대상 |
|---------|---------|---------|
| T-1 | 강화 전 Read는 offset/limit 활용 (필요한 섹션만 읽기) | 모든 에이전트 |
| T-2 | 코드 예시는 최대 10줄 이내 (더 긴 경우 핵심만 추출) | 모든 에이전트 |
| T-3 | 위임 참조 문구는 1줄 표준 문구로 통일 (길게 설명 금지) | 소유권 위임 섹션 |
| T-4 | DoD 체크리스트 항목은 6개 이내 (핵심만) | 각 에이전트 DoD |
| T-5 | P1 5개 에이전트 병렬 실행 (순차 실행 금지) | 실행 전략 |
| T-6 | 강화 완료 보고는 4블록 형식 100줄 이내 | 완료 보고서 |
| T-7 | 이미 읽은 에이전트 파일 재독 금지 (컨텍스트 내 유지) | 멀티 에이전트 환경 |

---

---

## P5. 에이전트 강화 계획 (Android 인프라 & 클라이언트 통합)

**강화 테마**: Android 생태계 특화 패턴 보강 + 인프라/배포 자동화

**대상 에이전트 선정 근거**:
- api-designer, vision, db-expert, devops, localizer — Android 특화 패턴 부재 또는 매우 경량
- P1~P4에서 강화된 에이전트와 협력 관계 형성 필요
- 전체 31개 중 미강화 12개 중 실용적 효과 상위 5개

---

### P5.1 api-designer.md — Android Retrofit2/OkHttp + 네트워크 보안

**현재 상태**: 394줄, 30섹션
**강화 후 목표**: 430~450줄
**강화 방침**: Android Retrofit2+OkHttp 클라이언트 패턴, Certificate Pinning 보안 섹션 추가

#### API-1: Retrofit2 + OkHttp Android 클라이언트 패턴 [Retrofit 2.9+, OkHttp 4.12+]

```kotlin
// Hilt 모듈에서 Retrofit 인스턴스 제공
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor())       // 인증 헤더 자동 삽입
            .addInterceptor(LoggingInterceptor())    // 디버그 로그 (BuildConfig 조건부)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)          // 환경별 URL — 하드코딩 금지
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
}

// API 인터페이스 — suspend fun 필수 (coroutines 연동)
interface SubwayApi {
    @GET("arrivals/{stationId}")
    suspend fun getArrivals(@Path("stationId") id: String): Response<ArrivalsDto>
}
```

**설계 원칙**:
- `@Singleton` 스코프: Retrofit/OkHttpClient는 앱 전역 1개 인스턴스만
- BaseUrl은 `BuildConfig` 상수로 — 환경(dev/prod) 분리
- `suspend fun` + `Response<T>` 래핑으로 에러 코드 처리
- `AuthInterceptor`: 토큰 만료 시 `401` 감지 → 자동 갱신 후 재시도

#### API-2: 네트워크 보안 — Certificate Pinning [OkHttp 4.12+]

```kotlin
// Certificate Pinning — MITM 공격 방어
val certPinner = CertificatePinner.Builder()
    .add("api.subway.example.com", "sha256/{공개키 해시}")
    .add("api.subway.example.com", "sha256/{백업 공개키 해시}")  // 갱신 대비 백업 필수
    .build()

val client = OkHttpClient.Builder()
    .certificatePinner(certPinner)
    .build()
```

> ⚠️ Certificate Pinning 적용 시 → `security` 에이전트에 키 해시 검증 위임
> API 키/토큰 저장 방식 → `EncryptedSharedPreferences` 사용 강제 (security 에이전트 전담)

**위임 참조**: 보안 취약점 최종 판정 → `security` 에이전트, DB 연동 패턴 → `db-expert` 에이전트

#### P5.1 DoD 체크리스트

- [x] API-1 섹션 추가 완료 (Retrofit/OkHttp Hilt 모듈 코드 예시 포함)
- [x] API-2 섹션 추가 완료 (Certificate Pinning 코드 예시 포함)
- [x] `[Retrofit 2.9+]`, `[OkHttp 4.12+]` 버전 레이블 전 코드 예시에 적용
- [x] security / db-expert 위임 참조 문구 삽입
- [x] 기존 REST/GraphQL 섹션과 중복 없음 확인
- [x] 강화 후 줄 수 430~450줄 범위 내 → 실측 464줄 (+14줄 초과, 내용 완전성 우선)

---

### P5.2 vision.md — Android Compose UI 스크린샷 분석

**현재 상태**: 114줄, 8섹션 (가장 경량, Generic 패턴만 존재)
**강화 후 목표**: 160~180줄
**강화 방침**: Android/Compose 전용 스크린샷 분석 패턴, 앱 스토어 스크린샷 품질 체크리스트 추가

#### V-1: Android Compose UI 스크린샷 분석 패턴

스크린샷 분석 요청 시 아래 순서로 검토합니다:

```
[Compose UI 분석 체크리스트]

1. 레이아웃 계층
   □ LazyColumn/LazyRow 사용 여부 (재구성 최소화)
   □ Modifier 체인 과도 중첩 여부 (3단계 이상 → 분리 권장)
   □ 하드코딩 dp 값 존재 여부 → MaterialTheme.spacing 사용 권장

2. 상태 표현
   □ 로딩 상태: CircularProgressIndicator 또는 Shimmer 플레이스홀더 존재 여부
   □ 빈 목록 상태: Empty State UI 컴포넌트 존재 여부
   □ 에러 상태: Snackbar 또는 인라인 에러 메시지 존재 여부

3. Material Design 3 준수
   □ 색상: MaterialTheme.colorScheme 토큰 사용 (하드코딩 Color(0xFF…) 금지)
   □ 타이포그래피: MaterialTheme.typography 단계 준수 (12종 스케일)
   □ 컴포넌트: Material 3 Card/Button/Chip 표준 사용 여부

4. 접근성
   □ 터치 타겟 최소 48dp × 48dp 충족 여부
   □ contentDescription 이미지·아이콘에 존재 여부
   → 상세 접근성 감사: `accessibility` 에이전트에 위임
```

**출력 형식**:
```
[스크린샷 분석 결과]
발견 이슈: {HIGH/MED/LOW 분류}
  - [HIGH] Empty State 미구현 → 빈 목록 시 흰 화면 표시
  - [MED]  하드코딩 Color(0xFF1A73E8) → MaterialTheme.colorScheme.primary 사용 권장
권장 수정: {파일명 또는 컴포넌트명 특정}
```

#### V-2: 앱 스토어 스크린샷 품질 체크리스트

앱 스토어 제출용 스크린샷 검토 시:

```
[Google Play 스크린샷 체크리스트]

□ 해상도: 최소 320px 이상 (권장 1080×1920)
□ 비율: 16:9 또는 9:16 세로 모드
□ 텍스트: 화면의 20% 이하 (텍스트 과다 → 거절 위험)
□ 상태바: 배터리 100%, 신호 Full (클린 상태바)
□ 다크모드/라이트모드: 최소 1쌍 제공
□ 기능 강조: 핵심 기능 1개당 스크린샷 1장 원칙
□ 로컬라이제이션: 언어별 스크린샷 분리 여부
  → 번역 품질 검수: `localizer` 에이전트에 위임
```

**위임 참조**: UI 구현 수정 → `designer` 에이전트, 접근성 감사 → `accessibility` 에이전트, 번역/i18n → `localizer` 에이전트

#### P5.2 DoD 체크리스트

- [x] V-1 섹션 추가 완료 (Compose UI 분석 체크리스트 4항목)
- [x] V-2 섹션 추가 완료 (앱 스토어 체크리스트 포함)
- [x] designer / accessibility / localizer 위임 참조 삽입
- [x] 기존 Gestalt/시각 계층 섹션과 중복 없음 확인
- [x] 강화 후 줄 수 160~180줄 범위 내 → 실측 176줄 ✓

---

### P5.3 db-expert.md — Room Paging 3 연동 + TypeConverter

**현재 상태**: 444줄, 17섹션
**강화 후 목표**: 490~520줄
**강화 방침**: Paging 3 라이브러리 Room 연동 패턴, TypeConverter 직렬화 표준 패턴 추가

#### DB-5: Room + Paging 3 연동 패턴 [Room 2.6+, Paging 3.3+]

```kotlin
// DAO — PagingSource 반환 (Room이 자동 생성)
@Dao
interface ArrivalDao {
    @Query("SELECT * FROM arrivals ORDER BY timestamp DESC")
    fun getArrivalsPaged(): PagingSource<Int, ArrivalEntity>
}

// Repository — Pager 설정
class ArrivalRepository(private val dao: ArrivalDao) {
    fun getPagedArrivals(): Flow<PagingData<ArrivalEntity>> =
        Pager(
            config = PagingConfig(
                pageSize = 20,
                enablePlaceholders = false,
                prefetchDistance = 5
            ),
            pagingSourceFactory = { dao.getArrivalsPaged() }
        ).flow

    // RemoteMediator 패턴: 네트워크 → DB 캐시 연동
    // 네트워크 + DB 동시 사용 시 → RemoteMediator 구현 (구조 설계는 architect 위임)
}

// ViewModel
@HiltViewModel
class ArrivalViewModel @Inject constructor(
    private val repository: ArrivalRepository
) : ViewModel() {
    val arrivals = repository.getPagedArrivals()
        .cachedIn(viewModelScope)
}
```

**설계 원칙**:
- `PagingConfig.pageSize`: 20~50 권장 (메모리 ↔ 네트워크 균형)
- `enablePlaceholders = false`: 데이터 없는 자리 표시자 비활성 (Compose LazyColumn 친화적)
- `.cachedIn(viewModelScope)`: ViewModel 스코프로 캐시하여 화면 회전 시 재로드 방지

#### DB-6: TypeConverter 직렬화 패턴 [Room 2.6+]

```kotlin
// 복합 객체 → JSON 직렬화 저장
class Converters {
    private val gson = Gson()

    @TypeConverter
    fun fromList(list: List<String>): String =
        gson.toJson(list)

    @TypeConverter
    fun toList(json: String): List<String> =
        gson.fromJson(json, object : TypeToken<List<String>>() {}.type)
            ?: emptyList()

    // LocalDateTime 변환
    @TypeConverter
    fun fromDateTime(dt: LocalDateTime?): String? =
        dt?.toString()

    @TypeConverter
    fun toDateTime(value: String?): LocalDateTime? =
        value?.let { LocalDateTime.parse(it) }
}

// Database 클래스에 등록
@Database(entities = [...], version = 1)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase()
```

> ⚠️ `Gson` 대신 `kotlinx.serialization` 사용 권장 (Kotlin 프로젝트 표준)
> TypeConverter에서 null 처리 필수 — `?` 타입 명시

**위임 참조**: Paging 3 RemoteMediator 아키텍처 설계 → `architect` 에이전트, 마이그레이션 스크립트 작성 → DB-4(기존 섹션) 참조

#### P5.3 DoD 체크리스트

- [x] DB-5 섹션 추가 완료 (Paging 3 DAO/Repository/ViewModel 코드 예시 포함)
- [x] DB-6 섹션 추가 완료 (TypeConverter List/DateTime 예시 포함)
- [x] `[Room 2.6+]`, `[Paging 3.3+]` 버전 레이블 전 코드 예시에 적용
- [x] architect 위임 참조 문구 삽입
- [x] 기존 DB-1~DB-4 섹션과 중복 없음 확인
- [x] 강화 후 줄 수 490~520줄 범위 내 → 실측 527줄 (+7줄 초과, 내용 완전성 우선)

---

### P5.4 devops.md — Android GitHub Actions CI/CD

**현재 상태**: 606줄, 16섹션
**강화 후 목표**: 650~680줄
**강화 방침**: Android APK 서명 + Google Play Store 자동화 워크플로우 추가

#### DV-1: Android GitHub Actions CI/CD 워크플로우 [GitHub Actions, Gradle 8.x]

```yaml
# .github/workflows/android-release.yml
name: Android Release

on:
  push:
    tags:
      - 'v*'           # v1.0.0 형태 태그 푸시 시 트리거

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ hashFiles('**/*.gradle*') }}

      - name: Build Release APK
        run: ./gradlew assembleRelease

      - name: Sign APK
        uses: r0adkll/sign-android-release@v1
        with:
          releaseDirectory: app/build/outputs/apk/release
          signingKeyBase64: ${{ secrets.KEYSTORE_BASE64 }}
          alias: ${{ secrets.KEY_ALIAS }}
          keyStorePassword: ${{ secrets.KEYSTORE_PASSWORD }}
          keyPassword: ${{ secrets.KEY_PASSWORD }}

      - name: Upload to Google Play
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.SERVICE_ACCOUNT_JSON }}
          packageName: com.example.subwaymate
          releaseFiles: app/build/outputs/apk/release/*.apk
          track: internal            # internal → alpha → beta → production
```

**GitHub Secrets 설정 체크리스트**:
```
□ KEYSTORE_BASE64     : base64로 인코딩된 .jks 파일
□ KEY_ALIAS           : 키 별칭
□ KEYSTORE_PASSWORD   : 키스토어 비밀번호
□ KEY_PASSWORD        : 키 비밀번호
□ SERVICE_ACCOUNT_JSON: Google Play API 서비스 계정 JSON
```

> ⚠️ Keystore 파일을 레포지토리에 직접 커밋 금지
> 모든 민감 값은 GitHub Secrets에만 저장 → 보안 감사: `security` 에이전트 위임

**위임 참조**: APK 빌드 오류 → `build-fixer` 에이전트, Keystore/서명 보안 검토 → `security` 에이전트

#### P5.4 DoD 체크리스트

- [x] DV-1 섹션 추가 완료 (GitHub Actions YAML 전체 포함)
- [x] Secrets 체크리스트 5항목 포함
- [x] security / build-fixer 위임 참조 문구 삽입
- [x] 기존 Docker/CI-CD 섹션과 중복 없음 확인
- [x] 강화 후 줄 수 650~680줄 범위 내 → 실측 679줄 ✓

---

### P5.5 localizer.md — Android Plurals & Format Strings

**현재 상태**: 469줄, 30섹션
**강화 후 목표**: 500~520줄
**강화 방침**: Android strings.xml Plurals/Format Strings 표준 패턴 추가 (기존 하드코딩 탐지와 연계)

#### LC-1: Android Plurals & Format Strings 표준 패턴 [Android API 21+]

```xml
<!-- res/values/strings.xml -->
<resources>
    <!-- Format Strings — 위치 인수 사용 -->
    <string name="arrival_minutes">%1$d분 후 도착</string>
    <string name="station_name_format">%1$s역 %2$s방면</string>

    <!-- Plurals — 수량에 따른 복수형 처리 -->
    <plurals name="transfer_count">
        <item quantity="one">환승 %d회</item>
        <item quantity="other">환승 %d회</item>
    </plurals>
</resources>

<!-- res/values-en/strings.xml (영어) -->
<resources>
    <string name="arrival_minutes">Arrives in %1$d min</string>

    <plurals name="transfer_count">
        <item quantity="one">%d transfer</item>
        <item quantity="other">%d transfers</item>    <!-- 복수형 별도 처리 필수 -->
    </plurals>
</resources>
```

**Kotlin 사용 코드**:
```kotlin
// Format Strings
val msg = context.getString(R.string.arrival_minutes, 3)
// → "3분 후 도착"

// Plurals
val transferMsg = resources.getQuantityString(R.plurals.transfer_count, count, count)
// count=1 → "환승 1회", count=2 → "환승 2회"
```

**탐지 패턴 (하드코딩 복수형)**:
```kotlin
// 위반 — 하드코딩 복수 처리
val msg = if (count == 1) "환승 1회" else "환승 ${count}회"

// 준수 — Plurals 리소스 사용
val msg = resources.getQuantityString(R.plurals.transfer_count, count, count)
```

> ⚠️ `%d` (위치 없는) 사용 금지 → `%1$d` (위치 인수) 필수 (번역 언어별 어순 대응)
> 한국어 조사 자동 처리 패턴은 기존 LC 섹션(한국어 조사) 참조

**위임 참조**: 번역 문자열 UI 렌더링 확인 → `designer` 에이전트, 접근성 텍스트 검토 → `accessibility` 에이전트

#### P5.5 DoD 체크리스트

- [x] LC-1 섹션 추가 완료 (strings.xml Plurals/Format 예시 포함)
- [x] Kotlin 사용 코드 예시 포함 (getQuantityString 패턴)
- [x] 하드코딩 복수형 탐지 패턴 추가
- [x] designer / accessibility 위임 참조 삽입
- [x] 기존 한국어 조사 처리 섹션과 연계 참조 추가
- [x] 강화 후 줄 수 500~520줄 범위 내 → 실측 529줄 (+9줄 초과, 내용 완전성 우선)

---

### P5 실행 전략

```
P5 (동시 실행 가능 — 파일 경계 독립):
  api-designer.md  → API-1, API-2 추가
  vision.md        → V-1, V-2 추가
  db-expert.md     → DB-5, DB-6 추가
  devops.md        → DV-1 추가
  localizer.md     → LC-1 추가
```

**병렬 실행 가능 조건**: 5개 파일 모두 독립적 — 파일 경계 충돌 없음
**실행 명령**: `P5 강화 실제 적용해줘. 워크트리병렬처리로 진행`
**검증**: code-reviewer(sonnet) × 5개 파일 순차 검토

---

## 부록: 파일 경로 빠른 참조

```
# 에이전트 파일 절대 경로
D:\park\YD_Claude_RND\.claude\agents\executor.md       (114줄 기준)
D:\park\YD_Claude_RND\.claude\agents\build-fixer.md    (109줄 기준)
D:\park\YD_Claude_RND\.claude\agents\qa-tester.md      (134줄 기준)
D:\park\YD_Claude_RND\.claude\agents\code-reviewer.md  (138줄 기준)
D:\park\YD_Claude_RND\.claude\agents\scientist.md      (119줄 기준)
D:\park\YD_Claude_RND\.claude\agents\architect.md      (136줄 기준)
D:\park\YD_Claude_RND\.claude\agents\planner.md        (108줄 기준)
D:\park\YD_Claude_RND\.claude\agents\security.md       (158줄 기준)
D:\park\YD_Claude_RND\.claude\agents\researcher.md     (89줄 기준)
D:\park\YD_Claude_RND\.claude\agents\writer.md         (105줄 기준)
D:\park\YD_Claude_RND\.claude\agents\explorer.md       (93줄 기준)
D:\park\YD_Claude_RND\.claude\agents\designer.md       (168줄 기준)
D:\park\YD_Claude_RND\.claude\agents\writer.md         (197줄 기준)
D:\park\YD_Claude_RND\.claude\agents\planner.md        (108줄 기준, 별도 추적)
D:\park\YD_Claude_RND\.claude\agents\copywriter.md     (신규 — P4.5 생성 대상)
D:\park\YD_Claude_RND\.claude\agents\api-designer.md   (394줄 기준 — P5.1 대상)
D:\park\YD_Claude_RND\.claude\agents\vision.md         (114줄 기준 — P5.2 대상)
D:\park\YD_Claude_RND\.claude\agents\db-expert.md      (444줄 기준 — P5.3 대상)
D:\park\YD_Claude_RND\.claude\agents\devops.md         (606줄 기준 — P5.4 대상)
D:\park\YD_Claude_RND\.claude\agents\localizer.md      (469줄 기준 — P5.5 대상)
D:\park\YD_Claude_RND\.claude\agents\_STANDARDS.md     (194줄 기준, 수정 금지)
D:\park\YD_Claude_RND\.claude\agents\data-scout.md     (135줄 기준 — P6.1 대상)
D:\park\YD_Claude_RND\.claude\agents\reasoner.md       (209줄 기준 — P6.2 대상)
D:\park\YD_Claude_RND\.claude\agents\performance.md    (476줄 기준 — P6.3 대상)
D:\park\YD_Claude_RND\.claude\agents\git-historian.md  (404줄 기준 — P6.4 대상)
D:\park\YD_Claude_RND\.claude\agents\cost-analyzer.md  (438줄 기준 — P6.5 대상)

# 이 계획서
D:\park\YD_Claude_RND\.claude\ENHANCEMENT_PLAN.md
```

---

## P6. 에이전트 강화 계획 (분석 지능 강화 — 의사결정 품질 + 데이터 수집 전문화)

**강화 테마**: 추론·비용·성능·이력·데이터 수집 에이전트의 Android 및 한국 생태계 특화 패턴 보강

**대상 에이전트 선정 근거**:
- data-scout(135줄) — 가장 경량, 한국 공공데이터 API 탐색 패턴 전무
- reasoner(209줄) — 정량적 트레이드오프 스코어링 미흡, Android 결정 패턴 없음
- performance(476줄) — 배터리 최적화(WorkManager/Doze) 패턴 미존재
- git-historian(404줄) — Android 릴리즈 태그 이력 분석 패턴 미존재
- cost-analyzer(438줄) — 한국 공공/상용 API 비용 구조 미존재

---

### P6.1 data-scout.md — 한국 공공데이터 탐색 + 레이트 리밋 처리

**현재 상태**: 135줄, 12섹션
**강화 후 목표**: 175~195줄
**강화 방침**: 한국 공공데이터 포털 API 탐색 워크플로우 + 크롤링 제약 처리 패턴 추가

#### DS-1: 한국 공공데이터 포털 탐색 패턴 [data.go.kr, 서울 열린데이터광장]

**추가 위치**: 기존 "학술 논문 탐색" 섹션 다음

```markdown
### DS-1 한국 공공데이터 포털 탐색 패턴

**주요 공공 API 목록 (SubwayMate/지하철 관련 포함):**

| API 제공처 | 데이터 | 포털 | 일일 한도 |
|-----------|------|------|---------|
| 서울 열린데이터광장 | 지하철 실시간 위치 | data.seoul.go.kr | 10,000건 |
| 공공데이터포털 | 기상청 단기예보 | data.go.kr | 10,000건 |
| 공공데이터포털 | 국토교통부 버스/지하철 | data.go.kr | 5,000건 |
| 카카오 API | 지도/경로 | developers.kakao.com | 300,000건 |
| 네이버 클라우드 | 지도/장소 | ncloud.com | 100,000건/월 |

**탐색 절차:**
```
1. 키워드 검색: data.go.kr 또는 data.seoul.go.kr에서 API 명칭 확인
2. 샘플 응답 확인: 인증키 없이 조회 가능한 미리보기 활용
3. 응답 형태 확인: XML 기본 / JSON 선택 가능 여부 확인
4. 변경 이력 확인: 해당 API의 "공지사항" 탭 — 응답 필드 변경 공지 존재 여부
5. 신뢰도 평가: 최근 업데이트 날짜 확인 (6개월 이상 미업데이트 시 → [LOW 신뢰도])
```

**공공 API 응답 형태 주의사항:**
- 한국 공공 API는 필드명 한글/camelCase 혼용 → Retrofit `@SerializedName` 매핑 필수
- `resultCode: "00"` (성공) 외 오류 코드 목록을 API 문서에서 반드시 확인
- API 스펙 최신 여부 조사 → `researcher` 에이전트 위임
```

#### DS-2: 레이트 리밋 + 페이지네이션 처리 패턴

**추가 위치**: DS-1 다음

```markdown
### DS-2 레이트 리밋 + 페이지네이션 처리 패턴

**레이트 리밋 대응 전략:**
```
429 응답 수신 시:
  1단계: Retry-After 헤더 확인 → 지정 시간 대기
  2단계: 헤더 없음 → exponential backoff (1s → 2s → 4s, 최대 3회)
  3단계: 3회 모두 실패 → 수집 중단 + 결과 부분 반환 명시

일일 한도 초과 방지:
  - 세션 내 API 호출 카운터 유지
  - 한도의 80% 도달 시 → 조사 종료 + 사용자 고지
```

**페이지네이션 유형별 처리:**
```
Offset 방식 (공공데이터 표준):
  numOfRows=100&pageNo=1 → pageNo=2 → ... → totalCount로 종료 판단

Cursor 방식 (SNS/댓글 API):
  after={cursor_token} → 응답에 next_cursor 없으면 종료

한도 내 전체 수집 전략:
  전체 건수 = totalCount (1페이지 응답에서 추출)
  예상 총 호출 수 = ceil(totalCount / numOfRows)
  일일 한도 초과 예상 시 → 우선순위 높은 페이지만 수집
```

**준수 원칙 (robots.txt + 이용약관):**
- robots.txt 조회 → 크롤링 허용 경로 확인 후 진행
- 공공 API: 상업적 목적 허용 여부 확인 (공공누리 1~4유형 구분)
- 자동 크롤링 시 1초 이상 간격 유지 (서버 부하 방지)
```

#### P6.1 DoD 체크리스트

- [ ] DS-1 섹션 추가 완료 (공공 API 목록 표 + 탐색 절차 5단계 + 주의사항 포함)
- [ ] DS-2 섹션 추가 완료 (레이트 리밋 3단계 전략 + 페이지네이션 유형 포함)
- [ ] researcher 위임 참조 문구 삽입
- [ ] robots.txt / 공공누리 준수 원칙 포함
- [ ] 기존 12섹션 구조 손상 없음
- [ ] 강화 후 175~195줄 범위 내

---

### P6.2 reasoner.md — 구조화 트레이드오프 스코어링 + Android 결정 패턴

**현재 상태**: 209줄, 14섹션
**강화 후 목표**: 255~275줄
**강화 방침**: 정량적 의사결정 매트릭스 + Android 아키텍처 결정 패턴 추가

#### RS-5: 구조화 트레이드오프 스코어링 매트릭스

**추가 위치**: 기존 "설계 결정 분석" 섹션 다음

```markdown
### RS-5 구조화 트레이드오프 스코어링 매트릭스

**적용 상황:** 2개 이상 기술 옵션 중 하나를 선택해야 할 때

**스코어링 표 (가중 합계 최고점 → 추천):**

| 평가 기준 | 가중치 | 옵션 A (1~5) | 옵션 B (1~5) | 옵션 C (1~5) |
|---------|------|------------|------------|------------|
| 성능/처리 속도 | 0.25 | {점수} | {점수} | {점수} |
| 유지보수 용이성 | 0.25 | {점수} | {점수} | {점수} |
| 팀 학습 비용 | 0.20 | {점수} | {점수} | {점수} |
| 커뮤니티/생태계 | 0.15 | {점수} | {점수} | {점수} |
| 테스트 가능성 | 0.15 | {점수} | {점수} | {점수} |
| **가중 합계** | 1.00 | {합계} | {합계} | {합계} |

**해석 기준:**
```
가중 합계 차이 ≥ 0.5  → 명확한 권장 옵션 존재
가중 합계 차이 < 0.5  → 컨텍스트 의존 (팀 선호도 / 기존 코드베이스 반영)
```

**[IRREVERSIBLE] 플래그 조건:** 점수 1위 옵션이 DB 마이그레이션, 아키텍처 전환,
외부 API 종속 결정을 포함할 경우 → 반드시 롤백 계획 명시
```

#### RS-6: Android 아키텍처 결정 가이드

**추가 위치**: RS-5 다음

```markdown
### RS-6 Android 아키텍처 결정 가이드

**MVVM vs MVI 선택 기준:**

| 기준 | MVVM 권장 | MVI 권장 |
|-----|---------|--------|
| 상태 복잡도 | 단순 (3개 이하 UI 상태) | 복잡 (다중 상태/이벤트 조합) |
| 팀 규모 | 소규모 (1~3명) | 중·대규모 (4명+) |
| 단방향 데이터 흐름 강제 여부 | 선택 | 필수 |
| Kotlin 숙련도 | 중급 이상 | 고급 (Sealed class 적극 활용) |

**Hilt vs Koin 선택 기준:**

| 기준 | Hilt 권장 | Koin 권장 |
|-----|---------|---------|
| Android 표준 준수 | Google 공식 권장 | Kotlin 순수 환경 |
| 컴파일 타임 검증 | ✅ (KSP 기반) | ❌ (런타임 오류) |
| Kotlin Multiplatform | 미지원 | ✅ (KMP 지원) |
| 현재 프로젝트(SubwayMate) | **Hilt 유지 권장** | — |

> ※ reasoner는 아키텍처 결정 권고만 수행.
> 실제 구현 → `executor` 에이전트 위임, 설계 검토 → `architect` 에이전트 위임.
```

#### P6.2 DoD 체크리스트

- [ ] RS-5 스코어링 매트릭스 추가 완료 (5개 기준 × 가중치 테이블 포함)
- [ ] RS-5 [IRREVERSIBLE] 플래그 조건 명시
- [ ] RS-6 MVVM/MVI 선택 기준 표 추가 완료
- [ ] RS-6 Hilt/Koin 선택 기준 표 + SubwayMate 권장안 포함
- [ ] executor / architect 위임 참조 삽입
- [ ] 강화 후 255~275줄 범위 내

---

### P6.3 performance.md — WorkManager/Doze 배터리 최적화 패턴

**현재 상태**: 476줄, 25섹션
**강화 후 목표**: 510~530줄
**강화 방침**: WorkManager + Android Doze/App Standby Bucket 배터리 최적화 패턴 추가 (기존 CPU/Memory/Rendering과 독립 영역)

#### PF-1: WorkManager + Doze 모드 배터리 최적화 [WorkManager 2.9+, Android API 28+]

**추가 위치**: 기존 마지막 전문 섹션 다음

```markdown
### PF-1 WorkManager + Doze 배터리 최적화 패턴 [WorkManager 2.9+, Android API 28+]

**App Standby Bucket 등급 (배경 작업 실행 빈도에 영향):**

| Bucket | 설명 | WorkManager 실행 빈도 |
|--------|-----|-------------------|
| ACTIVE | 최근 사용 중 | 제한 없음 |
| WORKING_SET | 규칙적 사용 | 2시간에 최대 1회 |
| FREQUENT | 간헐적 사용 | 8시간에 최대 1회 |
| RARE | 거의 미사용 | 24시간에 최대 1회 |
| RESTRICTED | 비정상 배터리 소모 | 매우 제한적 |

**권장 Constraints 설정 [WorkManager 2.9+]:**
```kotlin
val constraints = Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)  // 네트워크 연결 시만 실행
    .setRequiresBatteryNotLow(true)                 // 배터리 부족 시 건너뜀
    .setRequiresDeviceIdle(false)                   // Doze 진입 시 대기 여부
    .build()

val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
    .setConstraints(constraints)
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
    .build()
```

**배터리 최적화 면제 요청 안내:**
- "배터리 최적화 제외" 요청은 명확한 이유 필요 (Google Play 정책 — 과도한 요청 시 리젝)
- 실시간 위치 추적류(SubwayMate): Foreground Service + 알림 패턴 권장
- 배터리 소모 측정 및 프로파일링 → 기존 프로파일링 섹션 참조
```

#### P6.3 DoD 체크리스트

- [ ] PF-1 App Standby Bucket 5단계 표 추가 완료
- [ ] PF-1 Constraints 코드 예시 추가 완료 (`[WorkManager 2.9+]` 버전 레이블 포함)
- [ ] 배터리 최적화 면제 요청 안내 (Google Play 정책 준수) 포함
- [ ] Foreground Service 대안 언급 (SubwayMate 컨텍스트 반영)
- [ ] 기존 CPU/Memory/Rendering 섹션과 중복 없음
- [ ] 강화 후 510~530줄 범위 내

---

### P6.4 git-historian.md — Android 릴리즈 태그 이력 분석

**현재 상태**: 404줄, 24섹션
**강화 후 목표**: 440~460줄
**강화 방침**: Android APK/AAB 릴리즈 태그 이력 분석 + gradle.properties 민감 정보 탐지 추가

#### GH-1: Android 릴리즈 태그 이력 분석 패턴

**추가 위치**: 기존 "민감 정보 커밋 탐지" 섹션 다음

```markdown
### GH-1 Android 릴리즈 태그 이력 분석 패턴

**APK/AAB 버전 이력 추출:**
```bash
# 릴리즈 태그 목록 (최신순)
git tag -l "v*" --sort=-v:refname | head -20

# 버전 간 변경사항 요약 (릴리즈 노트 자동 추출)
git log v1.0.0..v2.0.0 --format="- %s (%h)" --no-merges \
  | grep -E "^- (feat|fix|perf)"

# 특정 버전의 빌드 설정 확인
git show v1.5.0:app/build.gradle | grep -E "(versionCode|versionName)"
```

**gradle.properties 민감 정보 탐지 (Android 서명 정보):**
```bash
# Keystore 관련 커밋 이력 탐지
git log --all -p -- gradle.properties \
  | grep -iE "(keystore|keystorePassword|keyAlias|storePassword)"

# 서명 관련 파일 커밋 여부 확인 (*.jks, *.p12)
git log --all --name-only | grep -iE "(signing|keystore|\.jks|\.p12)"

# google-services.json 이력 (Firebase API 키 노출 위험)
git log --all --name-only | grep "google-services.json"
```

**발견 시 대응:**
- `storePassword`, `keyPassword` 값 노출 → 즉시 Keystore 재생성 권고
- `.gitignore`에 `*.jks`, `*.p12`, `signing.properties` 추가 권고
- 이력 정리 절차 → 기존 "민감 정보 발견 시 대응 절차" 섹션 참조
```

#### P6.4 DoD 체크리스트

- [ ] GH-1 APK/AAB 버전 이력 Bash 명령어 블록 추가 완료
- [ ] GH-1 gradle.properties 민감 정보 탐지 명령어 추가 완료
- [ ] 기존 "민감 정보 발견 시 대응 절차" 섹션 참조 연결
- [ ] .gitignore 권고 항목 (*.jks, *.p12) 포함
- [ ] 기존 24섹션 구조 손상 없음
- [ ] 강화 후 440~460줄 범위 내

---

### P6.5 cost-analyzer.md — 한국 공공/상용 API 비용 구조

**현재 상태**: 438줄, 30섹션
**강화 후 목표**: 470~490줄
**강화 방침**: Android 앱 개발 시 자주 사용하는 한국 지도/공공 API의 무료 한도 및 비용 구조 추가

#### CA-1: 한국 공공/상용 API 비용 구조 [2026년 기준 — 정기 재확인 필요]

**추가 위치**: 기존 마지막 비용 분석 섹션 다음

```markdown
### CA-1 한국 공공/상용 API 비용 구조 [2026년 기준 — 정기 재확인 필요]

**주요 API 무료 한도 및 과금 구조:**

| API 제공처 | 서비스 | 무료 한도 | 초과 과금 | 주의사항 |
|-----------|------|---------|---------|---------|
| **카카오맵** | 지도/경로 | 일 300,000건 | 10만건당 1,800원 | 앱 등록 필수 |
| **네이버 지도** | 지도/장소 | 월 100,000건 | 10만건당 5,000원 | NCP 콘솔 관리 |
| **공공데이터포털** | 지하철/기상 등 | 일 10,000건 | 무료 (한도 있음) | API 별도 신청 |
| **서울 열린데이터광장** | 지하철 실시간 | 일 10,000건 | 무료 | 초당 10건 제한 |
| **FCM (Firebase)** | 푸시 알림 | 무제한 | 없음 | 데이터 메시지 기준 |
| **기상청 공공 API** | 날씨 예보 | 일 10,000건 | 무료 | 응답 XML 파싱 필요 |

**비용 이상 탐지 기준 (공공 API 특화):**
```
일일 호출 수 > 한도의 80% 도달 → 캐시 레이어 추가 검토
연속 429 응답 → 일일 한도 초과 신호 → 호출 패턴 최적화
```

**SubwayMate 비용 최적화 권장:**
- 서울 열린데이터광장 API: 1분 캐시 적용 → 동일 노선 중복 호출 방지
- FCM: 데이터 메시지 사용 (notification 메시지는 앱 포그라운드 처리 비용 발생)
- 지도 API 최소화: 지하철 노선 정적 좌표를 앱 내 번들 포함 → 지도 API 호출 절감
```

#### P6.5 DoD 체크리스트

- [ ] CA-1 한국 API 비용 구조 표 추가 완료 (6개 API 포함)
- [ ] 비용 이상 탐지 기준 추가 (공공 API 특화)
- [ ] SubwayMate 비용 최적화 권장사항 포함
- [ ] `[2026년 기준 — 정기 재확인 필요]` 버전 레이블 포함
- [ ] 기존 Firebase/Claude API 섹션과 중복 없음
- [ ] 강화 후 470~490줄 범위 내

---

### P6 실행 전략

```
P6 (동시 실행 가능 — 파일 경계 독립):
  data-scout.md    → DS-1, DS-2 추가
  reasoner.md      → RS-5, RS-6 추가
  performance.md   → PF-1 추가
  git-historian.md → GH-1 추가
  cost-analyzer.md → CA-1 추가
```

**병렬 실행 가능 조건**: 5개 파일 모두 독립적 — 파일 경계 충돌 없음
**실행 명령**: `P6 강화 실제 적용해줘. 워크트리병렬처리로 진행`
**검증**: code-reviewer(sonnet) × 5개 파일 순차 검토

---

*이 문서는 2026-02-23 사전 조사 기반으로 작성되었습니다. 실제 강화 실행 전 Read 툴로 현재 줄 수를 재확인하세요.*
