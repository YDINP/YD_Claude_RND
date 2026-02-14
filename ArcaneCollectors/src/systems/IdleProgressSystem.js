/**
 * IdleProgressSystem - 방치형 진행 시스템
 *
 * 오프라인 보상 및 자동 전투 시뮬레이션 관리
 * - 오프라인 시간 계산 (최대 12시간)
 * - 자동 전투 시뮬레이션
 * - 시간당 골드/경험치 계산
 * - 현재 스테이지 정보
 */

import { SaveManager } from './SaveManager.js';
import GameLogger from '../utils/GameLogger.js';
import { ProgressionSystem } from './ProgressionSystem.js';

export class IdleProgressSystem {
  static MAX_OFFLINE_HOURS = 12;
  static BASE_GOLD_PER_SEC = 5;
  static BASE_EXP_PER_SEC = 1.5;

  constructor(scene) {
    this.scene = scene;
    this.currentStage = { chapter: 1, stage: 1, name: '슬라임 평원' };
    this.enemyPool = [];
    this.lastBattleTime = Date.now();
    this.battleInterval = 2500; // 2.5초마다 자동 전투
    this.battleWinCount = 0;
    this.winsToAdvance = 3; // 3연승 시 다음 스테이지
  }

  /**
   * 오프라인 보상 계산
   * @param {number} lastLogoutTime - 마지막 로그아웃 시간 (밀리초)
   * @returns {Object} { gold, exp, items, duration }
   */
  calculateOfflineRewards(lastLogoutTime) {
    const now = Date.now();
    const offlineMs = now - lastLogoutTime;

    // 최대 12시간으로 제한
    const maxMs = this.constructor.MAX_OFFLINE_HOURS * 60 * 60 * 1000;
    const cappedMs = Math.min(offlineMs, maxMs);
    const offlineSec = cappedMs / 1000;

    // 최소 30초 이상 오프라인이어야 보상 제공
    if (offlineSec < 30) {
      return { gold: 0, exp: 0, items: [], duration: 0 };
    }

    // 파티 전투력 기반 계수
    const partyPower = this.getPartyPower();
    const powerMultiplier = 1 + (partyPower / 1000) * 0.5; // 파티 전투력 1000당 50% 증가

    // 현재 스테이지 계수
    const stageMultiplier = this.getStageMultiplier();

    // 보상 계산
    const goldPerSec = this.constructor.BASE_GOLD_PER_SEC * powerMultiplier * stageMultiplier;
    const expPerSec = this.constructor.BASE_EXP_PER_SEC * powerMultiplier * stageMultiplier;

    const gold = Math.floor(goldPerSec * offlineSec);
    const exp = Math.floor(expPerSec * offlineSec);

    // 아이템 드롭 (1시간당 1개 확률 50%)
    const items = [];
    const hours = Math.floor(offlineSec / 3600);
    for (let i = 0; i < hours; i++) {
      if (Math.random() < 0.5) {
        items.push(this.generateRandomItem());
      }
    }

    GameLogger.log('IDLE', '오프라인 보상 계산', {
      offlineSec, gold, exp, items: items.length, partyPower
    });

    return {
      gold,
      exp,
      items,
      duration: cappedMs,
      formattedDuration: this.formatDuration(Math.floor(offlineSec / 60))
    };
  }

  /**
   * 실시간 방치 수익 계산 (초당)
   * @param {number} partyPower - 파티 전투력
   * @returns {Object} { goldPerSec, expPerSec }
   */
  getIdleBattleRate(partyPower) {
    const powerMultiplier = 1 + (partyPower / 1000) * 0.5;
    const stageMultiplier = this.getStageMultiplier();

    return {
      goldPerSec: this.constructor.BASE_GOLD_PER_SEC * powerMultiplier * stageMultiplier,
      expPerSec: this.constructor.BASE_EXP_PER_SEC * powerMultiplier * stageMultiplier
    };
  }

