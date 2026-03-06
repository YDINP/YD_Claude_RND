# VFX-2.1 스킬 애니메이션 시스템 — 아키텍처 설계

**Sprint:** W4 | **Task:** VFX-2.1 | **Date:** 2026-02-08  
**Status:** ARCHITECTURE DESIGN COMPLETE  
**Audience:** Architects, Execution Team, QA

---

## 0. 현재 상태 분석 (Critical Findings)

### 0.1 핵심 발견: BattleScene과 BattleSystem 분리

**BattleScene** (`src/scenes/BattleScene.js`, ~2100줄)은 **자체 독립적인 전투 로직**을 가지고 있으며, **BattleSystem** (`src/systems/BattleSystem.js`)의 인스턴스를 사용하지 않는다.

#### 현재 구조
```
BattleScene (자체 구현)
├─ processTurn()                           ← 턴 진행 (delayedCall 기반)
├─ executeBattlerAction()                  ← 배틀러 액션 결정
├─ _executeAttack() / _executeSingleAttack() ← 공격 실행
├─ playSkillEffect()                       ← ParticleManager 호출
├─ showDamage()                            ← 데미지 표시
├─ emitBattleEvent() / onBattleEvent()     ← 자체 이벤트 시스템
└─ [기타 UI/애니메이션 메서드]

BattleSystem (미사용)
├─ BattleEventEmitter (Observer 패턴) ← 선언되었으나 BattleScene에서 미참조
├─ SKILL_STRATEGIES (Strategy 패턴)
└─ [기타 클래스/메서드]
```

#### 영향
- **설계 범위:** BattleScene의 메서드만 수정하면 됨
- **BattleSystem 통합:** 현재 계획에서 제외 (선택적, 향후 리팩토링)
- **이벤트 시스템:** BattleScene 자체 `emitBattleEvent()` 계속 사용

---

### 0.2 현재 애니메이션 흐름 (동기, Fire-and-Forget)

```
processTurn()  [동기, delayedCall 기반]
│
├─ [0ms ~ baseDelay*N]
│  ├─ battler[0]: executeBattlerAction()
│  │  └─ _executeSingleAttack()
│  │     ├─ playAttackAnimation()       [Tween 시작, 즉시 반환]
│  │     ├─ playSkillEffect()           [ParticleManager, 즉시 반환]
│  │     └─ showDamage()                [Text Tween, 즉시 반환]
│  │
│  ├─ battler[1]: executeBattlerAction() [0ms 경과, 동시 실행 가능]
│  │  └─ [동일 흐름]
│  │
│  └─ battler[N]: executeBattlerAction()
│
├─ [delay + 500ms] checkBattleEnd()
└─ processTurn() 재귀 호출 (자동 모드)
```

#### 문제점
- **애니메이션 완료 대기 없음:** 턴이 완료되어도 파티클/Tween이 여전히 실행 중일 수 있음
- **타이밍 불확실성:** 다음 배틀러가 이전 배틀러 애니메이션과 겹칠 수 있음
- **Impact 동기화 불가:** 데미지 표시와 파티클 영향이 시각적으로 부자연스러움

---

### 0.3 기존 ParticleManager 구조

| 메서드 | 입출력 | 동작 |
|--------|--------|------|
| `playMoodEffect(mood, x, y, type)` | type: 'hit'\|'skill'\|'ultimate' | Fire-and-forget 파티클 생성 |
| `playPreset(presetName, x, y, options)` | PARTICLE_PRESETS 참조 | 프리셋 파티클 생성 |
| `showDamageNumber(x, y, value, type)` | type: 'normal'\|'critical'\|'heal' | 데미지 숫자 Text 생성 |
| 내부: `_playHitEffect()`, `_playSkillEffect()`, `_playUltimateEffect()` | 분위기별 색상 매핑 | 구체적 파티클 구현 |
| **Object Pool** | 초기 50개, max 200개 | `ObjectPool` 클래스 활용 |

**현재 제약:**
- Promise 기반 완료 시점 추적 불가
- 분위기별 특화 패턴 제한적 (기본 hit/skill/ultimate만)
- 힐 이펙트 독립 메서드 없음 (skill 타입으로 대체)

---

## 1. 수정 순서 (의존성 기반)

### 1.1 실행 순서 (4단계)

| 순서 | 파일 | 작업 유형 | 줄수 | 의존성 | 위험도 |
|------|------|----------|------|--------|--------|
| **C1** | `src/config/skillAnimationConfig.js` | 신규 생성 | ~250 | 없음 | LOW |
| **C2** | `src/systems/ParticleManager.js` | 메서드 추가 | +~120 | C1 | LOW |
| **C3** | `src/systems/SkillAnimationManager.js` | 신규 생성 | ~450 | C1, C2 | MEDIUM |
| **C4** | `src/scenes/BattleScene.js` | 핵심 통합 | ~80 변경 | C1, C2, C3 | HIGH |

### 1.2 의존성 그래프

```
┌─────────────────────────────────────────┐
│ C1: skillAnimationConfig.js             │
│ (SKILL_TIMINGS, MOOD_VFX_MAP, etc)      │
└────────────┬──────────────────────────┬─┘
             │                          │
    ┌────────▼─────────┐      ┌────────▼────────┐
    │ C2: ParticleM... │      │ C3: SkillAnimM..│
    │ (Async 메서드)   │      │ (오케스트레이션)│
    │                  │      │                 │
    └──────────────────┘      └────────┬────────┘
             │                         │
             └────────────┬────────────┘
                          │
                  ┌───────▼──────────┐
                  │ C4: BattleScene  │
                  │ (통합)           │
                  └──────────────────┘
```

### 1.3 각 단계별 상세

#### **C1: skillAnimationConfig.js (신규 생성)**

