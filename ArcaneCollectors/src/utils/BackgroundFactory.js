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
   * MainMenu: ART-2.1 강화 - 판타지 성/마을 느낌 (그라데이션 하늘 + 건물 실루엣 + 별/파티클)
   * @param {Phaser.Scene} scene
   */
  static createMainBg(scene) {
    const graphics = scene.add.graphics();

    // ART-2.1: 더 풍부한 그래디언트 배경 (새벽 하늘 → 보라 밤하늘)
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      // 상단: 짙은 남색 → 중간: 보라 → 하단: 진한 보라
      const r = Math.floor(15 + ratio * 35 + Math.sin(ratio * Math.PI) * 10); // 15 → 50 (파동 효과)
      const g = Math.floor(23 + ratio * 25 - ratio * ratio * 15); // 23 → 48 → 33 (아치형)
      const b = Math.floor(42 + ratio * 48 - ratio * 10); // 42 → 90 → 80
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // ART-2.1: 건물 실루엣 레이어 (성/마을 느낌)
    const buildings = [];
    const buildingY = GAME_HEIGHT - 200;

    // 원경 성 (중앙)
    const castle = scene.add.graphics();
    castle.fillStyle(0x1a1f3a, 0.4);
    castle.fillTriangle(
      GAME_WIDTH / 2, buildingY - 100,
      GAME_WIDTH / 2 - 80, buildingY + 50,
      GAME_WIDTH / 2 + 80, buildingY + 50
    );
    // 탑 2개
    castle.fillRect(GAME_WIDTH / 2 - 60, buildingY - 50, 30, 100);
    castle.fillRect(GAME_WIDTH / 2 + 30, buildingY - 50, 30, 100);
    buildings.push(castle);

    // 근경 건물들 (좌우)
    for (let i = 0; i < 8; i++) {
      const x = (i < 4) ? i * 80 + 40 : GAME_WIDTH - (i - 4) * 80 - 40;
      const height = Phaser.Math.Between(60, 120);
      const width = Phaser.Math.Between(40, 70);
      const building = scene.add.graphics();
      building.fillStyle(0x1a1f3a, Phaser.Math.FloatBetween(0.5, 0.7));
      building.fillRect(x - width / 2, buildingY + 50 - height, width, height);
      // 창문 (작은 사각형들)
      building.fillStyle(0xffa500, Phaser.Math.FloatBetween(0.15, 0.25));
      for (let w = 0; w < 3; w++) {
        building.fillRect(x - width / 2 + 8 + w * 12, buildingY + 50 - height + 20, 6, 8);
      }
      buildings.push(building);
    }

    // ART-2.1: 별빛 파티클 강화 (40개, 크기/밝기 다양화)
    const stars = [];
    for (let i = 0; i < 40; i++) {
      const size = Phaser.Math.FloatBetween(0.8, 3);
      const star = scene.add.circle(
        Phaser.Math.Between(10, GAME_WIDTH - 10),
        Phaser.Math.Between(10, buildingY - 50),
        size,
        0xFFFFFF,
        Phaser.Math.FloatBetween(0.3, 0.8)
      );
      scene.tweens.add({
        targets: star,
        alpha: { from: star.alpha, to: Phaser.Math.FloatBetween(0.1, 0.4) },
        duration: Phaser.Math.Between(1200, 4000),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 3000),
        ease: 'Sine.easeInOut'
      });
      stars.push(star);
    }

    // ART-2.1: 마법 오브 강화 (5개, 색상 다양화)
    const orbColors = [COLORS.primary, 0xEC4899, 0x10B981, 0xF59E0B, 0x8B5CF6];
    for (let i = 0; i < 5; i++) {
      const orb = scene.add.circle(
        Phaser.Math.Between(50, GAME_WIDTH - 50),
        Phaser.Math.Between(100, buildingY - 100),
        Phaser.Math.Between(5, 12),
        orbColors[i % orbColors.length],
        0.12
      );
      scene.tweens.add({
        targets: orb,
        x: orb.x + Phaser.Math.Between(-80, 80),
        y: orb.y + Phaser.Math.Between(-50, 50),
        alpha: { from: 0.12, to: 0.25 },
        scaleX: { from: 1, to: 1.3 },
        scaleY: { from: 1, to: 1.3 },
        duration: Phaser.Math.Between(5000, 12000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // ART-2.1: 하단 글로우 강화 (다중 레이어)
    const glowGraphics = scene.add.graphics();
    glowGraphics.fillStyle(COLORS.primary, 0.08);
    glowGraphics.fillEllipse(GAME_WIDTH / 2, GAME_HEIGHT, GAME_WIDTH * 1.2, 400);
    glowGraphics.fillStyle(0xEC4899, 0.05);
    glowGraphics.fillEllipse(GAME_WIDTH / 2, GAME_HEIGHT, GAME_WIDTH * 0.8, 300);
    scene.tweens.add({
      targets: glowGraphics,
      alpha: { from: 1, to: 0.6 },
      duration: 3500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    return { graphics, stars, buildings };
  }

  /**
   * BattleScene: ART-2.1 강화 - 어두운 전투 필드 (불꽃 파티클 + 격자 바닥)
   * @param {Phaser.Scene} scene
   */
  static createBattleBg(scene) {
    const graphics = scene.add.graphics();

    // ART-2.1: 더 역동적인 그래디언트 (상단 어두운 붉은색 → 하단 검정)
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      // 상단: 어두운 붉은빛 → 중간: 회색 → 하단: 검정
      const r = Math.floor(28 - ratio * 18 + Math.sin(ratio * Math.PI) * 5); // 28 → 10 (붉은 힌트)
      const g = Math.floor(20 - ratio * 12); // 20 → 8
      const b = Math.floor(25 - ratio * 15); // 25 → 10
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // ART-2.1: 격자 바닥 패턴 (원근감)
    const floor = scene.add.graphics();
    floor.lineStyle(1, 0x4a5568, 0.15);
    const floorY = GAME_HEIGHT * 0.7;
    const gridSize = 60;
    // 수평선
    for (let i = 0; i < 8; i++) {
      const y = floorY + i * gridSize / 2;
      const perspective = 1 - (i * 0.08);
      const width = GAME_WIDTH * perspective;
      floor.lineBetween(
        GAME_WIDTH / 2 - width / 2, y,
        GAME_WIDTH / 2 + width / 2, y
      );
    }
    // 수직선
    for (let i = -5; i <= 5; i++) {
      const x = GAME_WIDTH / 2 + i * gridSize;
      floor.lineBetween(x, floorY, GAME_WIDTH / 2 + i * 30, GAME_HEIGHT);
    }

    // ART-2.1: 불꽃 파티클 강화 (25개, 다양한 크기/색상)
    const particles = [];
    for (let i = 0; i < 25; i++) {
      const size = Phaser.Math.Between(15, 40);
      const color = Phaser.Math.RND.pick([0xFF6B00, 0xEF4444, 0xF59E0B]);
      const particle = scene.add.circle(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(GAME_HEIGHT / 2, GAME_HEIGHT),
        size,
        color,
        Phaser.Math.FloatBetween(0.05, 0.15)
      );
      scene.tweens.add({
        targets: particle,
        x: particle.x + Phaser.Math.Between(-120, 120),
        y: particle.y - Phaser.Math.Between(80, 200),
        alpha: 0,
        scaleX: { from: 1, to: 0.3 },
        scaleY: { from: 1, to: 0.3 },
        duration: Phaser.Math.Between(3000, 7000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 3000),
        ease: 'Cubic.easeOut'
      });
      particles.push(particle);
    }

    // ART-2.1: 먼지 입자 (회색, 10개)
    for (let i = 0; i < 10; i++) {
      const dust = scene.add.circle(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(GAME_HEIGHT / 3, GAME_HEIGHT),
        Phaser.Math.Between(25, 60),
        0x666666,
        Phaser.Math.FloatBetween(0.02, 0.08)
      );
      scene.tweens.add({
        targets: dust,
        x: dust.x + Phaser.Math.Between(-80, 80),
        y: dust.y - Phaser.Math.Between(40, 120),
        alpha: 0,
        duration: Phaser.Math.Between(5000, 10000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 4000),
        ease: 'Sine.easeInOut'
      });
      particles.push(dust);
    }

    // ART-2.1: 비네팅 강화 (붉은빛 힌트)
    const vignette = scene.add.graphics();
    vignette.fillStyle(0x1a0a0a, 0.4);
    vignette.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    vignette.fillStyle(0x2a1010, 0.25);
    vignette.fillEllipse(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.9, GAME_HEIGHT * 0.9);
    vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);

    return { graphics, particles, vignette, floor };
  }

  /**
   * Gacha: ART-2.1 강화 - 화려한 소환 배경 (빛나는 원형 패턴 + 마법진 + 룬 문자)
   * @param {Phaser.Scene} scene
   */
  static createGachaBg(scene) {
    const graphics = scene.add.graphics();

    // ART-2.1: 더 화려한 그래디언트 (보라 → 핑크 → 골드)
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      // 3색 그래디언트: 보라 → 핑크 → 골드
      const stage = ratio < 0.5 ? ratio * 2 : 1;
      const stage2 = ratio > 0.5 ? (ratio - 0.5) * 2 : 0;
      const r = Math.floor(15 + stage * 45 + stage2 * 190); // 15 → 60 → 250
      const g = Math.floor(10 + stage * 25 + stage2 * 133); // 10 → 35 → 168
      const b = Math.floor(30 + stage * 90 - stage2 * 105); // 30 → 120 → 15
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // ART-2.1: 중앙 마법진 강화 (다중 레이어 + 룬 문자)
    const circle = scene.add.graphics();

    // 외곽 원 (5개 레이어)
    const radii = [280, 240, 200, 160, 120];
    const colors = [0x8B5CF6, 0xEC4899, 0xF59E0B, 0x10B981, 0x3B82F6];
    radii.forEach((radius, i) => {
      circle.lineStyle(2, colors[i], 0.4 - i * 0.05);
      circle.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, radius);
    });

    // 룬 문자 원형 배치 (12개)
    const runeSymbols = ['◈', '◆', '◇', '◉', '◎', '○', '●', '◐', '◑', '◒', '◓', '◔'];
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 - Math.PI / 2;
      const x = GAME_WIDTH / 2 + Math.cos(angle) * 220;
      const y = GAME_HEIGHT / 2 + Math.sin(angle) * 220;
      const rune = scene.add.text(x, y, runeSymbols[i], {
        fontSize: '18px',
        color: '#EC4899',
        fontStyle: 'bold'
      }).setOrigin(0.5).setAlpha(0.5);
      scene.tweens.add({
        targets: rune,
        alpha: { from: 0.5, to: 0.9 },
        scaleX: { from: 1, to: 1.2 },
        scaleY: { from: 1, to: 1.2 },
        duration: Phaser.Math.Between(1500, 3000),
        yoyo: true,
        repeat: -1,
        delay: i * 150
      });
    }

    // 육각 별 패턴
    const hexagram = scene.add.graphics();
    hexagram.lineStyle(3, 0xF59E0B, 0.4);
    for (let i = 0; i < 6; i++) {
      const angle1 = (Math.PI * 2 * i) / 6;
      const angle2 = (Math.PI * 2 * ((i + 2) % 6)) / 6;
      hexagram.lineBetween(
        GAME_WIDTH / 2 + Math.cos(angle1) * 100,
        GAME_HEIGHT / 2 + Math.sin(angle1) * 100,
        GAME_WIDTH / 2 + Math.cos(angle2) * 100,
        GAME_HEIGHT / 2 + Math.sin(angle2) * 100
      );
    }
    circle.add(hexagram);

    // 회전 애니메이션 (2개 방향)
    scene.tweens.add({
      targets: circle,
      rotation: Math.PI * 2,
      duration: 18000,
      repeat: -1,
      ease: 'Linear'
    });
    scene.tweens.add({
      targets: hexagram,
      rotation: -Math.PI * 2,
      duration: 12000,
      repeat: -1,
      ease: 'Linear'
    });

    // ART-2.1: 빛줄기 파티클 강화 (60개, 다양한 색상/속도)
    const particles = [];
    const particleColors = [0x8B5CF6, 0xEC4899, 0xF59E0B, 0x10B981];
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const size = Phaser.Math.FloatBetween(1.5, 3.5);
      const color = particleColors[i % particleColors.length];

      const particle = scene.add.circle(x, y, size, color, 0.6);

      scene.tweens.add({
        targets: particle,
        y: particle.y - Phaser.Math.Between(150, 300),
        alpha: 0,
        scaleX: { from: 1, to: 0.2 },
        scaleY: { from: 1, to: 0.2 },
        duration: Phaser.Math.Between(2500, 5000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 3000),
        ease: 'Cubic.easeOut'
      });
      particles.push(particle);
    }

    // ART-2.1: 중앙 다중 글로우 (3개 레이어)
    const glow = scene.add.graphics();
    glow.fillStyle(0xF59E0B, 0.12);
    glow.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 180);
    glow.fillStyle(0xEC4899, 0.08);
    glow.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 140);
    glow.fillStyle(0x8B5CF6, 0.05);
    glow.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 100);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 1, to: 0.5 },
      scaleX: { from: 1, to: 1.15 },
      scaleY: { from: 1, to: 1.15 },
      duration: 2500,
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