  /**
   * 현재 스테이지 정보 가져오기
   * @returns {Object} { chapter, stage, name }
   */
  getCurrentStage() {
    const progress = SaveManager.getProgress();
    const clearedStages = Object.keys(progress.clearedStages || {});

    if (clearedStages.length === 0) {
      return { chapter: 1, stage: 1, name: '슬라임 평원' };
    }

    // 마지막 클리어 스테이지 파싱 (예: stage_1_5)
    const lastCleared = clearedStages.sort().pop();
    const parts = lastCleared.split('_');
    const chapter = parseInt(parts[1]) || 1;
    const stage = parseInt(parts[2]) || 1;

    // 다음 스테이지 (또는 현재 챕터 마지막)
    const nextStage = stage < 10 ? stage + 1 : stage;
    const nextChapter = stage < 10 ? chapter : chapter + 1;

    return {
      chapter: nextChapter,
      stage: nextStage,
      name: this.getStageName(nextChapter, nextStage)
    };
  }

  /**
   * 스테이지 이름 가져오기
   * @param {number} chapter - 챕터 번호
   * @param {number} stage - 스테이지 번호
   * @returns {string} 스테이지 이름
   */
  getStageName(chapter, stage) {
    const stageNames = {
      '1-1': '슬라임 평원',
      '1-2': '고블린 숲',
      '1-3': '어둠의 동굴',
      '1-4': '늑대 언덕',
      '1-5': '버섯 숲',
      '1-6': '트렌트 숲',
      '1-7': '골렘 산맥',
      '1-8': '요정 마을',
      '1-9': '광전사 진지',
      '1-10': '고블린 왕의 성'
    };
    return stageNames[`${chapter}-${stage}`] || `챕터 ${chapter}-${stage}`;
  }

  /**
   * 전투 시뮬레이션 (미니뷰용)
   * @returns {Object} { enemy, damage, reward, duration, stageAdvanced }
   */
  simulateBattle() {
    const enemy = this.getRandomEnemy();
    const partyPower = this.getPartyPower();

    // 데미지 계산 (파티 전투력 기반)
    const baseDamage = Math.floor(partyPower * 0.3);
    const damage = baseDamage + Math.floor(Math.random() * baseDamage * 0.3);

    // 보상 계산
    const goldReward = Math.floor((enemy.goldReward || 15) * 1.2);
    const expReward = Math.floor((enemy.expReward || 10) * 1.2);

    // 전투 승리 카운트 증가
    this.battleWinCount += 1;
    let stageAdvanced = false;

    // 3연승 시 다음 스테이지로 진행
    if (this.battleWinCount >= this.winsToAdvance) {
      this.advanceStage();
      stageAdvanced = true;
    }

    return {
      enemy: {
        name: enemy.name,
        hp: enemy.stats.hp,
        mood: enemy.mood
      },
      damage,
      reward: {
        gold: goldReward,
        exp: expReward
      },
      duration: 2500, // 2.5초
      stageAdvanced
    };
  }

  /**
   * 진행 업데이트 (프레임마다 호출)
   * @param {number} delta - 프레임 간격 (밀리초)
   */
  updateProgress(delta) {
    // 자동 전투 시간 체크
    const now = Date.now();
    if (now - this.lastBattleTime >= this.battleInterval) {
      this.lastBattleTime = now;
      return this.simulateBattle();
    }
    return null;
  }

  /**
   * 파티 전투력 계산
   * @returns {number} 파티 전투력
   */
  getPartyPower() {
    const saveData = SaveManager.load();
    if (!saveData) return 0;
    const parties = saveData.parties || [];
    const rawParty = parties[0];
    const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);

