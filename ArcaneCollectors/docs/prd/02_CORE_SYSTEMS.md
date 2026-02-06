# 2. 핵심 게임 시스템
> 원본: PRD_Unified_v5.md §2

## 2. 핵심 게임 시스템

### 2.1 캐릭터 시스템

#### 등급 체계
| 등급 | 별 | 가챠 확률 | 기본 스탯 범위 | 최대 레벨 |
|------|-----|----------|---------------|-----------|
| **N** (2성) | ★★ | 60% | HP 300-400, ATK 30-40 | 40 |
| **R** (3성) | ★★★ | 30% | HP 500-700, ATK 50-80 | 50 |
| **SR** (4성) | ★★★★ | 8.5% | HP 800-1100, ATK 90-130 | 60 |
| **SSR** (5성) | ★★★★★ | 1.5% | HP 1200-1600, ATK 140-200 | 80 |

#### 분위기 (Mood) 시스템 — v4에서 Element 대체, v5.2에서 성격→분위기 리네이밍

> **변경 이력**: Element(속성) → Personality(성격) → **Mood(분위기)** 로 최종 확정
> **코드 필드명**: `mood` (기존 `personality` → `mood` 마이그레이션 필요)
> **컨셉**: 캐릭터의 전투 스타일과 존재감을 나타내는 "분위기/오라" 개념

**분위기 그룹 (v5.3 확장: 5종 → 9종)**

| 그룹 | 분위기 | 한글명 | 유리 상대 (×1.2) | 불리 상대 (×0.8) | 전투 스타일 |
|------|--------|--------|------------------|------------------|------------|
| **공격형** | **Brave** | 열혈 | Cunning, Noble | Fierce, Wild | 공격적, 돌진형 |
| | **Fierce** | 격렬 | Brave, Stoic | Devoted, Mystic | 폭발적 순간화력 |
| | **Wild** | 광폭 | Brave, Calm | Stoic, Cunning | 속공형, 연타형 |
| **방어형** | **Calm** | 고요 | Wild, Mystic | Cunning, Devoted | 방어적, 지구전형 |
| | **Stoic** | 의연 | Fierce, Wild | Brave, Noble | 불굴의 탱커 |
| | **Devoted** | 헌신 | Calm, Noble | Fierce, Mystic | 회복·보호 특화 |
| **전략형** | **Cunning** | 냉철 | Calm, Devoted | Brave, Wild | 전략적, 약점 공략 |
| | **Noble** | 고결 | Stoic, Mystic | Brave, Devoted | 리더십, 버프형 |
| | **Mystic** | 신비 | Calm, Devoted | Fierce, Noble | 특수효과, 마법형 |

> **상성 구조 (v5.3)**: 각 분위기는 2개 유리/2개 불리, 5개 중립(×1.0)
> - 유리 상대: 데미지 ×1.2
> - 불리 상대: 데미지 ×0.8
> - 중립 상대: 데미지 ×1.0
> - Mystic의 범용 ×1.1 보너스는 삭제됨 (밸런스 조정)
> **기존 속성(Element) 시스템은 v5.2에서 완전 삭제됨** — fire/water/wind/light/dark 참조 119개 마이그레이션 완료

#### 교단 (Cult) — v5.3 확장: 5종 → 9종
| 교단 | 한글명 | 신화권 | 테마 색상 | 연계 분위기 |
|------|--------|--------|----------|-----------|
| **Olympus** | 올림포스 | 그리스 | #1976D2 | Cunning (냉철) |
| **Takamagahara** | 다카마가하라 | 일본 | #D32F2F | Mystic (신비) |
| **Valhalla** | 발할라 | 북유럽 | #7B1FA2 | Brave (열혈) |
| **Asgard** | 아스가르드 | 북유럽 | #0288D1 | Calm (고요) |
| **Yomi** | 요미 | 일본 | #512DA8 | Wild (광폭) |
| **Tartarus** | 타르타로스 | 그리스 심연 | #B71C1C | Fierce (격렬) |
| **Avalon** | 아발론 | 켈트 | #4CAF50 | Noble (고결) |
| **Helheim** | 헬헤임 | 북유럽 명계 | #455A64 | Stoic (의연) |
| **Kunlun** | 곤륜 | 중국 | #FF9800 | Devoted (헌신) |

> 교단-분위기 매칭: 해당 교단 캐릭터가 연계 분위기를 가질 경우 스탯 ×1.15 보너스

