/**
 * animations.js - Reusable Phaser animations and tweens
 */

// ============================================
// Fade Animations
// ============================================

/**
 * Fade in a game object
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} duration - Animation duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function fadeIn(scene, target, duration = 300) {
  target.setAlpha(0);
  return scene.tweens.add({
    targets: target,
    alpha: 1,
    duration,
    ease: 'Power2'
  });
}

/**
 * Fade out a game object
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} duration - Animation duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function fadeOut(scene, target, duration = 300) {
  return scene.tweens.add({
    targets: target,
    alpha: 0,
    duration,
    ease: 'Power2'
  });
}

// ============================================
// Scale Animations
// ============================================

/**
 * Scale in from zero with bounce effect
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} duration - Animation duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function scaleIn(scene, target, duration = 300) {
  target.setScale(0);
  return scene.tweens.add({
    targets: target,
    scale: 1,
    duration,
    ease: 'Back.easeOut'
  });
}

/**
 * Scale out to zero
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} duration - Animation duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function scaleOut(scene, target, duration = 200) {
  return scene.tweens.add({
    targets: target,
    scale: 0,
    duration,
    ease: 'Back.easeIn'
  });
}

/**
 * Bounce effect - scale up and back
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} intensity - Max scale during bounce
 * @param {number} duration - Animation duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function bounce(scene, target, intensity = 1.1, duration = 100) {
  return scene.tweens.add({
    targets: target,
    scale: intensity,
    duration,
    yoyo: true,
    ease: 'Quad.easeOut'
  });
}

/**
 * Pop in effect - scale from large to normal
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} duration - Animation duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function popIn(scene, target, duration = 200) {
  target.setScale(1.3);
  target.setAlpha(0);
  return scene.tweens.add({
    targets: target,
    scale: 1,
    alpha: 1,
    duration,
    ease: 'Back.easeOut'
  });
}

// ============================================
// Movement Animations
// ============================================

/**
 * Shake effect - horizontal oscillation
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} intensity - Shake distance in pixels
 * @param {number} duration - Total animation duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function shake(scene, target, intensity = 5, duration = 100) {
  const originalX = target.x;
  return scene.tweens.add({
    targets: target,
    x: { from: originalX - intensity, to: originalX + intensity },
    duration: duration / 4,
    yoyo: true,
    repeat: 2,
    onComplete: () => {
      target.x = originalX;
    }
  });
}

/**
 * Slide in from direction
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {string} from - Direction: 'right', 'left', 'top', 'bottom'
 * @param {number} distance - Distance to slide from
 * @param {number} duration - Animation duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function slideIn(scene, target, from = 'right', distance = 100, duration = 300) {
  const originalX = target.x;
  const originalY = target.y;

  if (from === 'right') target.x += distance;
  else if (from === 'left') target.x -= distance;
  else if (from === 'top') target.y -= distance;
  else if (from === 'bottom') target.y += distance;

  target.setAlpha(0);

  return scene.tweens.add({
    targets: target,
    x: originalX,
    y: originalY,
    alpha: 1,
    duration,
    ease: 'Power2'
  });
}

/**
 * Slide out to direction
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {string} to - Direction: 'right', 'left', 'top', 'bottom'
 * @param {number} distance - Distance to slide
 * @param {number} duration - Animation duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function slideOut(scene, target, to = 'right', distance = 100, duration = 300) {
  const targetX = to === 'right' ? target.x + distance : to === 'left' ? target.x - distance : target.x;
  const targetY = to === 'bottom' ? target.y + distance : to === 'top' ? target.y - distance : target.y;

  return scene.tweens.add({
    targets: target,
    x: targetX,
    y: targetY,
    alpha: 0,
    duration,
    ease: 'Power2'
  });
}

/**
 * Float up and fade out (for damage numbers)
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} distance - Float distance in pixels
 * @param {number} duration - Animation duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function floatUp(scene, target, distance = 50, duration = 500) {
  const startY = target.y;
  return scene.tweens.add({
    targets: target,
    y: startY - distance,
    alpha: 0,
    duration,
    ease: 'Power2'
  });
}

// ============================================
// Continuous Animations
// ============================================

/**
 * Continuous pulse effect
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} scale - Max scale during pulse
 * @param {number} duration - Duration of one pulse cycle
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function pulse(scene, target, scale = 1.05, duration = 500) {
  return scene.tweens.add({
    targets: target,
    scale,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
}

/**
 * Continuous floating effect (up and down)
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} distance - Float distance
 * @param {number} duration - Duration of one cycle
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function float(scene, target, distance = 5, duration = 1000) {
  const startY = target.y;
  return scene.tweens.add({
    targets: target,
    y: startY - distance,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
}

/**
 * Continuous rotation
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} duration - Duration of one full rotation
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function spin(scene, target, duration = 2000) {
  return scene.tweens.add({
    targets: target,
    rotation: Math.PI * 2,
    duration,
    repeat: -1,
    ease: 'Linear'
  });
}

/**
 * Glow effect (alpha oscillation)
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target object
 * @param {number} minAlpha - Minimum alpha
 * @param {number} maxAlpha - Maximum alpha
 * @param {number} duration - Duration of one cycle
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function glow(scene, target, minAlpha = 0.5, maxAlpha = 1, duration = 800) {
  target.setAlpha(maxAlpha);
  return scene.tweens.add({
    targets: target,
    alpha: { from: maxAlpha, to: minAlpha },
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
}

// ============================================
// Number Animations
// ============================================

/**
 * Animate counting from one number to another
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.Text} textObject - Text object to update
 * @param {number} from - Starting number
 * @param {number} to - Ending number
 * @param {number} duration - Animation duration in ms
 * @param {function} format - Optional formatting function
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function countUp(scene, textObject, from, to, duration = 1000, format = null) {
  return scene.tweens.addCounter({
    from,
    to,
    duration,
    ease: 'Power1',
    onUpdate: (tween) => {
      const value = Math.round(tween.getValue());
      textObject.setText(format ? format(value) : value.toString());
    }
  });
}

// ============================================
// Particle Effects
// ============================================

/**
 * Create particle burst effect
 * @param {Phaser.Scene} scene - Current scene
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} color - Particle color (hex number)
 * @param {number} count - Number of particles
 * @returns {Array} Array of particle game objects
 */
