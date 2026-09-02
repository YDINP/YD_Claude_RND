# TOWER-01 감사 리포트 + TOWER-02 100층 완성 기록

> **작성일**: 2026-08-25
> **범위**: TowerScene ↔ TowerSystem ↔ tower.json 연결 추적, tower.json 100층 완성
> **근거**: PLAN_COMPLETION_STAGE.md TOWER-01/02, PRD_ArcaneCollectors_v5.md §5 무한의 탑

---

## 1. 감사 결론 (TOWER-01)

### 1.1 동작 확인 ✅

| 체인 | 경로 | 판정 |
|------|------|------|
| 진행도 로드/표시 | TowerScene.create → TowerSystem.getProgress/getFloorInfo → 층 원형 UI·난이도·보상 미리보기 | ✅ 실동작 |
| 전투 진입 | 도전 버튼 → 에너지 소비(일반 12/보스 20) → battleEntryTransition(mode:'tower') | ✅ 실동작 |
| 층 클리어 처리 | BattleScene.js:2156 → TowerSystem.clearFloor(towerFloor, {victory}) | ✅ 실동작 |
| 보상 지급/저장 | clearFloor → _grantRewards → SaveManager.addGold/addGems/addSummonTickets → save | ✅ 실동작 (최고층·현재층·totalClears 갱신 포함) |
| 결과 복귀 | BattleResultScene mode==='tower' → TowerScene 복귀 | ✅ 실동작 |
| 리셋 | 탑 리셋 버튼 → resetTower → 최고층 기준 젬 보상 + 진행도 초기화 | ✅ 실동작 (월간 자동 리셋 스케줄러는 없음 — 수동 버튼만, TOWER-03 영역) |
| 이벤트 | FLOOR_CLEARED/NEW_HIGH_FLOOR/BOSS_FLOOR_REACHED/TOWER_RESET 발화, GameEvents.ACHIEVEMENT_UNLOCKED 실존(EventBus.js:203) | ✅ |

### 1.2 버그/미완성 목록

| # | 등급 | 내용 | 조치 |
|---|------|------|------|
| B-1 | 🔴 치명 | **타워 적 구성이 실제 전투에 미반영.** BattleScene.init은 `data.stage`만 읽는데 TowerScene은 `stage` 없이 `enemies`만 전달 → `this.stage` undefined → initializeBattlers가 레거시 **랜덤 적 3마리** 생성(BattleScene.js:266,300). tower.json의 층별 적/보스 구성이 플레이에 전혀 반영되지 않았음 | ✅ 수정: TowerScene.startTowerBattle이 `{id,count}`를 `{id,level}` 배열로 확장해 stage 합성 전달 (`tower_floor_N`) |
| B-2 | 🟡 | 권장 전투력 곡선이 요구사항 불일치 — 기존 `1000×difficulty` 방식(1층 1000 → 100층 ~9,900) | ✅ 수정: floorData 권장값 우선, 폴백은 500→25,000 선형(PRD §5.2) |
| B-3 | 🟡 | tower.json 21층만 존재 → 나머지 79층은 `_generateFloorInfo` 자동 생성에 의존(보스가 전부 고블린 킹) | ✅ TOWER-02로 해소 (아래 §2) |
| B-4 | 🟢 알려진 미완성(TODO 주석 존재) | 경험치는 `expGranted` 기록만(파티 지급 없음) — 단, BattleScene이 승리 시 별도로 캐릭터 EXP 지급하므로 루프상 경험치는 흐름 / 장비 드롭은 `equipmentDropped` 플래그만 | 문서화. 후속 태스크(EquipmentSystem 연동) 권장 |
| B-5 | 🟢 | ssrTicket은 rewards 기록만 되고 별도 저장 필드 없음(SaveManager에 티켓 풀 1종) | 문서화. 티켓 종류 분리 시 SaveManager 확장 필요 |
| B-6 | 🟢 스코프 외 | components/popups/TowerPopup.js가 B-1과 동일한 버그 보유(스코프 외 파일) | 미수정 — 별도 태스크 권장 |
| B-7 | 🟢 설계 특성 | 하위 층 재클리어 시 currentFloor가 클리어 층+1로 갱신됨(점프로 상위층 복귀 가능하나 UX 혼란 여지) | 유지 — jumpToFloor로 커버 가능 |

---

## 2. 100층 완성 내역 (TOWER-02)

### 2.1 tower.json 구조
- `floors`: **21개 → 100개** (1~100 빈틈 없음)
- 층 스키마(기존 일관): `floor`, `enemies[{id,count}]`, `recommendedPower`, `isBoss`, `bossReward`(보스층만)
- 1~9층 및 10개 보스 보상(gems/srTicket/ssrTicket)은 기존 샘플 값 보존

### 2.2 난이도 곡선
- `recommendedPower`: 1층 **500** → 100층 **25,000**, 선형 완만곡선(층당 ≈247), 단조 증가
- 적 레벨은 TowerScene에서 `floor/10`(1~10)로 스케일되어 전투에 반영

### 2.3 적 구성 (enemies.json 실존 id만 사용 — 65종 확인)
- 1~9층: 기존 구성 유지 (슬라임/고블린/늑대 계열)
- 11~30층: 엘리트 진입 (미노타우르스, 메두사, 온니 어린 것, 강시, 병마용 등)
- 31~50층: 사령/서리 계열 (드라우그, 리치, 둘라한, 펜리르 새끼, 오니 무장 등)
- 51~70층: 상급 엘리트 (데스 드래곤, 리치, 리치+흡혈 조합 등)
- 71~99층: 전설급 재편성 (데스 드래곤 다수, 리치, 밴시, 레이스)
- 보스층: `enemy_tower_guardian_10~50`(기존) + **60/70/80/90/100 신규 5종 추가**
  - HP 8,500→24,000 / ATK 150→250 계단식, 60층부터 엘리트 호위 1~2종 동반
  - 100층: 수호자 Lv100 + 다크 로드

### 2.4 보상 구조 (PRD §5.2 매핑)
| 층 | gold/exp(기존 유지) | equipmentChance | shardRarity(신설) |
|----|----|----|----|
| 1-10 | 1,000 / 500 | 0 | null |
| 11-30 | 2,000 / 1,000 | 0.1 | R 장비 조각 |
| 31-50 | 5,000 / 2,000 | 0.2 | SR 장비 조각 |
| 51-70 | 10,000 / 5,000 | 0.3 | SSR 장비 조각 |
| 71-100 | 20,000 / 10,000 | 0.5 | 전설 재료(LEGENDARY) |

- `shardRarity`는 calculateRewards/clearFloor 결과에 전달되어 UI/지급 확장 대비 (기존 필드 스키마 유지 + 추가만)

### 2.5 enemies.json 추가 (5종)
`enemy_tower_guardian_60/70/80/90/100` — 기존 수호자 시리즈와 동일 스키마(type: tower_boss), 스킬 id는 모두 기존 사용분 재사용

## 3. 검증 결과 (2026-08-25)

| 항목 | 결과 |
|------|------|
| `npm run validate:data` | ✅ 4개 데이터 전부 통과 (enemies 추가 포함) |
| `npx vitest run tests/systems/TowerSystem.test.js` | ✅ **32/32 통과** (기존 테스트 전량 유지 + 실데이터 무결성 7건 신설) |
| `node -e floors.length` | ✅ `floors.length = 100` |
| `npx tsc --noEmit` | ✅ 에러 0 |
| `eslint` (수정 파일 2종) | ✅ error 0 (기존 warning 2건만 존재) |
| 회귀 (tests/data + RaidSystem) | ✅ 124/124 통과 |
