#!/usr/bin/env node
/**
 * ============================================================
 * BAL-BLK03 밸런스 v1 기계 적용 스크립트
 * ============================================================
 *
 * docs/balance/balance-changes-v1.json 을 읽어 실제 데이터 파일에
 * "값만" 적용한다. 스키마 변경 없음, 값 외 필드는 절대 건드리지 않는다.
 *
 * 대상 파일 4종:
 *   - src/data/stages.json          (chapters[].stages[].recommendedPower)
 *   - src/data/tower.json           (floors[].recommendedPower)
 *   - src/data/ascended-heroes.json (ascendedHeroes[].stats / growthStats)
 *   - src/data/enemies.json         (enemies[].stats / growthStats, v1.3부터)
 *
 * ── path 표기 관례 (balance-changes-v1.json) ──────────────────────────
 * balance-changes-v1.json의 path 문자열은 "requirePower"로 표기하지만
 * 실제 src/data/stages.json 필드명은 recommendedPower다 (design doc
 * §8-3 assert 예시도 recommendedPower를 씀 — 문서 오탈자). 이 스크립트는
 * 항상 실제 필드명(recommendedPower)에 적용하며, stages[N]의 N은
 * chapters[].stages[] 를 순서대로 이어붙인(flatten) 0-based 인덱스다.
 *
 * ascendedHeroes[id=X].fieldPath 표기는 ascendedHeroes 배열에서
 * id===X인 객체를 찾아 fieldPath(점 표기, 예: stats.hp)를 그 객체에 적용한다.
 *
 * floors[*].recommendedPower 는 change.to.floorRecommendedPower (100개 배열,
 * 인덱스 0 = 층1)을 floors[i].recommendedPower = floorRecommendedPower[i]로
 * 전부 대입하는 벌크 변경으로 처리한다.
 *
 * enemies[id=X].fieldPath 표기는 src/data/enemies.json의 enemies 배열에서
 * id===X인 객체를 찾아 fieldPath(점 표기, 예: stats.hp, growthStats.def)를
 * 그 객체에 적용한다 (v1.3, ascendedHeroes와 동일한 규칙).
 *
 * 사용법:
 *   node tools/balance/apply-changes.mjs                          # v1 적용 + 저장
 *   node tools/balance/apply-changes.mjs --dry-run                # 미리보기만, 저장 안 함
 *   node tools/balance/apply-changes.mjs --file balance-changes-v1.1.json  # 다른 델타 파일 적용
 *   (--file은 docs/balance/ 기준 상대경로 또는 절대경로 모두 허용. v1.1 이후 델타 파일도
 *    동일 스크립트로 적용한다 — 데이터 파일 손편집 금지 원칙 유지)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const BALANCE_DOCS_DIR = path.join(ROOT, 'docs', 'balance');

const DRY_RUN = process.argv.includes('--dry-run');

const fileArgIdx = process.argv.indexOf('--file');
const CHANGES_FILE_NAME = fileArgIdx >= 0 ? process.argv[fileArgIdx + 1] : 'balance-changes-v1.json';
const CHANGES_PATH = path.isAbsolute(CHANGES_FILE_NAME)
  ? CHANGES_FILE_NAME
  : path.join(BALANCE_DOCS_DIR, CHANGES_FILE_NAME);

const STAGES_PATH = path.join(ROOT, 'src', 'data', 'stages.json');
const TOWER_PATH = path.join(ROOT, 'src', 'data', 'tower.json');
const HEROES_PATH = path.join(ROOT, 'src', 'data', 'ascended-heroes.json');
const ENEMIES_PATH = path.join(ROOT, 'src', 'data', 'enemies.json');

const STAGE_RE = /^stages\[(\d+)\]\.requirePower$/;
const HERO_RE = /^ascendedHeroes\[id=([^\]]+)\]\.(.+)$/;
const ENEMY_RE = /^enemies\[id=([^\]]+)\]\.(.+)$/;

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeJson(p, data) {
  // 기존 파일들은 2칸 들여쓰기 + 마지막 개행 포맷을 쓴다. 통일해 저장.
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function flattenStages(stagesData) {
  const flat = [];
  for (const chapter of stagesData.chapters) {
    for (const stage of chapter.stages) {
      flat.push(stage);
    }
  }
  return flat;
}

function applyStageChange(stagesData, change, results, warnings) {
  const m = STAGE_RE.exec(change.path);
  const idx = Number(m[1]);
  const flat = flattenStages(stagesData);
  const stage = flat[idx];
  if (!stage) {
    throw new Error(`[stages] 인덱스 ${idx}에 해당하는 스테이지가 없습니다 (path=${change.path})`);
  }

  const before = stage.recommendedPower;
  if (before !== change.from) {
    warnings.push(
      `[WARN] ${change.path} (${stage.id}.recommendedPower): 문서 from=${change.from}, 실제 현재값=${before} — 값 불일치, from 검증 실패`
    );
  }

  results.push({
    file: 'src/data/stages.json',
    fieldPath: `${stage.id}.recommendedPower`,
    from: before,
    to: change.to
  });

  stage.recommendedPower = change.to;
}

function applyTowerChange(towerData, change, results, warnings) {
  const arr = change.to?.floorRecommendedPower;
  if (!Array.isArray(arr) || arr.length !== towerData.floors.length) {
    throw new Error(
      `[tower] floorRecommendedPower 배열 길이(${arr?.length})가 floors 길이(${towerData.floors.length})와 다릅니다`
    );
  }

  towerData.floors.forEach((floorEntry, i) => {
    const before = floorEntry.recommendedPower;
    const after = arr[i];
    results.push({
      file: 'src/data/tower.json',
      fieldPath: `floors[${i}](floor ${floorEntry.floor}).recommendedPower`,
      from: before,
      to: after
    });
    floorEntry.recommendedPower = after;
  });
}

function applyHeroChange(heroesData, change, results, warnings) {
  const m = HERO_RE.exec(change.path);
  const heroId = m[1];
  const fieldKeys = m[2].split('.');

  const hero = heroesData.ascendedHeroes.find(h => h.id === heroId);
  if (!hero) {
    throw new Error(`[ascended-heroes] id=${heroId} 를 찾을 수 없습니다 (path=${change.path})`);
  }

  let cursor = hero;
  for (let i = 0; i < fieldKeys.length - 1; i++) {
    cursor = cursor[fieldKeys[i]];
    if (cursor == null) {
      throw new Error(`[ascended-heroes] ${heroId}.${fieldKeys.slice(0, i + 1).join('.')} 경로가 존재하지 않습니다`);
    }
  }
  const lastKey = fieldKeys[fieldKeys.length - 1];
  const before = cursor[lastKey];

  if (before !== change.from) {
    warnings.push(
      `[WARN] ${change.path}: 문서 from=${change.from}, 실제 현재값=${before} — 값 불일치, from 검증 실패`
    );
  }

  results.push({
    file: 'src/data/ascended-heroes.json',
    fieldPath: change.path,
    from: before,
    to: change.to
  });

  cursor[lastKey] = change.to;
}

function applyEnemyChange(enemiesData, change, results, warnings) {
  const m = ENEMY_RE.exec(change.path);
  const enemyId = m[1];
  const fieldKeys = m[2].split('.');

  const enemy = enemiesData.enemies.find(e => e.id === enemyId);
  if (!enemy) {
    throw new Error(`[enemies] id=${enemyId} 를 찾을 수 없습니다 (path=${change.path})`);
  }

  let cursor = enemy;
  for (let i = 0; i < fieldKeys.length - 1; i++) {
    cursor = cursor[fieldKeys[i]];
    if (cursor == null) {
      throw new Error(`[enemies] ${enemyId}.${fieldKeys.slice(0, i + 1).join('.')} 경로가 존재하지 않습니다`);
    }
  }
  const lastKey = fieldKeys[fieldKeys.length - 1];
  const before = cursor[lastKey];

  if (before !== change.from) {
    warnings.push(
      `[WARN] ${change.path}: 문서 from=${change.from}, 실제 현재값=${before} — 값 불일치, from 검증 실패`
    );
  }

  results.push({
    file: 'src/data/enemies.json',
    fieldPath: change.path,
    from: before,
    to: change.to
  });

  cursor[lastKey] = change.to;
}

function main() {
  const rawChanges = loadJson(CHANGES_PATH);
  const changes = rawChanges.filter(c => c.path && c.to !== undefined);

  const stagesData = loadJson(STAGES_PATH);
  const towerData = loadJson(TOWER_PATH);
  const heroesData = loadJson(HEROES_PATH);
  const enemiesData = loadJson(ENEMIES_PATH);

  const results = [];
  const warnings = [];
  const skipped = [];

  for (const change of changes) {
    if (STAGE_RE.test(change.path)) {
      applyStageChange(stagesData, change, results, warnings);
    } else if (change.path === 'floors[*].recommendedPower') {
      applyTowerChange(towerData, change, results, warnings);
    } else if (HERO_RE.test(change.path)) {
      applyHeroChange(heroesData, change, results, warnings);
    } else if (ENEMY_RE.test(change.path)) {
      applyEnemyChange(enemiesData, change, results, warnings);
    } else {
      skipped.push(change.path);
    }
  }

  console.log(`적용 파일: ${CHANGES_PATH}`);
  console.log(`항목: ${changes.length}건 (JSON 엔트리 기준)`);
  console.log(`실제 필드 쓰기: ${results.length}건 (탑 벌크 변경 100개 포함)`);
  console.log(`모드: ${DRY_RUN ? 'dry-run (미저장)' : 'write (저장)'}`);
  console.log('');

  if (skipped.length > 0) {
    console.log(`[SKIP] 알 수 없는 path 패턴 ${skipped.length}건:`);
    skipped.forEach(p => console.log(`  - ${p}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`경고 ${warnings.length}건:`);
    warnings.forEach(w => console.log(`  ${w}`));
    console.log('');
  } else {
    console.log('경고 없음 — 모든 from 값이 문서와 일치.');
    console.log('');
  }

  // diff 요약: 파일별 건수 + 앞뒤 몇 건 미리보기
  const byFile = new Map();
  for (const r of results) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }

  for (const [file, items] of byFile) {
    console.log(`## ${file} — ${items.length}건`);
    const preview = items.length > 12 ? [...items.slice(0, 6), null, ...items.slice(-6)] : items;
    for (const item of preview) {
      if (item === null) {
        console.log(`  ... (${items.length - 12}건 생략) ...`);
        continue;
      }
      console.log(`  ${item.fieldPath}: ${item.from} -> ${item.to}`);
    }
    console.log('');
  }

  if (!DRY_RUN) {
    writeJson(STAGES_PATH, stagesData);
    writeJson(TOWER_PATH, towerData);
    writeJson(HEROES_PATH, heroesData);
    writeJson(ENEMIES_PATH, enemiesData);
    console.log('파일 저장 완료: stages.json, tower.json, ascended-heroes.json, enemies.json');
  } else {
    console.log('(dry-run — 파일 미저장. 저장하려면 --dry-run 옵션 없이 재실행)');
  }

  if (warnings.length > 0) {
    process.exitCode = 1;
  }
}

main();
