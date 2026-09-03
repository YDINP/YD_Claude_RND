/**
 * GachaOverlayOwnership.test.js — QA P1-3
 *
 * 소환 결과 오버레이(depth 3010, 씬 루트)는 팝업이 닫힌 뒤에도 살아남을 수 있다.
 * 주인이 사라진 오버레이는 전면 입력을 삼켜 그 아래 화면을 조작 불가로 만든다.
 * 회수 계약은 세 지점에 걸쳐 있다.
 *   1. 오버레이가 자기 루트에 이름을 붙이고 역참조를 남긴다
 *   2. 팝업이 소유권을 놓을 때 씬 shutdown/destroy 고리를 다시 건다
 *   3. 메인 메뉴가 팝업을 열 때 주인 없는 오버레이를 파괴한다
 *
 * 세 파일 모두 phaser 를 import 하므로 vitest node 환경에서 인스턴스화할 수 없다.
 * 계약이 소스에 남아 있는지를 검사한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf-8');

const OVERLAY = read('src/components/GachaResultOverlay.js');
const POPUP = read('src/components/popups/GachaPopup.js');
const SCENE = read('src/scenes/MainMenuScene.js');

describe('소환 결과 오버레이 소유권 · 회수', () => {
  it('오버레이가 루트에 식별 가능한 이름과 역참조를 남긴다', () => {
    expect(OVERLAY).toMatch(/export const OVERLAY_ROOT_NAME\s*=/);
    expect(OVERLAY).toContain('this.root.setName(OVERLAY_ROOT_NAME)');
    expect(OVERLAY).toContain('this.root.__gachaResultOverlay = this');
  });

  it('오버레이의 씬 종료 고리 등록이 멱등 메서드로 분리되어 show() 에서 걸린다', () => {
    expect(OVERLAY).toMatch(/ensureSceneCleanup\(\)\s*\{/);
    expect(OVERLAY).toContain('this.ensureSceneCleanup();');
    expect(OVERLAY).toMatch(/ensureSceneCleanup\(\)[\s\S]*?events\.once\('shutdown'/);
    expect(OVERLAY).toMatch(/ensureSceneCleanup\(\)[\s\S]*?events\.once\('destroy'/);
  });

  it('팝업이 소유권을 놓을 때 씬 종료 고리를 다시 건다', () => {
    const detach = POPUP.slice(POPUP.indexOf('_detachSummonOverlay() {'));
    expect(detach).toContain('overlay.ensureSceneCleanup?.()');
  });

  it('팝업 destroy() 가 소유권 해제를 반드시 거친다', () => {
    expect(POPUP).toMatch(/destroy\(\)\s*\{\s*\n\s*this\._detachSummonOverlay\(\);/);
  });

  it('메인 메뉴가 이름으로 고아 오버레이를 골라 인스턴스째 파괴한다', () => {
    expect(SCENE).toContain('OVERLAY_ROOT_NAME as GACHA_OVERLAY_NAME');
    expect(SCENE).toMatch(/collectOrphanOverlays\(\)\s*\{/);
    expect(SCENE).toContain('obj.name === GACHA_OVERLAY_NAME');
    expect(SCENE).toContain('obj.__gachaResultOverlay');
    // 살아 있는 팝업이 소유한 오버레이는 건드리지 않는다
    expect(SCENE).toContain('this.activePopup?.resultOverlay');
  });

  it('팝업·영웅 정보 진입 경로가 고아 회수를 먼저 돌린다', () => {
    expect(SCENE).toMatch(/openPopup\(key\)\s*\{[\s\S]*?this\.destroyOrphanPopups\(\);/);
    expect(SCENE).toMatch(/openHeroInfo\(heroId\)\s*\{\s*\n\s*this\.destroyOrphanPopups\(\);/);
  });
});
