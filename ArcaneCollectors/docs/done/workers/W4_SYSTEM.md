# W4: 게임 시스템 Worker 가이드

## 개요
- **브랜치**: `arcane/w4-system`
- **폴더**: `D:\park\YD_Claude_RND-w4`
- **담당**: 게임 시스템 로직

---

## 파일 소유권

```
src/systems/EnergySystem.js (신규)
src/systems/SweepSystem.js (신규)
src/systems/PartyManager.js (신규)
src/systems/MoodSystem.js (신규 - 분위기 시스템)
src/systems/SynergySystem.js (개편)
src/systems/BattleSystem.js (개편)
```

---

## 태스크 목록

### Task 4.1: 에너지 시스템 구현
- [ ] EnergySystem.js 생성
- [ ] 최대 에너지 계산
- [ ] 시간 기반 회복
- [ ] 보석 충전
- [ ] SaveManager 연동

### Task 4.2: 소탕 시스템 구현
- [ ] SweepSystem.js 생성
- [ ] 조건 체크 (별 3개)
- [ ] 보상 계산
- [ ] 소탕권 소모
- [ ] 일일 제한

### Task 4.3: 파티 저장 시스템 구현
- [ ] PartyManager.js 생성
- [ ] 5개 슬롯 관리
- [ ] 활성 파티 지정
- [ ] 서버 동기화

### Task 4.4: 분위기 상호작용 시스템
- [✅] MoodSystem.js 생성 완료
- [✅] 9×9 상성 데미지 계산 (배열 기반)
- [✅] 교단-분위기 보너스
- [ ] BattleSystem 연동

### Task 4.5: 시너지 시스템 개편
- [✅] SynergySystem.js 개편 완료
- [✅] 4인 파티용 조정
- [✅] 분위기 시너지 추가 (9종 기반)
- [✅] 특수 시너지 확장

### Task 4.6: 전투 시스템 4인 조정
- [ ] BattleSystem.js 4인 조정
- [ ] 분위기 기반 데미지 계산 (속성 시스템 제거)
- [ ] 에너지 소모 연동

---

## 시스템 참조

### 에너지 시스템
| 항목 | 값 |
|------|---|
| 최대 에너지 | 100 + (레벨 × 2) |
| 회복 속도 | 5분당 1 |
| 레벨업 시 | 전량 회복 |
| 보석 충전 | 50보석 = 50에너지 |

### 스테이지별 에너지 소모
| 유형 | 소모 |
|------|-----|
| 일반 | 6 에너지 |
| 엘리트 | 12 에너지 |
| 보스 | 20 에너지 |

### 소탕 시스템
| 항목 | 내용 |
|------|------|
| 조건 | 별 3개 클리어 완료 |
| 비용 | 에너지 + 소탕권 1장 |
| 결과 | 즉시 보상 획득 (전투 스킵) |
| 제한 | 일일 50회 |

### 분위기 상성 데미지
9×9 배열 기반 상성 매트릭스
각 분위기는 다른 8개 분위기에 대해 개별 보정값 적용
상세 데이터는 MoodSystem.js 참조

### 교단-분위기 보너스
| 교단 | 최적 분위기 | 보너스 |
|-----|---------|-------|
| 발할라 | brave, fierce, wild | ATK +15% |
| 타카마가하라 | cunning, mystic | CRIT +10% |
| 올림푸스 | brave, noble, mystic | 스킬 데미지 +15% |
| 아스가르드 | calm, stoic, devoted | HP/DEF +15% |
| 요미 | cunning, calm | 디버프 효과 +20% |

---

## 의존성

### W1 (백엔드)에서 받음
- SweepService API
- PartyService API
- BattleService API

### W2 (데이터)에서 받음
- characters.json (캐릭터 mood 데이터)
- synergies.json (시너지 데이터)
- stages.json (스테이지 에너지 소모)

---

## 클래스 구조 예시

### EnergySystem.js
```javascript
class EnergySystem {
  constructor(saveManager) {}

  getMaxEnergy(playerLevel) {}
  getCurrentEnergy() {}
  consumeEnergy(amount) {}
  recoverEnergy() {}
  chargeWithGems(gems) {}
}
```

### MoodSystem.js
```javascript
class MoodSystem {
  constructor() {}

  // 상성 데미지 배율 계산 (9×9 매트릭스)
  getMatchupMultiplier(attackerMood, defenderMood) {}

  // 교단-분위기 보너스 계산
  getCultBonus(cult, mood) {}
}
```

### SweepSystem.js
```javascript
class SweepSystem {
  constructor(energySystem, saveManager) {}

  canSweep(stageId) {}          // 조건 체크
  getSweepCost(stageId) {}      // 비용 계산
  executeSweep(stageId) {}      // 소탕 실행
  getDailyRemaining() {}        // 남은 횟수
}
```

---

## 커밋 예시
```
[W4][4.1] EnergySystem 구현 - 최대 에너지 및 회복 로직
[W4][4.4] MoodSystem 구현 - 9×9 상성 데미지 계산
[W4][4.6] BattleSystem 4인 조정 완료 - 분위기 기반 데미지
```
