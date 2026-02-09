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
    // Check feature flag for rollback capability
    if (!FEATURE_FLAGS.useNewAnimations) {
      // Fallback: immediate execution without animations
      if (options.onImpact) await options.onImpact();
      return;
    }

    // Create abort controller for cancellation support
    this.abortController = new AbortController();
    this.currentAnimation = { scene, attacker, targets, actionType };

    // Get timing configuration for action type
    const timings = BASE_TIMINGS[actionType] || BASE_TIMINGS.basic_attack;
    const mood = attacker.mood || 'brave';
    const vfx = MOOD_VFX[mood];

    try {
      // ==========================================
      // PHASE 1: WINDUP
      // ==========================================
      await this._playWindup(scene, attacker, timings.windup, vfx);

      // Check if animation was aborted
      if (this.abortController.signal.aborted) {
        console.log('[SkillAnimationManager] Animation aborted during windup');
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
      if (options.onImpact) {
        await options.onImpact();
      }

      // Wait for impact visuals to complete
      await impactPromise;

      // Check if animation was aborted
      if (this.abortController.signal.aborted) {
        console.log('[SkillAnimationManager] Animation aborted during impact');
        return;
      }

      // ==========================================
      // PHASE 3: RECOVERY
      // ==========================================
      await this._playRecovery(scene, attacker, timings.recovery);

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[SkillAnimationManager] Animation aborted:', error.message);
      } else {
        console.warn('[SkillAnimationManager] Animation error:', error);
      }
    } finally {
      // Clean up animation state
      this.currentAnimation = null;
      this.abortController = null;
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

      // VFX-2.2: Play mood-specific attack particle (from attacker to target)
      if (FEATURE_FLAGS.enableParticles && actionType !== 'heal') {
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
      if (FEATURE_FLAGS.enableParticles && actionType !== 'heal') {
        particleManager.playMoodHit(mood, target.x, target.y)
          .catch(err => console.warn('[SkillAnimationManager] Mood hit particle error:', err));
      }

      // VFX-2.3: Show type advantage effect if available
      if (target.mood && attacker.mood && FEATURE_FLAGS.enableParticles) {
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