```javascript
// src/config/skillAnimationConfig.js (약 250줄)

export const SKILL_TIMINGS = {
  basic:    { total: 400,  phases: { windup: 100,  impact: 150,  recovery: 150 } },
  skill1:   { total: 800,  phases: { windup: 200,  impact: 300,  recovery: 300 } },
  skill2:   { total: 2000, phases: { cutIn: 600,   windup: 300,  impact: 500,  recovery: 600 } },
  heal:     { total: 600,  phases: { cast: 200,    effect: 300,  recovery: 100 } }
};

export const MOOD_VFX_MAP = {
  brave:   { pattern: 'flame_burst',   trail: 'fire',      impact: 'explosion',  color: 0xE74C3C },
  fierce:  { pattern: 'magma_wave',    trail: 'ember',     impact: 'shockwave',  color: 0xFF5722 },
  wild:    { pattern: 'wind_slash',    trail: 'leaf',      impact: 'tornado',    color: 0x27AE60 },
  calm:    { pattern: 'water_ripple',  trail: 'bubble',    impact: 'wave',       color: 0x3498DB },
  stoic:   { pattern: 'stone_strike',  trail: 'dust',      impact: 'quake',      color: 0x607D8B },
  devoted: { pattern: 'light_beam',    trail: 'sparkle',   impact: 'radiance',   color: 0xE91E63 },
  cunning: { pattern: 'frost_spike',   trail: 'ice',       impact: 'freeze',     color: 0x9B59B6 },
  noble:   { pattern: 'golden_strike', trail: 'star',      impact: 'flash',      color: 0xFFD700 },
  mystic:  { pattern: 'astral_bolt',   trail: 'comet',     impact: 'nova',       color: 0xF39C12 }
};

export const ULTIMATE_CUTSCENE = {
  overlay:         { duration: 200, alpha: 0.7 },
  portrait:        { zoomDuration: 200, holdDuration: 400 },
  nameSlide:       { duration: 150, delay: 100 },
  skillTextSlide:  { duration: 150, delay: 50 },
  fadeOut:         { duration: 200 },
  totalDuration:   600  // cutIn phase 전체 (800ms 초과 X)
};

export const PERFORMANCE_LIMITS = {
  maxSimultaneousParticles:  50,
  maxSimultaneousTweens:     20,
  mobileTargetFPS:           30,
  particlePoolSize:          200,
  autoQualityThreshold:      25  // FPS < 25 시 품질 저하
};

export const DEBUG_FLAGS = {
  logTimings:      false,
  showPhaseLabels: false,  // 개발 중 Phase 표시
  disableParticles: false
};
```

**인수:** 없음 (설정 상수만)  
**산출물:** 설정 파일 1개  
**테스트:** 형식 검증 (import 가능 여부)

---

#### **C2: ParticleManager.js 확장**

기존 메서드는 **수정하지 않고**, 새 메서드만 **추가**한다.

```javascript
// src/systems/ParticleManager.js에 추가할 메서드들 (~120줄)

/**
 * Promise 기반 Mood 스킬 이펙트
 * @param {string} mood - 분위기 (brave, fierce, ...)
 * @param {number} x, y - 좌표
 * @param {string} type - 'hit' | 'skill' | 'ultimate'
 * @returns {Promise<void>} 애니메이션 완료 시 resolve
 */
playMoodEffectAsync(mood, x, y, type = 'hit') {
  return new Promise(resolve => {
    this.playMoodEffect(mood, x, y, type);
    const durations = { hit: 400, skill: 600, ultimate: 1200 };
    const duration = durations[type] || 400;
    this.scene.time.delayedCall(duration, resolve);
  });
}

/**
 * 분위기별 특화 스킬 파티클 (skill1용)
 * MOOD_VFX_MAP 패턴 기반
 */
playMoodSkillPattern(mood, x, y, moodVfxData) {
  const { pattern, trail, impact, color } = moodVfxData || {};
  // pattern 별로 프리셋 조합 실행
  // 예: 'flame_burst' → flame + sparkle 복합
}

/**
 * 분위기별 궁극기 특화 파티클 (skill2용)
 * 기존 _playUltimateEffect 강화
 */
playMoodUltimatePattern(mood, x, y, moodVfxData) {
  // 대규모 이펙트: 메인 파티클 + 트레일 + 충격 효과
  // 분위기별 색상 + 고유 패턴 적용
}

/**
 * 힐링 특화 이펙트 (Promise 기반)
 * @returns {Promise<void>}
 */
playHealEffectAsync(x, y, mood) {
  return new Promise(resolve => {
    // 녹색 힐 프리셋 + 분위기 색상 overlay
    this.playPreset('heal', x, y, {
      colors: [0x22C55E, 0x4ADE80, 0xBBF7D0],
      count: 12
    });
    // 반짝임 추가
    this.playPreset('sparkle', x, y - 20, {
      colors: [0x4ADE80, 0xBBF7D0],
      count: 8
    });
    this.scene.time.delayedCall(600, resolve);
  });
}

/**
 * 파티클 풀 상태 조회 (성능 모니터링용)
 */
getPoolStats() {
  return {
    active: this.activeParticles.length,
    pooled: this.particlePool.length,
    total: this.activeParticles.length + this.particlePool.length,
    utilizationRate: (this.activeParticles.length / this.config.particlePoolSize * 100).toFixed(1) + '%'
  };
}
```

**인수:** C1의 설정 상수 (import로 사용하지 않음, ParticleManager 독립 동작)  
**산출물:** 4개 메서드 + 1개 조회 메서드 추가  
**테스트:** 각 메서드 비동기 완료 확인, Promise resolve 타이밍

---

#### **C3: SkillAnimationManager.js (신규 생성)**