#### 역할 (Role)
| 역할 | 특성 | 스탯 경향 |
|------|------|----------|
| **Warrior** (전사) | 높은 HP/DEF, 근접 물리 | HP↑, DEF↑, ATK중 |
| **Mage** (마법사) | 높은 ATK, 원거리 마법 | ATK↑↑, HP↓, DEF↓ |
| **Archer** (궁수) | 높은 SPD, 원거리 물리 | SPD↑, ATK↑, HP중 |
| **Healer** (힐러) | 아군 회복, 버프 | HP중, DEF중, SPD↑ |

#### 캐릭터 데이터 스키마 (v5.2 확정)
```javascript
{
  id: "olympus_athena",        // {cult}_{name}
  name: "Athena",              // 영문 이름
  nameKo: "아테나",             // 한글 이름
  rarity: "SSR",               // N, R, SR, SSR
  mood: "calm",                // brave, cunning, calm, wild, mystic, fierce, stoic, devoted, noble ← v5.3: 9종 확장
  cult: "olympus",             // 교단
  role: "mage",                // warrior, mage, archer, healer
  baseStats: { hp: 1400, atk: 180, def: 90, spd: 105 },
  growthStats: { hp: 45, atk: 8, def: 3, spd: 1 },
  skills: ["skill_athena_basic", "skill_athena_active", "skill_athena_ultimate"],
  description: "지혜의 여신, 전략적 마법으로 전장을 지배한다",
  lore: "올림포스 최고의 전략가..."
  // ※ element 필드 삭제됨 (v5.2)
  // ※ personality → mood 리네이밍 (v5.2)
}
```

#### 현재 데이터 현황 & 목표 (v5.3 확장)
| 교단 | 현재 | 목표 | 누락 |
|------|------|------|------|
| Olympus | 9 | 16 | 7 |
| Takamagahara | 9 | 16 | 7 |
| Valhalla | 9 | 16 | 7 |
| **Asgard** | **3** | 16 | **13** |
| Yomi | 9 | 16 | 7 |
| **Tartarus** (신규) | 0 | 9 | 9 |
| **Avalon** (신규) | 0 | 9 | 9 |
| **Helheim** (신규) | 0 | 9 | 9 |
| **Kunlun** (신규) | 0 | 9 | 9 |
| **합계** | **39** | **91** | **52** |

등급 목표 분포 (v5.3): N:18 / R:27 / SR:27 / SSR:19

### 2.2 가챠 (소환) 시스템

#### 확률 테이블 (PRD v4 최종)
| 등급 | 확률 | 천장 |
|------|------|------|
| N | 60% | - |
| R | 30% | - |
| SR | 8.5% | - |
| SSR | 1.5% | 90회 확정 |

#### 소프트 피티 (Soft Pity)
- 70회부터 SSR 확률 점진적 증가
- 70회: +2%, 71회: +4%, ... 89회: +40%
- 90회: 100% SSR 확정

#### 비용
| 소환 타입 | 비용 | 비고 |
|-----------|------|------|
| 단일 소환 | 보석 300개 | - |
| 10연차 | 보석 2,700개 | 10% 할인 |
| 단일 티켓 | 소환권 1장 | - |
| 10연차 티켓 | 소환권 10장 | SR 이상 1회 보장 |

#### 픽업 배너
- 픽업 캐릭터 확률 UP (SSR 중 50% 픽업 대상)
- 180회 내 픽업 캐릭터 확정 (50/50 실패 시 보장)

#### ⚠️ 현재 구현 문제점
```
[치명적] GachaScene.rollGacha()가 GachaSystem을 사용하지 않음
- 인라인 확률: SSR:3%, SR:15%, R:50%, N:32% (PRD와 불일치)
- mood 기반으로 교체 완료, v5.3에서 9종 분위기 대응 필요
- characters.json 데이터를 사용하지 않고 랜덤 이름/스탯 생성
- GachaSystem의 소프트피티, 픽업, 배너 기능 완전 무시
→ 해결: GachaScene이 GachaSystem.pull()을 호출하도록 전면 교체 + 9종 분위기 풀 적용

[치명적] 하드코딩 UI 텍스트 (동적이어야 함)
- 천장 카운터 "87/90" 하드코딩 (GachaScene:273) → registry.get('pityCounter') 사용
- 소환권 "5개 보유 중" 하드코딩 (GachaScene:297) → SaveManager 인벤토리 참조
- 표시 확률 "SSR 1.5%" (GachaScene:280) vs 실제 코드 확률 SSR 3% → 불일치

[치명적] GachaSystem.saveGachaInfo() 메서드가 SaveManager에 미존재
- GachaSystem.js:147에서 호출하지만 SaveManager에 해당 메서드 없음
→ 해결: SaveManager에 saveGachaInfo() 추가 또는 GachaSystem 저장 로직 수정
```

