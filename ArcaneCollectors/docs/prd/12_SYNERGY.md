# 13. 캐릭터별 시너지 조합 시스템 (v5.3)
> 원본: PRD_Unified_v5.md §13 (lines 1767-1960)

## 13. 캐릭터별 시너지 조합 시스템 (v5.3 업데이트)

### 13.1 시너지 유형 (4종)

| 시너지 유형 | 발동 조건 | 효과 | 데이터 소스 |
|------------|----------|------|------------|
| **교단(Cult) 시너지** | 같은 교단 2/3/4명 | ATK/DEF/HP/SPD 비율 증가 | `synergies.json → cultSynergies` |
| **분위기(Mood) 시너지** | 특정 분위기 조합 2명 | 조합별 고유 효과 | `synergies.json → moodSynergies` |
| **역할(Role) 시너지** | 특정 역할 조합 | 팀 전체 버프 | `synergies.json → roleSynergies` (추가 필요) |
| **특수(Special) 시너지** | 특정 캐릭터 2~3명 조합 | 고유 스킬/버프 | `synergies.json → specialSynergies` |

### 13.2 교단 시너지 상세 (9개 교단)

| 교단 | 2명 | 3명 | 4명 (풀 파티) |
|------|-----|-----|-------------|
| Olympus | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Valhalla | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Takamagahara | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Asgard | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Yomi | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Tartarus | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Avalon | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Helheim | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |
| Kunlun | ATK +10% | ATK +15%, DEF +10% | ATK +20%, DEF +15%, SPD +10%, HP +10% |

### 13.3 분위기(Mood) 시너지 상세 (9종 분위기 기반)

> 기존 personalitySynergies → moodSynergies 리네이밍 완료

| 시너지명 | 조합 | 효과 |
|---------|------|------|
| **전사의 포효** (Warriors Fury) | Brave + Wild | ATK +15%, SPD +10% |
| **냉철한 계산** (Cold Calculation) | Cunning + Calm | CRIT_RATE +12%, DEF +8% |
| **신비의 축복** (Mystic Blessing) | Mystic + 아무나 | 스킬 데미지 +10% |
| **힘의 균형** (Balance of Power) | 3가지 이상 분위기 | 전체 스탯 +5% |
| **맹렬한 돌격** (Fierce Assault) | Brave + Cunning | ATK +12%, CRIT_DMG +15% |
| **그림자 전술** (Shadow Tactics) | Wild + Cunning | SPD +15%, 회피 +8% |
| **헌신적 방호** (Devoted Shield) | Devoted × 2 | DEF +20%, HEAL +15% |
| **고결한 지휘** (Noble Command) | Noble × 2 | ATK/DEF/SPD +10% |
| **격렬한 난무** (Fierce Rampage) | Fierce + Brave | ATK +25%, CRIT_DMG +15%, DEF -15% |
| **의연한 인내** (Stoic Endurance) | Stoic + Calm | DEF +25%, HP +15% |
| **완전한 조화** (Complete Harmony) | 9종 분위기 전체 | 전체 스탯 +20% |

### 13.4 교단-분위기 최적 조합 보너스 (×1.15) - 9개 교단 전체

| 교단 | 최적 분위기 | 보너스 | 테마 설명 |
|------|-----------|--------|----------|
| **Valhalla** | Brave (열혈) | ×1.15 | 발할라 전사의 열혈 투지 |
| **Takamagahara** | Mystic (신비) | ×1.15 | 천상계의 신비로운 힘 |
| **Olympus** | Cunning (냉철) | ×1.15 | 올림포스 신들의 지혜와 전략 |
| **Asgard** | Calm (고요) | ×1.15 | 아스가르드의 고요한 수호 |
| **Yomi** | Wild (광폭) | ×1.15 | 저승의 광폭한 영혼 |
| **Tartarus** | Fierce (격렬) | ×1.15 | 타르타로스의 격렬한 파괴 |
| **Avalon** | Noble (고결) | ×1.15 | 기사도의 고결한 정신 |
| **Helheim** | Stoic (의연) | ×1.15 | 죽음 앞에서도 의연한 의지 |
| **Kunlun** | Devoted (헌신) | ×1.15 | 곤륜의 헌신적 구도 정신 |

