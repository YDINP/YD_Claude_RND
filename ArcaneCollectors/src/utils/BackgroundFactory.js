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
    for (let i = 0; i < 28; i++) { // 퍼포먼스 제약: 씬당 최대 30개
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const size = Phaser.Math.FloatBetween(2, 5);
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

  /**
   * Inventory: 황금빛 그래디언트 + 파티클 25개 + 격자 선반 패턴
   * @param {Phaser.Scene} scene
   */
  static createInventoryBg(scene) {
    const graphics = scene.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(12 + ratio * 28);
      const g = Math.floor(18 + ratio * 20);
      const b = Math.floor(38 + ratio * 5);
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }
    const grid = scene.add.graphics();
    grid.lineStyle(1, 0xF59E0B, 0.06);
    const slotSize = 90;
    for (let x = 0; x <= GAME_WIDTH; x += slotSize) { grid.lineBetween(x, 0, x, GAME_HEIGHT); }
    for (let y = 0; y <= GAME_HEIGHT; y += slotSize) { grid.lineBetween(0, y, GAME_WIDTH, y); }
    const particles = [];
    for (let i = 0; i < 25; i++) {
      const sz = Phaser.Math.FloatBetween(1.5, 4);
      const p = scene.add.circle(Phaser.Math.Between(20, GAME_WIDTH-20), Phaser.Math.Between(20, GAME_HEIGHT-20), sz, 0xF59E0B, Phaser.Math.FloatBetween(0.1, 0.35));
      scene.tweens.add({ targets: p, alpha: { from: p.alpha, to: Phaser.Math.FloatBetween(0.02, 0.1) }, scaleX: { from: 1, to: 1.5 }, scaleY: { from: 1, to: 1.5 }, duration: Phaser.Math.Between(1800, 4500), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 3000), ease: "Sine.easeInOut" });
      particles.push(p);
    }
    const vignette = scene.add.graphics();
    vignette.fillStyle(0x0A0A0A, 0.35); vignette.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    vignette.fillStyle(0x1a1008, 0.2); vignette.fillEllipse(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH*0.9, GAME_HEIGHT*0.9);
    vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);
    return { graphics, grid, particles, vignette };
  }


  /**
   * Quest: 석양 그래디언트 + 고대 석비 실루엣 + 빛 기둥 + 먼지 파티클 18개
   * @param {Phaser.Scene} scene
   */
  static createQuestBg(scene) {
    const graphics = scene.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(18 + Math.sin(ratio * Math.PI * 0.5) * 22 - ratio * 10);
      const g = Math.floor(14 + ratio * 8);
      const b = Math.floor(30 + ratio * 22);
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }
    const pillars = scene.add.graphics();
    pillars.fillStyle(0x0d1015, 0.35);
    [160, GAME_WIDTH / 2, GAME_WIDTH - 160].forEach((x) => {
      const h = Phaser.Math.Between(300, 500);
      const w = 40;
      pillars.fillRect(x - w/2, GAME_HEIGHT - h, w, h);
      pillars.fillTriangle(x - w/2 - 10, GAME_HEIGHT - h, x + w/2 + 10, GAME_HEIGHT - h, x, GAME_HEIGHT - h - 40);
    });
    const lightBeams = scene.add.graphics();
    [200, GAME_WIDTH / 2, GAME_WIDTH - 200].forEach((x, i) => {
      lightBeams.fillStyle(0xF59E0B, 0.03 + i * 0.01);
      lightBeams.fillRect(x - 15, 0, 30, GAME_HEIGHT);
    });
    scene.tweens.add({ targets: lightBeams, alpha: { from: 1, to: 0.4 }, duration: 3000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const particles = [];
    for (let i = 0; i < 18; i++) {
      const p = scene.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(GAME_HEIGHT/2, GAME_HEIGHT), Phaser.Math.FloatBetween(2, 6), 0xC4A35A, Phaser.Math.FloatBetween(0.05, 0.15));
      scene.tweens.add({ targets: p, x: p.x + Phaser.Math.Between(-60, 60), y: p.y - Phaser.Math.Between(100, 300), alpha: 0, duration: Phaser.Math.Between(4000, 8000), repeat: -1, delay: Phaser.Math.Between(0, 4000), ease: "Sine.easeOut" });
      particles.push(p);
    }
    return { graphics, pillars, lightBeams, particles };
  }


  /**
   * Settings: 청회색 그래디언트 + 육각형 격자 + 회전 기어 + 데이터 포인트 15개
   * @param {Phaser.Scene} scene
   */
  static createSettingsBg(scene) {
    const graphics = scene.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(10 + ratio * 8);
      const g = Math.floor(14 + ratio * 10);
      const b = Math.floor(28 + ratio * 16);
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }
    const hexGrid = scene.add.graphics();
    hexGrid.lineStyle(1, 0x3B82F6, 0.07);
    const hexSize = 50;
    const hexW = hexSize * 2;
    const hexH = Math.sqrt(3) * hexSize;
    for (let row = -1; row < GAME_HEIGHT / hexH + 1; row++) {
      for (let col = -1; col < GAME_WIDTH / hexW + 1; col++) {
        const offsetX = (row % 2 === 0) ? 0 : hexW * 0.75;
        const cx = col * hexW * 1.5 + offsetX;
        const cy = row * hexH;
        for (let i = 0; i < 6; i++) {
          const a1 = (Math.PI / 3) * i;
          const a2 = (Math.PI / 3) * (i + 1);
          hexGrid.lineBetween(cx + hexSize*Math.cos(a1), cy + hexSize*Math.sin(a1), cx + hexSize*Math.cos(a2), cy + hexSize*Math.sin(a2));
        }
      }
    }
    const gear = scene.add.graphics();
    gear.lineStyle(3, 0x64748B, 0.25);
    const gearX = GAME_WIDTH / 2, gearY = GAME_HEIGHT / 2;
    gear.strokeCircle(gearX, gearY, 120);
    gear.strokeCircle(gearX, gearY, 80);
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      gear.lineBetween(gearX + Math.cos(angle)*80, gearY + Math.sin(angle)*80, gearX + Math.cos(angle)*130, gearY + Math.sin(angle)*130);
    }
    scene.tweens.add({ targets: gear, rotation: Math.PI * 2, duration: 30000, repeat: -1, ease: "Linear" });
    const dataPoints = [];
    for (let i = 0; i < 15; i++) {
      const pt = scene.add.circle(Phaser.Math.Between(10, GAME_WIDTH-10), Phaser.Math.Between(10, GAME_HEIGHT-10), Phaser.Math.FloatBetween(2, 4), 0x3B82F6, Phaser.Math.FloatBetween(0.1, 0.3));
      scene.tweens.add({ targets: pt, alpha: { from: pt.alpha, to: 0.02 }, duration: Phaser.Math.Between(1000, 3000), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 2000), ease: "Sine.easeInOut" });
      dataPoints.push(pt);
    }
    return { graphics, hexGrid, gear, dataPoints };
  }


  /**
   * HeroList: 파란 결정체 그래디언트 + 결정 기둥 실루엣 + 빛줄기 + 파티클 20개
   * @param {Phaser.Scene} scene
   */
  static createHeroListBg(scene) {
    const graphics = scene.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(8 + ratio * 12);
      const g = Math.floor(12 + ratio * 10);
      const b = Math.floor(38 + ratio * 24);
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }
    const crystals = scene.add.graphics();
    crystals.fillStyle(0x1e2a5e, 0.3);
    [{ x: 80, w: 50, h: 200 }, { x: 180, w: 35, h: 150 }, { x: GAME_WIDTH-80, w: 50, h: 240 }, { x: GAME_WIDTH-180, w: 35, h: 180 }].forEach(({ x, w, h }) => {
      crystals.fillTriangle(x, GAME_HEIGHT, x - w/2, GAME_HEIGHT - h, x + w/2, GAME_HEIGHT - h);
      crystals.fillRect(x - w/2, GAME_HEIGHT - h, w, h/3);
    });
    const rays = scene.add.graphics();
    for (let i = 0; i < 5; i++) {
      rays.fillStyle(0x6366F1, 0.03);
      const x = (GAME_WIDTH / 6) * (i + 0.5);
      rays.fillTriangle(x, 0, x - 30, GAME_HEIGHT, x + 30, GAME_HEIGHT);
    }
    scene.tweens.add({ targets: rays, alpha: { from: 1, to: 0.3 }, duration: 4000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const particles = [];
    for (let i = 0; i < 20; i++) {
      const p = scene.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), Phaser.Math.FloatBetween(1.5, 4), Phaser.Math.RND.pick([0x6366F1, 0x818CF8, 0xA5B4FC]), Phaser.Math.FloatBetween(0.08, 0.25));
      scene.tweens.add({ targets: p, y: p.y - Phaser.Math.Between(80, 200), alpha: 0, duration: Phaser.Math.Between(3000, 7000), repeat: -1, delay: Phaser.Math.Between(0, 4000), ease: "Sine.easeOut" });
      particles.push(p);
    }
    return { graphics, crystals, rays, particles };
  }


  /**
   * HeroDetail: 극도로 어두운 배경 + 중앙 스포트라이트 글로우 + 별빛 22개
   * @param {Phaser.Scene} scene
   */
  static createHeroDetailBg(scene) {
    const graphics = scene.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const centerDist = Math.abs(ratio - 0.4);
      const r = Math.floor(5 + centerDist * 18);
      const g = Math.floor(5 + centerDist * 10);
      const b = Math.floor(12 + ratio * 20 + centerDist * 10);
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }
    const spotlight = scene.add.graphics();
    spotlight.fillStyle(COLORS.primary, 0.06);
    spotlight.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT * 0.4, 300);
    spotlight.fillStyle(COLORS.primary, 0.04);
    spotlight.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT * 0.4, 220);
    spotlight.fillStyle(0xffffff, 0.015);
    spotlight.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT * 0.4, 140);
    scene.tweens.add({ targets: spotlight, alpha: { from: 1, to: 0.6 }, scaleX: { from: 1, to: 1.05 }, scaleY: { from: 1, to: 1.05 }, duration: 3500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const stars = [];
    for (let i = 0; i < 22; i++) {
      const star = scene.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT * 0.6), Phaser.Math.FloatBetween(0.8, 2.5), 0xffffff, Phaser.Math.FloatBetween(0.1, 0.5));
      scene.tweens.add({ targets: star, alpha: { from: star.alpha, to: Phaser.Math.FloatBetween(0.02, 0.15) }, duration: Phaser.Math.Between(1500, 4000), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 3000), ease: "Sine.easeInOut" });
      stars.push(star);
    }
    const vignette = scene.add.graphics();
    vignette.fillStyle(0x000000, 0.5); vignette.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    vignette.fillStyle(0x000020, 0.3); vignette.fillEllipse(GAME_WIDTH/2, GAME_HEIGHT*0.5, GAME_WIDTH*0.85, GAME_HEIGHT*0.85);
    vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);
    return { graphics, spotlight, stars, vignette };
  }


  /**
   * PartyEdit: 네이비 그래디언트 + 전술 격자 + 나침반 로즈 (파티클 없음)
   * @param {Phaser.Scene} scene
   */
  static createPartyEditBg(scene) {
    const graphics = scene.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(8 + ratio * 6);
      const g = Math.floor(10 + ratio * 8);
      const b = Math.floor(30 + ratio * 20);
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }
    const tacticalGrid = scene.add.graphics();
    tacticalGrid.lineStyle(1, 0x334155, 0.2);
    const gridStep = 60;
    for (let x = 0; x <= GAME_WIDTH; x += gridStep) { tacticalGrid.lineBetween(x, 0, x, GAME_HEIGHT); }
    for (let y = 0; y <= GAME_HEIGHT; y += gridStep) { tacticalGrid.lineBetween(0, y, GAME_WIDTH, y); }
    const compass = scene.add.graphics();
    compass.lineStyle(1, 0x4A6FA5, 0.18);
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    compass.strokeCircle(cx, cy, 150);
    compass.strokeCircle(cx, cy, 100);
    compass.strokeCircle(cx, cy, 50);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) * i;
      compass.lineBetween(cx + Math.cos(angle)*50, cy + Math.sin(angle)*50, cx + Math.cos(angle)*160, cy + Math.sin(angle)*160);
    }
    compass.fillStyle(0x6366F1, 0.15);
    compass.fillTriangle(cx, cy - 150, cx - 12, cy - 100, cx + 12, cy - 100);
    return { graphics, tacticalGrid, compass };
  }


  /**
   * BattleResult: 승리=황금+파티클25개+방사빛 / 패배=붉은+잔재15개+비네팅
   * @param {Phaser.Scene} scene
   * @param {boolean} victory
   */
  static createBattleResultBg(scene, victory) {
    const graphics = scene.add.graphics();
    if (victory) {
      for (let y = 0; y < GAME_HEIGHT; y++) {
        const ratio = y / GAME_HEIGHT;
        const r = Math.floor(20 + ratio * 15);
        const g = Math.floor(18 + ratio * 12);
        const b = Math.floor(5 + ratio * 20);
        graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
        graphics.fillRect(0, y, GAME_WIDTH, 1);
      }
      const rays = scene.add.graphics();
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        rays.fillStyle(0xFFD700, 0.04);
        rays.fillTriangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH/2 + Math.cos(angle-0.15)*GAME_WIDTH, GAME_HEIGHT/2 + Math.sin(angle-0.15)*GAME_WIDTH, GAME_WIDTH/2 + Math.cos(angle+0.15)*GAME_WIDTH, GAME_HEIGHT/2 + Math.sin(angle+0.15)*GAME_WIDTH);
      }
      scene.tweens.add({ targets: rays, rotation: Math.PI * 2, duration: 20000, repeat: -1, ease: "Linear" });
      const particles = [];
      for (let i = 0; i < 25; i++) {
        const p = scene.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(GAME_HEIGHT, GAME_HEIGHT+100), Phaser.Math.FloatBetween(2, 6), Phaser.Math.RND.pick([0xFFD700, 0xFFA500, 0xFFEC8B]), Phaser.Math.FloatBetween(0.2, 0.6));
        scene.tweens.add({ targets: p, y: p.y - Phaser.Math.Between(400, 900), x: p.x + Phaser.Math.Between(-80, 80), alpha: 0, duration: Phaser.Math.Between(2500, 5000), repeat: -1, delay: Phaser.Math.Between(0, 3000), ease: "Cubic.easeOut" });
        particles.push(p);
      }
      return { graphics, rays, particles };
    } else {
      for (let y = 0; y < GAME_HEIGHT; y++) {
        const ratio = y / GAME_HEIGHT;
        const r = Math.floor(18 + ratio * 8);
        const g = Math.floor(8 + ratio * 4);
        const b = Math.floor(10 + ratio * 8);
        graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
        graphics.fillRect(0, y, GAME_WIDTH, 1);
      }
      const particles = [];
      for (let i = 0; i < 15; i++) {
        const p = scene.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(-50, GAME_HEIGHT/2), Phaser.Math.FloatBetween(2, 5), Phaser.Math.RND.pick([0x6B2121, 0x8B0000, 0x4a1010]), Phaser.Math.FloatBetween(0.1, 0.3));
        scene.tweens.add({ targets: p, y: p.y + Phaser.Math.Between(300, 700), x: p.x + Phaser.Math.Between(-40, 40), alpha: 0, duration: Phaser.Math.Between(3000, 7000), repeat: -1, delay: Phaser.Math.Between(0, 4000), ease: "Sine.easeIn" });
        particles.push(p);
      }
      const vignette = scene.add.graphics();
      vignette.fillStyle(0x1a0000, 0.5); vignette.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      vignette.fillStyle(0x2a0808, 0.3); vignette.fillEllipse(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH*0.9, GAME_HEIGHT*0.9);
      vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);
      return { graphics, particles, vignette };
    }
  }

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
