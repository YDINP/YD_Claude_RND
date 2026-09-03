import fs from 'node:fs';

const SKILLS_PATH = 'src/data/skills.json';
const HEROES_PATH = 'src/data/base-heroes.json';

const skillsData = JSON.parse(fs.readFileSync(SKILLS_PATH, 'utf-8'));
const heroesData = JSON.parse(fs.readFileSync(HEROES_PATH, 'utf-8'));

// ---------- skills.json 카탈로그 신규 엔트리 (기존 스키마: id/name/nameEn/description/type/target/multiplier/cooldown/effects) ----------
const NEW_CATALOG_SKILLS = [
  {
    id: 'skill_iris_flash_strike',
    name: '섬광 베기',
    nameEn: 'Flash Strike',
    description: '적 1명에게 공격력의 140%의 번개 데미지를 입힌다',
    type: 'active',
    target: 'enemy_single',
    multiplier: 1.4,
    cooldown: 3,
    effects: []
  },
  {
    id: 'skill_sera_healing_touch',
    name: '치유의 손길',
    nameEn: 'Healing Touch',
    description: 'HP가 가장 낮은 아군 1명의 HP를 공격력의 130%만큼 회복한다',
    type: 'active',
    target: 'ally_single',
    multiplier: 1.3,
    cooldown: 3,
    effects: []
  },
  {
    id: 'skill_luca_arcane_bolt',
    name: '비전탄',
    nameEn: 'Arcane Bolt',
    description: '적 1명에게 공격력의 140%의 마법 데미지를 입힌다',
    type: 'active',
    target: 'enemy_single',
    multiplier: 1.4,
    cooldown: 3,
    effects: []
  },
  {
    id: 'skill_kai_execute',
    name: '급소 일격',
    nameEn: 'Vital Strike',
    description: '적 1명에게 공격력의 140%의 데미지를 입힌다. 빈사 상태의 적에게 더욱 치명적이다',
    type: 'active',
    target: 'enemy_single',
    multiplier: 1.4,
    cooldown: 3,
    effects: []
  },
  {
    id: 'skill_lin_oracle_blessing',
    name: '신탁의 가호',
    nameEn: "Oracle's Blessing",
    description: 'HP가 가장 낮은 아군 1명의 HP를 공격력의 130%만큼 회복한다',
    type: 'active',
    target: 'ally_single',
    multiplier: 1.3,
    cooldown: 3,
    effects: []
  },
  {
    id: 'skill_omar_shield_bash',
    name: '방패 강타',
    nameEn: 'Shield Bash',
    description: '적 1명에게 공격력의 130%의 데미지를 입힌다',
    type: 'active',
    target: 'enemy_single',
    multiplier: 1.3,
    cooldown: 3,
    effects: []
  },
  {
    id: 'skill_sol_piercing_shot',
    name: '관통 사격',
    nameEn: 'Piercing Shot',
    description: '적 1명에게 공격력의 135%의 관통 데미지를 입힌다',
    type: 'active',
    target: 'enemy_single',
    multiplier: 1.35,
    cooldown: 3,
    effects: []
  },
  {
    id: 'skill_hana_curse_touch',
    name: '저주의 손길',
    nameEn: 'Curse Touch',
    description: '적 1명에게 공격력의 140%의 저주 데미지를 입힌다',
    type: 'active',
    target: 'enemy_single',
    multiplier: 1.4,
    cooldown: 3,
    effects: []
  },
  {
    id: 'skill_leon_rune_strike',
    name: '룬 강타',
    nameEn: 'Rune Strike',
    description: '적 1명에게 공격력의 135%의 데미지를 입힌다',
    type: 'active',
    target: 'enemy_single',
    multiplier: 1.35,
    cooldown: 3,
    effects: []
  },
  {
    id: 'skill_paolo_disintegrate',
    name: '분해의 마법',
    nameEn: 'Disintegrate',
    description: '적 1명에게 공격력의 135%의 데미지를 입힌다',
    type: 'active',
    target: 'enemy_single',
    multiplier: 1.35,
    cooldown: 3,
    effects: []
  }
];

const existingIds = new Set(skillsData.skills.map(s => s.id));
for (const s of NEW_CATALOG_SKILLS) {
  if (existingIds.has(s.id)) throw new Error(`skills.json에 이미 존재하는 id: ${s.id}`);
}
skillsData.skills.push(...NEW_CATALOG_SKILLS);

