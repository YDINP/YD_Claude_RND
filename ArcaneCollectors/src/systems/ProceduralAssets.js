/**
 * ProceduralAssets.js
 * Canvas 기반 픽셀아트 스타일 에셋 프로시저럴 생성
 *
 * 서브컬쳐/도트(픽셀아트) 감성 타겟 (Blue Archive × NIKKE 스타일)
 * PreloadScene.loadPhase1_UIPlaceholders() 내에서 호출 권장:
 *   ProceduralAssets.generateAll(scene)
 *
 * 생성 텍스처 키 목록:
 *   - 'pixel-main-bg'    : 메인메뉴 픽셀 그리드 배경
 *   - 'pixel-battle-bg'  : 전투 다크 그라디언트 배경
 *   - 'pixel-gacha-bg'   : 가챠 네온 그리드 배경
 *   - 'btn-primary'      : 핑크 픽셀아트 버튼
 *   - 'btn-danger'       : 레드 픽셀아트 버튼
 *   - 'btn-accent'       : 황금 픽셀아트 버튼
 *   - 'panel-dark'       : 반투명 다크 패널
 *   - 'panel-glow'       : 네온 글로우 패널
 */

// 서브컬쳐 교단 컬러 팔레트
const PIXEL_PALETTE = {
  neonPink:   '#FF6EB4',
  neonCyan:   '#00F5FF',
  neonPurple: '#BF5FFF',
  neonGold:   '#FFD700',
  darkBase:   '#0A0A12',
  darkMid:    '#12121E',
  darkPanel:  '#1A1A2E',
  gridLine:   'rgba(99, 102, 241, 0.15)',
  scanLine:   'rgba(0, 0, 0, 0.25)',
};

// 픽셀 그리드 단위 (4px)
const PIXEL = 4;

