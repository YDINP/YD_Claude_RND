/**
 * SynergySystem - 시너지 시스템 (개편)
 * 4인 파티용으로 조정, 성격 시너지 추가, 교단 시너지 개편
 */

import synergiesData from '../data/synergies.json';
import cultsData from '../data/cults.json';
import { MoodSystem } from './MoodSystem.js';

export class SynergySystem {
  // 4인 파티용 상수
  static PARTY_SIZE = 4;

  /**
   * 파티의 모든 시너지 계산
   * @param {Array<string>} partyHeroIds 파티 영웅 ID 배열
   * @param {Array} heroData 영웅 데이터 배열
   * @returns {Array} 활성화된 시너지 배열
   */
  static calculatePartySynergies(partyHeroIds, heroData) {
    const synergies = [];

    // 파티 영웅 데이터 수집
    const partyHeroes = partyHeroIds.map(id => heroData.find(h => h.id === id)).filter(h => h);

    if (partyHeroes.length === 0) {
      return synergies;
    }

    // 1. 교단 시너지
    const cultSynergy = this.calculateCultSynergy(partyHeroes);
    if (cultSynergy) {
      synergies.push(cultSynergy);
    }

    // 2. 분위기 시너지
    const moodSynergies = this.calculateMoodSynergies(partyHeroes);
    synergies.push(...moodSynergies);

    // 3. 역할 시너지
    const roleSynergies = this.calculateRoleSynergies(partyHeroes);
    synergies.push(...roleSynergies);

    // 4. 특수 시너지 (특정 캐릭터 조합)
    const specialSynergies = this.calculateSpecialSynergies(partyHeroIds, heroData);
    synergies.push(...specialSynergies);

    return synergies;
  }

  /**
   * 교단 시너지 계산 (4인용)
   * @param {Array} partyHeroes 파티 영웅 데이터 배열
   * @returns {Object|null} 교단 시너지 또는 null
   */
  static calculateCultSynergy(partyHeroes) {
    const cultCount = {};

    partyHeroes.forEach(hero => {
      const cult = hero.cult || hero.origin || 'unknown';
      cultCount[cult] = (cultCount[cult] || 0) + 1;
    });

    // 가장 많은 교단 찾기
    let maxCount = 0;
    let dominantCult = null;

    Object.entries(cultCount).forEach(([cult, count]) => {
      if (count > maxCount && cult !== 'unknown') {
        maxCount = count;
        dominantCult = cult;
      }
    });

    // 2명 이상이어야 시너지 발동
    if (maxCount < 2) {
      return null;
    }

    // 교단 데이터에서 시너지 보너스 가져오기
    const cultData = cultsData.cults?.[dominantCult];
    const baseBonus = cultData?.synergy_bonus || {};

    // 인원수에 따른 보너스 조정 (4인용)
    let effect = {};
    let description = '';

    if (maxCount >= 4) {
      // 4명 동일 교단
      effect = {
        atk: (baseBonus.atk || 0.10) * 100 + 15,
        def: (baseBonus.def || 0.05) * 100 + 10,
        hp: (baseBonus.hp || 0) * 100 + 10,
        spd: (baseBonus.spd || 0) * 100 + 5
      };
      description = `${cultData?.nameKr || dominantCult} 완성: 공격력 +${effect.atk}%, 방어력 +${effect.def}%`;
    } else if (maxCount >= 3) {
      // 3명 동일 교단
      effect = {
        atk: (baseBonus.atk || 0.10) * 100 + 8,
        def: (baseBonus.def || 0.05) * 100 + 5
      };
      description = `${cultData?.nameKr || dominantCult} 결속: 공격력 +${effect.atk}%, 방어력 +${effect.def}%`;
    } else {
      // 2명 동일 교단
      effect = {
        atk: (baseBonus.atk || 0.10) * 100
      };
      description = `${cultData?.nameKr || dominantCult} 공명: 공격력 +${effect.atk}%`;
    }

    return {
      type: 'cult',
      id: `cult_${dominantCult}_${maxCount}`,
      name: description,
      cult: dominantCult,
      count: maxCount,
      effect,
      icon: cultData?.icon || 'faction'
    };
  }

