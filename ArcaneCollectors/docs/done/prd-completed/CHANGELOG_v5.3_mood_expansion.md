# ArcaneCollectors v5.3 — 분위기/교단 확장 및 캐릭터 디자인 작업 내역

> 작업일: 2026-02-07
> 브랜치: `arcane/integration`
> 변경 파일: 26개 수정 + 2개 신규 (5,217줄 추가 / 1,193줄 삭제)

---

## 1. 분위기(Mood) 시스템 확장 (5종 → 9종)

### 기존 5종
| 코드 | 한글명 | 그룹 |
|------|--------|------|
| brave | 열혈 | 공격형 |
| wild | 광폭 | 공격형 |
| calm | 고요 | 방어형 |
| cunning | 냉철 | 전략형 |
| mystic | 신비 | 전략형 |

### 신규 4종
| 코드 | 한글명 | 그룹 | UI 컬러 | 아이콘 |
|------|--------|------|---------|--------|
| fierce | 격렬 | 공격형 | `#FF5722` | 🔥 |
| stoic | 의연 | 방어형 | `#607D8B` | 🪨 |
| devoted | 헌신 | 방어형 | `#E91E63` | 💖 |
| noble | 고결 | 전략형 | `#FFD700` | 👑 |

### 상성 구조 변경
- **기존**: 순환형 (Brave→Cunning→Calm→Wild→Brave + Mystic 특수)
- **변경**: 매트릭스형 (각 분위기 2강 2약 4중립)
- **구현**: `strongAgainst`/`weakAgainst`가 단일값 → **배열**로 변경, `.includes()` 체크
- **배율**: 유리 ×1.2, 불리 ×0.8, 중립 ×1.0 (Mystic 특수보너스 ×1.1 제거)

---

## 2. 교단(Cult) 시스템 확장 (5개 → 9개)

### 신규 4교단
| 교단 | 신화 배경 | 테마 컬러 | 최적 분위기 |
|------|----------|-----------|-------------|
| Tartarus (타르타로스) | 그리스 심연 | `#B71C1C` 진홍 | Fierce ×1.15 |
| Avalon (아발론) | 켈트 기사도 | `#4CAF50` 에메랄드 | Noble ×1.15 |
| Helheim (헬하임) | 북유럽 명계 | `#455A64` 강철회색 | Stoic ×1.15 |
| Kunlun (곤륜) | 중국 신선계 | `#FF9800` 단풍 | Devoted ×1.15 |

### 교단-분위기 1:1 보너스 매핑
```
valhalla→brave, takamagahara→mystic, olympus→cunning, asgard→calm, yomi→wild
tartarus→fierce, avalon→noble, helheim→stoic, kunlun→devoted
```

---

## 3. 캐릭터 확장 (39명 → 91명)

### 기존 캐릭터 mood 재분배 (17명)
- calm→devoted: 5명 (hero_004, 008, 012, 019, 025)
- calm→noble: 3명 (hero_022, 031, 033)
- calm→stoic: 2명 (hero_013, 021)
- wild→fierce: 5명 (hero_011, 026, 029, 032, 036)
- mystic→stoic: 1명 (hero_038)
- mystic→noble: 1명 (hero_007)

### 신규 캐릭터 52명 추가
| 교단 | 추가 수 | 영웅 ID 범위 |
|------|---------|-------------|
| Tartarus | 9명 | hero_040 ~ 048 (크로노스, 프로메테우스, 메두사 등) |
| Avalon | 9명 | hero_049 ~ 057 (아서, 모건 르 페이, 쿠 훌린 등) |
| Helheim | 9명 | hero_058 ~ 066 (헬, 펜리르, 요르문간드 등) |
| Kunlun | 9명 | hero_067 ~ 075 (손오공, 나타, 관우 등) |
| 기존 교단 보강 | 16명 | hero_076 ~ 091 (★1~★3 하위 등급 충원) |

### 최종 분포
- **교단별**: olympus=12, takamagahara=11, yomi=12, asgard=9, valhalla=11, tartarus=9, avalon=9, helheim=9, kunlun=9
- **분위기별**: brave=11, fierce=12, wild=9, calm=8, stoic=10, devoted=14, cunning=8, noble=10, mystic=9
- **등급별**: ★1=9, ★2=13, ★3=18, ★4=25, ★5=26
- **클래스별**: warrior=42, mage=25, healer=13, archer=11

