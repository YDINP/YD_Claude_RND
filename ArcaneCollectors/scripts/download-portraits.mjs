/**
 * DiceBear API를 사용하여 91개 영웅 초상화를 다운로드합니다.
 * 스타일: adventurer (판타지 RPG에 적합)
 * 포맷: PNG 256x256
 *
 * 각 영웅의 cult/class/mood 조합으로 고유한 seed를 생성하여
 * 일관되면서도 다양한 초상화를 만듭니다.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const PORTRAITS_DIR = join(import.meta.dirname, '..', 'public', 'assets', 'characters', 'portraits');
const CHARS_PATH = join(import.meta.dirname, '..', 'src', 'data', 'characters.json');

// DiceBear adventurer 스타일 옵션
// https://www.dicebear.com/styles/adventurer/
const STYLE = 'adventurer';
const SIZE = 256;
const FORMAT = 'png';

// cult별 배경색 (0x 제거한 hex)
const CULT_BG = {
  olympus:      'b3d4fc',  // 하늘색 (그리스 신전)
  takamagahara: 'fce4ec',  // 연분홍 (일본 신전)
  yomi:         'd1c4e9',  // 연보라 (요미)
  valhalla:     'bbdefb',  // 밝은 파랑 (북유럽)
  asgard:       'fff9c4',  // 밝은 금색 (아스가르드)
  tartarus:     'ffccbc',  // 연한 주황 (타르타로스)
  avalon:       'c8e6c9',  // 연초록 (아발론)
  helheim:      'cfd8dc',  // 회색 (헬하임)
  kunlun:       'ffe0b2',  // 연한 오렌지 (곤륜)
};

// class별 머리 장식 힌트 (seed에 반영)
const CLASS_HINT = {
  warrior: 'sword-shield',
  mage:    'magic-staff',
  healer:  'holy-light',
  archer:  'bow-arrow',
};

async function downloadPortrait(heroId, seed, bgColor) {
  const url = `https://api.dicebear.com/9.x/${STYLE}/${FORMAT}?seed=${encodeURIComponent(seed)}&size=${SIZE}&backgroundColor=${bgColor}`;
  const outPath = join(PORTRAITS_DIR, `${heroId}.png`);

  if (existsSync(outPath)) {
    console.log(`  SKIP ${heroId} (already exists)`);
    return true;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  FAIL ${heroId}: HTTP ${res.status}`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(outPath, buffer);
    console.log(`  OK   ${heroId} (${buffer.length} bytes)`);
    return true;
  } catch (err) {
    console.error(`  ERR  ${heroId}: ${err.message}`);
    return false;
  }
}

async function main() {
  // 디렉토리 확인
  if (!existsSync(PORTRAITS_DIR)) {
    mkdirSync(PORTRAITS_DIR, { recursive: true });
  }

  // 캐릭터 데이터 로드
  const data = JSON.parse(readFileSync(CHARS_PATH, 'utf-8'));
  const characters = data.characters;
  console.log(`\n=== DiceBear 초상화 다운로드 ===`);
  console.log(`총 ${characters.length}명 | 스타일: ${STYLE} | 크기: ${SIZE}x${SIZE}\n`);

  let success = 0;
  let fail = 0;

  // 속도 제한: PNG는 10req/s → 배치 5개씩, 150ms 간격
  const BATCH_SIZE = 5;
  const DELAY_MS = 200;

  for (let i = 0; i < characters.length; i += BATCH_SIZE) {
    const batch = characters.slice(i, i + BATCH_SIZE);
    const promises = batch.map(hero => {
      // seed: nameEn + cult + class + mood 조합으로 고유성 보장
      const seed = `${hero.nameEn}-${hero.cult}-${hero.class}-${hero.mood}-${hero.rarity}star`;
      const bgColor = CULT_BG[hero.cult] || 'f5f5f5';
      return downloadPortrait(hero.id, seed, bgColor);
    });

    const results = await Promise.all(promises);
    results.forEach(ok => ok ? success++ : fail++);

    // 속도 제한 대기
    if (i + BATCH_SIZE < characters.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`성공: ${success} | 실패: ${fail} | 총: ${characters.length}`);
  console.log(`저장 위치: ${PORTRAITS_DIR}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