```javascript
// src/systems/SkillAnimationManager.js (약 450줄)

import { SKILL_TIMINGS, MOOD_VFX_MAP, ULTIMATE_CUTSCENE, PERFORMANCE_LIMITS } from '../config/skillAnimationConfig.js';

/**
 * SkillAnimationManager
 * 스킬 애니메이션의 Phase 기반 오케스트레이션
 * 
 * 책임:
 * - Phase 시퀀싱 (Windup → Impact → Recovery)
 * - Promise 기반 완료 대기
 * - 성능 모니터링 및 품질 조절
 * - AbortController로 안전한 shutdown
 */
export class SkillAnimationManager {
  constructor(scene, particleManager) {
    this.scene = scene;
    this.particles = particleManager;
    this.isAnimating = false;
    this.abortController = null;
    this.qualityLevel = 'high';  // 'high' | 'medium' | 'low'
    this.lastFpsCheck = Date.now();
  }

  // ========== 공개 인터페이스 ==========

  /**
   * 일반 스킬 애니메이션 (basic/skill1)
   * 
   * @param {Object} attacker - 공격자 (id, mood, name)
   * @param {Object} target - 대상 (id, position)
   * @param {Object} skill - 스킬 (id, name, multiplier, ...)
   * @param {Object} sprites - { attacker: sprite, target: sprite }
   * @param {Object} callbacks - { onImpact: function() }
   * @returns {Promise<void>}
   */
  async playNormalSkill(attacker, target, skill, sprites, callbacks = {}) {
    if (!this.scene) return;
    
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.isAnimating = true;

    const timing = SKILL_TIMINGS[skill.id] || SKILL_TIMINGS.basic;
    const speedMul = 1 / (this.scene.battleSpeed || 1);

    try {
      // Phase 1: Windup (공격자 강조)
      await this._playWindup(attacker, sprites, timing.phases.windup * speedMul, signal);
      if (signal.aborted) return;

      // Phase 2: Impact (파티클 + 데미지 콜백)
      callbacks.onImpact?.();
      await this._playImpact(target, attacker.mood, sprites, timing.phases.impact * speedMul, signal);
      if (signal.aborted) return;

      // Phase 3: Recovery (원위치)
      await this._playRecovery(attacker, sprites, timing.phases.recovery * speedMul, signal);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[SkillAnimator] playNormalSkill error:', e);
      }
    } finally {
      this.isAnimating = false;
    }
  }

  /**
   * 궁극기 애니메이션 (skill2)
   * 컷인 + 파티클 + 회복
   * 
   * @returns {Promise<void>}
   */
  async playUltimateSkill(attacker, target, skill, sprites, callbacks = {}) {
    if (!this.scene) return;

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.isAnimating = true;

    const timing = SKILL_TIMINGS.skill2;
    const speedMul = 1 / (this.scene.battleSpeed || 1);

    try {
      // Phase 0: Cut-in (컷인 연출)
      await this._playCutIn(attacker, timing.phases.cutIn * speedMul, signal);
      if (signal.aborted) return;

      // Phase 1: Windup
      await this._playWindup(attacker, sprites, timing.phases.windup * speedMul, signal);
      if (signal.aborted) return;

      // Phase 2: Impact (최강의 파티클)
      callbacks.onImpact?.();
      await this._playImpactUltimate(target, attacker.mood, sprites, timing.phases.impact * speedMul, signal);
      if (signal.aborted) return;

      // Phase 3: Recovery
      await this._playRecovery(attacker, sprites, timing.phases.recovery * speedMul, signal);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[SkillAnimator] playUltimateSkill error:', e);
      }
    } finally {
      this.isAnimating = false;
    }
  }

  /**
   * 힐 애니메이션
   * 
   * @returns {Promise<void>}
   */
  async playHealAnimation(healer, target, skill, sprites, callbacks = {}) {
    if (!this.scene) return;

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.isAnimating = true;

    const timing = SKILL_TIMINGS.heal;
    const speedMul = 1 / (this.scene.battleSpeed || 1);

    try {
      // Cast phase (시전)
      await this._playCast(healer, sprites, timing.phases.cast * speedMul, signal);
      if (signal.aborted) return;

      // Effect phase (효과)
      callbacks.onImpact?.();
      await this._playHealEffect(target, healer.mood, sprites, timing.phases.effect * speedMul, signal);
      if (signal.aborted) return;

      // Recovery phase
      await this._playRecovery(healer, sprites, timing.phases.recovery * speedMul, signal);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[SkillAnimator] playHealAnimation error:', e);
      }
    } finally {
      this.isAnimating = false;
    }
  }

  // ========== 내부 Phase 메서드 ==========

  async _playWindup(attacker, sprites, duration, signal) {
    if (signal?.aborted) return;
    const sprite = sprites.attacker;
    if (!sprite) return;

    return this._tweenAsync({
      targets: sprite,
      scaleX: 1.1,
      scaleY: 1.1,
      duration,
      ease: 'Power2.easeInOut',
      signal
    });
  }

  async _playImpact(target, mood, sprites, duration, signal) {
    if (signal?.aborted) return;
    const sprite = sprites.target;
    if (!sprite) return;

    // 파티클
    if (this.particles) {
      await this.particles.playMoodEffectAsync(mood, sprite.x, sprite.y, 'skill');
    }

    // 타겟 흔들림
    return this._tweenAsync({
      targets: sprite,
      x: sprite.x + Phaser.Math.Between(-8, 8),
      duration: duration / 2,
      yoyo: true,
      repeat: 1,
      ease: 'Power1.easeInOut',
      signal
    });
  }

  async _playImpactUltimate(target, mood, sprites, duration, signal) {
    if (signal?.aborted) return;
    const sprite = sprites.target;
    if (!sprite) return;

    // 대규모 파티클
    if (this.particles) {
      await this.particles.playMoodEffectAsync(mood, sprite.x, sprite.y, 'ultimate');
    }

    // 화면 흔들림
    if (this.scene?.cameras) {
      this.scene.cameras.main.shake(200, 0.01);
    }

    // 타겟 강한 흔들림
    return this._tweenAsync({
      targets: sprite,
      x: sprite.x + Phaser.Math.Between(-12, 12),
      duration: duration / 2,
      yoyo: true,
      repeat: 2,
      ease: 'Power1.easeInOut',
      signal
    });
  }

  async _playRecovery(unit, sprites, duration, signal) {
    if (signal?.aborted) return;
    const sprite = sprites.attacker;
    if (!sprite) return;

    // 원위치 + 스케일 복원
    return this._tweenAsync({
      targets: sprite,
      scaleX: 1,
      scaleY: 1,
      duration,
      ease: 'Power2.easeOut',
      signal
    });
  }

  async _playCast(healer, sprites, duration, signal) {
    if (signal?.aborted) return;
    const sprite = sprites.attacker;
    if (!sprite) return;

    return this._tweenAsync({
      targets: sprite,
      scaleX: 0.95,
      scaleY: 0.95,
      duration,
      ease: 'Sine.easeInOut',
      signal
    });
  }

  async _playHealEffect(target, mood, sprites, duration, signal) {
    if (signal?.aborted) return;
    const sprite = sprites.target;
    if (!sprite) return;

    // 힐 파티클
    if (this.particles) {
      await this.particles.playHealEffectAsync(sprite.x, sprite.y, mood);
    }

    // 타겟 스케일 업
    return this._tweenAsync({
      targets: sprite,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: duration / 2,
      yoyo: true,
      ease: 'Sine.easeInOut',
      signal
    });
  }

  async _playCutIn(attacker, duration, signal) {
    if (!this.scene || signal?.aborted) return;

    // 오버레이
    const overlay = this.scene.add.rectangle(
      this.scene.cameras.main.width / 2,
      this.scene.cameras.main.height / 2,
      this.scene.cameras.main.width,
      this.scene.cameras.main.height,
      0x000000, 0
    ).setDepth(9998).setScrollFactor(0);

    await this._tweenAsync({
      targets: overlay,
      alpha: 0.8,
      duration: duration * 0.3,
      signal
    });

    if (signal?.aborted) {
      overlay.destroy();
      return;
    }

    // 텍스트 슬라이드 (이름 + "궁극기 발동!")
    const battleText = this.scene.add.text(
      -200, this.scene.cameras.main.height / 2,
      `${attacker.name} - 궁극기 발동!`,
      {
        fontFamily: 'Arial',
        fontSize: '32px',
        color: '#FFD700',
        stroke: '#000000',
        strokeThickness: 3
      }
    ).setOrigin(0.5).setDepth(9999).setScrollFactor(0);

    await this._tweenAsync({
      targets: battleText,
      x: this.scene.cameras.main.width / 2,
      duration: duration * 0.4,
      ease: 'Power2.easeOut',
      signal
    });

    if (signal?.aborted) {
      overlay.destroy();
      battleText.destroy();
      return;
    }

    // 페이드 아웃
    await this._tweenAsync({
      targets: [overlay, battleText],
      alpha: 0,
      duration: duration * 0.3,
      delay: duration * 0.1,
      signal
    });

    overlay.destroy();
    battleText.destroy();
  }

  // ========== 유틸리티 ==========

  /**
   * Tween을 Promise로 래핑
   */
  _tweenAsync(config) {
    if (!this.scene) return Promise.resolve();

    return new Promise((resolve, reject) => {
      this.scene.tweens.add({
        ...config,
        onComplete: (...args) => {
          config.onComplete?.(...args);
          resolve();
        },
        onStop: () => {
          config.onStop?.();
          reject(new Error('Tween stopped'));
        }
      });
    });
  }

  /**
   * delayedCall을 Promise로 래핑
   */
  _delay(ms) {
    if (!this.scene) return Promise.resolve();
    return new Promise(resolve => {
      this.scene.time.delayedCall(ms, resolve);
    });
  }

  /**
   * 성능 체크 및 품질 조절
   */
  _checkPerformance() {
    const now = Date.now();
    if (now - this.lastFpsCheck < 5000) return;  // 5초마다 체크

    this.lastFpsCheck = now;
    const fps = this.scene?.game?.loop?.actualFps || 60;

    if (fps < PERFORMANCE_LIMITS.autoQualityThreshold) {
      this.qualityLevel = 'low';
      console.warn('[SkillAnimator] Low FPS detected, reducing quality');
    } else if (fps < 45) {
      this.qualityLevel = 'medium';
    } else {
      this.qualityLevel = 'high';
    }
  }

  /**
   * 안전한 shutdown
   */
  abort() {
    this.abortController?.abort();
    this.isAnimating = false;
  }

  /**
   * 리소스 정리
   */
  destroy() {
    this.abort();
    this.scene = null;
    this.particles = null;
  }
}
```

