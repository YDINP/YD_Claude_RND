# ArcaneCollectors 디자인 시스템

> **해상도**: 1080x1920 (9:16 세로형)
> **렌더링**: Phaser 3 Canvas (HTML/CSS 없음)
> **스케일**: `s(value)` = 동적 픽셀 스케일, `sf(basePx)` = 폰트용 `"Npx"` 문자열
> **SCALE_FACTOR**: 1080 / 720 = 1.5
> **테마**: 다크 테마 전용

---

## 1. 컬러 팔레트

### 1.1 핵심 컬러

| 역할 | Phaser Hex | CSS Hex | 용도 | 소스 |
|------|-----------|---------|------|------|
| **Primary** | `0x6366F1` | `#6366F1` | 주요 강조, 선택 상태 | `COLORS.primary` |
| **Secondary** | `0xEC4899` | `#EC4899` | 보조 강조 | `COLORS.secondary` |
| **Accent** | `0xF59E0B` | `#F59E0B` | 포인트, 주의 유도 | `COLORS.accent` |
| **Success** | `0x10B981` | `#10B981` | 성공, 양수 상태 | `COLORS.success` |
| **Danger** | `0xEF4444` | `#EF4444` | 위험, 경고, 삭제 | `COLORS.danger` |

### 1.2 배경/표면 컬러

| 역할 | Phaser Hex | CSS Hex | 용도 | 소스 |
|------|-----------|---------|------|------|
| **Background Dark** | `0x0F172A` | `#0F172A` | 게임 배경, 씬 기본 | `COLORS.bgDark` |
| **Background Light** | `0x1E293B` | `#1E293B` | 카드 배경, 섹션 구분 | `COLORS.bgLight` |
| **Background Panel** | `0x334155` | `#334155` | 패널 내부 배경 | `COLORS.bgPanel` |

> **불일치 주의**: `layoutConfig.js`의 `UI_STYLES.BACKGROUND`는 별도 값을 사용합니다.
>
> | 항목 | `gameConfig.js` (현재값) | `layoutConfig.js` (현재값) | 권장 |
> |------|------------------------|--------------------------|------|
> | PRIMARY BG | `0x0F172A` | `0x1A1A2E` | `0x0F172A` (통일) |
> | SECONDARY BG | `0x1E293B` | `0x16213E` | `0x1E293B` (통일) |
> | ACCENT BG | — | `0x0F3460` | `0x334155` (bgPanel과 통일) |

### 1.3 텍스트 컬러

| 역할 | Phaser Hex | CSS Hex | 용도 | 소스 |
|------|-----------|---------|------|------|
| **Text Light** | `0xF8FAFC` | `#F8FAFC` | 제목, 주요 텍스트 | `COLORS.text` |
| **Text Dark** | `0x94A3B8` | `#94A3B8` | 보조 텍스트, 설명문 | `COLORS.textDark` |

> **불일치 주의**: `UI_STYLES.TEXT`는 CSS 문자열로 별도 관리됩니다.
>
> | 항목 | `gameConfig.js` | `UI_STYLES.TEXT` | 권장 |
> |------|----------------|-----------------|------|
> | PRIMARY | `#F8FAFC` | `#FFFFFF` | `#F8FAFC` (통일) |
> | SECONDARY | `#94A3B8` | `#B0B0B0` | `#94A3B8` (통일) |
> | ACCENT | — | `#FFD700` | 유지 (별도 역할) |

### 1.4 상태 컬러

| 상태 | Phaser Hex | CSS Hex | 용도 |
|------|-----------|---------|------|
| Success | `0x10B981` | `#10B981` | 성공 메시지, 양수 변화 |
| Warning | `0xF39C12` | `#F39C12` | 경고, 주의 (`UI_STYLES.BUTTON.WARNING`) |
| Danger | `0xEF4444` | `#EF4444` | 에러, HP 부족, 삭제 |
| Info | `0x3498DB` | `#3498DB` | 안내, 정보 표시 |

