/**
 * stagesEnemies.test.js
 * stages.json이 참조하는 적 데이터가 enemies.json에 온전히 존재하는지 검증한다.
 * (T-D1: BLK-01 / LV-ISS-05 회귀 방지)
 *
 * vi.mock을 우회하고 실제 파일을 fs로 직접 읽는다 (TowerSystem.test.js TOWER-02 패턴 참고).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const stages = JSON.parse(
  readFileSync(new URL('../../src/data/stages.json', import.meta.url), 'utf-8')
);
const enemiesData = JSON.parse(
  readFileSync(new URL('../../src/data/enemies.json', import.meta.url), 'utf-8')
);

const enemies = enemiesData.enemies;
const enemyById = new Map(enemies.map((e) => [e.id, e]));

// 챕터별 스테이지가 참조하는 적 id 전부(중복 제거) + 챕터의 보스 id(stage.enemies[].isBoss === true)
function collectChapterRefs() {
  const perChapter = new Map();
  for (const chapter of stages.chapters) {
    const refIds = new Set();
    const bossIds = new Set();
    for (const stage of chapter.stages) {
      for (const enemyRef of stage.enemies) {
        refIds.add(enemyRef.id);
        if (enemyRef.isBoss) {
          bossIds.add(enemyRef.id);
        }
      }
    }
    perChapter.set(chapter.id, { refIds, bossIds });
  }
  return perChapter;
}

describe('stages.json ↔ enemies.json 무결성 (real files)', () => {
  it('stages.json이 참조하는 모든 적 id가 enemies.json에 존재한다', () => {
    const missing = [];
    for (const chapter of stages.chapters) {
      for (const stage of chapter.stages) {
        for (const enemyRef of stage.enemies) {
          if (!enemyById.has(enemyRef.id)) {
            missing.push(`${chapter.id}/${stage.id}: ${enemyRef.id}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('enemies.json에 id 중복이 없다', () => {
    const ids = enemies.map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('모든 적에 stats(hp/atk/def/spd) 4키가 전부 존재한다', () => {
    const invalid = enemies
      .filter((e) => {
        const s = e.stats;
        if (!s) return true;
        return ['hp', 'atk', 'def', 'spd'].some((k) => typeof s[k] !== 'number');
      })
      .map((e) => e.id);
    expect(invalid).toEqual([]);
  });

  it('챕터별 보스(stage.enemies[].isBoss === true)의 HP가 같은 챕터 잡몹 평균 HP보다 크다', () => {
    const perChapter = collectChapterRefs();
    expect(perChapter.size).toBeGreaterThan(0);

    for (const [chapterId, { refIds, bossIds }] of perChapter) {
      expect(bossIds.size).toBeGreaterThan(0);

      const mobIds = [...refIds].filter((id) => !bossIds.has(id));
      expect(mobIds.length).toBeGreaterThan(0);

      const mobAvgHp =
        mobIds.reduce((sum, id) => sum + enemyById.get(id).stats.hp, 0) / mobIds.length;

      for (const bossId of bossIds) {
        const bossHp = enemyById.get(bossId).stats.hp;
        expect(
          bossHp,
          `${chapterId} 보스 ${bossId}(hp=${bossHp})가 잡몹 평균 hp(${mobAvgHp})보다 커야 한다`
        ).toBeGreaterThan(mobAvgHp);
      }
    }
  });
});