export function particleBurst(scene, x, y, color = 0xffffff, count = 20) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const particle = scene.add.circle(x, y, 3, color);
    const angle = (Math.PI * 2 * i) / count;
    const distance = 50 + Math.random() * 50;

    scene.tweens.add({
      targets: particle,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      scale: 0,
      duration: 500 + Math.random() * 200,
      onComplete: () => particle.destroy()
    });

    particles.push(particle);
  }
  return particles;
}

/**
 * Create star burst effect for rewards/achievements
 * @param {Phaser.Scene} scene - Current scene
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} color - Star color (hex number)
 * @param {number} count - Number of stars
 * @returns {Array} Array of star game objects
 */
export function starBurst(scene, x, y, color = 0xfbbf24, count = 8) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    const star = scene.add.star(x, y, 5, 4, 8, color);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const distance = 80 + Math.random() * 40;

    scene.tweens.add({
      targets: star,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      rotation: Math.PI * 2,
      alpha: 0,
      scale: 0.3,
      duration: 800 + Math.random() * 300,
      ease: 'Power2',
      onComplete: () => star.destroy()
    });

    stars.push(star);
  }
  return stars;
}

// ============================================
// Battle Animations
// ============================================

/**
 * Attack animation - move forward and back
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} attacker - Attacking unit
 * @param {Phaser.GameObjects.GameObject} target - Target unit
 * @param {number} duration - Animation duration
 * @returns {Promise} Promise that resolves when complete
 */
export function attackAnimation(scene, attacker, target, duration = 200) {
  const originalX = attacker.x;
  const originalY = attacker.y;
  const moveDistance = 30;

  // Calculate direction to target
  const angle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
  const moveX = Math.cos(angle) * moveDistance;
  const moveY = Math.sin(angle) * moveDistance;

  return new Promise((resolve) => {
    scene.tweens.add({
      targets: attacker,
      x: originalX + moveX,
      y: originalY + moveY,
      duration: duration / 2,
      ease: 'Power2',
      yoyo: true,
      onComplete: resolve
    });
  });
}

/**
 * Hit reaction animation
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Hit target
 * @param {number} duration - Animation duration
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function hitReaction(scene, target, duration = 100) {
  const originalTint = target.tintTopLeft;

  // Flash white
  target.setTint(0xffffff);

  return scene.tweens.add({
    targets: target,
    alpha: 0.5,
    duration: duration / 2,
    yoyo: true,
    onComplete: () => {
      target.clearTint();
      if (originalTint) target.setTint(originalTint);
    }
  });
}

/**
 * Death animation
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Dying unit
 * @param {number} duration - Animation duration
 * @returns {Promise} Promise that resolves when complete
 */
export function deathAnimation(scene, target, duration = 500) {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      alpha: 0,
      scale: 0.5,
      rotation: 0.2,
      duration,
      ease: 'Power2',
      onComplete: resolve
    });
  });
}

// ============================================
// UI Animations
// ============================================

/**
 * Button press effect
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} button - Button object
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function buttonPress(scene, button) {
  return scene.tweens.add({
    targets: button,
    scale: 0.95,
    duration: 50,
    yoyo: true,
    ease: 'Power2'
  });
}

/**
 * Show toast notification
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.Container} toast - Toast container
 * @param {number} displayTime - Time to display in ms
 * @returns {Promise} Promise that resolves when hidden
 */