    let totalPower = 0;
    party.forEach(heroId => {
      const hero = saveData.characters.find(c => c.id === heroId);
      if (hero) {
        try {
          totalPower += ProgressionSystem.calculatePower({
            ...hero,
            characterId: hero.id || hero.characterId,
            skillLevels: hero.skillLevels || [1, 1]
          });
        } catch (e) {
          // Fallback to simple calculation
          const atk = hero.atk || 100;
          const def = hero.def || 50;
          const hp = hero.hp || 500;
          const level = hero.level || 1;
          totalPower += (atk + def + hp / 10) * (1 + level * 0.1);
        }
      }
    });

    // 기본값 (파티 없을 경우)
    return totalPower || 400;
  }

  /**
   * 스테이지 계수 계산
   * @returns {number} 스테이지 보상 배율
   */
  getStageMultiplier() {
    const stage = this.getCurrentStage();
    return 1 + ((stage.chapter || 1) - 1) * 0.5 + ((stage.stage || 1) - 1) * 0.05;
  }

  /**
   * 랜덤 적 가져오기
   * @returns {Object} 적 데이터
   */
  getRandomEnemy() {
    // 간단한 적 풀 (실제로는 enemies.json에서 로드)
    const enemies = [
      { id: 'enemy_slime', name: '슬라임', mood: 'calm', stats: { hp: 250, atk: 20 }, goldReward: 12, expReward: 8 },
      { id: 'enemy_goblin', name: '고블린', mood: 'cunning', stats: { hp: 200, atk: 30 }, goldReward: 15, expReward: 10 },
      { id: 'enemy_wolf', name: '야생 늑대', mood: 'cunning', stats: { hp: 180, atk: 35 }, goldReward: 16, expReward: 12 },
      { id: 'enemy_mushroom', name: '독버섯', mood: 'cunning', stats: { hp: 150, atk: 25 }, goldReward: 14, expReward: 10 },
      { id: 'enemy_goblin_archer', name: '고블린 궁수', mood: 'cunning', stats: { hp: 160, atk: 40 }, goldReward: 18, expReward: 12 }
    ];

    return enemies[Math.floor(Math.random() * enemies.length)];
  }

  /**
   * 랜덤 아이템 생성
   * @returns {Object} 아이템 데이터
   */
  generateRandomItem() {
    const items = [
      { id: 'potion_hp', name: 'HP 포션', type: 'consumable' },
      { id: 'scroll_exp', name: '경험치 두루마리', type: 'consumable' },
      { id: 'shard_common', name: '일반 파편', type: 'material' }
    ];
    return items[Math.floor(Math.random() * items.length)];
  }

  /**
   * 시간 포맷팅 (분 → "X시간 Y분")
   * @param {number} minutes - 분
   * @returns {string} 포맷된 문자열
   */
  formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
      return `${hours}시간 ${mins}분`;
    }
    return `${mins}분`;
  }

  /**
   * 다음 스테이지로 진행
   */
  advanceStage() {
    const current = this.getCurrentStage();
    const clearedChapter = current.chapter;
    const clearedStage = current.stage;

    // 현재 스테이지를 clearedStages에 기록
    const saveData = SaveManager.load();
    if (saveData) {
      saveData.progress = saveData.progress || {};
      saveData.progress.clearedStages = saveData.progress.clearedStages || {};
      saveData.progress.clearedStages[`stage_${clearedChapter}_${clearedStage}`] = true;
      SaveManager.save(saveData);
    }

    // 다음 스테이지 계산
    let nextChapter = clearedChapter;
    let nextStage = clearedStage + 1;

    if (nextStage > 10) {
      nextChapter += 1;
      nextStage = 1;
    }

    this.currentStage = {
      chapter: nextChapter,
      stage: nextStage,
      name: this.getStageName(nextChapter, nextStage)
    };

    this.battleWinCount = 0;

    GameLogger.log('IDLE', '스테이지 자동 진행', {
      cleared: `${clearedChapter}-${clearedStage}`,
      next: `${nextChapter}-${nextStage}`,
      name: this.currentStage.name
    });
  }
}