### 1.5 등급(Rarity) 컬러

| 등급 | Border | Background | Glow | 텍스트 컬러 | 소스 |
|------|--------|-----------|------|-----------|------|
| **N** (일반) | `0x6B7280` | `0x374151` | 없음 | `0x9CA3AF` | `RARITY_COLORS` |
| **R** (레어) | `0x3B82F6` | `0x1E3A5F` | 없음 | `0x3B82F6` | `RARITY_COLORS` |
| **SR** (슈퍼레어) | `0xA855F7` | `0x4C1D95` | `0xA855F7` | `0xA855F7` | `RARITY_COLORS` |
| **SSR** (초레어) | `0xF59E0B` | `0x78350F` | `0xF59E0B` | `0xF97316` | `RARITY_COLORS` |

> **불일치 주의**: SSR 텍스트 컬러에 차이가 있습니다.
>
> | 항목 | 소스 | 값 | 권장 |
> |------|-----|-----|------|
> | `COLORS.rarity.SSR` | gameConfig.js | `0xF97316` (주황) | — |
> | `RARITY_COLORS.SSR.border` | layoutConfig.js | `0xF59E0B` (황금) | — |
> | `EQUIPMENT_RARITY.SSR.color` | gameConfig.js | `0xF59E0B` (황금) | `0xF59E0B`로 통일 권장 |

### 1.6 교단(Cult) 9개 컬러

| 교단 | Phaser Hex | CSS Hex | 이름 | 원전 |
|------|-----------|---------|------|------|
| Valhalla | `0x4A90D9` | `#4A90D9` | 발할라 | 북유럽 신화 |
| Takamagahara | `0xFFD700` | `#FFD700` | 타카마가하라 | 일본 신화 |
| Olympus | `0xFF6B35` | `#FF6B35` | 올림푸스 | 그리스 신화 |
| Asgard | `0x5DADE2` | `#5DADE2` | 아스가르드 | 북유럽 신화 |
| Yomi | `0x8E44AD` | `#8E44AD` | 요미 | 일본 신화 |
| Tartarus | `0xB71C1C` | `#B71C1C` | 타르타로스 | 그리스 신화 |
| Avalon | `0x4CAF50` | `#4CAF50` | 아발론 | 켈트 신화 |
| Helheim | `0x37474F` | `#37474F` | 헬하임 | 북유럽 신화 |
| Kunlun | `0x00BCD4` | `#00BCD4` | 곤륜 | 중국 신화 |
| *DEFAULT* | `0x95A5A6` | `#95A5A6` | 기본값 | — |

> `gameConfig.js`의 `COLORS.cult`와 `layoutConfig.js`의 `CULT_COLORS`는 동일한 값입니다. `CULT_COLORS`에만 `DEFAULT`가 추가로 존재합니다.

### 1.7 분위기(Mood) 9개 컬러

| 분위기 | Phaser Hex | CSS Hex | 한글명 | 그룹 |
|-------|-----------|---------|--------|------|
| Brave | `0xE74C3C` | `#E74C3C` | 열혈 | 공격형 |
| Fierce | `0xFF5722` | `#FF5722` | 격렬 | 공격형 |
| Wild | `0x27AE60` | `#27AE60` | 광폭 | 공격형 |
| Calm | `0x3498DB` | `#3498DB` | 고요 | 방어형 |
| Stoic | `0x607D8B` | `#607D8B` | 의연 | 방어형 |
| Devoted | `0xE91E63` | `#E91E63` | 헌신 | 방어형 |
| Cunning | `0x9B59B6` | `#9B59B6` | 냉철 | 전략형 |
| Noble | `0xFFD700` | `#FFD700` | 고결 | 전략형 |
| Mystic | `0xF39C12` | `#F39C12` | 신비 | 전략형 |
| *DEFAULT* | `0x95A5A6` | `#95A5A6` | 기본값 | — |

