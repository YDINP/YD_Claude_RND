/**
 * button-contrast-smoke.mjs — 버튼 라벨 대비 실측
 *
 * btn_* 9-slice 아트는 가운데가 밝은 장식판이다. 그 위에 흰 라벨을 그대로 얹으면
 * 대비가 3:1 아래로 떨어져 글자가 아트에 묻힌다. UIButton 은 라벨 뒤에 어두운
 * 캡슐을 깔아 이를 막는다. 이 스모크는 그 약속이 실제 픽셀에서 지켜지는지 잰다.
 *
 * 측정 방법
 *   1. 실제 btn_* 텍스처를 로드하고 호출부와 같은 설정으로 버튼 8종을 만든다
 *   2. 라벨을 잠시 숨기고 라벨이 있던 자리를 스냅샷한다 (= 글자 뒤 실제 배경)
 *   3. 그 영역에서 라벨 색과 가장 대비가 나쁜 픽셀을 찾는다 (밝은 라벨이면 가장 밝은 픽셀)
 *   4. WCAG 상대휘도 공식으로 대비를 계산하고 4.5:1 기준으로 판정한다
 *
 * 글자 뒤를 재는 것이지 글자 자체를 재는 게 아니다. 글자를 포함해 재면 흰 획이
 * 표본을 오염시켜 실제보다 좋은 값이 나온다.
 *
 * 사전 조건: 개발 서버 실행 중 (http://localhost:3000)
 * 실행: node tests/e2e/button-contrast-smoke.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const BOOT_TIMEOUT_MS = 20000;

/** WCAG AA 본문 기준 */
const MIN_CONTRAST = 4.5;

const MANIFEST = JSON.parse(
  readFileSync(resolve(__dirname, '../../tools/art/asset-manifest.json'), 'utf-8')
);

function manifestPath(key) {
  const entry = (MANIFEST.textures || {})[key] || (MANIFEST.lazyTextures || {})[key];
  if (!entry || !entry.path) throw new Error(`asset-manifest.json 에 ${key} 가 없습니다`);
  return entry.path;
}

