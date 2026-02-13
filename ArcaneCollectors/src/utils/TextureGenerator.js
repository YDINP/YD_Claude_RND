import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';

/**
 * TextureGenerator - 런타임 텍스처 생성 유틸리티
 *
 * PNG 파일 대신 Canvas API로 동적 텍스처 생성
 * PreloadScene에서 1회 호출, 메모리에 캐싱
 */
export class TextureGenerator {
  /**
   * 배경 텍스처 생성 (720×1280)
   * @param {Phaser.Scene} scene - Phaser 씬
   */
  static generateBackgrounds(scene) {
    // bg_main.png - MainMenu 배경 (보라+남색 그래디언트, 별)
    const mainBg = document.createElement('canvas');
    mainBg.width = GAME_WIDTH;
    mainBg.height = GAME_HEIGHT;
    const mainCtx = mainBg.getContext('2d');

    const mainGradient = mainCtx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    mainGradient.addColorStop(0, '#1E1B4B'); // 진한 보라
    mainGradient.addColorStop(0.5, '#1E293B'); // 중간 남색
    mainGradient.addColorStop(1, '#0F172A'); // 짙은 파랑
    mainCtx.fillStyle = mainGradient;
    mainCtx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 반짝이는 별
    mainCtx.fillStyle = 'rgba(99, 102, 241, 0.6)';
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * GAME_HEIGHT;
      const size = Math.random() * 2 + 1;
      mainCtx.beginPath();
      mainCtx.arc(x, y, size, 0, Math.PI * 2);
      mainCtx.fill();
    }

    scene.textures.addCanvas('bg_main', mainBg);

    // bg_battle.png - Battle 배경 (붉은빛+검정, 균열/불꽃)
    const battleBg = document.createElement('canvas');
    battleBg.width = GAME_WIDTH;
    battleBg.height = GAME_HEIGHT;
    const battleCtx = battleBg.getContext('2d');