export function showToast(scene, toast, displayTime = 2000) {
  return new Promise((resolve) => {
    slideIn(scene, toast, 'top', 50, 200);

    scene.time.delayedCall(displayTime, () => {
      slideOut(scene, toast, 'top', 50, 200).on('complete', resolve);
    });
  });
}

// ============================================
// Advanced UI Animations
// ============================================

/**
 * 팝업 등장 애니메이션
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target popup
 * @param {number} duration - Animation duration in ms
 * @returns {Promise} Promise that resolves when complete
 */
export function popInAsync(scene, target, duration = 300) {
  target.setScale(0.5);
  target.setAlpha(0);

  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      scale: 1,
      alpha: 1,
      duration,
      ease: 'Back.easeOut',
      onComplete: resolve
    });
  });
}

/**
 * 팝업 퇴장 애니메이션
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} target - Target popup
 * @param {number} duration - Animation duration in ms
 * @returns {Promise} Promise that resolves when complete
 */
export function popOut(scene, target, duration = 200) {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      scale: 0.5,
      alpha: 0,
      duration,
      ease: 'Back.easeIn',
      onComplete: resolve
    });
  });
}

/**
 * 화면 흔들림 효과
 * @param {Phaser.Scene} scene - Current scene
 * @param {number} intensity - Shake intensity
 * @param {number} duration - Total duration in ms
 * @returns {Phaser.Tweens.Tween} The tween instance
 */
export function shakeScreen(scene, intensity = 5, duration = 200) {
  const camera = scene.cameras.main;
  return camera.shake(duration, intensity / 1000);
}

/**
 * 페이드 화면 전환
 * @param {Phaser.Scene} scene - Current scene
 * @param {string} toScene - Target scene key
 * @param {number} duration - Fade duration in ms
 * @returns {Promise} Promise that resolves after transition
 */
export function fadeTransition(scene, toScene, duration = 300) {
  return new Promise((resolve) => {
    scene.cameras.main.fadeOut(duration, 0, 0, 0);

    scene.cameras.main.once('camerafadeoutcomplete', () => {
      scene.scene.start(toScene);
      resolve();
    });
  });
}

/**
 * 파티클 폭발 효과 (개선된 버전)
 * @param {Phaser.Scene} scene - Current scene
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} count - Number of particles
 * @param {number} color - Particle color (hex number)
 * @returns {Array} Array of particle objects
 */
export function particleBurstFancy(scene, x, y, count = 20, color = 0xFFD700) {
  const particles = [];

  for (let i = 0; i < count; i++) {
    const size = 2 + Math.random() * 4;
    const particle = scene.add.circle(x, y, size, color);
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 40 + Math.random() * 60;
    const targetX = x + Math.cos(angle) * distance;
    const targetY = y + Math.sin(angle) * distance;

    particle.setDepth(1000);

    scene.tweens.add({
      targets: particle,
      x: targetX,
      y: targetY,
      alpha: 0,
      scale: 0,
      duration: 400 + Math.random() * 300,
      ease: 'Power2',
      onComplete: () => particle.destroy()
    });

    particles.push(particle);
  }

  return particles;
}

/**
 * 빛 기둥 효과
 * @param {Phaser.Scene} scene - Current scene
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} duration - Animation duration in ms
 * @returns {Phaser.GameObjects.Graphics} Light pillar object
 */
export function lightPillar(scene, x, y, duration = 1000) {
  const graphics = scene.add.graphics();
  graphics.setDepth(500);

  // 빛 기둥 그리기
  graphics.fillGradientStyle(0xFFFFFF, 0xFFFFFF, 0xFFD700, 0xFFD700, 0.8, 0.8, 0, 0);
  graphics.fillRect(x - 10, y - 200, 20, 200);

  // 애니메이션
  graphics.setAlpha(0);
  scene.tweens.add({
    targets: graphics,
    alpha: 1,
    duration: duration / 3,
    yoyo: true,
    repeat: 1,
    onComplete: () => graphics.destroy()
  });

  return graphics;
}

/**
 * 카드 뒤집기 애니메이션
 * @param {Phaser.Scene} scene - Current scene
 * @param {Phaser.GameObjects.GameObject} card - Card object
 * @param {string} frontTexture - Front texture key
 * @param {string} backTexture - Back texture key
 * @param {number} duration - Animation duration in ms
 * @returns {Promise} Promise that resolves when complete
 */
export function cardFlip(scene, card, frontTexture, backTexture, duration = 500) {
  return new Promise((resolve) => {
    // 뒤집기 전반부 (카드를 옆으로 숨김)
    scene.tweens.add({
      targets: card,
      scaleX: 0,
      duration: duration / 2,
      ease: 'Power2',
      onComplete: () => {
        // 텍스처 변경
        card.setTexture(frontTexture);

        // 뒤집기 후반부 (카드 다시 펼침)
        scene.tweens.add({
          targets: card,
          scaleX: 1,
          duration: duration / 2,
          ease: 'Power2',
          onComplete: resolve
        });
      }
    });
  });
}