const TEXTURE_PATHS = {
  btn_primary: manifestPath('btn_primary'),
  btn_secondary: manifestPath('btn_secondary'),
  btn_ghost: manifestPath('btn_ghost')
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}`));

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => !!(window.game && window.game.scene && window.game.scene.scenes.length),
  { timeout: BOOT_TIMEOUT_MS }
);
await page.waitForFunction(
  () => window.game.scene.scenes.some((sc) => window.game.scene.isActive(sc.scene.key) && sc.sys.isVisible()),
  { timeout: BOOT_TIMEOUT_MS }
);

const measurements = await page.evaluate(async (paths) => {
  const game = window.game;
  const active = game.scene.scenes.filter((sc) => game.scene.isActive(sc.scene.key));
  const scene = active[active.length - 1];
  const TEMP_PREFIX = '__contrast__';

  const isCanvasTexture = (key) => {
    const tex = game.textures.get(key);
    const src = tex && tex.source && tex.source[0];
    return !!(src && src.image && src.image.tagName === 'CANVAS');
  };

  const ensureRealTexture = (key, path) => new Promise((done) => {
    if (game.textures.exists(key) && !isCanvasTexture(key)) return done(true);
    const tempKey = TEMP_PREFIX + key;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (!game.textures.exists(tempKey)) return done(false);
      if (game.textures.exists(key)) game.textures.remove(key);
      game.textures.renameTexture(tempKey, key);
      done(game.textures.exists(key) && !isCanvasTexture(key));
    };
    scene.load.image(tempKey, path);
    scene.load.once('complete', finish);
    scene.load.once('loaderror', () => setTimeout(finish, 0));
    scene.load.start();
    setTimeout(finish, 8000);
  });

  const loaded = {};
  for (const [key, path] of Object.entries(paths)) {
    loaded[key] = await ensureRealTexture(key, path);
  }

  const { UIButton } = await import('/src/components/UIButton.js');
  const { DESIGN } = await import('/src/config/designSystem.js');

  // 호출부와 같은 설정의 버튼 8종. 각 화면이 실제로 쓰는 조합을 그대로 옮겼다
  const SPECS = [
    { name: 'LoginScene 게스트로 시작', variant: 'primary', token: 'body', bold: true, label: '게스트로 시작', w: 480, h: 96 },
    { name: 'LoginScene 계정으로 계속', variant: 'ghost', token: 'body', bold: true, label: '계정으로 계속', w: 480, h: 96, tint: DESIGN.colors.brand.primary },
    { name: 'PopupBase 액션 primary', variant: 'primary', token: 'label', label: '확인', w: 300, h: 84 },
    { name: 'PopupBase 액션 비활성', variant: 'ghost', token: 'label', label: '사용 불가', w: 300, h: 84, disabled: true },
    { name: 'StageSelect 진입', variant: 'primary', token: 'body', label: '진입', w: 240, h: 78 },
    // 라벨은 본문색을 쓴다. 초록(status.success)은 어두운 캡슐 위에서 3:1 아래로 떨어져
    // 프레임 틴트와 번개 아이콘에만 남겼다 — StageSelectScene.createSweepButton 과 동일
    { name: 'StageSelect 소탕', variant: 'ghost', token: 'label', label: '소탕', w: 200, h: 72, tint: DESIGN.colors.status.success, labelOffsetX: 12 },
    { name: 'Gacha 소환 (2줄)', variant: 'primary', token: 'subtitle', subToken: 'caption', label: '10회 소환', sub: '보유 2400', w: 420, h: 150 },
    { name: 'BattleResult 첫 액션', variant: 'primary', token: 'subtitle', bold: true, label: '다시 도전', w: 640, h: 96 }
  ];

  // 화면 안에 세로로 배치한다. 배경 밝기가 자리마다 다른 편이 표본으로 낫다
  const built = SPECS.map((spec, i) => {
    const y = 180 + i * 200;
    const parts = UIButton.createParts(scene, {
      x: 540, y,
      w: spec.w, h: spec.h,
      label: spec.label,
      sub: spec.sub || null,
      variant: spec.variant,
      token: spec.token,
      subToken: spec.subToken,
      bold: spec.bold,
      tint: spec.tint ?? null,
      labelColor: spec.labelColor,
      labelOffsetX: spec.labelOffsetX || 0,
      disabled: spec.disabled === true,
      depth: 9000 + i * 10
    });
    return { spec, parts };
  });

  // 라벨을 전부 숨겨 글자 뒤 배경만 남긴다
  const labels = [];
  built.forEach(({ spec, parts }) => {
    labels.push({ name: spec.name, part: 'label', text: parts.label });
    if (parts.sub) labels.push({ name: `${spec.name} (보조)`, part: 'sub', text: parts.sub });
  });
  labels.forEach((entry) => entry.text.setVisible(false));

  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await nextFrame();

  const snapshotArea = (x, y, w, h) => new Promise((done) => {
    game.renderer.snapshotArea(x, y, w, h, (image) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      done(Array.from(ctx.getImageData(0, 0, w, h).data));
    });
  });

  const results = [];
  for (const entry of labels) {
    const t = entry.text;
    const x = Math.round(t.x - t.displayWidth / 2);
    const y = Math.round(t.y - t.displayHeight / 2);
    const w = Math.max(1, Math.round(t.displayWidth));
    const h = Math.max(1, Math.round(t.displayHeight));
    const pixels = await snapshotArea(x, y, w, h);
    results.push({
      name: entry.name,
      color: t.style.color,
      alpha: t.alpha,
      rect: { x, y, w, h },
      pixels
    });
  }

  labels.forEach((entry) => entry.text.setVisible(true));

  return { loaded, results, sceneKey: scene.scene.key, canvasSize: [game.canvas.width, game.canvas.height] };
}, TEXTURE_PATHS);

await browser.close();

/** sRGB 채널을 선형화한다 (WCAG 2.1) */
function linear(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 상대 휘도 */
function luminance(r, g, b) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function hexChannels(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

/**
 * 라벨 색과 가장 대비가 나쁜 배경 픽셀을 찾는다.
 *
 * 라벨 알파를 반영해 실제로 화면에 찍히는 글자색을 쓴다. 알파를 무시하면
 * 반투명 라벨이 실제보다 잘 읽히는 것처럼 계산된다.
 */
function worstContrast(pixels, labelHex, labelAlpha) {
  const [lr, lg, lb] = hexChannels(labelHex);
  const a = Number.isFinite(labelAlpha) ? labelAlpha : 1;
  let worst = Infinity;
  for (let i = 0; i < pixels.length; i += 4) {
    const br = pixels[i];
    const bg = pixels[i + 1];
    const bb = pixels[i + 2];
    // 알파 합성된 글자색
    const fr = lr * a + br * (1 - a);
    const fg = lg * a + bg * (1 - a);
    const fb = lb * a + bb * (1 - a);
    const ratio = contrast(luminance(fr, fg, fb), luminance(br, bg, bb));
    if (ratio < worst) worst = ratio;
  }
  return worst;
}

const rows = measurements.results.map((entry) => ({
  name: entry.name,
  color: entry.color,
  alpha: entry.alpha,
  ratio: worstContrast(entry.pixels, entry.color, entry.alpha),
  samples: entry.pixels.length / 4
}));

console.log(`\n=== 버튼 라벨 대비 실측 (${measurements.sceneKey}, 캔버스 ${measurements.canvasSize.join('x')}) ===\n`);
console.log('기준: WCAG AA 본문 4.5:1. 값은 라벨 색과 글자 뒤 최악 픽셀의 대비\n');

const width = Math.max(...rows.map((r) => r.name.length));
rows.forEach((row) => {
  const ok = row.ratio >= MIN_CONTRAST;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${row.name.padEnd(width)}  ${row.ratio.toFixed(2)}:1  ${row.color} a${row.alpha.toFixed(2)}  (${row.samples}px)`
  );
});

const textureChecks = Object.entries(measurements.loaded).map(([key, ok]) => [`${key} 텍스처 로드`, ok === true]);
const checks = [
  ...textureChecks,
  ...rows.map((row) => [`${row.name} 대비 ${MIN_CONTRAST}:1 이상`, row.ratio >= MIN_CONTRAST]),
  ['처리되지 않은 예외 0건', pageErrors.length === 0]
];

let failed = 0;
console.log('');
for (const [name, ok] of checks) {
  if (!ok) {
    failed++;
    console.log(`FAIL  ${name}`);
  }
}
if (pageErrors.length) console.log(pageErrors.join('\n'));
console.log(`\n결과: ${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