### 13.5 특수 시너지 (캐릭터 고유 조합)

| 시너지명 | 캐릭터 조합 | 효과 | 스토리 근거 |
|---------|-----------|------|------------|
| **노르딕 황혼** | Thor + Freya | ATK +20%, HP +15% | 형제의 유대 |
| **일본 삼종신기** | Amaterasu + Tsukuyomi + Susanoo | 전체 스탯 +12% | 삼신의 조화 |
| **올림포스 삼주** | Zeus + Poseidon + Hades | ATK +18%, DEF +12% | 세계 지배자 |
| **사랑과 전쟁** | Aphrodite + Ares | CRIT_RATE +15%, ATK +10% | 전설의 커플 |
| **쌍둥이 별** | Apollo + Artemis | SPD +20%, CRIT_DMG +15% | 쌍둥이 사냥 |
| **지혜의 눈** | Athena + Odin | DEF +15%, 스킬 데미지 +12% | 지혜의 교류 |
| **빛과 어둠** | Amaterasu + Izanami | 전체 스탯 +8%, HP 회복 +5% | 빛과 죽음 |
| **바이킹 맹세** | Thor + Odin + Freya | ATK +15%, DEF +10%, SPD +10% | 발할라 핵심 |
| **화산의 대장장이** | Hephaestus + Ares | ATK +15%, 장비 효과 +10% | 무기 제작자 |
| **저승의 안내자** | Izanami + Susanoo | HP +20%, 부활 확률 5% | 저승의 동맹 |
| **원탁의 기사** (Round Table) | Arthur + Lancelot + Merlin | 전체 스탯 +25%, 스킬 데미지 +15% | 아발론 왕국의 핵심 |
| **서유기 동행** (Journey West) | Sun Wukong + Xuanzang + Zhu Bajie | ATK +20%, DEF +20%, SPD +10% | 곤륜 구도 여정 |
| **라그나로크** (Ragnarok) | Fenrir + Jormungandr + Hel | ATK +30%, 즉사 확률 +5% | 세계의 종말 |
| **타이탄의 분노** (Titan Wrath) | Kronos + Prometheus | ATK +25%, 스킬 데미지 +20% | 타르타로스 타이탄 |

### 13.6 시너지 UI 표시 (BattleScene, PartyEditScene)

```
파티 편성 시:
┌─────────────────────────────┐
│ 현재 파티 시너지             │
│ ⚔️ 발할라 결속 (3/4)  ATK+15% │
│ 🔥 전사의 포효      ATK+15% │
│ ⭐ 최적 조합 보너스   ×1.15  │
│ 💎 노르딕 황혼       ATK+20% │
└─────────────────────────────┘

전투 시작 시:
→ 활성 시너지 목록 팝업 (1.5초)
→ 버프 아이콘으로 상단 표시
```

### 13.7 시너지 발동 스킬 시스템 (v5.2 신규)

> 특정 캐릭터 조합이 파티에 편성되면, 전투 중 **시너지 스킬**이 자동/수동으로 발동됩니다.

#### 스킬 유형

| 유형 | 발동 조건 | 발동 방식 | 쿨다운 |
|------|----------|----------|--------|
| **시너지 패시브** | 전투 시작 시 자동 적용 | 영구 버프 (전투 종료까지) | 없음 |
| **시너지 액티브** | 게이지 100% 충전 시 | 카드덱에 추가 카드로 등장 | 3~5턴 쿨다운 |
| **시너지 궁극기** | 특수 시너지 3인 조합 시 | 전투 1회 한정, 별도 버튼 | 전투당 1회 |

#### 교단 시너지 발동 스킬 (9개 교단 전체)

