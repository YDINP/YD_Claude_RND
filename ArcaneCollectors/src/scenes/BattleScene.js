import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';

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
    console.log('[Battle] Scene created');
    this.cameras.main.fadeIn(300);

    // Reset battle state
    this.battleSpeed = this.registry.get('battleSpeed') || 1;
    this.autoBattle = this.registry.get('autoBattle') !== false;
    this.battleEnded = false;
    this.turn = 0;
    this.isProcessingTurn = false;
    this.waitingForManualInput = false;

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

    // Start battle after brief delay
    this.time.delayedCall(500, () => {
      this.startBattle();
    });
  }

  /**
   * 시너지 효과 계산
   * 같은 교단(클래스) 영웅 조합 시 버프
   */
  calculateSynergy() {
    console.log('[Battle] Calculating synergy effects...');

    // 클래스별 카운트
    const classCounts = {};
    const elementCounts = {};

    this.allies.forEach(ally => {
      const heroClass = ally.class || 'warrior';
      const element = ally.element || 'neutral';

      classCounts[heroClass] = (classCounts[heroClass] || 0) + 1;
      elementCounts[element] = (elementCounts[element] || 0) + 1;
    });

    // 시너지 버프 초기화
    this.synergyBuffs = { atk: 0, def: 0, spd: 0 };

    // 클래스 시너지 계산
    Object.entries(classCounts).forEach(([cls, count]) => {
      if (count >= 4) {
        this.synergyBuffs.atk += 0.20;
        this.synergyBuffs.def += 0.15;
        this.synergyBuffs.spd += 0.10;
        console.log(`[Battle] Class synergy (${cls}) 4+: ATK +20%, DEF +15%, SPD +10%`);
      } else if (count >= 3) {
        this.synergyBuffs.atk += 0.15;
        this.synergyBuffs.def += 0.10;
        console.log(`[Battle] Class synergy (${cls}) 3: ATK +15%, DEF +10%`);
      } else if (count >= 2) {
        this.synergyBuffs.atk += 0.10;
        console.log(`[Battle] Class synergy (${cls}) 2: ATK +10%`);
      }
    });

    // 속성 시너지 계산
    Object.entries(elementCounts).forEach(([elem, count]) => {
      if (count >= 3) {
        this.synergyBuffs.atk += 0.10;
        console.log(`[Battle] Element synergy (${elem}) 3+: ATK +10%`);
      } else if (count >= 2) {
        this.synergyBuffs.def += 0.05;
        console.log(`[Battle] Element synergy (${elem}) 2: DEF +5%`);
      }
    });

    // 시너지 버프 적용
    this.applySynergyBuffs();
  }

  /**
   * 시너지 버프 적용
   */
  applySynergyBuffs() {
    this.allies.forEach(ally => {
      if (ally.stats) {
        ally.stats.atk = Math.floor(ally.stats.atk * (1 + this.synergyBuffs.atk));
        ally.stats.def = Math.floor(ally.stats.def * (1 + this.synergyBuffs.def));
        ally.stats.spd = Math.floor(ally.stats.spd * (1 + this.synergyBuffs.spd));
      }
    });
    console.log('[Battle] Synergy buffs applied:', this.synergyBuffs);
  }

  initializeBattlers() {
    console.log('[Battle] Initializing battlers...');

    // Initialize party battlers
    this.allies = this.party.map((hero, index) => ({
      ...hero,
      currentHp: hero.stats.hp,
      maxHp: hero.stats.hp,
      skillGauge: 0,
      maxSkillGauge: 100,
      position: index,
      isAlly: true,
      isAlive: true,
      class: hero.class || 'warrior',
      element: hero.element || 'neutral',
      skills: hero.skills || [
        { id: 'basic', name: '기본 공격', multiplier: 1, gaugeGain: 20, description: '기본 공격을 합니다.' },
        { id: 'skill1', name: '강력 일격', multiplier: 2.5, gaugeCost: 100, description: '강력한 공격을 합니다.' }
      ]
    }));

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
        element: Phaser.Math.RND.pick(['fire', 'water', 'wind', 'light', 'dark', 'neutral'])
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
      const initial = battler.name.charAt(0);
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
   * 시너지 효과 표시 생성
   */
  createSynergyDisplay() {
    console.log('[Battle] Creating synergy display...');

    // 시너지가 없으면 표시하지 않음
    if (this.synergyBuffs.atk === 0 && this.synergyBuffs.def === 0 && this.synergyBuffs.spd === 0) {
      return;
    }

    // 시너지 컨테이너
    this.synergyContainer = this.add.container(GAME_WIDTH - 100, 130).setDepth(12);

    // 시너지 배경
    const synergyBg = this.add.rectangle(0, 0, 80, 60, COLORS.backgroundLight, 0.85);
    synergyBg.setStrokeStyle(1, COLORS.accent);
    this.synergyContainer.add(synergyBg);

    // 시너지 타이틀
    const synergyTitle = this.add.text(0, -20, '시너지', {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.synergyContainer.add(synergyTitle);

    // 버프 표시
    let yOffset = -5;
    if (this.synergyBuffs.atk > 0) {
      const atkText = this.add.text(0, yOffset, `ATK +${Math.round(this.synergyBuffs.atk * 100)}%`, {
        fontSize: '9px',
        fontFamily: 'Arial',
        color: '#' + COLORS.danger.toString(16).padStart(6, '0')
      }).setOrigin(0.5);
      this.synergyContainer.add(atkText);
      yOffset += 12;
    }
    if (this.synergyBuffs.def > 0) {
      const defText = this.add.text(0, yOffset, `DEF +${Math.round(this.synergyBuffs.def * 100)}%`, {
        fontSize: '9px',
        fontFamily: 'Arial',
        color: '#' + COLORS.primary.toString(16).padStart(6, '0')
      }).setOrigin(0.5);
      this.synergyContainer.add(defText);
      yOffset += 12;
    }
    if (this.synergyBuffs.spd > 0) {
      const spdText = this.add.text(0, yOffset, `SPD +${Math.round(this.synergyBuffs.spd * 100)}%`, {
        fontSize: '9px',
        fontFamily: 'Arial',
        color: '#' + COLORS.success.toString(16).padStart(6, '0')
      }).setOrigin(0.5);
      this.synergyContainer.add(spdText);
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
    const heroName = ally.name.length > 4 ? ally.name.substring(0, 4) : ally.name;
    const nameText = this.add.text(0, -15, heroName, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    // 스킬 게이지 바
    const gaugeBg = this.add.rectangle(0, 5, 55, 6, 0x333333, 1);
    const gaugeFill = this.add.rectangle(-27.5, 5, 55 * gaugePercent, 4, isReady ? COLORS.accent : COLORS.secondary, 1);
    gaugeFill.setOrigin(0, 0.5);

    // 게이지 텍스트
    const gaugeText = this.add.text(0, 17, `${ally.skillGauge}/${ally.maxSkillGauge}`, {
      fontSize: '8px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    card.add([cardBg, nameText, gaugeBg, gaugeFill, gaugeText]);
    card.setData('ally', ally);
    card.setData('index', index);
    card.setData('cardBg', cardBg);
    card.setData('gaugeFill', gaugeFill);
    card.setData('gaugeText', gaugeText);

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
    if (!attacker.isAlive || !target.isAlive || this.battleEnded) return;

    console.log(`[Battle] Manual skill executed: ${attacker.name} -> ${target.name}`);

    // 스킬 정보
    const skill = attacker.skills?.[1] || { name: '강력 일격', multiplier: 2.5, gaugeCost: 100 };

    // 스킬 게이지 소비
    attacker.skillGauge = 0;
    this.updateSkillCardUI(attacker);

    // 데미지 계산 (크리티컬 포함)
    const baseDamage = attacker.stats?.atk || 100;
    const defense = target.stats?.def || 50;
    const isCrit = Math.random() < 0.25;
    const critMultiplier = isCrit ? 1.5 : 1;
    const damage = Math.max(1, Math.floor(baseDamage * skill.multiplier * critMultiplier * (1 - defense / (defense + 200))));

    // 크리티컬 화면 흔들림
    if (isCrit) {
      this.cameras.main.shake(150, 0.005);
    }

    // 데미지 적용
    target.currentHp = Math.max(0, target.currentHp - damage);
    this.updateBattlerUI(target);

    // 스킬 이펙트
    this.playSkillEffect(attacker, target, isCrit);

    // 데미지 표시
    this.showDamage(target, damage, isCrit);

    // 로그
    const critText = isCrit ? ' (크리티컬!)' : '';
    this.addBattleLog(`${attacker.name}의 ${skill.name}! ${target.name}에게 ${damage} 데미지${critText}`);

    // 타겟 사망 체크
    if (target.currentHp <= 0) {
      target.isAlive = false;
      this.playDeathAnimation(target);
      this.addBattleLog(`${target.name} 쓰러짐!`);
    }

    // 턴 순서 업데이트
    this.updateTurnOrderBar();

    // 승패 체크
    this.checkBattleEnd();
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

    // 인터랙티브 상태 업데이트
    if (isReady && !cardBg.input) {
      cardBg.setInteractive({ useHandCursor: true });
      cardBg.on('pointerdown', () => this.onSkillCardClick(ally, card.getData('index')));
    } else if (!isReady && cardBg.input) {
      cardBg.removeInteractive();
    }
  }

  /**
   * 스킬 이펙트 재생
   */
  playSkillEffect(attacker, target, isCrit) {
    const targetSprites = target.isAlly ? this.allySprites : this.enemySprites;
    const targetSprite = targetSprites[target.position];
    if (!targetSprite) return;

    // 스킬 이펙트 원형
    const effect = this.add.circle(targetSprite.x, targetSprite.y, 10, isCrit ? COLORS.accent : COLORS.secondary, 0.8);
    effect.setDepth(25);

    this.tweens.add({
      targets: effect,
      scale: isCrit ? 4 : 3,
      alpha: 0,
      duration: 400 / this.battleSpeed,
      ease: 'Power2',
      onComplete: () => effect.destroy()
    });

    // 파티클 효과
    for (let i = 0; i < (isCrit ? 8 : 5); i++) {
      const particle = this.add.circle(
        targetSprite.x + Phaser.Math.Between(-20, 20),
        targetSprite.y + Phaser.Math.Between(-20, 20),
        Phaser.Math.Between(3, 6),
        isCrit ? COLORS.accent : COLORS.secondary,
        0.9
      ).setDepth(25);

      this.tweens.add({
        targets: particle,
        x: particle.x + Phaser.Math.Between(-50, 50),
        y: particle.y - Phaser.Math.Between(30, 60),
        alpha: 0,
        duration: 500 / this.battleSpeed,
        onComplete: () => particle.destroy()
      });
    }
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
    const name = battler.name.length > 6 ? battler.name.substring(0, 6) : battler.name;
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
      bg.setFillStyle(this.battleSpeed === speed ? COLORS.primary : COLORS.backgroundLight, 1);
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

  executeBattlerAction(battler) {
    if (!battler.isAlive || this.battleEnded) return;

    console.log(`[Battle] ${battler.name} is taking action`);

    // Find target
    const targets = battler.isAlly ? this.enemies : this.allies;
    const aliveTargets = targets.filter(t => t.isAlive);

    if (aliveTargets.length === 0) return;

    // 타겟 선택 (가장 낮은 HP 우선)
    const target = aliveTargets.reduce((min, curr) =>
      curr.currentHp < min.currentHp ? curr : min
    );

    // 스킬 사용 여부 결정 (AI가 스킬 게이지가 충분하면 스킬 사용)
    const useSkill = battler.skillGauge >= battler.maxSkillGauge && battler.isAlly === false;
    const skillMultiplier = useSkill ? 2.5 : 1.0;
    const skillName = useSkill ? '강력 일격' : '기본 공격';

    // Calculate damage
    const baseDamage = battler.stats?.atk || 100;
    const defense = target.stats?.def || 50;

    // 크리티컬 계산
    const critChance = battler.critRate || 0.1;
    const isCrit = Math.random() < critChance;
    const critMultiplier = isCrit ? (battler.critDmg || 1.5) : 1.0;

    // 속성 상성 계산
    const elementBonus = this.calculateElementBonus(battler.element, target.element);

    const damage = Math.max(1, Math.floor(
      baseDamage * skillMultiplier * critMultiplier * (1 + elementBonus) *
      (1 - defense / (defense + 200)) * (0.9 + Math.random() * 0.2)
    ));

    console.log(`[Battle] Damage calc: base=${baseDamage}, skill=${skillMultiplier}x, crit=${critMultiplier}x, element=${elementBonus}, def=${defense}, final=${damage}`);

    // Apply damage
    target.currentHp = Math.max(0, target.currentHp - damage);

    // 크리티컬 화면 흔들림
    if (isCrit) {
      this.cameras.main.shake(100, 0.003);
    }

    // Update UI
    this.updateBattlerUI(target);

    // Show damage
    this.showDamage(target, damage, isCrit);

    // Attack animation
    this.playAttackAnimation(battler, target, isCrit);

    // Log
    const critText = isCrit ? ' (크리티컬!)' : '';
    const elementText = elementBonus > 0 ? ' (유리)' : elementBonus < 0 ? ' (불리)' : '';
    this.addBattleLog(`${battler.name}의 ${skillName}! ${target.name}에게 ${damage} 데미지${critText}${elementText}`);

    // 스킬 게이지 처리
    if (useSkill) {
      battler.skillGauge = 0;
    } else {
      battler.skillGauge = Math.min(battler.maxSkillGauge, battler.skillGauge + 20);
    }
    this.updateSkillGauge(battler);

    // 아군의 경우 스킬 카드 UI 업데이트
    if (battler.isAlly) {
      this.updateSkillCardUI(battler);
    }

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

  /**
   * 속성 상성 보너스 계산
   */
  calculateElementBonus(attackerElement, defenderElement) {
    if (!attackerElement || !defenderElement) return 0;
    if (attackerElement === defenderElement) return 0;
    if (attackerElement === 'neutral' || defenderElement === 'neutral') return 0;

    // fire > wind > water > fire
    const elementCycle = {
      fire: 'wind',
      wind: 'water',
      water: 'fire'
    };

    // light <-> dark
    const opposites = {
      light: 'dark',
      dark: 'light'
    };

    if (elementCycle[attackerElement] === defenderElement) {
      return 0.25; // 유리
    }

    if (elementCycle[defenderElement] === attackerElement) {
      return -0.25; // 불리
    }

    if (opposites[attackerElement] === defenderElement) {
      return 0.25; // 상호 유리
    }

    return 0;
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

  showDamage(target, damage, isCrit = false) {
    const sprites = target.isAlly ? this.allySprites : this.enemySprites;
    const sprite = sprites[target.position];
    if (!sprite) return;

    const fontSize = isCrit ? '28px' : '20px';
    const color = isCrit ? COLORS.accent : COLORS.danger;

    const dmgText = this.add.text(sprite.x, sprite.y - 70, `-${damage}`, {
      fontSize: fontSize,
      fontFamily: 'Arial',
      color: '#' + color.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isCrit ? 4 : 3
    }).setOrigin(0.5).setDepth(20);

    // 크리티컬 시 추가 텍스트
    if (isCrit) {
      const critLabel = this.add.text(sprite.x, sprite.y - 95, 'CRITICAL!', {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5).setDepth(20);

      this.tweens.add({
        targets: critLabel,
        y: critLabel.y - 30,
        alpha: 0,
        scale: 1.5,
        duration: 600 / this.battleSpeed,
        onComplete: () => critLabel.destroy()
      });
    }

    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 40,
      alpha: 0,
      scale: isCrit ? 1.3 : 1,
      duration: 800 / this.battleSpeed,
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

    // 승리/패배 연출 강화
    if (victory) {
      // 승리 플래시 효과
      this.cameras.main.flash(300, 255, 215, 0, true);
    } else {
      // 패배 시 어두워지는 효과
      this.cameras.main.fade(500, 50, 0, 0, true);
    }

    // Overlay
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setDepth(50);

    // Result container
    const result = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(60);

    // Result background
    const resultBg = this.add.rectangle(0, 0, 300, 350, COLORS.backgroundLight, 0.95);
    resultBg.setStrokeStyle(3, victory ? COLORS.success : COLORS.danger);

    // Result text
    const resultText = this.add.text(0, -130, victory ? '승리!' : '패배...', {
      fontSize: '36px',
      fontFamily: 'Georgia, serif',
      color: '#' + (victory ? COLORS.success : COLORS.danger).toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    result.add([resultBg, resultText]);

    if (victory) {
      // Mark stage as cleared (store as object with stars)
      const clearedStages = this.registry.get('clearedStages') || {};
      if (this.stage) {
        const currentStars = clearedStages[this.stage.id] || 0;
        const newStars = 3; // TODO: Calculate based on performance
        if (newStars > currentStars) {
          clearedStages[this.stage.id] = newStars;
          this.registry.set('clearedStages', clearedStages);
          // Persist to SaveManager
          SaveManager.clearStage(this.stage.id, newStars);
        }
      }

      // Rewards
      const rewards = this.stage?.rewards || { gold: 100, exp: 50 };

      // Add gold and persist to SaveManager
      const newGold = SaveManager.addGold(rewards.gold);
      this.registry.set('gold', newGold);

      // Rewards display
      const rewardTitle = this.add.text(0, -70, '보상', {
        fontSize: '18px',
        fontFamily: 'Arial',
        color: '#' + COLORS.text.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      const goldReward = this.add.text(0, -30, `골드: +${rewards.gold}`, {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: '#' + COLORS.accent.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      const expReward = this.add.text(0, 0, `경험치: +${rewards.exp}`, {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: '#' + COLORS.primary.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      // Stars
      const stars = this.add.text(0, 50, '★★★', {
        fontSize: '32px',
        color: '#' + COLORS.accent.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      result.add([rewardTitle, goldReward, expReward, stars]);
    } else {
      // Defeat message
      const defeatMsg = this.add.text(0, -30, '다음에 다시 도전하세요!', {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      result.add(defeatMsg);
    }

    // Continue button
    const continueBtn = this.add.container(0, 120);
    const continueBg = this.add.rectangle(0, 0, 150, 50, COLORS.primary, 1)
      .setInteractive({ useHandCursor: true });
    const continueText = this.add.text(0, 0, '확인', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    continueBtn.add([continueBg, continueText]);
    result.add(continueBtn);

    continueBg.on('pointerdown', () => {
      this.cameras.main.fadeOut(300);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('StageSelectScene');
      });
    });

    // Entrance animation
    result.setScale(0);
    this.tweens.add({
      targets: result,
      scale: 1,
      duration: 300,
      ease: 'Back.easeOut'
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
    console.log('[Battle] Scene shutdown');

    // 이벤트 리스너 정리
    this.battleEventListeners = [];

    // 타겟 선택 모드 해제
    this.targetSelectionMode = false;
    this.selectedSkillCard = null;
  }
}
