import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import GameLogger from '../utils/GameLogger.js';
import { SaveManager } from '../systems/SaveManager.js';
import { moodSystem } from '../systems/MoodSystem.js';
import { SynergySystem } from '../systems/SynergySystem.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import { getAllCharacters, getCharacter } from '../data/index.js';
import { MOOD_COLORS } from '../config/layoutConfig.js';
import transitionManager from '../utils/TransitionManager.js';

/**
 * BattleScene - 전투 씬
 * Strategy Pattern: 스킬 효과
 * Observer Pattern: 전투 이벤트
 * State Pattern: 전투 상태 관리
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
    this.battleSpeed = 1;
    this.autoBattle = true;
    this.isProcessingTurn = false;
    this.battleEnded = false;
    this.turn = 0;
    this.waitingForManualInput = false;

    // 시너지 버프 저장
    this.synergyBuffs = { atk: 0, def: 0, spd: 0 };

    // 스킬 카드 관련
    this.skillCards = [];
    this.selectedSkillCard = null;
    this.targetSelectionMode = false;

    // 턴 순서 바
    this.turnOrderUnits = [];

    // 전투 이벤트 리스너 (Observer Pattern)
    this.battleEventListeners = [];
  }

  init(data) {
    this.stage = data?.stage;
    this.party = data?.party || [];
  }

  create() {
    try {
      console.log('[Battle] Scene created');
      // Reset battle state
      this.battleSpeed = this.registry.get('battleSpeed') || 1;
      this.autoBattle = this.registry.get('autoBattle') !== false;
      this.battleEnded = false;
      this.turn = 0;
      this.isProcessingTurn = false;
      this.waitingForManualInput = false;

      // H-10: ParticleManager 초기화
      this.particles = new ParticleManager(this);

      this.initializeBattlers();
      this.calculateSynergy();
      this.createBackground();
      this.createTurnOrderBar();
      this.createBattleUI();
      this.createBattlers();
      this.createControlButtons();
      this.createSkillCards();
      this.createSynergyDisplay();
      this.createManualTurnButton();

      // A-8.5: 전투 시작 트랜지션
      this.playBattleIntro();

      // Scene 종료 시 정리
      this.events.once('shutdown', () => {
        if (this.particles) {
          this.particles.destroy();
          this.particles = null;
        }
      });
    } catch (error) {
      console.error('[BattleScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  /**
   * 시너지 효과 계산 — SynergySystem 통합
   * cult/mood/role/special 4종 시너지 전투 반영
   */
  calculateSynergy() {
    console.log('[Battle] Calculating synergy effects via SynergySystem...');

    // 파티 영웅 ID 수집
    const partyHeroIds = this.allies.map(a => a.id).filter(Boolean);
    const heroData = getAllCharacters();

    // SynergySystem으로 시너지 계산
    this.activeSynergies = SynergySystem.calculatePartySynergies(partyHeroIds, heroData);
    console.log(`[Battle] Active synergies: ${this.activeSynergies.length}`, this.activeSynergies);

    // 시너지 버프 초기화 (레거시 호환)
    this.synergyBuffs = { atk: 0, def: 0, spd: 0 };

    // 시너지가 없으면 기본 클래스 시너지로 폴백
    if (this.activeSynergies.length === 0) {
      this.calculateFallbackSynergy();
    }

    // 시너지 버프 적용
    this.applySynergyBuffs();
  }

  /**
   * 폴백: 기본 클래스 시너지 (SynergySystem에서 시너지를 찾지 못한 경우)
   */
  calculateFallbackSynergy() {
    const classCounts = {};
    this.allies.forEach(ally => {
      const heroClass = ally.class || 'warrior';
      classCounts[heroClass] = (classCounts[heroClass] || 0) + 1;
    });

    Object.entries(classCounts).forEach(([cls, count]) => {
      if (count >= 4) {
        this.synergyBuffs.atk += 0.20;
        this.synergyBuffs.def += 0.15;
        this.synergyBuffs.spd += 0.10;
      } else if (count >= 3) {
        this.synergyBuffs.atk += 0.15;
        this.synergyBuffs.def += 0.10;
      } else if (count >= 2) {
        this.synergyBuffs.atk += 0.10;
      }
    });
  }

  /**
   * 시너지 버프 적용 — SynergySystem.applySynergiesToStats() 사용
   */
  applySynergyBuffs() {
    this.allies.forEach(ally => {
      if (ally.stats && this.activeSynergies && this.activeSynergies.length > 0) {
        const modified = SynergySystem.applySynergiesToStats(ally.stats, this.activeSynergies);
        ally.stats = modified;
        // 보너스 효과 저장 (크리티컬율 등)
        ally.synergyBonuses = modified.bonuses || {};
        // 크리티컬율 반영
        if (ally.synergyBonuses.crit_rate) {
          ally.critRate = (ally.critRate || 0.1) + ally.synergyBonuses.crit_rate;
        }
        if (ally.synergyBonuses.crit_dmg) {
          ally.critDmg = (ally.critDmg || 1.5) + ally.synergyBonuses.crit_dmg;
        }
      } else if (ally.stats) {
        // 폴백 시너지 적용
        ally.stats.atk = Math.floor(ally.stats.atk * (1 + this.synergyBuffs.atk));
        ally.stats.def = Math.floor(ally.stats.def * (1 + this.synergyBuffs.def));
        ally.stats.spd = Math.floor(ally.stats.spd * (1 + this.synergyBuffs.spd));
      }
    });
    console.log('[Battle] Synergy buffs applied:', this.activeSynergies?.length || 0, 'synergies');
  }

  initializeBattlers() {
    console.log('[Battle] Initializing battlers...');
    GameLogger.log('BATTLE', `전투 초기화 - 스테이지: ${this.stage?.name || 'unknown'}`, { partySize: this.party.length });

    // Initialize party battlers
    this.allies = this.party.map((hero, index) => {
      const stats = hero.stats || { hp: 100, atk: 10, def: 10, spd: 10 };
      return {
      ...hero,
      name: hero.name || hero.id || '???',
      stats,
      currentHp: stats.hp,
      maxHp: stats.hp,
      skillGauge: 0,
      maxSkillGauge: 100,
      position: index,
      isAlly: true,
      isAlive: true,
      class: hero.class || 'warrior',
      skills: hero.skills && hero.skills.length > 0 ? hero.skills : (() => {
        try {
          const charData = getCharacter(hero.id || hero.characterId);
          return charData?.skills || [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }];
        } catch {
          return [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }];
        }
      })()
    };
    });

    console.log(`[Battle] Initialized ${this.allies.length} allies`);

    // Generate enemies based on stage
    const enemyCount = this.stage?.enemyCount || 3;
    this.enemies = [];

    for (let i = 0; i < enemyCount; i++) {
      const baseStats = 500 + (this.stage?.recommendedPower || 1000) / 5;
      const enemy = {
        id: `enemy_${i}`,
        name: this.getEnemyName(),
        currentHp: Math.floor(baseStats * (0.8 + Math.random() * 0.4)),
        maxHp: Math.floor(baseStats * (0.8 + Math.random() * 0.4)),
        stats: {
          atk: Math.floor(baseStats / 8 * (0.8 + Math.random() * 0.4)),
          def: Math.floor(baseStats / 10 * (0.8 + Math.random() * 0.4)),
          spd: Math.floor(30 + Math.random() * 30)
        },
        skillGauge: 0,
        maxSkillGauge: 100,
        position: i,
        isAlly: false,
        isAlive: true,
        mood: this.getRandomMood()
      };
      this.enemies.push(enemy);
    }

    this.enemies.forEach(e => e.maxHp = e.currentHp);

    console.log(`[Battle] Initialized ${this.enemies.length} enemies`);

    // Combine and sort by speed for turn order
    this.allBattlers = [...this.allies, ...this.enemies];
  }

  getEnemyName() {
    const names = ['슬라임', '고블린', '오크', '스켈레톤', '좀비', '늑대', '박쥐', '거미', '뱀', '악마'];
    return Phaser.Math.RND.pick(names);
  }

  /**
   * 랜덤 분위기 반환
   */
  getRandomMood() {
    const moods = ['brave', 'fierce', 'wild', 'calm', 'stoic', 'devoted', 'cunning', 'noble', 'mystic'];
    return Phaser.Math.RND.pick(moods);
  }

  /**
   * Mood 상성 배율 계산
   * @returns {{ multiplier: number, advantage: string }}
   */
  getMoodMatchup(attackerMood, defenderMood) {
    if (!attackerMood || !defenderMood) {
      return { multiplier: 1.0, advantage: 'NEUTRAL' };
    }
    try {
      return moodSystem.getMatchupMultiplier(attackerMood, defenderMood);
    } catch (e) {
      console.warn('[Battle] Mood matchup error:', e.message);
      return { multiplier: 1.0, advantage: 'NEUTRAL' };
    }
  }

  createBackground() {
    // Battle arena background
    const graphics = this.add.graphics();

    // Sky gradient
    for (let y = 0; y < GAME_HEIGHT * 0.6; y++) {
      const ratio = y / (GAME_HEIGHT * 0.6);
      const r = Math.floor(20 + ratio * 10);
      const g = Math.floor(15 + ratio * 15);
      const b = Math.floor(40 + ratio * 20);
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // Ground
    graphics.fillStyle(0x2a1a0a, 1);
    graphics.fillRect(0, GAME_HEIGHT * 0.6, GAME_WIDTH, GAME_HEIGHT * 0.4);

    // Ground texture
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(GAME_HEIGHT * 0.6, GAME_HEIGHT * 0.85);
      graphics.fillStyle(0x3a2a1a, 0.5);
      graphics.fillCircle(x, y, Phaser.Math.Between(2, 5));
    }
  }

  /**
   * 턴 순서 바 생성 (상단)
   */
  createTurnOrderBar() {
    console.log('[Battle] Creating turn order bar...');

    // 턴 순서 바 컨테이너
    this.turnOrderContainer = this.add.container(0, 70).setDepth(15);

    // 턴 순서 바 배경
    const turnBarBg = this.add.rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH - 20, 50, COLORS.backgroundLight, 0.9);
    turnBarBg.setStrokeStyle(2, COLORS.primary);
    this.turnOrderContainer.add(turnBarBg);

    // 턴 순서 라벨
    const turnLabel = this.add.text(20, 0, '턴 순서:', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0, 0.5);
    this.turnOrderContainer.add(turnLabel);

    // 턴 순서 아이콘들
    this.turnOrderIcons = [];
    this.updateTurnOrderBar();
  }

  /**
   * 턴 순서 바 업데이트
   */
  updateTurnOrderBar() {
    // 기존 아이콘 제거
    this.turnOrderIcons.forEach(icon => icon.destroy());
    this.turnOrderIcons = [];

    // SPD 기준 정렬
    const activeBattlers = this.allBattlers.filter(b => b.isAlive);
    activeBattlers.sort((a, b) => (b.stats?.spd || 0) - (a.stats?.spd || 0));

    const startX = 90;
    const spacing = 45;
    const maxIcons = Math.min(8, activeBattlers.length);

    activeBattlers.slice(0, maxIcons).forEach((battler, index) => {
      const x = startX + index * spacing;
      const isCurrentTurn = index === 0;

      // 아이콘 배경
      const iconBg = this.add.circle(x, 0, isCurrentTurn ? 18 : 15,
        battler.isAlly ? COLORS.primary : COLORS.danger, isCurrentTurn ? 1 : 0.7);
      if (isCurrentTurn) {
        iconBg.setStrokeStyle(3, COLORS.accent);
      }

      // 유닛 이름 첫글자
      const initial = (battler.name || '?').charAt(0);
      const iconText = this.add.text(x, 0, initial, {
        fontSize: isCurrentTurn ? '14px' : '11px',
        fontFamily: 'Arial',
        color: '#ffffff',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      // SPD 표시
      const spdText = this.add.text(x, 20, `${battler.stats?.spd || 0}`, {
        fontSize: '8px',
        fontFamily: 'Arial',
        color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      this.turnOrderContainer.add([iconBg, iconText, spdText]);
      this.turnOrderIcons.push(iconBg, iconText, spdText);
    });

    console.log('[Battle] Turn order updated:', activeBattlers.map(b => `${b.name}(SPD:${b.stats?.spd || 0})`).join(' > '));
  }

  createBattleUI() {
    // Top status bar
    const topBar = this.add.rectangle(GAME_WIDTH / 2, 30, GAME_WIDTH, 60, COLORS.backgroundLight, 0.9);
    topBar.setDepth(10);

    // Stage name
    this.add.text(20, 30, this.stage?.name || 'Battle', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(11);

    // Turn counter
    this.turnText = this.add.text(GAME_WIDTH / 2, 30, 'Turn 0', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0')
    }).setOrigin(0.5).setDepth(11);

    // Battle log area
    this.logContainer = this.add.container(0, 0).setDepth(5);
    this.battleLogs = [];
  }

  /**
   * 시너지 효과 표시 생성 — SynergySystem 통합
   */
  createSynergyDisplay() {
    console.log('[Battle] Creating synergy display...');

    const synergies = this.activeSynergies || [];

    // 시너지가 없으면 폴백 표시
    if (synergies.length === 0 && this.synergyBuffs.atk === 0 && this.synergyBuffs.def === 0) {
      return;
    }

    // 시너지 컨테이너
    const containerHeight = Math.max(60, synergies.length * 20 + 30);
    this.synergyContainer = this.add.container(GAME_WIDTH - 100, 130).setDepth(12);

    // 시너지 배경
    const synergyBg = this.add.rectangle(0, 0, 100, containerHeight, COLORS.backgroundLight, 0.85);
    synergyBg.setStrokeStyle(1, COLORS.accent);
    this.synergyContainer.add(synergyBg);

    // 시너지 타이틀
    const synergyTitle = this.add.text(0, -containerHeight / 2 + 10, '시너지', {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.synergyContainer.add(synergyTitle);

    if (synergies.length > 0) {
      // SynergySystem 기반 표시
      let yOffset = -containerHeight / 2 + 28;
      const typeIcons = { cult: '⛪', mood: '🎭', role: '⚔️', special: '✨', mood_balance: '☯️', mood_special: '🌟' };
      const typeColors = { cult: COLORS.secondary, mood: COLORS.primary, role: COLORS.danger, special: COLORS.accent, mood_balance: COLORS.success, mood_special: COLORS.accent };

      synergies.forEach(syn => {
        const icon = typeIcons[syn.type] || '●';
        const color = typeColors[syn.type] || COLORS.text;
        const label = `${icon} ${syn.name || syn.type}`;
        const synText = this.add.text(0, yOffset, label, {
          fontSize: '9px',
          fontFamily: 'Arial',
          color: '#' + color.toString(16).padStart(6, '0')
        }).setOrigin(0.5);
        this.synergyContainer.add(synText);
        yOffset += 16;
      });
    } else {
      // 폴백 버프 표시
      let yOffset = -5;
      if (this.synergyBuffs.atk > 0) {
        const atkText = this.add.text(0, yOffset, `ATK +${Math.round(this.synergyBuffs.atk * 100)}%`, {
          fontSize: '9px', fontFamily: 'Arial',
          color: '#' + COLORS.danger.toString(16).padStart(6, '0')
        }).setOrigin(0.5);
        this.synergyContainer.add(atkText);
        yOffset += 12;
      }
      if (this.synergyBuffs.def > 0) {
        const defText = this.add.text(0, yOffset, `DEF +${Math.round(this.synergyBuffs.def * 100)}%`, {
          fontSize: '9px', fontFamily: 'Arial',
          color: '#' + COLORS.primary.toString(16).padStart(6, '0')
        }).setOrigin(0.5);
        this.synergyContainer.add(defText);
      }
    }
  }

  /**
   * 스킬 카드 UI 생성
   */
  createSkillCards() {
    console.log('[Battle] Creating skill cards...');

    // 스킬 카드 컨테이너 (하단)
    this.skillCardContainer = this.add.container(0, GAME_HEIGHT - 160).setDepth(20);

    // 스킬 카드 배경
    const cardAreaBg = this.add.rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH, 60, COLORS.background, 0.9);
    this.skillCardContainer.add(cardAreaBg);

    // 각 아군 영웅별 스킬 카드 생성
    this.skillCards = [];
    const cardWidth = 70;
    const cardSpacing = 10;
    const totalWidth = this.allies.length * (cardWidth + cardSpacing) - cardSpacing;
    const startX = (GAME_WIDTH - totalWidth) / 2 + cardWidth / 2;

    this.allies.forEach((ally, index) => {
      const x = startX + index * (cardWidth + cardSpacing);
      const card = this.createSkillCard(x, 0, ally, index);
      this.skillCards.push(card);
    });
  }

  /**
   * 개별 스킬 카드 생성
   */
  createSkillCard(x, y, ally, index) {
    const card = this.add.container(x, y);

    // 스킬 게이지 비율
    const gaugePercent = ally.skillGauge / ally.maxSkillGauge;
    const isReady = ally.skillGauge >= ally.maxSkillGauge;

    // 카드 배경
    const cardBg = this.add.rectangle(0, 0, 65, 50, isReady ? COLORS.secondary : COLORS.backgroundLight, isReady ? 1 : 0.7);
    cardBg.setStrokeStyle(2, isReady ? COLORS.accent : COLORS.primary);

    if (isReady) {
      cardBg.setInteractive({ useHandCursor: true });
      cardBg.on('pointerdown', () => this.onSkillCardClick(ally, index));
    }

    // 영웅 이름
    const allyName = ally.name || '???';
    const heroName = allyName.length > 4 ? allyName.substring(0, 4) : allyName;
    const nameText = this.add.text(0, -17, heroName, {
      fontSize: '9px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // A-5: 스킬명 표시 (skill1 우선, skill2 있으면 표시)
    const skill1 = ally.skills?.find(s => s.id === 'skill1') || ally.skills?.[1];
    const skill2 = ally.skills?.find(s => s.id === 'skill2') || ally.skills?.[2];
    const activeSkill = skill1;
    const skillLabel = activeSkill ? (activeSkill.name.length > 5 ? activeSkill.name.substring(0, 5) : activeSkill.name) : '스킬';
    const hasSkill2 = skill2 && ally.skillGauge >= (skill2.gaugeCost || 150);
    const skillText = this.add.text(0, -6, hasSkill2 ? '★' + skillLabel : skillLabel, {
      fontSize: '7px',
      fontFamily: 'Arial',
      color: isReady ? (hasSkill2 ? '#FF6B6B' : '#FFD700') : '#999999'
    }).setOrigin(0.5);

    // 스킬 게이지 바
    const gaugeBg = this.add.rectangle(0, 8, 55, 6, 0x333333, 1);
    const gaugeFill = this.add.rectangle(-27.5, 8, 55 * gaugePercent, 4, isReady ? COLORS.accent : COLORS.secondary, 1);
    gaugeFill.setOrigin(0, 0.5);

    // 게이지 텍스트
    const gaugeText = this.add.text(0, 19, `${ally.skillGauge}/${ally.maxSkillGauge}`, {
      fontSize: '8px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    card.add([cardBg, nameText, skillText, gaugeBg, gaugeFill, gaugeText]);

    // 준비 완료 시 빛남(pulse) 효과
    if (isReady) {
      this.tweens.add({
        targets: cardBg,
        alpha: { from: 1, to: 0.6 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
    card.setData('ally', ally);
    card.setData('index', index);
    card.setData('cardBg', cardBg);
    card.setData('gaugeFill', gaugeFill);
    card.setData('gaugeText', gaugeText);
    card.setData('skillText', skillText);

    this.skillCardContainer.add(card);

    return card;
  }

  /**
   * 스킬 카드 클릭 핸들러
   */
  onSkillCardClick(ally, index) {
    if (!ally.isAlive || this.battleEnded) return;
    if (ally.skillGauge < ally.maxSkillGauge) return;

    console.log(`[Battle] Skill card clicked: ${ally.name}`);

    // 타겟 선택 모드 활성화
    this.selectedSkillCard = { ally, index };
    this.targetSelectionMode = true;

    // 적 타겟 하이라이트
    this.highlightTargets(true);
  }

  /**
   * 타겟 하이라이트
   */
  highlightTargets(highlight) {
    this.enemySprites.forEach((sprite, idx) => {
      const enemy = this.enemies[idx];
      if (!enemy?.isAlive) return;

      const mainSprite = sprite.getData('sprite');
      if (highlight) {
        mainSprite.setTint(0xff6666);
        sprite.setInteractive(new Phaser.Geom.Circle(0, 0, 40), Phaser.Geom.Circle.Contains);
        sprite.on('pointerdown', () => this.onTargetSelected(enemy, idx));
      } else {
        mainSprite.clearTint();
        sprite.removeInteractive();
        sprite.removeAllListeners('pointerdown');
      }
    });
  }

  /**
   * 타겟 선택 완료
   */
  onTargetSelected(target, targetIndex) {
    if (!this.selectedSkillCard) return;

    const { ally } = this.selectedSkillCard;
    console.log(`[Battle] Target selected: ${target.name} by ${ally.name}`);

    // 스킬 발동
    this.executeManualSkill(ally, target);

    // 선택 모드 해제
    this.targetSelectionMode = false;
    this.selectedSkillCard = null;
    this.highlightTargets(false);
  }

  /**
   * 수동 스킬 발동
   */
  executeManualSkill(attacker, target) {
    if (!attacker.isAlive || this.battleEnded) return;

    console.log(`[Battle] Manual skill executed: ${attacker.name} -> ${target.name}`);

    // 캐릭터 실제 스킬 데이터 사용
    const skill = attacker.skills?.find(s => s.id === 'skill1') || attacker.skills?.[1];
    if (!skill) return; // No skill available

    // 스킬 게이지 소비
    attacker.skillGauge = 0;
    this.updateSkillCardUI(attacker);

    // AoE 스킬: 전체 적 공격
    if (skill.target === 'all') {
      const aliveEnemies = this.enemies.filter(e => e.isAlive);
      this.addBattleLog(`${attacker.name}의 ${skill.name}! 전체 공격!`);
      aliveEnemies.forEach((enemy, i) => {
        this.time.delayedCall(i * 100 / this.battleSpeed, () => {
          this._applyManualDamage(attacker, enemy, skill);
        });
      });
      this.time.delayedCall(aliveEnemies.length * 100 / this.battleSpeed + 200, () => {
        this.checkBattleEnd();
      });
      return;
    }

    // 단일 대상 스킬
    if (!target.isAlive) return;
    this._applyManualDamage(attacker, target, skill);
    this.checkBattleEnd();
  }

  /**
   * 수동 스킬 데미지 적용 (단일 대상)
   */
  _applyManualDamage(attacker, target, skill) {
    if (!target.isAlive || this.battleEnded) return;

    const baseDamage = attacker.stats?.atk || 100;
    const defense = target.stats?.def || 50;
    const moodResult = this.getMoodMatchup(attacker.mood, target.mood);
    const critChance = attacker.critRate || 0.1;
    const isCrit = Math.random() < critChance;
    const critMultiplier = isCrit ? (attacker.critDmg || 1.5) : 1;
    const aoeMod = skill.target === 'all' ? 0.7 : 1.0;
    const damage = Math.max(1, Math.floor(baseDamage * skill.multiplier * aoeMod * critMultiplier * moodResult.multiplier * (1 - defense / (defense + 200))));

    if (isCrit) this.cameras.main.shake(150, 0.005);

    target.currentHp = Math.max(0, target.currentHp - damage);
    this.updateBattlerUI(target);
    this.playSkillEffect(attacker, target, isCrit, true, skill);
    this.showDamage(target, damage, isCrit, moodResult.advantage);

    const critText = isCrit ? ' (크리티컬!)' : '';
    const moodText = moodResult.advantage === 'ADVANTAGE' ? ' (유리▲)' : moodResult.advantage === 'DISADVANTAGE' ? ' (불리▼)' : '';
    this.addBattleLog(`  → ${target.name}에게 ${damage} 데미지${critText}${moodText}`);

    if (target.currentHp <= 0) {
      target.isAlive = false;
      this.playDeathAnimation(target);
      this.addBattleLog(`${target.name} 쓰러짐!`);
    }
    this.updateTurnOrderBar();
  }

  /**
   * 스킬 카드 UI 업데이트
   */
  updateSkillCardUI(ally) {
    const card = this.skillCards.find(c => c.getData('ally') === ally);
    if (!card) return;

    const gaugePercent = ally.skillGauge / ally.maxSkillGauge;
    const isReady = ally.skillGauge >= ally.maxSkillGauge;

    const cardBg = card.getData('cardBg');
    const gaugeFill = card.getData('gaugeFill');
    const gaugeText = card.getData('gaugeText');

    cardBg.setFillStyle(isReady ? COLORS.secondary : COLORS.backgroundLight, isReady ? 1 : 0.7);
    cardBg.setStrokeStyle(2, isReady ? COLORS.accent : COLORS.primary);

    this.tweens.add({
      targets: gaugeFill,
      width: 55 * gaugePercent,
      duration: 200
    });

    gaugeText.setText(`${ally.skillGauge}/${ally.maxSkillGauge}`);

    // 스킬명 색상 업데이트
    const skillTextObj = card.getData('skillText');
    if (skillTextObj) {
      skillTextObj.setColor(isReady ? '#FFD700' : '#999999');
    }

    // 인터랙티브 상태 업데이트
    if (isReady && !cardBg.input) {
      cardBg.setInteractive({ useHandCursor: true });
      cardBg.on('pointerdown', () => this.onSkillCardClick(ally, card.getData('index')));
      // 준비 완료 시 빛남 효과
      this.tweens.add({
        targets: cardBg,
        alpha: { from: 1, to: 0.6 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    } else if (!isReady && cardBg.input) {
      cardBg.removeInteractive();
      this.tweens.killTweensOf(cardBg);
      cardBg.setAlpha(0.7);
    }
  }

  /**
   * A-8.1 + H-4 + H-10: ParticleManager 기반 스킬 이펙트
   * @param {object} attacker - 공격자 배틀러
   * @param {object} target - 대상 배틀러
   * @param {boolean} isCrit - 크리티컬 여부
   * @param {boolean} isUltimate - 궁극기 여부
   * @param {object|null} skill - 사용된 스킬 객체 (id, name, target 등)
   */
  playSkillEffect(attacker, target, isCrit, isUltimate = false, skill = null) {
    const targetSprites = target.isAlly ? this.allySprites : this.enemySprites;
    const targetSprite = targetSprites[target.position];
    if (!targetSprite) return;

    const mood = attacker.mood || 'brave';
    const x = targetSprite.x;
    const y = targetSprite.y;

    if (this.particles) {
      const skillId = skill?.id || '';
      const isHeal = skill?.isHeal || skill?.target === 'ally' || skill?.target === 'all_allies' ||
        skill?.name?.includes('힐') || skill?.name?.includes('치유') || skill?.name?.includes('회복');

      if (isHeal) {
        // 힐 스킬: 녹색 힐링 파티클 + 반짝임
        this.particles.playPreset('heal', x, y, {
          colors: [0x44ff44, 0x88ffaa, 0xffffff],
          count: 12
        });
        // 힐링 링 이펙트
        this.particles.playPreset('sparkle', x, y - 20, {
          colors: [0x22C55E, 0x4ADE80, 0xBBF7D0],
          count: 8
        });
      } else if (skillId === 'skill2' || (isUltimate && skillId !== 'skill1')) {
        // skill2 / 궁극기: 대규모 이펙트 + 화면 흔들림
        this.particles.playMoodEffect(mood, x, y, 'ultimate');
        this.cameras.main.shake(200, 0.01);
        // 추가 화면 플래시
        const moodFlashColors = {
          brave: [255, 80, 60], fierce: [255, 100, 40], wild: [50, 200, 100],
          calm: [60, 160, 230], stoic: [100, 130, 150], devoted: [240, 50, 110],
          cunning: [160, 90, 200], noble: [255, 220, 50], mystic: [250, 170, 30]
        };
        const flashColor = moodFlashColors[mood] || [255, 255, 255];
        this.cameras.main.flash(200, flashColor[0], flashColor[1], flashColor[2], true);
      } else if (skillId === 'skill1' || isUltimate) {
        // skill1: 중간 규모 이펙트 + 약한 화면 흔들림
        this.particles.playMoodEffect(mood, x, y, 'skill');
        this.cameras.main.shake(100, 0.005);
      } else if (isCrit) {
        // 기본 공격 크리티컬: 강한 히트 이펙트
        this.particles.playMoodEffect(mood, x, y, 'skill');
      } else {
        // 기본 공격: 간단한 히트 이펙트
        this.particles.playMoodEffect(mood, x, y, 'hit');
      }
    }

    // 타겟 흔들림 (피격 반응) — 스킬 등급에 따라 강도 조절
    const isHeal = skill?.isHeal || skill?.target === 'ally' || skill?.target === 'all_allies';
    if (!isHeal) {
      const shakeIntensity = isUltimate ? 12 : (isCrit ? 8 : 4);
      const shakeRepeat = isUltimate ? 4 : (isCrit ? 3 : 1);
      this.tweens.add({
        targets: targetSprite,
        x: targetSprite.x + shakeIntensity,
        duration: 50 / this.battleSpeed,
        yoyo: true,
        repeat: shakeRepeat,
        ease: 'Sine.easeInOut'
      });
    } else {
      // 힐 대상: 부드러운 스케일 업 반응
      this.tweens.add({
        targets: targetSprite,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 200 / this.battleSpeed,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
    }
  }

  /**
   * H-4.2: 데미지 숫자 표시 (ParticleManager 연동)
   */
  showDamageNumber(target, value, type = 'normal') {
    const targetSprites = target.isAlly ? this.allySprites : this.enemySprites;
    const targetSprite = targetSprites[target.position];
    if (!targetSprite || !this.particles) return;

    this.particles.showDamageNumber(targetSprite.x, targetSprite.y - 30, value, type);
  }

  /**
   * 힐 숫자 표시
   */
  showHealNumber(target, healAmount) {
    const sprites = target.isAlly ? this.allySprites : this.enemySprites;
    const sprite = sprites[target.position];
    if (!sprite) return;

    // ParticleManager의 showDamageNumber를 사용 (heal 타입)
    if (this.particles) {
      this.particles.showDamageNumber(sprite.x, sprite.y - 30, healAmount, 'heal');
    }

    // 추가 힐 텍스트 (떠오르는 +HP)
    const healText = this.add.text(sprite.x, sprite.y - 60, `+${healAmount}`, {
      fontSize: '22px', fontFamily: 'Arial',
      color: '#4ADE80', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(20);

    this.tweens.add({
      targets: healText,
      y: healText.y - 40,
      alpha: 0,
      duration: 900 / this.battleSpeed,
      ease: 'Quad.easeOut',
      onComplete: () => healText.destroy()
    });
  }

  /**
   * A-8.4: 궁극기 컷인 연출
   */
  playUltimateCutIn(battler, callback) {
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0).setDepth(30);

    // 화면 어둡게
    this.tweens.add({
      targets: overlay,
      alpha: 0.7,
      duration: 200 / this.battleSpeed
    });

    // 캐릭터 이름 + 스킬명 표시
    const cutInBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, 100, 0x000000, 0).setDepth(31);
    this.tweens.add({
      targets: cutInBg,
      alpha: 0.8,
      duration: 150 / this.battleSpeed
    });

    // 캐릭터 아이콘 줌인
    const moodColorMap = {
      brave: 0xE74C3C, fierce: 0xFF5722, wild: 0x27AE60,
      calm: 0x3498DB, stoic: 0x607D8B, devoted: 0xE91E63,
      cunning: 0x9B59B6, noble: 0xFFD700, mystic: 0xF39C12
    };
    const moodColor = moodColorMap[battler.mood] || COLORS.primary;

    const portrait = this.add.circle(GAME_WIDTH / 2 - 120, GAME_HEIGHT / 2, 35, moodColor, 0.9).setDepth(32).setScale(0);
    const nameText = this.add.text(GAME_WIDTH / 2 + 20, GAME_HEIGHT / 2 - 15, battler.name, {
      fontSize: '22px', fontFamily: 'Arial',
      color: '#FFFFFF', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3
    }).setOrigin(0, 0.5).setDepth(32).setAlpha(0);

    const skillText = this.add.text(GAME_WIDTH / 2 + 20, GAME_HEIGHT / 2 + 15, '⚡ 궁극기 발동!', {
      fontSize: '16px', fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0, 0.5).setDepth(32).setAlpha(0);

    // 줌인 애니메이션
    this.tweens.add({
      targets: portrait,
      scale: 1, duration: 200 / this.battleSpeed,
      ease: 'Back.easeOut'
    });
    this.tweens.add({
      targets: [nameText, skillText],
      alpha: 1, x: '+=0',
      duration: 150 / this.battleSpeed,
      delay: 100 / this.battleSpeed
    });

    // 컷인 종료 후 콜백
    this.time.delayedCall(800 / this.battleSpeed, () => {
      this.tweens.add({
        targets: [overlay, cutInBg, portrait, nameText, skillText],
        alpha: 0, duration: 200 / this.battleSpeed,
        onComplete: () => {
          overlay.destroy();
          cutInBg.destroy();
          portrait.destroy();
          nameText.destroy();
          skillText.destroy();
          if (callback) callback();
        }
      });
    });
  }

  /**
   * A-8.5: 전투 시작 트랜지션
   */
  playBattleIntro() {
    // 전체 화면 검정 오버레이
    const introOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1).setDepth(50);

    // 스테이지 이름 표시
    const stageName = this.stage?.name || '전투 시작';
    const stageText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, stageName, {
      fontSize: '28px', fontFamily: 'Georgia, serif',
      color: '#FFFFFF', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(51).setAlpha(0);

    const battleText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, '⚔️ BATTLE START ⚔️', {
      fontSize: '18px', fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(51).setAlpha(0);

    // 와이프인 텍스트
    this.tweens.add({
      targets: stageText,
      alpha: 1, duration: 300, delay: 200
    });
    this.tweens.add({
      targets: battleText,
      alpha: 1, duration: 300, delay: 400
    });

    // 오버레이 페이드 아웃
    this.tweens.add({
      targets: introOverlay,
      alpha: 0, duration: 500, delay: 1000,
      onComplete: () => introOverlay.destroy()
    });
    this.tweens.add({
      targets: [stageText, battleText],
      alpha: 0, y: '-=30', duration: 400, delay: 1200,
      onComplete: () => { stageText.destroy(); battleText.destroy(); }
    });

    // 전투 시작은 인트로 후
    this.time.delayedCall(1500, () => {
      this.startBattle();
    });
  }

  /**
   * 수동 턴 진행 버튼 생성
   */
  createManualTurnButton() {
    console.log('[Battle] Creating manual turn button...');

    // 수동 턴 버튼 (AUTO OFF일 때만 표시)
    this.manualTurnBtn = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 95).setDepth(21);

    const btnBg = this.add.rectangle(0, 0, 120, 40, COLORS.accent, 1)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, COLORS.primary);

    const btnText = this.add.text(0, 0, '다음 턴', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#000000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.manualTurnBtn.add([btnBg, btnText]);
    this.manualTurnBtn.setData('bg', btnBg);

    btnBg.on('pointerdown', () => {
      if (this.waitingForManualInput && !this.isProcessingTurn && !this.battleEnded) {
        console.log('[Battle] Manual turn triggered');
        this.waitingForManualInput = false;
        this.processTurn();
      }
    });

    // 초기 상태 - AUTO ON이면 숨김
    this.manualTurnBtn.setVisible(!this.autoBattle);
  }

  createBattlers() {
    // Ally positions (left side)
    const allyStartX = 80;
    const allyStartY = 350;
    const allySpacing = 90;

    this.allySprites = [];
    this.allies.forEach((ally, index) => {
      const y = allyStartY + index * allySpacing;
      if (y < GAME_HEIGHT - 150) {
        const sprite = this.createBattlerSprite(allyStartX, y, ally, true);
        this.allySprites.push(sprite);
      }
    });

    // Enemy positions (right side)
    const enemyStartX = GAME_WIDTH - 80;
    const enemyStartY = 350;
    const enemySpacing = 90;

    this.enemySprites = [];
    this.enemies.forEach((enemy, index) => {
      const y = enemyStartY + index * enemySpacing;
      if (y < GAME_HEIGHT - 150) {
        const sprite = this.createBattlerSprite(enemyStartX, y, enemy, false);
        this.enemySprites.push(sprite);
      }
    });
  }

  createBattlerSprite(x, y, battler, isAlly) {
    const container = this.add.container(x, y);

    // Character sprite
    const sprite = this.add.image(0, 0, isAlly ? 'hero_placeholder' : 'enemy_placeholder');
    sprite.setScale(isAlly ? 0.9 : 0.85);
    if (!isAlly) sprite.setFlipX(true);

    // HP bar background
    const hpBarBg = this.add.rectangle(0, -55, 70, 10, 0x333333, 1);

    // HP bar fill
    const hpBarFill = this.add.rectangle(-35, -55, 70, 8, COLORS.success, 1);
    hpBarFill.setOrigin(0, 0.5);

    // HP text
    const hpText = this.add.text(0, -55, `${battler.currentHp}`, {
      fontSize: '9px',
      fontFamily: 'Arial',
      color: '#ffffff'
    }).setOrigin(0.5);

    // Skill gauge background
    const skillGaugeBg = this.add.rectangle(0, -42, 50, 6, 0x333333, 1);

    // Skill gauge fill
    const skillGaugeFill = this.add.rectangle(-25, -42, 0, 4, COLORS.secondary, 1);
    skillGaugeFill.setOrigin(0, 0.5);

    // Name tag
    const battlerName = battler.name || '???';
    const name = battlerName.length > 6 ? battlerName.substring(0, 6) : battlerName;
    const nameTag = this.add.text(0, 45, name, {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#' + (isAlly ? COLORS.text : COLORS.danger).toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    container.add([sprite, hpBarBg, hpBarFill, hpText, skillGaugeBg, skillGaugeFill, nameTag]);

    // Store references
    container.setData('battler', battler);
    container.setData('sprite', sprite);
    container.setData('hpBarFill', hpBarFill);
    container.setData('hpText', hpText);
    container.setData('skillGaugeFill', skillGaugeFill);

    return container;
  }

  createControlButtons() {
    const controlY = GAME_HEIGHT - 50;

    // Control bar background
    this.add.rectangle(GAME_WIDTH / 2, controlY, GAME_WIDTH, 100, COLORS.backgroundLight, 0.95).setDepth(10);

    // Auto battle toggle
    this.autoBtn = this.add.container(80, controlY).setDepth(11);
    const autoBg = this.add.rectangle(0, 0, 100, 40, this.autoBattle ? COLORS.success : COLORS.backgroundLight, 1)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, COLORS.primary);
    const autoText = this.add.text(0, 0, this.autoBattle ? 'AUTO ON' : 'AUTO OFF', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.autoBtn.add([autoBg, autoText]);
    this.autoBtn.setData('bg', autoBg);
    this.autoBtn.setData('text', autoText);

    autoBg.on('pointerdown', () => {
      this.autoBattle = !this.autoBattle;
      this.registry.set('autoBattle', this.autoBattle);
      autoBg.setFillStyle(this.autoBattle ? COLORS.success : COLORS.backgroundLight, 1);
      autoText.setText(this.autoBattle ? 'AUTO ON' : 'AUTO OFF');

      console.log(`[Battle] Auto battle toggled: ${this.autoBattle ? 'ON' : 'OFF'}`);

      // 수동 턴 버튼 표시/숨김
      if (this.manualTurnBtn) {
        this.manualTurnBtn.setVisible(!this.autoBattle);
      }

      // AUTO ON으로 전환했고 수동 입력 대기 중이었다면 자동 진행
      if (this.autoBattle && this.waitingForManualInput && !this.isProcessingTurn && !this.battleEnded) {
        this.waitingForManualInput = false;
        this.processTurn();
      }
    });

    // Speed buttons
    const speeds = [1, 2, 3];
    speeds.forEach((speed, index) => {
      const x = 200 + index * 60;
      const btn = this.add.container(x, controlY).setDepth(11);

      const isActive = this.battleSpeed === speed;
      const bg = this.add.rectangle(0, 0, 50, 40, isActive ? COLORS.primary : COLORS.backgroundLight, 1)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(1, COLORS.primary);
      const text = this.add.text(0, 0, `${speed}x`, {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: '#' + COLORS.text.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      btn.add([bg, text]);
      btn.setData('speed', speed);
      btn.setData('bg', bg);

      bg.on('pointerdown', () => {
        this.battleSpeed = speed;
        this.registry.set('battleSpeed', speed);
        SaveManager.updateSettings({ battleSpeed: speed });
        this.updateSpeedButtons();
      });

      if (!this.speedButtons) this.speedButtons = [];
      this.speedButtons.push(btn);
    });

    // Retreat button
    const retreatBtn = this.add.container(GAME_WIDTH - 70, controlY).setDepth(11);
    const retreatBg = this.add.rectangle(0, 0, 100, 40, COLORS.danger, 1)
      .setInteractive({ useHandCursor: true });
    const retreatText = this.add.text(0, 0, '퇴각', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    retreatBtn.add([retreatBg, retreatText]);

    retreatBg.on('pointerdown', () => {
      if (!this.battleEnded) {
        this.endBattle(false);
      }
    });
  }

  updateSpeedButtons() {
    if (!this.speedButtons) return;
    this.speedButtons.forEach(btn => {
      const bg = btn.getData('bg');
      const speed = btn.getData('speed');
      if (bg && bg.setFillStyle) {
        bg.setFillStyle(this.battleSpeed === speed ? COLORS.primary : COLORS.backgroundLight, 1);
      }
    });
  }

  startBattle() {
    console.log('[Battle] Battle started!');
    this.addBattleLog('전투 시작!');

    // 전투 이벤트 발행 (Observer Pattern)
    this.emitBattleEvent('battleStart', { turn: 0 });

    this.processTurn();
  }

  processTurn() {
    if (this.battleEnded || this.isProcessingTurn) return;

    console.log(`[Battle] Processing turn ${this.turn + 1}, autoBattle: ${this.autoBattle}`);

    this.isProcessingTurn = true;
    this.turn++;
    this.turnText.setText(`Turn ${this.turn}`);

    // 턴 순서 바 업데이트
    this.updateTurnOrderBar();

    // Sort battlers by speed
    const activeBattlers = this.allBattlers.filter(b => b.isAlive);
    activeBattlers.sort((a, b) => (b.stats?.spd || 0) - (a.stats?.spd || 0));

    console.log(`[Battle] Turn order: ${activeBattlers.map(b => `${b.name}(${b.stats?.spd || 0})`).join(' > ')}`);

    // 전투 이벤트 발행
    this.emitBattleEvent('turnStart', { turn: this.turn, order: activeBattlers.map(b => b.name) });

    // Process each battler's action
    let delay = 0;
    const baseDelay = 1000 / this.battleSpeed;

    activeBattlers.forEach((battler, index) => {
      this.time.delayedCall(delay, () => {
        if (this.battleEnded || !battler.isAlive) return;
        this.executeBattlerAction(battler);

        // 턴 순서 바 현재 유닛 하이라이트
        this.highlightCurrentTurnUnit(index);
      });
      delay += baseDelay;
    });

    // Check battle end and start next turn
    this.time.delayedCall(delay + 500 / this.battleSpeed, () => {
      this.isProcessingTurn = false;

      if (this.checkBattleEnd()) return;

      // AUTO ON: 자동 진행
      // AUTO OFF: 수동 입력 대기
      if (this.autoBattle) {
        this.processTurn();
      } else {
        console.log('[Battle] Waiting for manual input (AUTO OFF)');
        this.waitingForManualInput = true;

        // 수동 턴 버튼 강조
        if (this.manualTurnBtn) {
          this.tweens.add({
            targets: this.manualTurnBtn,
            scale: 1.1,
            duration: 300,
            yoyo: true,
            repeat: 2
          });
        }
      }
    });
  }

  /**
   * 현재 턴 유닛 하이라이트
   */
  highlightCurrentTurnUnit(index) {
    // 턴 순서 바의 아이콘 업데이트는 updateTurnOrderBar에서 처리
  }

  /**
   * 전투 이벤트 발행 (Observer Pattern)
   */
  emitBattleEvent(eventType, data) {
    console.log(`[Battle] Event: ${eventType}`, data);
    this.battleEventListeners.forEach(listener => {
      if (listener.eventType === eventType) {
        listener.callback(data);
      }
    });
  }

  /**
   * 전투 이벤트 구독 (Observer Pattern)
   */
  onBattleEvent(eventType, callback) {
    this.battleEventListeners.push({ eventType, callback });
  }

  /**
   * 스마트 AI 타겟 선택
   * 우선순위: 1) 힐러(healer) > 2) 상성 유리 > 3) 낮은 HP > 4) 고위협 대상
   */
  selectSmartTarget(battler, aliveTargets) {
    if (aliveTargets.length === 1) return aliveTargets[0];

    // 각 타겟에 점수 부여
    const scored = aliveTargets.map(target => {
      let score = 0;

      // 1) HP 비율이 낮은 대상 선호 (처치 가능성)
      const hpRatio = target.currentHp / target.maxHp;
      score += (1 - hpRatio) * 30;

      // 2) 상성 유리 대상 보너스
      const matchup = this.getMoodMatchup(battler.mood, target.mood);
      if (matchup.advantage === 'ADVANTAGE') score += 25;
      else if (matchup.advantage === 'DISADVANTAGE') score -= 15;

      // 3) 힐러/서포터 우선 제거 (적 진영)
      const role = target.role || target.class || '';
      if (role === 'healer') score += 20;
      else if (role === 'mage') score += 10;

      // 4) 높은 ATK 대상 우선 (위협 제거)
      const atk = target.stats?.atk || 0;
      score += atk / 20;

      // 5) 처치 가능 대상 최우선 (킬 확인)
      const estDmg = (battler.stats?.atk || 100) * 0.5;
      if (target.currentHp <= estDmg) score += 40;

      return { target, score };
    });

    // 점수 높은 순 정렬
    scored.sort((a, b) => b.score - a.score);
    return scored[0].target;
  }

  /**
   * A-5: 카드 덱에서 사용 가능한 스킬 선택
   * A-6: 스마트 AI 스킬/타겟 결정
   */
  executeBattlerAction(battler) {
    if (!battler.isAlive || this.battleEnded) return;

    console.log(`[Battle] ${battler.name} is taking action`);

    const targets = battler.isAlly ? this.enemies : this.allies;
    const aliveTargets = targets.filter(t => t.isAlive);
    if (aliveTargets.length === 0) return;

    // A-5: 스킬 목록 (basic, skill1, skill2)
    const basicSkill = battler.skills?.find(s => s.id === 'basic') || battler.skills?.[0] || { name: '기본 공격', multiplier: 1.0, gaugeGain: 20 };
    const skill1 = battler.skills?.find(s => s.id === 'skill1') || battler.skills?.[1];
    const skill2 = battler.skills?.find(s => s.id === 'skill2') || battler.skills?.[2];

    // A-6: 힐러 AI — HP 낮은 아군 힐 우선
    const role = battler.role || battler.class || '';
    if (role === 'healer' && battler.isAlly) {
      const allies = this.allies.filter(a => a.isAlive);
      const lowestHp = allies.reduce((min, a) => a.currentHp / a.maxHp < min.currentHp / min.maxHp ? a : min);
      if (lowestHp.currentHp / lowestHp.maxHp < 0.5) {
        const healSkill = battler.skills?.find(s =>
          s.isHeal || s.target === 'ally' || s.target === 'all_allies' ||
          s.name?.includes('힐') || s.name?.includes('치유') || s.name?.includes('회복')
        );
        if (healSkill && battler.skillGauge >= (healSkill.gaugeCost || battler.maxSkillGauge)) {
          this.playUltimateCutIn(battler, () => {
            this._executeAttack(battler, lowestHp, healSkill.multiplier, healSkill.name, true, healSkill);
          });
          return;
        }
      }
    }

    // A-6: 궁극기 사용 여부 결정 (스마트 로직)
    let chosenSkill = basicSkill;
    let isUltimate = false;

    // 스킬2 우선 체크 (더 강한 궁극기)
    if (skill2 && battler.skillGauge >= (skill2.gaugeCost || 150)) {
      // A-6.4: 보스전 보존 — 마지막 웨이브가 아닌 경우 보존
      const shouldPreserve = this.stage?.waves && this.currentWave < (this.stage.waves.length || 1) - 1;
      if (!shouldPreserve) {
        chosenSkill = skill2;
        isUltimate = true;
      }
    }

    // 스킬1 체크
    if (!isUltimate && skill1 && battler.skillGauge >= (skill1.gaugeCost || battler.maxSkillGauge)) {
      // A-6.1: 광역 vs 단일 스킬 선택
      if (skill1.target === 'all' && aliveTargets.length >= 3) {
        chosenSkill = skill1;
        isUltimate = true;
      } else if (skill1.target !== 'all') {
        chosenSkill = skill1;
        isUltimate = true;
      } else if (aliveTargets.length < 3 && skill1.target === 'all') {
        // 적이 적으면 기본공격이 효율적
        chosenSkill = basicSkill;
        isUltimate = false;
      }
    }

    // 타겟 선택
    const target = this.selectSmartTarget(battler, aliveTargets);

    // 궁극기 컷인 연출
    if (isUltimate) {
      this.playUltimateCutIn(battler, () => {
        this._executeAttack(battler, target, chosenSkill.multiplier, chosenSkill.name, true, chosenSkill);
      });
    } else {
      this._executeAttack(battler, target, chosenSkill.multiplier, chosenSkill.name, false, chosenSkill);
    }
  }

  /**
   * 실제 공격 실행 (컷인 연출 후 호출됨)
   */
  _executeAttack(battler, target, skillMultiplier, skillName, isUltimate, skill = null) {
    if (!target.isAlive || this.battleEnded) return;

    // AoE 스킬: target: "all" → 살아있는 적 전체 공격
    if (isUltimate && skill?.target === 'all') {
      const targets = battler.isAlly ? this.enemies : this.allies;
      const aliveTargets = targets.filter(t => t.isAlive);
      aliveTargets.forEach((t, i) => {
        this.time.delayedCall(i * 100 / this.battleSpeed, () => {
          this._executeSingleAttack(battler, t, skillMultiplier * 0.7, skillName, isUltimate, skill);
        });
      });
      // AoE 게이지 처리
      battler.skillGauge = 0;
      this.updateSkillGauge(battler);
      if (battler.isAlly) this.updateSkillCardUI(battler);
      this.addBattleLog(`${battler.name}의 ${skillName}! 전체 공격!`);
      return;
    }

    this._executeSingleAttack(battler, target, skillMultiplier, skillName, isUltimate, skill);

    // 스킬 게이지 처리
    const gaugeGain = skill?.gaugeGain || 20;
    if (isUltimate) {
      battler.skillGauge = 0;
    } else {
      battler.skillGauge = Math.min(battler.maxSkillGauge, battler.skillGauge + gaugeGain);
    }
    this.updateSkillGauge(battler);

    // 아군의 경우 스킬 카드 UI 업데이트
    if (battler.isAlly) {
      this.updateSkillCardUI(battler);
    }
  }

  /**
   * 단일 대상 공격 실행
   */
  _executeSingleAttack(battler, target, skillMultiplier, skillName, isUltimate, skill = null) {
    if (!target.isAlive || this.battleEnded) return;

    // 힐 스킬 판정
    const isHealSkill = skill?.isHeal || skill?.target === 'ally' || skill?.target === 'all_allies' ||
      skill?.name?.includes('힐') || skill?.name?.includes('치유') || skill?.name?.includes('회복');

    if (isHealSkill) {
      // ======== 힐 스킬 처리 ========
      const baseHeal = (battler.stats?.atk || 100) * skillMultiplier;
      const healAmount = Math.max(1, Math.floor(baseHeal * (0.9 + Math.random() * 0.2)));

      target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);

      console.log(`[Battle] Heal: ${battler.name} -> ${target.name} +${healAmount} HP`);

      // UI 업데이트
      this.updateBattlerUI(target);

      // 힐 이펙트 (파티클 + 반짝임)
      this.playSkillEffect(battler, target, false, isUltimate, skill);

      // 힐 숫자 표시
      this.showHealNumber(target, healAmount);

      // 로그
      this.addBattleLog(`${battler.name}의 ${skillName}! ${target.name} HP +${healAmount} 회복!`);

      // 턴 순서 바 업데이트
      this.updateTurnOrderBar();
      return;
    }

    // ======== 공격 스킬 처리 ========
    const baseDamage = battler.stats?.atk || 100;
    const defense = target.stats?.def || 50;

    // 분위기(Mood) 상성 배율 계산
    const moodResult = this.getMoodMatchup(battler.mood, target.mood);
    const moodMultiplier = moodResult.multiplier;

    // 크리티컬 계산
    const critChance = battler.critRate || 0.1;
    const isCrit = Math.random() < critChance;
    const critMultiplier = isCrit ? (battler.critDmg || 1.5) : 1.0;

    const damage = Math.max(1, Math.floor(
      baseDamage * skillMultiplier * critMultiplier * moodMultiplier *
      (1 - defense / (defense + 200)) * (0.9 + Math.random() * 0.2)
    ));

    console.log(`[Battle] Damage calc: base=${baseDamage}, skill=${skillMultiplier}x, crit=${critMultiplier}x, mood=${moodMultiplier}x, def=${defense}, final=${damage}`);
    GameLogger.log('BATTLE', `${battler.name} → ${target.name}: ${damage}dmg (${skillName})`, { mood: battler.mood, crit: isCrit, moodAdv: moodResult.advantage });

    // Apply damage
    target.currentHp = Math.max(0, target.currentHp - damage);

    // A-8.3: 크리티컬 화면 흔들림 강화 (playSkillEffect에서도 처리하므로 중복 방지)
    if (isCrit && !isUltimate) {
      this.cameras.main.shake(120, 0.004);
    }

    // Update UI
    this.updateBattlerUI(target);

    // Show damage (상성 정보 포함)
    this.showDamage(target, damage, isCrit, moodResult.advantage);

    // Attack animation + A-8.1 스킬 이펙트
    this.playAttackAnimation(battler, target, isCrit);
    this.playSkillEffect(battler, target, isCrit, isUltimate, skill);

    // Log
    const critText = isCrit ? ' (크리티컬!)' : '';
    const moodText = moodResult.advantage === 'ADVANTAGE' ? ' (유리▲)' : moodResult.advantage === 'DISADVANTAGE' ? ' (불리▼)' : '';
    this.addBattleLog(`${battler.name}의 ${skillName}! ${target.name}에게 ${damage} 데미지${critText}${moodText}`);

    // 턴 순서 바 업데이트
    this.updateTurnOrderBar();

    // Check if target died
    if (target.currentHp <= 0) {
      target.isAlive = false;
      this.playDeathAnimation(target);
      this.addBattleLog(`${target.name} 쓰러짐!`);

      // 전투 이벤트 발행
      this.emitBattleEvent('unitDeath', { unit: target.name, killedBy: battler.name });
    }
  }


  updateBattlerUI(battler) {
    const sprites = battler.isAlly ? this.allySprites : this.enemySprites;
    const sprite = sprites[battler.position];
    if (!sprite) return;

    const hpBarFill = sprite.getData('hpBarFill');
    const hpText = sprite.getData('hpText');

    const hpPercent = battler.currentHp / battler.maxHp;
    const barWidth = 70 * hpPercent;

    this.tweens.add({
      targets: hpBarFill,
      width: barWidth,
      duration: 200 / this.battleSpeed
    });

    // Change color based on HP
    let barColor = COLORS.success;
    if (hpPercent < 0.3) barColor = COLORS.danger;
    else if (hpPercent < 0.6) barColor = COLORS.accent;
    hpBarFill.setFillStyle(barColor, 1);

    hpText.setText(`${battler.currentHp}`);
  }

  updateSkillGauge(battler) {
    const sprites = battler.isAlly ? this.allySprites : this.enemySprites;
    const sprite = sprites[battler.position];
    if (!sprite) return;

    const skillGaugeFill = sprite.getData('skillGaugeFill');
    const gaugePercent = battler.skillGauge / battler.maxSkillGauge;

    this.tweens.add({
      targets: skillGaugeFill,
      width: 50 * gaugePercent,
      duration: 200 / this.battleSpeed
    });
  }

  /**
   * A-8.2: 데미지 숫자 세분화 + A-8.3: 크리티컬 강화
   */
  showDamage(target, damage, isCrit = false, moodAdvantage = 'NEUTRAL') {
    const sprites = target.isAlly ? this.allySprites : this.enemySprites;
    const sprite = sprites[target.position];
    if (!sprite) return;

    // A-8.2: 데미지 크기별 폰트 세분화
    let fontSize;
    if (isCrit) fontSize = '32px';
    else if (damage >= 300) fontSize = '26px';
    else if (damage >= 150) fontSize = '22px';
    else fontSize = '18px';

    // 상성 + 크리티컬에 따른 색상
    let color = COLORS.danger;
    if (isCrit && moodAdvantage === 'ADVANTAGE') color = 0xFF4500; // 크릿+유리 → 주황
    else if (isCrit) color = COLORS.accent;
    else if (moodAdvantage === 'ADVANTAGE') color = 0xFFD700;
    else if (moodAdvantage === 'DISADVANTAGE') color = 0x3498DB;

    // A-8.3: 크리티컬 스크린 플래시
    if (isCrit) {
      this.cameras.main.flash(150, 255, 200, 50, true);
    }

    const dmgText = this.add.text(sprite.x, sprite.y - 70, `-${damage}`, {
      fontSize, fontFamily: 'Arial',
      color: '#' + color.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isCrit ? 5 : 3
    }).setOrigin(0.5).setDepth(20);

    // A-8.2: 크리티컬 바운스 애니메이션
    if (isCrit) {
      dmgText.setScale(2);
      this.tweens.add({
        targets: dmgText,
        scale: 1.2,
        duration: 200 / this.battleSpeed,
        ease: 'Bounce.easeOut'
      });
    }

    // 상성 표시 (기존 유지 + 약간 개선)
    if (moodAdvantage === 'ADVANTAGE') {
      const advLabel = this.add.text(sprite.x + 45, sprite.y - 75, '▲유리', {
        fontSize: '12px', fontFamily: 'Arial',
        color: '#FFD700', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2
      }).setOrigin(0.5).setDepth(20);
      this.tweens.add({
        targets: advLabel,
        y: advLabel.y - 35, alpha: 0,
        duration: 900 / this.battleSpeed,
        onComplete: () => advLabel.destroy()
      });
    } else if (moodAdvantage === 'DISADVANTAGE') {
      const disLabel = this.add.text(sprite.x + 45, sprite.y - 75, '▼불리', {
        fontSize: '12px', fontFamily: 'Arial',
        color: '#3498DB', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2
      }).setOrigin(0.5).setDepth(20);
      this.tweens.add({
        targets: disLabel,
        y: disLabel.y - 35, alpha: 0,
        duration: 900 / this.battleSpeed,
        onComplete: () => disLabel.destroy()
      });
    }

    // A-8.3: 크리티컬 라벨 강화 (스케일 펀치)
    if (isCrit) {
      const critLabel = this.add.text(sprite.x, sprite.y - 100, '💥 CRITICAL!', {
        fontSize: '16px', fontFamily: 'Arial',
        color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(20).setScale(0.5);

      this.tweens.add({
        targets: critLabel,
        scale: 1.3, duration: 150 / this.battleSpeed,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: critLabel,
            y: critLabel.y - 30, alpha: 0, scale: 1.6,
            duration: 500 / this.battleSpeed,
            onComplete: () => critLabel.destroy()
          });
        }
      });
    }

    // 데미지 텍스트 애니메이션 (위로 올라가며 사라짐)
    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 50,
      alpha: 0,
      scale: isCrit ? 1.5 : 1,
      duration: 900 / this.battleSpeed,
      delay: isCrit ? 200 / this.battleSpeed : 0,
      onComplete: () => dmgText.destroy()
    });
  }

  playAttackAnimation(attacker, target, isCrit = false) {
    const attackerSprites = attacker.isAlly ? this.allySprites : this.enemySprites;
    const attackerSprite = attackerSprites[attacker.position];
    if (!attackerSprite) return;

    const targetSprites = target.isAlly ? this.allySprites : this.enemySprites;
    const targetSprite = targetSprites[target.position];
    if (!targetSprite) return;

    const direction = attacker.isAlly ? 1 : -1;
    const lungeDistance = isCrit ? 50 : 30;

    // Lunge animation
    this.tweens.add({
      targets: attackerSprite,
      x: attackerSprite.x + direction * lungeDistance,
      duration: 150 / this.battleSpeed,
      yoyo: true,
      ease: 'Power2'
    });

    // Target shake (크리티컬 시 강화)
    this.time.delayedCall(150 / this.battleSpeed, () => {
      const shakeIntensity = isCrit ? 10 : 5;
      const shakeRepeat = isCrit ? 4 : 2;

      this.tweens.add({
        targets: targetSprite,
        x: targetSprite.x + (Phaser.Math.Between(-shakeIntensity, shakeIntensity)),
        duration: 50 / this.battleSpeed,
        yoyo: true,
        repeat: shakeRepeat
      });

      // 히트 이펙트
      const hitColor = isCrit ? COLORS.accent : 0xffffff;
      const hitEffect = this.add.circle(targetSprite.x, targetSprite.y, 5, hitColor, 0.8);
      hitEffect.setDepth(25);

      this.tweens.add({
        targets: hitEffect,
        scale: isCrit ? 3 : 2,
        alpha: 0,
        duration: 200 / this.battleSpeed,
        onComplete: () => hitEffect.destroy()
      });
    });
  }

  playDeathAnimation(battler) {
    const sprites = battler.isAlly ? this.allySprites : this.enemySprites;
    const sprite = sprites[battler.position];
    if (!sprite) return;

    // 사망 파티클 (파편 흩어짐)
    for (let i = 0; i < 6; i++) {
      const shard = this.add.circle(
        sprite.x + Phaser.Math.Between(-15, 15),
        sprite.y + Phaser.Math.Between(-15, 15),
        Phaser.Math.Between(2, 5),
        battler.isAlly ? COLORS.primary : COLORS.danger,
        0.8
      ).setDepth(20);

      this.tweens.add({
        targets: shard,
        x: shard.x + Phaser.Math.Between(-60, 60),
        y: shard.y + Phaser.Math.Between(20, 60),
        alpha: 0,
        duration: 600 / this.battleSpeed,
        onComplete: () => shard.destroy()
      });
    }

    this.tweens.add({
      targets: sprite,
      alpha: 0,
      y: sprite.y + 20,
      duration: 500 / this.battleSpeed
    });
  }

  addBattleLog(message) {
    // Simple floating log
    const logText = this.add.text(GAME_WIDTH / 2, 100, message, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setDepth(15);

    this.tweens.add({
      targets: logText,
      y: logText.y - 30,
      alpha: 0,
      duration: 2000 / this.battleSpeed,
      delay: 1000 / this.battleSpeed,
      onComplete: () => logText.destroy()
    });
  }

  checkBattleEnd() {
    const alliesAlive = this.allies.filter(a => a.isAlive).length;
    const enemiesAlive = this.enemies.filter(e => e.isAlive).length;

    if (enemiesAlive === 0) {
      this.endBattle(true);
      return true;
    }

    if (alliesAlive === 0) {
      this.endBattle(false);
      return true;
    }

    return false;
  }

  endBattle(victory) {
    console.log(`[Battle] Battle ended: ${victory ? 'VICTORY' : 'DEFEAT'}`);
    const survivors = this.allies.filter(a => a.isAlive).length;
    GameLogger.log('BATTLE', `전투 종료 - ${victory ? '승리' : '패배'}`, { turns: this.turn, survivors, totalAllies: this.allies.length });

    this.battleEnded = true;
    this.waitingForManualInput = false;

    // 전투 이벤트 발행
    this.emitBattleEvent('battleEnd', { victory, turn: this.turn });

    this.time.delayedCall(500 / this.battleSpeed, () => {
      this.showBattleResult(victory);
    });
  }

  showBattleResult(victory) {
    console.log('[Battle] Showing battle result...');

    // A-8.5: 승리/패배 연출 강화
    if (victory) {
      this.cameras.main.flash(400, 255, 215, 0, true);

      // 승리 텍스트
      const victoryText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, '✨ VICTORY ✨', {
        fontSize: '36px', fontFamily: 'Georgia, serif',
        color: '#FFD700', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 5
      }).setOrigin(0.5).setDepth(40).setScale(0);

      this.tweens.add({
        targets: victoryText,
        scale: 1.2, duration: 400, ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: victoryText,
            alpha: 0, y: victoryText.y - 30,
            duration: 400, delay: 300,
            onComplete: () => victoryText.destroy()
          });
        }
      });
    } else {
      this.cameras.main.fade(600, 50, 0, 0, true);

      // 패배 텍스트
      const defeatText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, 'DEFEAT', {
        fontSize: '36px', fontFamily: 'Georgia, serif',
        color: '#EF4444', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 5
      }).setOrigin(0.5).setDepth(40).setAlpha(0);

      this.tweens.add({
        targets: defeatText,
        alpha: 1, duration: 500,
        onComplete: () => {
          this.tweens.add({
            targets: defeatText,
            alpha: 0, duration: 400, delay: 300,
            onComplete: () => defeatText.destroy()
          });
        }
      });
    }

    const aliveCount = this.allies.filter(a => a.isAlive).length;
    const totalAllies = this.allies.length;

    let newStars = 0;
    let rewards = { gold: 0, exp: 0 };
    let levelUpResults = [];

    if (victory) {
      // 성과 기반 별점 계산
      const avgHpRatio = this.allies.reduce((sum, a) => sum + (a.isAlive ? a.currentHp / a.maxHp : 0), 0) / totalAllies;

      newStars = 1;
      if (aliveCount === totalAllies && avgHpRatio > 0.5) {
        newStars = 3;
      } else if (aliveCount >= Math.ceil(totalAllies / 2)) {
        newStars = 2;
      }
      if (this.turn <= 20 && newStars < 3) newStars++;

      // 스테이지 클리어 기록
      const clearedStages = this.registry.get('clearedStages') || {};
      if (this.stage) {
        const currentStars = clearedStages[this.stage.id] || 0;
        if (newStars > currentStars) {
          clearedStages[this.stage.id] = newStars;
          this.registry.set('clearedStages', clearedStages);
          SaveManager.clearStage(this.stage.id, newStars);
        }
      }

      // 보상 지급
      rewards = this.stage?.rewards || { gold: 100, exp: 50 };
      const newGold = SaveManager.addGold(rewards.gold);
      this.registry.set('gold', newGold);

      // 캐릭터 EXP 지급
      const expPerHero = Math.floor(rewards.exp / totalAllies);
      this.allies.forEach(ally => {
        if (ally.id) {
          try {
            const expResult = ProgressionSystem.addExp(ally.id, expPerHero);
            if (expResult.success && expResult.levelsGained > 0) {
              levelUpResults.push({
                name: ally.name,
                newLevel: expResult.newLevel,
                gained: expResult.levelsGained
              });
            }
          } catch (e) {
            console.warn('[Battle] EXP error:', ally.id, e.message);
          }
        }
      });
    }

    // BattleResultScene으로 전환 (PRD VFX-1.2: 승리=flash / 패배=fadeOut)
    const resultData = {
      victory,
      stars: newStars,
      rewards,
      levelUpResults,
      stage: this.stage,
      party: this.party,
      turnCount: this.turn,
      aliveCount,
      totalAllies
    };
    this.time.delayedCall(800 / this.battleSpeed, () => {
      if (victory) {
        transitionManager.victoryTransition(this, resultData);
      } else {
        transitionManager.defeatTransition(this, resultData);
      }
    });
  }

  update() {
    // Handle manual turn trigger when auto is off
    // 수동 턴 버튼 상태 업데이트
    if (this.manualTurnBtn) {
      const shouldShow = !this.autoBattle && this.waitingForManualInput && !this.battleEnded;
      const alpha = shouldShow ? 1 : 0.5;

      const bg = this.manualTurnBtn.getData('bg');
      if (bg) {
        bg.setAlpha(alpha);
      }
    }
  }

  /**
   * 씬 정리
   */
  shutdown() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.battleEventListeners = [];
    this.targetSelectionMode = false;
    this.selectedSkillCard = null;
    if (this.input) {
      this.input.removeAllListeners();
    }
  }
}
