import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../config/gameConfig.js';
import GameLogger from '../utils/GameLogger.js';
import { SaveManager } from '../systems/SaveManager.js';
import { moodSystem } from '../systems/MoodSystem.js';
import { SynergySystem } from '../systems/SynergySystem.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import { getAllCharacters, getCharacter, getCharacterOrHero, getEnemy, calculateEnemyStats } from '../data/index.js';
import { MOOD_COLORS } from '../config/layoutConfig.js';
import transitionManager from '../utils/TransitionManager.js';
import { StoryManager } from '../systems/StoryManager.js';
import characterRenderer from '../renderers/CharacterRenderer.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
import SkillAnimationManager from '../systems/SkillAnimationManager.js';
import { EnhancedHPBar } from '../components/EnhancedHPBar.js';
import { TowerSystem } from '../systems/TowerSystem.js';
import { sweepSystem } from '../systems/SweepSystem.js';
import {
  toBattleUnit,
  createSceneBattleSystem,
  decideSceneAction,
  selectSmartTarget,
  describeMoodAdvantage,
  collectNewDeaths,
  affectedUnitsOf,
  drainBattleLog,
  isHealSkill,
  applyGaugeAfterAction,
  resolveMoodMatchup,
  AOE_DAMAGE_MULTIPLIER
} from '../systems/BattleSceneAdapter.js';
// T-17 리디자인 — 렌더/레이아웃 전용 의존. 전투 로직은 건드리지 않는다
import { GlassPanel, GLASS_VARIANT } from '../components/GlassPanel.js';
import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import { IconFactory } from '../utils/IconFactory.js';
import { ts } from '../utils/textStyles.ts';
import { DESIGN, getCultColor } from '../config/designSystem.js';
import { DIM_ALPHA } from '../utils/bgLayout.js';
import {
  BATTLE_LAYOUT,
  SKILL_SLOT,
  LOG_LINES,
  resolveBattleBgKey,
  getAllySlots,
  getEnemySlots,
  getUnitAttachments,
  getSkillSlots,
  computeCooldownArc,
  computeTurnOrderSlots,
  pushLogLine,
  getLogLineY,
  buildCultBadges
} from '../utils/battleLayout.js';

