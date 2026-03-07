/**
 * ProceduralAssets.js
 * Canvas 기반 BA × NIKKE 하이브리드 스타일 에셋 프로시저럴 생성
 *
 * Blue Archive: 파스텔 & 화이트 베이스, 별/빛 파티클, 학원 감성
 * NIKKE: 다크 사이버펑크 SF, 네온 색상, 슬릭 패널
 * 하이브리드: 어두운 배경 + 밝은 네온 UI 요소 대비, 교단 컬러 강조
 *
 * PreloadScene.loadPhase1_UIPlaceholders() 내에서 호출 권장:
 *   ProceduralAssets.generateAll(scene)
 *
 * 생성 텍스처 키 목록:
 *   - 'pixel-main-bg'    : 별빛 그라데이션 메인메뉴 배경
 *   - 'pixel-battle-bg'  : 사이버펑크 격자 전투 배경
 *   - 'pixel-gacha-bg'   : 별빛 폭발 가챠 배경
 *   - 'btn-primary'      : BA 스타일 둥근 그라데이션 버튼
 *   - 'btn-danger'       : 레드 버튼
 *   - 'btn-accent'       : 황금 버튼
 *   - 'panel-dark'       : NIKKE 스타일 다크 패널
 *   - 'panel-glow'       : 네온 글로우 패널
 *   - 'star-field'       : 별 파티클 텍스처 (mainmenu 오버레이용)
 *   - 'neon-grid'        : 네온 격자 배경 텍스처 (battle 오버레이용)
 */

// BA × NIKKE 하이브리드 컬러 팔레트
const PIXEL_PALETTE = {
  neonPink:    '#FF6EB4',
  neonCyan:    '#00F5FF',
  neonPurple:  '#BF5FFF',
  neonGold:    '#FFD700',
  deepNavy:    '#0A0A1A',
  darkPurple:  '#12122A',
  darkBluePurple: '#1A1A3E',
  gridLine:    'rgba(0, 245, 255, 0.12)',
  scanLine:    'rgba(0, 0, 0, 0.22)',
  starWhite:   'rgba(255, 255, 255, 0.9)',
};

// 픽셀 그리드 단위 (4px)
const PIXEL = 4;

