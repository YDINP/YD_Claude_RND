# 무한의탑 클리어 후 다음 단계 미진행 버그 수정

## 버그 원인

`BattleScene.showBattleResult()`에서 `this.mode === 'tower'`일 때 `TowerSystem.clearFloor()` 호출이 누락되어, 타워 층 클리어 후 `currentFloor`가 업데이트되지 않는 문제가 있었습니다.

## 수정 내용

### 1. BattleScene.js (라인 2125-2132)

타워 모드에서 승리 시 `TowerSystem.clearFloor()` 호출을 추가했습니다:

```javascript
// 타워 모드: 층 클리어 처리
if (this.mode === 'tower' && this.towerFloor) {
  TowerSystem.clearFloor(this.towerFloor, {
    victory: true,
    stars: newStars,
    rewards
  });
}
```

### 2. TowerSystem import 추가

`BattleScene.js` 상단에 `TowerSystem` import가 이미 추가되어 있었습니다 (라인 14):

```javascript
import { TowerSystem } from '../systems/TowerSystem.js';
```

## 작동 흐름

1. **전투 승리**: `BattleScene.showBattleResult(victory=true)` 호출
2. **타워 모드 확인**: `this.mode === 'tower'` && `this.towerFloor` 체크
3. **층 클리어 처리**: `TowerSystem.clearFloor()` 호출
   - `currentFloor` → `floor + 1`로 업데이트
   - `highestFloor` 갱신 (신기록일 경우)
   - 보상 지급 (골드, 경험치, 보스 보상 등)
4. **메인 메뉴 복귀**: BattleResultScene → MainMenuScene
5. **타워 팝업 재진입**:
   - `TowerPopup.show()` → `buildContent()` → `loadTowerData()`
   - `TowerSystem.getProgress()`로 갱신된 `currentFloor` 로드

## 검증

### TypeScript 타입 체크
```bash
npx tsc --noEmit
# ✓ 0 errors
```

### 단위 테스트
```bash
npx vitest run tests/systems/TowerSystem.test.js
# ✓ 22 tests passed (새 테스트 1개 추가)
```

**추가된 테스트**: `updates currentFloor to next floor on victory`
- 층 클리어 시 `currentFloor`이 다음 층으로 업데이트되는지 검증
- `SaveManager.save()`가 올바른 데이터로 호출되는지 확인

### 전체 테스트
```bash
npx vitest run
# ✓ 22 test files, 598 tests passed
```

## 기존 시스템 영향

- ✅ 일반 스테이지 클리어 로직 영향 없음
- ✅ 보스 모드 전투 영향 없음
- ✅ 기존 TowerSystem 테스트 모두 통과
- ✅ 전체 프로젝트 테스트 모두 통과

## 완료 일자

2026-02-15
