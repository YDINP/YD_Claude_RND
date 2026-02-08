/**
 * ParticleManager.js - 파티클 이펙트 통합 관리
 * H-10: 이펙트 파티클 라이브러리
 *
 * 기능:
 * - 오브젝트 풀링 (H-10.4)
 * - 공통 프리셋 (H-10.1)
 * - 등급별 파티클 (H-10.2)
 * - 레벨업/진화 축하 (H-10.3)
 * - Mood별 이펙트 팩토리
 * - 데미지 숫자 표시
 */

import {
  MOOD_PARTICLE_COLORS,
  RARITY_PARTICLE_COLORS,
  PARTICLE_PRESETS,
  POOL_CONFIG,
  DAMAGE_NUMBER_STYLES
} from '../config/particleConfig.js';

// ============================================
// Object Pool
// ============================================
class ObjectPool {
  constructor(scene, maxSize = POOL_CONFIG.maxSize) {
    this.scene = scene;
    this.maxSize = maxSize;
    this.circles = [];
    this.texts = [];
  }

  /**
   * 풀에서 원(circle) 오브젝트를 가져오거나 새로 생성
   */
  getCircle(x, y, radius, color, alpha = 1) {
    let obj = this.circles.find(c => !c.active);
    if (obj) {
      obj.setPosition(x, y);
      obj.setRadius(radius);
      obj.setFillStyle(color, alpha);
      obj.setAlpha(alpha);
      obj.setScale(1);
      obj.setVisible(true);
      obj.setActive(true);
      return obj;
    }

    if (this.circles.length < this.maxSize) {
      obj = this.scene.add.circle(x, y, radius, color, alpha);
      obj.setActive(true);
      this.circles.push(obj);
      return obj;
    }

    // 풀 초과: 가장 오래된 것 재사용
    obj = this.circles[0];
    obj.setPosition(x, y);
    obj.setRadius(radius);
    obj.setFillStyle(color, alpha);
    obj.setAlpha(alpha);
    obj.setScale(1);
    obj.setVisible(true);
    obj.setActive(true);
    return obj;
  }

  /**
   * 풀에서 텍스트 오브젝트를 가져오거나 새로 생성
   */
  getText(x, y, text, style) {
    let obj = this.texts.find(t => !t.active);
    if (obj) {
      obj.setPosition(x, y);
      obj.setText(text);
      obj.setStyle(style);
      obj.setAlpha(1);
      obj.setScale(1);
      obj.setVisible(true);
      obj.setActive(true);
      obj.setOrigin(0.5);
      return obj;
    }

    if (this.texts.length < this.maxSize / 2) {
      obj = this.scene.add.text(x, y, text, style).setOrigin(0.5);
      obj.setActive(true);
      this.texts.push(obj);
      return obj;
    }

    obj = this.texts[0];
    obj.setPosition(x, y);
    obj.setText(text);
    obj.setStyle(style);
    obj.setAlpha(1);
    obj.setScale(1);
    obj.setVisible(true);
    obj.setActive(true);
    obj.setOrigin(0.5);
    return obj;
  }

  /**
   * 오브젝트를 풀로 반환 (비활성화)
   */
  release(obj) {
    obj.setVisible(false);
    obj.setActive(false);
  }

  /**
   * 전체 풀 정리
   */
  destroy() {
    this.circles.forEach(c => c.destroy());
    this.texts.forEach(t => t.destroy());
    this.circles = [];
    this.texts = [];
  }

  /**
   * 풀 상태 확인
   */
  getStats() {
    return {
      circles: { total: this.circles.length, active: this.circles.filter(c => c.active).length },
      texts: { total: this.texts.length, active: this.texts.filter(t => t.active).length }
    };
  }
}

// ============================================
// ParticleManager (Singleton per Scene)
// ============================================
export class ParticleManager {
  constructor(scene) {
    this.scene = scene;
    this.pool = new ObjectPool(scene);
    this.activeEffects = [];
  }

  // ============================================
  // H-10.1: 공통 파티클 프리셋 재생
  // ============================================

