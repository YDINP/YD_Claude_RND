# Portrait Mapping Guide

## 개요

ArcaneCollectors의 캐릭터 포트레이트 매핑 가이드입니다.
`src/data/portrait-mapping.json`이 이 문서를 기반으로 관리됩니다.

## ID 체계

| 캐릭터 ID | 포트레이트 파일명 | 경로 |
|-----------|----------------|------|
| `char_N` | `hero_NNN` | `public/assets/characters/portraits/hero_NNN.png` |

- `char_N`: 1부터 91까지 순차 번호
- `hero_NNN`: 001부터 091까지 3자리 zero-padded

## 교단별 캐릭터 배분 계획

실제 게임 내 교단 ID(`cults.json` 기준):

| 교단 ID | 교단명 | 캐릭터 범위 | 인원 수 |
|---------|--------|------------|--------|
| `prism_stars` | 프리즘 스타즈 | char_1, char_5~char_12 | 9명 |
| `neon_crow` | 네온 크로우 | char_13~char_21 | 9명 |
| `ink_cyclone` | 잉크 사이클론 | char_22~char_30 | 9명 |
| `stella_club` | 스텔라 클럽 | char_31~char_39 | 9명 |
| `card_cartel` | 카드 카르텔 | char_40~char_48 | 9명 |
| `buddy_garden` | 버디 가든 | char_4, char_49~char_57 | 10명 |
| `glitch_paradise` | 글리치 파라다이스 | char_2, char_58~char_65 | 9명 |
| `cafe_encore` | 카페 앙코르 | char_66~char_74 | 9명 |
| `lunatic_circus` | 루나틱 서커스 | char_3, char_75~char_82 | 9명 |
| `iron_beat` | 아이언 비트 | char_83~char_91 | 9명 |

### 기존 char_1~char_4 교단 배정

| ID | 이름 | preferredCult |
|----|------|--------------|
| char_1 | 철벽 가르디아 | iron_beat |
| char_2 | 폭풍 마기우스 | glitch_paradise |
| char_3 | 질풍 아로스 | lunatic_circus |
| char_4 | 성광 루미나 | buddy_garden |

## ID ↔ hero_NNN ↔ 교단 매핑 표

### prism_stars (프리즘 스타즈)

| char ID | hero 파일 | 클래스 | 레어리티 |
|---------|-----------|--------|---------|
| char_1 | hero_001 | warrior | 4(SR) |
| char_5 | hero_005 | mage | SSR |
| char_6 | hero_006 | healer | SR |
| char_7 | hero_007 | archer | R |
| char_8 | hero_008 | warrior | SSR |
| char_9 | hero_009 | mage | R |
| char_10 | hero_010 | healer | SR |
| char_11 | hero_011 | archer | SSR |
| char_12 | hero_012 | warrior | R |

### neon_crow (네온 크로우)

| char ID | hero 파일 | 클래스 | 레어리티 |
|---------|-----------|--------|---------|
| char_13 | hero_013 | mage | SSR |
| char_14 | hero_014 | warrior | SR |
| char_15 | hero_015 | archer | R |
| char_16 | hero_016 | healer | SR |
| char_17 | hero_017 | mage | R |
| char_18 | hero_018 | warrior | SSR |
| char_19 | hero_019 | archer | SR |
| char_20 | hero_020 | healer | R |
| char_21 | hero_021 | mage | SSR |

### ink_cyclone (잉크 사이클론)

| char ID | hero 파일 | 클래스 | 레어리티 |
|---------|-----------|--------|---------|
| char_22 | hero_022 | warrior | SR |
| char_23 | hero_023 | mage | R |
| char_24 | hero_024 | healer | SSR |
| char_25 | hero_025 | archer | SR |
| char_26 | hero_026 | warrior | R |
| char_27 | hero_027 | mage | SSR |
| char_28 | hero_028 | healer | R |
| char_29 | hero_029 | archer | SR |
| char_30 | hero_030 | warrior | R |

### stella_club (스텔라 클럽)

| char ID | hero 파일 | 클래스 | 레어리티 |
|---------|-----------|--------|---------|
| char_31 | hero_031 | mage | SSR |
| char_32 | hero_032 | healer | SR |
| char_33 | hero_033 | archer | R |
| char_34 | hero_034 | warrior | SR |
| char_35 | hero_035 | mage | SSR |
| char_36 | hero_036 | healer | R |
| char_37 | hero_037 | archer | SR |
| char_38 | hero_038 | warrior | R |
| char_39 | hero_039 | mage | SSR |