| 교단 | 2명 패시브 | 3명 액티브 | 4명 궁극기 |
|------|-----------|-----------|-----------|
| **Olympus** | `신들의 가호` — 전체 HP 회복 5%/턴 | `올림포스 번개` — 랜덤 적 3회 번개 (ATK×1.5) | `신전의 심판` — 전체 적 ATK×3.0, 1턴 기절 |
| **Valhalla** | `전사의 맹세` — ATK +15% 고정 | `발키리 강림` — 아군 1명 부활(HP 30%) | `라그나로크` — 전체 적 ATK×3.5, 아군 ATK+30% 3턴 |
| **Takamagahara** | `천상의 축복` — SPD +20% | `신풍` — 아군 전체 회피율 +25% 2턴 | `아마테라스의 빛` — 전체 적 ATK×2.5, 아군 전체 회복 50% |
| **Asgard** | `수호자의 방패` — DEF +20% | `비프로스트 방벽` — 데미지 흡수 실드 (HP×30%) | `오딘의 지혜` — 적 전체 DEF -50% 3턴, 아군 CRIT +30% |
| **Yomi** | `저승의 속삭임` — 적 SPD -10% | `원령 소환` — 적 1명에 DOT (ATK×0.5, 3턴) | `이자나미의 저주` — 적 전체 HP 25% 즉사, DOT 5턴 |
| **Tartarus** | `타이탄의 힘` — ATK +12% | `대지 분쇄` — 전체 적 ATK×1.8, DEF -20% 2턴 | `타르타로스 심연` — 전체 적 ATK×3.2, 즉사 확률 10% |
| **Avalon** | `기사도 정신` — DEF +15%, HP회복 3%/턴 | `성검 축복` — 단일 아군 ATK+30%, CRIT+25% 3턴 | `엑스칼리버` — 단일 적 ATK×5.0, 무시 방어 100% |
| **Helheim** | `죽음의 포옹` — 적 전체 ATK -8% | `망자 소환` — 소환수 1기 생성 (HP 30%, ATK 50%) | `니플헤임 냉기` — 전체 적 ATK×2.8, 3턴 빙결 |
| **Kunlun** | `구도자의 수행` — 매 턴 스킬 쿨다운 -1 | `선인의 가르침` — 아군 전체 스탯 +15% 2턴 | `곤륜 선계` — 전체 적 ATK×2.5, 아군 전체 HP 전회복 |

#### 분위기(Mood) 시너지 발동 스킬 (9종 분위기 기반)

| 시너지명 | 조합 | 패시브 효과 | 액티브 스킬 |
|---------|------|------------|------------|
| **전사의 포효** | Brave + Wild | ATK +15%, SPD +10% | `열혈 돌격` — 단일 적 ATK×2.5, 자신 HP -10% |
| **냉철한 계산** | Cunning + Calm | CRIT_RATE +12%, DEF +8% | `약점 간파` — 단일 적 DEF -30% 2턴 |
| **신비의 축복** | Mystic + 아무나 | 스킬 데미지 +10% | `마력 폭발` — 전체 적 ATK×1.8 마법 데미지 |
| **맹렬한 돌격** | Brave + Cunning | ATK +12%, CRIT_DMG +15% | `기습 참격` — 단일 적 ATK×3.0, 무시 방어 50% |
| **그림자 전술** | Wild + Cunning | SPD +15%, 회피 +8% | `연환격` — 랜덤 적 5회 연타 (ATK×0.6 각) |
| **힘의 균형** | 3+ 분위기 혼합 | 전체 스탯 +5% | `조화의 파동` — 아군 전체 HP 회복 15%, 버프 1턴 연장 |
| **헌신적 방호** | Devoted × 2 | DEF +20%, HEAL +15% | `수호의 서약` — 아군 전체 실드 (HP×20%) 2턴 |
| **고결한 지휘** | Noble × 2 | ATK/DEF/SPD +10% | `기사단 결속` — 아군 전체 모든 스탯 +15% 2턴 |
| **격렬한 난무** | Fierce + Brave | ATK +25%, CRIT_DMG +15%, DEF -15% | `광폭 난타` — 전체 적 ATK×2.0, 자신 DEF -20% 2턴 |
| **의연한 인내** | Stoic + Calm | DEF +25%, HP +15% | `불굴의 의지` — 아군 전체 피해 감소 30% 3턴 |
| **완전한 조화** | 9종 분위기 전체 | 전체 스탯 +20% | `궁극의 조화` — 아군 전체 전회복 + 모든 디버프 해제 |

#### 특수 시너지 궁극기 (캐릭터 고유)