> 분위기 색상은 `gameConfig.js`(`COLORS.mood`, `MOOD_COLORS`, `MOODS`)와 `layoutConfig.js`(`MOOD_COLORS`) 총 4곳에서 중복 정의되어 있으며 값은 모두 일치합니다. `layoutConfig.js`의 `MOOD_COLORS`에만 `DEFAULT`가 추가로 존재합니다.

---

## 2. 타이포그래피

### 2.1 폰트 패밀리

```
fontFamily: 'Noto Sans KR'
```

### 2.2 폰트 스케일

`sf(basePx)` 함수를 통해 생성됩니다. `SCALE_FACTOR = 1.5`이므로 실제 렌더링 크기는 basePx의 1.5배입니다.

| 용도 | 함수 호출 | Base | 렌더링 크기 | 사용 예시 |
|------|----------|------|------------|----------|
| **H1 / Title** | `sf(32)` | 32px | 48px | 씬 제목, 큰 숫자 |
| **H2 / Large** | `sf(24)` | 24px | 36px | 섹션 제목, 카드 이름 |
| **H3 / Medium** | `sf(20)` | 20px | 30px | 소제목, 강조 텍스트 |
| **Body / Medium** | `sf(18)` | 18px | 27px | 본문 텍스트 |
| **Body Small** | `sf(16)` | 16px | 24px | 보조 설명 |
| **Caption** | `sf(14)` | 14px | 21px | 부가 정보, 태그 |
| **Small** | `sf(12)` | 12px | 18px | 미세 텍스트, 배지 |
| **Tiny** | `sf(10)` | 10px | 15px | 뱃지 내부 숫자 |

> `UI_STYLES.FONT_SIZE`는 `s()` 함수를 사용합니다 (숫자 반환). Phaser Text 스타일의 `fontSize`에는 `sf()`가 필요합니다 (문자열 `"Npx"` 반환).

### 2.3 텍스트 스타일 규칙

| 스타일 | fontStyle | 적용 |
|--------|-----------|------|
| **Bold** | `'bold'` | 제목, 이름, 수치, 버튼 텍스트 |
| **Normal** | (기본) | 본문, 설명, 보조 텍스트 |

---

## 3. 간격 시스템

### 3.1 기본 단위

모든 간격은 `s()` 함수를 통해 스케일됩니다. 기본 단위는 `s(4)`의 배수입니다.

| 토큰 | 호출 | Base | 렌더링 크기 | 용도 |
|------|------|------|------------|------|
| **2xs** | `s(4)` | 4px | 6px | 최소 간격, 아이콘-텍스트 |
| **xs** | `s(8)` | 8px | 12px | 인접 요소, 리스트 아이템 |
| **sm** | `s(12)` | 12px | 18px | 카드 내부 패딩, 그리드 갭 |
| **md** | `s(16)` | 16px | 24px | 표준 패딩, TopBar 패딩 |
| **lg** | `s(20)` | 20px | 30px | 섹션 간 간격, 콘텐츠 좌우 패딩 |
| **xl** | `s(24)` | 24px | 36px | 큰 간격 |
| **2xl** | `s(32)` | 32px | 48px | 영역 분리 |
| **3xl** | `s(48)` | 48px | 72px | 대형 간격 |
| **4xl** | `s(64)` | 64px | 96px | 최대 간격 |

### 3.2 주요 간격 패턴

| 패턴 | 값 | 설명 |
|------|-----|------|
| 섹션 간 간격 | `s(20)` | 콘텐츠 블록 사이 |
| 카드 내부 패딩 | `s(12)` | 카드 테두리 ~ 내용 |
| 컴포넌트 간 간격 | `s(8)` | 같은 그룹 내 요소 |
| 파티 슬롯 간격 | `s(20)` | 파티 편집 슬롯 사이 |
| 콘텐츠 좌우 여백 | `s(20)` | 화면 양쪽 패딩 |

---

## 4. 공통 컴포넌트 스펙

### 4.1 TopBar

