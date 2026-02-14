# GP-5: 샌드백 보스 + 진행도 시스템

> **시작일**: 2026-02-15
> **브랜치**: `task/GP-5-sandbag-boss`
> **상태**: ✅ 완료

---

## 개요

메인화면 유휴 전투를 "샌드백 보스 + 진행도 누적" 방식으로 전면 개편.

**변경 전**: DPS 누적 → 보스 HP 0 → 자동 다음 스테이지
**변경 후**: 보스는 샌드백(안 죽음) → 데미지 누적 = 진행도 → 100% → 보스전 돌입 → 승리 시 다음 스테이지

---

## 태스크 목록

| # | ID | 태스크 | 파일 | 의존성 | 상태 |
|---|-----|--------|------|--------|------|
| 1 | GP-5.1 | IdleProgressSystem 샌드백 모드 전환 | `src/systems/IdleProgressSystem.js` | 없음 | ✅ 완료 |
| 2 | GP-5.2 | IdleBattleView 진행도 UI 변경 | `src/components/IdleBattleView.js` | GP-5.1 | ✅ 완료 |
| 3 | GP-5.3 | MainMenuScene 보스전 트리거 연동 | `src/scenes/MainMenuScene.js` | GP-5.1, 5.2 | ✅ 완료 |
| 4 | GP-5.4 | BattleScene 보스전 승리 → 스테이지 진행 | `src/scenes/BattleResultScene.js`, `MainMenuScene.js` | GP-5.3 | ✅ 완료 |
| 5 | GP-5.5 | 오프라인 보상 로직 수정 | `src/systems/IdleProgressSystem.js` | GP-5.1 | ✅ 완료 |
| 6 | GP-5.6 | 유닛 테스트 업데이트 | `tests/systems/IdleProgressSystem.test.js` | GP-5.1, 5.4, 5.5 | ✅ 완료 |

**범례**: ⬜ 대기 | 🔄 진행 중 | ✅ 완료 | ❌ 실패/차단

---

## 의존성 그래프

```
GP-5.1 (IdleProgressSystem)
  ├─→ GP-5.2 (IdleBattleView UI)
  │     └─→ GP-5.3 (MainMenuScene 트리거)
  │           └─→ GP-5.4 (BattleScene 연동)
  ├─→ GP-5.5 (오프라인 보상)
  └─────────→ GP-5.6 (테스트) ← GP-5.4, GP-5.5도 선행
```

---

## 상세 작업 로그

### GP-5.1: IdleProgressSystem 샌드백 모드 전환 ✅
- **시작**: 2026-02-15
- **파일**: `src/systems/IdleProgressSystem.js`
- **변경 내용**:
  - [x] simulateBattle()에서 advanceStage() 자동 호출 제거
  - [x] progress 100% 시 `bossReady: true` 플래그 반환 (최초 도달 시에만)
  - [x] accumulatedDamage가 bossHp 초과해도 계속 누적
  - [x] advanceStage()는 외부 호출 전용으로 변경
  - [x] isBossReady() 헬퍼 메서드 추가
- **완료**: 2026-02-15

### GP-5.2: IdleBattleView 진행도 UI 변경 ✅
- **시작**: 2026-02-15
- **파일**: `src/components/IdleBattleView.js`
- **변경 내용**:
  - [x] HP 바 → 진행도 바 (0→100% 채워지는 방향)
  - [x] 진행도 색상: primary(0-60%)→accent/노랑(60-90%)→danger/빨강(90-100%)
  - [x] 보스 샌드백 연출 (흔들림만, 안 죽음)
  - [x] 100% 시 "⚔️ BOSS READY!" 텍스트 + 펄스 효과
  - [x] HP 수치 → 퍼센트 표시 ("67%")
  - [x] defeatBoss() → showBossReady() + clearBossReady() + showStageClear()
- **완료**: 2026-02-15

### GP-5.3: MainMenuScene 보스전 트리거 연동 ✅
- **시작**: 2026-02-15
- **파일**: `src/scenes/MainMenuScene.js`
- **변경 내용**:
  - [x] update()에서 bossReady 체크 → showBossReady() + 1.5초 후 prepareBossBattle()
  - [x] 기존 stageAdvanced 자동 진행 로직 제거
  - [x] bossTransitioning 플래그로 중복 트리거 방지
  - [x] init()에서 bossVictory/bossDefeat 수신
  - [x] createIdleBattleView()에서 보스전 복귀 처리 (승리: advanceStage + showStageClear / 패배: 토스트)
- **완료**: 2026-02-15

### GP-5.4: BattleScene 보스전 승리 → 스테이지 진행 ✅
- **시작**: 2026-02-15
- **파일**: `src/scenes/BattleResultScene.js`
- **변경 내용**:
  - [x] init()에서 mode 수신 (boss/normal)
  - [x] goToNextStage(): boss 모드 시 bossVictory 데이터 전달
  - [x] goToMain(): boss 모드 시 bossVictory/bossDefeat 데이터 전달
  - [x] boss 모드에서 소탕 버튼 비활성화
  - [x] boss 모드 승리 시 "스테이지 진행" 버튼 라벨
- **완료**: 2026-02-15

### GP-5.5: 오프라인 보상 로직 수정 ✅
- **시작**: 2026-02-15
- **파일**: `src/systems/IdleProgressSystem.js`
- **변경 내용**:
  - [x] 오프라인 중 스테이지 진행 불가 (보스전 필요)
  - [x] 진행도만 증가, 100% 초과 시 100%로 캡
  - [x] 보상: 누적 데미지 비율 기반 골드/경험치
  - [x] 반환값에 progressGained, bossReady 추가
- **완료**: 2026-02-15

### GP-5.6: 유닛 테스트 업데이트 ✅
- **시작**: 2026-02-15
- **파일**: `tests/systems/IdleProgressSystem.test.js`
- **변경 내용**:
  - [x] simulateBattle() bossReady 플래그 테스트
  - [x] bossReady 최초 1회만 발화 테스트
  - [x] 100% 이후 데미지 계속 누적 테스트
  - [x] isBossReady() 헬퍼 테스트
  - [x] 오프라인 보상 progressGained 반환 테스트
- **완료**: 2026-02-15

---

## 빌드/테스트 결과

| 시점 | 빌드 | 테스트 | 비고 |
|------|------|--------|------|
| 작업 전 | ✅ | 597/597 | 기준점 |
| GP-5 전체 완료 후 | ✅ | 601/601 | +4 신규 테스트 |

---

## 관련 문서
- PRD: `docs/PRD_Unified_v5.md`
- 현재 상태: `docs/CURRENT_STATUS.md`
- 아키텍처: `docs/ARCHITECTURE.md`
