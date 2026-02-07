# D-2: 전투 E2E 테스트 결과

> 검증일: 2026-02-07 | 결과: **13/13 PASS**

## 검증 항목

| # | 항목 | 결과 | 증거 |
|---|------|------|------|
| 1 | 파티 입장 스탯 정확성 | PASS | BattleScene.initializeBattlers() L160 |
| 2 | 턴 시스템 (SPD순) | PASS | BattleScene.processTurn() L1119 |
| 3 | Mood 상성 배율 적용 | PASS | BattleScene.getMoodMatchup() L233 |
| 4 | 시너지 버프 적용 | PASS | BattleScene.applySynergyBuffs() L136 |
| 5 | 스킬 실행 (basic/skill1/skill2) | PASS | BattleScene.executeBattlerAction() L1254 |
| 6 | 데미지 계산 | PASS | BattleScene._executeSingleAttack() L1370 |
| 7 | 사망 처리 | PASS | target.isAlive = false + playDeathAnimation() |
| 8 | 승리/패배 조건 | PASS | BattleScene.checkBattleEnd() L1684 |
| 9 | 보상 처리 (Gold/EXP) | PASS | ProgressionSystem.addExp() + SaveManager.addGold() |
| 10 | 별점 계산 (1-3성) | PASS | BattleScene.showBattleResult() L1767 |
| 11 | 씬 전환 + 데이터 전달 | PASS | scene.start('BattleResultScene', data) L1823 |
| 12 | SynergySystem 통합 | PASS | SynergySystem.calculatePartySynergies() |
| 13 | MoodSystem 통합 | PASS | moodSystem.getMatchupMultiplier() |

## 데미지 공식
```
damage = max(1, floor(
  ATK * skillMultiplier * critMultiplier * moodMultiplier *
  (1 - DEF / (DEF + 200)) * (0.9 + random * 0.2)
))
```

## 별점 기준
- 3성: 전원 생존 + HP 50%↑ (또는 20턴 이내 보너스)
- 2성: 50%+ 생존
- 1성: 승리
