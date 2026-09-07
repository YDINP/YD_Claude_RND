/**
 * fixture-parity.test.js — `qa-sweep.mjs` 와 `playtest-fixtures.mjs` 의 계정 픽스처가
 * 어긋나면 **실패한다**.
 *
 * 왜 테스트로 거는가
 *   두 스위트가 서로 다른 계정 모양을 쓰면 "qa-sweep 은 통과하는데 playtest 는 실패한다" 가
 *   결함인지 픽스처 차이인지 알 수 없다. 그래서 `playtest-fixtures.mjs` 는 qa-sweep 의
 *   A/B/C 규약을 복제하고 있다.
 *
 *   복제본 상단에 "같이 고쳐야 한다"는 주석을 달아 뒀지만 **주석은 시간이 지나면 잊힌다**.
 *   한쪽만 고치고 다른 쪽을 잊는 순간 조용히 갈라지고, 그 사실은 몇 주 뒤 원인 불명의
 *   불일치로 되돌아온다. 잊혀도 되도록 여기서 기계적으로 대조한다.
 *
 * 어떻게 대조하는가
 *   `qa-sweep.mjs` 는 import 하는 것만으로 브라우저를 띄우는 실행 스크립트라 불러올 수 없다.
 *   그래서 **두 파일에서 같은 선언을 텍스트로 잘라내 정규화한 뒤 비교**한다.
 *   (eval 로 실행해 값을 비교하는 방법도 시도했지만, Vitest 의 모듈 변환 환경에서
 *    `new Function` 이 안정적으로 동작하지 않아 텍스트 비교로 바꿨다. 텍스트 비교는
 *    서식만 바뀌어도 실패하는 대신, 실패했을 때 무엇이 달라졌는지가 그대로 보인다.)
 *
 * 이 테스트가 실패하면
 *   (a) 두 파일을 다시 맞추거나, (b) 의도적으로 갈라놓기로 했다면 무엇을 왜 다르게 했는지
 *   `playtest-fixtures.mjs` 상단에 적고 이 테스트의 기대를 갱신한다.
 *   그냥 테스트를 지우는 것은 (b) 가 아니다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BASE_IDS, ASC_IDS, legacySave, richSave } from './playtest-fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QA_SWEEP = readFileSync(path.join(HERE, 'qa-sweep.mjs'), 'utf-8');
const PLAYTEST = readFileSync(path.join(HERE, 'playtest-fixtures.mjs'), 'utf-8');

/**
 * 소스에서 이름 붙은 선언 하나를 통째로 잘라낸다.
 *   `function f() {...}`  → 첫 `{` 부터 짝이 맞는 `}` 까지
 *   `const x = ...;`      → 괄호 깊이 0 에서 만나는 첫 `;` 까지
 * (화살표 함수 `const f = (a, b) => ({...});` 가 매개변수 괄호에서 끊기면 안 되므로
 *  괄호 종류를 하나로 묶어 깊이만 세고 세미콜론으로 끝을 잡는다)
 */
function extractDeclaration(source, startPattern) {
  const m = source.match(startPattern);
  if (!m) throw new Error(`선언을 찾지 못했습니다: ${startPattern}`);
  const start = source.indexOf(m[0]);

  if (/function/.test(m[0])) {
    let depth = 0;
    for (let i = source.indexOf('{', start + m[0].length); i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    throw new Error(`함수 본문의 끝을 찾지 못했습니다: ${startPattern}`);
  }

  let depth = 0;
  let quote = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ';' && depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`선언의 끝을 찾지 못했습니다: ${startPattern}`);
}

/**
 * 비교용 정규화 — 두 파일의 차이 중 **의미 없는 것만** 지운다.
 *   export 키워드 · 주석 · 줄바꿈/들여쓰기 · 후행 쉼표
 * 값이나 키가 하나라도 달라지면 남는다.
 */
function normalizeSource(text) {
  return text
    .replace(/^export\s+/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')     // 블록 주석
    .replace(/\/\/[^\n]*/g, '')           // 줄 주석
    .replace(/,(\s*[)\]}])/g, '$1')       // 후행 쉼표
    .replace(/\s+/g, ' ')
    .trim();
}

const pick = (source, pattern) => normalizeSource(extractDeclaration(source, pattern));

describe('계정 픽스처 A/B/C — qa-sweep ↔ playtest 동기화', () => {
  it('영웅 ID 목록(BASE_IDS)이 같다', () => {
    expect(pick(PLAYTEST, /const BASE_IDS\s*=/)).toBe(pick(QA_SWEEP, /const BASE_IDS\s*=/));
  });

  it('영웅 ID 목록(ASC_IDS)이 같다', () => {
    expect(pick(PLAYTEST, /const ASC_IDS\s*=/)).toBe(pick(QA_SWEEP, /const ASC_IDS\s*=/));
  });

  it('영웅 레코드 생성기(heroRecord)가 같다', () => {
    expect(pick(PLAYTEST, /const heroRecord\s*=/)).toBe(pick(QA_SWEEP, /const heroRecord\s*=/));
  });

  it('B(진행 유저) 세이브 정의가 같다', () => {
    expect(pick(PLAYTEST, /function richSave\s*\(/)).toBe(pick(QA_SWEEP, /function richSave\s*\(/));
  });

  it('C(레거시 v1) 세이브 정의가 같다', () => {
    expect(pick(PLAYTEST, /function legacySave\s*\(/)).toBe(pick(QA_SWEEP, /function legacySave\s*\(/));
  });

  // ---- 규약 자체가 지켜지는지 (텍스트가 아니라 실제 값으로) ----

  it('B 는 기본 10 + 전직 24 = 34명, 챕터 3, 튜토리얼 완주', () => {
    const b = richSave();
    expect(BASE_IDS).toHaveLength(10);
    expect(ASC_IDS).toHaveLength(24);
    expect(b.characters).toHaveLength(34);
    expect(b.progress.currentChapter).toBe('chapter_3');
    expect(b.tutorial.completed).toBe(true);
    expect(b.parties[0].filter(Boolean)).toHaveLength(4);
  });

  it('C 는 version 1 이고 tutorial/onboarding/story 섹션이 없다 (마이그레이션 대상)', () => {
    const c = legacySave();
    expect(c.version).toBe(1);
    expect(c.tutorial).toBeUndefined();
    expect(c.onboarding).toBeUndefined();
    expect(c.story).toBeUndefined();
    expect(c.characters.map((h) => h.id)).toEqual(['char_1', 'char_2', 'char_3', 'char_4']);
  });

  it('B 는 신 인벤토리 스키마, C 는 구 배열 — 이 비대칭은 의도된 것이다', () => {
    // B(v2)를 배열로 두면 부팅 때 마이그레이션을 타서 "정상 v2 계정"을 검증하는 픽스처가
    // 하나도 없게 된다. 마이그레이션 경로는 C 가 담당한다. 둘이 같아지면 커버리지가 겹친다.
    const b = richSave();
    expect(Array.isArray(b.inventory)).toBe(false);
    expect(Array.isArray(b.inventory.equipment)).toBe(true);
    expect(Array.isArray(b.inventory.items)).toBe(true);

    const c = legacySave();
    expect(Array.isArray(c.inventory)).toBe(true);
  });

  it('A 는 세이브를 심지 않는다 (직접 플레이해서 만든다)', async () => {
    const { ACCOUNTS } = await import('./playtest-fixtures.mjs');
    expect(ACCOUNTS.A.save).toBeNull();
    expect(typeof ACCOUNTS.B.save).toBe('function');
    expect(typeof ACCOUNTS.C.save).toBe('function');
  });
});
