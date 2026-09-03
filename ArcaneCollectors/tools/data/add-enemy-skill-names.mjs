/**
 * 적 스킬 이름 보강 (1회용 생성 스크립트)
 *
 * enemies.json은 스킬을 id 문자열 배열로만 들고 있고, skills.json에 정의가 없는 id가
 * 119개였다. BattleScene은 정의를 못 찾으면 `name: sId`로 폴백해 전투 로그에
 * `skill_talon_strike` 같은 키값이 그대로 노출됐다.
 *
 * 기존 항목은 손대지 않고(‘"multiplier": 1.0’ 같은 표기 보존) 새 항목만 뒤에 덧붙인다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS_PATH = path.join(ROOT, 'src/data/skills.json');

/** kind별 기본 수치 */
const KIND_DEFAULTS = {
  atk: { type: 'active', target: 'enemy_single', multiplier: 1.3, cooldown: 3 },
  atk_heavy: { type: 'active', target: 'enemy_single', multiplier: 1.6, cooldown: 4 },
  aoe: { type: 'active', target: 'enemy_all', multiplier: 1.1, cooldown: 4 },
  ultimate: { type: 'ultimate', target: 'enemy_all', multiplier: 1.5, chargeRequired: 100 },
  drain: { type: 'active', target: 'enemy_single', multiplier: 1.2, cooldown: 3 },
  debuff: { type: 'active', target: 'enemy_single', multiplier: 1.1, cooldown: 3 },
  buff_self: { type: 'active', target: 'self', cooldown: 3 },
  buff_ally: { type: 'active', target: 'ally_all', cooldown: 4 },
  heal_ally: { type: 'active', target: 'ally_all', cooldown: 4 },
  heal_self: { type: 'active', target: 'self', cooldown: 4 }
};

const STAT_LABEL = { atk: '공격력', def: '방어력', spd: '속도' };
const pct = (v) => `${Math.round(v * 100)}%`;

/**
 * [id, 한국어명, 영문명, kind, 옵션]
 * 옵션: { stat, value, duration, heal }
 */
