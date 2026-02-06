# W5: 설정/문서 Worker 가이드

## 개요
- **브랜치**: `arcane/w5-config`
- **폴더**: `D:\park\YD_Claude_RND-w5`
- **담당**: 설정 파일 및 문서

---

## 파일 소유권

```
src/config/gameConfig.js
src/utils/constants.js
docs/**
```

---

## 태스크 목록

### Task 5.1: 게임 설정 업데이트
- [ ] gameConfig.js 전면 업데이트
- [ ] 해상도 설정
- [ ] 분위기 색상 팔레트 (9종)
- [ ] 에너지/소탕 상수

### Task 5.2: 상수 및 유틸 업데이트
- [✅] constants.js 업데이트
- [✅] 분위기 상수 추가 (MOOD, 9종)
- [✅] MOOD_MATCHUP → 9×9 배열 기반 상성
- [ ] 에너지 상수 추가
- [ ] 소탕 상수 추가

### Task 5.3: 게임 기획서 업데이트
- [ ] GameDesignDocument 업데이트
- [ ] 분위기 시스템 문서화 (9종)
- [ ] 에너지/소탕 문서화
- [ ] 백엔드 API 문서화

---

## 설정 참조

### 해상도 설정
```javascript
// gameConfig.js
export const GAME_CONFIG = {
  width: 720,
  height: 1280,
  scaleMode: Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH,
};
```

### 분위기 색상 팔레트
```javascript
export const MOOD_COLORS = {
  brave: '#E74C3C',
  fierce: '#FF5722',
  wild: '#27AE60',
  calm: '#3498DB',
  stoic: '#607D8B',
  devoted: '#E91E63',
  cunning: '#9B59B6',
  noble: '#FFD700',
  mystic: '#F39C12',
};
```

### 에너지 상수
```javascript
export const ENERGY_CONFIG = {
  BASE_MAX_ENERGY: 100,
  ENERGY_PER_LEVEL: 2,
  RECOVERY_INTERVAL: 5 * 60 * 1000, // 5분
  GEMS_PER_CHARGE: 50,
  ENERGY_PER_CHARGE: 50,
};
```

### 스테이지 에너지 소모
```javascript
export const STAGE_ENERGY_COST = {
  NORMAL: 6,
  ELITE: 12,
  BOSS: 20,
};
```

### 소탕 상수
```javascript
export const SWEEP_CONFIG = {
  DAILY_LIMIT: 50,
  REQUIRED_STARS: 3,
  TICKET_COST: 1,
};
```

### 파티 상수
```javascript
export const PARTY_CONFIG = {
  MAX_SLOTS: 5,
  PARTY_SIZE: 4,
};
```

---

## constants.js 구조 예시

```javascript
// 분위기 타입 (9종)
export const MOOD = {
  BRAVE: 'brave',
  FIERCE: 'fierce',
  WILD: 'wild',
  CALM: 'calm',
  STOIC: 'stoic',
  DEVOTED: 'devoted',
  CUNNING: 'cunning',
  NOBLE: 'noble',
  MYSTIC: 'mystic',
};

// 분위기 상성 (9×9 배열 기반)
// 상세 매트릭스는 MoodSystem.js 참조
export const MOOD_MATCHUP = [
  // brave, fierce, wild, calm, stoic, devoted, cunning, noble, mystic
  [1.0, 1.1, 1.15, 0.85, 0.9, 1.0, 1.2, 1.0, 0.95], // brave
  [0.9, 1.0, 1.2, 0.8, 0.85, 0.95, 1.1, 0.9, 0.9],  // fierce
  // ... (나머지 7개 행)
];

// 교단 타입
export const CULT = {
  VALHALLA: 'valhalla',
  TAKAMAGAHARA: 'takamagahara',
  OLYMPUS: 'olympus',
  ASGARD: 'asgard',
  YOMI: 'yomi',
};

// 교단-분위기 최적 조합
export const CULT_MOOD_BONUS = {
  [CULT.VALHALLA]: [MOOD.BRAVE, MOOD.FIERCE, MOOD.WILD],
  [CULT.TAKAMAGAHARA]: [MOOD.CUNNING, MOOD.MYSTIC],
  [CULT.OLYMPUS]: [MOOD.BRAVE, MOOD.NOBLE, MOOD.MYSTIC],
  [CULT.ASGARD]: [MOOD.CALM, MOOD.STOIC, MOOD.DEVOTED],
  [CULT.YOMI]: [MOOD.CUNNING, MOOD.CALM],
};
```

---

## 문서 업데이트 항목

### GameDesignDocument 추가 섹션
1. 분위기(Mood) 시스템
   - 9종 분위기 설명 (brave/fierce/wild/calm/stoic/devoted/cunning/noble/mystic)
   - 9×9 상성 관계 (배열 기반)
   - 교단-분위기 보너스

2. 에너지 시스템
   - 최대 에너지 공식
   - 회복 메커니즘
   - 충전 방법

3. 소탕 시스템
   - 해금 조건
   - 비용 및 보상
   - 일일 제한

4. 백엔드 API
   - 엔드포인트 목록
   - 요청/응답 형식
   - 에러 코드

---

## 독립 작업 가능

W5는 다른 Worker들과 의존성이 낮아 **독립적으로 병렬 진행 가능**합니다.

단, `gameConfig.js`와 `constants.js`는 다른 Worker들이 참조하므로 **먼저 완료하는 것을 권장**합니다.

---

## 커밋 예시
```
[W5][5.1] gameConfig.js 해상도 및 분위기 색상 설정 (9종)
[W5][5.2] constants.js 분위기/에너지/소탕 상수 추가 (MOOD 9종)
[W5][5.3] GameDesignDocument v4 업데이트 - 분위기 시스템
```