export class ProceduralAssets {
  /**
   * 픽셀 그리드 패턴 배경 생성 (메인메뉴용)
   * - 보라/남색 그라디언트 + 4px 픽셀 그리드 + CRT 스캔라인
   * @param {Phaser.Scene} scene
   * @param {number} width
   * @param {number} height
   */
  static generateMainMenuBg(scene, width = 480, height = 854) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 기본 그라디언트 배경
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0,   '#0D0B2A');  // 딥 퍼플
    grad.addColorStop(0.4, '#0A0F2E');  // 딥 네이비
    grad.addColorStop(1,   '#050510');  // 거의 검정
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 픽셀 그리드 패턴 (4×4 격자)
    ctx.strokeStyle = PIXEL_PALETTE.gridLine;
    ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += PIXEL * 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += PIXEL * 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 픽셀 도트 별 (랜덤 배치, 재현 가능한 시드 패턴)
    const starPositions = _getStarPositions(width, height, 60);
    starPositions.forEach(({ x, y, size, alpha, color }) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      // 픽셀 단위 스냅
      const px = Math.floor(x / PIXEL) * PIXEL;
      const py = Math.floor(y / PIXEL) * PIXEL;
      ctx.fillRect(px, py, size, size);
    });
    ctx.globalAlpha = 1.0;

    // 하단 네온 글로우 (메인메뉴 하단 강조)
    const glowGrad = ctx.createRadialGradient(
      width / 2, height, 0,
      width / 2, height, width * 0.8
    );
    glowGrad.addColorStop(0,   'rgba(99, 102, 241, 0.25)');
    glowGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.08)');
    glowGrad.addColorStop(1,   'rgba(99, 102, 241, 0.0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, height * 0.5, width, height * 0.5);

    // CRT 스캔라인 효과 (1px 반투명 가로줄)
    _applyCRTScanlines(ctx, width, height);

    scene.textures.addCanvas('pixel-main-bg', canvas);
  }

  /**
   * 다크 그라디언트 + 픽셀 파티클 배경 (전투용)
   * - 붉은/검정 방사형 + 균열 라인 + 픽셀 스파크 + 스캔라인
   * @param {Phaser.Scene} scene
   * @param {number} width
   * @param {number} height
   */
  static generateBattleBg(scene, width = 480, height = 854) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 방사형 다크 그라디언트
    const radGrad = ctx.createRadialGradient(
      width / 2, height * 0.25, 0,
      width / 2, height * 0.25, height * 0.8
    );
    radGrad.addColorStop(0,   '#2A0505');  // 다크 레드
    radGrad.addColorStop(0.5, '#100A0A');  // 거의 검정
    radGrad.addColorStop(1,   '#050505');  // 완전 검정
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, width, height);

    // 미세 픽셀 그리드 (전투 바닥 느낌)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.06)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += PIXEL * 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += PIXEL * 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 균열 느낌 지그재그 라인
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.18)';
    ctx.lineWidth = 1.5;
    const cracks = _generateCracks(width, height, 5);
    cracks.forEach(crack => {
      ctx.beginPath();
      crack.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    });

    // 픽셀 스파크 (전투 분위기 파티클)
    const sparkColors = ['rgba(239,68,68,', 'rgba(251,191,36,', 'rgba(255,110,180,'];
    for (let i = 0; i < 40; i++) {
      const sx = _seededRand(i * 7 + 1) * width;
      const sy = _seededRand(i * 13 + 2) * height * 0.7;
      const sa = _seededRand(i * 17 + 3) * 0.4 + 0.1;
      const sc = sparkColors[i % sparkColors.length];
      ctx.fillStyle = sc + sa + ')';
      const px = Math.floor(sx / PIXEL) * PIXEL;
      const py = Math.floor(sy / PIXEL) * PIXEL;
      const ps = (i % 3 === 0) ? PIXEL * 2 : PIXEL;
      ctx.fillRect(px, py, ps, ps);
    }

    // CRT 스캔라인
    _applyCRTScanlines(ctx, width, height, 0.3);

    scene.textures.addCanvas('pixel-battle-bg', canvas);
  }

  /**
   * 네온 그리드 배경 (가챠용)
   * - 황금/보라 방사형 + 네온 육각 그리드 + 픽셀 파티클 + 스캔라인
   * @param {Phaser.Scene} scene
   * @param {number} width
   * @param {number} height
   */
  static generateGachaBg(scene, width = 480, height = 854) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 방사형 황금/보라 그라디언트
    const radGrad = ctx.createRadialGradient(
      width / 2, height * 0.45, 0,
      width / 2, height * 0.45, height * 0.65
    );
    radGrad.addColorStop(0,   '#1A0F2E');  // 딥 퍼플
    radGrad.addColorStop(0.4, '#0F0A1E');  // 네이비 퍼플
    radGrad.addColorStop(1,   '#050308');  // 검정
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, width, height);

    // 네온 동심원 (마법진 느낌)
    const circleColors = [
      'rgba(191, 95, 255, 0.2)',
      'rgba(255, 215, 0, 0.15)',
      'rgba(0, 245, 255, 0.1)',
    ];
    [200, 300, 400].forEach((r, i) => {
      ctx.strokeStyle = circleColors[i];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.45, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 픽셀 그리드 (대각선 패턴)
    ctx.strokeStyle = 'rgba(191, 95, 255, 0.1)';
    ctx.lineWidth = 0.5;
    const step = PIXEL * 5;
    for (let x = -height; x < width + height; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.stroke();
    }

    // 네온 픽셀 도트 파티클
    const particleColors = [
      PIXEL_PALETTE.neonPurple,
      PIXEL_PALETTE.neonGold,
      PIXEL_PALETTE.neonCyan,
      PIXEL_PALETTE.neonPink,
    ];
    for (let i = 0; i < 50; i++) {
      const px = Math.floor(_seededRand(i * 11 + 1) * width / PIXEL) * PIXEL;
      const py = Math.floor(_seededRand(i * 17 + 2) * height / PIXEL) * PIXEL;
      const pa = _seededRand(i * 23 + 3) * 0.5 + 0.1;
      const pc = particleColors[i % particleColors.length];
      ctx.fillStyle = pc;
      ctx.globalAlpha = pa;
      ctx.fillRect(px, py, PIXEL, PIXEL);
    }
    ctx.globalAlpha = 1.0;

    // 중앙 황금 글로우
    const centerGlow = ctx.createRadialGradient(
      width / 2, height * 0.45, 0,
      width / 2, height * 0.45, 200
    );
    centerGlow.addColorStop(0,   'rgba(255, 215, 0, 0.12)');
    centerGlow.addColorStop(0.5, 'rgba(191, 95, 255, 0.08)');
    centerGlow.addColorStop(1,   'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, width, height);

    // CRT 스캔라인
    _applyCRTScanlines(ctx, width, height, 0.2);

    scene.textures.addCanvas('pixel-gacha-bg', canvas);
  }

  /**
   * UI 픽셀아트 버튼 텍스처 생성
   * - 3D 입체감 + 네온 테두리 + 픽셀 하이라이트
   * @param {Phaser.Scene} scene
   * @param {string} key     - 텍스처 키
   * @param {number} color   - 버튼 색상 (hex number, 예: 0xFF6EB4)
   * @param {number} w       - 가로 픽셀
   * @param {number} h       - 세로 픽셀
   */
  static generatePixelButton(scene, key, color, w = 200, h = 50) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const hex = '#' + color.toString(16).padStart(6, '0');
    const darkHex = _darkenColor(hex, 0.5);
    const lightHex = _lightenColor(hex, 0.4);

    // 버튼 그림자 (아래 오른쪽 오프셋)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(PIXEL, PIXEL, w - PIXEL, h - PIXEL);

    // 버튼 바닥면 (3D 느낌)
    ctx.fillStyle = darkHex;
    ctx.fillRect(0, PIXEL, w - PIXEL, h - PIXEL);

    // 버튼 상단면 (메인 색상)
    const btnGrad = ctx.createLinearGradient(0, 0, 0, h - PIXEL);
    btnGrad.addColorStop(0, lightHex);
    btnGrad.addColorStop(1, hex);
    ctx.fillStyle = btnGrad;
    ctx.fillRect(0, 0, w - PIXEL, h - PIXEL);

    // 픽셀 하이라이트 (상단 1픽셀 라인)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(PIXEL, PIXEL, w - PIXEL * 2, PIXEL);

    // 네온 테두리 (외곽)
    ctx.strokeStyle = lightHex;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - PIXEL - 1, h - PIXEL - 1);

    scene.textures.addCanvas(key, canvas);
  }

  /**
   * 반투명 다크 패널 텍스처 생성
   * - 픽셀아트 테두리 + 반투명 배경 + 코너 장식
   * @param {Phaser.Scene} scene
   * @param {string} key     - 텍스처 키
   * @param {number} w       - 가로 픽셀
   * @param {number} h       - 세로 픽셀
   * @param {string} [style] - 'dark' | 'glow' (기본: 'dark')
   */
  static generatePanel(scene, key, w = 400, h = 300, style = 'dark') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (style === 'glow') {
      // 네온 글로우 패널
      ctx.fillStyle = 'rgba(20, 10, 40, 0.92)';
      ctx.fillRect(0, 0, w, h);

      // 네온 테두리
      ctx.strokeStyle = PIXEL_PALETTE.neonPurple;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      // 내부 글로우
      const innerGlow = ctx.createLinearGradient(0, 0, 0, h);
      innerGlow.addColorStop(0,   'rgba(191, 95, 255, 0.08)');
      innerGlow.addColorStop(0.5, 'rgba(0, 245, 255, 0.04)');
      innerGlow.addColorStop(1,   'rgba(191, 95, 255, 0.08)');
      ctx.fillStyle = innerGlow;
      ctx.fillRect(PIXEL, PIXEL, w - PIXEL * 2, h - PIXEL * 2);

      // 코너 픽셀 장식 (네온 핑크)
      _drawPixelCorners(ctx, w, h, PIXEL_PALETTE.neonPink, PIXEL * 3);
    } else {
      // 기본 다크 패널
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(0, 0, w, h);

      // 픽셀 테두리
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      // 상단 하이라이트 라인
      ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.fillRect(0, 0, w, PIXEL);

      // 코너 픽셀 장식 (인디고)
      _drawPixelCorners(ctx, w, h, '#6366F1', PIXEL * 2);
    }

    scene.textures.addCanvas(key, canvas);
  }

  /**
   * 모든 프로시저럴 에셋 한 번에 생성
   * PreloadScene.loadPhase1_UIPlaceholders() 내에서 호출
   * @param {Phaser.Scene} scene
   * @param {number} [width]   - 게임 너비 (기본: 480)
   * @param {number} [height]  - 게임 높이 (기본: 854)
   */
  static generateAll(scene, width = 480, height = 854) {
    try {
      this.generateMainMenuBg(scene, width, height);
    } catch (e) {
      console.warn('[ProceduralAssets] generateMainMenuBg 실패:', e);
    }

    try {
      this.generateBattleBg(scene, width, height);
    } catch (e) {
      console.warn('[ProceduralAssets] generateBattleBg 실패:', e);
    }

    try {
      this.generateGachaBg(scene, width, height);
    } catch (e) {
      console.warn('[ProceduralAssets] generateGachaBg 실패:', e);
    }

    try {
      this.generatePixelButton(scene, 'btn-primary', 0xFF6EB4, 200, 50);
      this.generatePixelButton(scene, 'btn-danger',  0xE63946, 200, 50);
      this.generatePixelButton(scene, 'btn-accent',  0xFFD700, 200, 50);
    } catch (e) {
      console.warn('[ProceduralAssets] generatePixelButton 실패:', e);
    }

    try {
      this.generatePanel(scene, 'panel-dark', 400, 300, 'dark');
      this.generatePanel(scene, 'panel-glow', 400, 300, 'glow');
    } catch (e) {
      console.warn('[ProceduralAssets] generatePanel 실패:', e);
    }
  }
}