const ENTRIES = [
  ['skill_talon_strike', '발톱 가르기', 'Talon Strike', 'atk'],
  ['skill_screech', '째지는 울음', 'Screech', 'debuff', { stat: 'def', value: -0.15 }],
  ['skill_charge', '돌진', 'Charge', 'atk'],
  ['skill_spear_thrust', '창 찌르기', 'Spear Thrust', 'atk'],
  ['skill_boulder_throw', '바위 던지기', 'Boulder Throw', 'atk'],
  ['skill_ground_slam', '대지 강타', 'Ground Slam', 'aoe'],
  ['skill_music_charm', '홀리는 선율', 'Charming Melody', 'debuff', { stat: 'atk', value: -0.15 }],
  ['skill_rampage', '광란', 'Rampage', 'buff_self', { stat: 'atk', value: 0.3 }],
  ['skill_bull_charge', '황소 돌진', 'Bull Charge', 'atk_heavy'],
  ['skill_petrifying_gaze', '석화의 눈길', 'Petrifying Gaze', 'debuff', { stat: 'spd', value: -0.25 }],
  ['skill_serpent_strike', '뱀머리 강타', 'Serpent Strike', 'atk'],
  ['skill_triple_bite', '세 겹 물어뜯기', 'Triple Bite', 'atk_heavy'],
  ['skill_hellfire_breath', '지옥불 숨결', 'Hellfire Breath', 'aoe'],
  ['skill_dark_howl', '어둠의 포효', 'Dark Howl', 'debuff', { stat: 'atk', value: -0.2 }],
  ['skill_club_smash', '몽둥이 내리치기', 'Club Smash', 'atk'],
  ['skill_war_cry', '전투 함성', 'War Cry', 'buff_ally', { stat: 'atk', value: 0.2 }],
  ['skill_wind_blade', '바람 칼날', 'Wind Blade', 'atk'],
  ['skill_swift_strike', '질풍 일격', 'Swift Strike', 'atk'],
  ['skill_water_jet', '물줄기', 'Water Jet', 'atk'],
  ['skill_shell_defense', '등딱지 방어', 'Shell Defense', 'buff_self', { stat: 'def', value: 0.35 }],
  ['skill_spirit_bolt', '정령 탄', 'Spirit Bolt', 'atk'],
  ['skill_nature_blessing', '자연의 축복', "Nature's Blessing", 'heal_ally', { heal: 0.8 }],
  ['skill_devastating_blow', '파괴의 일격', 'Devastating Blow', 'atk_heavy'],
  ['skill_iron_resolve', '강철 의지', 'Iron Resolve', 'buff_self', { stat: 'def', value: 0.3 }],
  ['skill_fox_fire', '여우불', 'Fox Fire', 'atk'],
  ['skill_illusion_veil', '환영의 장막', 'Illusion Veil', 'buff_self', { stat: 'def', value: 0.25 }],
  ['skill_eight_headed_strike', '여덟 머리의 일격', 'Eight-Headed Strike', 'aoe'],
  ['skill_poison_breath', '독 숨결', 'Poison Breath', 'aoe'],
  ['skill_tail_whip', '꼬리 후려치기', 'Tail Whip', 'atk'],
  ['skill_hammer_strike', '망치 내리치기', 'Hammer Strike', 'atk'],
  ['skill_ice_armor', '얼음 갑주', 'Ice Armor', 'buff_self', { stat: 'def', value: 0.3 }],
  ['skill_frost_bite', '서리 물어뜯기', 'Frost Bite', 'atk'],
  ['skill_ice_claw', '얼음 발톱', 'Ice Claw', 'atk'],
  ['skill_dark_spear', '어둠의 창', 'Dark Spear', 'atk'],
  ['skill_corrupted_aura', '타락의 기운', 'Corrupted Aura', 'debuff', { stat: 'def', value: -0.2 }],
  ['skill_ice_smash', '빙괴 강타', 'Ice Smash', 'atk'],
  ['skill_frost_shield', '서리 방패', 'Frost Shield', 'buff_self', { stat: 'def', value: 0.3 }],
  ['skill_undying_fury', '불사의 분노', 'Undying Fury', 'buff_self', { stat: 'atk', value: 0.25 }],
  ['skill_bone_armor', '뼈 갑옷', 'Bone Armor', 'buff_self', { stat: 'def', value: 0.25 }],
  ['skill_savage_bite', '야수의 이빨', 'Savage Bite', 'atk'],
  ['skill_moonlit_howl', '달빛 울부짖음', 'Moonlit Howl', 'buff_self', { stat: 'spd', value: 0.2 }],
  ['skill_world_serpent_coil', '세계뱀의 조임', "World Serpent's Coil", 'aoe'],
  ['skill_venom_deluge', '맹독의 범람', 'Venom Deluge', 'aoe'],
  ['skill_tidal_crash', '해일 강타', 'Tidal Crash', 'atk_heavy'],
  ['skill_shadow_strike', '그림자 일격', 'Shadow Strike', 'atk'],
  ['skill_phase_shift', '위상 이동', 'Phase Shift', 'buff_self', { stat: 'spd', value: 0.25 }],
  ['skill_cursed_blade', '저주받은 검', 'Cursed Blade', 'atk'],
  ['skill_death_ward', '죽음의 가호', 'Death Ward', 'buff_self', { stat: 'def', value: 0.25 }],
  ['skill_wail_of_death', '죽음의 통곡', 'Wail of Death', 'aoe'],
  ['skill_soul_drain', '영혼 흡수', 'Soul Drain', 'drain'],
  ['skill_spectral_touch', '망령의 손길', 'Spectral Touch', 'atk'],
  ['skill_ethereal_form', '실체 없는 몸', 'Ethereal Form', 'buff_self', { stat: 'def', value: 0.3 }],
  ['skill_death_ray', '죽음의 광선', 'Death Ray', 'atk_heavy'],
  ['skill_phylactery_shield', '성물함 보호막', 'Phylactery Shield', 'buff_self', { stat: 'def', value: 0.35 }],
  ['skill_necrotic_breath', '사령의 숨결', 'Necrotic Breath', 'aoe'],
  ['skill_wing_barrage', '날개 폭풍', 'Wing Barrage', 'aoe'],
  ['skill_yomi_gate', '황천의 문', 'Gate of Yomi', 'ultimate'],
  ['skill_death_embrace', '죽음의 포옹', 'Death Embrace', 'drain'],
  ['skill_soul_harvest', '영혼 수확', 'Soul Harvest', 'aoe'],
  ['skill_guardian_strike', '수호자의 일격', 'Guardian Strike', 'atk'],
  ['skill_barrier', '장벽', 'Barrier', 'buff_self', { stat: 'def', value: 0.3 }],
  ['skill_guardian_slash', '수호자의 참격', 'Guardian Slash', 'atk'],
  ['skill_tower_shield', '탑의 방패', 'Tower Shield', 'buff_self', { stat: 'def', value: 0.35 }],
  ['skill_power_surge', '힘의 파동', 'Power Surge', 'buff_self', { stat: 'atk', value: 0.3 }],
  ['skill_guardian_fury', '수호자의 격노', 'Guardian Fury', 'aoe'],
  ['skill_impenetrable_wall', '불가침의 벽', 'Impenetrable Wall', 'buff_self', { stat: 'def', value: 0.4 }],
  ['skill_devastating_sweep', '파멸의 휩쓸기', 'Devastating Sweep', 'aoe'],
  ['skill_mystic_blast', '신비의 폭발', 'Mystic Blast', 'atk'],
  ['skill_arcane_shield', '비술의 방패', 'Arcane Shield', 'buff_self', { stat: 'def', value: 0.35 }],
  ['skill_tower_judgment', '탑의 심판', "Tower's Judgment", 'ultimate'],
  ['skill_divine_strike', '신성한 일격', 'Divine Strike', 'atk_heavy'],
  ['skill_holy_barrier', '신성 결계', 'Holy Barrier', 'buff_self', { stat: 'def', value: 0.4 }],
  ['skill_ultimate_judgment', '최후의 심판', 'Ultimate Judgment', 'ultimate'],
  ['skill_death_gaze', '죽음의 응시', 'Death Gaze', 'debuff', { stat: 'spd', value: -0.25 }],
  ['skill_heaven_judgment', '천상의 심판', "Heaven's Judgment", 'ultimate'],
  ['skill_nature_touch', '자연의 손길', "Nature's Touch", 'heal_ally', { heal: 0.7 }],
  ['skill_fairy_dust', '요정 가루', 'Fairy Dust', 'debuff', { stat: 'spd', value: -0.2 }],
  ['skill_illusion', '환영', 'Illusion', 'buff_self', { stat: 'def', value: 0.2 }],
  ['skill_vine_slash', '덩굴 베기', 'Vine Slash', 'atk'],
  ['skill_nature_shield', '자연의 방패', "Nature's Shield", 'buff_self', { stat: 'def', value: 0.3 }],
  ['skill_dark_charge', '암흑 돌진', 'Dark Charge', 'atk'],
  ['skill_thorn_burst', '가시 폭발', 'Thorn Burst', 'aoe'],
  ['skill_root_bind', '뿌리 결박', 'Root Bind', 'debuff', { stat: 'spd', value: -0.3 }],
  ['skill_antler_charge', '뿔 돌진', 'Antler Charge', 'atk_heavy'],
  ['skill_forest_wrath', '숲의 분노', 'Wrath of the Forest', 'ultimate'],
  ['skill_nature_rebirth', '자연의 재생', "Nature's Rebirth", 'heal_self', { heal: 0.2 }],
  ['skill_giant_slam', '거인의 내리침', 'Giant Slam', 'atk_heavy'],
  ['skill_stone_skin', '바위 피부', 'Stone Skin', 'buff_self', { stat: 'def', value: 0.35 }],
  ['skill_hop_attack', '도약 공격', 'Hop Attack', 'atk'],
  ['skill_drain_bite', '흡혈 물기', 'Drain Bite', 'drain'],
  ['skill_spirit_wail', '원귀의 곡소리', 'Spirit Wail', 'aoe'],
  ['skill_golden_bite', '황금 이빨', 'Golden Bite', 'atk'],
  ['skill_fortune_aura', '복의 기운', 'Fortune Aura', 'buff_ally', { stat: 'def', value: 0.2 }],
  ['skill_demon_claw', '요괴의 발톱', 'Demon Claw', 'atk'],
  ['skill_chaos_howl', '혼돈의 포효', 'Chaos Howl', 'debuff', { stat: 'atk', value: -0.2 }],
  ['skill_devour', '집어삼키기', 'Devour', 'drain'],
  ['skill_glutton_rage', '탐식의 광기', "Glutton's Rage", 'buff_self', { stat: 'atk', value: 0.35 }],
  ['skill_holy_flame', '신성한 불꽃', 'Holy Flame', 'atk'],
  ['skill_divine_blessing', '신의 축복', 'Divine Blessing', 'buff_ally', { stat: 'atk', value: 0.25 }],
  ['skill_surprise_bite', '기습 물기', 'Surprise Bite', 'atk'],
  ['skill_gold_toss', '금화 뿌리기', 'Gold Toss', 'aoe'],
  ['skill_elemental_burst', '정령 폭발', 'Elemental Burst', 'aoe'],
  ['skill_mana_drain', '마나 흡수', 'Mana Drain', 'drain'],
  ['skill_dark_nova', '암흑 신성', 'Dark Nova', 'ultimate'],
  ['skill_shadow_army', '그림자 군세', 'Shadow Army', 'buff_self', { stat: 'atk', value: 0.4 }],
  ['skill_absolute_zero', '절대영도', 'Absolute Zero', 'ultimate'],
  ['skill_prism_barrier', '무지개 결계', 'Prism Barrier', 'buff_self', { stat: 'def', value: 0.35 }],
  ['skill_void_claw', '공허의 발톱', 'Void Claw', 'atk'],
  ['skill_dimension_shift', '차원 도약', 'Dimension Shift', 'buff_self', { stat: 'spd', value: 0.3 }],
  ['skill_reality_tear', '현실 찢기', 'Reality Tear', 'aoe'],
  ['skill_horror_wail', '공포의 절규', 'Horror Wail', 'debuff', { stat: 'atk', value: -0.25 }],
  ['skill_rift_slam', '균열 강타', 'Rift Slam', 'atk_heavy'],
  ['skill_void_barrier', '공허의 장벽', 'Void Barrier', 'buff_self', { stat: 'def', value: 0.4 }],
  ['skill_dimensional_collapse', '차원 붕괴', 'Dimensional Collapse', 'ultimate'],
  ['skill_river_surge', '강물 범람', 'River Surge', 'aoe'],
  ['skill_thunder_judgment', '뇌명의 심판', 'Thunder Judgment', 'ultimate'],
  ['skill_gungnir_strike', '궁니르의 일격', 'Gungnir Strike', 'atk_heavy'],
  ['skill_ravens_judgment', '까마귀의 심판', "Ravens' Judgment", 'aoe'],
  ['skill_allfather_wrath', '만물의 아버지의 분노', "Allfather's Wrath", 'ultimate']
];

