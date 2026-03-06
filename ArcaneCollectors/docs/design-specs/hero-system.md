# 영웅 시스템 디자인 스펙

> **대상 씬**: HeroListScene, HeroDetailScene, PartyEditScene
> **기준**: DESIGN_SYSTEM.md (1080x1920, 다크 테마, Phaser 3 Canvas)
> **갱신일**: 2026-02-16

---

## 1. HeroListScene (영웅 목록)

### 1.1 화면 구조

```
y=0   ┌──────────────────────────────────┐
      │          Header s(100)           │
      │  ← 뒤로    "영웅"      {N}명     │
y=100 ├──────────────────────────────────┤
      │       FilterBar Row1 s(45)       │
      │  [등급순][레벨순][전투력][분위기][교단] ▼│
y=145 │       FilterBar Row2 s(45)       │
      │  ○○○○○○○○○  [N][R][SR][SSR] 초기화│
y=205 ├──────────────────────────────────┤
      │                                  │
      │         Hero Grid (4열)          │
      │  ┌────┐ ┌────┐ ┌────┐ ┌────┐   │
      │  │카드│ │카드│ │카드│ │카드│   │
      │  └────┘ └────┘ └────┘ └────┘   │
      │  (스크롤 영역)                    │
      │                                  │
      └──────────────────────────────────┘
```

### 1.2 Header

| 요소 | 위치 | 크기 | 색상 | 폰트 |
|------|------|------|------|------|
| 배경 | center, y=s(50) | GAME_WIDTH x s(100) | `COLORS.bgLight` alpha 0.95 | - |
| 뒤로 버튼 | x=s(30), y=s(50) | s(50) x s(40) | `COLORS.bgLight` alpha 0.8 | sf(14) |
| 제목 "영웅" | center, y=s(50) | - | `COLORS.text` | sf(28) bold, Georgia |
| 보유 수 | right s(30), y=s(50) | - | `COLORS.textDark` | sf(14) |

### 1.3 필터바

| 요소 | 위치 | 크기 | 활성 색상 | 비활성 색상 | 폰트 |
|------|------|------|----------|-----------|------|
| 배경 | center, y=s(152) | GAME_WIDTH x s(105) | - | `COLORS.bgLight` alpha 0.8 | - |
| 정렬 버튼 | y=s(130) | s(70) x s(28) | `COLORS.primary` | `COLORS.bgLight` | sf(11) |
| 정렬 방향 | right s(25), y=s(130) | - | - | `COLORS.textDark` | sf(14) |
| 교단 원형 | y=s(175) | r=s(10) | Cult color, stroke s(2) white | Cult color alpha 0.8 | - |
| 등급 버튼 | y=s(175) | s(38) x s(24) | Rarity color alpha 0.9 | `COLORS.bgLight` alpha 0.9 | sf(10) bold |
| 초기화 | right s(50), y=s(175) | - | - | `COLORS.danger` | sf(11) |

### 1.4 영웅 카드 그리드

| 속성 | 값 |
|------|-----|
| 열 수 | 4열 |
| 카드 크기 | s(110) x s(150) |
| 간격 | s(10) |
| 시작 Y | s(240) |
| 스크롤 마스크 | y=s(210) ~ GAME_HEIGHT-s(330) |

### 1.5 영웅 카드 스펙

```
┌──────────────────┐  s(100) x s(140)
│   [등급 뱃지]     │  s(35) x s(18), 등급색 배경
│                   │
│   [초상화 영역]    │  hero_placeholder, scale 0.9
│                   │
│   ★★★★           │  sf(11), COLORS.accent
│   영웅이름         │  sf(12), COLORS.text (8자 제한)
│   Lv.10           │  sf(10), COLORS.textDark
└──────────────────┘
```

**등급별 프레임 색상** (RARITY_COLORS 기준):

| 등급 | 테두리(border) | 배경(bg) | 글로우(glow) |
|------|--------------|---------|------------|
| N | `0x6B7280` | `0x374151` | 없음 |
| R | `0x3B82F6` | `0x1E3A5F` | 없음 |
| SR | `0xA855F7` | `0x4C1D95` | `0xA855F7` |
| SSR | `0xF59E0B` | `0x78350F` | `0xF59E0B` |

> **현재 문제**: 카드에서 `RARITY[rKey].color` (gameConfig)만 사용하여 테두리만 표시.
> **개선**: `RARITY_COLORS` (layoutConfig)의 border/bg/glow 3요소 모두 적용.

---

## 2. HeroDetailScene (영웅 상세)

### 2.1 화면 구조