export class ProceduralAssets {
  /**
   * 별빛 그라데이션 배경 생성 (메인메뉴용)
   * - 딥 네이비 → 퍼플 → 다크 그라데이션
   * - 작은 별 파티클 랜덤 배치 (80개)
   * - 하단 지평선 네온 글로우
   * @param {Phaser.Scene} scene
   * @param {number} width
   * @param {number} height
   */
  static generateMainMenuBg(scene, width = 480, height = 854) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 기본 그라디언트 배경 (딥 네이비 → 퍼플 → 다크)
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0,   '#0A0A1A');  // 딥 네이비 블랙
    grad.addColorStop(0.35, '#12122A'); // 다크 퍼플
    grad.addColorStop(0.7,  '#0D0B22'); // 딥 퍼플 블루
    grad.addColorStop(1,   '#050510');  // 거의 검정
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 성운 느낌 퍼플 글로우 (중앙 상단)
    const nebula = ctx.createRadialGradient(
      width * 0.6, height * 0.2, 0,
      width * 0.6, height * 0.2, width * 0.7
    );
    nebula.addColorStop(0,   'rgba(139, 43, 226, 0.18)');
    nebula.addColorStop(0.4, 'rgba(75, 0, 130, 0.08)');
    nebula.addColorStop(1,   'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, width, height * 0.5);

    // 별 파티클 (80개, 시드 기반 결정론적 배치)
    const starData = _getStarFieldData(width, height, 80);
    starData.forEach(({ x, y, radius, alpha, color }) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      // 큰 별은 십자 글로우 추가
      if (radius > 1.5) {
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x - radius * 2, y - 0.5, radius * 4, 1);
        ctx.fillRect(x - 0.5, y - radius * 2, 1, radius * 4);
      }
    });
    ctx.globalAlpha = 1.0;

    // 하단 지평선 네온 글로우 (시안 + 퍼플)
    const horizGlow = ctx.createLinearGradient(0, height * 0.72, 0, height);
    horizGlow.addColorStop(0,   'rgba(0, 245, 255, 0.0)');
    horizGlow.addColorStop(0.3, 'rgba(0, 245, 255, 0.06)');
    horizGlow.addColorStop(0.6, 'rgba(147, 51, 234, 0.10)');
    horizGlow.addColorStop(1,   'rgba(147, 51, 234, 0.18)');
    ctx.fillStyle = horizGlow;
    ctx.fillRect(0, height * 0.72, width, height * 0.28);

    // 하단 네온 라인 (지평선 강조)
    const horizLineY = height * 0.78;
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizLineY);
    ctx.lineTo(width, horizLineY);
    ctx.stroke();

    // 미세 수직 그리드 (배경 깊이감)
    ctx.strokeStyle = PIXEL_PALETTE.gridLine;
    ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += PIXEL * 8) {
      ctx.beginPath();
      ctx.moveTo(x, height * 0.75);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // CRT 스캔라인 (경미하게)
    _applyCRTScanlines(ctx, width, height, 0.18);

    scene.textures.addCanvas('pixel-main-bg', canvas);
  }

  /**
   * 사이버펑크 격자 패턴 배경 (전투용)
   * - 다크 베이스 + 원근감 있는 격자 패턴
   * - 네온 스캔라인 효과
   * - 가로 스트라이프 글로우
   * @param {Phaser.Scene} scene
   * @param {number} width
   * @param {number} height
   */
  static generateBattleBg(scene, width = 480, height = 854) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 베이스 그라디언트 (다크 사이버펑크)
    const baseGrad = ctx.createLinearGradient(0, 0, 0, height);
    baseGrad.addColorStop(0,   '#0A0A12');  // 최상단 딥 다크
    baseGrad.addColorStop(0.4, '#0D0A1A');  // 다크 퍼플 블루
    baseGrad.addColorStop(1,   '#050508');  // 거의 검정
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, width, height);

    // 원근감 있는 사이버펑크 격자 (소실점: 화면 중앙 상단)
    const vpX = width / 2;
    const vpY = height * 0.35;
    const gridColor = 'rgba(0, 245, 255, 0.12)';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.8;

    // 수평선 (바닥 격자)
    const hCount = 20;
    for (let i = 0; i < hCount; i++) {
      const t = i / hCount;
      const y = vpY + (height - vpY) * (t * t);  // 원근 가속
      ctx.globalAlpha = t * 0.8 + 0.1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 수직선 (소실점으로 모이는)
    const vCount = 16;
    for (let i = 0; i <= vCount; i++) {
      const t = i / vCount;
      const bottomX = t * width;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(bottomX, height);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // 네온 스캔라인 효과 (밝은 가로줄 주기적으로)
    for (let i = 0; i < 6; i++) {
      const scanY = (height / 6) * i + _seededRand(i * 31 + 7) * (height / 6);
      const scanGrad = ctx.createLinearGradient(0, scanY - 3, 0, scanY + 3);
      scanGrad.addColorStop(0,   'rgba(0, 245, 255, 0.0)');
      scanGrad.addColorStop(0.5, 'rgba(0, 245, 255, 0.08)');
      scanGrad.addColorStop(1,   'rgba(0, 245, 255, 0.0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 3, width, 6);
    }

    // 가로 스트라이프 글로우 (사이드 패널 느낌)
    for (let i = 0; i < 4; i++) {
      const stripeY = height * (0.2 + i * 0.2);
      ctx.fillStyle = `rgba(191, 95, 255, ${0.03 + i * 0.01})`;
      ctx.fillRect(0, stripeY, width, 2);
    }

    // 좌우 네온 엣지 글로우
    const leftEdge = ctx.createLinearGradient(0, 0, width * 0.15, 0);
    leftEdge.addColorStop(0,   'rgba(0, 245, 255, 0.08)');
    leftEdge.addColorStop(1,   'rgba(0, 245, 255, 0.0)');
    ctx.fillStyle = leftEdge;
    ctx.fillRect(0, 0, width * 0.15, height);

    const rightEdge = ctx.createLinearGradient(width * 0.85, 0, width, 0);
    rightEdge.addColorStop(0,   'rgba(0, 245, 255, 0.0)');
    rightEdge.addColorStop(1,   'rgba(0, 245, 255, 0.08)');
    ctx.fillStyle = rightEdge;
    ctx.fillRect(width * 0.85, 0, width * 0.15, height);

    // CRT 스캔라인 (전투 긴장감)
    _applyCRTScanlines(ctx, width, height, 0.28);

    scene.textures.addCanvas('pixel-battle-bg', canvas);
  }

  /**
   * 별빛 폭발 효과 배경 (가챠용)
   * - 동심원 링 패턴 (마법진)
   * - 골드/화이트 파티클 방사형
   * - 중앙 빛 폭발
   * @param {Phaser.Scene} scene
   * @param {number} width
   * @param {number} height
   */
  static generateGachaBg(scene, width = 480, height = 854) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const cx = width / 2;
    const cy = height * 0.42;

    // 베이스 방사형 그라디언트 (딥 퍼플 → 검정)
    const baseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, height * 0.75);
    baseGrad.addColorStop(0,   '#1A0A2E');  // 딥 퍼플
    baseGrad.addColorStop(0.35, '#0F0A1E'); // 다크 네이비 퍼플
    baseGrad.addColorStop(0.7,  '#080510'); // 매우 어두운 퍼플
    baseGrad.addColorStop(1,   '#020208');  // 거의 검정
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, width, height);

    // 동심원 링 패턴 (마법진 느낌, 8개)
    const ringConfigs = [
      { r: 60,  alpha: 0.35, color: '#FFD700', width: 1.5 },
      { r: 110, alpha: 0.25, color: '#BF5FFF', width: 1.0 },
      { r: 160, alpha: 0.20, color: '#00F5FF', width: 0.8 },
      { r: 210, alpha: 0.15, color: '#FFD700', width: 1.2 },
      { r: 260, alpha: 0.12, color: '#BF5FFF', width: 0.6 },
      { r: 310, alpha: 0.09, color: '#00F5FF', width: 0.5 },
      { r: 360, alpha: 0.07, color: '#FFD700', width: 0.4 },
      { r: 400, alpha: 0.05, color: '#BF5FFF', width: 0.3 },
    ];

    ringConfigs.forEach(({ r, alpha, color, width: lw }) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1.0;

    // 별빛 폭발 — 방사형 라인 (36개)
    const rayCount = 36;
    for (let i = 0; i < rayCount; i++) {
      const angle = (Math.PI * 2 * i) / rayCount;
      const len = _seededRand(i * 7 + 3) * 200 + 80;
      const alpha = _seededRand(i * 13 + 5) * 0.15 + 0.03;

      const grad = ctx.createLinearGradient(
        cx, cy,
        cx + Math.cos(angle) * len,
        cy + Math.sin(angle) * len
      );
      grad.addColorStop(0,   `rgba(255, 215, 0, ${alpha * 2})`);
      grad.addColorStop(0.4, `rgba(255, 215, 0, ${alpha})`);
      grad.addColorStop(1,   'rgba(255, 215, 0, 0.0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = _seededRand(i * 17 + 9) > 0.7 ? 1.5 : 0.7;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      ctx.stroke();
    }

    // 골드/화이트 파티클 (최대 80개)
    const particleColors = [
      { r: 255, g: 215, b: 0 },    // 골드
      { r: 255, g: 255, b: 255 },  // 화이트
      { r: 191, g: 95,  b: 255 },  // 퍼플
      { r: 0,   g: 245, b: 255 },  // 시안
    ];
    for (let i = 0; i < 80; i++) {
      const angle = _seededRand(i * 11 + 1) * Math.PI * 2;
      const dist  = _seededRand(i * 17 + 2) * 350;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const pr = _seededRand(i * 23 + 3) * 1.8 + 0.4;
      const pa = _seededRand(i * 29 + 4) * 0.6 + 0.1;
      const pc = particleColors[i % particleColors.length];

      ctx.fillStyle = `rgba(${pc.r}, ${pc.g}, ${pc.b}, ${pa})`;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // 중앙 빛 폭발 (황금 코어)
    const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
    coreGlow.addColorStop(0,   'rgba(255, 215, 0, 0.30)');
    coreGlow.addColorStop(0.3, 'rgba(255, 215, 0, 0.12)');
    coreGlow.addColorStop(0.6, 'rgba(191, 95, 255, 0.06)');
    coreGlow.addColorStop(1,   'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = coreGlow;
    ctx.fillRect(0, 0, width, height);

    // CRT 스캔라인 (가챠 연출 보조)
    _applyCRTScanlines(ctx, width, height, 0.18);

    scene.textures.addCanvas('pixel-gacha-bg', canvas);
  }

  /**
   * BA 스타일 UI 버튼 텍스처 생성
   * - 둥근 모서리 (BA 감성)
   * - 흰색 → 교단 컬러 그라데이션
   * - 미묘한 테두리 글로우
   * @param {Phaser.Scene} scene
   * @param {string} key
   * @param {number} color    - 버튼 색상 (hex number)
   * @param {number} w
   * @param {number} h
   */
  static generatePixelButton(scene, key, color, w = 200, h = 50) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const hex = '#' + color.toString(16).padStart(6, '0');
    const lightHex = _lightenColor(hex, 0.45);
    const darkHex  = _darkenColor(hex, 0.55);

    const radius = Math.min(h * 0.38, 18);  // BA 스타일 둥근 모서리

    // 그림자 (아래 오프셋)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    _fillRoundRect(ctx, PIXEL, PIXEL, w - PIXEL, h - PIXEL, radius);

    // 글로우 테두리 (교단 컬러)
    ctx.shadowColor = hex;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = lightHex;
    ctx.lineWidth = 1.5;
    _strokeRoundRect(ctx, 0.5, 0.5, w - PIXEL - 1, h - PIXEL - 1, radius);
    ctx.shadowBlur = 0;

    // 메인 버튼 그라데이션 (흰색 상단 → 교단 컬러 하단)
    const btnGrad = ctx.createLinearGradient(0, 0, 0, h - PIXEL);
    btnGrad.addColorStop(0,    lightHex);
    btnGrad.addColorStop(0.35, hex);
    btnGrad.addColorStop(1,    darkHex);
    ctx.fillStyle = btnGrad;
    _fillRoundRect(ctx, 0, 0, w - PIXEL, h - PIXEL, radius);

    // 상단 하이라이트 (BA 특유의 밝은 상단 라인)
    const highlightGrad = ctx.createLinearGradient(0, 0, 0, h * 0.35);
    highlightGrad.addColorStop(0,   'rgba(255, 255, 255, 0.55)');
    highlightGrad.addColorStop(1,   'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = highlightGrad;
    _fillRoundRect(ctx, 2, 2, w - PIXEL - 4, (h - PIXEL) * 0.45, radius);

    scene.textures.addCanvas(key, canvas);
  }

  /**
   * NIKKE 스타일 패널 텍스처 생성
   * - 다크 반투명 패널
   * - 상단 교단 컬러 액센트 라인
   * - 슬릭한 엣지 처리
   * @param {Phaser.Scene} scene
   * @param {string} key
   * @param {number} w
   * @param {number} h
   * @param {string} [style] - 'dark' | 'glow'
   */
  static generatePanel(scene, key, w = 400, h = 300, style = 'dark') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (style === 'glow') {
      // NIKKE 스타일 네온 글로우 패널
      // 배경 (다크 반투명)
      ctx.fillStyle = 'rgba(10, 10, 26, 0.93)';
      ctx.fillRect(0, 0, w, h);

      // 상단 네온 액센트 라인 (교단 컬러 시안)
      const topAccent = ctx.createLinearGradient(0, 0, w, 0);
      topAccent.addColorStop(0,   'rgba(0, 245, 255, 0.0)');
      topAccent.addColorStop(0.2, 'rgba(0, 245, 255, 0.9)');
      topAccent.addColorStop(0.8, 'rgba(0, 245, 255, 0.9)');
      topAccent.addColorStop(1,   'rgba(0, 245, 255, 0.0)');
      ctx.fillStyle = topAccent;
      ctx.fillRect(0, 0, w, 2);

      // 패널 내부 미묘한 그라데이션
      const innerGlow = ctx.createLinearGradient(0, 0, 0, h);
      innerGlow.addColorStop(0,   'rgba(0, 245, 255, 0.06)');
      innerGlow.addColorStop(0.3, 'rgba(147, 51, 234, 0.03)');
      innerGlow.addColorStop(1,   'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = innerGlow;
      ctx.fillRect(0, 2, w, h - 2);

      // 측면 테두리 (가는 네온 라인)
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.30)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      // 하단 액센트 라인 (퍼플)
      const bottomAccent = ctx.createLinearGradient(0, 0, w, 0);
      bottomAccent.addColorStop(0,   'rgba(191, 95, 255, 0.0)');
      bottomAccent.addColorStop(0.3, 'rgba(191, 95, 255, 0.6)');
      bottomAccent.addColorStop(0.7, 'rgba(191, 95, 255, 0.6)');
      bottomAccent.addColorStop(1,   'rgba(191, 95, 255, 0.0)');
      ctx.fillStyle = bottomAccent;
      ctx.fillRect(0, h - 2, w, 2);

      // 코너 장식 (네온 시안)
      _drawNeonCorners(ctx, w, h, '#00F5FF', 12);

    } else {
      // NIKKE 스타일 기본 다크 패널
      // 배경 (짙은 반투명 다크)
      ctx.fillStyle = 'rgba(18, 18, 42, 0.90)';
      ctx.fillRect(0, 0, w, h);

      // 상단 교단 컬러 액센트 라인 (neon_crow 시안)
      const topAccent = ctx.createLinearGradient(0, 0, w, 0);
      topAccent.addColorStop(0,   'rgba(0, 245, 255, 0.0)');
      topAccent.addColorStop(0.15, 'rgba(0, 245, 255, 0.7)');
      topAccent.addColorStop(0.85, 'rgba(0, 245, 255, 0.7)');
      topAccent.addColorStop(1,   'rgba(0, 245, 255, 0.0)');
      ctx.fillStyle = topAccent;
      ctx.fillRect(0, 0, w, 2);

      // 패널 상단 내부 미묘한 라이트
      const topLight = ctx.createLinearGradient(0, 0, 0, h * 0.25);
      topLight.addColorStop(0,   'rgba(0, 245, 255, 0.04)');
      topLight.addColorStop(1,   'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = topLight;
      ctx.fillRect(0, 2, w, h * 0.25);

      // 외곽 테두리
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.20)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      // 코너 장식 (작은 L자 시안)
      _drawNeonCorners(ctx, w, h, '#00F5FF', 8);
    }

    scene.textures.addCanvas(key, canvas);
  }

  /**
   * 별 파티클 텍스처 생성 (mainmenu 오버레이용)
   * - 랜덤 크기/밝기 별 80개
   * - 투명 배경 위에 별만 그림
   * @param {Phaser.Scene} scene
   * @param {number} w
   * @param {number} h
   * @param {number} count - 별 개수 (기본 80)
   */
  static generateStarField(scene, w = 480, h = 854, count = 80) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // 투명 배경
    ctx.clearRect(0, 0, w, h);

    const starData = _getStarFieldData(w, h, Math.min(count, 200));
    starData.forEach(({ x, y, radius, alpha, color }) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      // 큰 별 — 십자 빛살
      if (radius > 1.8) {
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x - radius * 2.5, y - 0.5, radius * 5, 1);
        ctx.fillRect(x - 0.5, y - radius * 2.5, 1, radius * 5);
      }
    });

    ctx.globalAlpha = 1.0;
    scene.textures.addCanvas('star-field', canvas);
  }

  /**
   * 네온 격자 배경 텍스처 생성 (battle 오버레이용)
   * - 소실점 격자 (원근감)
   * - 네온 시안 컬러
   * @param {Phaser.Scene} scene
   * @param {number} w
   * @param {number} h
   */
  static generateNeonGrid(scene, w = 480, h = 854) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // 투명 배경
    ctx.clearRect(0, 0, w, h);

    const vpX = w / 2;
    const vpY = h * 0.3;

    // 수평선 (원근감 격자)
    for (let i = 0; i < 18; i++) {
      const t = i / 18;
      const y = vpY + (h - vpY) * (t * t);
      const alpha = t * 0.5 + 0.05;
      ctx.strokeStyle = `rgba(0, 245, 255, ${alpha})`;
      ctx.lineWidth = t > 0.8 ? 1.0 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 수직선 (소실점 방향)
    const vCount = 14;
    for (let i = 0; i <= vCount; i++) {
      const t = i / vCount;
      const bottomX = t * w;
      const alpha = Math.abs(t - 0.5) * 0.3 + 0.08;
      ctx.strokeStyle = `rgba(0, 245, 255, ${alpha})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(bottomX, h);
      ctx.stroke();
    }

    scene.textures.addCanvas('neon-grid', canvas);
  }

  /**
   * 모든 프로시저럴 에셋 한 번에 생성
   * PreloadScene.loadPhase1_UIPlaceholders() 내에서 호출
   * @param {Phaser.Scene} scene
   * @param {number} [width]
   * @param {number} [height]
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

    try {
      this.generateStarField(scene, width, height, 80);
    } catch (e) {
      console.warn('[ProceduralAssets] generateStarField 실패:', e);
    }

    try {
      this.generateNeonGrid(scene, width, height);
    } catch (e) {
      console.warn('[ProceduralAssets] generateNeonGrid 실패:', e);
    }
  }
}

// ============================================================
// 내부 헬퍼 함수들 (모듈 스코프, export 안 함)
// ============================================================

/**
 * CRT 스캔라인 효과 적용 (1px 반투명 가로줄)
 */
function _applyCRTScanlines(ctx, width, height, alpha = 0.22) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  for (let y = 1; y < height; y += 2) {
    ctx.fillRect(0, y, width, 1);
  }
}

/**
 * 결정론적 랜덤 (시드 기반)
 */
function _seededRand(seed) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

/**
 * 별 파티클 데이터 생성 (시드 기반, BA 스타일)
 */
function _getStarFieldData(width, height, count) {
  const stars = [];
  const colors = [
    'rgba(255, 255, 255, 1)',   // 순백
    'rgba(200, 220, 255, 1)',   // 청백
    'rgba(255, 220, 180, 1)',   // 황백
    'rgba(0, 245, 255, 1)',     // 시안 (neon_crow)
    'rgba(191, 95, 255, 1)',    // 퍼플
  ];

  for (let i = 0; i < count; i++) {
    const sizeRoll = _seededRand(i * 3 + 1);
    stars.push({
      x:      _seededRand(i * 7 + 2) * width,
      y:      _seededRand(i * 11 + 3) * height,
      radius: sizeRoll > 0.92 ? 2.2 : sizeRoll > 0.75 ? 1.4 : 0.7,
      alpha:  _seededRand(i * 13 + 4) * 0.55 + 0.25,
      color:  colors[i % colors.length],
    });
  }

  return stars;
}

/**
 * 네온 L자 코너 장식
 */
function _drawNeonCorners(ctx, w, h, color, size) {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  const t = 2;  // 두께

  // 상단 왼쪽
  ctx.fillRect(0,         0,         size, t);
  ctx.fillRect(0,         0,         t, size);
  // 상단 오른쪽
  ctx.fillRect(w - size,  0,         size, t);
  ctx.fillRect(w - t,     0,         t, size);
  // 하단 왼쪽
  ctx.fillRect(0,         h - t,     size, t);
  ctx.fillRect(0,         h - size,  t, size);
  // 하단 오른쪽
  ctx.fillRect(w - size,  h - t,     size, t);
  ctx.fillRect(w - t,     h - size,  t, size);

  ctx.globalAlpha = 1.0;
}

/**
 * 둥근 모서리 채운 사각형
 */
function _fillRoundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
  ctx.fill();
}

/**
 * 둥근 모서리 테두리 사각형
 */
function _strokeRoundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
  ctx.stroke();
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
