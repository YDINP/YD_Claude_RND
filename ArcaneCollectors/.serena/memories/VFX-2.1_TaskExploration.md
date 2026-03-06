# VFX-2.1: 스킬 애니메이션 시스템 - 탐색 결과

## 프로젝트 상태
- **저장소**: D:\park\YD_Claude_RND-w4\ArcaneCollectors
- **현재 브랜치**: arcane/w4-system
- **빌드 도구**: Phaser 3.80.1, Vite 5, ES Modules

## 핵심 탐색 결과

### 1. 기존 애니메이션 인프라
- **TransitionManager.js** (600줄): Scene 전환 이펙트 전담
  - fadeTransition, slideTransition, battleEntryTransition, gachaEntryTransition, zoomTransition
  - victoryTransition, defeatTransition
  - 패턴: 오버레이 → 텍스트 → 진동 → 플래시 → 페이드 (각각 타이밍 ms 단위)

- **animations.js** (400줄): 재사용 가능한 기본 Tween 라이브러리
  - fadeIn/Out, scaleIn/Out, bounce, popIn
  - shake, slideIn/Out, floatUp
  - pulse, float, spin, glow (무한 반복)
  - countUp, particleBurst, starBurst
  - attackAnimation, hitReaction, deathAnimation
  - 패턴: Phaser tweens.add() 사용, Promise/onComplete 콜백

- **ParticleManager.js** (400줄): Singleton 파티클 관리자
  - ObjectPool: 원/텍스트 오브젝트 풀링 (최대 200개)
  - playPreset(presetName, x, y, options): 프리셋 기반 재생
  - playMoodEffect(mood, x, y, type): 분위기별 차별화 이펙트
  - playRarityEffect(rarity, x, y): 등급별 파티클
  - playLevelUpEffect, playEvolutionEffect
  - showDamageNumber(x, y, value, type): 데미지/치유 숫자 표시
  - playBattleStartEffect, playVictoryEffect, playDefeatEffect

### 2. 분위기(Mood) 시스템
**9종 분위기 정의** (constants.js):
- 공격형: brave(열혈), fierce(격렬), wild(광폭)
- 방어형: calm(고요), stoic(의연), devoted(헌신)
- 전략형: cunning(냉철), noble(고결), mystic(신비)

**분위기별 색상** (designSystem.js - DESIGN.colors.mood):
```
brave:   0xE74C3C  // 빨강
fierce:  0xFF5722  // 주홍
wild:    0x27AE60  // 초록
calm:    0x3498DB  // 파랑
stoic:   0x607D8B  // 청회색
devoted: 0xE91E63  // 핑크
cunning: 0x9B59B6  // 보라
noble:   0xFFD700  // 금색
mystic:  0xF39C12  // 주황금
```

**분위기별 파티클 색상** (particleConfig.js - MOOD_PARTICLE_COLORS):
- 각 분위기마다 3가지 색상 팔레트 정의 (밝음→중간→어두움)
- 예: brave=[0xE74C3C, 0xFF6B6B, 0xFFA07A]

### 3. 전투 시스템 아키텍처
**BattleSystem.js** (800줄):
- Strategy Pattern: 스킬 효과 (BasicAttackStrategy, PowerStrikeStrategy, HealStrategy, AoeAttackStrategy)
- Observer Pattern: 이벤트 발행 (BattleEventEmitter)
- State Pattern: 전투 상태 (IDLE, INITIALIZING, TURN_START, PROCESSING_ACTION, TURN_END, VICTORY, DEFEAT, TIMEOUT)

**스킬 데이터 구조** (skills.json):
```json
{
  "id": "skill_fireball",
  "name": "파이어볼",
  "type": "active|ultimate",
  "target": "enemy_single|enemy_all|ally_single|ally_all",
  "multiplier": 1.5,
  "chargeRequired": 100,  // 궁극기: 게이지 필요
  "effects": [
    {"type": "burn", "chance": 0.5, "duration": 2}
  ]
}
```

**스킬 사용 흐름**:
1. BattleSystem.getAIAction(unit) → 스킬 선택
2. BattleSystem.executeAction(unit, skill, targets) → 데미지 계산 + 적용
3. emit('damage') / emit('heal') 이벤트 발행
4. BattleScene이 이벤트 리스너로 애니메이션 트리거

