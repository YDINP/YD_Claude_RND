import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY } from '../config/gameConfig.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
import { getAllCharacters } from '../data/index.js';
import { SaveManager } from '../systems/SaveManager.js';
import characterRenderer from '../renderers/CharacterRenderer.js';
import uiRenderer from '../renderers/UIRenderer.js';
import { TextureGenerator } from '../utils/TextureGenerator.js';

/**
 * PreloadScene - 에셋 프리로드 씬
 *
 * Phase별 로딩:
 *   Phase 1: 기본 UI 플레이스홀더 (별, 아이콘, 재화)
 *   Phase 2: 캐릭터 플레이스홀더 (레거시 15종 + HeroAssetLoader 91명)
 *   Phase 3: 전투 에셋 (적, 이펙트, 배경)
 *   Phase 4: 가차 연출 에셋 (마법진)
 *   Phase 5: 렌더러 에셋 (에셋 모드 시 이미지 파일 로드)
 *   Phase 6: 최종 검증
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
    this._loadPhase = 0;
    this._totalPhases = 6;
  }

  preload() {
    // 로딩 UI 생성
    this.createLoadingBar();

    // Phase 1~4: 코드 기반 플레이스홀더 생성 (동기)
    this.loadPhase1_UIPlaceholders();
    this.loadPhase2_CharacterPlaceholders();
    this.loadPhase3_BattleAssets();
    this.loadPhase4_GachaAssets();

    // Phase 5: 렌더러 에셋 (비동기 이미지 로드, 에셋 모드 시)
    this.loadPhase5_RendererAssets();
  }

  // ============================================
  // Phase 1: 기본 UI 플레이스홀더
  // ============================================
  loadPhase1_UIPlaceholders() {
    this._updatePhaseText('UI 요소 준비 중...');

    // ART-1.1: 배경 텍스처 생성
    TextureGenerator.generateBackgrounds(this);

    // ART-1.2: UI 아이콘 텍스처 생성
    TextureGenerator.generateIcons(this);

    // ART-1.3: 캐릭터 및 프레임 텍스처 생성
    TextureGenerator.generateCharacterAssets(this);

    // 기존 플레이스홀더 유지 (폴백용)
    // Hero placeholder (64x64)
    const heroCanvas = document.createElement('canvas');
    heroCanvas.width = 64;
    heroCanvas.height = 64;
    const heroCtx = heroCanvas.getContext('2d');

    heroCtx.fillStyle = '#6366F1';
    heroCtx.beginPath();
    heroCtx.arc(32, 32, 28, 0, Math.PI * 2);
    heroCtx.fill();

    heroCtx.fillStyle = '#F8FAFC';
    heroCtx.beginPath();
    heroCtx.arc(24, 26, 4, 0, Math.PI * 2);
    heroCtx.arc(40, 26, 4, 0, Math.PI * 2);
    heroCtx.fill();

    heroCtx.strokeStyle = '#F8FAFC';
    heroCtx.lineWidth = 2;
    heroCtx.beginPath();
    heroCtx.arc(32, 32, 12, 0.2 * Math.PI, 0.8 * Math.PI);
    heroCtx.stroke();

    this.textures.addCanvas('hero_placeholder', heroCanvas);

    // Gem icon (24x24) - 작은 버전 유지
    const gemCanvas = document.createElement('canvas');
    gemCanvas.width = 24;
    gemCanvas.height = 24;
    const gemCtx = gemCanvas.getContext('2d');

    gemCtx.fillStyle = '#EC4899';
    gemCtx.beginPath();
    gemCtx.moveTo(12, 2);
    gemCtx.lineTo(22, 10);
    gemCtx.lineTo(12, 22);
    gemCtx.lineTo(2, 10);
    gemCtx.closePath();
    gemCtx.fill();

    gemCtx.fillStyle = '#F472B6';
    gemCtx.beginPath();
    gemCtx.moveTo(12, 2);
    gemCtx.lineTo(12, 22);
    gemCtx.lineTo(2, 10);
    gemCtx.closePath();
    gemCtx.fill();

    this.textures.addCanvas('gem', gemCanvas);

    // Gold icon (24x24) - 작은 버전 유지
    const goldCanvas = document.createElement('canvas');
    goldCanvas.width = 24;
    goldCanvas.height = 24;
    const goldCtx = goldCanvas.getContext('2d');

    goldCtx.fillStyle = '#F59E0B';
    goldCtx.beginPath();
    goldCtx.arc(12, 12, 10, 0, Math.PI * 2);
    goldCtx.fill();

    goldCtx.fillStyle = '#FCD34D';
    goldCtx.beginPath();
    goldCtx.arc(10, 10, 8, 0, Math.PI * 2);
    goldCtx.fill();

    goldCtx.fillStyle = '#F59E0B';
    goldCtx.font = 'bold 12px Arial';
    goldCtx.textAlign = 'center';
    goldCtx.textBaseline = 'middle';
    goldCtx.fillText('G', 12, 13);

    this.textures.addCanvas('gold', goldCanvas);

    // Star icon (16x16)
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 16;
    starCanvas.height = 16;
    const starCtx = starCanvas.getContext('2d');

    starCtx.fillStyle = '#FBBF24';
    this.drawStar(starCtx, 8, 8, 5, 7, 3);

    this.textures.addCanvas('star', starCanvas);

    // Empty star
    const emptyStarCanvas = document.createElement('canvas');
    emptyStarCanvas.width = 16;
    emptyStarCanvas.height = 16;
    const emptyStarCtx = emptyStarCanvas.getContext('2d');

    emptyStarCtx.fillStyle = '#4B5563';
    this.drawStar(emptyStarCtx, 8, 8, 5, 7, 3);

    this.textures.addCanvas('star_empty', emptyStarCanvas);

    this._loadPhase = 1;
  }

  // ============================================
  // Phase 2: 캐릭터 플레이스홀더
  // ============================================
  loadPhase2_CharacterPlaceholders() {
    this._updatePhaseText('캐릭터 로드 중...');

    // 레거시 15종 캐릭터 포트레이트
    const rarities = [
      { name: 'ssr', color: '#F59E0B', borderColor: '#FCD34D' },
      { name: 'sr', color: '#A855F7', borderColor: '#C084FC' },
      { name: 'r', color: '#3B82F6', borderColor: '#60A5FA' },
      { name: 'n', color: '#6B7280', borderColor: '#9CA3AF' }
    ];

    const characterNames = [
      'arcana', 'leonhart', 'selene',
      'rose', 'kai', 'luna', 'noir', 'aria',
      'finn', 'mira', 'theo', 'eva', 'rex', 'ivy', 'max'
    ];

    const rarityMap = {
      'arcana': 'ssr', 'leonhart': 'ssr', 'selene': 'ssr',
      'rose': 'sr', 'kai': 'sr', 'luna': 'sr', 'noir': 'sr', 'aria': 'sr',
      'finn': 'r', 'mira': 'r', 'theo': 'r', 'eva': 'r', 'rex': 'r', 'ivy': 'r', 'max': 'r'
    };

    characterNames.forEach((name) => {
      const rarity = rarities.find(r => r.name === rarityMap[name]);

      // Portrait (80x80)
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = rarity.borderColor;
      ctx.fillRect(0, 0, 80, 80);
      ctx.fillStyle = rarity.color;
      ctx.fillRect(4, 4, 72, 72);

      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.arc(40, 35, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(25, 50, 30, 26);

      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.charAt(0).toUpperCase(), 40, 35);

      this.textures.addCanvas(`char_${name}`, canvas);

      // Full illustration (200x300)
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = 200;
      fullCanvas.height = 300;
      const fullCtx = fullCanvas.getContext('2d');

      const gradient = fullCtx.createLinearGradient(0, 0, 0, 300);
      gradient.addColorStop(0, rarity.color);
      gradient.addColorStop(1, '#1E293B');
      fullCtx.fillStyle = gradient;
      fullCtx.fillRect(0, 0, 200, 300);

      fullCtx.fillStyle = '#0F172A';
      fullCtx.beginPath();
      fullCtx.arc(100, 80, 40, 0, Math.PI * 2);
      fullCtx.fill();
      fullCtx.fillRect(60, 110, 80, 150);

      fullCtx.fillStyle = '#F8FAFC';
      fullCtx.font = 'bold 48px Arial';
      fullCtx.textAlign = 'center';
      fullCtx.fillText(name.charAt(0).toUpperCase(), 100, 90);

      fullCtx.fillStyle = rarity.borderColor;
      fullCtx.font = 'bold 16px Arial';
      fullCtx.fillText(rarity.name.toUpperCase(), 100, 280);

      this.textures.addCanvas(`char_full_${name}`, fullCanvas);
    });

    // H-2: 91명 전체 캐릭터 — 실제 이미지 로드 (실패 시 플레이스홀더 폴백)
    try {
      const characters = getAllCharacters();
      HeroAssetLoader.loadImages(this, characters, 'assets/characters/portraits/');
    } catch (e) {
      console.warn('HeroAssetLoader: Failed to load hero images, using placeholders', e);
      try {
        const characters = getAllCharacters();
        HeroAssetLoader.generatePlaceholders(this, characters);
      } catch (e2) {
        console.warn('HeroAssetLoader: Failed to generate placeholders', e2);
      }
    }

    this._loadPhase = 2;
  }

  // ============================================
  // Phase 3: 전투 에셋
  // ============================================
  loadPhase3_BattleAssets() {
    this._updatePhaseText('전투 데이터 초기화...');

    // Enemy placeholders
    for (let i = 1; i <= 10; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.moveTo(18, 22);
      ctx.lineTo(28, 28);
      ctx.lineTo(18, 28);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(46, 22);
      ctx.lineTo(36, 28);
      ctx.lineTo(46, 28);
      ctx.fill();

      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(32, 48, 10, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();

      this.textures.addCanvas(`enemy_${i}`, canvas);
    }

    // Battle effect placeholders
    const effectCanvas = document.createElement('canvas');
    effectCanvas.width = 64;
    effectCanvas.height = 64;
    const effectCtx = effectCanvas.getContext('2d');

    effectCtx.fillStyle = '#FBBF24';
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const ex = 32 + Math.cos(angle) * 20;
      const ey = 32 + Math.sin(angle) * 20;
      effectCtx.beginPath();
      effectCtx.arc(ex, ey, 6, 0, Math.PI * 2);
      effectCtx.fill();
    }

    this.textures.addCanvas('effect_hit', effectCanvas);

    // Background for stages
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 480;
    bgCanvas.height = 854;
    const bgCtx = bgCanvas.getContext('2d');

    const bgGradient = bgCtx.createLinearGradient(0, 0, 0, 854);
    bgGradient.addColorStop(0, '#1E293B');
    bgGradient.addColorStop(1, '#0F172A');
    bgCtx.fillStyle = bgGradient;
    bgCtx.fillRect(0, 0, 480, 854);

    bgCtx.fillStyle = 'rgba(99, 102, 241, 0.1)';
    for (let i = 0; i < 20; i++) {
      const bx = Math.random() * 480;
      const by = Math.random() * 854;
      const size = Math.random() * 100 + 50;
      bgCtx.beginPath();
      bgCtx.arc(bx, by, size, 0, Math.PI * 2);
      bgCtx.fill();
    }

    this.textures.addCanvas('battle_bg', bgCanvas);

    this._loadPhase = 3;
  }

  // ============================================
  // Phase 4: 가차 연출 에셋
  // ============================================
  loadPhase4_GachaAssets() {
    this._updatePhaseText('연출 에셋 준비...');

    // Magic circle for gacha
    const circleCanvas = document.createElement('canvas');
    circleCanvas.width = 256;
    circleCanvas.height = 256;
    const circleCtx = circleCanvas.getContext('2d');

    circleCtx.strokeStyle = '#6366F1';
    circleCtx.lineWidth = 2;

    circleCtx.beginPath();
    circleCtx.arc(128, 128, 120, 0, Math.PI * 2);
    circleCtx.stroke();

    circleCtx.beginPath();
    circleCtx.arc(128, 128, 90, 0, Math.PI * 2);
    circleCtx.stroke();

    circleCtx.beginPath();
    circleCtx.arc(128, 128, 60, 0, Math.PI * 2);
    circleCtx.stroke();

    circleCtx.fillStyle = '#6366F1';
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const cx = 128 + Math.cos(angle) * 105;
      const cy = 128 + Math.sin(angle) * 105;
      circleCtx.beginPath();
      circleCtx.arc(cx, cy, 8, 0, Math.PI * 2);
      circleCtx.fill();
    }

    circleCtx.strokeStyle = '#EC4899';
    circleCtx.lineWidth = 2;
    this.drawHexagram(circleCtx, 128, 128, 70);

    this.textures.addCanvas('magic_circle', circleCanvas);

    this._loadPhase = 4;
  }

  // ============================================
  // Phase 5: 렌더러 에셋 (조건부 이미지 로드)
  // ============================================
  loadPhase5_RendererAssets() {
    this._updatePhaseText('추가 에셋 확인...');

    // 에셋 모드가 활성화되어 있을 때만 이미지 파일 로드 시도
    // 현재는 기본적으로 코드 렌더링 모드이므로 스킵
    if (characterRenderer.useAssets) {
      try {
        // RES-ABS-4: 파티 영웅만 초기 로드 (전체 91명 아님)
        const allCharacters = getAllCharacters();
        const partyIds = SaveManager.getParty() || [];
        const partyCharacters = allCharacters.filter(c => partyIds.includes(c.id));

        characterRenderer.preloadAssets(this, partyCharacters, { types: ['thumbnail', 'portrait'] });
      } catch (e) {
        console.warn('[PreloadScene] Character asset preload skipped:', e);
      }
    }

    if (uiRenderer.useAssets) {
      // RES-ABS-4: 기본 아이콘만 초기 로드 (currency, stats)
      uiRenderer.preloadAssets(this, { icons: ['currency', 'stats'] });
    }

    this._loadPhase = 5;
  }

  // ============================================
  // Phase 6: 최종 검증 (create에서 수행)
  // ============================================
  loadPhase6_Finalize() {
    this._updatePhaseText('완료!');
    this._loadPhase = 6;
  }

  // ============================================
  // 유틸리티: 별/헥사그램 그리기
  // ============================================

  drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);

    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }

    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
  }

  drawHexagram(ctx, cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2;
      const x = cx + Math.cos(angle) * size;
      const y = cy + Math.sin(angle) * size;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI * 2 * i) / 3 + Math.PI / 2;
      const x = cx + Math.cos(angle) * size;
      const y = cy + Math.sin(angle) * size;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // ============================================
  // 로딩 바 UI
  // ============================================

  createLoadingBar() {
    // H-9.3: 마법진 회전 + 진행바 개선
    this.cameras.main.fadeIn(400);

    // 배경
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0a1a);

    // H-9.3: 마법진 회전 아이콘
    const magicY = GAME_HEIGHT * 0.38;

    // 외곽 링 (회전)
    this.outerRing = this.add.circle(GAME_WIDTH / 2, magicY, 60, 0x000000, 0);
    this.outerRing.setStrokeStyle(2, 0x6366f1, 0.6);

    // 내부 링 (역회전)
    this.innerRing = this.add.circle(GAME_WIDTH / 2, magicY, 40, 0x000000, 0);
    this.innerRing.setStrokeStyle(1.5, 0xEC4899, 0.4);

    // 장식 도트 (외곽 링 위)
    this.magicDots = [];
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const dotX = GAME_WIDTH / 2 + Math.cos(angle) * 60;
      const dotY = magicY + Math.sin(angle) * 60;
      const dot = this.add.circle(dotX, dotY, 3, 0x6366f1, 0.7);
      this.magicDots.push({ dot, baseAngle: angle });
    }

    // 중앙 글로우
    const glow = this.add.circle(GAME_WIDTH / 2, magicY, 15, 0x6366f1, 0.2);
    this.tweens.add({
      targets: glow,
      scaleX: 1.5, scaleY: 1.5,
      alpha: 0.1,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 회전 트윈
    this.tweens.add({
      targets: this.outerRing,
      angle: 360,
      duration: 3000,
      repeat: -1,
      ease: 'Linear'
    });

    this.tweens.add({
      targets: this.innerRing,
      angle: -360,
      duration: 2000,
      repeat: -1,
      ease: 'Linear'
    });

    // 도트 회전 (타이머)
    this._dotAngleOffset = 0;
    this.time.addEvent({
      delay: 30,
      callback: () => {
        this._dotAngleOffset += 0.02;
        this.magicDots.forEach(({ dot, baseAngle }) => {
          const angle = baseAngle + this._dotAngleOffset;
          dot.setPosition(
            GAME_WIDTH / 2 + Math.cos(angle) * 60,
            magicY + Math.sin(angle) * 60
          );
        });
      },
      loop: true
    });

    // 로딩 텍스트
    const barY = GAME_HEIGHT * 0.58;
    this.loadingText = this.add.text(GAME_WIDTH / 2, barY - 25, '에셋 준비 중...', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#a5b4fc'
    }).setOrigin(0.5);

    // Phase 표시 텍스트
    this.phaseText = this.add.text(GAME_WIDTH / 2, barY - 48, '', {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#64748b'
    }).setOrigin(0.5);

    // 진행바 (둥근 모서리)
    const barWidth = 320;
    const barHeight = 12;
    const barX = (GAME_WIDTH - barWidth) / 2;

    // 배경
    const barBg = this.add.graphics();
    barBg.fillStyle(0x1e293b, 1);
    barBg.fillRoundedRect(barX, barY, barWidth, barHeight, barHeight / 2);

    // 채움바
    this.progressBar = this.add.graphics();
    this._barX = barX;
    this._barY = barY;
    this._barWidth = barWidth;
    this._barHeight = barHeight;

    // 퍼센트 텍스트
    this.percentText = this.add.text(GAME_WIDTH / 2, barY + barHeight + 16, '0%', {
      fontSize: '13px',
      fontFamily: 'Roboto Mono, monospace',
      color: '#64748b'
    }).setOrigin(0.5);
  }

  /**
   * Phase 텍스트 업데이트 (preload 중 호출)
   */
  _updatePhaseText(text) {
    if (this.loadingText) {
      this.loadingText.setText(text);
    }
  }

  /**
   * 진행바 업데이트
   */
  _updateProgressBar(progress) {
    if (!this.progressBar) return;

    this.progressBar.clear();
    const fillWidth = Math.max(0, this._barWidth * progress);
    if (fillWidth > 0) {
      this.progressBar.fillStyle(0x6366f1, 1);
      this.progressBar.fillRoundedRect(
        this._barX, this._barY,
        fillWidth, this._barHeight,
        this._barHeight / 2
      );
    }

    if (this.percentText) {
      this.percentText.setText(Math.floor(progress * 100) + '%');
    }

    if (this.phaseText) {
      this.phaseText.setText(`Phase ${this._loadPhase}/${this._totalPhases}`);
    }
  }

  // ============================================
  // create: 로딩 완료 트랜지션
  // ============================================

  create() {
    try {
      // Phase 6: 최종 검증
      this.loadPhase6_Finalize();

      // 에셋 생성 시뮬레이션 + 프로그레스 애니메이션
      let progress = 0;

      const stages = [
        { label: '에셋 준비 중...', target: 0.3 },
        { label: '캐릭터 로드 중...', target: 0.6 },
        { label: '전투 데이터 초기화...', target: 0.85 },
        { label: '완료!', target: 1.0 }
      ];
      let stageIndex = 0;

      const timer = this.time.addEvent({
        delay: 25,
        callback: () => {
          progress += 0.03;

          // 단계별 텍스트 변경
          if (stageIndex < stages.length && progress >= stages[stageIndex].target) {
            if (stageIndex + 1 < stages.length) {
              this.loadingText.setText(stages[stageIndex + 1].label);
            }
            stageIndex++;
          }

          if (progress >= 1) {
            progress = 1;
            timer.remove();

            this.loadingText.setText('완료!');

            const pendingRewards = this.registry.get('pendingOfflineRewards');

            this.cameras.main.fadeOut(400, 10, 10, 26);
            this.cameras.main.once('camerafadeoutcomplete', () => {
              this.scene.start('MainMenuScene', { showOfflineRewards: pendingRewards });
            });
          }

          this._updateProgressBar(progress);
        },
        repeat: 40
      });
    } catch (error) {
      console.error('[PreloadScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  shutdown() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }
}