### 2.3 전투 시스템

#### 턴제 자동전투 + 카드덱 스킬
- **파티 구성**: 4인 편성
- **턴 순서**: SPD 기반 정렬
- **스킬 카드**: 매 턴 3장 드로우, 1장 선택
- **자동전투**: AI가 최적 카드 선택
- **배속**: 1x, 2x, 3x

#### 데미지 공식 (v5.3 확장)
```
baseDamage = ATK × skillMultiplier - DEF × 0.5
moodBonus = baseDamage × matchupMultiplier (유리: ×1.2, 불리: ×0.8, 중립: ×1.0)
cultMoodBonus = baseDamage × 1.15 (교단-분위기 연계 시)
synergyBonus = baseDamage × synergyMultiplier
finalDamage = (baseDamage + moodBonus + cultMoodBonus + synergyBonus) × random(0.9~1.1)
criticalDamage = finalDamage × 1.5 (critRate: 5% + SPD×0.1%)
```

> **v5.3 변경점**:
> - 분위기 상성: 9×9 매트릭스 (각 분위기마다 2개 유리/2개 불리, 5개 중립)
> - Mystic의 범용 ×1.1 보너스 삭제 → 일반 상성 구조로 통일
> - 교단-분위기 연계 보너스 추가 (×1.15)

#### 별점 계산 (클리어 평가)
```
3성: 전원 생존 AND 10턴 이내 클리어
2성: 과반 생존 (≥50%) OR 20턴 이내 클리어
1성: 클리어만 하면 달성
```

#### ⚠️ 현재 구현 문제점
```
[치명적] calculateMoodBonus()가 5종 분위기 기반 → **v5.3에서 9종 확장 대응 필요**
- MoodSystem의 상성 매트릭스를 9×9로 확장 (각 분위기마다 2개 유리/2개 불리)
- Mystic의 범용 ×1.1 보너스 로직 삭제
→ 해결: MoodSystem 업데이트 (v5.3: 9종 분위기 상성 구조)

[치명적] BattleSystem 클래스가 BattleScene에서 import조차 안 됨
- 전투 로직 전체가 BattleScene 내부 인라인 구현
→ 해결: BattleSystem 메서드를 BattleScene에서 호출하도록 리팩터링

[치명적] EXP 보상 UI 표시만 ("+50 EXP"), 영웅 데이터에 실제 미적용
- BattleScene:1362에서 텍스트 표시만, ProgressionSystem.addExp() 미호출
→ 해결: ProgressionSystem 연결 + 레벨업 체크

[중요] showBattleResult()에서 newStars = 3 하드코딩
→ 해결: 별점 계산 로직 구현

[중요] SynergySystem 미사용 (인라인 시너지 계산)
- BattleScene에서 자체 인라인으로 시너지 계산 (class 2+: ATK+10%, mood 2+: DEF+10%)
- SynergySystem 클래스의 교단/분위기/역할/특수 시너지와 다름
- v5.3: 교단별 분위기 보너스(×1.15) 추가 필요
→ 해결: 인라인 로직 제거, SynergySystem.calculate() 호출로 교체 (9종 분위기 대응)
```

### 2.4 에너지 시스템

#### 스펙
| 항목 | 값 |
|------|-----|
| 기본 최대 | 50 |
| 회복 속도 | 5분당 1 |
| 스테이지 비용 | 챕터 × 2 + 스테이지번호 |
| 보석 충전 | 50보석 → 최대 에너지 |
| 레벨 보너스 | 10레벨당 최대+5 |

#### ⚠️ 현재 구현 문제점
```
[치명적] StageSelectScene.startBattle()에서 에너지 체크/소비 없음
- EnergySystem 미 import
- "⚡ 50/50" 하드코딩 표시
→ 해결: startBattle() 전에 canEnterStage() 체크, consumeEnergy() 호출
```

### 2.5 소탕 (Sweep) 시스템

#### 스펙
- 조건: 해당 스테이지 3성 클리어
- 비용: 소탕권 1장 + 에너지 (스테이지 비용과 동일)
- 일일 한도: 50회
- 보상: 해당 스테이지 보상의 90%