/** 서술은 수치에서 파생시킨다 — 손으로 적어 어긋나는 일을 막는다 */
function describe(kind, base, opt) {
  const m = base.multiplier;
  switch (kind) {
    case 'atk':
    case 'atk_heavy':
      return `적 1명에게 공격력의 ${pct(m)}의 데미지를 입힌다`;
    case 'aoe':
      return `적 전체에게 공격력의 ${pct(m)}의 데미지를 입힌다`;
    case 'ultimate':
      return `적 전체에게 공격력의 ${pct(m)}의 데미지를 입힌다`;
    case 'drain':
      return `적 1명에게 공격력의 ${pct(m)}의 데미지를 입히고 피해량의 30%를 회복한다`;
    case 'debuff':
      return `적 1명에게 공격력의 ${pct(m)}의 데미지를 입히고 ${STAT_LABEL[opt.stat]}을 ${pct(Math.abs(opt.value))} 감소시킨다`;
    case 'buff_self':
      return `자신의 ${STAT_LABEL[opt.stat]}을 ${pct(opt.value)} 증가시킨다`;
    case 'buff_ally':
      return `아군 전체의 ${STAT_LABEL[opt.stat]}을 ${pct(opt.value)} 증가시킨다`;
    case 'heal_ally':
      return `아군 전체의 HP를 공격력의 ${pct(opt.heal)}만큼 회복시킨다`;
    case 'heal_self':
      return `자신의 HP를 ${pct(opt.heal)} 회복한다`;
    default:
      throw new Error(`알 수 없는 kind: ${kind}`);
  }
}

