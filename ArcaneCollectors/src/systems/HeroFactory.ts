/**
 * HeroFactory - Factory Pattern for Hero Creation
 * normalizeHero() 기능을 Factory로 격상
 */

import type { Character, OwnedHero, NormalizedHero, CharacterStats } from '../types';
import { getCharacter, getCharacterOrHero } from '../data/index.js';
import { getRarityKey, getRarityStars } from '../utils/rarityUtils.js';
import { ProgressionSystem } from './ProgressionSystem.js';

const DEFAULT_STATS: CharacterStats = { hp: 100, atk: 10, def: 10, spd: 10 };

/**
 * base-heroes / ascended-heroes 데이터를 Character 스키마로 적응시킵니다.
 * (cultId→cult, baseClass→class, baseMood→mood 필드명 불일치 흡수)
 */
function adaptToCharacter(raw: any): Character | null {
  if (!raw) return null;
  if (raw.stats || raw.cult) return raw as Character; // 이미 레거시 Character 스키마
  return {
    ...raw,
    cult: raw.cult ?? raw.cultId ?? null,
    class: raw.class ?? raw.baseClass ?? 'warrior',
    mood: raw.mood ?? raw.baseMood ?? 'brave',
    stats: raw.stats ?? DEFAULT_STATS,
    growthStats: raw.growthStats ?? { hp: 0, atk: 0, def: 0, spd: 0 },
    skills: raw.skills ?? []
  } as Character;
}

/**
 * 영웅 생성 및 정규화를 담당하는 Factory 클래스
 */
export class HeroFactory {
  /**
   * 캐릭터 데이터로부터 영웅 인스턴스 생성
   * @param charData - characters.json의 Character 데이터
   * @param options - 추가 옵션 (레벨, 경험치 등)
   * @returns 정규화된 영웅 객체
   */
  static createFromCharacterData(
    charData: Character,
    options?: Partial<OwnedHero>
  ): NormalizedHero {
    const rarity = options?.rarity ?? charData.rarity;
    const rarityKey = getRarityKey(rarity);
    const level = options?.level || 1;
    const stars = options?.stars || getRarityStars(rarity);

    return {
      // 식별자
      id: charData.id,
      instanceId: options?.instanceId || charData.id,
      characterId: charData.id,

      // 기본 정보
      name: options?.name || charData.name,
      rarity: rarity,
      rarityKey: rarityKey,
      stars: stars,
      cult: options?.cult || charData.cult,
      class: options?.class || charData.class,
      mood: options?.mood || charData.mood,
      description: options?.description || charData.description,

      // 상태
      level: level,
      exp: options?.exp || 0,

      // 스탯 — 레벨·성급·장비·컬렉션이 반영된 실전 스탯
      stats: options?.stats || HeroFactory.resolveFinalStats(charData, options, level, stars, rarity),
      growthStats: charData.growthStats || { hp: 0, atk: 0, def: 0, spd: 0 },
      statsResolved: true,

      // 스킬
      skills: options?.skills || charData.skills || [],
      skillLevels: options?.skillLevels || [1, 1, 1],

      // 장비 (COMPAT-1.3: 표준 스키마 보장)
      equipped: options?.equipped ?? null,
      equipment: options?.equipment || {
        weapon: null,
        armor: null,
        accessory: null
      },

      // 진화 및 성좌 (COMPAT-1.3)
      evolutionCount: options?.evolutionCount || 0,
      constellation: options?.constellation || 0,

      // 획득 시각 (COMPAT-1.3)
      acquiredAt: options?.acquiredAt || Date.now()
    };
  }