#### ⚠️ 현재 구현 문제점
```
[치명적] UI 버튼이 어디에도 없음
- SweepSystem 완전 구현됨, 호출 경로 없음
→ 해결: StageSelectScene에 소탕 버튼 추가
```

### 2.6 무한의 탑 (Tower)

#### 스펙
- 최대 100층
- 10층마다 보스
- 보스 처치 시 장비 드롭
- 시즌 리셋 (선택적)

#### ⚠️ 현재 구현 문제점
```
[치명적] TowerScene.js 미존재
- TowerSystem(531줄) 완전 구현됨
- TowerSystem.jumpToFloor() 등 API 존재
→ 해결: TowerScene 신규 생성
```

### 2.7 장비 시스템

#### 슬롯
| 슬롯 | 주요 스탯 |
|------|----------|
| Weapon (무기) | ATK |
| Armor (방어구) | DEF, HP |
| Accessory (악세서리) | SPD, CritRate |
| Relic (유물) | 특수 효과 |

#### 강화
- 최대 +15
- 강화 비용: 골드 × (현재 강화 레벨 × 100)
- 성공률: +1~5(100%), +6~10(80%), +11~15(50%)

#### ⚠️ 현재 구현 문제점
```
[중요] equipment.json에 4개 아이템만 존재 (목표: v5.3에서 91개)
[중요] 장비 가챠 탭 비활성화 ("준비 중")
→ 해결: 데이터 확장 + 가챠 탭 활성화 (9개 교단 테마 장비 추가)
```

### 2.8 스테이지 시스템

#### 구성 (v5.3 확장: 9개 교단)
| 챕터 | 교단 테마 | 스테이지 수 | 보스 |
|------|----------|------------|------|
| Chapter 1 | Olympus | 5 | Zeus |
| Chapter 2 | Takamagahara | 5 | Amaterasu |
| Chapter 3 | Valhalla | 5 | Odin |
| Chapter 4 | Asgard | 5 | Thor |
| Chapter 5 | Yomi | 5 | Izanami |
| Chapter 6 | Tartarus | 5 | Kronos |
| Chapter 7 | Avalon | 5 | Arthur |
| Chapter 8 | Helheim | 5 | Hel |
| Chapter 9 | Kunlun | 5 | Jade Emperor |

#### ⚠️ 현재 구현 문제점
```
[치명적] StageSelectScene.generateStages()가 3챕터×10스테이지 하드코딩
- stages.json은 v5.3에서 9챕터×5스테이지로 확장 필요
→ 해결: generateStages() 제거, stages.json 동적 로드 (9개 교단 챕터 대응)
```

### 2.9 시너지 시스템

#### 타입
| 시너지 타입 | 조건 | 효과 예시 |
|------------|------|----------|
| 교단 시너지 | 같은 교단 2/3/4인 | ATK+10%/+20%/+30% |
| 분위기 시너지 | 특정 분위기 조합 | 다양한 버프 (v5.3: 9종 분위기 기반) |
| 역할 시너지 | 특정 역할 조합 | 밸런스 보너스 |
| 특수 시너지 | 특정 캐릭터 조합 | 고유 효과 |

**교단별 분위기 보너스 (v5.3)**
| 교단 | 연계 분위기 | 보너스 |
|------|----------|-------|
| Valhalla | Brave (열혈) | ×1.15 |
| Takamagahara | Mystic (신비) | ×1.15 |
| Olympus | Cunning (냉철) | ×1.15 |
| Asgard | Calm (고요) | ×1.15 |
| Yomi | Wild (광폭) | ×1.15 |
| Tartarus | Fierce (격렬) | ×1.15 |
| Avalon | Noble (고결) | ×1.15 |
| Helheim | Stoic (의연) | ×1.15 |
| Kunlun | Devoted (헌신) | ×1.15 |

> 교단-분위기 보너스: 해당 교단 캐릭터가 연계 분위기를 가질 경우 ATK/DEF ×1.15

### 2.10 퀘스트 시스템

| 타입 | 갱신 | 개수 | 보상 |
|------|------|------|------|
| 일일 | 매일 00:00 | 5개 | 보석, 골드, 소환권 |
| 주간 | 매주 월요일 | 3개 | 보석(대), 소환권, 장비 |
| 업적 | 영구 | 5개+ | 칭호, 보석, 특수 아이템 |

### 2.11 오프라인 보상

| 항목 | 시간당 | 상한 |
|------|--------|------|
| 골드 | 100 | 24시간 (2,400) |
| 경험치 | 50 | 24시간 (1,200) |
| 장비 파편 | 5 | 24시간 (120) |

---