| 속성 | 값 | 소스 |
|------|-----|------|
| 높이 | `s(80)` | `layoutConfig.TOP_BAR.HEIGHT` |
| 패딩 | `s(16)` | `layoutConfig.TOP_BAR.PADDING` |
| 배경 | `0x0F172A` | `COLORS.bgDark` |
| 구분선 | primary 알파 0.3 | — |
| Z-Index | 300 | `Z_INDEX.TOP_BAR` |

> **불일치 주의**: `gameConfig.js`의 `LAYOUT.topBar.height`는 `s(100)`이고, `layoutConfig.js`의 `TOP_BAR.HEIGHT`는 `s(80)`입니다. 실제 씬에서 사용하는 값은 `layoutConfig.js`의 `s(80)`입니다.
>
> | 소스 | 현재값 | 권장 |
> |------|--------|------|
> | `gameConfig.LAYOUT.topBar.height` | `s(100)` | `s(80)` (layoutConfig과 통일) |
> | `layoutConfig.TOP_BAR.HEIGHT` | `s(80)` | 유지 |

### 4.2 Card

| 속성 | 값 |
|------|-----|
| 모서리 | `s(12)` |
| 배경 | `0x1E293B` (`COLORS.bgLight`) |
| 테두리 | 1px, primary 알파 0.2 |
| 내부 패딩 | `s(12)` |

### 4.3 Button

| 속성 | 값 | 소스 |
|------|-----|------|
| 기본 너비 | `s(200)` | `gameConfig.LAYOUT.button.width` |
| 기본 높이 | `s(60)` | `gameConfig.LAYOUT.button.height` |
| 모서리 | `s(8)` | — |
| 간격 | `s(20)` | `gameConfig.LAYOUT.button.spacing` |

**버튼 컬러 변형**:

| 변형 | Phaser Hex | CSS Hex | 용도 |
|------|-----------|---------|------|
| Primary | `0x3498DB` | `#3498DB` | 주요 액션 |
| Secondary | `0x2C3E50` | `#2C3E50` | 보조 액션 |
| Success | `0x27AE60` | `#27AE60` | 확인, 완료 |
| Warning | `0xF39C12` | `#F39C12` | 주의 필요 액션 |
| Danger | `0xE74C3C` | `#E74C3C` | 삭제, 위험 |

### 4.4 Panel

| 속성 | 값 |
|------|-----|
| 배경 | `0x0F172A` 알파 0.98 |
| 모서리 | `s(16)` |
| 테두리 | 2px, primary 알파 0.5 |

### 4.5 Modal / Popup

| 속성 | 값 |
|------|-----|
| Z-Index (depth) | 400 (`Z_INDEX.MODAL`) |
| 오버레이 | `0x000000` 알파 0.7 |
| 모서리 | `s(16)` |
| 배경 | `0x1E293B` |

### 4.6 Toast

| 속성 | 값 |
|------|-----|
| Z-Index (depth) | 500+ (`Z_INDEX.TOOLTIP` 이상) |
| 자동 사라짐 | 2000ms |
| 배경 | `0x334155` (`COLORS.bgPanel`) |

### 4.7 Badge

| 속성 | 값 |
|------|-----|
| 형태 | 원형 |
| 폰트 | `sf(10)` |
| 배경 | `0xEF4444` (`COLORS.danger`) |
| 텍스트 | `#FFFFFF` |

### 4.8 ProgressBar

| 속성 | 값 | 소스 |
|------|-----|------|
| 기본 너비 | `s(200)` | `ENERGY_UI.BAR_WIDTH` |
| 기본 높이 | `s(24)` | `ENERGY_UI.BAR_HEIGHT` |
| 모서리 | `s(4)` | — |
| 배경 트랙 | `0x374151` | — |

**에너지 바 레벨별 컬러**:

| 레벨 | 범위 | Phaser Hex | CSS Hex |
|------|------|-----------|---------|
| LOW | 0~30% | `0xE74C3C` | `#E74C3C` |
| MEDIUM | 30~60% | `0xE67E22` | `#E67E22` |
| HIGH | 60~100% | `0x2ECC71` | `#2ECC71` |