  /**
   * 레벨·성급·장비·컬렉션이 반영된 실전 스탯.
   *
   * `ProgressionSystem.getFinalStats()`가 전투력/스탯 표시의 SSOT이며 여기서는 조회 형태만 맞춘다.
   * 예전에는 `charData.stats`(레벨 1·성급 보정 없는 원본)를 그대로 실어 보내서
   * StageSelect의 총 전투력도, BattleScene의 아군 배틀러도 레벨을 전혀 반영하지 않았다
   * (Lv60 4성 전직영웅이 Lv1 스탯으로 싸워 combat-turns 시뮬레이션과 실전투가 어긋났다).
   *
   * @param charData - characters/base-heroes/ascended-heroes 원천 데이터 (stats + growthStats)
   * @param options - 세이브 레코드 (장비/컬렉션 조회용 id 포함)
   * @param level - 해석된 레벨
   * @param stars - 해석된 성급
   * @param rarity - 해석된 등급
   * @returns 최종 스탯. 계산이 불가능하면 원본 스탯으로 폴백한다.
   */
  static resolveFinalStats(
    charData: Character,
    options: Partial<OwnedHero> | undefined,
    level: number,
    stars: number,
    rarity: any
  ): CharacterStats {
    const fallback: CharacterStats = { ...(charData.stats || DEFAULT_STATS) };
    try {
      const owned: any = {
        ...charData,
        ...(options || {}),
        id: charData.id,
        characterId: (options as any)?.characterId || charData.id,
        stats: charData.stats,
        growthStats: (charData as any).growthStats,
        level,
        stars,
        rarity
      };
      const final = ProgressionSystem.getFinalStats(owned);
      // 원천 데이터가 비어 있으면 0 스탯이 나온다 — 그때는 원본을 그대로 쓴다
      return final && final.hp > 0 ? final : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * 세이브 데이터로부터 영웅 복원
   * @param saveData - 저장된 영웅 데이터
   * @returns 정규화된 영웅 객체
   */
  static createFromSaveData(saveData: any): NormalizedHero | null {
    if (!saveData) return null;

    const heroId = saveData.id || saveData.characterId;
    if (!heroId) return null;

    const base = adaptToCharacter(getCharacterOrHero(heroId));
    if (!base) return null;

    return HeroFactory.createFromCharacterData(base, saveData);
  }

  /**
   * 시작 캐릭터 생성 (초기 파티용)
   * @param characterId - 캐릭터 ID
   * @returns 정규화된 영웅 객체
   */
  static createStarter(characterId: string): NormalizedHero | null {
    const charData = getCharacter(characterId);
    if (!charData) return null;

    return HeroFactory.createFromCharacterData(charData, {
      level: 1,
      exp: 0,
      evolutionCount: 0
    });
  }

  /**
   * 불완전한 영웅 데이터를 정규화 (레거시 normalizeHero 대체)
   * @param hero - 불완전할 수 있는 영웅 데이터
   * @returns 정규화된 영웅 객체
   */
  static normalize(hero: Partial<OwnedHero> | null | undefined): NormalizedHero | null {
    if (!hero) return null;

    const heroId = hero.id || hero.characterId;
    if (!heroId) return null;

    const base = adaptToCharacter(getCharacterOrHero(heroId));

    // 캐릭터 데이터가 없으면 기본값으로 생성
    if (!base) {
      console.warn(`[HeroFactory] Character not found: ${heroId}, using defaults`);
      const rarity = (hero.rarity ?? 1) as any;
      const rarityKey = getRarityKey(rarity);

      return {
        id: heroId,
        instanceId: hero.instanceId || heroId,
        characterId: heroId,
        name: hero.name || '???',
        rarity: rarity,
        rarityKey: rarityKey,
        stars: hero.stars || getRarityStars(rarity),
        cult: hero.cult || 'olympus',
        class: hero.class || 'warrior',
        mood: hero.mood || 'brave',
        description: hero.description || '',
        level: hero.level || 1,
        exp: hero.exp || 0,
        stats: hero.stats || { ...DEFAULT_STATS },
        growthStats: { hp: 0, atk: 0, def: 0, spd: 0 },
        skills: hero.skills || [],
        skillLevels: hero.skillLevels || [1, 1, 1],
        equipped: hero.equipped || null,
        equipment: hero.equipment || { weapon: null, armor: null, accessory: null },
        evolutionCount: hero.evolutionCount || 0,
        constellation: hero.constellation || 0,
        acquiredAt: hero.acquiredAt || Date.now()
      };
    }

    // 캐릭터 데이터가 있으면 Factory로 생성
    return HeroFactory.createFromCharacterData(base, hero);
  }

  /**
   * 영웅 배열 전체를 정규화
   * @param heroes - 불완전한 영웅 배열
   * @returns 정규화된 영웅 배열 (null 필터링)
   */
  static normalizeAll(heroes: Array<Partial<OwnedHero>> | null | undefined): NormalizedHero[] {
    if (!Array.isArray(heroes)) return [];
    return heroes.map(h => HeroFactory.normalize(h)).filter((h): h is NormalizedHero => h !== null);
  }

  /**
   * 가챠 결과로 영웅 생성
   * @param characterId - 뽑은 캐릭터 ID
   * @param rarity - 확정된 등급 (가챠 결과)
   * @returns 정규화된 영웅 객체
   */
  static createFromGacha(characterId: string, rarity: number): NormalizedHero | null {
    const charData = adaptToCharacter(getCharacterOrHero(characterId));
    if (!charData) return null;

    return HeroFactory.createFromCharacterData(charData, {
      instanceId: `${characterId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      rarity: rarity as any,
      level: 1,
      exp: 0,
      evolutionCount: 0
    });
  }
}
