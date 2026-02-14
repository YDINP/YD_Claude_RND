/**
 * BackgroundFactory.js - 프로시저럴 배경 생성 유틸리티
 * Phaser Graphics API로 씬별 동적 배경 생성
 *
 * 사용법:
 *   import { BackgroundFactory } from '../utils/BackgroundFactory.js';
 *   BackgroundFactory.createMainBg(this);
 *   BackgroundFactory.createBattleBg(this);
 */

import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';

export class BackgroundFactory {
  /**
   * MainMenu: 어두운 남색 → 보라 그래디언트 + 별빛 파티클
   * @param {Phaser.Scene} scene
   */
  static createMainBg(scene) {
    const graphics = scene.add.graphics();

    // 그래디언트 배경 (남색 → 보라)
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(15 + ratio * 30); // 15 → 45
      const g = Math.floor(23 + ratio * 20); // 23 → 43
      const b = Math.floor(42 + ratio * 38); // 42 → 80
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // 별빛 파티클 (25개)
    const stars = [];
    for (let i = 0; i < 25; i++) {
      const star = scene.add.circle(
        Phaser.Math.Between(10, GAME_WIDTH - 10),
        Phaser.Math.Between(10, GAME_HEIGHT - 250),
        Phaser.Math.FloatBetween(1, 2.5),
        COLORS.text,
        Phaser.Math.FloatBetween(0.15, 0.5)
      );
      scene.tweens.add({
        targets: star,
        alpha: { from: star.alpha, to: Phaser.Math.FloatBetween(0.05, 0.3) },
        duration: Phaser.Math.Between(1500, 3500),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 2000),
        ease: 'Sine.easeInOut'
      });
      stars.push(star);
    }

    // 오브 (3개) - 부드러운 움직임
    for (let i = 0; i < 3; i++) {
      const orb = scene.add.circle(
        Phaser.Math.Between(50, GAME_WIDTH - 50),
        Phaser.Math.Between(100, GAME_HEIGHT - 300),
        Phaser.Math.Between(4, 8),
        COLORS.primary,
        0.08
      );
      scene.tweens.add({
        targets: orb,
        x: orb.x + Phaser.Math.Between(-60, 60),
        y: orb.y + Phaser.Math.Between(-40, 40),
        alpha: { from: 0.08, to: 0.15 },
        duration: Phaser.Math.Between(6000, 10000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // 하단 글로우
    const glowGraphics = scene.add.graphics();
    glowGraphics.fillStyle(COLORS.primary, 0.1);
    glowGraphics.fillEllipse(GAME_WIDTH / 2, GAME_HEIGHT, GAME_WIDTH, 300);
    scene.tweens.add({
      targets: glowGraphics,
      alpha: { from: 1, to: 0.5 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    return { graphics, stars };
  }

  /**
   * BattleScene: 어두운 던전 분위기 — 짙은 회색~검정 그래디언트 + 안개/먼지 파티클
   * @param {Phaser.Scene} scene
   */
  static createBattleBg(scene) {
    const graphics = scene.add.graphics();

    // 그래디언트 배경 (짙은 회색 → 검정)
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(20 - ratio * 10); // 20 → 10
      const g = Math.floor(25 - ratio * 15); // 25 → 10
      const b = Math.floor(30 - ratio * 18); // 30 → 12
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // 안개/먼지 파티클 (15개)
    const particles = [];
    for (let i = 0; i < 15; i++) {
      const particle = scene.add.circle(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(GAME_HEIGHT / 2, GAME_HEIGHT),
        Phaser.Math.Between(20, 50),
        0x666666,
        Phaser.Math.FloatBetween(0.03, 0.1)
      );
      scene.tweens.add({
        targets: particle,
        x: particle.x + Phaser.Math.Between(-100, 100),
        y: particle.y - Phaser.Math.Between(50, 150),
        alpha: 0,
        duration: Phaser.Math.Between(4000, 8000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 3000),
        ease: 'Sine.easeInOut'
      });
      particles.push(particle);
    }

    // 좌우 어두운 비네팅 효과
    const vignette = scene.add.graphics();
    vignette.fillStyle(0x000000, 0.3);
    vignette.fillEllipse(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 1.2, GAME_HEIGHT * 1.2);
    vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);

    return { graphics, particles, vignette };
  }

  /**
   * Gacha: 마법진 느낌 — 보라+골드 그래디언트 + 빛줄기 효과
   * @param {Phaser.Scene} scene
   */
  static createGachaBg(scene) {
    const graphics = scene.add.graphics();

    // 그래디언트 배경 (보라 → 골드 힌트)
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(15 + ratio * 30); // 15 → 45
      const g = Math.floor(10 + ratio * 35); // 10 → 45
      const b = Math.floor(30 + ratio * 20); // 30 → 50
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // 중앙 마법진 (원형 패턴)
    const circle = scene.add.graphics();
    circle.lineStyle(2, COLORS.secondary, 0.3);
    circle.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 250);
    circle.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 200);
    circle.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 150);

    // 회전 애니메이션
    scene.tweens.add({
      targets: circle,
      rotation: Math.PI * 2,
      duration: 20000,
      repeat: -1,
      ease: 'Linear'
    });

    // 빛줄기 파티클 (40개)
    const particles = [];
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const size = Phaser.Math.FloatBetween(1, 2);

      const particle = scene.add.circle(x, y, size, COLORS.secondary, 0.4);

      scene.tweens.add({
        targets: particle,
        y: particle.y - Phaser.Math.Between(100, 200),
        alpha: 0,
        duration: Phaser.Math.Between(3000, 6000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 2000),
        ease: 'Sine.easeOut'
      });
      particles.push(particle);
    }

    // 중앙 골드 글로우
    const glow = scene.add.graphics();
    glow.fillStyle(0xF59E0B, 0.15);
    glow.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 150);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.15, to: 0.3 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    return { graphics, circle, particles, glow };
  }