// ============================================================
// 내부 헬퍼 함수들 (모듈 스코프, export 안 함)
// ============================================================

/**
 * CRT 스캔라인 효과 적용 (1px 반투명 가로줄)
 */
function _applyCRTScanlines(ctx, width, height, alpha = 0.25) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  for (let y = 1; y < height; y += 2) {
    ctx.fillRect(0, y, width, 1);
  }
}

/**
 * 픽셀 코너 장식 그리기
 */
function _drawPixelCorners(ctx, w, h, color, size) {
  ctx.fillStyle = color;

  // 상단 왼쪽
  ctx.fillRect(0,         0,         size, PIXEL);
  ctx.fillRect(0,         0,         PIXEL, size);
  // 상단 오른쪽
  ctx.fillRect(w - size,  0,         size, PIXEL);
  ctx.fillRect(w - PIXEL, 0,         PIXEL, size);
  // 하단 왼쪽
  ctx.fillRect(0,         h - PIXEL, size, PIXEL);
  ctx.fillRect(0,         h - size,  PIXEL, size);
  // 하단 오른쪽
  ctx.fillRect(w - size,  h - PIXEL, size, PIXEL);
  ctx.fillRect(w - PIXEL, h - size,  PIXEL, size);
}

/**
 * 결정론적 랜덤 (시드 기반, 매 빌드마다 동일한 패턴)
 * LCG 방식: simple & fast
 */