function buildEffects(kind, opt) {
  switch (kind) {
    case 'drain':
      return [{ type: 'lifesteal', value: 0.3 }];
    case 'debuff':
      return [{ type: 'debuff', stat: opt.stat, value: opt.value, duration: 2 }];
    case 'buff_self':
    case 'buff_ally':
      return [{ type: 'buff', stat: opt.stat, value: opt.value, duration: 3 }];
    case 'heal_ally':
      return [{ type: 'heal', value: opt.heal }];
    case 'heal_self':
      return [{ type: 'self_heal', value: opt.heal }];
    default:
      return [];
  }
}

function buildSkill([id, name, nameEn, kind, opt = {}]) {
  const base = KIND_DEFAULTS[kind];
  if (!base) throw new Error(`알 수 없는 kind: ${kind} (${id})`);

  const skill = {
    id,
    name,
    nameEn,
    description: describe(kind, base, opt),
    type: base.type,
    target: base.target
  };
  if (base.multiplier !== undefined) skill.multiplier = base.multiplier;
  if (base.cooldown !== undefined) skill.cooldown = base.cooldown;
  if (base.chargeRequired !== undefined) skill.chargeRequired = base.chargeRequired;
  skill.effects = buildEffects(kind, opt);
  return skill;
}

// ---------- 실행 ----------
const raw = fs.readFileSync(SKILLS_PATH, 'utf-8');
const existing = JSON.parse(raw).skills;
const existingIds = new Set(existing.map(s => s.id));

