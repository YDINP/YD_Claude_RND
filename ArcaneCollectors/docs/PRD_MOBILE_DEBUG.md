# PRD: 모바일 디버그 패널 시스템

## 1. 개요

### 1.1 문제 정의
현재 DebugManager의 치트 패널은 **ESC 키** 기반으로, 모바일 환경에서 접근이 불가능하다. 콘솔(`window.debug`)도 모바일 브라우저에서는 사실상 사용 불가. 개발/테스트 시 모바일 실기기에서 치트 기능을 쓸 수 없어 생산성이 크게 저하된다.

### 1.2 목표
- 모바일에서 터치로 쉽게 열고 닫을 수 있는 디버그 패널
- 기존 DebugManager의 60+ 메서드를 모바일 UI로 노출
- 카테고리별 탭 구조로 정리된 치트 메뉴
- 실시간 게임 상태 모니터링 (FPS, 리소스, 활성 플래그)
- 프로덕션 빌드에서 완전히 제거 가능한 구조

### 1.3 비목표 (Scope 밖)
- 원격 디버깅 (WebSocket 기반 PC→모바일 연동)
- 비개발자용 치트 UI (이 시스템은 개발/QA 전용)
- 기존 DebugManager API 변경 (기존 API 위에 UI 레이어만 추가)

---

## 2. 사용자 시나리오

### 시나리오 A: 모바일 실기기 테스트
> QA가 모바일 크롬에서 게임을 열고, 화면 우측 상단의 🐛 FAB 버튼을 탭.
> 디버그 패널이 슬라이드로 열리며, "리소스" 탭에서 "골드 +100K" 버튼을 탭.
> 즉시 골드가 추가되고 상단 상태바에 반영됨.

### 시나리오 B: 전투 밸런스 테스트
> 개발자가 BattleScene에서 보스전 진입 후, 🐛 FAB을 탭.
> "전투" 탭에서 "무적 ON", "3배속"을 활성화.
> 패널을 닫고 전투 진행. 상태바에 `[GOD 3x]` 표시.

### 시나리오 C: 가챠 확률 테스트
> "가챠" 탭에서 "무료가챠 ON" → "강제 SSR" 활성화.
> 패널 닫고 가챠 10연차 실행. 결과 확인.

### 시나리오 D: 빠른 명령 실행
> FAB 버튼을 **길게 누르면** 퀵 커맨드 입력창이 열림.
> "GOLDRAIN" 입력 → 치트코드 실행.

---

## 3. 기능 상세

### 3.1 진입점: FAB (Floating Action Button)

| 항목 | 스펙 |
|------|------|
| 위치 | 화면 우측 상단, TopBar 아래 |
| 크기 | 48x48px (스케일링: `s(48)`) |
| 아이콘 | 🐛 (텍스트) 또는 기어 아이콘 |
| 동작 | 탭: 패널 토글 / 롱프레스(800ms): 퀵 커맨드 |
| 드래그 | 화면 가장자리로 드래그하여 위치 변경 가능 |
| depth | 8000 (게임 UI 위, 모달 아래) |
| 표시 조건 | `DebugManager.isDebugMode === true` |
| 활성 플래그 표시 | 치트 활성화 시 FAB 배경색 빨강 + 펄스 |

### 3.2 디버그 패널 레이아웃

```
┌─────────────────────────────────┐
│  DEBUG PANEL            [X] 닫기 │  ← 헤더 (40px)
├─────────────────────────────────┤
│ G:999K 💎99K ⚡100 FPS:60      │  ← 상태바 (30px, 실시간)
├─────────────────────────────────┤
│ [리소스][캐릭터][전투][가챠][기타]│  ← 탭 바 (40px, 스크롤)
├─────────────────────────────────┤
│                                 │
│  ┌──────────┐ ┌──────────┐     │
│  │💰 골드    │ │💎 젬     │     │  ← 콘텐츠 영역
│  │  +100K   │ │  +10K    │     │    (스크롤 가능)
│  └──────────┘ └──────────┘     │
│  ┌──────────┐ ┌──────────┐     │
│  │🎫 티켓   │ │📦 MAX    │     │
│  │  +50     │ │  리소스   │     │
│  └──────────┘ └──────────┘     │
│                                 │
├─────────────────────────────────┤
│  [퀵 커맨드 입력...]      [실행] │  ← 하단 커맨드바 (40px)
└─────────────────────────────────┘
```

| 항목 | 스펙 |
|------|------|
| 크기 | 화면 80% 너비, 70% 높이 |
| 위치 | 화면 중앙 |
| 배경 | 0x0A0A1A, alpha 0.97 |
| 애니메이션 | 열기: scaleY 0→1 (200ms), 닫기: 역방향 |
| depth | 8500 |
| 스크롤 | 콘텐츠 영역 터치 스와이프 스크롤 |

### 3.3 탭 구조 및 버튼 목록

