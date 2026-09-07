/**
 * HeroGrowthRefresh.test.js — 라이브 P0/P1
 *
 * 세 가지 계약을 소스에 고정한다. 두 파일 모두 phaser 를 import 하므로
 * vitest node 환경에서 씬을 만들 수 없다 — 계약이 코드에 남아 있는지를 검사한다.
 * (수치·문자열 규칙 자체는 utils/heroDetailLayout.test.js 가 실행해서 검증한다)
 *
 *   1. 메인 메뉴가 씬 재시작마다 팝업 소유권을 비운다
 *      — 안 비우면 파괴된 팝업 참조가 남아 `openPopup` 가드가 영영 안 풀린다
 *   2. 레벨업이 씬을 재시작하지 않는다 (부분 갱신)
 *   3. 진화 판정이 원본 rarity 가 아니라 정규화된 등급 키를 쓴다
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf-8');

const MENU = read('src/scenes/MainMenuScene.js');
const DETAIL = read('src/scenes/HeroDetailScene.js');

/** 메서드 본문만 잘라낸다 (중괄호 깊이 세기) */
function methodBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return '';
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

describe('메인 메뉴 팝업 소유권', () => {
  it('init() 이 activePopup 과 activePopupKey 를 함께 비운다', () => {
    const body = methodBody(MENU, '  init(data) {');

    expect(body).toContain('this.activePopup = null;');
    expect(body).toContain('this.activePopupKey = null;');
  });

  it('openPopup 가드는 그대로 남는다 — 중복 오픈은 여전히 막아야 한다', () => {
    expect(MENU).toContain('if (this.activePopup) return;');
  });
});

describe('레벨업 부분 갱신', () => {
  it('levelUpHero 가 씬을 재시작하지 않고 applyGrowthUpdate 를 부른다', () => {
    const body = methodBody(DETAIL, '  levelUpHero() {');

    expect(body).toContain('this.applyGrowthUpdate();');
    expect(body).not.toContain('this.refresh(');
    expect(body).not.toContain('scene.restart');
  });

  it('autoLevelUp 도 씬을 재시작하지 않는다', () => {
    const body = methodBody(DETAIL, '  autoLevelUp() {');

    expect(body).toContain('this.applyGrowthUpdate();');
    expect(body).not.toContain('this.refresh(');
  });

  it('레벨업 연출이 씬의 모든 트윈을 세우지 않는다 — 상시 루프까지 멈췄었다', () => {
    const body = methodBody(DETAIL, '  showLevelUpEffect() {');

    expect(body).toContain('this.clearLevelUpEffect();');
    expect(body).not.toContain('stopAllActiveTweens');
  });

  it('applyGrowthUpdate 는 텍스트만 갈아끼운다 (add.text/graphics 를 새로 만들지 않는다)', () => {
    const body = methodBody(DETAIL, '  applyGrowthUpdate() {');

    expect(body).toContain('setText');
    expect(body).not.toContain('this.add.');
    expect(body).not.toContain('scene.restart');
  });

  it('탭을 갈아끼울 때 부분 갱신 참조도 함께 비운다', () => {
    const body = methodBody(DETAIL, '  clearTabObjects() {');

    ['statValueTexts', 'statBars', 'expText', 'expLevelText', 'expBar'].forEach((ref) => {
      expect(body).toContain(`this.${ref} = null;`);
    });
  });
});

describe('진화 판정', () => {
  it('정규화된 등급 키로 판정한다 — 기본 영웅에는 rarity 필드가 없다', () => {
    const body = methodBody(DETAIL, '  evolveHero() {');

    expect(body).toContain('EvolutionSystem.isMaxRarity(this.rarityKey)');
    expect(body).toContain('EvolutionSystem.getEvolutionCost(this.rarityKey)');
    expect(body).not.toContain('this.hero.rarity');
  });

  it('비용 조회가 null 일 때 안내하고 멈춘다', () => {
    const body = methodBody(DETAIL, '  evolveHero() {');

    expect(body).toMatch(/if \(!cost\)/);
  });

  it('조각은 세이브(SSOT)에서 읽는다 — registry 에 캐시가 없으면 0 이 아니었어야 한다', () => {
    const body = methodBody(DETAIL, '  getShardCount() {');

    expect(body).toContain('EvolutionSystem.getShards(this.hero.id)');
    expect(methodBody(DETAIL, '  evolveHero() {')).toContain('this.getShardCount()');
  });
});