### 4. 파티클 프리셋 라이브러리
**particleConfig.js - PARTICLE_PRESETS**:
- sparkle: 별 반짝임 (8개, 30~80 속도, 400~800ms)
- smoke: 연기 (6개, 10~30 속도, 600~1200ms)
- flame: 불꽃 (12개, 50~120 속도, 300~600ms, 중력 -100)
- lightPillar: 빛기둥 (16개, 수직, 500~1000ms)
- converge: 소환 수렴 (20개, 외부→중심, 600~1000ms)
- celebration: 축하 (24개, 별 모양, 800~1500ms)
- hit: 히트 (6개, 200~400ms)
- heal: 치유 (10개, 초록색, 600~1000ms)
- buff/debuff: 버프/디버프 (8개, 800~1200ms)

### 5. 데미지 숫자 스타일
**DAMAGE_NUMBER_STYLES**:
- normal: 흰색 22px (800ms, 상승 40px)
- critical: 금색 32px (1000ms, 상승 60px, shake=true)
- moodAdvantage: 노란색 24px + ▲ (900ms, 상승 50px)
- moodDisadvantage: 파란색 20px + ▼ (800ms, 상승 35px)
- heal: 초록색 22px + 접두사 '+' (900ms, 상승 45px)
- miss: 회색 18px 'MISS' (600ms, 상승 30px)

### 6. 현재 스킬 애니메이션 상태
**TransitionManager의 battleEntryTransition 패턴**:
```
0~300ms:   검은색 오버레이 페이드인 (alpha: 0→0.8)
300~500ms: 'BATTLE START' 텍스트 슬라이드인 (x: -300→center)
500~800ms: 카메라 진동 (shake, 300ms, 0.005 강도)
800~900ms: 카메라 플래시 (flash, 100ms, 흰색)
900~1200ms: 페이드아웃 후 BattleScene 전환
```

**필요한 스킬 애니메이션**:
- 일반 스킬: 전진(200ms) → 공격포즈(100ms) → 히트이펙트(200ms) → 복귀(300ms)
- 궁극기: 오버레이 → 컷인 → 스킬명 → 플래시 → 전체이펙트 (2.0초 총합)

## 아키텍처 설계 방향

### SkillAnimationManager 클래스 구조
```
- playSkillAnimation(unit, skill, targets, battleSystem)
  - playCharacterAnimation(unit, direction, duration)
  - playHitEffect(target, skill.mood, skill.type)
  - playDamageNumber(target, damage, isCrit, moodBonus)
  
- playUltimateAnimation(unit, skill, targets, battleSystem)
  - playOverlay()
  - playCutIn(skillName)
  - playFlash()
  - playFullScreenEffect(skill.mood, targets.length)
  
- getMoodAnimationConfig(mood): 분위기별 색상/파티클 설정 반환
```

### 의존성
- ParticleManager (기존 파티클 시스템 활용)
- BattleSystem (스킬/분위기 정보 조회)
- animations.js (Tween 유틸리티 재사용)
- MoodSystem (상성 계산)
- designSystem.js (색상 팔레트)
- particleConfig.js (프리셋 + 색상)

## 구현 가능한 재사용 자산
1. **TransitionManager**: 타이밍 구조 참고 (오버레이→텍스트→진동→플래시)
2. **ParticleManager**: playMoodEffect 확장 (skill 타입별로 이미 분기)
3. **animations.js**: attackAnimation, hitReaction, floatUp 재사용
4. **particleConfig.js**: MOOD_PARTICLE_COLORS + PARTICLE_PRESETS 활용
5. **BattleSystem**: emit('damage') 이벤트 후킹으로 애니메이션 트리거

## 성능 고려사항
- ParticleManager의 ObjectPool 이미 구현 (최대 200개)
- 모바일 성능: 동시 파티클 수 제한 (현재 hit=6, sparkle=8~16)
- Timeline 사용으로 동시 Tween 최소화 (현재 TransitionManager 패턴)
- Singleton 패턴으로 인스턴스 생성 최소화

## 파일 위치 정리
- `src/utils/animations.js`: 기본 Tween 유틸
- `src/utils/TransitionManager.js`: Scene 전환 패턴
- `src/systems/ParticleManager.js`: 파티클 관리
- `src/config/particleConfig.js`: 프리셋 + 색상
- `src/config/designSystem.js`: 색상 토큰
- `src/systems/BattleSystem.js`: 전투 로직
- `src/systems/MoodSystem.js`: 분위기 상성
- `src/data/skills.json`: 스킬 정의
- `src/data/synergies.json`: 시너지 정의