---

## 5. 아이콘 / 이모지 가이드

Canvas 기반이므로 유니코드 이모지를 텍스트로 직접 렌더링합니다.

### 5.1 자원

| 자원 | 이모지 | 용도 |
|------|--------|------|
| 보석 (Gem) | 💎 | 프리미엄 재화 |
| 골드 (Gold) | 🪙 | 일반 재화 |
| 에너지 (Energy) | ⚡ | 행동력 |

### 5.2 클래스

| 클래스 | 이모지 | 한글명 |
|--------|--------|--------|
| 전사 | ⚔️ | 전사 |
| 마법사 | 🔮 | 마법사 |
| 궁수 | 🏹 | 궁수 |
| 힐러 | 💚 | 힐러 |

### 5.3 등급 표시

별(⭐) 반복으로 등급 표시:

| 등급 | 별 수 | 표시 |
|------|-------|------|
| N | 2개 | ⭐⭐ |
| R | 3개 | ⭐⭐⭐ |
| SR | 4개 | ⭐⭐⭐⭐ |
| SSR | 5개 | ⭐⭐⭐⭐⭐ |

### 5.4 네비게이션

| 용도 | 기호 |
|------|------|
| 뒤로 가기 | ← |

---

## 6. 애니메이션 규칙

### 6.1 기본 이징

| 용도 | Easing | Phaser 값 |
|------|--------|----------|
| 기본 전환 | Power2 | `'Power2'` |
| 모달 입장 | Back.easeOut | `'Back.easeOut'` |
| 바운스 | Bounce.Out | `'Bounce.Out'` |

### 6.2 타이밍 규격

| 애니메이션 | Duration | Ease | 설명 |
|-----------|----------|------|------|
| **요소 입장** | 200ms | Power2 | alpha 0 → 1 |
| **요소 퇴장** | 150ms | Power2 | alpha 1 → 0 |
| **모달 입장** | 300ms | Back.easeOut | scaleY 0 → 1 |
| **씬 Fade Out** | 200ms | Power2 | alpha 1 → 0 → scene.start |
| **씬 Fade In** | 400ms | Power2 | alpha 0 → 1 |
| **토스트 사라짐** | 2000ms (대기) + 150ms (페이드) | Power2 | 자동 |

### 6.3 인터랙션 피드백

| 이벤트 | 효과 |
|--------|------|
| `pointerover` | alpha → 0.8 |
| `pointerout` | alpha → 1.0 |
| `pointerdown` | scale 0.95 (선택적) |
| `pointerup` | scale 1.0 복원 |

---

## 7. 레이아웃 규칙

### 7.1 화면 구조

```
┌─────────────────────────┐ y = 0
│       TopBar s(80)      │
├─────────────────────────┤ y = s(80)
│                         │
│      Content Area       │
│   (스크롤 가능 영역)      │
│                         │
├─────────────────────────┤ y = GAME_HEIGHT - s(120)
│     BottomNav s(120)    │
└─────────────────────────┘ y = 1920
```

### 7.2 레이아웃 수치

| 영역 | 속성 | 값 | 소스 |
|------|------|-----|------|
| **전체 화면** | 너비 | 1080px | `GAME_WIDTH` |
| **전체 화면** | 높이 | 1920px | `GAME_HEIGHT` |
| **TopBar** | 높이 | `s(80)` = 120px | `TOP_BAR.HEIGHT` |
| **BottomNav** | 높이 | `s(120)` = 180px | `BOTTOM_NAV.HEIGHT` |
| **Content** | 높이 | 1920 - 120 - 180 = 1620px | 동적 계산 |
| **콘텐츠 좌우 패딩** | | `s(20)` = 30px | — |
| **파티 슬롯 크기** | | `s(120)` = 180px | `PARTY.SLOT_SIZE` |
| **전투 유닛 크기** | | `s(100)` = 150px | `BATTLE.UNIT_SIZE` |
| **스킬 카드** | 너비 x 높이 | `s(140)` x `s(180)` = 210 x 270px | `BATTLE.SKILL_CARD` |