**인수:** C1, C2 (import로 활용)  
**산출물:** SkillAnimationManager 클래스 (460줄)  
**테스트:**
- playNormalSkill() Promise 해석 확인
- playUltimateSkill() cutIn → impact → recovery 시퀀스
- playHealAnimation() 힐 파티클 + 스케일 애니메이션
- 배속 적용 (duration × speedMul)
- AbortController 신호 전파

---

#### **C4: BattleScene.js 통합 (핵심, 고위험)**

**수정 대상:**
1. `create()` — SkillAnimationManager 초기화
2. `processTurn()` → `processTurnV2()` (새 비동기 메서드, 기존은 보존)
3. `executeBattlerAction()` → `executeBattlerActionAsync()` (새 메서드)
4. `shutdown()` — 정리 추가
5. Feature Flag 추가

```javascript
// src/scenes/BattleScene.js에 추가/수정

import { SkillAnimationManager } from '../systems/SkillAnimationManager.js';

export class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
    // ... 기존 ...
    this.useNewAnimations = true;  // Feature Flag
  }

  create() {
    // ... 기존 ParticleManager 초기화 ...
    this.particles = new ParticleManager(this);
    
    // 새 SkillAnimationManager 초기화
    this.skillAnimator = new SkillAnimationManager(this, this.particles);
    
    // ... 나머지 create() ...
  }

  /**
   * processTurn() → processTurnV2() (새 비동기 버전)
   * 기존 processTurn은 processTurnLegacy로 rename (폴백)
   */
  async processTurn() {
    if (this.useNewAnimations) {
      return this.processTurnV2();
    } else {
      return this.processTurnLegacy();
    }
  }

  /**
   * 새 비동기 턴 진행
   */
  async processTurnV2() {
    if (this.battleEnded || this.isProcessingTurn) return;

    console.log(`[Battle] Processing turn ${this.turn + 1} (V2 async)`);
    this.isProcessingTurn = true;
    this.turn++;
    this.turnText.setText(`Turn ${this.turn}`);
    this.updateTurnOrderBar();

    const activeBattlers = this.allBattlers.filter(b => b.isAlive);
    activeBattlers.sort((a, b) => (b.stats?.spd || 0) - (a.stats?.spd || 0));

    this.emitBattleEvent('turnStart', { turn: this.turn });

    // 순차 실행: 각 배틀러 액션을 await (이전 배틀러 완료 후 다음 배틀러)
    for (const battler of activeBattlers) {
      if (this.battleEnded || !battler.isAlive) continue;

      console.log(`[Battle] ${battler.name} acting...`);
      await this.executeBattlerActionAsync(battler);

      if (this.checkBattleEnd()) {
        this.isProcessingTurn = false;
        return;
      }
    }

    this.isProcessingTurn = false;
    this.emitBattleEvent('turnEnd', { turn: this.turn });

    // 자동 모드: 턴간 대기 후 다음 턴
    if (this.autoBattle) {
      await this._delay(200 / this.battleSpeed);
      this.processTurn();
    } else {
      // 수동 모드: 다음 턴 버튼 대기
      console.log('[Battle] Waiting for manual input');
      this.waitingForManualInput = true;
    }
  }

  /**
   * 배틀러 액션 실행 (비동기)
   */
  async executeBattlerActionAsync(battler) {
    if (!battler.isAlive || this.battleEnded) return;

    // AI 결정 로직 (동기)
    const targets = battler.isAlly ? this.enemies : this.allies;
    const aliveTargets = targets.filter(t => t.isAlive);
    if (aliveTargets.length === 0) return;

    const basicSkill = battler.skills?.find(s => s.id === 'basic') || battler.skills?.[0];
    const skill1 = battler.skills?.find(s => s.id === 'skill1') || battler.skills?.[1];
    const skill2 = battler.skills?.find(s => s.id === 'skill2') || battler.skills?.[2];

    let chosenSkill = basicSkill;
    let isUltimate = false;
    let target = this.selectSmartTarget(battler, aliveTargets);

    // 힐러 우선 로직
    if ((battler.role === 'healer' || battler.class === 'healer') && battler.isAlly) {
      const lowestHp = this.allies
        .filter(a => a.isAlive)
        .reduce((min, a) => (a.currentHp / a.maxHp < min.currentHp / min.maxHp) ? a : min);

      if (lowestHp.currentHp / lowestHp.maxHp < 0.5) {
        const healSkill = battler.skills?.find(s =>
          s.isHeal || s.target === 'ally' || s.target === 'all_allies' ||
          s.name?.includes('힐') || s.name?.includes('치유')
        );
        if (healSkill && battler.skillGauge >= (healSkill.gaugeCost || battler.maxSkillGauge)) {
          // 힐 애니메이션 실행
          await this.skillAnimator.playHealAnimation(
            battler, lowestHp, healSkill,
            { attacker: this._getSprite(battler), target: this._getSprite(lowestHp) },
            {
              onImpact: () => {
                const healAmount = Math.max(1, Math.floor((battler.stats?.atk || 100) * healSkill.multiplier));
                lowestHp.currentHp = Math.min(lowestHp.maxHp, lowestHp.currentHp + healAmount);
                this.updateBattlerUI(lowestHp);
                this.showHealNumber(lowestHp, healAmount);
                this.addBattleLog(`${battler.name}의 ${healSkill.name}! ${lowestHp.name} HP +${healAmount}`);
              }
            }
          );
          battler.skillGauge = 0;
          this.updateSkillCardUI(battler);
          this.updateTurnOrderBar();
          return;
        }
      }
    }

    // 스킬 선택 로직
    if (skill2 && battler.skillGauge >= (skill2.gaugeCost || 150)) {
      chosenSkill = skill2;
      isUltimate = true;
    } else if (skill1 && battler.skillGauge >= (skill1.gaugeCost || battler.maxSkillGauge)) {
      chosenSkill = skill1;
      isUltimate = true;
    }

    // AoE 처리
    if (isUltimate && chosenSkill.target === 'all') {
      const targetList = battler.isAlly ? this.enemies : this.allies;
      const aliveTargetList = targetList.filter(t => t.isAlive);

      for (const t of aliveTargetList) {
        if (this.battleEnded) break;

        await this.skillAnimator.playUltimateSkill(
          battler, t, chosenSkill,
          { attacker: this._getSprite(battler), target: this._getSprite(t) },
          {
            onImpact: () => {
              this._applyDamageOrHeal(battler, t, chosenSkill, true);
            }
          }
        );
      }

      battler.skillGauge = 0;
      this.updateSkillCardUI(battler);
      this.addBattleLog(`${battler.name}의 ${chosenSkill.name}! 전체 공격!`);
      return;
    }

    // 단일 대상 공격
    if (!target.isAlive) return;

    if (isUltimate) {
      await this.skillAnimator.playUltimateSkill(
        battler, target, chosenSkill,
        { attacker: this._getSprite(battler), target: this._getSprite(target) },
        {
          onImpact: () => {
            this._applyDamageOrHeal(battler, target, chosenSkill, true);
          }
        }
      );
    } else {
      await this.skillAnimator.playNormalSkill(
        battler, target, chosenSkill,
        { attacker: this._getSprite(battler), target: this._getSprite(target) },
        {
          onImpact: () => {
            this._applyDamageOrHeal(battler, target, chosenSkill, false);
          }
        }
      );
    }

    // 게이지 처리
    if (isUltimate) {
      battler.skillGauge = 0;
    } else {
      battler.skillGauge = Math.min(
        battler.maxSkillGauge,
        battler.skillGauge + (chosenSkill.gaugeGain || 20)
      );
    }

    this.updateSkillCardUI(battler);
    this.updateTurnOrderBar();
  }

  /**
   * 데미지/회복 적용 (onImpact 콜백에서 호출)
   */
  _applyDamageOrHeal(attacker, target, skill, isUltimate) {
    if (!target.isAlive || this.battleEnded) return;

    const isHeal = skill.isHeal || skill.target === 'ally' || skill.target === 'all_allies' ||
      skill.name?.includes('힐') || skill.name?.includes('치유');

    if (isHeal) {
      // 회복
      const healAmount = Math.max(1, Math.floor((attacker.stats?.atk || 100) * skill.multiplier));
      target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
      this.updateBattlerUI(target);
    } else {
      // 데미지
      const baseDamage = attacker.stats?.atk || 100;
      const defense = target.stats?.def || 50;
      const moodResult = this.getMoodMatchup(attacker.mood, target.mood);
      const isCrit = Math.random() < (attacker.critRate || 0.1);
      const critMultiplier = isCrit ? (attacker.critDmg || 1.5) : 1.0;

      const damage = Math.max(1, Math.floor(
        baseDamage * skill.multiplier * critMultiplier * moodResult.multiplier *
        (1 - defense / (defense + 200)) * (0.9 + Math.random() * 0.2)
      ));

      target.currentHp = Math.max(0, target.currentHp - damage);

      this.updateBattlerUI(target);
      this.showDamage(target, damage, isCrit, moodResult.advantage);

      // 로그
      const critText = isCrit ? ' (크리티컬!)' : '';
      const moodText = moodResult.advantage === 'ADVANTAGE' ? ' (유리▲)' : 
                       moodResult.advantage === 'DISADVANTAGE' ? ' (불리▼)' : '';
      this.addBattleLog(`${attacker.name}의 ${skill.name}! ${target.name}에게 ${damage} 데미지${critText}${moodText}`);

      // 사망 처리
      if (target.currentHp <= 0) {
        target.isAlive = false;
        this.playDeathAnimation(target);
        this.addBattleLog(`${target.name} 쓰러짐!`);
        this.emitBattleEvent('unitDeath', { unit: target.name, killedBy: attacker.name });
      }
    }
  }

  /**
   * 기존 processTurn 보존 (레거시 폴백)
   */
  processTurnLegacy() {
    // ... 기존 processTurn 코드 복사 ...
  }

  /**
   * Delay 유틸리티
   */
  _delay(ms) {
    return new Promise(resolve => {
      this.time.delayedCall(ms, resolve);
    });
  }

  /**
   * 스프라이트 가져오기 헬퍼
   */
  _getSprite(battler) {
    const sprites = battler.isAlly ? this.allySprites : this.enemySprites;
    return sprites[battler.position];
  }

  // ... 기존 메서드들은 유지 ...

  shutdown() {
    // 새 애니메이션 시스템 정리
    if (this.skillAnimator) {
      this.skillAnimator.destroy();
      this.skillAnimator = null;
    }

    // 기존 정리 로직
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.battleEventListeners = [];
    this.targetSelectionMode = false;
    this.selectedSkillCard = null;
    if (this.input) {
      this.input.removeAllListeners();
    }
  }
}
```