function _seededRand(seed) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

/**
 * 별 위치 생성 (시드 기반)
 */
function _getStarPositions(width, height, count) {
  const positions = [];
  const colors = [
    PIXEL_PALETTE.neonPink,
    PIXEL_PALETTE.neonCyan,
    PIXEL_PALETTE.neonPurple,
    '#FFFFFF',
  ];

  for (let i = 0; i < count; i++) {
    positions.push({
      x:     _seededRand(i * 3 + 1) * width,
      y:     _seededRand(i * 7 + 2) * height,
      size:  (i % 4 === 0) ? PIXEL * 2 : PIXEL,
      alpha: _seededRand(i * 11 + 3) * 0.5 + 0.1,
      color: colors[i % colors.length],
    });
  }

  return positions;
}

/**
 * 균열 라인 생성 (시드 기반)
 */
function _generateCracks(width, height, count) {
  const cracks = [];

  for (let i = 0; i < count; i++) {
    const points = [];
    let x = _seededRand(i * 5 + 1) * width;
    let y = _seededRand(i * 5 + 2) * height * 0.4;
    points.push({ x, y });

    for (let j = 0; j < 6; j++) {
      x += (_seededRand(i * 5 + j * 3 + 3) - 0.5) * 120;
      y += _seededRand(i * 5 + j * 3 + 4) * 150 + 50;
      points.push({ x, y });
    }

    cracks.push(points);
  }

  return cracks;
}

/**
 * 색상 어둡게 (간단한 hex 조작)
 */
function _darkenColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.max(0, Math.floor(r * factor));
  const dg = Math.max(0, Math.floor(g * factor));
  const db = Math.max(0, Math.floor(b * factor));
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

/**
 * 색상 밝게 (간단한 hex 조작)
 */
function _lightenColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.min(255, Math.floor(r + (255 - r) * factor));
  const lg = Math.min(255, Math.floor(g + (255 - g) * factor));
  const lb = Math.min(255, Math.floor(b + (255 - b) * factor));
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}