// ---------- base-heroes.json 실전 전투용 skills 필드 (ascended-heroes.json과 동일 스키마) ----------
// gaugeGain=25 / gaugeCost=100은 combat-turns.mjs computeAllySkillKit()이 산출한
// 24명 전직영웅 실측 평균(기본 게이지획득 25, 스킬1 게이지비용 100)과 동일 SSOT.
// multiplier는 전직영웅 skill1 평균(1.8, 위와 동일 SSOT)의 70~80%(1.26~1.44) 밴드 안.
const BASE_HERO_SKILLS = {
  base_iris: [
    { id: 'basic', name: '기본 공격', description: '적 1명을 공격한다.', multiplier: 1, gaugeGain: 25, target: 'single' },
    { id: 'skill_iris_flash_strike', name: '섬광 베기', description: '번개처럼 빠르게 파고들어 적 1명을 벤다.', multiplier: 1.4, gaugeCost: 100, target: 'single' }
  ],
  base_sera: [
    { id: 'basic', name: '기본 공격', description: '적 1명을 공격한다.', multiplier: 1, gaugeGain: 25, target: 'single' },
    { id: 'skill_sera_healing_touch', name: '치유의 손길', description: 'HP가 가장 낮은 아군 1명을 치유한다.', multiplier: 1.3, gaugeCost: 100, target: 'ally_lowest_hp', isHeal: true }
  ],
  base_luca: [
    { id: 'basic', name: '기본 공격', description: '적 1명을 공격한다.', multiplier: 1, gaugeGain: 25, target: 'single' },
    { id: 'skill_luca_arcane_bolt', name: '비전탄', description: '즉석에서 엮은 마법으로 적 1명을 타격한다.', multiplier: 1.4, gaugeCost: 100, target: 'single' }
  ],
  base_kai: [
    { id: 'basic', name: '기본 공격', description: '적 1명을 공격한다.', multiplier: 1, gaugeGain: 25, target: 'single' },
    { id: 'skill_kai_execute', name: '급소 일격', description: '급소를 정확히 노려 적 1명에게 강타를 먹인다.', multiplier: 1.4, gaugeCost: 100, target: 'single' }
  ],
  base_lin: [
    { id: 'basic', name: '기본 공격', description: '적 1명을 공격한다.', multiplier: 1, gaugeGain: 25, target: 'single' },
    { id: 'skill_lin_oracle_blessing', name: '신탁의 가호', description: 'HP가 가장 낮은 아군 1명을 신탁의 힘으로 치유한다.', multiplier: 1.3, gaugeCost: 100, target: 'ally_lowest_hp', isHeal: true }
  ],
  base_omar: [
    { id: 'basic', name: '기본 공격', description: '적 1명을 공격한다.', multiplier: 1, gaugeGain: 25, target: 'single' },
    { id: 'skill_omar_shield_bash', name: '방패 강타', description: '방패로 적 1명을 강하게 후려친다.', multiplier: 1.3, gaugeCost: 100, target: 'single' }
  ],
  base_sol: [
    { id: 'basic', name: '기본 공격', description: '적 1명을 공격한다.', multiplier: 1, gaugeGain: 25, target: 'single' },
    { id: 'skill_sol_piercing_shot', name: '관통 사격', description: '숨을 고르고 적 1명을 정확히 꿰뚫는다.', multiplier: 1.35, gaugeCost: 100, target: 'single' }
  ],
  base_hana: [
    { id: 'basic', name: '기본 공격', description: '적 1명을 공격한다.', multiplier: 1, gaugeGain: 25, target: 'single' },
    { id: 'skill_hana_curse_touch', name: '저주의 손길', description: '명계의 기운을 담아 적 1명을 저주한다.', multiplier: 1.4, gaugeCost: 100, target: 'single' }
  ],
  base_leon: [
    { id: 'basic', name: '기본 공격', description: '적 1명을 공격한다.', multiplier: 1, gaugeGain: 25, target: 'single' },
    { id: 'skill_leon_rune_strike', name: '룬 강타', description: '룬을 새긴 무기로 적 1명을 강타한다.', multiplier: 1.35, gaugeCost: 100, target: 'single' }
  ],
  base_paolo: [
    { id: 'basic', name: '기본 공격', description: '적 1명을 공격한다.', multiplier: 1, gaugeGain: 25, target: 'single' },
    { id: 'skill_paolo_disintegrate', name: '분해의 마법', description: '적 1명의 결속을 분해해 무너뜨린다.', multiplier: 1.35, gaugeCost: 100, target: 'single' }
  ]
};

let updated = 0;
for (const hero of heroesData.baseHeroes) {
  const skills = BASE_HERO_SKILLS[hero.id];
  if (!skills) throw new Error(`BASE_HERO_SKILLS에 ${hero.id}가 없습니다`);
  hero.skills = skills;
  updated++;
}

fs.writeFileSync(SKILLS_PATH, JSON.stringify(skillsData, null, 2) + '\n');
fs.writeFileSync(HEROES_PATH, JSON.stringify(heroesData, null, 2) + '\n');
console.log(`skills.json: +${NEW_CATALOG_SKILLS.length}개 카탈로그 엔트리`);
console.log(`base-heroes.json: ${updated}명 skills 필드 추가`);