```
y=0   ┌──────────────────────────────────┐
      │          Header s(100)           │
      │  ← 뒤로  "영웅이름"  [분위기]     │
      │          SSR · Lv.50             │
y=100 ├──────────────────────────────────┤
      │                                  │
      │      [초상화 프레임 s(180)x(200)] │
      │      ★★★★★                      │
      │                                  │
y=350 ├──────────────────────────────────┤
      │        능력치 패널 s(220)         │
      │  HP   1500  ████████░░           │
      │  ATK   350  ██████░░░░           │
      │  DEF   200  ████░░░░░░           │
      │  SPD    80  ██░░░░░░░░           │
      │       [레이더 차트]               │
      │       전투력: 5,230               │
y=570 ├──────────────────────────────────┤
      │        스킬 패널 s(100)          │
      │  [아이콘] 기본공격  Lv.3 [강화]   │
      │  [아이콘] 특수공격  Lv.2 [강화]   │
y=670 ├──────────────────────────────────┤
      │        장비 슬롯 4개              │
      │  [무기] [방어구] [악세서리] [유물]  │
y=840 ├──────────────────────────────────┤
      │                                  │
      │  [레벨업] [자동레벨업] [진화]      │
      └──────────────────────────────────┘
```

### 2.2 Header

| 요소 | 위치 | 색상 | 폰트 |
|------|------|------|------|
| 배경 | y=s(50) | `COLORS.bgLight` alpha 0.9 | - |
| 영웅 이름 | center, y=s(40) | `COLORS.text` | sf(22) bold, Georgia |
| 등급+레벨 | center, y=s(65) | Rarity color | sf(14) |
| 분위기 표시 | right s(50), y=s(50) | `COLORS.primary` | sf(8) |

### 2.3 초상화 영역

| 요소 | 값 |
|------|-----|
| 프레임 크기 | s(180) x s(200) |
| 프레임 테두리 | s(3), 등급색 alpha 0.8 |
| 배경 | `COLORS.bgLight` alpha 0.3 |
| 이미지 스케일 | 2x |
| 유휴 애니메이션 | y +-s(5), 1500ms, Sine.easeInOut |
| SSR 글로우 | r=s(90), 등급색 alpha 0.2, pulse 0.3<->0.1 |
| 별 표시 | y=displayY+s(115), sf(20), `COLORS.accent` |

### 2.4 능력치 패널

| 스탯 | 바 색상 | 최대값 |
|------|---------|-------|
| HP | `COLORS.success` (`0x10B981`) | 2000 |
| ATK | `COLORS.danger` (`0xEF4444`) | 500 |
| DEF | `COLORS.primary` (`0x6366F1`) | 400 |
| SPD | `COLORS.accent` (`0xF59E0B`) | 150 |

| 요소 | 값 |
|------|-----|
| 바 배경 | `COLORS.bgLight` |
| 바 크기 | s(150) x s(12) (배경), s(10) (채움) |
| 레이더 차트 | RadarChart, r=s(70), 평균 비교 표시 |

### 2.5 스킬 패널

| 요소 | 값 |
|------|-----|
| 패널 크기 | (GAME_WIDTH - 40) x 100 |
| 아이콘 크기 | 45 x 45 |
| 강화 버튼 | 50 x 22, `COLORS.success` |

### 2.6 장비 슬롯

| 요소 | 값 |
|------|-----|
| 슬롯 크기 | 65 x 65 |
| 간격 | 90px |
| 빈 슬롯 | `COLORS.bgLight` alpha 0.6, 테두리 `COLORS.textDark` alpha 0.5 |
| 장착 슬롯 | Rarity bg alpha 0.4, 테두리 Rarity color alpha 1.0 |
| 빈 슬롯 아이콘 | '+' sf(22), `COLORS.textDark` |

> **현재 문제**: 빈 슬롯이 '+' 텍스트만으로 구분이 어려움.
> **개선**: 슬롯 타입별 반투명 아이콘 + 점선 테두리로 비어있음을 명확히 표현.

### 2.7 액션 버튼

| 버튼 | 위치 | 크기 | 색상 |
|------|------|------|------|
| 레벨업 | GAME_WIDTH/4 | 130 x 45 | `COLORS.success` |
| 자동 레벨업 | GAME_WIDTH/2 | 130 x 45 | `COLORS.primary` |
| 진화 | GAME_WIDTH*3/4 | 130 x 45 | `COLORS.secondary` (불가 시 `COLORS.textDark`) |

---

## 3. PartyEditScene (파티 편성)

### 3.1 화면 구조

```
y=0   ┌──────────────────────────────────┐
      │          TopBar s(100)           │
      │  ◁     "파티 편성"    전투력: N   │
y=100 ├──────────────────────────────────┤
      │    SlotTabs s(40)                │
      │  [파티1][파티2][파티3][파티4][파티5]│
y=155 ├──────────────────────────────────┤
      │                                  │
      │       PartyGrid (4슬롯)          │
      │  ┌────┐ ┌────┐ ┌────┐ ┌────┐   │
      │  │슬롯│ │슬롯│ │슬롯│ │슬롯│   │
      │  │ 1  │ │ 2  │ │ 3  │ │ 4  │   │
      │  └────┘ └────┘ └────┘ └────┘   │
y=420 ├──────────────────────────────────┤
      │       시너지 효과 패널            │
      │  ⛪ 올림푸스 시너지 공격+8%       │
      │  🎭 분위기 시너지 방어+5%         │
y=540 ├──────────────────────────────────┤
      │  [자동편성]     [초기화]          │
      │       [파티 저장]                 │
      │       [편성 완료]                 │
      └──────────────────────────────────┘
```

