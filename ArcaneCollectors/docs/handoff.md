# ArcaneCollectors UI/UX 고도화 Handoff

> **시작일**: 2026-02-13
> **브랜치**: `arcane/integration` → 각 태스크별 워크트리
> **담당**: Claude Agent Team (Conductor + 4 Agents)

---

## Sprint 3: UI/UX 고도화

### 목표
1. 화면 해상도 최적화 및 레이아웃 고도화
2. BottomNav 클릭 영역 수정
3. UI 이미지 에셋 적용 (프로젝트 분위기 맞춤)
4. 홈 화면 방치형 게임 컨텐츠 추가
5. 홈에서 모든 핵심 기능 접근 가능하게

### 태스크 구조

| ID | 태스크 | 우선순위 | 난이도 | 에이전트 | 상태 |
|----|--------|---------|--------|---------|------|
| UIX-3.1 | BottomNav 히트영역 + 비주얼 수정 | P0 | LOW | executor-low | ⬜ |
| UIX-3.2 | 홈 방치형 컨텐츠 (자동전투 미니뷰) | P0 | HIGH | executor | ⬜ |
| UIX-3.3 | 홈 퀵액세스 통합 (모든 기능 접근) | P1 | MED | executor | ⬜ |
| UIX-3.4 | 씬별 레이아웃 고도화 (6개 씬) | P1 | MED | executor | ⬜ |
| ART-1.1 | 배경 이미지 (5개 씬) | P1 | LOW | researcher | ⬜ |
| ART-1.2 | UI 아이콘/버튼 이미지 | P2 | LOW | researcher | ⬜ |
| ART-1.3 | 캐릭터 플레이스홀더 이미지 | P2 | LOW | researcher | ⬜ |
| QA-3.1 | Playwright MCP 통합 테스트 | P1 | MED | qa-tester | ⬜ |
| **AUTH-1.1** | 자동로그인 (BootScene 분기) | P1 | MED | executor | 📋 백로그 |
| **AUTH-1.2** | 계정 변경 (SettingsScene) | P1 | MED | executor | 📋 백로그 |
| **AUTH-1.3** | 로그인 화면 개선 (체크박스/최근계정) | P2 | LOW | executor | 📋 백로그 |

### 의존성 그래프
```
UIX-3.1 (BottomNav) ─────────────────────────── 독립
UIX-3.2 (방치형) ────────────────────────────── 독립
UIX-3.3 (퀵액세스) ──→ UIX-3.1 완료 후
UIX-3.4 (레이아웃) ──→ UIX-3.1 완료 후
ART-1.1~1.3 (이미지) ────────────────────────── 독립 (병렬)
QA-3.1 (테스트) ──→ UIX-3.1~3.4 전부 완료 후
```

---

## 변경 이력

### [2026-02-13] Phase 1 실행 시작
- handoff.md 생성
- PRD 태스크 8개 정의
- 워크트리 3개 생성 (s3w1, s3w2, s3w3)
- **Phase 1 병렬 실행**: UI Dev A (s3w1) + UI Dev B (s3w2) + Asset Scout (s3w3)

---

## 실행 Phase 구조

### Phase 1: 병렬 구현 (현재 진행 중 🔄)
| 에이전트 | 워크트리 | 태스크 | 모델 | 상태 |
|---------|---------|--------|------|------|
| UI Dev A | s3w1 | UIX-3.1 (BottomNav) | sonnet | ✅ 완료 (d42c078) |
| UI Dev B | s3w2 | UIX-3.2 (방치형 홈) | sonnet | ✅ 완료 (9da25d1) |
| Asset Scout | s3w3 | ART-1.1~1.3 (이미지) | sonnet | ✅ 완료 (48fd553) |

### Phase 2: 후속 구현 ✅ 완료
| 에이전트 | 워크트리 | 태스크 | 모델 | 상태 |
|---------|---------|--------|------|------|
| UI Dev A | integration | UIX-3.3 + UIX-3.4 | sonnet | ✅ 완료 (dd2b79a) |

### Phase 3: 통합 + 코드 리뷰 + 린트 검증 ✅ 완료
| 에이전트 | 역할 | 검증 항목 | 모델 | 상태 |
|---------|------|----------|------|------|
| Code Reviewer | 크로스 종속성 리뷰 | 7개 항목 검증 | sonnet | ✅ CONDITIONAL PASS |
| Lint Checker | 린트/타입 검증 | tsc/vitest/build | 직접 | ✅ ALL PASS |
| Hotfix | GachaScene 겹침 수정 | ticketY 70→50 | 직접 | ✅ 수정 완료 |

### Phase 3 상세: 검증 결과

#### 린트/빌드 검증 ✅ (직접 실행 완료)
- [x] **tsc --noEmit**: 에러 0개 ✅
- [x] **vitest**: 11 파일, **337/337 통과** (363ms) ✅
- [x] **vite build**: 성공 (4.25s), 218 모듈 ✅
  - index: 665.26 KB (gzip 178.97 KB)
  - phaser: 1,478.63 KB (gzip 339.73 KB)
  - 경고 2개 (MoodSystem/skillAnimationConfig 동적 import — 무시 가능)