  /**
   * StageSelect: 판타지 월드맵 — 녹색~갈색 대지 느낌 그래디언트
   * @param {Phaser.Scene} scene
   */
  static createStageSelectBg(scene) {
    const graphics = scene.add.graphics();

    // 그래디언트 배경 (녹색 → 갈색)
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(10 + ratio * 40); // 10 → 50
      const g = Math.floor(20 + ratio * 30); // 20 → 50
      const b = Math.floor(15 + ratio * 10); // 15 → 25
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // 나무 실루엣 (15개)
    const trees = [];
    for (let i = 0; i < 15; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(100, GAME_HEIGHT - 100);
      const size = Phaser.Math.Between(30, 80);
      const alpha = Phaser.Math.FloatBetween(0.05, 0.15);

      const tree = scene.add.graphics();
      tree.fillStyle(0x1a472a, alpha);
      tree.fillTriangle(
        x, y - size,
        x - size / 2, y + size / 2,
        x + size / 2, y + size / 2
      );
      trees.push(tree);
    }

    // 떠다니는 나뭇잎 파티클 (10개)
    const leaves = [];
    for (let i = 0; i < 10; i++) {
      const leaf = scene.add.ellipse(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(0, GAME_HEIGHT / 2),
        8, 4,
        0x4ade80,
        Phaser.Math.FloatBetween(0.2, 0.4)
      );
      scene.tweens.add({
        targets: leaf,
        x: leaf.x + Phaser.Math.Between(-150, 150),
        y: leaf.y + Phaser.Math.Between(200, 400),
        rotation: Math.PI * 2,
        alpha: 0,
        duration: Phaser.Math.Between(5000, 10000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 3000),
        ease: 'Sine.easeInOut'
      });
      leaves.push(leaf);
    }

    return { graphics, trees, leaves };
  }

  /**
   * Tower: 어두운 탑 내부 — 검정+진남색 + 횃불빛 느낌 주황 포인트
   * @param {Phaser.Scene} scene
   */
  static createTowerBg(scene) {
    const graphics = scene.add.graphics();

    // 그래디언트 배경 (검정 → 진남색)
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(10 + ratio * 16); // 10 → 26
      const g = Math.floor(14 + ratio * 2); // 14 → 16
      const b = Math.floor(26 + ratio * 38); // 26 → 64
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // 별 효과 (상단 40개)
    const stars = [];
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT * 0.4);
      const size = Phaser.Math.FloatBetween(1, 3);
      const star = scene.add.circle(x, y, size, 0xffffff, Phaser.Math.FloatBetween(0.2, 0.7));
      scene.tweens.add({
        targets: star,
        alpha: 0.1,
        duration: Phaser.Math.Between(1500, 3000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      stars.push(star);
    }

    // 횃불빛 포인트 (좌우 2개)
    const torches = [];
    [100, GAME_WIDTH - 100].forEach(x => {
      const torch = scene.add.circle(x, GAME_HEIGHT / 2, 80, 0xFF6B00, 0.15);
      scene.tweens.add({
        targets: torch,
        alpha: { from: 0.1, to: 0.25 },
        scaleX: { from: 0.9, to: 1.1 },
        scaleY: { from: 1.1, to: 0.9 },
        duration: Phaser.Math.Between(1000, 2000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      torches.push(torch);
    });

    // 어두운 비네팅
    const vignette = scene.add.graphics();
    vignette.fillStyle(0x000000, 0.4);
    vignette.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    vignette.fillStyle(0x1a1040, 0.3);
    vignette.fillEllipse(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.8, GAME_HEIGHT * 0.8);
    vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);

    return { graphics, stars, torches, vignette };
  }

  /**
   * 범용 그래디언트 배경 생성 헬퍼
   * @param {Phaser.Scene} scene
   * @param {Object} options
   * @param {number[]} options.topColor - [r, g, b]
   * @param {number[]} options.bottomColor - [r, g, b]
   * @returns {Phaser.GameObjects.Graphics}
   */
  static createGradientBg(scene, options = {}) {
    const topColor = options.topColor || [15, 23, 42];
    const bottomColor = options.bottomColor || [30, 41, 59];

    const graphics = scene.add.graphics();

    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(topColor[0] + ratio * (bottomColor[0] - topColor[0]));
      const g = Math.floor(topColor[1] + ratio * (bottomColor[1] - topColor[1]));
      const b = Math.floor(topColor[2] + ratio * (bottomColor[2] - topColor[2]));
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    return graphics;
  }
}