---

## 4. 캐릭터 디자인 데이터 표준화

91명 전원에 대해 15필드 상세 design 객체 완비:
```
style, bodyRatio, hairColor, hairStyle, eyeColor, eyeStyle,
primaryColor, secondaryColor, accentColor, outfit, accessories,
signaturePose, chibiFeatures, height, age
```

---

## 5. PRD 문서 업데이트

### 신규 생성
- `docs/prd/14_CHARACTER_DESIGN.md` (~450줄)
  - 분위기 9종 비주얼 시스템 (컬러/이펙트/모션/카드 프레임)
  - 교단 9개 비주얼 테마
  - 등급별 카드/소환 연출
  - 디자인 데이터 스키마 표준
  - 91명 전체 로스터

### 업데이트
- `docs/prd/00_INDEX.md` — 14_CHARACTER_DESIGN.md 추가, 9종/9교단 반영
- `docs/prd/01_OVERVIEW.md` — 교단 5개→9개, 최적 분위기 컬럼 추가

---

## 6. 수정 파일 목록 (26개)

### 데이터 (7개)
| 파일 | 변경 내용 |
|------|----------|
| `src/data/characters.json` | 91명 (52명 추가 + 17명 mood 재분배 + 91명 design 상세화) |
| `src/data/items.json` | mood 정수 아이템 4종 추가 (fierce/stoic/devoted/noble) |
| `src/data/enemies.json` | 적 4종 추가 (golem/fairy/berserker/priestess) |
| `src/data/synergies.json` | mood 시너지 5종 + special 시너지 4종 추가 |
| `src/data/index.js` | getMoodAdvantages 배열 기반, calculateMoodMultiplier 업데이트 |
| `src/data/skills.json` | element 참조 삭제 |
| `src/data/equipment.json` | element 참조 삭제 |

### 시스템 (5개)
| 파일 | 변경 내용 |
|------|----------|
| `src/utils/constants.js` | MOOD 9종, CULT 9종, MOOD_MATCHUP 배열화, CULT_MOOD_BONUS 9교단 |
| `src/systems/MoodSystem.js` | 신규 — PersonalitySystem 대체, 9종 상성, 9교단 보너스 |
| `src/systems/BattleSystem.js` | getMoodBonus 9종 매트릭스로 재작성 |
| `src/systems/SynergySystem.js` | personality→mood 리네이밍 |
| `src/systems/index.js` | PersonalitySystem→MoodSystem export 변경 |

### 설정/UI (6개)
| 파일 | 변경 내용 |
|------|----------|
| `src/config/gameConfig.js` | MOODS 9종 (group 필드), ELEMENTS 삭제 |
| `src/config/layoutConfig.js` | MOOD_COLORS 9종 |
| `src/utils/drawUtils.js` | drawMoodIcon 9종 색상 |
| `src/utils/helpers.js` | getMoodIcon 9종 이모지 |
| `src/utils/textStyles.js` | mood 색상 스타일 9종 |
| `src/components/battle/SynergyDisplay.js` | SYNERGY_TYPES.mood 9종 |

### 씬 (5개)
| 파일 | 변경 내용 |
|------|----------|
| `src/scenes/BattleScene.js` | element→mood 전환 |
| `src/scenes/GachaScene.js` | element 랜덤 삭제 |
| `src/scenes/HeroDetailScene.js` | personality→mood |
| `src/scenes/HeroListScene.js` | 정렬 키 변경 |
| `src/scenes/PreloadScene.js` | element 텍스처 삭제 |

### 기타 (3개)
| 파일 | 변경 내용 |
|------|----------|
| `src/components/HeroCard.js` | createElementIcon→createMoodIcon |
| `src/systems/PartyManager.js` | element→mood |
| `src/assets/prompts/character-prompts.md` | personality→mood |

### 삭제 (1개)
- `src/systems/PersonalitySystem.js` — MoodSystem.js로 대체

---