### card_cartel (카드 카르텔)

| char ID | hero 파일 | 클래스 | 레어리티 |
|---------|-----------|--------|---------|
| char_40 | hero_040 | healer | SR |
| char_41 | hero_041 | archer | R |
| char_42 | hero_042 | warrior | SSR |
| char_43 | hero_043 | mage | SR |
| char_44 | hero_044 | healer | R |
| char_45 | hero_045 | archer | SSR |
| char_46 | hero_046 | warrior | SR |
| char_47 | hero_047 | mage | R |
| char_48 | hero_048 | healer | SSR |

### buddy_garden (버디 가든)

| char ID | hero 파일 | 클래스 | 레어리티 |
|---------|-----------|--------|---------|
| char_4 | hero_004 | healer | 4(SR) |
| char_49 | hero_049 | warrior | SR |
| char_50 | hero_050 | mage | R |
| char_51 | hero_051 | archer | SSR |
| char_52 | hero_052 | healer | SR |
| char_53 | hero_053 | warrior | R |
| char_54 | hero_054 | mage | SR |
| char_55 | hero_055 | archer | R |
| char_56 | hero_056 | healer | SSR |
| char_57 | hero_057 | warrior | R |

### glitch_paradise (글리치 파라다이스)

| char ID | hero 파일 | 클래스 | 레어리티 |
|---------|-----------|--------|---------|
| char_2 | hero_002 | mage | 5(SSR) |
| char_58 | hero_058 | archer | SR |
| char_59 | hero_059 | healer | R |
| char_60 | hero_060 | warrior | SSR |
| char_61 | hero_061 | mage | SR |
| char_62 | hero_062 | archer | R |
| char_63 | hero_063 | healer | SR |
| char_64 | hero_064 | warrior | R |
| char_65 | hero_065 | mage | SSR |

### cafe_encore (카페 앙코르)

| char ID | hero 파일 | 클래스 | 레어리티 |
|---------|-----------|--------|---------|
| char_66 | hero_066 | healer | SR |
| char_67 | hero_067 | warrior | R |
| char_68 | hero_068 | mage | SSR |
| char_69 | hero_069 | archer | SR |
| char_70 | hero_070 | healer | R |
| char_71 | hero_071 | warrior | SR |
| char_72 | hero_072 | mage | R |
| char_73 | hero_073 | archer | SSR |
| char_74 | hero_074 | healer | R |

### lunatic_circus (루나틱 서커스)

| char ID | hero 파일 | 클래스 | 레어리티 |
|---------|-----------|--------|---------|
| char_3 | hero_003 | archer | 4(SR) |
| char_75 | hero_075 | warrior | SSR |
| char_76 | hero_076 | mage | SR |
| char_77 | hero_077 | healer | R |
| char_78 | hero_078 | archer | SR |
| char_79 | hero_079 | warrior | R |
| char_80 | hero_080 | mage | SSR |
| char_81 | hero_081 | healer | SR |
| char_82 | hero_082 | archer | R |

### iron_beat (아이언 비트)

| char ID | hero 파일 | 클래스 | 레어리티 |
|---------|-----------|--------|---------|
| char_1 | hero_001 | warrior | 4(SR) |
| char_83 | hero_083 | mage | SR |
| char_84 | hero_084 | healer | R |
| char_85 | hero_085 | archer | SSR |
| char_86 | hero_086 | warrior | SR |
| char_87 | hero_087 | mage | R |
| char_88 | hero_088 | healer | SSR |
| char_89 | hero_089 | archer | SR |
| char_90 | hero_090 | warrior | R |
| char_91 | hero_091 | mage | SSR |

## 레어리티 배분 (char_5~char_91, 87개)

| 등급 | 개수 | 비율 |
|------|------|------|
| SSR | 18개 | ~21% |
| SR | 36개 | ~41% |
| R | 33개 | ~38% |
| 합계 | 87개 | 100% |

## 클래스 배분 (char_5~char_91, 87개)

| 클래스 | 개수 |
|--------|------|
| warrior | 22개 |
| mage | 22개 |
| healer | 22개 |
| archer | 21개 |

## 주의사항

- `portrait-mapping.json`의 키는 반드시 `"char_N"` 형식
- 값은 반드시 `"hero_NNN"` 형식 (3자리 zero-padded)
- 실제 이미지 파일: `public/assets/characters/portraits/hero_NNN.png`
- char_1~char_4 기존 데이터 수정 금지
