/**
 * SkillAnimationManager.js
 * VFX-2.1: Skill Animation System
 *
 * Phase-based skill animation orchestration:
 * 1. WINDUP: Preparation/charge-up phase
 * 2. IMPACT: Main effect + damage calculation
 * 3. RECOVERY: Return to idle state
 *
 * Features:
 * - Promise-based async animation sequences
 * - Abort capability for animation cancellation
 * - Mood-based VFX integration
 * - Screen shake and particle effects
 * - Timing customization per action type
 */

import {
  ANIMATION_PHASES,
  BASE_TIMINGS,
  MOOD_VFX,
  SCREEN_SHAKE,
  FEATURE_FLAGS
} from '../config/skillAnimationConfig.js';
import ParticleManager from './ParticleManager.js';

/**
 * MOOD_VFX에 없는 분위기의 대체 프리셋.
 * 기본영웅은 mood가 null이라 유닛 생성 시 'neutral'이 되는데 MOOD_VFX에는 그 키가 없다.
 * 예전에는 `attacker.mood || 'brave'`가 null을 걸러 줬지만 'neutral'은 truthy라 통과한다.
 * 조회 실패를 그대로 두면 `vfx.trail`에서 TypeError가 나 windup 프로미스가 거부되고,
 * playAnimation의 catch가 이를 삼키면서 onImpact(피해 판정)가 아예 실행되지 않는다.
 */
const FALLBACK_MOOD_VFX = Object.freeze({
  color: 0xB0BEC5,
  particle: 'basic_hit',
  trail: false,
  description: 'Neutral fallback — 분위기 정보가 없는 유닛'
});

/**
 * 분위기 VFX 프리셋 조회 (없으면 중립 프리셋)
 * @param {string} mood
 * @returns {object}
 */
export function resolveMoodVfx(mood) {
  return MOOD_VFX[mood] || FALLBACK_MOOD_VFX;
}

/**
 * 이 분위기에 전용 연출 자산이 있는지.
 * MOOD_VFX의 분위기 키는 파티클 프리셋·상성표의 9종과 같은 집합이다.
 * 'neutral'처럼 프리셋이 없는 값을 그대로 넘기면 ParticleManager가 매 타격마다
 * "Unknown mood" 경고를 찍고, MoodSystem은 예외를 던진다. 호출 전에 걸러 낸다.
 * @param {string} mood
 * @returns {boolean}
 */
export function hasMoodPreset(mood) {
  return !!MOOD_VFX[mood];
}

class SkillAnimationManager {
  constructor() {
    this.currentAnimation = null;
    this.abortController = null;
  }

