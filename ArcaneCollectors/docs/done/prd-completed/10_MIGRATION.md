# 10. 속성(Element) 삭제 및 분위기(Mood) 마이그레이션 계획
> 원본: PRD_Unified_v5.md §10 (lines 1512-1576)

---

> **✅ 마이그레이션 완료** (2026-02-07)
> - personality→mood 리네이밍 완료 (20+ 파일)
> - element 시스템 완전 삭제 (440+ 참조)
> - PersonalitySystem→MoodSystem 전환 완료
> - 분위기 5종→9종 확장 완료 (fierce, stoic, devoted, noble 추가)
> - 교단 5개→9개 확장 완료 (tartarus, avalon, helheim, kunlun 추가)

---

## 10.1 마이그레이션 범위 (119개 참조)

| 우선순위 | 영역 | 파일 수 | 참조 수 | 작업 내용 |
|---------|------|--------|--------|----------|
| **P0** | 데이터 JSON | 4 | ~90 | characters.json(personality→mood), enemies.json(element→mood), skills.json(element 삭제), items.json(element 아이템 삭제) |
| **P0** | 설정/상수 | 3 | ~15 | gameConfig.js(ELEMENTS 삭제, PERSONALITIES→MOODS), constants.js(PERSONALITY→MOOD), CULT_INFO.element 삭제 |
| **P1** | 전투 시스템 | 2 | ~25 | BattleSystem.js(getElementBonus→getMoodBonus), BattleScene.js(calculateElementBonus 교체) |
| **P1** | UI 컴포넌트 | 3 | ~10 | HeroCard.js(createElementIcon→createMoodIcon), SynergyDisplay.js(element 시너지→mood), HeroDetailScene.js |
| **P2** | 씬 로직 | 4 | ~15 | GachaScene.js(element 랜덤→mood), HeroListScene.js(정렬), PreloadScene.js(element 텍스처), StageSelectScene.js |
| **P2** | 유틸리티 | 3 | ~8 | textStyles.js(getElementStyle 삭제), drawUtils.js(drawElementIcon 삭제), data/index.js(함수 교체) |
| **P3** | 매니저 | 2 | ~6 | PartyManager.js(element→mood), SaveManager.js(마이그레이션 로직 추가) |

## 10.2 리네이밍 매핑 테이블

| 기존 (코드) | 신규 (v5.2) | 한글 | 비고 |
|-------------|-------------|------|------|
| `personality` | `mood` | 분위기 | 필드명 변경 |
| `PERSONALITY` | `MOOD` | — | 상수명 변경 |
| `PERSONALITIES` | `MOODS` | — | 설정 객체명 |
| `PERSONALITY_MATCHUP` | `MOOD_MATCHUP` | — | 상성 매핑 |
| `PERSONALITY_DAMAGE` | `MOOD_DAMAGE` | — | 상성 배율 |
| `PERSONALITY_INFO` | `MOOD_INFO` | — | 표시 정보 |
| `PERSONALITY_COLORS` | `MOOD_COLORS` | — | 색상 매핑 |
| `PersonalitySystem` | `MoodSystem` | — | 시스템 클래스 |
| `getPersonalityDamageMultiplier` | `getMoodDamageMultiplier` | — | 함수명 |
| `CULT_PERSONALITY_BONUS` | `CULT_MOOD_BONUS` | — | 교단-분위기 보너스 |
| `personalitySynergies` | `moodSynergies` | — | 시너지 데이터 |
| `element` (적 데이터) | `mood` | 분위기 | enemies.json |
| `element` (스킬) | 삭제 | — | skills.json |
| `ELEMENTS` (상수) | 삭제 | — | gameConfig.js |

## 10.3 분위기(Mood) 한글명 확정 (9종 확장 완료)

| 코드 | 기존 한글 (성격) | **v5.2 한글 (분위기)** | 컨셉 키워드 |
|------|-----------------|---------------------|------------|
| `brave` | 용감 | **열혈** | 뜨거운 투지, 돌진, 공격적 오라 |
| `cunning` | 교활 | **냉철** | 차가운 계산, 약점 공략, 전략적 |
| `calm` | 침착 | **고요** | 잔잔한 호수, 방어적, 지구전 |
| `wild` | 야성 | **광폭** | 폭풍 같은 에너지, 속공, 연타 |
| `mystic` | 신비 | **신비** | 초월적 오라, 마법, 범용 보너스 |
| `fierce` | (신규) | **격렬** | 맹렬한 공격, 폭발적 화력, 지배적 |
| `stoic` | (신규) | **의연** | 흔들리지 않는 의지, 견고함, 불굴 |
| `devoted` | (신규) | **헌신** | 희생정신, 보호본능, 동료애 |
| `noble` | (신규) | **고결** | 고귀함, 정의감, 카리스마 |

## 10.4 SaveManager 마이그레이션 로직 (신규)
```javascript
// SaveManager.load() 내에서 자동 마이그레이션
function migrateV5_2(saveData) {
  // 1. character.personality → character.mood
  saveData.characters?.forEach(char => {
    if (char.personality && !char.mood) {
      char.mood = char.personality;
      delete char.personality;
    }
    if (char.element) {
      delete char.element; // element 완전 삭제
    }
  });
  // 2. gacha history의 element 참조 삭제
  saveData.version = "5.2";
  return saveData;
}
```

---