**인수:** C1, C2, C3 완료 필수  
**산출물:** BattleScene 수정 (~80줄 변경)  
**테스트:** 전체 전투 플로우 검증 필수

---

## 2. 리스크 분석

| # | 리스크 | 심각도 | 확률 | 영향 | 완화 전략 |
|---|--------|--------|------|------|-----------|
| **R1** | processTurnV2 비동기 전환 시 기존 흐름 파손 | **HIGH** | 높음 | 전투 전체 불능 | Feature Flag (`useNewAnimations`) 추가, 기존 processTurn 레거시로 보존, 롤백 가능 |
| **R2** | 모바일 30fps 미달 (파티클 과다) | **HIGH** | 중간 | UX 저하, 끊김 | PERFORMANCE_LIMITS 적용, FPS 자동 감지, 품질 조절 (`qualityLevel`) |
| **R3** | 파티클 풀 고갈 (AoE 궁극기) | **MEDIUM** | 중간 | 파티클 누락, 깜빡임 | AoE 시 파티클 수 50% 감소, 풀 상태 모니터링 (`getPoolStats`) |
| **R4** | Tween 중첩으로 인한 위치 오류 | **MEDIUM** | 낮음 | 스프라이트 원위치 실패 | _playRecovery에서 절대좌표 복원, tweens.killTweensOf() 선행 |
| **R5** | async/await와 Phaser Scene 라이프사이클 충돌 | **HIGH** | 중간 | Promise 잔류, 씬 전환 에러 | AbortController 패턴, shutdown()에서 abort() 호출, signal.aborted 체크 |
| **R6** | 배속(1x/2x/3x) 적용 누락 | **LOW** | 높음 | 사용자 기대 불일치 | speedMul = 1 / (this.scene.battleSpeed), 모든 duration에 적용 |
| **R7** | 궁극기 컷인(800ms) + 파티클(1200ms) 초과 | **MEDIUM** | 낮음 | 타이밍 비트 깨짐 | ULTIMATE_CUTSCENE.totalDuration = 600ms (타이트), 파티클과 오버랩 허용 |
| **R8** | 수동 모드(AUTO OFF) 스킬 카드 중복 클릭 | **MEDIUM** | 중간 | 중복 발동, 게이지 이중 소비 | `this.skillAnimator.isAnimating` 체크, 카드 클릭 차단 |
| **R9** | Promise 거부 미처리 | **LOW** | 낮음 | 콘솔 에러 | try-catch-finally, 또는 .catch() 핸들러 추가 |