  /**
   * Play full skill animation sequence
   *
   * @param {Phaser.Scene} scene - Scene context
   * @param {object} attacker - Attacker data { sprite, x, y, mood }
   * @param {object[]} targets - Target data array [{ sprite, x, y }]
   * @param {string} actionType - Action type: 'basic_attack' | 'skill1' | 'skill2' | 'ultimate' | 'heal'
   * @param {object} options - Options { onImpact: Function }
   * @returns {Promise<void>}
   */
  async playAnimation(scene, attacker, targets, actionType, options = {}) {
    // 피해 판정(onImpact)은 연출 성공 여부와 무관하게 정확히 한 번 실행되어야 한다.
    // 연출 예외가 판정을 삼키면 그 턴은 아무 일도 일어나지 않고 전투가 제자리를 돈다.
    let impactRan = false;
    const runImpact = async () => {
      if (impactRan || !options.onImpact) return;
      impactRan = true;
      await options.onImpact();
    };

    // Check feature flag for rollback capability
    if (!FEATURE_FLAGS.useNewAnimations) {
      // Fallback: immediate execution without animations
      await runImpact();
      return;
    }

    // Create abort controller for cancellation support.
    // 이 매니저는 싱글턴이라 광역 스킬이나 겹치는 턴에서 호출이 중첩된다. 늦게 시작한 호출이
    // this.abortController를 갈아끼우고 먼저 끝난 호출이 finally에서 null로 지우면,
    // 남은 호출이 this.abortController.signal을 읽다 터진다. 자기 컨트롤러를 지역에 붙잡는다.
    const abortController = new AbortController();
    this.abortController = abortController;
    this.currentAnimation = { scene, attacker, targets, actionType };

    // Get timing configuration for action type
    const timings = BASE_TIMINGS[actionType] || BASE_TIMINGS.basic_attack;
    const mood = attacker.mood || 'brave';
    const vfx = resolveMoodVfx(mood);

    let aborted = false;

    try {
      // ==========================================
      // PHASE 1: WINDUP
      // ==========================================
      await this._playWindup(scene, attacker, timings.windup, vfx);

      // Check if animation was aborted
      if (abortController.signal.aborted) {
        console.log('[SkillAnimationManager] Animation aborted during windup');
        aborted = true;
        return;
      }

      // ==========================================
      // PHASE 2: IMPACT
      // ==========================================
      // Start impact visuals
      const impactPromise = this._playImpact(
        scene,
        attacker,
        targets,
        timings.impact,
        vfx,
        actionType
      );

      // Execute damage calculation callback during impact phase
      // This ensures damage numbers appear at the right moment
      await runImpact();

      // Wait for impact visuals to complete
      await impactPromise;

      // Check if animation was aborted
      if (abortController.signal.aborted) {
        console.log('[SkillAnimationManager] Animation aborted during impact');
        aborted = true;
        return;
      }

      // ==========================================
      // PHASE 3: RECOVERY
      // ==========================================
      await this._playRecovery(scene, attacker, timings.recovery);

    } catch (error) {
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        console.log('[SkillAnimationManager] Animation aborted:', error.message);
        aborted = true;
      } else {
        console.warn('[SkillAnimationManager] Animation error:', error);
      }
    } finally {
      // 연출이 실패했더라도(중단이 아니라면) 판정은 반드시 치른다
      if (!aborted) {
        try {
          await runImpact();
        } catch (impactError) {
          console.warn('[SkillAnimationManager] onImpact error:', impactError);
        }
      }

      // Clean up animation state — 내 컨트롤러가 아직 현재 것일 때만 지운다
      if (this.abortController === abortController) {
        this.currentAnimation = null;
        this.abortController = null;
      }
    }
  }

  /**
   * PHASE 1: WINDUP
   * Preparation phase - attacker charges up for attack
   *
   * @param {Phaser.Scene} scene
   * @param {object} attacker
   * @param {number} duration - Windup duration in ms
   * @param {object} vfx - VFX configuration
   * @returns {Promise<void>}
   */
  async _playWindup(scene, attacker, duration, vfx) {
    return new Promise((resolve, reject) => {
      if (!attacker.sprite) {
        resolve();
        return;
      }

      // Visual: Scale up slightly (charging effect)
      scene.tweens.add({
        targets: attacker.sprite,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: duration * 0.7,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          // Check abort signal before resolving
          if (this.abortController?.signal.aborted) {
            reject(new Error('Windup aborted'));
          } else {
            resolve();
          }
        }
      });

      // Optional: Glow effect for mood-based windup
      if (FEATURE_FLAGS.enableParticles && vfx.trail) {
        const glowDuration = duration * 0.8;
        const glow = scene.add.circle(attacker.x, attacker.y, 12, vfx.color, 0.3);
        glow.setDepth(attacker.sprite.depth - 1);

        scene.tweens.add({
          targets: glow,
          scale: 1.5,
          alpha: 0,
          duration: glowDuration,
          ease: 'Quad.easeOut',
          onComplete: () => glow.destroy()
        });
      }
    });
  }

  /**
   * PHASE 2: IMPACT
   * Main effect phase - visuals and screen shake
   *
   * @param {Phaser.Scene} scene
   * @param {object} attacker
   * @param {object[]} targets
   * @param {number} duration - Impact duration in ms
   * @param {object} vfx - VFX configuration
   * @param {string} actionType
   * @returns {Promise<void>}
   */
  async _playImpact(scene, attacker, targets, duration, vfx, actionType) {
    return new Promise(async (resolve, reject) => {
      // Handle case with no targets
      if (!targets || targets.length === 0) {
        resolve();
        return;
      }

      const target = targets[0]; // Primary target
      const particleManager = scene.particleManager || new ParticleManager(scene);
      const mood = attacker.mood || 'brave';
      // 분위기 전용 파티클이 없는 유닛(기본영웅 등)은 분위기 연출을 건너뛴다 — 화면 흔들림과
      // 피격 플래시 같은 공통 연출은 그대로 나간다.
      const moodVisualsReady = hasMoodPreset(mood);

      // VFX-2.2: Play mood-specific attack particle (from attacker to target)
      if (FEATURE_FLAGS.enableParticles && moodVisualsReady && actionType !== 'heal') {
        particleManager.playMoodAttack(
          mood,
          attacker.x,
          attacker.y,
          target.x,
          target.y
        ).catch(err => console.warn('[SkillAnimationManager] Mood attack particle error:', err));
      }

      // Apply screen shake based on action power
      if (FEATURE_FLAGS.enableScreenShake) {
        if (actionType === 'ultimate') {
          particleManager.applyScreenShake(scene, SCREEN_SHAKE.heavy);
        } else if (actionType === 'skill2') {
          particleManager.applyScreenShake(scene, SCREEN_SHAKE.medium);
        } else if (actionType !== 'heal') {
          particleManager.applyScreenShake(scene, SCREEN_SHAKE.light);
        }
      }

      // Wait for attack particles to travel
      await scene.time.delayedCall(duration * 0.4, () => {});

      // VFX-2.2: Play mood-specific hit effect at target
      if (FEATURE_FLAGS.enableParticles && moodVisualsReady && actionType !== 'heal') {
        particleManager.playMoodHit(mood, target.x, target.y)
          .catch(err => console.warn('[SkillAnimationManager] Mood hit particle error:', err));
      }

      // VFX-2.3: Show type advantage effect if available
      // 양쪽 모두 상성이 성립하는 분위기일 때만 조회한다 (MoodSystem은 모르는 값에 예외를 던진다)
      if (moodVisualsReady && hasMoodPreset(target.mood) && FEATURE_FLAGS.enableParticles) {
        // Import MoodSystem to check advantage
        import('./MoodSystem.js').then(({ moodSystem }) => {
          const matchup = moodSystem.getMatchupMultiplier(attacker.mood, target.mood);
          if (matchup.advantage === 'ADVANTAGE') {
            particleManager.showAdvantageEffect('advantage', target.x, target.y - 40)
              .catch(err => console.warn('[SkillAnimationManager] Advantage effect error:', err));
          } else if (matchup.advantage === 'DISADVANTAGE') {
            particleManager.showAdvantageEffect('disadvantage', target.x, target.y - 40)
              .catch(err => console.warn('[SkillAnimationManager] Disadvantage effect error:', err));
          }
        }).catch(err => console.warn('[SkillAnimationManager] MoodSystem import error:', err));
      }

      // Target hit flash (not for healing)
      if (target.sprite && actionType !== 'heal') {
        const flashDuration = Math.min(duration * 0.5, 200);

        scene.tweens.add({
          targets: target.sprite,
          alpha: 0.3,
          duration: flashDuration / 2,
          yoyo: true,
          repeat: 1,
          ease: 'Quad.easeInOut'
        });
      }

      // Heal glow effect for healing actions
      if (actionType === 'heal' && target.sprite) {
        const healGlow = scene.add.circle(target.x, target.y, 20, 0x00FF00, 0.4);
        healGlow.setDepth(target.sprite.depth - 1);

        scene.tweens.add({
          targets: healGlow,
          scale: 1.8,
          alpha: 0,
          duration: duration,
          ease: 'Quad.easeOut',
          onComplete: () => healGlow.destroy()
        });
      }

      // Wait for impact duration to complete
      scene.time.delayedCall(duration, () => {
        if (this.abortController?.signal.aborted) {
          reject(new Error('Impact aborted'));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * PHASE 3: RECOVERY
   * Recovery phase - attacker returns to idle state
   *
   * @param {Phaser.Scene} scene
   * @param {object} attacker
   * @param {number} duration - Recovery duration in ms
   * @returns {Promise<void>}
   */
  async _playRecovery(scene, attacker, duration) {
    return new Promise((resolve, reject) => {
      if (!attacker.sprite) {
        resolve();
        return;
      }

      // Return to normal scale with slight bounce
      scene.tweens.add({
        targets: attacker.sprite,
        scaleX: 1,
        scaleY: 1,
        duration: duration,
        ease: 'Back.easeOut',
        easeParams: [1.5],
        onComplete: () => {
          if (this.abortController?.signal.aborted) {
            reject(new Error('Recovery aborted'));
          } else {
            resolve();
          }
        }
      });
    });
  }

  /**
   * Cancel current animation
   * Useful for fast-forward or scene transitions
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      console.log('[SkillAnimationManager] Animation manually aborted');
    }
  }

  /**
   * Check if animation is currently playing
   * @returns {boolean}
   */
  isPlaying() {
    return this.currentAnimation !== null;
  }

  /**
   * Get current animation info (for debugging)
   * @returns {object|null}
   */
  getCurrentAnimation() {
    return this.currentAnimation;
  }

  /**
   * Play multiple animations in sequence
   * Useful for chain attacks or combos
   *
   * @param {Phaser.Scene} scene
   * @param {Array} animationSequence - Array of animation configs
   * @returns {Promise<void>}
   */
  async playSequence(scene, animationSequence) {
    for (const animConfig of animationSequence) {
      if (this.abortController?.signal.aborted) {
        console.log('[SkillAnimationManager] Sequence aborted');
        break;
      }

      await this.playAnimation(
        scene,
        animConfig.attacker,
        animConfig.targets,
        animConfig.actionType,
        animConfig.options
      );
    }
  }
}

// Export singleton instance
export default new SkillAnimationManager();