const seen = new Set();
const additions = [];
for (const entry of ENTRIES) {
  const [id] = entry;
  if (seen.has(id)) throw new Error(`중복 항목: ${id}`);
  seen.add(id);
  if (existingIds.has(id)) continue;
  additions.push(buildSkill(entry));
}

if (additions.length === 0) {
  // 추가할 것이 없는데 파일을 다시 쓰면 닫는 대괄호 앞에 빈 쉼표가 남아 JSON이 깨진다
  console.log(`추가 0개 — skills.json 그대로 둠 (전체 ${existing.length}개)`);
  process.exit(0);
}

const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const serialized = additions
  .map(skill => JSON.stringify(skill, null, 2)
    .split('\n')
    .map(line => `    ${line}`)
    .join(eol))
  .join(`,${eol}`);

const closing = `${eol}  ]${eol}}`;
const closingIndex = raw.lastIndexOf(closing);
if (closingIndex < 0) throw new Error('skills.json 꼬리 형식을 찾지 못했습니다');

const head = raw.slice(0, closingIndex);
const output = `${head},${eol}${serialized}${raw.slice(closingIndex)}`;

fs.writeFileSync(SKILLS_PATH, output, 'utf-8');
console.log(`추가 ${additions.length}개 / 표 ${ENTRIES.length}개 / 전체 ${existing.length + additions.length}개`);