### 2.1 상세 리스크 대응

#### R1 (HIGH): processTurnV2 비동기 전환

**시나리오:** `processTurnV2()`에서 배틀러 반복 중 에러 발생 → 나머지 배틀러 스킵 → 턴 종료

**완화:**
```javascript
// Feature Flag로 즉시 롤백 가능
if (this.useNewAnimations) {
  this.processTurnV2();
} else {
  this.processTurnLegacy();
}

// 또는 catch 핸들러 추가
try {
  await this.executeBattlerActionAsync(battler);
} catch (e) {
  console.error(`[Battle] Action error for ${battler.name}:`, e);
  // 계속 진행 (건너뛰기 가능하도록)
}
```

#### R2 (HIGH): 모바일 30fps 미달

**시나리오:** 파티클 50개 + Tween 20개 동시 → fps 20 → 끊김

**완매:**
```javascript
// SkillAnimationManager._checkPerformance()에서
if (fps < 25) {
  this.qualityLevel = 'low';
  // 파티클 수 30으로 제한, 이펙트 약화
}

// ParticleManager.playMoodEffect()에서
const count = this.qualityLevel === 'high' ? 12 : (this.qualityLevel === 'medium' ? 8 : 4);
```

#### R5 (HIGH): Scene 라이프사이클 충돌

**시나리오:** processTurnV2() 중 씬 전환 → Promise 대기 상태 → this.scene null → 에러

**완화:**
```javascript
// AbortController 사용
async playNormalSkill(...) {
  this.abortController = new AbortController();
  const signal = this.abortController.signal;
  
  try {
    await this._playWindup(attacker, sprites, timing, signal);
    if (signal.aborted) return;  // 조기 종료 체크
    ...
  } finally {
    this.isAnimating = false;
  }
}

// BattleScene.shutdown()에서
shutdown() {
  if (this.skillAnimator) {
    this.skillAnimator.abort();  // Signal abort
    this.skillAnimator.destroy();
  }
  ...
}
```

---

## 3. 롤백 전략

### 3.1 커밋별 롤백 방법

| 커밋 | 내용 | 롤백 명령 | 영향 범위 | 복잡도 |
|------|------|-----------|-----------|--------|
| **C1** | `skillAnimationConfig.js` 생성 | `git rm src/config/skillAnimationConfig.js` | 없음 (import 안 함) | **TRIVIAL** |
| **C2** | `ParticleManager.js` 메서드 추가 | `git revert C2` | 없음 (기존 메서드 미변경) | **TRIVIAL** |
| **C3** | `SkillAnimationManager.js` 생성 | `git rm src/systems/SkillAnimationManager.js` | 없음 (C4 전까지 미참조) | **TRIVIAL** |
| **C4** | `BattleScene.js` 통합 | `git revert C4` 또는 `useNewAnimations = false` | **전체 전투 씬** | **CRITICAL** |

### 3.2 단계별 롤백 프로세스

**상황 1: C1~C3 검증 후 문제 발견**
```bash
git log --oneline | head -4
# c4hash BattleScene integration (C4)
# c3hash SkillAnimationManager (C3)
# c2hash ParticleManager extension (C2)
# c1hash skillAnimationConfig (C1)

# 각각 revert (역순)
git revert c4hash --no-edit
git revert c3hash --no-edit
git revert c2hash --no-edit
git revert c1hash --no-edit
```