  /**
   * 프리셋 기반 파티클 재생
   * @param {string} presetName - PARTICLE_PRESETS 키
   * @param {number} x - 중심 X
   * @param {number} y - 중심 Y
   * @param {object} options - 오버라이드 옵션
   */
  playPreset(presetName, x, y, options = {}) {
    const preset = PARTICLE_PRESETS[presetName];
    if (!preset) {
      console.warn(`ParticleManager: Unknown preset "${presetName}"`);
      return;
    }

    const config = { ...preset, ...options };
    const colors = config.colors || [0xFFFFFF];
    const count = config.count || 8;

    for (let i = 0; i < count; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = config.size || 3;
      const particle = this.pool.getCircle(x, y, size, color, config.alpha?.start ?? 1);
      particle.setDepth(500);

      // 속도/방향 계산
      const angleMin = config.angle?.min ?? 0;
      const angleMax = config.angle?.max ?? 360;
      const angle = Phaser.Math.FloatBetween(angleMin, angleMax) * (Math.PI / 180);
      const speed = Phaser.Math.Between(config.speed?.min ?? 50, config.speed?.max ?? 100);

      // 수렴형: 외부→중심
      let targetX, targetY;
      if (config.converge) {
        const startAngle = (i / count) * Math.PI * 2;
        const startDist = Phaser.Math.Between(150, 300);
        particle.setPosition(
          x + Math.cos(startAngle) * startDist,
          y + Math.sin(startAngle) * startDist
        );
        targetX = x;
        targetY = y;
      } else {
        targetX = x + Math.cos(angle) * speed;
        targetY = y + Math.sin(angle) * speed + (config.gravity || 0) * 0.5;
      }

      const lifespan = Phaser.Math.Between(
        config.lifespan?.min ?? 400,
        config.lifespan?.max ?? 800
      );

      const scaleStart = config.scale?.start ?? 1;
      const scaleEnd = config.scale?.end ?? 0;
      const alphaEnd = config.alpha?.end ?? 0;

      this.scene.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        scaleX: scaleEnd / scaleStart,
        scaleY: scaleEnd / scaleStart,
        alpha: alphaEnd,
        duration: lifespan,
        delay: Phaser.Math.Between(0, 100),
        ease: 'Quad.easeOut',
        onComplete: () => this.pool.release(particle)
      });
    }
  }

  // ============================================
  // Mood별 이펙트
  // ============================================

  /**
   * Mood 기반 스킬 이펙트
   * @param {string} mood - 분위기 이름
   * @param {number} x - 대상 X
   * @param {number} y - 대상 Y
   * @param {string} type - 'hit' | 'skill' | 'ultimate'
   */
  playMoodEffect(mood, x, y, type = 'hit') {
    const colors = MOOD_PARTICLE_COLORS[mood] || [0xFFFFFF, 0xCCCCCC, 0x999999];

    if (type === 'ultimate') {
      this._playUltimateEffect(x, y, colors, mood);
    } else if (type === 'skill') {
      this._playSkillEffect(x, y, colors, mood);
    } else {
      this._playHitEffect(x, y, colors);
    }
  }

  _playHitEffect(x, y, colors) {
    this.playPreset('hit', x, y, { colors });

    // 중심 섬광
    const flash = this.pool.getCircle(x, y, 15, colors[0], 0.8);
    flash.setDepth(500);
    this.scene.tweens.add({
      targets: flash,
      scaleX: 2, scaleY: 2,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => this.pool.release(flash)
    });
  }

  _playSkillEffect(x, y, colors, mood) {
    // 확산 파티클
    this.playPreset('sparkle', x, y, { colors, count: 12 });

    // 중심 링
    const ring = this.pool.getCircle(x, y, 5, colors[0], 0.6);
    ring.setDepth(500);
    ring.setStrokeStyle(2, colors[1]);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 4, scaleY: 4,
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => this.pool.release(ring)
    });
  }

  _playUltimateEffect(x, y, colors, mood) {
    // 방사형 링 3개
    for (let i = 0; i < 3; i++) {
      const ring = this.pool.getCircle(x, y, 10, colors[i % colors.length], 0);
      ring.setDepth(500);
      ring.setStrokeStyle(3, colors[i % colors.length]);
      ring.setAlpha(0.8);

      this.scene.tweens.add({
        targets: ring,
        scaleX: 5 + i * 2,
        scaleY: 5 + i * 2,
        alpha: 0,
        duration: 600 + i * 200,
        delay: i * 100,
        ease: 'Quad.easeOut',
        onComplete: () => this.pool.release(ring)
      });
    }

    // 방사 파티클 16개
    this.playPreset('sparkle', x, y, {
      colors,
      count: 16,
      speed: { min: 100, max: 250 },
      lifespan: { min: 500, max: 1000 }
    });

    // 십자 선
    for (let angle = 0; angle < 360; angle += 90) {
      const rad = angle * (Math.PI / 180);
      const lineEnd = this.pool.getCircle(x, y, 2, colors[0], 0.9);
      lineEnd.setDepth(500);

      this.scene.tweens.add({
        targets: lineEnd,
        x: x + Math.cos(rad) * 200,
        y: y + Math.sin(rad) * 200,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 400,
        ease: 'Quad.easeOut',
        onComplete: () => this.pool.release(lineEnd)
      });
    }
  }

  // ============================================
  // H-10.2: 등급별 파티클
  // ============================================

  /**
   * 등급별 소환 파티클
   * @param {string} rarity - 'N' | 'R' | 'SR' | 'SSR'
   * @param {number} x - 중심 X
   * @param {number} y - 중심 Y
   */
  playRarityEffect(rarity, x, y) {
    const colors = RARITY_PARTICLE_COLORS[rarity];
    if (!colors) return; // N등급은 파티클 없음

    if (rarity === 'SSR') {
      // 금빛 빛기둥 + 수렴 + 축하
      this.playPreset('lightPillar', x, y, { colors, count: 20 });
      this.scene.time.delayedCall(300, () => {
        this.playPreset('converge', x, y, { colors });
      });
      this.scene.time.delayedCall(700, () => {
        this.playPreset('celebration', x, y, { colors, count: 30 });
      });
    } else if (rarity === 'SR') {
      // 보라 확산 + 반짝임
      this.playPreset('sparkle', x, y, { colors, count: 16 });
      this.scene.time.delayedCall(200, () => {
        this.playPreset('lightPillar', x, y, { colors, count: 8 });
      });
    } else if (rarity === 'R') {
      // 파란 반짝임
      this.playPreset('sparkle', x, y, { colors, count: 10 });
    }
  }

  // ============================================
  // H-10.3: 레벨업/진화 축하
  // ============================================

  /**
   * 레벨업 축하 이펙트
   */
  playLevelUpEffect(x, y) {
    const colors = [0xFBBF24, 0xFDE68A, 0xFFFFFF];
    this.playPreset('celebration', x, y, { colors });

    // "LEVEL UP!" 텍스트
    const text = this.pool.getText(x, y, 'LEVEL UP!', {
      fontFamily: 'Noto Sans KR',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#FBBF24',
      stroke: '#000000',
      strokeThickness: 4
    });
    text.setDepth(600);

    this.scene.tweens.add({
      targets: text,
      y: y - 60,
      scaleX: 1.3,
      scaleY: 1.3,
      alpha: 0,
      duration: 1200,
      ease: 'Back.easeOut',
      onComplete: () => this.pool.release(text)
    });
  }

  /**
   * 진화 이펙트
   */
  playEvolutionEffect(x, y) {
    const colors = [0xA855F7, 0xC084FC, 0xFFFFFF];

    // 빛기둥
    this.playPreset('lightPillar', x, y, { colors, count: 24 });

    // 중심에서 확산하는 링
    for (let i = 0; i < 5; i++) {
      this.scene.time.delayedCall(i * 150, () => {
        const ring = this.pool.getCircle(x, y, 8, colors[0], 0);
        ring.setDepth(500);
        ring.setStrokeStyle(2, colors[i % colors.length]);
        ring.setAlpha(0.7);

        this.scene.tweens.add({
          targets: ring,
          scaleX: 8,
          scaleY: 8,
          alpha: 0,
          duration: 800,
          ease: 'Quad.easeOut',
          onComplete: () => this.pool.release(ring)
        });
      });
    }

    // 축하 파티클
    this.scene.time.delayedCall(500, () => {
      this.playPreset('celebration', x, y, { colors, count: 32 });
    });
  }

  // ============================================
  // 데미지 숫자 표시
  // ============================================

  /**
   * 데미지 숫자 표시
   * @param {number} x - X 위치
   * @param {number} y - Y 위치
   * @param {number|string} value - 데미지 수치 또는 텍스트
   * @param {string} type - 'normal'|'critical'|'moodAdvantage'|'moodDisadvantage'|'heal'|'miss'
   */
  showDamageNumber(x, y, value, type = 'normal') {
    const style = DAMAGE_NUMBER_STYLES[type] || DAMAGE_NUMBER_STYLES.normal;

    let displayText;
    if (style.text) {
      displayText = style.text;
    } else {
      displayText = (style.prefix || '') + String(value) + (style.suffix || '');
    }

    const text = this.pool.getText(x + Phaser.Math.Between(-10, 10), y, displayText, {
      fontFamily: 'Roboto Mono, monospace',
      fontSize: style.fontSize,
      fontStyle: 'bold',
      color: style.color,
      stroke: style.stroke,
      strokeThickness: style.strokeThickness
    });
    text.setDepth(600);

    // 흔들림 (크리티컬)
    if (style.shake) {
      text.setScale(1.5);
      this.scene.tweens.add({
        targets: text,
        scaleX: 1, scaleY: 1,
        duration: 150,
        ease: 'Back.easeOut'
      });
    }

    // 상승 + 페이드
    this.scene.tweens.add({
      targets: text,
      y: y - (style.rise || 40),
      alpha: 0,
      duration: style.duration || 800,
      delay: 100,
      ease: 'Quad.easeOut',
      onComplete: () => this.pool.release(text)
    });
  }

  // ============================================
  // 전투 전환 이펙트
  // ============================================

  /**
   * 전투 시작 전환 이펙트
   */
  playBattleStartEffect() {
    const { width, height } = this.scene.cameras.main;
    const cx = width / 2;
    const cy = height / 2;

    // 중앙에서 확산하는 원
    const circle = this.pool.getCircle(cx, cy, 5, 0xFFFFFF, 0.8);
    circle.setDepth(900);
    this.scene.tweens.add({
      targets: circle,
      scaleX: 50, scaleY: 50,
      alpha: 0,
      duration: 600,
      ease: 'Quad.easeOut',
      onComplete: () => this.pool.release(circle)
    });
  }

  /**
   * 승리 이펙트
   */
  playVictoryEffect() {
    const { width, height } = this.scene.cameras.main;
    const cx = width / 2;
    const cy = height / 2;

    // 금빛 파티클 폭발
    const colors = [0xFBBF24, 0xFDE68A, 0xFFFFFF, 0xF59E0B];
    for (let wave = 0; wave < 3; wave++) {
      this.scene.time.delayedCall(wave * 300, () => {
        this.playPreset('celebration', cx, cy - 100 + wave * 50, {
          colors,
          count: 20
        });
      });
    }
  }

  /**
   * 패배 이펙트
   */
  playDefeatEffect() {
    const { width, height } = this.scene.cameras.main;
    const cx = width / 2;
    const cy = height / 2;

    // 어두운 파티클 하강
    const colors = [0x374151, 0x4B5563, 0x1F2937];
    this.playPreset('smoke', cx, cy, { colors, count: 15 });
  }

  // ============================================
  // 정리
  // ============================================

  // ============================================
  // VFX-2.1: Skill Animation Support
  // ============================================

  /**
   * Promise-based particle burst for skill animations
   * @param {Phaser.Scene} scene - Scene context
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {string} particleType - Particle preset name (e.g., 'flame_burst')
   * @param {string} mood - Mood name for color mapping
   * @returns {Promise<void>}
   */
  async playSkillParticle(scene, x, y, particleType, mood) {
    return new Promise((resolve) => {
      // Import MOOD_VFX from skillAnimationConfig
      import('../config/skillAnimationConfig.js').then(({ MOOD_VFX }) => {
        const config = MOOD_VFX[mood] || MOOD_VFX.brave;

        // Create particle burst (8 particles radiating outward)
        const particles = [];
        const count = 8;

        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const particle = this.pool.getCircle(x, y, 4, config.color, 0.8);
          particle.setDepth(100);
          particles.push(particle);

          // Radial outward motion
          scene.tweens.add({
            targets: particle,
            x: x + Math.cos(angle) * 60,
            y: y + Math.sin(angle) * 60,
            alpha: 0,
            scale: 0.3,
            duration: 500,
            ease: 'Power2',
            onComplete: () => this.pool.release(particle)
          });
        }

        // Resolve after particles complete
        scene.time.delayedCall(500, resolve);
      });
    });
  }

  /**
   * Create trail effect for moving objects
   * @param {Phaser.Scene} scene - Scene context
   * @param {Phaser.GameObjects.GameObject} gameObject - Object to trail
   * @param {number} color - Trail color
   * @param {number} duration - Trail fade duration (ms)
   * @returns {Phaser.GameObjects.Arc} Trail object
   */
  createTrail(scene, gameObject, color, duration = 300) {
    // Create fading copy behind moving object
    const trail = this.pool.getCircle(gameObject.x, gameObject.y, 6, color, 0.5);
    trail.setDepth(gameObject.depth - 1);

    scene.tweens.add({
      targets: trail,
      alpha: 0,
      scale: 0.1,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => this.pool.release(trail)
    });

    return trail;
  }

  /**
   * Apply screen shake effect
   * @param {Phaser.Scene} scene - Scene context
   * @param {object} config - Shake config { intensity, duration }
   */
  applyScreenShake(scene, config) {
    if (!scene.cameras?.main) return;

    // Phaser camera shake: intensity is in pixels, duration in ms
    scene.cameras.main.shake(config.duration, config.intensity / 1000);
  }

  // ============================================
  // 정리
  // ============================================

  /**
   * Scene 종료 시 정리
   */
  destroy() {
    this.activeEffects = [];
    this.pool.destroy();
  }

  /**
   * 풀 상태 반환 (디버그용)
   */
  getStats() {
    return this.pool.getStats();
  }
}

export default ParticleManager;