### 3.2 TopBar

| 요소 | 색상 | 폰트 |
|------|------|------|
| 배경 | `COLORS.bgDark` alpha 0.9 | - |
| 뒤로 "◁" | `#FFFFFF` | sf(32) |
| 제목 | `COLORS.text` | sf(24) bold |
| 전투력 | `COLORS.accent` | sf(16) bold |

### 3.3 슬롯 탭

| 속성 | 값 |
|------|-----|
| 탭 너비 | s(120) |
| 탭 높이 | s(40) |
| 탭 간격 | s(10) |
| 활성 탭 | `COLORS.primary`, bold |
| 비활성 탭 | `COLORS.bgPanel` alpha 0.6, normal |
| 폰트 | sf(14), white |

### 3.4 파티 슬롯

| 속성 | 값 |
|------|-----|
| 슬롯 크기 | s(140) x (s(140) + s(30)) |
| 간격 | s(15) |
| 빈 슬롯 배경 | `COLORS.bgLight` alpha 0.7 |
| 빈 슬롯 테두리 | s(2), `COLORS.bgPanel` |
| 채워진 슬롯 테두리 | s(2), `COLORS.success` |
| 아이콘 영역 | 원형 r=s(35), `COLORS.bgPanel` alpha 0.5 |
| 채워진 아이콘 | Mood color alpha 0.7 |
| 이름 | sf(14) bold, `COLORS.text` |
| 정보 | sf(11), `COLORS.textDark` |
| 등급 별 | sf(24) |
| 제거 버튼 | "✕" sf(16), `#FF5555` |

### 3.5 시너지 패널

| 속성 | 값 |
|------|-----|
| 배경 | `COLORS.bgLight` alpha 0.5 |
| 테두리 | s(1), `COLORS.bgPanel` |
| 제목 | sf(14) bold, `COLORS.textDark` |
| 시너지 텍스트 | sf(13), `COLORS.text` |
| 아이콘 | ⛪(교단), 🎭(분위기), ⚔️(역할), ✨(기타) |

### 3.6 액션 버튼

| 버튼 | 크기 | 색상 |
|------|------|------|
| 자동 편성 | s(180) x s(48) | `COLORS.primary` |
| 초기화 | s(180) x s(48) | `COLORS.bgPanel` |
| 파티 저장 | s(220) x s(53) | `COLORS.success` |
| 편성 완료 | s(220) x s(53) | `COLORS.secondary` |

---

## 4. 공통 개선 사항

### 4.1 등급 프레임 색상 통일

**현재**: 각 씬에서 `RARITY[rKey].color` (gameConfig)와 `RARITY_COLORS[rKey]` (layoutConfig) 혼용.
**개선**: 모든 영웅 카드/프레임에서 `RARITY_COLORS` 사용하여 border/bg/glow 3요소 일관 적용.

| 적용 대상 | 현재 | 개선 |
|-----------|------|------|
| HeroListScene 카드 테두리 | `RARITY.color` 단색 | `RARITY_COLORS.border` |
| HeroListScene 카드 배경 | `COLORS.bgLight` 고정 | `RARITY_COLORS.bg` alpha 0.3 블렌딩 |
| HeroDetailScene 프레임 | `RARITY.color` 단색 | `RARITY_COLORS.border` + glow |
| PartyEditScene 슬롯 | `COLORS.success` 고정 | 등급별 `RARITY_COLORS.border` |

### 4.2 스탯 바 색상 통일

모든 씬에서 동일한 스탯 색상 사용:

| 스탯 | 색상 | Hex |
|------|------|-----|
| HP | Success | `0x10B981` |
| ATK | Danger | `0xEF4444` |
| DEF | Primary | `0x6366F1` |
| SPD | Accent | `0xF59E0B` |

### 4.3 빈 장비 슬롯 시각화

| 현재 | 개선 |
|------|------|
| '+' 텍스트만 | 슬롯 타입 이모지(반투명) + 점선 스타일 테두리 |
| 테두리 `COLORS.textDark` alpha 0.5 | 대시 패턴(4px on, 4px off) + alpha 0.4 |

### 4.4 시너지 표시 색상

| 시너지 타입 | 색상 |
|------------|------|
| 교단(cult) | 해당 Cult color |
| 분위기(mood) | 해당 Mood color |
| 역할(role) | `COLORS.primary` |
| 기타 | `COLORS.accent` |