**상황 2: C4 런타임 에러 → Feature Flag로 즉시 롤백**
```javascript
// BattleScene.create()에서
this.useNewAnimations = false;  // 기존 로직 사용
```

**상황 3: 부분 롤백 (예: C4만 롤백, C1~C3 유지)**
```bash
git revert c4hash --no-edit
# C1~C3은 그대로 유지 (향후 리팩토링 기반으로 활용 가능)
```

### 3.3 Feature Flag 구현

```javascript
// BattleScene.constructor()
constructor() {
  super({ key: 'BattleScene' });
  // ...
  this.useNewAnimations = true;  // or read from config
}

// BattleScene.create()
create() {
  // ...
  if (!this.useNewAnimations) {
    this.particles = new ParticleManager(this);
    // SkillAnimationManager 초기화 스킵
  } else {
    this.particles = new ParticleManager(this);
    this.skillAnimator = new SkillAnimationManager(this, this.particles);
  }
  // ...
}

// processTurn()
processTurn() {
  if (this.useNewAnimations) {
    return this.processTurnV2();
  } else {
    return this.processTurnLegacy();
  }
}
```

---

## 4. 검증 계획

### 4.1 단위 검증 (Unit Tests)

| # | 검증 항목 | 방법 | 성공 기준 | 도구 |
|---|-----------|------|-----------|------|
| **V1** | 일반 공격 애니메이션 완료 | `playNormalSkill()` 호출 후 Promise resolve | ≤400ms 내 resolve | Mocha + async test |
| **V2** | skill1 타이밍 정확성 | SKILL_TIMINGS.skill1 = 800ms → 실제 duration 측정 | ±10ms 오차 | Performance.mark() |
| **V3** | skill2 궁극기 시퀀스 | cutIn → windup → impact → recovery 순서 | 순서 맞음, ≤2000ms | 콘솔 로그 + 타이밍 |
| **V4** | 힐 애니메이션 완료 | `playHealAnimation()` Promise | ≤600ms 내 resolve | async test |
| **V5** | 파티클 풀 상태 | `particles.getPoolStats()` | active ≤ 50, 누수 없음 | 메모리 모니터링 |
| **V6** | AbortController 동작 | abort() → signal.aborted 전파 | Promise 즉시 반환 | Jest mock |
| **V7** | 배속 2x 적용 | SKILL_TIMINGS.basic = 400ms, 2x 시 200ms | duration ≤ 220ms | Performance API |
| **V8** | 배속 3x 적용 | SKILL_TIMINGS.basic = 400ms, 3x 시 133ms | duration ≤ 150ms | Performance API |

### 4.2 통합 검증 (Integration Tests)

| # | 검증 항목 | 방법 | 성공 기준 | 테스트 환경 |
|---|-----------|------|-----------|-------------|
| **I1** | 30턴 자동 전투 | AUTO ON, 1x 속도, 3x 속도 연속 | 에러 없이 승리/패배 | Chrome DevTools |
| **I2** | 씬 전환 안정성 | 전투 중 퇴각 → 승리 → 패배 | Promise 잔류 에러 없음 | Chrome Console |
| **I3** | 메모리 누수 검사 | 전투 10회 반복, 힙 스냅샷 | 증가율 <10% | Chrome DevTools Memory |
| **I4** | Feature Flag 롤백 | `useNewAnimations = false` 전환 | 기존 전투 정상 작동 | 수동 테스트 |
| **I5** | 수동 모드 호환 | AUTO OFF, 스킬 카드 클릭 | 애니메이션 중 클릭 무시 | 게임플레이 |
| **I6** | AoE 스킬 3적 동시 | skill2 with target='all' | 파티클 누락 없음, ≤2500ms | 시각적 검증 |
| **I7** | 데미지 숫자 동기화 | impact 시점과 showDamage 비교 | 동시에 표시됨 | 슬로우모션 재생 |

### 4.3 성능 검증 (Performance Benchmarks)

| # | 검증 항목 | 방법 | 목표 | 측정 방법 |
|---|-----------|------|------|-----------|
| **P1** | 모바일 FPS (기본) | Nexus 5 에뮬 저사양, 기본공격 연속 | ≥30fps | Lighthouse |
| **P2** | 모바일 FPS (극한) | 3x 속도, 파티클 최대, AoE | ≥25fps (허용) | Lighthouse |
| **P3** | CPU 사용률 | 30턴 전투 동안 cpu profile | <60% 평균 | DevTools Performance |
| **P4** | 메모리 peak | 한 번의 궁극기 발동 | <20MB 증가 | Memory Profiler |

### 4.4 분위기별 VFX 검증 (Visual Inspection)

| 분위기 | 기본 hit | skill1 | skill2 + 컷인 | 힐 |
|--------|---------|--------|-----------------|-----|
| **brave** | 불꽃 파편 | 화염 폭발 + 충격파 | 불기둥 컷인 + 폭발 | - |
| **fierce** | 주황 파편 | 마그마 파동 | 충격파 컷인 + 파동 | - |
| **wild** | 초록 파편 | 바람 베기 + 회오리 | 토네이도 컷인 + 회오리 | - |
| **calm** | 파란 파편 | 물결 확산 | 해일 컷인 + 파도 | 물방울 + 반짝임 |
| **stoic** | 회색 파편 | 돌 충격 + 진동 | 지진 컷인 + 진동 | - |
| **devoted** | 분홍 파편 | 빛줄기 + 광휘 | 광휘 컷인 + 빛 | 빛줄기 + 반짝임 |
| **cunning** | 보라 파편 | 얼음 창 + 냉기 | 빙결 컷인 + 눈 | - |
| **noble** | 금색 파편 | 금빛 참격 + 섬광 | 섬광 컷인 + 폭발 | 금빛 빛 |
| **mystic** | 주황 파편 | 별빛 탄환 + 코메트 | 신성 폭발 컷인 + 별 | 별 힐 |

---

## 5. BattleSystem 이벤트 통합 설계

### 5.1 현재 상태

BattleScene은 BattleSystem의 `BattleEventEmitter`를 사용하지 않고, 자체 `emitBattleEvent()` 메서드를 운영 중이다.

**결론:** 현재 계획에서는 BattleSystem 통합이 필수가 아니다. SkillAnimationManager는 BattleScene 자체 이벤트 시스템과 연동한다.

### 5.2 이벤트 흐름 (통합 후)

