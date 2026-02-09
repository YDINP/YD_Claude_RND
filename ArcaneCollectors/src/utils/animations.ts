/**
 * animations.ts - Reusable Phaser animations and tweens
 */

import type Phaser from 'phaser';

// ============================================
// Fade Animations
// ============================================

export function fadeIn(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration: number = 300): Phaser.Tweens.Tween {
  (target as any).setAlpha(0);
  return scene.tweens.add({
    targets: target,
    alpha: 1,
    duration,
    ease: 'Power2'
  });
}

export function fadeOut(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration: number = 300): Phaser.Tweens.Tween {
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

export function scaleIn(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration: number = 300): Phaser.Tweens.Tween {
  (target as any).setScale(0);
  return scene.tweens.add({
    targets: target,
    scale: 1,
    duration,
    ease: 'Back.easeOut'
  });
}

export function scaleOut(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration: number = 200): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    scale: 0,
    duration,
    ease: 'Back.easeIn'
  });
}

export function bounce(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, intensity: number = 1.1, duration: number = 100): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    scale: intensity,
    duration,
    yoyo: true,
    ease: 'Quad.easeOut'
  });
}

export function popIn(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration: number = 200): Phaser.Tweens.Tween {
  (target as any).setScale(1.3);
  (target as any).setAlpha(0);
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

export function shake(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, intensity: number = 5, duration: number = 100): Phaser.Tweens.Tween {
  const originalX = (target as any).x;
  return scene.tweens.add({
    targets: target,
    x: { from: originalX - intensity, to: originalX + intensity },
    duration: duration / 4,
    yoyo: true,
    repeat: 2,
    onComplete: () => {
      (target as any).x = originalX;
    }
  });
}

type Direction = 'right' | 'left' | 'top' | 'bottom';

export function slideIn(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, from: Direction = 'right', distance: number = 100, duration: number = 300): Phaser.Tweens.Tween {
  const obj = target as any;
  const originalX = obj.x;
  const originalY = obj.y;

  if (from === 'right') obj.x += distance;
  else if (from === 'left') obj.x -= distance;
  else if (from === 'top') obj.y -= distance;
  else if (from === 'bottom') obj.y += distance;

  obj.setAlpha(0);

  return scene.tweens.add({
    targets: target,
    x: originalX,
    y: originalY,
    alpha: 1,
    duration,
    ease: 'Power2'
  });
}

export function slideOut(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, to: Direction = 'right', distance: number = 100, duration: number = 300): Phaser.Tweens.Tween {
  const obj = target as any;
  const targetX = to === 'right' ? obj.x + distance : to === 'left' ? obj.x - distance : obj.x;
  const targetY = to === 'bottom' ? obj.y + distance : to === 'top' ? obj.y - distance : obj.y;

  return scene.tweens.add({
    targets: target,
    x: targetX,
    y: targetY,
    alpha: 0,
    duration,
    ease: 'Power2'
  });
}

export function floatUp(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, distance: number = 50, duration: number = 500): Phaser.Tweens.Tween {
  const startY = (target as any).y;
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

export function pulse(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, scale: number = 1.05, duration: number = 500): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    scale,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
}

export function float(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, distance: number = 5, duration: number = 1000): Phaser.Tweens.Tween {
  const startY = (target as any).y;
  return scene.tweens.add({
    targets: target,
    y: startY - distance,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
}

export function spin(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration: number = 2000): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    rotation: Math.PI * 2,
    duration,
    repeat: -1,
    ease: 'Linear'
  });
}

export function glow(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, minAlpha: number = 0.5, maxAlpha: number = 1, duration: number = 800): Phaser.Tweens.Tween {
  (target as any).setAlpha(maxAlpha);
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

export function countUp(scene: Phaser.Scene, textObject: Phaser.GameObjects.Text, from: number, to: number, duration: number = 1000, format?: (value: number) => string): Phaser.Tweens.Tween {
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

export function particleBurst(scene: Phaser.Scene, x: number, y: number, color: number = 0xffffff, count: number = 20): Phaser.GameObjects.Arc[] {
  const particles: Phaser.GameObjects.Arc[] = [];
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

export function starBurst(scene: Phaser.Scene, x: number, y: number, color: number = 0xfbbf24, count: number = 8): Phaser.GameObjects.Star[] {
  const stars: Phaser.GameObjects.Star[] = [];
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

export function attackAnimation(scene: Phaser.Scene, attacker: Phaser.GameObjects.GameObject, target: Phaser.GameObjects.GameObject, duration: number = 200): Promise<void> {
  const obj = attacker as any;
  const tgt = target as any;
  const originalX = obj.x;
  const originalY = obj.y;
  const moveDistance = 30;

  const angle = Math.atan2(tgt.y - obj.y, tgt.x - obj.x);
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
      onComplete: () => resolve()
    });
  });
}