| 시너지 | 캐릭터 | 궁극기 | 효과 | 연출 |
|--------|--------|--------|------|------|
| **노르딕 황혼** | Thor + Freya | `발할라 폭풍` | 전체 ATK×4.0 + 아군 HP 회복 20% | 천둥+꽃잎 |
| **일본 삼종신기** | Amaterasu + Tsukuyomi + Susanoo | `삼신일체` | 전체 ATK×5.0, 3턴 무적 | 태양+달+폭풍 |
| **올림포스 삼주** | Zeus + Poseidon + Hades | `천지명계` | 전체 ATK×4.5, 적 전체 -30% 올스탯 | 번개+파도+그림자 |
| **사랑과 전쟁** | Aphrodite + Ares | `카오스 하트` | 단일 ATK×6.0, 50% 확률 매혹(1턴 행동불능) | 하트+칼날 |
| **쌍둥이 별** | Apollo + Artemis | `일월사격` | 전체 ATK×3.0 ×2회 (태양+달 연속) | 태양광+달빛 |
| **원탁의 기사** | Arthur + Lancelot + Merlin | `엑스칼리버 해방` | 전체 ATK×4.8 + 스킬 데미지 +30% 3턴 | 성검+원탁 문양 |
| **서유기 동행** | Sun Wukong + Xuanzang + Zhu Bajie | `여의봉 천공격` | 전체 ATK×4.2 + 아군 전체 SPD+30% 3턴 | 여의봉+구름+삼장법사 경문 |
| **라그나로크** | Fenrir + Jormungandr + Hel | `세계의 종말` | 전체 ATK×5.5 + 즉사 확률 10% | 거대한 늑대+세계뱀+죽음 |
| **타이탄의 분노** | Kronos + Prometheus | `시간 역행` | 전체 적 ATK×4.0 + 아군 전체 HP/스킬 초기화 | 시간 역류+불의 신 |

#### 시너지 스킬 데이터 스키마 (추가 필요)
```javascript
// synergies.json 확장
{
  "synergySkills": {
    "cult_olympus_2": {
      "type": "passive",
      "name": "신들의 가호",
      "nameKo": "신들의 가호",
      "effect": { "healPerTurn": 0.05 },
      "description": "올림포스 영웅 2명 편성 시 매 턴 HP 5% 회복"
    },
    "cult_olympus_3": {
      "type": "active",
      "name": "올림포스 번개",
      "nameKo": "올림포스 번개",
      "multiplier": 1.5,
      "target": "random_3",
      "cooldown": 4,
      "gaugeCost": 80,
      "description": "랜덤 적 3명에게 번개 공격"
    },
    "cult_olympus_4": {
      "type": "ultimate",
      "name": "신전의 심판",
      "nameKo": "신전의 심판",
      "multiplier": 3.0,
      "target": "all",
      "usesPerBattle": 1,
      "additionalEffect": { "stun": 1 },
      "description": "전체 적에게 강력한 공격 + 1턴 기절"
    },
    "mood_brave_wild": {
      "type": "active",
      "name": "열혈 돌격",
      "multiplier": 2.5,
      "target": "single",
      "cooldown": 3,
      "selfDamage": 0.10,
      "description": "단일 적에게 강력한 돌격, 자신 HP 10% 소모"
    },
    "special_thor_freya": {
      "type": "ultimate",
      "name": "발할라 폭풍",
      "multiplier": 4.0,
      "target": "all",
      "usesPerBattle": 1,
      "healAlly": 0.20,
      "description": "전체 적 공격 + 아군 전체 HP 20% 회복",
      "requiredHeroes": ["hero_017", "hero_019"]
    }
  }
}
```

#### 전투 중 시너지 스킬 발동 플로우
```
1. 전투 시작:
   → SynergySystem.calculateSynergies(party) 호출
   → 활성 시너지 목록 + 발동 가능 스킬 계산
   → 패시브 즉시 적용
   → 액티브 스킬 카드풀에 추가 (3턴 쿨다운 후부터)
   → 궁극기 버튼 UI 표시 (충전 게이지)

2. 매 턴:
   → 패시브 효과 지속 적용 (힐, 버프 등)
   → 카드덱 3장 중 시너지 액티브 카드 확률적 등장 (30%)
   → 궁극기 게이지 충전 (+20%/턴)

3. 궁극기 발동:
   → 게이지 100% 시 별도 [궁극기] 버튼 활성화
   → 터치 시 풀스크린 연출 (1.5초)
   → 전투당 1회 한정
```

---
