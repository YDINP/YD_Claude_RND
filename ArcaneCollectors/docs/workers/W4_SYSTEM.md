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
src/systems/PersonalitySystem.js (신규)
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

### Task 4.4: 성격 상호작용 시스템
- [ ] PersonalitySystem.js 생성
- [ ] 상성 데미지 계산
- [ ] 교단-성격 보너스
- [ ] BattleSystem 연동

### Task 4.5: 시너지 시스템 개편
- [ ] SynergySystem.js 개편
- [ ] 4인 파티용 조정
- [ ] 성격 시너지 추가
- [ ] 특수 시너지 확장

### Task 4.6: 전투 시스템 4인 조정
- [ ] BattleSystem.js 4인 조정
- [ ] 성격 기반 데미지 계산
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

### 성격 상성 데미지
| 공격자 | 유리 대상 | 불리 대상 | 효과 |
|-------|----------|----------|------|
| Brave | Cunning | Calm | +20% / -20% |
| Cunning | Calm | Wild | +20% / -20% |
| Calm | Wild | Brave | +20% / -20% |
| Wild | Brave | Cunning | +20% / -20% |
| Mystic | 모든 성격 | - | +10% (고정) |

### 교단-성격 보너스
| 교단 | 최적 성격 | 보너스 |
|-----|---------|-------|
| 발할라 | Brave, Wild | ATK +15% |
| 타카마가하라 | Cunning, Mystic | CRIT +10% |
| 올림푸스 | Brave, Mystic | 스킬 데미지 +15% |
| 아스가르드 | Calm, Wild | HP/DEF +15% |
| 요미 | Cunning, Calm | 디버프 효과 +20% |

---

## 의존성

### W1 (백엔드)에서 받음
- SweepService API
- PartyService API
- BattleService API

### W2 (데이터)에서 받음
- personalities.json (성격 데이터)
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

### PersonalitySystem.js
```javascript
class PersonalitySystem {
  constructor() {}

  // 상성 데미지 배율 계산
  getMatchupMultiplier(attackerPersonality, defenderPersonality) {}

  // 교단-성격 보너스 계산
  getCultBonus(cult, personality) {}
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
[W4][4.4] PersonalitySystem 구현 - 상성 데미지 계산
[W4][4.6] BattleSystem 4인 조정 완료
```