#### 탭 1: 리소스
| 버튼 | 동작 | DebugManager 호출 |
|------|------|-------------------|
| 💰 골드 +100K | 골드 추가 | `addGold(100000)` |
| 💎 젬 +10K | 젬 추가 | `addGems(10000)` |
| 🎫 티켓 +50 | 소환권 추가 | `addSummonTickets(50)` |
| 📦 리소스 MAX | 전체 최대 | `maxResources()` |

#### 탭 2: 캐릭터
| 버튼 | 동작 | DebugManager 호출 |
|------|------|-------------------|
| 🦸 전캐릭 해금 | 모든 캐릭터 | `unlockAllCharacters()` |
| ⭐ 전스테이지 클리어 | 진행도 | `clearAllStages()` |
| 🗼 탑 전층 클리어 | 탑 | `clearAllTowerFloors()` |
| ✅ 퀘스트 완료 | 퀘스트 | `completeAllDailyQuests()` |

#### 탭 3: 전투
| 버튼 | 동작 | DebugManager 호출 |
|------|------|-------------------|
| 🛡️ 무적 토글 | ON/OFF | `setInvincible(!invincible)` |
| ⚔️ 원킬 토글 | ON/OFF | `setOneHitKill(!oneHitKill)` |
| 🚀 배속 (1x/2x/3x) | 순환 | `setBattleSpeed(next)` |
| ⚡ 무한에너지 토글 | ON/OFF | `setInfiniteEnergy(!inf)` |
| ⚡ 에너지 충전 | 즉시 충전 | `refillEnergy()` |

#### 탭 4: 가챠
| 버튼 | 동작 | DebugManager 호출 |
|------|------|-------------------|
| 🎲 무료가챠 토글 | ON/OFF | `freeGacha(!free)` |
| 🎯 천장 →89 | 천장 세팅 | `setPityCounter(89)` |
| 💎 강제 SSR | 다음 뽑기 | `setNextPullRarity('SSR')` |
| 🎪 강제 픽업 토글 | ON/OFF | `forcePickup(!force)` |

#### 탭 5: 기타
| 버튼 | 동작 | DebugManager 호출 |
|------|------|-------------------|
| 💾 세이브 내보내기 | JSON 복사 | `exportSave()` |
| 📥 세이브 가져오기 | 입력 모달 | `importSave(json)` |
| 🔄 전체 초기화 | 확인 후 리셋 | `resetAllData()` |
| 🏠 메인으로 | 씬 전환 | 현재씬 → MainMenuScene |
| 🔃 씬 리로드 | 현재 씬 재시작 | `scene.restart()` |
| 📊 상태 덤프 | 전체 상태 로그 | 콘솔 출력 |

### 3.4 토글 버튼 상태 표시

토글형 치트 버튼은 활성/비활성 상태를 시각적으로 구분:
- **활성 (ON)**: 배경 `0x2D5A27` (녹색), 텍스트에 `✓` 접두어
- **비활성 (OFF)**: 배경 `0x222244` (기본), 텍스트 원본

### 3.5 퀵 커맨드 바

패널 하단의 텍스트 입력 + 실행 버튼:
- Phaser DOM Element로 `<input>` 렌더링
- 기존 25종 치트코드 + 직접 메서드 호출 지원
- 예: `GOLDRAIN`, `GODMODE`, `addGold 500000`
- 자동완성: 입력 시 매칭되는 치트코드 목록 표시 (최대 3개)
- 실행 결과를 상태바에 잠시 표시 (2초 후 원래 상태로)

### 3.6 실시간 상태바

패널 상단 상태바에 표시할 정보:
```
G:999,999 💎99,999 ⚡100/100 FPS:60 [GOD 1HIT ∞EN FREE]
```
- 500ms 간격 업데이트
- 활성 치트 플래그를 색상 뱃지로 표시

### 3.7 FAB 미니 상태 표시

패널이 닫혀있을 때, FAB 옆에 축약 상태 표시:
- 활성 치트가 1개 이상이면 FAB 배경 빨강 + 개수 뱃지
- 예: FAB 우측 상단에 빨간 원 `3` (3개 치트 활성)

---

## 4. 활성화 조건

### 4.1 자동 활성화 (개발 환경)
```javascript
// Vite DEV 모드에서 자동 활성화 (기존 로직 유지)
if (import.meta.env?.DEV) {
  DebugManager.setDebugMode(true);
}
```

### 4.2 수동 활성화 (프로덕션)
설정 화면에서 숨겨진 활성화 제스처:
- **방법**: 설정 화면 상단 "ArcaneCollectors" 타이틀을 **7번 연속 탭**
- 활성화 시 토스트: "🐛 Developer mode enabled"
- `localStorage`에 `debug_enabled: true` 저장 (세션 간 유지)
- 비활성화: 같은 제스처로 토글

### 4.3 프로덕션 빌드 제거
- `vite.config.js`에서 `define: { __DEV__: false }` 설정 시 디버그 UI 코드 tree-shake
- 또는 환경변수 `VITE_ENABLE_DEBUG=false`로 완전 제거