### 7.3 카드 그리드

| 속성 | 값 |
|------|-----|
| 열 수 | 2열 기본 |
| 갭 | `s(12)` |
| 카드 너비 | (콘텐츠 너비 - 갭) / 2 |

### 7.4 최소 터치 영역

| 대상 | 최소 크기 |
|------|----------|
| 버튼, 탭 | `s(44)` x `s(44)` (66 x 66px) |
| 아이콘 버튼 | `s(48)` x `s(48)` (72 x 72px) |

---

## 8. 등급(Rarity) 시각 처리

### 8.1 프레임 스타일

| 등급 | Border | Background | Glow | 특수 효과 |
|------|--------|-----------|------|----------|
| **N** | `0x6B7280` | `0x374151` | 없음 | 없음 |
| **R** | `0x3B82F6` | `0x1E3A5F` | 없음 | 없음 |
| **SR** | `0xA855F7` | `0x4C1D95` | `0xA855F7` | 은은한 글로우 |
| **SSR** | `0xF59E0B` | `0x78350F` | `0xF59E0B` | 글로우 + 반짝임 |

### 8.2 SSR 반짝임 효과

```
- 파티클 또는 tween 기반 shimmer
- 주기: 2~3초 간격
- 글로우 alpha 0.3 ↔ 0.8 사이 반복
- 색상: 0xF59E0B (황금)
```

### 8.3 장비 등급

장비도 같은 등급 시스템이지만, 데미지 배율이 추가됩니다.

| 등급 | 배율 | 컬러 |
|------|------|------|
| N | x1.0 | `0x9CA3AF` |
| R | x1.2 | `0x3B82F6` |
| SR | x1.5 | `0xA855F7` |
| SSR | x2.0 | `0xF59E0B` |

---

## 9. Z-Index 레이어

| 레이어 | Depth 값 | 용도 |
|--------|---------|------|
| **BACKGROUND** | 0 | 배경 이미지, 데코레이션 |
| **GAME_OBJECTS** | 100 | 캐릭터, 적, 투사체 |
| **UI** | 200 | 일반 UI 요소, 카드, 리스트 |
| **TOP_BAR** | 300 | 상단 바 (고정) |
| **BOTTOM_NAV** | 300 | 하단 네비게이션 (고정) |
| **MODAL** | 400 | 모달, 팝업, 확인 다이얼로그 |
| **TOOLTIP** | 500 | 툴팁, 토스트 메시지 |
| **DEBUG** | 8000+ | 디버그 패널, 치트 콘솔 |

---

## 부록: 불일치 요약

아래는 `gameConfig.js`와 `layoutConfig.js` 사이에서 발견된 불일치 사항입니다. 코드 통일 시 참고하세요.

| # | 항목 | gameConfig.js | layoutConfig.js | 권장 |
|---|------|--------------|-----------------|------|
| 1 | TopBar 높이 | `s(100)` | `s(80)` | `s(80)` (layoutConfig 기준) |
| 2 | 배경 Primary | `0x0F172A` | `0x1A1A2E` | `0x0F172A` (gameConfig 기준) |
| 3 | 배경 Secondary | `0x1E293B` | `0x16213E` | `0x1E293B` (gameConfig 기준) |
| 4 | 텍스트 Primary | `#F8FAFC` | `#FFFFFF` | `#F8FAFC` (gameConfig 기준) |
| 5 | 텍스트 Secondary | `#94A3B8` | `#B0B0B0` | `#94A3B8` (gameConfig 기준) |
| 6 | SSR 텍스트 컬러 | `0xF97316` (rarity) | `0xF59E0B` (border) | `0xF59E0B`로 통일 |
| 7 | Mood/Cult 중복 | 4곳 중복 정의 | — | 단일 소스로 통합 권장 |

> **참고**: 위 권장값은 제안 사항입니다. 코드 수정은 이 문서의 범위 밖입니다.
