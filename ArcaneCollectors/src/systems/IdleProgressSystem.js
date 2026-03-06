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
import { getChapter, getEnemy, getChapterStages, calculateEnemyStats } from '../data/index.ts';

export class IdleProgressSystem {
  static MAX_OFFLINE_HOURS = 12;
  static BASE_GOLD_PER_SEC = 5;
  static BASE_EXP_PER_SEC = 1.5;

  constructor(scene) {
    this.scene = scene;
    this.currentStage = { chapter: 1, stage: 1, name: '슬라임 평원' };
    this.enemyPool = [];
    this.lastBattleTime = Date.now();
    this.battleInterval = 1500; // 1.5초마다 공격 (더 빠른 타격감)
    this.accumulatedDamage = 0; // 현재 보스에게 누적된 데미지
    this.currentBossHp = 0; // 현재 보스의 최대 HP
    this.currentBossData = null; // 현재 보스 데이터
    this.lastSaveTime = Date.now(); // 진행도 저장 타이머
    this.SAVE_INTERVAL = 10000; // 10초마다 저장
    this.unclaimedDamage = 0; // 미수령 누적 데미지 (보상받기용)

    // 저장된 진행도 로드
    this._loadSavedProgress();

    // BUG-12 수정: 세이브 데이터 로드 직후 보스 로드하여 bossReady 상태 즉시 계산
    this.loadCurrentBoss();
  }

  /**
   * 저장된 진행도 로드
   * @private
   */
  _loadSavedProgress() {
    const saveData = SaveManager.load();
    const idleProgress = saveData?.idleProgress;
    if (idleProgress) {
      this.accumulatedDamage = idleProgress.accumulatedDamage || 0;
      this.unclaimedDamage = idleProgress.unclaimedDamage || 0;
      this._savedBossId = idleProgress.currentBossId || null;
      GameLogger.log('IDLE', '저장된 진행도 로드', {
        accumulatedDamage: this.accumulatedDamage,
        unclaimedDamage: this.unclaimedDamage,
        bossId: this._savedBossId
      });
    }
  }

  /**
   * 진행도를 SaveManager에 저장
   */
  saveProgress() {
    const saveData = SaveManager.load();
    if (!saveData) return;

    saveData.idleProgress = {
      accumulatedDamage: this.accumulatedDamage,
      unclaimedDamage: this.unclaimedDamage,
      currentBossId: this.currentBossData?.id || null,
      savedAt: Date.now()
    };
    SaveManager.save(saveData);
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
      return { gold: 0, exp: 0, items: [], duration: 0, progressGained: 0 };
    }

    // DPS 기반 진행도 누적 (스테이지 자동 진행 없음 — 보스전 필요)
    const dps = this.calculateDPS();
    const boss = this.getBossForCurrentStage();
    const bossHp = boss.hp;

    // 오프라인 동안 누적 데미지 계산
    const offlineDamage = Math.floor(dps * offlineSec);
    const previousDamage = this.accumulatedDamage;
    this.accumulatedDamage = Math.min(
      previousDamage + offlineDamage,
      bossHp // 100% 캡 — 보스전은 직접 플레이해야 함
    );
    const progressGained = (this.accumulatedDamage - previousDamage) / bossHp;

    // 보상: 누적 데미지 비율 기반 (스테이지 클리어 보상 제외)
    const damageRatio = offlineDamage / bossHp;
    const gold = Math.floor(damageRatio * (boss.goldReward || 600) * 0.8);
    const exp = Math.floor(damageRatio * (boss.expReward || 300) * 0.8);

    // 아이템 드롭 (1시간당 1개 확률 50%)
    const items = [];
    const hours = Math.floor(offlineSec / 3600);
    for (let i = 0; i < hours; i++) {
      if (Math.random() < 0.5) {
        items.push(this.generateRandomItem());
      }
    }