export function hitReaction(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration: number = 100): Phaser.Tweens.Tween {
  const obj = target as any;
  const originalTint = obj.tintTopLeft;

  obj.setTint(0xffffff);

  return scene.tweens.add({
    targets: target,
    alpha: 0.5,
    duration: duration / 2,
    yoyo: true,
    onComplete: () => {
      obj.clearTint();
      if (originalTint) obj.setTint(originalTint);
    }
  });
}

export function deathAnimation(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration: number = 500): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      alpha: 0,
      scale: 0.5,
      rotation: 0.2,
      duration,
      ease: 'Power2',
      onComplete: () => resolve()
    });
  });
}

// ============================================
// UI Animations
// ============================================

export function buttonPress(scene: Phaser.Scene, button: Phaser.GameObjects.GameObject): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: button,
    scale: 0.95,
    duration: 50,
    yoyo: true,
    ease: 'Power2'
  });
}

export function showToast(scene: Phaser.Scene, toast: Phaser.GameObjects.Container, displayTime: number = 2000): Promise<void> {
  return new Promise((resolve) => {
    slideIn(scene, toast, 'top', 50, 200);

    scene.time.delayedCall(displayTime, () => {
      slideOut(scene, toast, 'top', 50, 200).on('complete', () => resolve());
    });
  });
}

// ============================================
// Advanced UI Animations
// ============================================

export function popInAsync(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration: number = 300): Promise<void> {
  const obj = target as any;
  obj.setScale(0.5);
  obj.setAlpha(0);

  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      scale: 1,
      alpha: 1,
      duration,
      ease: 'Back.easeOut',
      onComplete: () => resolve()
    });
  });
}

export function popOut(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration: number = 200): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      scale: 0.5,
      alpha: 0,
      duration,
      ease: 'Back.easeIn',
      onComplete: () => resolve()
    });
  });
}

export function shakeScreen(scene: Phaser.Scene, intensity: number = 5, duration: number = 200): Phaser.Cameras.Scene2D.Camera {
  const camera = scene.cameras.main;
  camera.shake(duration, intensity / 1000);
  return camera;
}

export function fadeTransition(scene: Phaser.Scene, toScene: string, duration: number = 300): Promise<void> {
  return new Promise((resolve) => {
    scene.cameras.main.fadeOut(duration, 0, 0, 0);

    scene.cameras.main.once('camerafadeoutcomplete', () => {
      scene.scene.start(toScene);
      resolve();
    });
  });
}

export function particleBurstFancy(scene: Phaser.Scene, x: number, y: number, count: number = 20, color: number = 0xFFD700): Phaser.GameObjects.Arc[] {
  const particles: Phaser.GameObjects.Arc[] = [];

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

export function lightPillar(scene: Phaser.Scene, x: number, y: number, duration: number = 1000): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  graphics.setDepth(500);

  graphics.fillGradientStyle(0xFFFFFF, 0xFFFFFF, 0xFFD700, 0xFFD700, 0.8, 0.8, 0, 0);
  graphics.fillRect(x - 10, y - 200, 20, 200);

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

export function cardFlip(scene: Phaser.Scene, card: Phaser.GameObjects.Image, frontTexture: string, backTexture: string, duration: number = 500): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: card,
      scaleX: 0,
      duration: duration / 2,
      ease: 'Power2',
      onComplete: () => {
        card.setTexture(frontTexture);

        scene.tweens.add({
          targets: card,
          scaleX: 1,
          duration: duration / 2,
          ease: 'Power2',
          onComplete: () => resolve()
        });
      }
    });
  });
}
