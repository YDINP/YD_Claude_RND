import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY } from '../config/gameConfig.js';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    // Create loading bar
    this.createLoadingBar();

    // Generate placeholder textures
    this.generatePlaceholderTextures();
  }

  generatePlaceholderTextures() {
    // Hero placeholder (64x64)
    const heroCanvas = document.createElement('canvas');
    heroCanvas.width = 64;
    heroCanvas.height = 64;
    const heroCtx = heroCanvas.getContext('2d');

    // Background circle
    heroCtx.fillStyle = '#6366F1';
    heroCtx.beginPath();
    heroCtx.arc(32, 32, 28, 0, Math.PI * 2);
    heroCtx.fill();

    // Simple face
    heroCtx.fillStyle = '#F8FAFC';
    heroCtx.beginPath();
    heroCtx.arc(24, 26, 4, 0, Math.PI * 2);
    heroCtx.arc(40, 26, 4, 0, Math.PI * 2);
    heroCtx.fill();

    // Smile
    heroCtx.strokeStyle = '#F8FAFC';
    heroCtx.lineWidth = 2;
    heroCtx.beginPath();
    heroCtx.arc(32, 32, 12, 0.2 * Math.PI, 0.8 * Math.PI);
    heroCtx.stroke();

    this.textures.addCanvas('hero_placeholder', heroCanvas);

    // Gem icon (24x24)
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

    // Gold icon (24x24)
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

    // Character portraits for each rarity (SSR, SR, R)
    const rarities = [
      { name: 'ssr', color: '#F59E0B', borderColor: '#FCD34D' },
      { name: 'sr', color: '#A855F7', borderColor: '#C084FC' },
      { name: 'r', color: '#3B82F6', borderColor: '#60A5FA' },
      { name: 'n', color: '#6B7280', borderColor: '#9CA3AF' }
    ];

    // Create 15 character portraits
    const characterNames = [
      'arcana', 'leonhart', 'selene', // SSR
      'rose', 'kai', 'luna', 'noir', 'aria', // SR
      'finn', 'mira', 'theo', 'eva', 'rex', 'ivy', 'max' // R
    ];

    const rarityMap = {
      'arcana': 'ssr', 'leonhart': 'ssr', 'selene': 'ssr',
      'rose': 'sr', 'kai': 'sr', 'luna': 'sr', 'noir': 'sr', 'aria': 'sr',
      'finn': 'r', 'mira': 'r', 'theo': 'r', 'eva': 'r', 'rex': 'r', 'ivy': 'r', 'max': 'r'
    };

    characterNames.forEach((name, index) => {
      const rarity = rarities.find(r => r.name === rarityMap[name]);

      // Portrait (80x80)
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');

      // Border
      ctx.fillStyle = rarity.borderColor;
      ctx.fillRect(0, 0, 80, 80);

      // Inner background
      ctx.fillStyle = rarity.color;
      ctx.fillRect(4, 4, 72, 72);

      // Character silhouette
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.arc(40, 35, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(25, 50, 30, 26);

      // Name initial
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

      // Background gradient
      const gradient = fullCtx.createLinearGradient(0, 0, 0, 300);
      gradient.addColorStop(0, rarity.color);
      gradient.addColorStop(1, '#1E293B');
      fullCtx.fillStyle = gradient;
      fullCtx.fillRect(0, 0, 200, 300);

      // Character body
      fullCtx.fillStyle = '#0F172A';
      fullCtx.beginPath();
      fullCtx.arc(100, 80, 40, 0, Math.PI * 2);
      fullCtx.fill();
      fullCtx.fillRect(60, 110, 80, 150);

      // Name
      fullCtx.fillStyle = '#F8FAFC';
      fullCtx.font = 'bold 48px Arial';
      fullCtx.textAlign = 'center';
      fullCtx.fillText(name.charAt(0).toUpperCase(), 100, 90);

      // Rarity badge
      fullCtx.fillStyle = rarity.borderColor;
      fullCtx.font = 'bold 16px Arial';
      fullCtx.fillText(rarity.name.toUpperCase(), 100, 280);

      this.textures.addCanvas(`char_full_${name}`, fullCanvas);
    });

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
      // Angry eyes
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

      // Frown
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
      const x = 32 + Math.cos(angle) * 20;
      const y = 32 + Math.sin(angle) * 20;
      effectCtx.beginPath();
      effectCtx.arc(x, y, 6, 0, Math.PI * 2);
      effectCtx.fill();
    }

    this.textures.addCanvas('effect_hit', effectCanvas);

    // Magic circle for gacha
    const circleCanvas = document.createElement('canvas');
    circleCanvas.width = 256;
    circleCanvas.height = 256;
    const circleCtx = circleCanvas.getContext('2d');

    circleCtx.strokeStyle = '#6366F1';
    circleCtx.lineWidth = 2;

    // Outer circle
    circleCtx.beginPath();
    circleCtx.arc(128, 128, 120, 0, Math.PI * 2);
    circleCtx.stroke();

    // Inner circles
    circleCtx.beginPath();
    circleCtx.arc(128, 128, 90, 0, Math.PI * 2);
    circleCtx.stroke();

    circleCtx.beginPath();
    circleCtx.arc(128, 128, 60, 0, Math.PI * 2);
    circleCtx.stroke();

    // Runes/symbols around
    circleCtx.fillStyle = '#6366F1';
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const x = 128 + Math.cos(angle) * 105;
      const y = 128 + Math.sin(angle) * 105;
      circleCtx.beginPath();
      circleCtx.arc(x, y, 8, 0, Math.PI * 2);
      circleCtx.fill();
    }

    // Hexagram
    circleCtx.strokeStyle = '#EC4899';
    circleCtx.lineWidth = 2;
    this.drawHexagram(circleCtx, 128, 128, 70);

    this.textures.addCanvas('magic_circle', circleCanvas);

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

    // Add some decorative elements
    bgCtx.fillStyle = 'rgba(99, 102, 241, 0.1)';
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 480;
      const y = Math.random() * 854;
      const size = Math.random() * 100 + 50;
      bgCtx.beginPath();
      bgCtx.arc(x, y, size, 0, Math.PI * 2);
      bgCtx.fill();
    }

    this.textures.addCanvas('battle_bg', bgCanvas);
  }

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
    // Two overlapping triangles
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

  createLoadingBar() {
    const width = 300;
    const height = 30;
    const x = (GAME_WIDTH - width) / 2;
    const y = GAME_HEIGHT / 2 + 50;

    // Loading text
    this.loadingText = this.add.text(GAME_WIDTH / 2, y - 40, '로딩 중...', {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#F8FAFC'
    }).setOrigin(0.5);

    // Progress bar background
    this.add.rectangle(x + width/2, y + height/2, width, height, 0x1E293B);

    // Progress bar fill
    this.progressBar = this.add.rectangle(x + 5, y + 5, 0, height - 10, 0x6366F1);
    this.progressBar.setOrigin(0, 0);

    // Percentage text
    this.percentText = this.add.text(GAME_WIDTH / 2, y + height + 20, '0%', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#94A3B8'
    }).setOrigin(0.5);
  }

  create() {
    // Simulate loading progress
    let progress = 0;
    const maxWidth = 290;

    const timer = this.time.addEvent({
      delay: 20,
      callback: () => {
        progress += 0.05;
        if (progress >= 1) {
          progress = 1;
          timer.remove();

          // Check for offline rewards
          const pendingRewards = this.registry.get('pendingOfflineRewards');

          this.time.delayedCall(300, () => {
            this.scene.start('MainMenuScene', { showOfflineRewards: pendingRewards });
          });
        }

        this.progressBar.width = maxWidth * progress;
        this.percentText.setText(Math.floor(progress * 100) + '%');
      },
      repeat: 20
    });
  }
}