  /**
   * 분위기 시너지 계산
   * @param {Array} partyHeroes 파티 영웅 데이터 배열
   * @returns {Array} 분위기 시너지 배열
   */
  static calculateMoodSynergies(partyHeroes) {
    const synergies = [];
    const moodCount = {};

    partyHeroes.forEach(hero => {
      const mood = hero.mood || 'neutral';
      moodCount[mood] = (moodCount[mood] || 0) + 1;
    });

    // 단일 분위기 집중 시너지
    Object.entries(moodCount).forEach(([mood, count]) => {
      if (count >= 2) {
        const moodInfo = MoodSystem.getMood?.(mood);
        const name = moodInfo?.name || mood;

        if (count >= 4) {
          // 4명 동일 분위기
          synergies.push({
            type: 'mood',
            id: `mood_${mood}_4`,
            name: `${name}의 극치`,
            mood,
            count: 4,
            effect: this.getMoodSynergyEffect(mood, 4),
            icon: moodInfo?.icon || 'mood'
          });
        } else if (count >= 3) {
          // 3명 동일 분위기
          synergies.push({
            type: 'mood',
            id: `mood_${mood}_3`,
            name: `${name}의 조화`,
            mood,
            count: 3,
            effect: this.getMoodSynergyEffect(mood, 3),
            icon: moodInfo?.icon || 'mood'
          });
        } else {
          // 2명 동일 분위기
          synergies.push({
            type: 'mood',
            id: `mood_${mood}_2`,
            name: `${name}의 공명`,
            mood,
            count: 2,
            effect: this.getMoodSynergyEffect(mood, 2),
            icon: moodInfo?.icon || 'mood'
          });
        }
      }
    });

    // 균형 시너지 (서로 다른 3가지 이상 분위기)
    const uniqueMoods = Object.keys(moodCount).filter(p => p !== 'neutral');
    if (uniqueMoods.length >= 3) {
      synergies.push({
        type: 'mood_balance',
        id: 'mood_balance',
        name: '분위기의 균형',
        effect: { all: 5 },
        icon: 'balance'
      });
    }

    // Mystic 특수 시너지
    if (moodCount.mystic) {
      synergies.push({
        type: 'mood_special',
        id: 'mystic_presence',
        name: '신비의 기운',
        effect: { skill_dmg: 10 },
        icon: 'star'
      });
    }

    return synergies;
  }

  /**
   * 분위기별 시너지 효과 반환
   * @param {string} mood 분위기 ID
   * @param {number} count 인원 수
   * @returns {Object} 효과
   */
  static getMoodSynergyEffect(mood, count) {
    const effects = {
      brave: {
        2: { atk: 8 },
        3: { atk: 15, spd: 5 },
        4: { atk: 25, spd: 10, lifesteal: 5 }
      },
      calm: {
        2: { def: 8, hp: 5 },
        3: { def: 15, hp: 10 },
        4: { def: 25, hp: 15, damage_reduction: 10 }
      },
      cunning: {
        2: { crit_rate: 5, crit_dmg: 10 },
        3: { crit_rate: 10, crit_dmg: 20 },
        4: { crit_rate: 15, crit_dmg: 35, evasion: 10 }
      },
      wild: {
        2: { spd: 10 },
        3: { spd: 18, atk: 8 },
        4: { spd: 25, atk: 15, counter_rate: 15 }
      },
      mystic: {
        2: { skill_dmg: 12 },
        3: { skill_dmg: 20, spd: 5 },
        4: { skill_dmg: 30, all: 5 }
      }
    };

    return effects[mood]?.[count] || {};
  }

  /**
   * 역할 시너지 계산
   * @param {Array} partyHeroes 파티 영웅 데이터 배열
   * @returns {Array} 역할 시너지 배열
   */
  static calculateRoleSynergies(partyHeroes) {
    const synergies = [];
    const roleCount = {};

    partyHeroes.forEach(hero => {
      const role = hero.class || hero.role || 'warrior';
      roleCount[role] = (roleCount[role] || 0) + 1;
    });

    // 균형잡힌 팀 (딜러/탱커/서포터 모두 있음)
    const hasAttacker = roleCount.mage || roleCount.archer || roleCount.assassin;
    const hasTank = roleCount.warrior || roleCount.tank;
    const hasSupport = roleCount.healer || roleCount.support;

    if (hasAttacker && hasTank && hasSupport) {
      synergies.push({
        type: 'role',
        id: 'balanced_team',
        name: '균형잡힌 팀',
        effect: { all: 8 },
        icon: 'team'
      });
    }

    // 공격 집중 (딜러 3명 이상)
    const attackerCount = (roleCount.mage || 0) + (roleCount.archer || 0) + (roleCount.assassin || 0);
    if (attackerCount >= 3) {
      synergies.push({
        type: 'role',
        id: 'full_offense',
        name: '공격 특화',
        effect: { atk: 20, crit_rate: 10 },
        icon: 'attack'
      });
    }

    // 방어 집중 (탱커/힐러 3명 이상)
    const defenderCount = (roleCount.warrior || 0) + (roleCount.tank || 0) + (roleCount.healer || 0);
    if (defenderCount >= 3) {
      synergies.push({
        type: 'role',
        id: 'turtle_formation',
        name: '철벽 방어',
        effect: { def: 20, hp: 15 },
        icon: 'shield'
      });
    }

    return synergies;
  }

