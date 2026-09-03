/**
 * PopupTabStrip.test.js — QA P1-2
 *
 * 탭 팝업 4종(PvP·길드·레이드·친구)의 `_renderTabs()` 는 매 탭 전환마다 다시 불린다.
 * 만든 오브젝트를 `_tabObjects` 에 넣지 않으면 `_clearTabContent()` 가 회수하지 못해
 * 탭 스트립이 한 벌씩 쌓인다(열자마자 2벌, 전환마다 +1벌). PvP·길드가 그 상태였다.
 *
 * 팝업 클래스는 PopupBase → phaser 를 import 하므로 vitest node 환경에서 인스턴스화할 수 없다.
 * 그래서 소스의 `_renderTabs()` 본문을 읽어 **생성-등록 짝**이 맞는지 검사한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** 탭 스트립을 매 전환마다 다시 그리는 팝업들 */
const TAB_POPUPS = ['PvPPopup', 'GuildPopup', 'RaidPopup', 'FriendsPopup'];

/** 파일 전체 소스 */
function readPopup(name) {
  return readFileSync(resolve(ROOT, `src/components/popups/${name}.js`), 'utf-8');
}

/**
 * `_renderTabs()` 본문을 중괄호 균형으로 잘라낸다.
 * @param {string} src
 * @returns {string}
 */
function renderTabsBody(src) {
  const start = src.indexOf('_renderTabs() {');
  if (start < 0) return '';
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

/** 본문에서 `const X = this.scene.add.…` 로 만든 지역 변수 이름 */
function createdLocals(body) {
  return [...body.matchAll(/const\s+(\w+)\s*=\s*this\.scene\.add\./g)].map(m => m[1]);
}

describe('탭 팝업의 탭 스트립 수명', () => {
  it.each(TAB_POPUPS)('%s._renderTabs() 가 존재한다', (name) => {
    expect(renderTabsBody(readPopup(name))).not.toBe('');
  });

  it.each(TAB_POPUPS)('%s: _renderTabs() 가 만든 오브젝트를 전부 _tabObjects 에 등록한다', (name) => {
    const body = renderTabsBody(readPopup(name));
    const locals = createdLocals(body);

    expect(locals.length).toBeGreaterThan(0);
    locals.forEach((local) => {
      expect(body).toContain(`this._tabObjects.push(${local})`);
    });
  });

  it.each(TAB_POPUPS)('%s: _clearTabContent() 가 _tabObjects 를 파괴하고 비운다', (name) => {
    const src = readPopup(name);
    expect(src).toMatch(/_clearTabContent\(\)\s*\{[\s\S]*?this\._tabObjects\s*=\s*\[\]/);
    expect(src).toMatch(/_clearTabContent\(\)\s*\{[\s\S]*?destroy\(\)/);
  });

  it.each(TAB_POPUPS)('%s: 탭 전환 경로가 _clearTabContent 뒤에 _renderTabs 를 부른다', (name) => {
    const src = readPopup(name);
    const clearAt = src.indexOf('this._clearTabContent();');
    const renderAt = src.indexOf('this._renderTabs();', clearAt);

    expect(clearAt).toBeGreaterThan(-1);
    expect(renderAt).toBeGreaterThan(clearAt);
  });
});