    GameLogger.log('IDLE', '오프라인 보상 계산 (샌드백 모드)', {
      offlineSec,
      dps: Math.floor(dps),
      offlineDamage,
      progressGained: Math.floor(progressGained * 100) + '%',
      bossReady: this.accumulatedDamage >= bossHp,
      gold,
      exp,
      items: items.length
    });

    return {
      gold,
      exp,
      items,
      duration: cappedMs,
      progressGained,
      bossReady: this.accumulatedDamage >= bossHp,
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
    // 숫자 기반 정렬로 수정: "stage_1_10" > "stage_1_9" (렉시코그래픽 버그 수정)
    const lastCleared = clearedStages.sort((a, b) => {
      const partsA = a.split('_');
      const partsB = b.split('_');
      const chA = parseInt(partsA[1]) || 0;
      const stA = parseInt(partsA[2]) || 0;
      const chB = parseInt(partsB[1]) || 0;
      const stB = parseInt(partsB[2]) || 0;
      // 챕터 우선, 스테이지 후순
      return (chA - chB) || (stA - stB);
    }).pop();

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
   * 현재 스테이지의 보스 가져오기
   * @returns {Object} 보스 데이터 { id, name, hp, atk, def, emoji, goldReward, expReward }
   */
  getBossForCurrentStage() {
    const current = this.getCurrentStage();
    const chapterId = `chapter_${current.chapter}`;
    const chapter = getChapter(chapterId);

    if (!chapter) {
      // Fallback: 기본 보스
      return {
        id: 'enemy_goblin_king',
        name: '고블린 왕',
        hp: 800,
        atk: 50,
        def: 30,
        emoji: '👑',
        goldReward: 600,
        expReward: 300
      };
    }

    // 챕터의 보스 스테이지 찾기
    const stages = getChapterStages(chapterId);
    const bossStage = stages.find(s => s.isBoss);

    if (!bossStage || !bossStage.enemies || bossStage.enemies.length === 0) {
      // Fallback: 마지막 스테이지의 마지막 적
      const lastStage = stages[stages.length - 1];
      if (lastStage && lastStage.enemies && lastStage.enemies.length > 0) {
        const lastEnemy = lastStage.enemies[lastStage.enemies.length - 1];
        const enemyData = getEnemy(lastEnemy.id);
        if (enemyData) {
          const stats = calculateEnemyStats(enemyData, lastEnemy.level || 1);
          return {
            id: enemyData.id,
            name: enemyData.name || '알 수 없는 적',
            hp: stats.hp,
            atk: stats.atk,
            def: stats.def,
            emoji: this.getBossEmoji(enemyData.id),
            goldReward: lastStage.rewards?.gold || 100,
            expReward: lastStage.rewards?.exp || 50
          };
        }
      }
      // Final fallback
      return {
        id: 'enemy_goblin_king',
        name: '고블린 왕',
        hp: 800,
        atk: 50,
        def: 30,
        emoji: '👑',
        goldReward: 600,
        expReward: 300
      };
    }

    // 보스 데이터 가져오기
    const bossEnemyData = bossStage.enemies[0];
    const enemyData = getEnemy(bossEnemyData.id);

    if (!enemyData) {
      // Fallback
      return {
        id: 'enemy_goblin_king',
        name: '고블린 왕',
        hp: 800,
        atk: 50,
        def: 30,
        emoji: '👑',
        goldReward: 600,
        expReward: 300
      };
    }

    const stats = calculateEnemyStats(enemyData, bossEnemyData.level || 1);
    let bossHp = stats.hp;

    // 비보스 스테이지에서는 HP 스케일링
    // 현재 스테이지가 보스 스테이지가 아니면 비율로 HP 조정
    const currentStageId = `${current.chapter}-${current.stage}`;
    const bossStageId = bossStage.id;

    if (currentStageId !== bossStageId) {
      // 챕터당 10 스테이지로 가정, 현재 스테이지 / 보스 스테이지(10)
      const bossStageNumber = parseInt(bossStageId.split('-')[1]) || 10;
      const ratio = current.stage / bossStageNumber;
      bossHp = Math.floor(stats.hp * ratio);
    }

    return {
      id: enemyData.id,
      name: enemyData.name || '알 수 없는 보스',
      hp: bossHp,
      atk: stats.atk,
      def: stats.def,
      emoji: this.getBossEmoji(enemyData.id),
      goldReward: bossStage.rewards?.gold || 600,
      expReward: bossStage.rewards?.exp || 300
    };
  }

  /**
   * 보스 이모지 매핑
   * @param {string} bossId - 보스 ID
   * @returns {string} 이모지
   */
  getBossEmoji(bossId) {
    const bossEmojis = {
      'enemy_goblin_king': '👑',
      'enemy_rift_guardian': '🛡️',
      'enemy_izanami': '💀',
      'enemy_zeus': '⚡',
      'enemy_odin_allfather': '👁️'
    };
    return bossEmojis[bossId] || '👹';
  }

  /**
   * 파티 전투력 기반 DPS 계산
   * @returns {number} 초당 데미지
   */
  calculateDPS() {
    const partyPower = this.getPartyPower();
    const baseDPS = partyPower * 0.15; // 전투력 400이면 DPS 60 (균형 조정)
    // 약간의 랜덤성 (0.9~1.1배)
    return baseDPS * (0.9 + Math.random() * 0.2);
  }

  /**
   * 현재 보스 로드 — 같은 보스면 누적 데미지 유지
   * BUG-12 수정: bossReady 상태도 로그에 표시
   */
  loadCurrentBoss() {
    const boss = this.getBossForCurrentStage();
    const isSameBoss = this._savedBossId && this._savedBossId === boss.id;

    this.currentBossData = boss;
    this.currentBossHp = boss.hp;

    if (isSameBoss) {
      // 같은 보스: 저장된 누적 데미지 유지
      const progress = Math.floor((this.accumulatedDamage / boss.hp) * 100);
      const bossReady = this.accumulatedDamage >= boss.hp;
      GameLogger.log('IDLE', '보스 로드 (진행도 유지)', {
        boss: boss.name,
        hp: boss.hp,
        accumulatedDamage: this.accumulatedDamage,
        progress: progress + '%',
        bossReady
      });
    } else {
      // 다른 보스: 리셋
      this.accumulatedDamage = 0;
      this._savedBossId = boss.id;
      GameLogger.log('IDLE', '새 보스 로드 (진행도 리셋)', {
        boss: boss.name,
        hp: boss.hp,
        emoji: boss.emoji,
        bossReady: false
      });
    }
  }

  /**
   * 전투 시뮬레이션 (미니뷰용) — 샌드백 모드
   * 보스는 죽지 않고, 데미지 누적으로 진행도가 올라감.
   * 진행도 100% 도달 시 bossReady 플래그 반환 (보스전 트리거용)
   * @returns {Object} { boss, damage, accumulatedDamage, bossMaxHp, progress, reward, bossReady }
   */
  simulateBattle() {
    // 보스 데이터 없으면 로드
    if (!this.currentBossData) {
      this.loadCurrentBoss();
    }

    // 이미 보스전 준비 상태면 데미지만 표시 (진행도 100% 유지)
    const alreadyReady = this.accumulatedDamage >= this.currentBossHp;

    const dps = this.calculateDPS();
    const intervalSec = this.battleInterval / 1000;
    const damage = Math.floor(dps * intervalSec * (0.9 + Math.random() * 0.2));

    this.accumulatedDamage += damage;
    this.unclaimedDamage += damage;

    const progress = Math.min(1, this.accumulatedDamage / this.currentBossHp);
    const bossReady = !alreadyReady && this.accumulatedDamage >= this.currentBossHp;

    // 주기적 저장 (10초마다)
    const now = Date.now();
    if (now - this.lastSaveTime >= this.SAVE_INTERVAL) {
      this.lastSaveTime = now;
      this.saveProgress();
    }

    return {
      boss: this.currentBossData,
      damage,
      accumulatedDamage: this.accumulatedDamage,
      bossMaxHp: this.currentBossHp,
      progress,
      reward: {
        gold: this.currentBossData?.goldReward || 600,
        exp: this.currentBossData?.expReward || 300
      },
      bossReady
    };
  }

  /**
   * 보스전 준비 상태인지 확인
   * @returns {boolean}
   */
  isBossReady() {
    return this.currentBossHp > 0 && this.accumulatedDamage >= this.currentBossHp;
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
   * 미수령 누적 보상 조회 (누적 데미지 + 현재 진행도 합산)
   * @returns {Object} { gold, exp, totalDamage, hasRewards }
   */
  getClaimableRewards() {
    if (!this.currentBossData) {
      return { gold: 0, exp: 0, totalDamage: 0, hasRewards: false };
    }

    // 누적 미수령 데미지 + 현재 진행도(accumulatedDamage) 합산
    const totalDamage = (this.unclaimedDamage || 0) + (this.accumulatedDamage || 0);
    if (totalDamage <= 0) {
      return { gold: 0, exp: 0, totalDamage: 0, hasRewards: false };
    }

    const bossHp = this.currentBossHp || 1;
    const damageRatio = totalDamage / bossHp;
    const stageMultiplier = this.getStageMultiplier();

    const gold = Math.floor(damageRatio * (this.currentBossData.goldReward || 600) * stageMultiplier);
    const exp = Math.floor(damageRatio * (this.currentBossData.expReward || 300) * stageMultiplier);

    return {
      gold,
      exp,
      totalDamage,
      hasRewards: gold > 0 || exp > 0
    };
  }

  /**
   * 보상 수령 — 누적 데미지 + 현재 진행도 전부 리셋
   * BUG-12 수정: 보상 수령 후 bossReady 상태 갱신 (진행도 0%로 리셋)
   * @returns {Object} { gold, exp, totalDamage, hasRewards }
   */
  claimRewards() {
    const rewards = this.getClaimableRewards();
    this.unclaimedDamage = 0;
    this.accumulatedDamage = 0;
    this.saveProgress();

    GameLogger.log('IDLE', '누적 보상 수령 (진행도 리셋)', {
      gold: rewards.gold,
      exp: rewards.exp,
      damageDealt: rewards.totalDamage,
      bossReady: false // 리셋 후 보스전 준비 해제
    });

    return rewards;
  }

  /**
   * 소탕 보상 계산 — 이전 단계의 예상 클리어 시간 기반
   * @returns {Object} { gold, exp, estimatedTime }
   */
  calculateSweepRewards() {
    const partyPower = this.getPartyPower();
    const dps = partyPower * 0.15;
    const boss = this.getBossForCurrentStage();
    const bossHp = boss.hp;

    // 예상 클리어 시간 (초) — 최소 10초, 최대 300초
    const estimatedTime = Math.max(10, Math.min(300, bossHp / Math.max(1, dps)));
    const stageMultiplier = this.getStageMultiplier();

    const gold = Math.floor(estimatedTime * this.constructor.BASE_GOLD_PER_SEC * stageMultiplier);
    const exp = Math.floor(estimatedTime * this.constructor.BASE_EXP_PER_SEC * stageMultiplier);

    return { gold, exp, estimatedTime: Math.floor(estimatedTime) };
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

    // 보스 데이터 리셋 (다음 보스 로드 트리거)
    this.accumulatedDamage = 0;
    this.currentBossData = null;

    GameLogger.log('IDLE', '보스전 승리 → 스테이지 진행', {
      cleared: `${clearedChapter}-${clearedStage}`,
      next: `${nextChapter}-${nextStage}`,
      name: this.currentStage.name
    });
  }
}