```
BattleScene.processTurnV2()
  │
  ├─ for each battler:
  │    │
  │    ├─ AI 결정 (동기)
  │    │
  │    ├─ await skillAnimator.playXxxSkill()  ◄── 새 비동기 진입점
  │    │    │
  │    │    ├─ _playWindup()
  │    │    ├─ onImpact 콜백 ───────────────┐
  │    │    │  (데미지 계산+적용)           │
  │    │    ├─ _playImpact()                │
  │    │    └─ _playRecovery()              │
  │    │                                    │
  │    ├─ updateBattlerUI()                 │
  │    ├─ emitBattleEvent('damage'/'heal') │◄── Impact 직후
  │    ├─ updateTurnOrderBar()              │
  │    └─ checkBattleEnd()                  │
  │                                         │
  └─ emitBattleEvent('turnEnd')  ◄─────────┘
```

### 5.3 onImpact 콜백 메커니즘

```javascript
await this.skillAnimator.playNormalSkill(
  attacker, target, skill, sprites,
  {
    onImpact: () => {
      // Impact 시점 (타겟이 히트를 받는 순간)
      // 데미지 계산 + UI 업데이트 + 로그
      this._applyDamageOrHeal(attacker, target, skill, false);
    }
  }
);
```

**장점:**
- ParticleManager와 데미지 표시가 동기화됨
- 파티클 effect 타이밍과 데미지 시각적으로 일치
- 유연한 콜백 구조 (향후 확장 가능)

---

## 6. 파일별 변경 요약

### 6.1 신규 파일

| 파일 경로 | 줄수 | 내용 | 생성 순서 |
|-----------|------|------|---------|
| `src/config/skillAnimationConfig.js` | ~250 | SKILL_TIMINGS, MOOD_VFX_MAP, ULTIMATE_CUTSCENE, PERFORMANCE_LIMITS, DEBUG_FLAGS | C1 |
| `src/systems/SkillAnimationManager.js` | ~450 | SkillAnimationManager 클래스 (Phase 오케스트레이션) | C3 |

### 6.2 수정 파일

| 파일 경로 | 변경 타입 | 변경량 | 내용 | 생성 순서 |
|-----------|----------|--------|------|---------|
| `src/systems/ParticleManager.js` | 메서드 추가 | +~120줄 | playMoodEffectAsync, playMoodSkillPattern, playMoodUltimatePattern, playHealEffectAsync, getPoolStats | C2 |
| `src/scenes/BattleScene.js` | 메서드 추가 + 수정 | ~80줄 | processTurnV2 추가, executeBattlerActionAsync 추가, create/shutdown 수정, Feature Flag 추가 | C4 |

### 6.3 미변경 파일

| 파일 | 이유 |
|------|------|
| `src/systems/BattleSystem.js` | BattleScene이 사용 안 함 |
| `src/config/particleConfig.js` | 기존 설정 충분 |
| `src/systems/EventBus.js` | BattleScene 자체 이벤트 시스템 사용 |

---

## 7. 주의사항 및 제약

### 7.1 필수 사항

1. **배속 반영 필수**: 모든 duration에 `speedMul = 1 / this.scene.battleSpeed` 적용
   ```javascript
   const duration = timing.phases.impact * speedMul;
   ```

2. **Promise 안전성**: async 메서드 내 this.scene null 체크
   ```javascript
   if (!this.scene) return Promise.resolve();
   ```

3. **Scene 정리**: shutdown()에서 SkillAnimationManager.destroy() 호출
   ```javascript
   if (this.skillAnimator) {
     this.skillAnimator.destroy();
   }
   ```

4. **AoE 순차 처리**: 적 3체 동시 공격 시 100ms 간격으로 시차 (풀 고갈 방지)

5. **기존 메서드 보존**: playSkillEffect() 등 기존 메서드는 유지 (Feature Flag 폴백)

### 7.2 ES Module 규칙

- `type: "module"` 프로젝트: `import`/`export` only
- `require()` 금지
- 상대 경로 import: `'../systems/ParticleManager.js'` (확장자 명시)

### 7.3 Phaser 특이사항

- Tween 완료 후 자동 정리 (재수동 destroy 불필요)
- delayedCall은 Scene 전환 시 자동 정리
- AbortController.abort() 호출 후 Promise 거부 → catch 필수

---

## 8. 예상 일정 및 리소스

| 단계 | 작업 | 예상 시간 | 담당자 | 필수 검증 |
|------|------|----------|--------|----------|
| **C1** | skillAnimationConfig.js | 1-2시간 | 아키텍트 | 형식 검증 |
| **C2** | ParticleManager 확장 | 2-3시간 | 실행자 | 단위 테스트 |
| **C3** | SkillAnimationManager 구현 | 4-6시간 | 실행자 | 통합 테스트 |
| **C4** | BattleScene 통합 | 3-5시간 | 실행자 | 전체 전투 테스트 |
| **검증** | 단위 + 통합 + 성능 | 4-8시간 | QA | 4.1~4.4 완료 |
| **롤백 준비** | Feature Flag 검증 | 1시간 | 실행자 | Feature Flag 동작 |
| **총합** | - | **15-25시간** | - | - |

---

## 9. 성공 기준

### 9.1 기능 완성도

- [x] SkillAnimationManager 클래스 구현 (450줄 이상)
- [x] Phase 기반 시퀀싱 (Windup → Impact → Recovery)
- [x] Promise 기반 완료 추적
- [x] 배속 1x/2x/3x 적용
- [x] AoE 스킬 순차 처리
- [x] AbortController 안전 종료
- [x] Feature Flag 롤백 메커니즘

### 9.2 성능 목표

- [x] 일반 공격: ≤400ms
- [x] skill1: ≤800ms
- [x] skill2 + 컷인: ≤2000ms
- [x] 힐: ≤600ms
- [x] 모바일 FPS: ≥30fps (기본), ≥25fps (극한)
- [x] 메모리 누수: <10% per 10회 전투

### 9.3 안정성

- [x] Scene 전환 중 Promise 에러 없음
- [x] Feature Flag 롤백 즉시 작동
- [x] 수동 모드(AUTO OFF) 호환성
- [x] 30턴 자동 전투 안정성

---

## 10. 참고 자료

- **관련 파일**: BattleSystem.js, BattleScene.js, ParticleManager.js, TransitionManager.js
- **기존 기술**: Phaser Tween, Promise, AbortController, Object Pool
- **학습 자료**: SKILL_TIMINGS, MOOD_PARTICLE_COLORS (설정)

---

**문서 버전:** 1.0  
**최종 작성:** 2026-02-08  
**상태:** APPROVED FOR IMPLEMENTATION
