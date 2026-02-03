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
- [ ] 성격 색상 팔레트
- [ ] 에너지/소탕 상수

### Task 5.2: 상수 및 유틸 업데이트
- [ ] constants.js 업데이트
- [ ] 성격 상수 추가
- [ ] 에너지 상수 추가
- [ ] 소탕 상수 추가

### Task 5.3: 게임 기획서 업데이트
- [ ] GameDesignDocument 업데이트
- [ ] 성격 시스템 문서화
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

### 성격 색상 팔레트
```javascript
export const PERSONALITY_COLORS = {
  Brave: '#E74C3C',
  Cunning: '#9B59B6',
  Calm: '#3498DB',
  Wild: '#27AE60',
  Mystic: '#F39C12',
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
// 성격 타입
export const PERSONALITY = {
  BRAVE: 'Brave',
  CUNNING: 'Cunning',
  CALM: 'Calm',
  WILD: 'Wild',
  MYSTIC: 'Mystic',
};

// 성격 상성
export const PERSONALITY_MATCHUP = {
  [PERSONALITY.BRAVE]: { strong: PERSONALITY.CUNNING, weak: PERSONALITY.CALM },
  [PERSONALITY.CUNNING]: { strong: PERSONALITY.CALM, weak: PERSONALITY.WILD },
  [PERSONALITY.CALM]: { strong: PERSONALITY.WILD, weak: PERSONALITY.BRAVE },
  [PERSONALITY.WILD]: { strong: PERSONALITY.BRAVE, weak: PERSONALITY.CUNNING },
  [PERSONALITY.MYSTIC]: { strong: null, weak: null }, // 모두에게 +10%
};

// 교단 타입
export const CULT = {
  VALHALLA: 'valhalla',
  TAKAMAGAHARA: 'takamagahara',
  OLYMPUS: 'olympus',
  ASGARD: 'asgard',
  YOMI: 'yomi',
};

// 교단-성격 최적 조합
export const CULT_PERSONALITY_BONUS = {
  [CULT.VALHALLA]: [PERSONALITY.BRAVE, PERSONALITY.WILD],
  [CULT.TAKAMAGAHARA]: [PERSONALITY.CUNNING, PERSONALITY.MYSTIC],
  [CULT.OLYMPUS]: [PERSONALITY.BRAVE, PERSONALITY.MYSTIC],
  [CULT.ASGARD]: [PERSONALITY.CALM, PERSONALITY.WILD],
  [CULT.YOMI]: [PERSONALITY.CUNNING, PERSONALITY.CALM],
};
```

---

## 문서 업데이트 항목

### GameDesignDocument 추가 섹션
1. 성격(Personality) 시스템
   - 5가지 성격 설명
   - 상성 관계
   - 교단-성격 보너스

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
[W5][5.1] gameConfig.js 해상도 및 성격 색상 설정
[W5][5.2] constants.js 성격/에너지/소탕 상수 추가
[W5][5.3] GameDesignDocument v4 업데이트
```