    const battleGradient = battleCtx.createRadialGradient(
      GAME_WIDTH / 2, GAME_HEIGHT * 0.3, 0,
      GAME_WIDTH / 2, GAME_HEIGHT * 0.3, GAME_HEIGHT * 0.7
    );
    battleGradient.addColorStop(0, '#450A0A'); // 진한 빨강
    battleGradient.addColorStop(0.6, '#1C1917'); // 검정
    battleGradient.addColorStop(1, '#0A0A0A'); // 완전 검정
    battleCtx.fillStyle = battleGradient;
    battleCtx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 균열 느낌 (지그재그 라인)
    battleCtx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
    battleCtx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      battleCtx.beginPath();
      let x = Math.random() * GAME_WIDTH;
      let y = Math.random() * GAME_HEIGHT * 0.5;
      battleCtx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (Math.random() - 0.5) * 100;
        y += Math.random() * 200;
        battleCtx.lineTo(x, y);
      }
      battleCtx.stroke();
    }

    scene.textures.addCanvas('bg_battle', battleBg);

    // bg_gacha.png - Gacha 배경 (황금+보라 방사형, 마법진)
    const gachaBg = document.createElement('canvas');
    gachaBg.width = GAME_WIDTH;
    gachaBg.height = GAME_HEIGHT;
    const gachaCtx = gachaBg.getContext('2d');

    const gachaGradient = gachaCtx.createRadialGradient(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, 0,
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.6
    );
    gachaGradient.addColorStop(0, '#F59E0B'); // 황금
    gachaGradient.addColorStop(0.4, '#8B5CF6'); // 보라
    gachaGradient.addColorStop(1, '#1E1B4B'); // 진한 보라
    gachaCtx.fillStyle = gachaGradient;
    gachaCtx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 마법진 원
    gachaCtx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
    gachaCtx.lineWidth = 2;
    for (let r = 100; r < 600; r += 150) {
      gachaCtx.beginPath();
      gachaCtx.arc(GAME_WIDTH / 2, GAME_HEIGHT / 2, r, 0, Math.PI * 2);
      gachaCtx.stroke();
    }

    scene.textures.addCanvas('bg_gacha', gachaBg);

    // bg_stage.png - StageSelect 배경 (청록+파랑, 산 실루엣)
    const stageBg = document.createElement('canvas');
    stageBg.width = GAME_WIDTH;
    stageBg.height = GAME_HEIGHT;
    const stageCtx = stageBg.getContext('2d');

    const stageGradient = stageCtx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    stageGradient.addColorStop(0, '#0C4A6E'); // 진한 파랑
    stageGradient.addColorStop(1, '#164E63'); // 청록
    stageCtx.fillStyle = stageGradient;
    stageCtx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 산 실루엣 (3개 레이어)
    const mountainLayers = [
      { color: 'rgba(15, 23, 42, 0.7)', baseHeight: GAME_HEIGHT * 0.7, points: 5 },
      { color: 'rgba(30, 41, 59, 0.5)', baseHeight: GAME_HEIGHT * 0.8, points: 7 },
      { color: 'rgba(51, 65, 85, 0.3)', baseHeight: GAME_HEIGHT * 0.9, points: 9 }
    ];

    mountainLayers.forEach(layer => {
      stageCtx.fillStyle = layer.color;
      stageCtx.beginPath();
      stageCtx.moveTo(0, GAME_HEIGHT);
      for (let i = 0; i <= layer.points; i++) {
        const x = (GAME_WIDTH / layer.points) * i;
        const peakHeight = layer.baseHeight - Math.random() * 200;
        stageCtx.lineTo(x, peakHeight);
      }
      stageCtx.lineTo(GAME_WIDTH, GAME_HEIGHT);
      stageCtx.closePath();
      stageCtx.fill();
    });

    scene.textures.addCanvas('bg_stage', stageBg);

    // bg_tower.png - Tower 배경 (회색+청색, 벽돌 패턴)
    const towerBg = document.createElement('canvas');
    towerBg.width = GAME_WIDTH;
    towerBg.height = GAME_HEIGHT;
    const towerCtx = towerBg.getContext('2d');

    const towerGradient = towerCtx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    towerGradient.addColorStop(0, '#1E293B'); // 암청색
    towerGradient.addColorStop(1, '#334155'); // 회색
    towerCtx.fillStyle = towerGradient;
    towerCtx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 벽돌 패턴
    towerCtx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
    towerCtx.lineWidth = 1;
    const brickWidth = 80;
    const brickHeight = 40;
    for (let y = 0; y < GAME_HEIGHT; y += brickHeight) {
      const offset = (Math.floor(y / brickHeight) % 2) * (brickWidth / 2);
      for (let x = -brickWidth; x < GAME_WIDTH + brickWidth; x += brickWidth) {
        towerCtx.strokeRect(x + offset, y, brickWidth, brickHeight);
      }
    }

    scene.textures.addCanvas('bg_tower', towerBg);
  }

  /**
   * UI 아이콘 텍스처 생성 (48×48 또는 64×64)
   * @param {Phaser.Scene} scene - Phaser 씬
   */
  static generateIcons(scene) {
    const iconSize = 48;

    // icon_home.png - 집 모양
    this._createIcon(scene, 'icon_home', iconSize, (ctx, size) => {
      ctx.fillStyle = '#6366F1';
      ctx.beginPath();
      ctx.moveTo(size / 2, size * 0.25);
      ctx.lineTo(size * 0.85, size * 0.5);
      ctx.lineTo(size * 0.85, size * 0.85);
      ctx.lineTo(size * 0.15, size * 0.85);
      ctx.lineTo(size * 0.15, size * 0.5);
      ctx.closePath();
      ctx.fill();

      // 문
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(size * 0.4, size * 0.6, size * 0.2, size * 0.25);
    });

    // icon_sword.png - 교차 검
    this._createIcon(scene, 'icon_sword', iconSize, (ctx, size) => {
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';

      // 검 1
      ctx.beginPath();
      ctx.moveTo(size * 0.3, size * 0.3);
      ctx.lineTo(size * 0.7, size * 0.7);
      ctx.stroke();

      // 검 2
      ctx.beginPath();
      ctx.moveTo(size * 0.7, size * 0.3);
      ctx.lineTo(size * 0.3, size * 0.7);
      ctx.stroke();
    });

    // icon_bag.png - 배낭
    this._createIcon(scene, 'icon_bag', iconSize, (ctx, size) => {
      ctx.fillStyle = '#8B5CF6';
      ctx.beginPath();
      ctx.moveTo(size * 0.25, size * 0.35);
      ctx.lineTo(size * 0.2, size * 0.8);
      ctx.lineTo(size * 0.8, size * 0.8);
      ctx.lineTo(size * 0.75, size * 0.35);
      ctx.closePath();
      ctx.fill();

      // 끈
      ctx.strokeStyle = '#A78BFA';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(size * 0.35, size * 0.35);
      ctx.quadraticCurveTo(size * 0.5, size * 0.2, size * 0.65, size * 0.35);
      ctx.stroke();
    });

    // icon_dice.png - 주사위/크리스탈
    this._createIcon(scene, 'icon_dice', iconSize, (ctx, size) => {
      ctx.fillStyle = '#EC4899';
      ctx.beginPath();
      ctx.moveTo(size / 2, size * 0.2);
      ctx.lineTo(size * 0.8, size * 0.5);
      ctx.lineTo(size / 2, size * 0.8);
      ctx.lineTo(size * 0.2, size * 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#F472B6';
      ctx.beginPath();
      ctx.moveTo(size / 2, size * 0.2);
      ctx.lineTo(size / 2, size * 0.8);
      ctx.lineTo(size * 0.2, size * 0.5);
      ctx.closePath();
      ctx.fill();
    });

    // icon_menu.png - 햄버거 메뉴
    this._createIcon(scene, 'icon_menu', iconSize, (ctx, size) => {
      ctx.fillStyle = '#64748B';
      ctx.fillRect(size * 0.2, size * 0.3, size * 0.6, size * 0.08);
      ctx.fillRect(size * 0.2, size * 0.46, size * 0.6, size * 0.08);
      ctx.fillRect(size * 0.2, size * 0.62, size * 0.6, size * 0.08);
    });

    // icon_gem.png - 다이아몬드 (이미 PreloadScene에 있지만 재정의)
    this._createIcon(scene, 'icon_gem', iconSize, (ctx, size) => {
      ctx.fillStyle = '#EC4899';
      ctx.beginPath();
      ctx.moveTo(size / 2, size * 0.15);
      ctx.lineTo(size * 0.85, size * 0.4);
      ctx.lineTo(size / 2, size * 0.85);
      ctx.lineTo(size * 0.15, size * 0.4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#F472B6';
      ctx.beginPath();
      ctx.moveTo(size / 2, size * 0.15);
      ctx.lineTo(size / 2, size * 0.85);
      ctx.lineTo(size * 0.15, size * 0.4);
      ctx.closePath();
      ctx.fill();
    });

    // icon_gold.png - 동전 (이미 PreloadScene에 있지만 재정의)
    this._createIcon(scene, 'icon_gold', iconSize, (ctx, size) => {
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FCD34D';
      ctx.beginPath();
      ctx.arc(size * 0.45, size * 0.45, size * 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#F59E0B';
      ctx.font = `bold ${size * 0.4}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G', size / 2, size / 2);
    });

    // icon_energy.png - 번개
    this._createIcon(scene, 'icon_energy', iconSize, (ctx, size) => {
      ctx.fillStyle = '#FBBF24';
      ctx.beginPath();
      ctx.moveTo(size * 0.55, size * 0.15);
      ctx.lineTo(size * 0.35, size * 0.5);
      ctx.lineTo(size * 0.5, size * 0.5);
      ctx.lineTo(size * 0.4, size * 0.85);
      ctx.lineTo(size * 0.65, size * 0.45);
      ctx.lineTo(size * 0.5, size * 0.45);
      ctx.closePath();
      ctx.fill();
    });

    // icon_warrior.png - 방패
    this._createIcon(scene, 'icon_warrior', iconSize, (ctx, size) => {
      ctx.fillStyle = '#3B82F6';
      ctx.beginPath();
      ctx.moveTo(size / 2, size * 0.15);
      ctx.quadraticCurveTo(size * 0.85, size * 0.3, size * 0.85, size * 0.6);
      ctx.quadraticCurveTo(size * 0.85, size * 0.8, size / 2, size * 0.9);
      ctx.quadraticCurveTo(size * 0.15, size * 0.8, size * 0.15, size * 0.6);
      ctx.quadraticCurveTo(size * 0.15, size * 0.3, size / 2, size * 0.15);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#60A5FA';
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    // icon_mage.png - 지팡이/마법진
    this._createIcon(scene, 'icon_mage', iconSize, (ctx, size) => {
      ctx.strokeStyle = '#A855F7';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';

      // 지팡이
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.25);
      ctx.lineTo(size * 0.5, size * 0.85);
      ctx.stroke();

      // 마법구
      ctx.fillStyle = '#C084FC';
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.22, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
    });

    // icon_healer.png - 십자/하트
    this._createIcon(scene, 'icon_healer', iconSize, (ctx, size) => {
      ctx.fillStyle = '#10B981';
      // 십자
      ctx.fillRect(size * 0.42, size * 0.25, size * 0.16, size * 0.5);
      ctx.fillRect(size * 0.25, size * 0.42, size * 0.5, size * 0.16);
    });

    // icon_archer.png - 활/화살
    this._createIcon(scene, 'icon_archer', iconSize, (ctx, size) => {
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';

      // 활
      ctx.beginPath();
      ctx.moveTo(size * 0.3, size * 0.3);
      ctx.quadraticCurveTo(size * 0.2, size * 0.5, size * 0.3, size * 0.7);
      ctx.stroke();

      // 화살
      ctx.beginPath();
      ctx.moveTo(size * 0.4, size * 0.5);
      ctx.lineTo(size * 0.75, size * 0.5);
      ctx.stroke();

      // 화살촉
      ctx.beginPath();
      ctx.moveTo(size * 0.75, size * 0.5);
      ctx.lineTo(size * 0.68, size * 0.45);
      ctx.moveTo(size * 0.75, size * 0.5);
      ctx.lineTo(size * 0.68, size * 0.55);
      ctx.stroke();
    });

    // icon_quest.png - 두루마리
    this._createIcon(scene, 'icon_quest', iconSize, (ctx, size) => {
      ctx.fillStyle = '#D97706';
      ctx.fillRect(size * 0.25, size * 0.2, size * 0.5, size * 0.6);

      ctx.fillStyle = '#92400E';
      ctx.fillRect(size * 0.25, size * 0.18, size * 0.5, size * 0.08);
      ctx.fillRect(size * 0.25, size * 0.74, size * 0.5, size * 0.08);
    });

    // icon_tower.png - 탑 실루엣
    this._createIcon(scene, 'icon_tower', iconSize, (ctx, size) => {
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.moveTo(size * 0.35, size * 0.85);
      ctx.lineTo(size * 0.4, size * 0.4);
      ctx.lineTo(size * 0.5, size * 0.15);
      ctx.lineTo(size * 0.6, size * 0.4);
      ctx.lineTo(size * 0.65, size * 0.85);
      ctx.closePath();
      ctx.fill();
    });

    // icon_settings.png - 톱니바퀴
    this._createIcon(scene, 'icon_settings', iconSize, (ctx, size) => {
      ctx.fillStyle = '#64748B';
      const centerX = size / 2;
      const centerY = size / 2;
      const teeth = 8;
      const outerRadius = size * 0.4;
      const innerRadius = size * 0.25;

      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const angle1 = (Math.PI * 2 * i) / teeth - Math.PI / 16;
        const angle2 = (Math.PI * 2 * i) / teeth + Math.PI / 16;
        const angle3 = (Math.PI * 2 * (i + 0.5)) / teeth;

        ctx.lineTo(centerX + Math.cos(angle1) * outerRadius, centerY + Math.sin(angle1) * outerRadius);
        ctx.lineTo(centerX + Math.cos(angle2) * outerRadius, centerY + Math.sin(angle2) * outerRadius);
        ctx.lineTo(centerX + Math.cos(angle3) * innerRadius, centerY + Math.sin(angle3) * innerRadius);
      }
      ctx.closePath();
      ctx.fill();

      // 중앙 구멍
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.arc(centerX, centerY, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /**
   * 캐릭터 및 프레임 텍스처 생성
   * @param {Phaser.Scene} scene - Phaser 씬
   */
  static generateCharacterAssets(scene) {
    // hero_warrior.png - 워리어 실루엣 (128×128)
    this._createCharacter(scene, 'hero_warrior', 128, '#3B82F6', (ctx, size) => {
      // 방패 모양
      ctx.beginPath();
      ctx.arc(size / 2, size * 0.45, size * 0.25, 0, Math.PI * 2);
      ctx.fill();
    });

    // hero_mage.png - 메이지 실루엣 (128×128)
    this._createCharacter(scene, 'hero_mage', 128, '#A855F7', (ctx, size) => {
      // 지팡이 모양
      ctx.fillRect(size * 0.47, size * 0.35, size * 0.06, size * 0.4);
      ctx.beginPath();
      ctx.arc(size / 2, size * 0.32, size * 0.08, 0, Math.PI * 2);
      ctx.fill();
    });

    // hero_healer.png - 힐러 실루엣 (128×128)
    this._createCharacter(scene, 'hero_healer', 128, '#10B981', (ctx, size) => {
      // 십자 모양
      ctx.fillRect(size * 0.45, size * 0.3, size * 0.1, size * 0.4);
      ctx.fillRect(size * 0.3, size * 0.45, size * 0.4, size * 0.1);
    });

    // hero_archer.png - 아처 실루엣 (128×128)
    this._createCharacter(scene, 'hero_archer', 128, '#F59E0B', (ctx, size) => {
      // 활 모양
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(size * 0.35, size * 0.35);
      ctx.quadraticCurveTo(size * 0.25, size * 0.5, size * 0.35, size * 0.65);
      ctx.stroke();
    });

    // 등급 프레임 (140×140)
    this._createFrame(scene, 'frame_N', 140, 0x9CA3AF);
    this._createFrame(scene, 'frame_R', 140, 0x3B82F6);
    this._createFrame(scene, 'frame_SR', 140, 0xA855F7);
    this._createFrame(scene, 'frame_SSR', 140, 0xF59E0B);
    this._createFrame(scene, 'frame_UR', 140, 0xEC4899); // 무지개 대신 핑크

    // 적 텍스처
    this._createEnemy(scene, 'enemy_slime', 100, '#10B981'); // 슬라임 (초록)
    this._createEnemy(scene, 'enemy_golem', 100, '#78716C'); // 골렘 (갈색)
    this._createEnemy(scene, 'enemy_boss', 120, '#DC2626'); // 보스 (빨강)
  }

  /**
   * 내부 헬퍼: 아이콘 생성
   */
  static _createIcon(scene, key, size, drawFn) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, size);
    scene.textures.addCanvas(key, canvas);
  }

  /**
   * 내부 헬퍼: 캐릭터 실루엣 생성
   */
  static _createCharacter(scene, key, size, color, shapeFn) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 배경 원형
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, '#1E293B');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // 캐릭터 형태
    ctx.fillStyle = '#1E293B';
    shapeFn(ctx, size);

    scene.textures.addCanvas(key, canvas);
  }

  /**
   * 내부 헬퍼: 프레임 생성
   */
  static _createFrame(scene, key, size, color) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 외곽 테두리
    ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, size - 6, size - 6);

    // 내부 그라데이션
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, `#${color.toString(16).padStart(6, '0')}`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, size - 20, size - 20);

    scene.textures.addCanvas(key, canvas);
  }

  /**
   * 내부 헬퍼: 적 생성
   */
  static _createEnemy(scene, key, size, color) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 적 모양 (원형)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // 눈 (빨간색)
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(size * 0.38, size * 0.42, size * 0.06, 0, Math.PI * 2);
    ctx.arc(size * 0.62, size * 0.42, size * 0.06, 0, Math.PI * 2);
    ctx.fill();

    scene.textures.addCanvas(key, canvas);
  }
}