  /**
   * 특수 시너지 계산 (특정 캐릭터 조합)
   * @param {Array<string>} partyHeroIds 파티 영웅 ID 배열
   * @param {Array} heroData 영웅 데이터 배열
   * @returns {Array} 특수 시너지 배열
   */
  static calculateSpecialSynergies(partyHeroIds, heroData) {
    const synergies = [];
    const specialCombos = synergiesData.special_synergies || {};

    Object.entries(specialCombos).forEach(([comboId, combo]) => {
      if (!combo.required_characters) return;

      // 필요한 캐릭터가 모두 파티에 있는지 확인
      const hasAll = combo.required_characters.every(charId =>
        partyHeroIds.includes(charId)
      );

      if (hasAll) {
        synergies.push({
          type: 'special',
          id: comboId,
          name: combo.bonus?.description || comboId,
          effect: { ...combo.bonus },
          characters: combo.required_characters,
          icon: 'special'
        });
      }
    });

    return synergies;
  }

  /**
   * 시너지 효과를 스탯에 적용
   * @param {Object} baseStats 기본 스탯 { hp, atk, def, spd }
   * @param {Array} synergies 시너지 배열
   * @returns {Object} 수정된 스탯
   */
  static applySynergiesToStats(baseStats, synergies) {
    const modifiedStats = { ...baseStats };

    // 추가 효과 저장
    modifiedStats.bonuses = {
      crit_rate: 0,
      crit_dmg: 0,
      lifesteal: 0,
      damage_reduction: 0,
      evasion: 0,
      counter_rate: 0,
      skill_dmg: 0
    };

    synergies.forEach(synergy => {
      const effect = synergy.effect || {};

      // 기본 스탯 퍼센트 증가
      if (effect.atk) {
        modifiedStats.atk = Math.floor(modifiedStats.atk * (1 + effect.atk / 100));
      }
      if (effect.def) {
        modifiedStats.def = Math.floor(modifiedStats.def * (1 + effect.def / 100));
      }
      if (effect.hp) {
        modifiedStats.hp = Math.floor(modifiedStats.hp * (1 + effect.hp / 100));
      }
      if (effect.spd) {
        modifiedStats.spd = Math.floor(modifiedStats.spd * (1 + effect.spd / 100));
      }

      // 모든 스탯 증가
      if (effect.all) {
        const mult = 1 + effect.all / 100;
        modifiedStats.atk = Math.floor(modifiedStats.atk * mult);
        modifiedStats.def = Math.floor(modifiedStats.def * mult);
        modifiedStats.hp = Math.floor(modifiedStats.hp * mult);
        modifiedStats.spd = Math.floor(modifiedStats.spd * mult);
      }

      // 추가 효과
      if (effect.crit_rate) modifiedStats.bonuses.crit_rate += effect.crit_rate / 100;
      if (effect.crit_dmg) modifiedStats.bonuses.crit_dmg += effect.crit_dmg / 100;
      if (effect.lifesteal) modifiedStats.bonuses.lifesteal += effect.lifesteal / 100;
      if (effect.damage_reduction) modifiedStats.bonuses.damage_reduction += effect.damage_reduction / 100;
      if (effect.evasion) modifiedStats.bonuses.evasion += effect.evasion / 100;
      if (effect.counter_rate) modifiedStats.bonuses.counter_rate += effect.counter_rate / 100;
      if (effect.skill_dmg) modifiedStats.bonuses.skill_dmg += effect.skill_dmg / 100;
    });

    return modifiedStats;
  }

  /**
   * 시너지 효과 요약 텍스트 생성
   * @param {Array} synergies 시너지 배열
   * @returns {string} 요약 텍스트
   */
  static formatSynergySummary(synergies) {
    if (synergies.length === 0) {
      return '활성화된 시너지 없음';
    }

    return synergies.map(s => `- ${s.name}`).join('\n');
  }

  /**
   * 시너지 총 효과 계산
   * @param {Array} synergies 시너지 배열
   * @returns {Object} 총 효과
   */
  static getTotalEffect(synergies) {
    const total = {
      atk: 0,
      def: 0,
      hp: 0,
      spd: 0,
      all: 0,
      crit_rate: 0,
      crit_dmg: 0,
      lifesteal: 0,
      damage_reduction: 0,
      evasion: 0,
      counter_rate: 0,
      skill_dmg: 0
    };

    synergies.forEach(synergy => {
      const effect = synergy.effect || {};
      Object.entries(effect).forEach(([key, value]) => {
        if (typeof value === 'number' && key in total) {
          total[key] += value;
        }
      });
    });

    return total;
  }

  /**
   * 파티 시너지 미리보기
   * @param {Array<string>} partyHeroIds 파티 영웅 ID 배열
   * @param {Array} heroData 영웅 데이터 배열
   * @returns {Object} 시너지 미리보기
   */
  static previewSynergies(partyHeroIds, heroData) {
    const synergies = this.calculatePartySynergies(partyHeroIds, heroData);
    const totalEffect = this.getTotalEffect(synergies);

    return {
      activeSynergies: synergies,
      count: synergies.length,
      totalEffect,
      summary: this.formatSynergySummary(synergies)
    };
  }
}