#### 코드 리뷰 ✅ (CONDITIONAL PASS → PASS)
- [x] BottomNav ↔ layoutConfig HEIGHT 일치 (120px 양쪽 일치) ✅
- [x] IdleProgressSystem ↔ SaveManager 정합성 (lastLogoutTime, parties, characters) ✅
- [x] IdleBattleView 타이머 정리 (destroy()에서 remove() 호출) ✅
- [x] TextureGenerator ↔ PreloadScene 호출 연결 (3개 메서드 일치) ✅
- [x] BottomNav 텍스처 키 ↔ TextureGenerator 생성 키 일치 (5개 아이콘) ✅
- [x] MainMenuScene 8버튼 씬 이름 전부 유효 ✅
- [x] 6개 씬 콘텐츠 영역 범위 ✅ (GachaScene 티켓버튼 겹침 → **HOTFIX 완료**)

#### FAIL→수정 완료
- GachaScene `ticketY = buttonY + 70` → `+50` (BottomNav y=1160 겹침 방지)

#### WARN (개선 권장, 추후 대응)
1. BottomNav hitArea 상단 마진 균등화
2. IdleProgressSystem getCurrentStage() 정렬 로직 명시화
3. MainMenuScene IdleBattleView ↔ IdleSummary 데이터 갱신 이벤트 연동

---

## 에이전트 팀 구성

| 역할 | 모델 | 담당 태스크 | 이유 |
|------|------|-----------|------|
| **Conductor** | opus | 전체 조율, 리뷰 | 복잡한 의사결정 |
| **UI Dev A** | sonnet | UIX-3.1, UIX-3.3 | 네비/레이아웃 구현 |
| **UI Dev B** | sonnet | UIX-3.2, UIX-3.4 | 방치형/씬 구현 |
| **Asset Scout** | haiku | ART-1.1~1.3 | 이미지 검색/적용 |
| **QA** | sonnet | QA-3.1 | 통합 테스트 |

### 토큰 최적화 전략
- haiku: 단순 파일 작업, 이미지 검색, 상태 확인
- sonnet: 구현 작업 (UI 컴포넌트, 씬 수정)
- opus: 아키텍처 결정, 최종 검증만

---

## 워크트리 (활성)

| 워크트리 경로 | 브랜치 | 태스크 | 상태 |
|-------------|--------|--------|------|
| `D:/park/YD_Claude_RND-s3w1` | `arcane/s3-bottomnav` | UIX-3.1 + UIX-3.3 + UIX-3.4 | ⬜ Ready |
| `D:/park/YD_Claude_RND-s3w2` | `arcane/s3-idle-home` | UIX-3.2 | ⬜ Ready |
| `D:/park/YD_Claude_RND-s3w3` | `arcane/s3-assets` | ART-1.1~1.3 | ⬜ Ready |
| `D:/park/YD_Claude_RND-integration` | `arcane/integration` | 통합/QA | Base |

---

## 기술 결정 사항

### BottomNav 수정 방향 (UIX-3.1)
- hitArea를 **absolute 좌표** 방식으로 변경
- 탭 높이 80→100px, 히트영역 여유분 20px 추가
- 시각 피드백 강화 (Press 애니메이션 추가)

### 방치형 홈 컨텐츠 (UIX-3.2)
- 자동전투 미니뷰 (화면 중앙, 현재 파티가 몬스터 자동 사냥)
- 획득 자원 플로팅 텍스트 (+10 Gold, +1 EXP 등)
- 오프라인 수익 계산 (시간 기반)
- 파티 경험치 게이지 표시

### 홈 퀵액세스 (UIX-3.3)
- 콘텐츠 버튼 6→8개 확장 (소환, 퀘스트 추가)
- 상단바 기능 확장 (레벨, 전투력 표시)
- 빠른 소환 버튼 (홈에서 직접 1회 소환)

### 이미지 에셋 (ART-1)
- 판타지/아케인 분위기 무료 에셋 사용
- 소스: OpenGameArt, Kenney, itch.io (CC0/CC-BY)
- SVG 아이콘 → PNG 변환 (Phaser 호환)

---

## 파일 변경 추적

| 파일 | 태스크 | 변경 유형 | 상태 |
|------|--------|----------|------|
| `src/components/BottomNav.js` | UIX-3.1 | 수정 | ⬜ |
| `src/scenes/MainMenuScene.js` | UIX-3.2, 3.3 | 대폭 수정 | ⬜ |
| `src/systems/IdleProgressSystem.js` | UIX-3.2 | 신규 | ⬜ |
| `src/components/IdleBattleView.js` | UIX-3.2 | 신규 | ⬜ |
| `src/components/QuickAccessPanel.js` | UIX-3.3 | 신규 | ⬜ |
| `src/scenes/GachaScene.js` | UIX-3.4 | 수정 | ⬜ |
| `src/scenes/StageSelectScene.js` | UIX-3.4 | 수정 | ⬜ |
| `src/scenes/HeroListScene.js` | UIX-3.4 | 수정 | ⬜ |
| `src/scenes/TowerScene.js` | UIX-3.4 | 수정 | ⬜ |
| `src/scenes/QuestScene.js` | UIX-3.4 | 수정 | ⬜ |
| `src/scenes/InventoryScene.js` | UIX-3.4 | 수정 | ⬜ |
| `public/assets/backgrounds/` | ART-1.1 | 신규 이미지 | ⬜ |
| `public/assets/ui/` | ART-1.2 | 신규 이미지 | ⬜ |
| `public/assets/characters/` | ART-1.3 | 신규 이미지 | ⬜ |