/** 렌더 레이어. 궁극기 컷인(30~32)과 인트로(50)는 기존 값을 그대로 둔다 */
const BATTLE_DEPTH = Object.freeze({
  unit: 10,
  log: 24,
  hud: 26,
  hudContent: 27,
  manualTurn: 28
});

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

    // RES-ABS-4: 로드된 히어로 추적
    this._loadedHeroIds = [];
  }

  init(data) {
    this.stage = data?.stage;
    this.party = data?.party || [];
    this.mode = data?.mode || 'normal';  // 추가: 보스전 모드 수용
    this.towerFloor = data?.towerFloor;  // 타워 층 번호 저장
  }

  create() {
    try {
      console.log('[Battle] Scene created');

      // 파티 데이터 방어
      if (!this.party || this.party.length === 0) {
        // SaveManager에서 파티 자동 로드 시도
        const saveData = SaveManager.load();
        const parties = saveData?.parties || [];
        const rawParty = parties[0];
        const heroIds = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
        this.party = heroIds.map(id => {
          const charData = (saveData?.characters || []).find(c => c.id === id || c.characterId === id);
          const staticData = getCharacter(id);
          if (!staticData && !charData) return null;
          return { ...staticData, ...charData, id, stats: staticData?.stats || charData?.stats };
        }).filter(Boolean);

        if (this.party.length === 0) {
          console.warn('[BattleScene] 파티 데이터 없음');
          this.scene.start('MainMenuScene');
          return;
        }
      }

      // Reset battle state
      this.battleSpeed = this.registry.get('battleSpeed') || 1;
      this.autoBattle = this.registry.get('autoBattle') !== false;

      // 보스전: 수동 전투 강제 (registry 읽기 이후에 적용해야 덮어쓰기 방지)
      if (this.mode === 'boss') {
        this.autoBattle = false;
      }
      this.battleEnded = false;
      this.turn = 0;
      this.isProcessingTurn = false;
      this.waitingForManualInput = false;

      // H-10: ParticleManager 초기화
      this.particles = new ParticleManager(this);

      // RES-ABS-4: 파티 + 적 전투 스프라이트 동적 로드
      const partyIds = this.party.map(h => h.id);
      this._loadedHeroIds = partyIds;

      if (characterRenderer.useAssets && partyIds.length > 0) {
        characterRenderer.preloadAssets(this, this.party, { ids: partyIds, types: ['battle'] });
        this.load.start();
        this.load.once('complete', () => {
          this.initBattle();
        });
      } else {
        this.initBattle();
      }

      // Scene 종료 시 정리
      this.events.once('shutdown', () => {
        if (this.particles) {
          this.particles.destroy();
          this.particles = null;
        }
        // VFX-2.1: 진행 중인 애니메이션 안전하게 중단
        if (SkillAnimationManager.isPlaying()) {
          SkillAnimationManager.abort();
        }
      });
    } catch (error) {
      console.error('[BattleScene] create() 실패:', error);
      this.add.text(s(360), s(640), '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  /**
   * RES-ABS-4: 전투 초기화 (에셋 로드 후 호출)
   */
  initBattle() {
    this.initializeBattlers();
    this.calculateSynergy();
    this.createBattleSystem();
    this.createBackground();
    this.createTurnOrderBar();
    this.createBattleUI();
    this.createBattlers();
    this.createControlButtons();
    this.createSkillCards();
    this.createSynergyDisplay();
    this.createManualTurnButton();

    // T-Q1: 보스 스테이지 진입 컷씬(boss_before) → 전투 시작 트랜지션
    // 컷씬이 없으면 onComplete가 즉시 호출되므로 일반 스테이지 흐름은 그대로다.
    StoryManager.trigger('boss_before', {
      scene: this,
      stageId: this.stage?.id,
      onComplete: () => {
        // A-8.5: 전투 시작 트랜지션
        this.playBattleIntro();
      }
    });
  }

  /**
   * MECH-02 통합: 전투 판정 엔진(BattleSystem) 부착.
   *
   * 씬은 이 시점부터 데미지식·AI·상태이상을 직접 계산하지 않는다. 연출·입력·HUD만
   * 담당하고, 판정은 전부 BattleSystem의 단일 경로(resolveDamage / getAIAction /
   * applyCultTurnStart)를 지난다. 시너지는 이미 calculateSynergy()가 stats에 반영했으므로
   * BattleSystem.initBattle()이 아니라 어댑터의 씬 전용 초기화를 쓴다(이중 가산 방지).
   */
  createBattleSystem() {
    this.battleSystem = createSceneBattleSystem(this.allies, this.enemies, {
      synergyBuffs: this.synergyBuffs
    });

    // BattleSystem이 기록한 문구(교단 효과·반사·사망)를 화면 로그 대역으로 옮기는 커서
    this._battleLogCursor = 0;

    // 판정 측 사망 이벤트를 씬 이벤트 버스로 중계 (연출은 syncDeaths가 담당)
    this.battleSystem.on('unitDeath', ({ unit, killedBy }) => {
      this.emitBattleEvent('unitDeath', { unit, killedBy });
    });

    console.log('[Battle] BattleSystem attached — 판정 위임 완료');
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
    // MECH-02 통합: 배틀러를 BattleSystem이 그대로 쓰는 BattleUnit으로 만든다.
    // 씬 표시 계약(stats/isAlly/position)은 어댑터가 유지하므로 렌더 코드는 그대로다.
    this.allies = this.party.map((hero, index) => toBattleUnit({
      id: hero.id || hero.characterId,
      name: hero.name || hero.id || '???',
      stats: hero.stats,
      level: hero.level,
      isAlly: true,
      position: index,
      mood: hero.mood,
      class: hero.class || 'warrior',
      role: hero.role || hero.class,
      skills: hero.skills && hero.skills.length > 0 ? hero.skills : (() => {
        try {
          const charData = getCharacter(hero.id || hero.characterId);
          return charData?.skills || null;
        } catch {
          return null;
        }
      })(),
      source: hero
    }));

    console.log(`[Battle] Initialized ${this.allies.length} allies`);

    // === 적 생성 ===
    if (this.stage?.enemies && this.stage.enemies.length > 0) {
      // 스테이지 데이터 기반 적 생성
      this.enemies = this.stage.enemies.map((enemyDef, i) => {
        const enemyData = getEnemy(enemyDef.id);
        if (!enemyData) return this._createRandomEnemy(i);

        const level = enemyDef.level || 1;
        const stats = calculateEnemyStats(enemyData, level);

        return toBattleUnit({
          id: enemyData.id,
          name: enemyData.name || enemyData.nameEn || '???',
          stats: { ...stats },
          level,
          isAlly: false,
          position: i,
          mood: enemyData.mood || 'brave',
          skills: [
            { id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 30 },
            ...(enemyData.skills || []).map(sId => ({
              id: sId, name: sId, multiplier: 1.3, gaugeCost: 40, target: 'single', gaugeGain: 0
            }))
          ],
          isBoss: enemyDef.isBoss || enemyData.type === 'boss',
          expReward: enemyData.expReward || 10,
          goldReward: enemyData.goldReward || 15,
          source: enemyData
        });
      });
    } else {
      // 레거시: 랜덤 적 생성
      const enemyCount = this.stage?.enemyCount || 3;
      this.enemies = [];
      for (let i = 0; i < enemyCount; i++) {
        this.enemies.push(this._createRandomEnemy(i));
      }
    }

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
   * 랜덤 적 생성 헬퍼
   */
  _createRandomEnemy(index) {
    const baseStats = 500 + (this.stage?.recommendedPower || 1000) / 5;
    const hp = Math.floor(baseStats * (0.8 + Math.random() * 0.4));
    return toBattleUnit({
      id: `enemy_${index}`,
      name: this.getEnemyName(),
      stats: {
        hp,
        atk: Math.floor(baseStats / 8 * (0.8 + Math.random() * 0.4)),
        def: Math.floor(baseStats / 10 * (0.8 + Math.random() * 0.4)),
        spd: Math.floor(30 + Math.random() * 30)
      },
      level: 1,
      isAlly: false,
      position: index,
      mood: this.getRandomMood(),
      skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 30 }],
      isBoss: false,
      expReward: 10,
      goldReward: 15,
      source: { id: `enemy_${index}` }
    });
  }

  /**
   * Mood 상성 배율 계산 (표시·타겟팅용 휴리스틱).
   * 분위기가 없는 유닛(기본영웅 등)은 어댑터가 걸러 1.0으로 내려보낸다 —
   * MoodSystem은 모르는 분위기에 예외를 던지므로 호출 자체를 하지 않는다.
   * @returns {{ multiplier: number, advantage: string }}
   */
  getMoodMatchup(attackerMood, defenderMood) {
    return resolveMoodMatchup(
      attackerMood,
      defenderMood,
      (a, d) => moodSystem.getMatchupMultiplier(a, d)
    );
  }

  /**
   * 화면 액센트 색. 스테이지·탑·레이드가 서로 다른 표정을 갖도록
   * 지배 교단색을 쓰고, 알 수 없으면 브랜드 시안으로 내려간다 (Cult Tint, §2-1).
   * @returns {number} Phaser hex
   */
  getBattleAccent() {
    const cult = this.stage?.cult || this.stage?.dominantCult
      || this.enemies?.find(e => e.isBoss)?.cult
      || this.allies?.[0]?.cult;
    return cult ? getCultColor(cult) : DESIGN.colors.brand.primary;
  }

  createBackground() {
    // §3-5: 2색 블록 배경을 모드별 일러스트로 교체한다.
    // 챕터/탑/레이드 키는 asset-manifest 의 lazyTextures 라 BackgroundFactory 가
    // 프로시저럴 폴백을 먼저 그린 뒤 로드가 끝나면 실제 이미지로 갈아 끼운다.
    this.battleBgKey = resolveBattleBgKey({ mode: this.mode, stage: this.stage });
    BackgroundFactory.createSceneBg(this, this.battleBgKey, {
      depth: 0,
      dimAlpha: DIM_ALPHA.BATTLE   // 전투만 0.20 — 배경을 더 보여준다
    });
  }

  /**
   * 턴 순서 바 생성 (상단)
   */
  createTurnOrderBar() {
    console.log('[Battle] Creating turn order bar...');

    const row = BATTLE_LAYOUT.turnRow;

    // 턴 순서 배지가 놓이는 대역. HUD 글래스 위에 얹힌다
    this.turnOrderContainer = this.add.container(0, 0).setDepth(BATTLE_DEPTH.hudContent);

    const label = this.add.text(s(24), s(row.y + 14), '턴 순서', ts('caption', {
      color: DESIGN.colors.text.muted
    })).setOrigin(0, 0.5);
    this.turnOrderContainer.add(label);

    // 턴 순서 아이콘들
    this.turnOrderIcons = [];
    this.updateTurnOrderBar();
  }

  /**
   * 턴 순서 바 업데이트 — 정렬 기준은 processTurn 과 동일(SPD 내림차순)
   */
  updateTurnOrderBar() {
    if (!this.turnOrderContainer) return;

    // 기존 아이콘 제거
    this.turnOrderIcons.forEach(icon => icon.destroy());
    this.turnOrderIcons = [];

    const slots = computeTurnOrderSlots(this.allBattlers, {
      max: 8, startX: 120, spacing: 52, y: BATTLE_LAYOUT.turnRow.y + 14
    });
    const accent = this.getBattleAccent();

    slots.forEach(slot => {
      const x = s(slot.x);
      const y = s(slot.y);
      const r = slot.isCurrent ? s(19) : s(15);
      const sideColor = slot.isAlly ? DESIGN.colors.brand.primary : DESIGN.colors.status.error;

      // 육각 배지 — 원형 하나로 통일돼 있던 것을 진영·현재턴으로 구분한다
      const badge = this.add.graphics();
      badge.fillStyle(sideColor, slot.isCurrent ? 0.95 : 0.55);
      badge.fillCircle(x, y, r);
      badge.lineStyle(s(slot.isCurrent ? 3 : 1), slot.isCurrent ? accent : DESIGN.effects.borderColor, 0.9);
      badge.strokeCircle(x, y, r);

      const initial = this.add.text(x, y, slot.initial, ts(slot.isCurrent ? 'body' : 'caption', {
        color: DESIGN.colors.text.primary,
        fontStyle: 'bold'
      })).setOrigin(0.5);

      const spd = this.add.text(x, y + s(23), `${slot.spd}`, ts('num.sm', {
        color: DESIGN.colors.text.secondary
      })).setOrigin(0.5);

      this.turnOrderContainer.add([badge, initial, spd]);
      this.turnOrderIcons.push(badge, initial, spd);
    });

    console.log('[Battle] Turn order updated:', slots.map(sl => `${sl.initial}(SPD:${sl.spd})`).join(' > '));
  }

  createBattleUI() {
    const hud = BATTLE_LAYOUT.hud;
    const accent = this.getBattleAccent();

    // 상단 전투 HUD — 글래스 hud 표면 (§2-3 알파 표)
    GlassPanel.create(this, {
      x: GAME_WIDTH / 2,
      y: s(hud.y + hud.h / 2),
      w: GAME_WIDTH,
      h: s(hud.h),
      variant: GLASS_VARIANT.HUD,
      bgKey: this.battleBgKey,
      depth: BATTLE_DEPTH.hud
    });

    // 교단색 언더라인 — 화면이 어느 진영의 전장인지 한 줄로 말한다
    const underline = this.add.graphics().setDepth(BATTLE_DEPTH.hudContent);
    underline.fillStyle(accent, 0.75);
    underline.fillRect(0, s(hud.h) - s(3), GAME_WIDTH, s(3));

    // 스테이지 제목 (영문 'Battle' → 한글 스테이지명)
    this.add.text(s(24), s(38), this.getBattleTitle(), ts('title', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0, 0.5).setDepth(BATTLE_DEPTH.hudContent);

    // 턴 카운터 — Orbitron + 고정폭 수치
    this.add.text(GAME_WIDTH - s(120), s(30), 'TURN', ts('caption', {
      color: DESIGN.colors.text.muted
    })).setOrigin(0.5, 0.5).setDepth(BATTLE_DEPTH.hudContent);

    this.turnText = this.add.text(GAME_WIDTH - s(120), s(52), '0', ts('num.lg', {
      color: DESIGN.colors.brand.accent
    })).setOrigin(0.5, 0.5).setDepth(BATTLE_DEPTH.hudContent);

    // 전투 로그 전용 대역 (HUD 위 토스트 → 하단 분리, §3-5)
    this.createLogBand();
  }

  /**
   * HUD 타이틀 — 모드별로 무엇을 하는 전투인지 한글로 밝힌다.
   * @returns {string}
   */
  getBattleTitle() {
    if (this.mode === 'tower' && this.towerFloor) return `무한의 탑 ${this.towerFloor}층`;
    if (this.mode === 'raid') return '레이드';
    const name = this.stage?.name;
    const id = this.stage?.id;
    if (name && id) return `${id}  ${name}`;
    return name || (id ? `스테이지 ${id}` : '전투');
  }

  /**
   * 전투 로그 대역 (§3-5: y=964~1052, 최근 2줄).
   * 턴 순서 바를 덮던 토스트를 화면 하단의 고정 대역으로 옮긴다.
   */
  createLogBand() {
    const band = BATTLE_LAYOUT.log;

    // 글래스 표면보다 위. 같은 depth 면 나중에 만든 글래스가 텍스트를 덮는다
    this.logContainer = this.add.container(0, 0).setDepth(BATTLE_DEPTH.log + 1);
    GlassPanel.create(this, {
      x: s(band.x + band.w / 2),
      y: s(band.y + band.h / 2),
      w: s(band.w),
      h: s(band.h),
      variant: GLASS_VARIANT.HUD,
      bgKey: this.battleBgKey,
      depth: BATTLE_DEPTH.log
    });

    this.battleLogs = [];
    this.logTexts = [];
    for (let i = 0; i < LOG_LINES; i++) {
      const text = this.add.text(s(band.x + 20), s(getLogLineY(i, LOG_LINES)), '', ts('label', {
        color: DESIGN.colors.text.secondary,
        wordWrap: { width: s(band.w - 236) }   // 오른쪽 '다음 턴' 버튼 자리를 비워 둔다
      })).setOrigin(0, 0.5).setAlpha(0);
      this.logContainer.add(text);
      this.logTexts.push(text);
    }
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

    // HUD 바로 아래 오른쪽. 유닛 대역(y=300~)을 침범하지 않는다
    const rows = synergies.length > 0 ? synergies.length : 2;
    const panelW = s(180);
    const panelH = s(Math.max(56, 30 + rows * 20));
    const panelX = GAME_WIDTH - panelW / 2 - s(20);
    const panelY = s(BATTLE_LAYOUT.hud.h + 20) + panelH / 2;

    this.synergyContainer = this.add.container(panelX, panelY).setDepth(BATTLE_DEPTH.hudContent);

    const glass = GlassPanel.create(this, {
      x: panelX,
      y: panelY,
      w: panelW,
      h: panelH,
      variant: GLASS_VARIANT.CARD,
      bgKey: this.battleBgKey,
      depth: BATTLE_DEPTH.log
    });
    this.synergyGlass = glass;

    const title = this.add.text(0, -panelH / 2 + s(14), '시너지', ts('caption', {
      color: DESIGN.colors.text.muted
    })).setOrigin(0.5);
    this.synergyContainer.add(title);

    if (synergies.length > 0) {
      // SynergySystem 기반 표시 — 이모지 대신 교단/역할 색 점으로 종류를 구분한다
      let yOffset = -panelH / 2 + s(34);
      const typeColors = {
        cult: DESIGN.colors.brand.secondary,
        mood: DESIGN.colors.brand.primary,
        role: DESIGN.colors.status.error,
        special: DESIGN.colors.brand.accent,
        mood_balance: DESIGN.colors.status.success,
        mood_special: DESIGN.colors.brand.accent
      };

      synergies.forEach(syn => {
        const color = typeColors[syn.type] || DESIGN.colors.brand.primary;
        const dot = this.add.graphics();
        dot.fillStyle(color, 1);
        dot.fillCircle(-panelW / 2 + s(16), yOffset, s(4));

        const synText = this.add.text(-panelW / 2 + s(28), yOffset, syn.name || syn.type, ts('caption', {
          color: DESIGN.colors.text.secondary
        })).setOrigin(0, 0.5);

        this.synergyContainer.add([dot, synText]);
        yOffset += s(20);
      });
    } else {
      // 폴백 버프 표시
      let yOffset = -panelH / 2 + s(36);
      if (this.synergyBuffs.atk > 0) {
        this.synergyContainer.add(this.add.text(0, yOffset, `ATK +${Math.round(this.synergyBuffs.atk * 100)}%`,
          ts('num.sm', { color: DESIGN.colors.battle.damage })).setOrigin(0.5));
        yOffset += s(18);
      }
      if (this.synergyBuffs.def > 0) {
        this.synergyContainer.add(this.add.text(0, yOffset, `DEF +${Math.round(this.synergyBuffs.def * 100)}%`,
          ts('num.sm', { color: DESIGN.colors.battle.buff })).setOrigin(0.5));
      }
    }
  }

  /**
   * 스킬 카드 UI 생성
   */
  createSkillCards() {
    console.log('[Battle] Creating skill cards...');

    // §3-5: 4칸 고정 그리드. 아군이 4명 미만이어도 빈 칸이 자리를 지켜
    // 전투 중 파티 구성이 바뀌어도 버튼 위치가 흔들리지 않는다
    this.skillCardContainer = this.add.container(0, 0).setDepth(BATTLE_DEPTH.hudContent);

    const action = BATTLE_LAYOUT.action;
    GlassPanel.create(this, {
      x: GAME_WIDTH / 2,
      y: s(action.y + action.h / 2),
      w: GAME_WIDTH,
      h: s(action.h),
      variant: GLASS_VARIANT.HUD,
      bgKey: this.battleBgKey,
      depth: BATTLE_DEPTH.hud
    });

    this.skillCards = [];
    const slots = getSkillSlots();

    slots.forEach((slot, index) => {
      const ally = this.allies[index];
      if (!ally) {
        this.createEmptySkillSlot(slot);
        return;
      }
      const card = this.createSkillCard(s(slot.x), s(slot.y), ally, index);
      this.skillCards.push(card);
    });
  }

  /**
   * 빈 스킬 슬롯 — 점선 자리 표시. 자물쇠나 물음표는 쓰지 않는다
   * @param {{x:number,y:number,w:number,h:number}} slot - base px 슬롯
   */
  createEmptySkillSlot(slot) {
    const w = s(slot.w);
    const h = s(slot.h);
    const g = this.add.graphics().setDepth(BATTLE_DEPTH.hudContent);
    g.lineStyle(s(2), DESIGN.effects.borderColor, 0.8);
    g.strokeRoundedRect(s(slot.x) - w / 2, s(slot.y) - h / 2, w, h, s(DESIGN.radius.md));
    this.skillCardContainer.add(g);
  }

  /**
   * 개별 스킬 카드 — 포트레이트 + 쿨다운 링 + 스킬명
   * @param {number} x - 렌더 px (슬롯 중심)
   * @param {number} y - 렌더 px (슬롯 중심)
   * @param {object} ally
   * @param {number} index
   */
  createSkillCard(x, y, ally, index) {
    const card = this.add.container(x, y).setDepth(BATTLE_DEPTH.hudContent);

    const isReady = ally.skillGauge >= ally.maxSkillGauge;
    const cardW = s(SKILL_SLOT.w);
    const cardH = s(SKILL_SLOT.h);
    const ringRadius = s(38);
    const ringY = s(-16);
    const accent = this.getBattleAccent();

    // 카드 표면
    const cardBg = this.add.graphics();
    this.paintSkillCardBg(cardBg, cardW, cardH, isReady, accent);

    // 히트 영역은 시각 크기와 분리한다 (터치 타겟 최소 48dp 확보)
    const cardHit = this.add.rectangle(0, 0, cardW, cardH, 0x000000, 0);
    if (isReady) {
      cardHit.setInteractive({ useHandCursor: true });
      cardHit.on('pointerdown', () => this.onSkillCardClick(ally, index));
    }

    // 클래스 아이콘 (이모지 대체, IconFactory 벡터)
    const classIcon = IconFactory.createImage(this, 0, ringY, ally.class || 'warrior', 'lg', {
      tint: isReady ? accent : DESIGN.colors.brand.primary
    });
    if (classIcon) classIcon.setAlpha(isReady ? 1 : 0.55);

    // 쿨다운 링 — 게이지가 링을 시계 방향으로 채운다
    const ring = this.add.graphics();
    this.paintCooldownRing(ring, ally, ringRadius, ringY, accent);

    // 영웅 이름
    const allyName = ally.name || '???';
    const heroName = allyName.length > 5 ? `${allyName.substring(0, 5)}…` : allyName;
    const nameText = this.add.text(0, s(34), heroName, ts('caption', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0.5);

    // 스킬명 (내부 ID 노출 금지 — 이름이 없으면 '스킬'로 대체)
    const skillText = this.add.text(0, s(52), this.getSkillLabel(ally), ts('label', {
      color: isReady ? '#FFD60A' : '#64748B',
      fontStyle: 'bold'
    })).setOrigin(0.5);

    const parts = [cardBg, cardHit, ring, nameText, skillText];
    if (classIcon) parts.splice(2, 0, classIcon);
    card.add(parts);

    if (isReady) this.startSkillCardPulse(card);

    card.setData('ally', ally);
    card.setData('index', index);
    card.setData('cardBg', cardBg);
    card.setData('cardHit', cardHit);
    card.setData('ring', ring);
    card.setData('ringRadius', ringRadius);
    card.setData('ringY', ringY);
    card.setData('classIcon', classIcon);
    card.setData('skillText', skillText);

    this.skillCardContainer.add(card);

    return card;
  }

  /**
   * 스킬 카드 표면을 다시 그린다 (생성·갱신 공용).
   * @param {Phaser.GameObjects.Graphics} g
   * @param {number} w
   * @param {number} h
   * @param {boolean} isReady
   * @param {number} accent
   */
  paintSkillCardBg(g, w, h, isReady, accent) {
    const r = s(DESIGN.radius.md);
    g.clear();
    g.fillStyle(DESIGN.colors.bg.secondary, isReady ? 0.92 : 0.72);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.lineStyle(s(2), isReady ? accent : DESIGN.effects.borderColor, isReady ? 0.9 : 0.7);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  }

  /**
   * 쿨다운 링을 다시 그린다. 준비 완료면 링이 한 바퀴 닫히고 액센트로 빛난다.
   * @param {Phaser.GameObjects.Graphics} g
   * @param {object} ally
   * @param {number} radius
   * @param {number} cy
   * @param {number} accent
   */
  paintCooldownRing(g, ally, radius, cy, accent) {
    const arc = computeCooldownArc(ally.skillGauge, ally.maxSkillGauge);
    g.clear();
    // 트랙 — 배경이 어두우므로 표면보다 밝은 회청색을 쓴다
    g.lineStyle(s(5), 0x334155, 1);
    g.strokeCircle(0, cy, radius);
    // 진행
    if (arc.ratio > 0) {
      g.lineStyle(s(5), arc.ready ? accent : DESIGN.colors.brand.primary, 1);
      g.beginPath();
      g.arc(0, cy, radius, arc.startAngle, arc.endAngle, false);
      g.strokePath();
    }
  }

  /**
   * 표시용 스킬 이름. 내부 id('basic', 'skill1')는 그대로 노출하지 않는다.
   * @param {object} ally
   * @returns {string}
   */
  getSkillLabel(ally) {
    const skill = ally.skills?.find(sk => sk.id === 'skill1') || ally.skills?.[1] || ally.skills?.[0];
    const name = skill?.name;
    if (!name || /^(basic|skill\d+)$/i.test(name)) return '스킬';
    return name.length > 6 ? `${name.substring(0, 6)}…` : name;
  }

  /**
   * 준비 완료 카드의 숨쉬기 효과. 중복 등록을 막기 위해 기존 트윈을 먼저 끈다.
   * @param {Phaser.GameObjects.Container} card
   */
  startSkillCardPulse(card) {
    this.tweens.killTweensOf(card);
    card.setAlpha(1);
    this.tweens.add({
      targets: card,
      alpha: { from: 1, to: 0.62 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
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
        sprite.setInteractive(new Phaser.Geom.Circle(0, 0, s(40)), Phaser.Geom.Circle.Contains);
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
    const skill = attacker.skills?.find(sk => sk.id === 'skill1') || attacker.skills?.[1];
    if (!skill) return; // No skill available

    // 스킬 게이지 소비
    attacker.skillGauge = 0;
    this.updateSkillCardUI(attacker);

    // MECH-02: 시전 훅 (아군 방어막/룬 계열)
    const castEffects = this.battleSystem.applyCultSkillUse(attacker, [target], skill);
    this.syncCultEffects(castEffects);
    this.drainSystemLog();

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

    // 수동 발동도 자동 전투와 같은 단일 경로를 지난다 (교단 훅 포함)
    const aoeMod = skill.target === 'all' ? 0.7 : 1.0;
    const { damage, damageResult, cultEffects } = this.battleSystem.resolveDamage(
      attacker,
      target,
      { ...skill, multiplier: skill.multiplier * aoeMod }
    );

    const dealt = damageResult.actualDamage;
    const isCrit = damage.isCrit;
    const moodAdvantage = describeMoodAdvantage(damage.moodBonus);

    if (isCrit) this.cameras.main.shake(150, 0.005);

    this.updateBattlerUI(target);
    this.updateBattlerUI(attacker);
    this.playSkillEffect(attacker, target, isCrit, true, skill);
    if (dealt > 0) {
      this.showDamage(target, dealt, isCrit, moodAdvantage);
    } else if (damageResult.absorbed > 0) {
      this.showDamage(target, damageResult.absorbed, false, 'NEUTRAL');
    }

    const critText = isCrit ? ' (크리티컬!)' : '';
    const moodText = moodAdvantage === 'ADVANTAGE' ? ' (유리▲)' : moodAdvantage === 'DISADVANTAGE' ? ' (불리▼)' : '';
    this.addBattleLog(`  → ${target.name}에게 ${dealt} 데미지${critText}${moodText}`);

    this.syncAfterResolve(cultEffects);
  }

  /**
   * 스킬 카드 UI 업데이트
   */
  updateSkillCardUI(ally) {
    const card = this.skillCards.find(c => c.getData('ally') === ally);
    if (!card) return;

    const isReady = ally.skillGauge >= ally.maxSkillGauge;
    const accent = this.getBattleAccent();

    const cardBg = card.getData('cardBg');
    const cardHit = card.getData('cardHit');
    const ring = card.getData('ring');
    const classIcon = card.getData('classIcon');

    if (cardBg) this.paintSkillCardBg(cardBg, s(SKILL_SLOT.w), s(SKILL_SLOT.h), isReady, accent);
    if (ring) this.paintCooldownRing(ring, ally, card.getData('ringRadius'), card.getData('ringY'), accent);
    if (classIcon) classIcon.setAlpha(isReady ? 1 : 0.55);

    const skillTextObj = card.getData('skillText');
    if (skillTextObj) {
      skillTextObj.setText(this.getSkillLabel(ally));
      skillTextObj.setColor(isReady ? '#FFD60A' : '#64748B');
    }

    // 인터랙티브 상태 업데이트
    if (isReady && cardHit && !cardHit.input) {
      cardHit.setInteractive({ useHandCursor: true });
      cardHit.on('pointerdown', () => this.onSkillCardClick(ally, card.getData('index')));
      this.startSkillCardPulse(card);
    } else if (!isReady && cardHit && cardHit.input) {
      cardHit.removeInteractive();
      this.tweens.killTweensOf(card);
      card.setAlpha(0.82);
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
    const y = this.getUnitBodyY(targetSprite);

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
      const shakeIntensity = isUltimate ? s(12) : (isCrit ? s(8) : s(4));
      const shakeRepeat = isUltimate ? 4 : (isCrit ? 3 : 1);
      const originalX = targetSprite.getData('originalX') ?? targetSprite.x;
      this.tweens.add({
        targets: targetSprite,
        x: originalX + shakeIntensity,
        duration: 50 / this.battleSpeed,
        yoyo: true,
        repeat: shakeRepeat,
        ease: 'Sine.easeInOut',
        onComplete: () => { targetSprite.x = originalX; }
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

    this.particles.showDamageNumber(targetSprite.x, this.getUnitBodyY(targetSprite) - s(30), value, type);
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
      this.particles.showDamageNumber(sprite.x, this.getUnitBodyY(sprite) - s(30), healAmount, 'heal');
    }

    // 추가 힐 텍스트 (떠오르는 +HP)
    const healText = this.add.text(sprite.x, this.getUnitBodyY(sprite) - s(60), `+${healAmount}`, {
      fontSize: sf(22), fontFamily: 'Noto Sans KR',
      color: '#4ADE80', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: s(3)
    }).setOrigin(0.5).setDepth(20);

    this.tweens.add({
      targets: healText,
      y: healText.y - s(40),
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
    const cutInBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, s(100), 0x000000, 0).setDepth(31);
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

    const portrait = this.add.circle(GAME_WIDTH / 2 - s(120), GAME_HEIGHT / 2, s(35), moodColor, 0.9).setDepth(32).setScale(0);
    const nameText = this.add.text(GAME_WIDTH / 2 + s(20), GAME_HEIGHT / 2 - s(15), battler.name, {
      fontSize: sf(22), fontFamily: 'Noto Sans KR',
      color: '#FFFFFF', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: s(3)
    }).setOrigin(0, 0.5).setDepth(32).setAlpha(0);

    const skillText = this.add.text(GAME_WIDTH / 2 + s(20), GAME_HEIGHT / 2 + s(15), '⚡ 궁극기 발동!', {
      fontSize: sf(16), fontFamily: 'Noto Sans KR',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
      stroke: '#000000', strokeThickness: s(2)
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
    // 보스전 인트로
    if (this.mode === 'boss') {
      // 카메라 쉐이크
      this.cameras.main.shake(200, 0.01);

      // 보스 이름 찾기
      const bossEnemy = this.enemies.find(e => e.isBoss) || this.enemies[0];
      const bossName = bossEnemy?.name || 'BOSS';

      // 보스 배틀 타이틀
      const bossTitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(80), 'BOSS BATTLE', ts('display.lg', {
        color: '#EF4444', stroke: '#000000', strokeThickness: s(5)
      })).setOrigin(0.5).setDepth(50).setAlpha(0);

      const bossNameText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(30), bossName, ts('title', {
        color: '#FFD60A', fontStyle: 'bold', stroke: '#000000', strokeThickness: s(3)
      })).setOrigin(0.5).setDepth(50).setAlpha(0);

      this.tweens.add({
        targets: [bossTitle, bossNameText],
        alpha: 1, duration: 400, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({
            targets: [bossTitle, bossNameText],
            alpha: 0, y: `-=${s(30)}`, duration: 600, delay: 1000,
            onComplete: () => { bossTitle.destroy(); bossNameText.destroy(); }
          });
        }
      });

      // 보스전 인트로 후 전투 시작
      this.time.delayedCall(2000, () => {
        this.startBattle();
      });
      return;
    }

    // 일반 전투 인트로
    // 전체 화면 검정 오버레이
    const introOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1).setDepth(50);

    // 스테이지 이름 표시
    const stageName = this.stage?.name || '전투 시작';
    const stageText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(20), stageName, ts('title', {
      color: '#F8FAFC', fontStyle: 'bold', stroke: '#000000', strokeThickness: s(4)
    })).setOrigin(0.5).setDepth(51).setAlpha(0);

    const battleText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(20), 'BATTLE START', ts('display.lg', {
      color: '#FFD60A', stroke: '#000000', strokeThickness: s(3)
    })).setOrigin(0.5).setDepth(51).setAlpha(0);

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
      alpha: 0, y: `-=${s(30)}`, duration: 400, delay: 1200,
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

    // 수동 턴 버튼 (AUTO OFF일 때만 표시).
    // 로그 대역 오른쪽 끝에 붙인다 — 아군 유닛 위를 덮지 않으면서
    // 스킬 액션바 바로 위라 손가락 이동이 짧다
    const band = BATTLE_LAYOUT.log;
    const btnW = s(176);
    const btnH = s(60);
    const x = s(band.x + band.w) - btnW / 2 - s(12);
    const y = s(band.y + band.h / 2);
    this.manualTurnBtn = this.add.container(x, y).setDepth(BATTLE_DEPTH.manualTurn);

    const btnBg = this.add.rectangle(0, 0, btnW, btnH, DESIGN.colors.brand.accent, 1)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(s(2), DESIGN.colors.brand.primary);

    const btnText = this.add.text(0, 0, '다음 턴', ts('body', {
      color: '#0F172A',
      fontStyle: 'bold'
    })).setOrigin(0.5);

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
    // §3-5: 상단 3분의 1 편중을 없애고 적(y=300~520) / 아군(y=700~920) 대칭 배치로 바꾼다.
    // 슬롯 개수가 유닛 수와 항상 일치하므로 sprites[position] 인덱스가 어긋나지 않는다.
    const allySlots = getAllySlots(this.allies.length);
    this.allySprites = this.allies.map((ally, index) => {
      const slot = allySlots[index];
      return this.createBattlerSprite(s(slot.x), s(slot.y), ally, true);
    });

    const enemySlots = getEnemySlots(this.enemies.length);
    this.enemySprites = this.enemies.map((enemy, index) => {
      const slot = enemySlots[index];
      const sprite = this.createBattlerSprite(s(slot.x), s(slot.y), enemy, false);

      // 보스 시각 처리
      if (enemy.isBoss) {
        const enemySprite = sprite.getData('sprite');
        if (enemySprite) {
          enemySprite.setScale(enemySprite.scaleX * 1.3, enemySprite.scaleY * 1.3);
        }
        const bossLabel = this.add.text(0, s(-118), 'BOSS', ts('caption', {
          color: '#FFD60A',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: s(3)
        })).setOrigin(0.5);
        sprite.add(bossLabel);
      }
      return sprite;
    });
  }

  createBattlerSprite(x, y, battler, isAlly) {
    // 유닛은 발밑(origin 0.5,1)을 기준으로 선다. HP바·이름·배지가 그 발밑에 붙는다
    const container = this.add.container(x, y).setDepth(BATTLE_DEPTH.unit);
    const attach = getUnitAttachments({ isBoss: !!battler.isBoss });

    // Character sprite — IMG-3: 아군은 실제 포트레이트 우선
    let sprite;
    if (isAlly) {
      const fullData = getCharacterOrHero(battler.id || battler.characterId) || battler;
      const texKey = HeroAssetLoader.ensureTexture(this, fullData);
      sprite = this.add.image(0, 0, texKey || 'hero_placeholder');
      if (texKey) {
        sprite.setScale(Math.min(s(104) / sprite.width, s(124) / sprite.height));
      } else {
        sprite.setScale(1.1);
      }
    } else {
      // 적 포트레이트 아트는 아직 없다(regen-list 미생성). 기존 코드가 존재하지 않는
      // 'enemy_placeholder' 를 요구해 Phaser 미싱 텍스처(초록 사각형 + 대각선)가
      // 그대로 화면에 나오고 있었다(§1-1). 분위기색 실루엣으로 대체한다.
      sprite = this.add.image(0, 0, this.ensureEnemySilhouette(battler));
      sprite.setScale(1.0);
    }
    sprite.setOrigin(0.5, 1);
    if (!isAlly) sprite.setFlipX(true);

    // 접지 그림자 — 유닛이 배경 위에 떠 보이지 않게 잡아 준다
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.32);
    shadow.fillEllipse(0, 0, s(attach.hpBarW * 0.8), s(14));

    // UIX-2.6.1: Enhanced HP Bar — 유닛 발밑에 부착 (§3-5)
    const hpBar = new EnhancedHPBar(this, 0, s(attach.hpBarY), s(attach.hpBarW), {
      height: s(attach.hpBarH),
      currentHP: battler.currentHp,
      maxHP: battler.maxHp,
      currentSkill: battler.skillGauge || 0,
      maxSkill: battler.maxSkillGauge || 100,
      showSkillBar: isAlly,
      showBuffIcons: false,
      delayDuration: 500,
      animationDuration: 300
    });

    // Name tag — HP바 아래. 이름이 HP바를 덮던 결함(§1-1)의 해소점이다
    const battlerName = battler.name || '???';
    const name = battlerName.length > 6 ? battlerName.substring(0, 6) : battlerName;
    const nameTag = this.add.text(0, s(attach.nameY), name, ts('caption', {
      color: isAlly ? DESIGN.colors.text.primary : '#FCA5A5',
      stroke: '#000000',
      strokeThickness: s(2)
    })).setOrigin(0.5);

    // 교단 메커니즘 배지 (Divine Charge / Doom / Holy Ward / Rune)
    const badgeLayer = this.add.container(s(attach.badgeX), s(attach.badgeY));

    container.add([shadow, sprite, hpBar, nameTag, badgeLayer]);

    // Store references
    container.setData('battler', battler);
    container.setData('sprite', sprite);
    container.setData('hpBar', hpBar);
    container.setData('badgeLayer', badgeLayer);
    container.setData('attach', attach);
    container.setData('originalX', x); // 피격 흔들림 복원용

    this.renderCultBadges(container, battler);

    return container;
  }

  /**
   * 교단 메커니즘 상태 배지를 유닛 옆에 다시 그린다 (MECH-02 표기, 표시 전용).
   * cultState 가 없으면 아무것도 그리지 않는다 — 값이 붙는 순간만 눈에 띄게 하기 위해서다.
   * @param {Phaser.GameObjects.Container} container - createBattlerSprite 가 만든 유닛 컨테이너
   * @param {object} battler
   */
  renderCultBadges(container, battler) {
    const layer = container?.getData?.('badgeLayer');
    if (!layer) return;

    layer.removeAll(true);
    const badges = buildCultBadges(battler?.cultState, { max: 3 });
    if (badges.length === 0) return;

    const attach = container.getData('attach') || getUnitAttachments();
    badges.forEach((badge, index) => {
      const y = index * s(attach.badgeGap);
      const label = badge.value === null ? badge.label : `${badge.label} ${badge.value}`;
      const text = this.add.text(0, y, label, ts('num.sm', {
        color: DESIGN.colors.text.primary
      })).setOrigin(0, 0.5);

      const padX = s(6);
      const pill = this.add.graphics();
      pill.fillStyle(badge.color, 0.85);
      pill.fillRoundedRect(-padX, y - s(9), text.width + padX * 2, s(18), s(9));

      layer.add([pill, text]);
    });
  }

  /**
   * 유닛의 교단 배지를 갱신한다 (턴 진행 중 표시 동기화).
   * @param {object} battler
   */
  updateCultBadges(battler) {
    const sprites = battler.isAlly ? this.allySprites : this.enemySprites;
    const container = sprites?.[battler.position];
    if (container) this.renderCultBadges(container, battler);
  }

  /**
   * 적 실루엣 텍스처를 만들고 키를 돌려준다. 같은 색이면 다시 굽지 않는다.
   * 분위기(mood)색 림라이트를 넣어 어떤 성향의 적인지 형태만으로 구분되게 한다.
   *
   * @param {object} battler
   * @returns {string} 텍스처 키
   */
  ensureEnemySilhouette(battler) {
    const mood = String(battler?.mood || 'brave').toUpperCase();
    const color = MOOD_COLORS[mood] || MOOD_COLORS.BRAVE;
    const big = !!battler?.isBoss;
    const key = `enemy_sil_${color.toString(16)}_${big ? 'boss' : 'std'}`;
    if (this.textures.exists(key)) return key;

    const w = s(big ? 120 : 96);
    const h = s(big ? 150 : 120);
    const g = this.add.graphics();

    // 몸통 — 어깨가 넓고 아래로 좁아지는 덩어리
    const body = DESIGN.colors.bg.primary;
    g.fillStyle(body, 1);
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.20);
    g.lineTo(w * 0.86, h * 0.44);
    g.lineTo(w * 0.74, h * 1.0);
    g.lineTo(w * 0.26, h * 1.0);
    g.lineTo(w * 0.14, h * 0.44);
    g.closePath();
    g.fillPath();

    // 머리
    g.fillCircle(w * 0.5, h * 0.16, w * 0.17);

    // 분위기색 림라이트 — 배경 위에서 형태가 사라지지 않게 한다
    g.lineStyle(s(3), color, 0.95);
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.20);
    g.lineTo(w * 0.86, h * 0.44);
    g.lineTo(w * 0.74, h * 1.0);
    g.lineTo(w * 0.26, h * 1.0);
    g.lineTo(w * 0.14, h * 0.44);
    g.closePath();
    g.strokePath();
    g.strokeCircle(w * 0.5, h * 0.16, w * 0.17);

    // 눈 — 실루엣이 이쪽을 보고 있다는 최소 신호
    g.fillStyle(color, 1);
    g.fillCircle(w * 0.40, h * 0.14, s(3));
    g.fillCircle(w * 0.60, h * 0.14, s(3));

    g.generateTexture(key, w, h);
    g.destroy();
    return key;
  }

  /**
   * 유닛 컨테이너의 몸통 중앙 y. 유닛 원점이 발밑이라 이펙트·데미지 숫자를
   * 그대로 두면 지면에서 터진다. 표시 좌표만 위로 올린다.
   * @param {Phaser.GameObjects.Container} container
   * @returns {number} 렌더 px
   */
  getUnitBodyY(container) {
    return (container?.y ?? 0) - s(52);
  }

  createControlButtons() {
    // §3-5: 하단 조작 대역 y=1216~1272. AUTO / 배속 / 퇴각
    const bar = BATTLE_LAYOUT.control;
    const controlY = s(bar.y + bar.h / 2);
    const btnH = s(bar.h);

    GlassPanel.create(this, {
      x: GAME_WIDTH / 2,
      y: controlY,
      w: GAME_WIDTH,
      h: btnH + s(8),
      variant: GLASS_VARIANT.HUD,
      bgKey: this.battleBgKey,
      depth: BATTLE_DEPTH.hud
    });

    const accent = this.getBattleAccent();

    // Auto battle toggle
    this.autoBtn = this.add.container(s(96), controlY).setDepth(BATTLE_DEPTH.hudContent);
    const autoBg = this.add.rectangle(0, 0, s(136), btnH, this.autoBattle ? DESIGN.colors.status.success : DESIGN.colors.bg.surface, 1)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(s(2), this.autoBattle ? DESIGN.colors.status.success : DESIGN.effects.borderColor);
    const autoText = this.add.text(0, 0, this.autoBattle ? 'AUTO ON' : 'AUTO OFF', ts('label', {
      color: DESIGN.colors.text.primary,
      fontStyle: 'bold'
    })).setOrigin(0.5);

    this.autoBtn.add([autoBg, autoText]);
    this.autoBtn.setData('bg', autoBg);
    this.autoBtn.setData('text', autoText);

    autoBg.on('pointerdown', () => {
      this.autoBattle = !this.autoBattle;
      this.registry.set('autoBattle', this.autoBattle);
      autoBg.setFillStyle(this.autoBattle ? DESIGN.colors.status.success : DESIGN.colors.bg.surface, 1);
      autoBg.setStrokeStyle(s(2), this.autoBattle ? DESIGN.colors.status.success : DESIGN.effects.borderColor);
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
      const x = s(232) + index * s(76);
      const btn = this.add.container(x, controlY).setDepth(BATTLE_DEPTH.hudContent);

      const isActive = this.battleSpeed === speed;
      const bg = this.add.rectangle(0, 0, s(68), btnH, isActive ? accent : DESIGN.colors.bg.surface, 1)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(s(1), isActive ? accent : DESIGN.effects.borderColor);
      const text = this.add.text(0, 0, `${speed}x`, ts('num.md', {
        color: DESIGN.colors.text.primary
      })).setOrigin(0.5);

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
    const retreatBtn = this.add.container(GAME_WIDTH - s(90), controlY).setDepth(BATTLE_DEPTH.hudContent);
    const retreatBg = this.add.rectangle(0, 0, s(128), btnH, DESIGN.colors.bg.surface, 1)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(s(2), DESIGN.colors.status.error, 0.8);
    const retreatText = this.add.text(0, 0, '퇴각', ts('label', {
      color: '#FCA5A5',
      fontStyle: 'bold'
    })).setOrigin(0.5);

    retreatBtn.add([retreatBg, retreatText]);

    retreatBg.on('pointerdown', () => {
      if (!this.battleEnded) {
        this.endBattle(false);
      }
    });
  }

  updateSpeedButtons() {
    if (!this.speedButtons) return;
    const accent = this.getBattleAccent();
    this.speedButtons.forEach(btn => {
      const bg = btn.getData('bg');
      const speed = btn.getData('speed');
      const isActive = this.battleSpeed === speed;
      if (bg && bg.setFillStyle) {
        bg.setFillStyle(isActive ? accent : DESIGN.colors.bg.surface, 1);
        bg.setStrokeStyle(s(1), isActive ? accent : DESIGN.effects.borderColor);
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

  /**
   * 한 라운드 진행. 판정은 BattleSystem, 씬은 스케줄링과 연출만 맡는다.
   *
   * 예외 안전: 어떤 단계에서 예외가 나도 `isProcessingTurn`이 반드시 풀리고 다음 턴이
   * 이어지게 한다. 연출 한 줄이 실패해 전투가 영원히 멈추는 상태(턴 잠금)를 막기 위해서다.
   */
  processTurn() {
    if (this.battleEnded || this.isProcessingTurn) return;

    console.log(`[Battle] Processing turn ${this.turn + 1}, autoBattle: ${this.autoBattle}`);

    this.isProcessingTurn = true;

    let delay = 0;

    try {
      this.turn++;
      this.turnText.setText(`${this.turn}`);

      // 턴 순서 바 업데이트
      this.updateTurnOrderBar();

      // 턴 순서는 BattleSystem이 결정한다 — 룬(SPD +15%) 같은 교단 보정이 반영된 실효 SPD 기준
      this.battleSystem.turnCount = this.turn;
      this.battleSystem.calculateTurnOrder();
      const activeBattlers = this.battleSystem.turnOrder.filter(b => b.isAlive);

      console.log(`[Battle] Turn order: ${activeBattlers.map(b => `${b.name}(${b.spd})`).join(' > ')}`);

      // 전투 이벤트 발행
      this.emitBattleEvent('turnStart', { turn: this.turn, order: activeBattlers.map(b => b.name) });

      // Process each battler's action
      const baseDelay = 1000 / this.battleSpeed;

      activeBattlers.forEach((battler, index) => {
        this.time.delayedCall(delay, () => {
          if (this.battleEnded || !battler.isAlive) return;
          try {
            this.executeBattlerAction(battler);
          } catch (error) {
            // 한 유닛의 행동이 실패해도 라운드는 계속된다
            console.error('[Battle] 행동 처리 실패:', battler?.name, error);
          }

          // 턴 순서 바 현재 유닛 하이라이트
          this.highlightCurrentTurnUnit(index);
        });
        delay += baseDelay;
      });
    } catch (error) {
      console.error('[Battle] 턴 준비 실패:', error);
    }

    // Check battle end and start next turn
    this.time.delayedCall(delay + 500 / this.battleSpeed, () => {
      this.isProcessingTurn = false;

      try {
        if (this.checkBattleEnd()) return;
      } catch (error) {
        console.error('[Battle] 전투 종료 판정 실패:', error);
        return;
      }

      // AUTO ON: 자동 진행
      // AUTO OFF: 수동 입력 대기
      if (this.autoBattle) {
        this.processTurn();
        return;
      }

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
   * 스마트 AI 타겟 선택 — 구현은 BattleSceneAdapter(순수 함수)에 있다.
   * 우선순위: 1) 힐러(healer) > 2) 상성 유리 > 3) 낮은 HP > 4) 고위협 대상
   */
  selectSmartTarget(battler, aliveTargets) {
    return selectSmartTarget(battler, aliveTargets, (a, d) => this.getMoodMatchup(a, d));
  }

  /**
   * 턴 실행 — 판정은 BattleSystem, 씬은 연출만 한다.
   *
   * (b) 턴 시작: applyCultTurnStart() — 상태이상 틱(저주 도트/행동불가) +
   *     교단 턴 시작 패시브(Holy Ward 방어막 / Glory Aura)
   * (c) 행동 선택: BattleSystem.getAIAction() — 힐러 우선 / 게이지 스킬 판단.
   *     단일 대상 공격에 한해 연출용 스마트 타겟으로 대상만 바꾼다.
   */
  executeBattlerAction(battler) {
    if (!battler.isAlive || this.battleEnded) return;

    console.log(`[Battle] ${battler.name} is taking action`);

    // ── (b) 턴 시작 교단 훅 ──
    const hpBeforeTick = battler.currentHp;
    const cultTurn = this.battleSystem.applyCultTurnStart(battler);
    const dotDamage = Math.max(0, hpBeforeTick - battler.currentHp);
    if (dotDamage > 0) this.showDamage(battler, dotDamage, false, 'NEUTRAL');
    this.updateBattlerUI(battler);
    this.syncAfterResolve(cultTurn.effects);

    if (!battler.isAlive) return;
    if (cultTurn.blocked) {
      this.addBattleLog(`${battler.name}은(는) 행동할 수 없다!`);
      return;
    }

    // ── (c) 행동 결정 ──
    const action = decideSceneAction(this.battleSystem, battler, {
      getMoodMatchup: (a, d) => this.getMoodMatchup(a, d)
    });
    if (!action) return;

    const target = action.targets[0];
    const { skill, isUltimate } = action;

    // 궁극기 컷인 연출.
    // _executeAttack은 async라 예외가 미처리 거부로 새어 나간다 — 여기서 붙잡아 로그만 남긴다.
    const onActionError = (error) => console.error('[Battle] 공격 처리 실패:', battler?.name, error);

    if (isUltimate) {
      this.playUltimateCutIn(battler, () => {
        this._executeAttack(battler, target, skill.multiplier, skill.name, true, skill).catch(onActionError);
      });
    } else {
      this._executeAttack(battler, target, skill.multiplier, skill.name, false, skill).catch(onActionError);
    }
  }

  /**
   * 실제 공격 실행 (컷인 연출 후 호출됨)
   */
  async _executeAttack(battler, target, skillMultiplier, skillName, isUltimate, skill = null) {
    if (!target.isAlive || this.battleEnded) return;

    // MECH-02: 시전 훅 — 아군 대상 방어막/룬 계열은 피해 확정 전에 붙어야 한다
    const castEffects = this.battleSystem.applyCultSkillUse(
      battler,
      [target],
      skill || { id: 'basic', multiplier: skillMultiplier }
    );
    this.syncCultEffects(castEffects);
    this.drainSystemLog();

    // AoE 스킬: target: "all" → 살아있는 적 전체 공격 (대상당 배율은 어댑터가 단일 진실)
    if (isUltimate && skill?.target === 'all') {
      const targets = battler.isAlly ? this.enemies : this.allies;
      const aliveTargets = targets.filter(t => t.isAlive);
      for (let i = 0; i < aliveTargets.length; i++) {
        if (i > 0) {
          await new Promise(resolve => this.time.delayedCall(100 / this.battleSpeed, resolve));
        }
        await this._executeSingleAttack(
          battler, aliveTargets[i], skillMultiplier * AOE_DAMAGE_MULTIPLIER, skillName, isUltimate, skill
        );
      }
      // AoE 게이지 처리
      battler.skillGauge = 0;
      this.updateSkillGauge(battler);
      if (battler.isAlly) this.updateSkillCardUI(battler);
      this.addBattleLog(`${battler.name}의 ${skillName}! 전체 공격!`);
      return;
    }

    await this._executeSingleAttack(battler, target, skillMultiplier, skillName, isUltimate, skill);

    // 스킬 게이지 처리 (규칙은 어댑터가 단일 진실 — 시뮬레이터와 동일 경로)
    applyGaugeAfterAction(battler, { skill, isUltimate });
    this.updateSkillGauge(battler);

    // 아군의 경우 스킬 카드 UI 업데이트
    if (battler.isAlly) {
      this.updateSkillCardUI(battler);
    }
  }

  /**
   * 단일 대상 공격 실행 (VFX-2.1: SkillAnimationManager 통합)
   */
  async _executeSingleAttack(battler, target, skillMultiplier, skillName, isUltimate, skill = null) {
    if (!target.isAlive || this.battleEnded) return;

    // 힐 스킬 판정 (씬·시스템 공통 규칙 — 어댑터가 단일 진실)
    const isHeal = isHealSkill(skill);

    // Determine action type for animation system
    let actionType = 'basic_attack';
    if (isUltimate) {
      if (skill?.id === 'skill2') {
        actionType = 'ultimate';
      } else if (skill?.id === 'skill1') {
        actionType = 'skill1';
      } else {
        actionType = 'skill2'; // fallback for ultimate
      }
    } else if (skill?.id === 'skill1') {
      actionType = 'skill1';
    } else if (isHeal) {
      actionType = 'heal';
    }

    // Prepare animation data
    const sprites = battler.isAlly ? this.allySprites : this.enemySprites;
    const targetSprites = target.isAlly ? this.allySprites : this.enemySprites;

    const attackerData = {
      sprite: sprites?.[battler.position],
      x: battler.isAlly ? s(200) + (battler.position % 3) * s(150) : s(520) + (battler.position % 3) * s(150),
      y: battler.isAlly ? s(300) + Math.floor(battler.position / 3) * s(180) : s(300) + Math.floor(battler.position / 3) * s(180),
      mood: battler.mood || 'brave'
    };

    const targetsData = [{
      sprite: targetSprites?.[target.position],
      x: target.isAlly ? s(200) + (target.position % 3) * s(150) : s(520) + (target.position % 3) * s(150),
      y: target.isAlly ? s(300) + Math.floor(target.position / 3) * s(180) : s(300) + Math.floor(target.position / 3) * s(180)
    }];

    // ======== VFX-2.1: Execute with SkillAnimationManager ========
    await SkillAnimationManager.playAnimation(
      this,
      attackerData,
      targetsData,
      actionType,
      {
        onImpact: async () => {
          // All damage calculation and effects happen here (at impact moment)

          if (isHeal) {
            // ======== 힐 스킬 처리 — 회복량 보정(Round Table Bond)은 BattleSystem이 판단 ========
            const healBonus = this.battleSystem.getCultHealMultiplier(battler);
            const baseHeal = battler.atk * skillMultiplier * healBonus;
            const healAmount = Math.max(1, Math.floor(baseHeal * (0.9 + Math.random() * 0.2)));

            const healResult = target.heal(healAmount);
            const healed = healResult.actualHeal;

            console.log(`[Battle] Heal: ${battler.name} -> ${target.name} +${healed} HP (cult x${healBonus})`);

            // UI 업데이트
            this.updateBattlerUI(target);

            // 힐 이펙트 (파티클 + 반짝임) - Keep existing effects
            this.playSkillEffect(battler, target, false, isUltimate, skill);

            // 힐 숫자 표시
            this.showHealNumber(target, healAmount);

            // 로그
            this.addBattleLog(`${battler.name}의 ${skillName}! ${target.name} HP +${healed} 회복!`);

            // 턴 순서 바 업데이트
            this.updateTurnOrderBar();
            return;
          }

          // ======== 공격 스킬 처리 — 판정은 전부 BattleSystem.resolveDamage 단일 경로 ========
          // 방어 감쇠·분위기 상성·교단 배율·크리티컬·분산 계산, 방어막 흡수, 적중 훅
          // (Divine Charge / Doom / 반사), 사망 처리가 이 한 번의 호출 안에서 끝난다.
          const { damage, damageResult, cultEffects } = this.battleSystem.resolveDamage(
            battler,
            target,
            { ...(skill || {}), multiplier: skillMultiplier }
          );

          const dealt = damageResult.actualDamage;
          const isCrit = damage.isCrit;
          const moodAdvantage = describeMoodAdvantage(damage.moodBonus);

          GameLogger.log('BATTLE', `${battler.name} → ${target.name}: ${dealt}dmg (${skillName})`, {
            mood: battler.mood, crit: isCrit, moodAdv: moodAdvantage, absorbed: damageResult.absorbed
          });

          // A-8.3: 크리티컬 화면 흔들림 강화 (SkillAnimationManager가 기본 shake 처리, 추가 효과만)
          if (isCrit && !isUltimate) {
            this.cameras.main.shake(80, 0.003); // Reduced since SkillAnimationManager adds shake
          }

          // Update UI (공격자도 반사 피해/게이지가 바뀔 수 있다)
          this.updateBattlerUI(target);
          this.updateBattlerUI(battler);

          // Show damage (상성 정보 포함) — 방어막에 전부 막히면 흡수량을 대신 보여 준다
          if (dealt > 0) {
            this.showDamage(target, dealt, isCrit, moodAdvantage);
          } else if (damageResult.absorbed > 0) {
            this.showDamage(target, damageResult.absorbed, false, 'NEUTRAL');
          }

          // Attack animation + A-8.1 스킬 이펙트 (keep existing effects)
          this.playAttackAnimation(battler, target, isCrit);
          this.playSkillEffect(battler, target, isCrit, isUltimate, skill);

          // Log
          const critText = isCrit ? ' (크리티컬!)' : '';
          const moodText = moodAdvantage === 'ADVANTAGE' ? ' (유리▲)' : moodAdvantage === 'DISADVANTAGE' ? ' (불리▼)' : '';
          this.addBattleLog(`${battler.name}의 ${skillName}! ${target.name}에게 ${dealt} 데미지${critText}${moodText}`);

          // 교단 효과 표시 + 시스템 로그 배출 + 사망 연출 + 턴 순서 바
          this.syncAfterResolve(cultEffects);
        }
      }
    );
  }


  /**
   * BattleSystem이 쌓아 둔 로그를 화면 로그 대역으로 옮긴다.
   * 교단 효과(Lightning Strike / 성스러운 가시 / 저주 도트)와 사망 문구가 이 경로로 뜬다.
   */
  drainSystemLog() {
    if (!this.battleSystem) return;
    const { messages, cursor } = drainBattleLog(this.battleSystem, this._battleLogCursor || 0);
    this._battleLogCursor = cursor;
    messages.forEach(message => this.addBattleLog(message));
  }

  /**
   * 판정 결과로 죽은 유닛의 사망 연출을 재생한다.
   * 반사·도트·추가 피해 등 죽는 경로가 여러 개라 개별 호출부가 아니라 스윕으로 감지한다.
   */
  syncDeaths() {
    collectNewDeaths(this.allBattlers || []).forEach(unit => {
      this.playDeathAnimation(unit);
    });
  }

  /**
   * 교단 효과가 건드린 유닛들의 HP·배지 표시를 갱신한다.
   * @param {Array<object>} effects CultMechanicsSystem 효과 서술자
   */
  syncCultEffects(effects) {
    affectedUnitsOf(effects).forEach(unit => this.updateBattlerUI(unit));
  }

  /**
   * 한 행동이 끝난 뒤의 표시 동기화 묶음 (로그 → 사망 연출 → 턴 순서 바)
   */
  syncAfterResolve(effects = null) {
    if (effects) this.syncCultEffects(effects);
    this.drainSystemLog();
    this.syncDeaths();
    this.updateTurnOrderBar();
  }

  updateBattlerUI(battler) {
    const sprites = battler.isAlly ? this.allySprites : this.enemySprites;
    const sprite = sprites?.[battler.position];
    if (!sprite) return;

    // UIX-2.6.1: Use enhanced HP bar
    const hpBar = sprite.getData('hpBar');
    if (hpBar) {
      hpBar.updateHP(battler.currentHp, battler.maxHp, true);
    }

    // MECH-02 표기: 교단 상태 배지 동기화 (표시 전용)
    this.renderCultBadges(sprite, battler);
  }

  updateSkillGauge(battler) {
    const sprites = battler.isAlly ? this.allySprites : this.enemySprites;
    const sprite = sprites[battler.position];
    if (!sprite) return;

    // UIX-2.6.1: Use enhanced HP bar's skill gauge
    const hpBar = sprite.getData('hpBar');
    if (hpBar) {
      hpBar.updateSkill(battler.skillGauge, battler.maxSkillGauge);
    }
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
    if (isCrit) fontSize = sf(32);
    else if (damage >= 300) fontSize = sf(26);
    else if (damage >= 150) fontSize = sf(22);
    else fontSize = sf(18);

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

    const dmgText = this.add.text(sprite.x, this.getUnitBodyY(sprite) - s(70), `-${damage}`, {
      fontSize, fontFamily: 'Noto Sans KR',
      color: `#${  color.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isCrit ? s(5) : s(3)
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
      const advLabel = this.add.text(sprite.x + s(45), this.getUnitBodyY(sprite) - s(75), '▲유리', {
        fontSize: sf(12), fontFamily: 'Noto Sans KR',
        color: '#FFD700', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: s(2)
      }).setOrigin(0.5).setDepth(20);
      this.tweens.add({
        targets: advLabel,
        y: advLabel.y - s(35), alpha: 0,
        duration: 900 / this.battleSpeed,
        onComplete: () => advLabel.destroy()
      });
    } else if (moodAdvantage === 'DISADVANTAGE') {
      const disLabel = this.add.text(sprite.x + s(45), this.getUnitBodyY(sprite) - s(75), '▼불리', {
        fontSize: sf(12), fontFamily: 'Noto Sans KR',
        color: '#3498DB', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: s(2)
      }).setOrigin(0.5).setDepth(20);
      this.tweens.add({
        targets: disLabel,
        y: disLabel.y - s(35), alpha: 0,
        duration: 900 / this.battleSpeed,
        onComplete: () => disLabel.destroy()
      });
    }

    // A-8.3: 크리티컬 라벨 강화 (스케일 펀치)
    if (isCrit) {
      const critLabel = this.add.text(sprite.x, this.getUnitBodyY(sprite) - s(100), 'CRITICAL!', {
        fontSize: sf(16), fontFamily: 'Noto Sans KR',
        color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold',
        stroke: '#000000', strokeThickness: s(3)
      }).setOrigin(0.5).setDepth(20).setScale(0.5);

      this.tweens.add({
        targets: critLabel,
        scale: 1.3, duration: 150 / this.battleSpeed,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: critLabel,
            y: critLabel.y - s(30), alpha: 0, scale: 1.6,
            duration: 500 / this.battleSpeed,
            onComplete: () => critLabel.destroy()
          });
        }
      });
    }

    // 데미지 텍스트 애니메이션 (위로 올라가며 사라짐)
    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - s(50),
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
    const lungeDistance = isCrit ? s(50) : s(30);

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
      const shakeIntensity = isCrit ? s(10) : s(5);
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
      const hitEffect = this.add.circle(targetSprite.x, this.getUnitBodyY(targetSprite), s(5), hitColor, 0.8);
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
        sprite.x + Phaser.Math.Between(s(-15), s(15)),
        this.getUnitBodyY(sprite) + Phaser.Math.Between(s(-15), s(15)),
        Phaser.Math.Between(s(2), s(5)),
        battler.isAlly ? COLORS.primary : COLORS.danger,
        0.8
      ).setDepth(20);

      this.tweens.add({
        targets: shard,
        x: shard.x + Phaser.Math.Between(s(-60), s(60)),
        y: shard.y + Phaser.Math.Between(s(20), s(60)),
        alpha: 0,
        duration: 600 / this.battleSpeed,
        onComplete: () => shard.destroy()
      });
    }

    this.tweens.add({
      targets: sprite,
      alpha: 0,
      y: sprite.y + s(20),
      duration: 500 / this.battleSpeed
    });
  }

  addBattleLog(message) {
    // §3-5: HUD 위 토스트가 턴 순서 바를 덮던 문제 → 하단 전용 대역의 최근 2줄로 고정
    this.battleLogs = pushLogLine(this.battleLogs, message, LOG_LINES);
    this.renderLogBand();
  }

  /**
   * 로그 대역을 다시 그린다. 가장 최근 줄이 아래이고 밝다.
   */
  renderLogBand() {
    if (!this.logTexts) return;
    const lines = this.battleLogs || [];

    this.logTexts.forEach((text, index) => {
      const line = lines[index];
      if (!line) {
        text.setText('');
        text.setAlpha(0);
        return;
      }
      const isLatest = index === lines.length - 1;
      text.setText(line);
      text.setColor(isLatest ? DESIGN.colors.text.primary : DESIGN.colors.text.secondary);
      text.setY(s(getLogLineY(index, lines.length)));

      // 새 줄만 살짝 밀어 올리며 등장시킨다. 두 줄이 동시에 움직이면 읽히지 않는다
      if (isLatest) {
        text.setAlpha(0);
        this.tweens.add({
          targets: text,
          alpha: 1,
          duration: 220 / this.battleSpeed,
          ease: 'Sine.easeOut'
        });
      } else {
        text.setAlpha(0.9);
      }
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
      const victoryText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(50), 'VICTORY', ts('display.xl', {
        color: '#FFD60A', stroke: '#000000', strokeThickness: s(5)
      })).setOrigin(0.5).setDepth(40).setScale(0);

      this.tweens.add({
        targets: victoryText,
        scale: 1.2, duration: 400, ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: victoryText,
            alpha: 0, y: victoryText.y - s(30),
            duration: 400, delay: 300,
            onComplete: () => victoryText.destroy()
          });
        }
      });
    } else {
      this.cameras.main.fade(600, 50, 0, 0, true);

      // 패배 텍스트
      const defeatText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(50), 'DEFEAT', ts('display.xl', {
        color: '#EF4444', stroke: '#000000', strokeThickness: s(5)
      })).setOrigin(0.5).setDepth(40).setAlpha(0);

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
    const levelUpResults = [];

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
        // 소탕 시스템에 클리어 기록
        sweepSystem.recordStageClear(this.stage.id, newStars);
      }

      // 타워 모드: 층 클리어 처리
      if (this.mode === 'tower' && this.towerFloor) {
        TowerSystem.clearFloor(this.towerFloor, {
          victory: true,
          stars: newStars,
          rewards
        });
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
      totalAllies,
      mode: this.mode,  // 추가: 보스전 모드 전달
      towerFloor: this.towerFloor,  // 추가: 타워 층 전달
      // T-Q3: 패배 화면 진단용 — 얼마나 근접했는지를 보여주면 재도전 동기가 유지된다
      enemyHpRemainRatio: this._getEnemyHpRemainRatio()
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
    // RES-ABS-4: 메모리 해제
    if (this._loadedHeroIds && this._loadedHeroIds.length > 0) {
      HeroAssetLoader.unloadTextures(this, this._loadedHeroIds);
    }

    // 판정 엔진의 이벤트 리스너 해제 (씬 재진입 시 중복 구독 방지)
    if (this.battleSystem) {
      this.battleSystem.cleanup();
      this.battleSystem = null;
    }

    this.time.removeAllEvents();
    this.tweens.killAll();
    this.battleEventListeners = [];
    this.targetSelectionMode = false;
    this.selectedSkillCard = null;
    if (this.input) {
      this.input.removeAllListeners();
    }
  }

  /**
   * 적 진영의 남은 HP 비율 (0~1). 패배 화면의 "적 체력 N% 남음" 표시에 쓴다.
   * @returns {number}
   */
  _getEnemyHpRemainRatio() {
    const enemies = Array.isArray(this.enemies) ? this.enemies : [];
    if (enemies.length === 0) return 0;
    const max = enemies.reduce((sum, e) => sum + (e.maxHp || 0), 0);
    if (max <= 0) return 0;
    const current = enemies.reduce((sum, e) => sum + Math.max(0, e.currentHp || 0), 0);
    return Math.min(1, Math.max(0, current / max));
  }

}