---

## 5. 기술 설계

### 5.1 파일 구조
```
src/
  components/
    debug/
      DebugFAB.js          ← FAB 버튼 컴포넌트
      DebugPanel.js         ← 메인 패널 (탭 관리)
      DebugTabContent.js    ← 탭별 콘텐츠 렌더링
      DebugQuickCommand.js  ← 퀵 커맨드 입력바
      DebugStatusBar.js     ← 실시간 상태바
      index.js              ← 통합 export
```

### 5.2 클래스 구조

```javascript
// DebugFAB - 모든 씬에 자동 부착
class DebugFAB {
  constructor(scene)
  show() / hide()
  setPosition(x, y)
  updateBadge(activeCount)  // 활성 치트 개수 뱃지
}

// DebugPanel - 메인 패널
class DebugPanel {
  constructor(scene)
  open(tabIndex?) / close()
  switchTab(index)
  refreshState()            // 토글 상태 갱신
}

// DebugTabContent - 탭별 버튼 그리드
class DebugTabContent {
  constructor(scene, tabConfig)
  render(scrollY)
  handleScroll(deltaY)
}
```

### 5.3 씬 통합 방식

모든 씬의 `create()` 끝에 자동 부착 (DebugManager에서 관리):

```javascript
// DebugManager에 추가
static attachToScene(scene) {
  if (!this.isDebugMode) return;
  this.currentFAB = new DebugFAB(scene);
  // 씬 전환 시 자동 정리
  scene.events.once('shutdown', () => {
    this.currentFAB?.destroy();
  });
}
```

### 5.4 스크롤 구현

Phaser에는 네이티브 스크롤이 없으므로:
- 터치 드래그 이벤트 (`pointermove`)로 deltaY 계산
- 콘텐츠 컨테이너의 y 좌표 조정
- 관성 스크롤 (velocity decay)
- 바운스 효과 (상/하단 경계)
- 마스크로 콘텐츠 영역 클리핑

### 5.5 기존 ESC 패널과의 관계

- ESC 키 패널(`showDebugUI`) 그대로 유지 (PC용)
- 새 모바일 패널은 별도 시스템으로 공존
- 동일한 DebugManager API를 호출하므로 기능 동일
- ESC 패널의 `showDebugPanel`/`hideDebugPanel` 이벤트에도 연동

---

## 6. 구현 태스크

### Phase 1: 핵심 UI (우선순위 높음)
| ID | 태스크 | 예상 규모 |
|----|--------|-----------|
| D-1 | `DebugFAB.js` - FAB 버튼 + 드래그 + 롱프레스 | 소 |
| D-2 | `DebugPanel.js` - 패널 프레임 + 열기/닫기 애니메이션 | 중 |
| D-3 | `DebugTabContent.js` - 탭 바 + 버튼 그리드 + 터치 스크롤 | 대 |
| D-4 | `DebugStatusBar.js` - 실시간 상태 표시 | 소 |
| D-5 | DebugManager 통합 - `attachToScene()` + 기존 API 연결 | 소 |

### Phase 2: 편의 기능
| ID | 태스크 | 예상 규모 |
|----|--------|-----------|
| D-6 | `DebugQuickCommand.js` - 커맨드 입력 + 자동완성 | 중 |
| D-7 | 프로덕션 숨김 제스처 (7탭 활성화) | 소 |
| D-8 | FAB 미니 뱃지 (활성 치트 개수) | 소 |

### Phase 3: 고급 기능
| ID | 태스크 | 예상 규모 |
|----|--------|-----------|
| D-9 | 세이브 가져오기 모달 (JSON 붙여넣기) | 소 |
| D-10 | 실시간 변수 에디터 (골드/젬 직접 입력) | 중 |

---

## 7. 성공 지표

| 지표 | 목표 |
|------|------|
| 모바일 접근성 | 터치만으로 모든 치트 기능 사용 가능 |
| 패널 열기 시간 | FAB 탭 → 패널 표시 200ms 이내 |
| 기존 호환성 | ESC 키 패널 기존 동작 유지 |
| 프로덕션 안전성 | `__DEV__=false` 시 디버그 코드 0바이트 |
| 씬 전환 안정성 | 패널 열린 채 씬 전환 시 크래시 없음 |

---

## 8. 참고: 기존 DebugManager 현황

### 이미 구현된 기능 (재활용)
- 60+ 치트 메서드 (리소스/캐릭터/전투/가챠/장비/탑/퀘스트/세이브)
- 25종 치트코드 (`processCheatCode()`)
- 상태 라인 (`_getStatusLine()`)
- `window.debug` 글로벌 접근
- `window.__TEST_API__` (Playwright 자동화)

### 새로 구현해야 하는 것
- 터치 기반 UI 레이어 (DebugFAB + DebugPanel)
- 탭 네비게이션 + 터치 스크롤
- 씬 자동 부착/해제 라이프사이클
- 퀵 커맨드 입력 UI
