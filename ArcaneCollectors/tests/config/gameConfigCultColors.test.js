/**
 * gameConfigCultColors.test.js
 * A11Y_AUDIT 2026-09-03 후속 — gameConfig.js 의 교단 색 리터럴이
 * cults.json(SSOT)과 다시 어긋나지 않도록 잠근다.
 *
 * gameConfig.js 는 씬 전체 + Phaser 를 import하는 TDZ 허브라 vitest(node 환경)에서
 * 직접 import 하면 `window is not defined` 로 깨진다. 그래서 이 파일은 gameConfig.js 를
 * import 하지 않고 소스를 텍스트로 읽어 COLORS.cult / CULT_COLORS 리터럴을 파싱해 비교한다.
 * (onboardingConfig.test.js 가 SaveManager.js 를 다루는 방식과 동일한 패턴)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const gameConfigSource = readFileSync(
  new URL('../../src/config/gameConfig.js', import.meta.url), 'utf-8'
);
const cultsData = JSON.parse(
  readFileSync(new URL('../../src/data/cults.json', import.meta.url), 'utf-8')
);

/** '#RRGGBB' → 0xRRGGBB (number) */
function cssToHex(css) {
  return parseInt(css.replace('#', ''), 16);
}

/** 소스에서 `blockName: { key: 0xHEX, ... }` 형태의 블록을 찾아 { key: number } 로 파싱한다 */
function parseColorBlock(source, blockStartPattern) {
  const startMatch = blockStartPattern.exec(source);
  expect(startMatch, `소스에서 '${blockStartPattern}' 블록을 찾지 못했다`).not.toBeNull();
  const braceStart = source.indexOf('{', startMatch.index);
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  const body = source.slice(braceStart + 1, i);
  const result = {};
  const entryRegex = /(\w+):\s*(0x[0-9A-Fa-f]+)/g;
  let m;
  while ((m = entryRegex.exec(body)) !== null) {
    result[m[1]] = parseInt(m[2], 16);
  }
  return result;
}

const colorsCult = parseColorBlock(gameConfigSource, /cult:\s*\{/);
const cultColors = parseColorBlock(gameConfigSource, /export const CULT_COLORS = \{/);

describe('gameConfig.js 교단 색 ↔ cults.json SSOT 동기화', () => {
  it('파싱된 COLORS.cult / CULT_COLORS 가 비어있지 않다 (파서 회귀 감시)', () => {
    expect(Object.keys(colorsCult).length).toBeGreaterThan(0);
    expect(Object.keys(cultColors).length).toBeGreaterThan(0);
  });

  it('COLORS.cult 의 모든 항목이 cults.json color 와 일치한다', () => {
    for (const [cultId, hex] of Object.entries(colorsCult)) {
      const expected = cultsData.cults[cultId];
      expect(expected, `cults.json 에 '${cultId}' 항목이 없다`).toBeDefined();
      expect(hex, `COLORS.cult.${cultId}`).toBe(cssToHex(expected.color));
    }
  });

  it('CULT_COLORS 의 모든 항목이 cults.json color 와 일치한다', () => {
    for (const [cultId, hex] of Object.entries(cultColors)) {
      const expected = cultsData.cults[cultId];
      expect(expected, `cults.json 에 '${cultId}' 항목이 없다`).toBeDefined();
      expect(hex, `CULT_COLORS.${cultId}`).toBe(cssToHex(expected.color));
    }
  });

  it('COLORS.cult 와 CULT_COLORS 는 서로 동일한 값을 가진다', () => {
    const sharedKeys = Object.keys(colorsCult).filter((k) => k in cultColors);
    expect(sharedKeys.length).toBeGreaterThan(0);
    for (const cultId of sharedKeys) {
      expect(cultColors[cultId], cultId).toBe(colorsCult[cultId]);
    }
  });
});
