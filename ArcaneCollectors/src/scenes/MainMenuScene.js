import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
import { energySystem } from '../systems/EnergySystem.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import transitionManager from '../utils/TransitionManager.js';
import navigationManager from '../systems/NavigationManager.js';
import { safeGet, safeCall } from '../utils/safeAccess.js';
import { Z_INDEX } from '../config/layoutConfig.js';
import { Modal } from '../components/Modal.js';
import { formatTime } from '../utils/colorUtils.js';
import { IdleProgressSystem } from '../systems/IdleProgressSystem.js';
import { MeditationView } from '../components/MeditationView.js';
import { getCharacter, getCharacterOrHero, calculatePower, getStage, getChapterStages, normalizeHeroes } from '../data/index.ts';
import { HeroInfoPopup } from '../components/HeroInfoPopup.js';
import { OVERLAY_ROOT_NAME as GACHA_OVERLAY_NAME } from '../components/GachaResultOverlay.js';
import {
  LEGACY_NOTICE_TITLE,
  LEGACY_NOTICE_CONFIRM,
  formatLegacyMigrationNotice
} from '../utils/legacyMigrationNotice.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { MenuGridGate } from '../systems/MenuGridGate.js';
import { TutorialTargetRegistry } from '../systems/TutorialTargetRegistry.js';
import { TutorialManager } from '../systems/TutorialManager.js';
import { TutorialFlow } from '../components/tutorial/TutorialFlow.js';
import { StoryManager } from '../systems/StoryManager.js';
import { TutorialEvents } from '../systems/TutorialManager.js';
import { EventBus } from '../systems/EventBus.js';
import { LABEL_PLATE } from '../components/NineSliceFrame.js';
import { GachaPopup } from '../components/popups/GachaPopup.js';
import { HeroListPopup } from '../components/popups/HeroListPopup.js';
import { PartyEditPopup } from '../components/popups/PartyEditPopup.js';
import { QuestPopup } from '../components/popups/QuestPopup.js';
import { TowerPopup } from '../components/popups/TowerPopup.js';
import { InventoryPopup } from '../components/popups/InventoryPopup.js';
import { SettingsPopup } from '../components/popups/SettingsPopup.js';
import { EventDungeonPopup } from '../components/popups/EventDungeonPopup.js';
import { AscensionPopup } from '../components/popups/AscensionPopup.js';
import { PvPPopup } from '../components/popups/PvPPopup.js';
import { GuildPopup } from '../components/popups/GuildPopup.js';
import { RaidPopup } from '../components/popups/RaidPopup.js';
import { FriendsPopup } from '../components/popups/FriendsPopup.js';
import { CollectionPopup } from '../components/popups/CollectionPopup.js';
import { StoryLogPopup } from '../components/popups/StoryLogPopup.js';
import { ReturningPlayerCard } from '../components/ReturningPlayerCard.js';
import { buildReturnSummary } from '../systems/ReturningPlayerRules.js';
import { soundManager } from '../systems/SoundManager.js';
import { RETURN_TIER } from '../config/onboardingConfig.js';

// --- T-10 비주얼 리디자인 (REDESIGN_PLAN §3-1) ---
import { DESIGN } from '../config/designSystem.js';
import { ts } from '../utils/textStyles.ts';
import { GlassPanel, GLASS_VARIANT } from '../components/GlassPanel.js';
import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import { IconFactory } from '../utils/IconFactory.js';
import * as ML from '../utils/mainMenuLayout.js';
import {
  computeMenuBadges,
  formatBadgeCount,
  summarizeBadges,
  markMenuSeen,
  BADGE_TYPE
} from '../systems/MenuBadgeRules.js';
import { QuestSystem } from '../systems/QuestSystem.js';
import { EvolutionSystem } from '../systems/EvolutionSystem.js';
import { EventDungeonSystem } from '../systems/EventDungeonSystem.js';
import { GameEvents } from '../systems/EventBus.js';

/**
 * 레거시 통합 안내 (QA P1-5) 표시 규격.
 * depth 는 복귀 카드(2500) 위, 튜토리얼 루트(Z_INDEX.TUTORIAL = 3000) 아래여야 한다.
 * 지연은 씬이 다 그려진 뒤에 뜨게 하는 최소값이다.
 */
const LEGACY_NOTICE_DEPTH = 2600;
const LEGACY_NOTICE_DELAY = 400;

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  init(data) {
    this.showOfflineRewards = data?.showOfflineRewards || null;
    this.bossVictory = data?.bossVictory || false;
    this.bossDefeat = data?.bossDefeat || false;
    // 다른 씬(스테이지 선택 경고 CTA 등)이 지정한 자동 오픈 팝업
    this.pendingPopupKey = data?.openPopup || null;
    this.activePopupKey = null;
    // 빈 화면 방지: shutdown()이 호출되지 않는 비정상 경로 대비
    this._uiCreated = false;
  }

  create() {
    try {
    // BUG-01 수정: create() 재호출 방지 - 팝업 열기/닫기로 인한 중복 생성 차단
    if (this._uiCreated) {
      console.warn('[MainMenuScene] create() 재호출 감지됨 - UI 생성 스킵');
      // 데이터만 갱신
      const resources = SaveManager.getResources() || {};
      this.registry.set('gems', resources?.gems ?? 1500);
      this.registry.set('gold', resources?.gold ?? 10000);
      return;
    }

    // SND-01: 로비 BGM
    soundManager.init(this);
    soundManager.playBGM('main_theme');

    // NavigationManager 초기화 (메인 메뉴 = 네비게이션 루트)
    navigationManager.reset();
    navigationManager.pushScene('MainMenuScene', {});
    navigationManager.setCurrentScene(this);

    this.cameras.main.fadeIn(400);

    // Initialize ParticleManager for dynamic effects
    this.particles = new ParticleManager(this);

    // Initialize IdleProgressSystem
    this.idleSystem = new IdleProgressSystem(this);

    // Load current resources from SaveManager (with null defense)
    const resources = SaveManager.getResources() || {};
    this.registry.set('gems', resources?.gems ?? 1500);
    this.registry.set('gold', resources?.gold ?? 10000);

    // Initialize energy system (에너지 회복 시작)
    const fullSaveData = SaveManager.load();
    energySystem.initialize(fullSaveData?.energy || null);

    // Hero info popup instance
    this.heroPopup = new HeroInfoPopup(this);

    // 튜토리얼 타깃은 UI를 다시 그리기 직전에 비운다.
    // shutdown()에서 비우면 create()가 _uiCreated 가드로 조기 반환할 때 재등록 기회가 없어
    // 코치마크가 3단계(fallbackAnchor)로 강등된다. 등록이 항상 마지막 기록자가 되게 한다.
    TutorialTargetRegistry.clearScope('mainmenu');

    // 화면 액센트를 먼저 정한다 — 패널 아웃라인·진행바·배지가 전부 이 색을 따른다 (§2-1 Cult Tint)
    this._accent = this.resolveAccent();

    this.createBackground();
    this.createTopBar();
    this.createPartyDisplay();
    this.createCombatPowerDisplay();
    this.createAdventurePanel();
    this.createIdleBattleView();
    this.createIdleSummary();
    this.createBottomMenu();

    // BUG-01 수정: UI 생성 완료 플래그 설정 (중복 생성 방지)
    this._uiCreated = true;

    // 튜토리얼 배선 — 현재 스텝을 화면(컷씬/마스킹/코치마크)으로 옮긴다
    this.tutorialFlow = new TutorialFlow(this).start();
    this._menusUnlockedOff = EventBus.on(TutorialEvents.MENUS_UNLOCKED, () => this.refreshBottomMenu());
    this._badgeEventsOff = this._subscribeMenuBadgeEvents();

    // 오프라인 보상: IdleProgressSystem의 DPS 기반으로 재계산
    if (this.showOfflineRewards && (this.showOfflineRewards?.gold ?? 0) > 0) {
      const lastLogoutTime = fullSaveData?.lastLogoutTime || fullSaveData?.lastOnline || Date.now();
      const dpsRewards = this.idleSystem.calculateOfflineRewards(lastLogoutTime);

      // DPS 기반 보상이 있으면 사용, 없으면 기존 보상 유지
      if (dpsRewards.gold > 0 || dpsRewards.progressGained > 0) {
        this.showOfflineRewards = {
          ...this.showOfflineRewards,
          gold: Math.max(this.showOfflineRewards.gold, dpsRewards.gold),
          exp: Math.max(this.showOfflineRewards.exp, dpsRewards.exp),
          items: dpsRewards.items || [],
          progressGained: dpsRewards.progressGained || 0,
          bossReady: dpsRewards.bossReady || false
        };
        // 진행도 즉시 저장
        this.idleSystem.saveProgress();

        // BUG-12 수정: 오프라인 보상 적용 후 bossReady 상태 재계산
        // 이미 loadCurrentBoss()가 constructor에서 실행되었으므로, 여기서는 상태만 갱신
      }

      this.time.delayedCall(500, () => {
        this.showOfflineRewardsPopup(this.showOfflineRewards);
      });
    }

    // QA P1-5: 레거시 스타터 통합 안내 (조건부 1회). 복귀 카드보다 먼저 알린다.
    this.maybeShowLegacyMigrationNotice();

    // T-Q5/T-25: 복귀 유저 요약 카드 (조건부 1회). 컷씬은 자동 재생하지 않는다(UX §5-3).
    this.maybeShowReturningPlayerCard(fullSaveData);

    // 다른 씬이 요청한 팝업 자동 오픈 (스테이지 선택 벽 경고 CTA 등)
    if (this.pendingPopupKey) {
      const key = this.pendingPopupKey;
      this.pendingPopupKey = null;
      this.time.delayedCall(300, () => this.openPopup(key));
    }
    } catch (error) {
      console.error('[MainMenuScene] create() 실패:', error);
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  shutdown() {
    // BUG-01 수정: UI 생성 플래그 리셋 (씬이 완전히 종료될 때)
    this._uiCreated = false;

    if (this._menusUnlockedOff) {
      this._menusUnlockedOff();
      this._menusUnlockedOff = null;
    }
    if (this._badgeEventsOff) {
      this._badgeEventsOff();
      this._badgeEventsOff = null;
    }
    if (this._badgeRefreshTimer) {
      this._badgeRefreshTimer.remove(false);
      this._badgeRefreshTimer = null;
    }
    this._menuTiles = {};
    if (this.tutorialFlow) {
      this.tutorialFlow.destroy();
      this.tutorialFlow = null;
    }

    if (this.particles) {
      this.particles.destroy();
      this.particles = null;
    }
    if (this._starTimer) {
      this._starTimer.remove();
      this._starTimer = null;
    }
    if (this.energyBar) {
      this.energyBar.destroy();
      this.energyBar = null;
    }
    if (this.idleBattleView) {
      this.idleBattleView.clearMask();
      this.idleBattleView.destroy();
      this.idleBattleView = null;
    }
    if (this._idleMaskGfx) {
      this._idleMaskGfx.destroy();
      this._idleMaskGfx = null;
      this._idleMask = null;
    }
    if (this.heroPopup) {
      this.heroPopup.destroy();
      this.heroPopup = null;
    }
    if (this.idleSystem) {
      this.idleSystem.saveProgress();
      this.idleSystem = null;
    }
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }


  /**
   * 메뉴를 열었다고 기록한다. NEW 배지는 이 시각을 기준으로 꺼진다.
   * @param {string} popupKey
   */
  markMenuSeen(popupKey) {
    try {
      const save = SaveManager.load();
      markMenuSeen(save, popupKey);
      SaveManager.save(save);
    } catch (error) {
      console.warn('[MainMenuScene] 메뉴 확인 기록 실패:', error?.message);
    }
  }

  /**
   * 배지를 바꿀 수 있는 게임 이벤트를 구독한다.
   * 개별 이벤트마다 다시 계산하면 프레임을 먹으므로 300ms 로 모아 한 번만 계산한다.
   * @returns {Function} 해제 함수
   */
  _subscribeMenuBadgeEvents() {
    const events = [
      GameEvents.QUEST_COMPLETE,
      GameEvents.QUEST_REWARD_CLAIMED,
      GameEvents.QUEST_PROGRESS,
      GameEvents.DAILY_RESET,
      GameEvents.CHARACTER_ADDED,
      GameEvents.EVOLVE,
      GameEvents.COLLECTION_UPDATED,
      GameEvents.COLLECTION_COMPLETED,
      GameEvents.GACHA_COMPLETE,
      GameEvents.RESOURCE_CHANGED,
      GameEvents.STAGE_CLEARED
    ].filter(Boolean);

    const schedule = () => {
      if (this._badgeRefreshTimer) this._badgeRefreshTimer.remove(false);
      this._badgeRefreshTimer = this.time.delayedCall(300, () => {
        this._badgeRefreshTimer = null;
        this.refreshMenuBadges();
      });
    };

    const offs = events.map((name) => EventBus.on(name, schedule));
    return () => offs.forEach((off) => off?.());
  }

  /**
   * 화면 액센트로 쓸 교단을 정한다 (§2-1 Cult Tint).
   * 파티 1번 영웅의 교단을 따르고, 파티가 비었으면 brand.primary 로 간다.
   * @returns {{cult: string|null, color: number, css: string}}
   */
  resolveAccent() {
    try {
      const saveData = SaveManager.load();
      const rawParty = (saveData?.parties || [])[0];
      const heroIds = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []) || [];
      const heroes = heroIds.filter(Boolean).map((id) => getCharacterOrHero(id) || getCharacter(id)).filter(Boolean);
      const cult = ML.resolveAccentCult(heroes);
      const color = ML.resolveAccentColor(cult);
      return { cult, color, css: ML.toCss(color) };
    } catch (error) {
      const color = DESIGN.colors.brand.primary;
      return { cult: null, color, css: ML.toCss(color) };
    }
  }

  /**
   * 복귀 유저 요약 카드 표시 (T-Q5 / T-25).
   *
   * 표시 조건: 이탈 3일 이상 && 이번 복귀 보상을 아직 받지 않았을 것.
   * 판정과 문구는 전부 `ReturningPlayerCard`의 순수 함수가 만들고, 여기서는 띄우기만 한다.
   * 오프라인 보상 팝업과 겹치지 않도록 그보다 뒤(900ms)에 띄운다.
   *
   * @param {object|null} saveData SaveManager.load() 결과
   * @returns {boolean} 카드를 띄웠는지
   */
  maybeShowReturningPlayerCard(saveData) {
    try {
      const save = saveData || SaveManager.load();
      const summary = buildReturnSummary(save, {
        stageName: (stageId) => {
          const chapterNo = String(stageId || '').split('-')[0];
          return getStage(`chapter_${chapterNo}`, stageId)?.name || null;
        },
      });

      if (!summary.visible) return false;

      // 같은 복귀 구간에서 두 번 띄우지 않는다.
      // `lastOnline`은 저장할 때마다 갱신되므로 기준이 될 수 없다. 마지막 수령 시각으로 판단한다.
      const lastRewardAt = save?.onboarding?.lastReturnRewardAt ?? null;
      const DAY_MS = 24 * 60 * 60 * 1000;
      if (lastRewardAt && Date.now() - lastRewardAt < DAY_MS) return false;

      this.time.delayedCall(900, () => {
        this.returningCard = new ReturningPlayerCard(this, summary, {
          onClaim: (result) => this.claimReturnGift(result),
          onCta: (key) => {
            if (key === 'collection' || key === 'ascension') this.openPopup(key);
          },
        });
        this.returningCard.show();
      });
      return true;
    } catch (error) {
      console.warn('[MainMenuScene] 복귀 카드 표시 실패:', error?.message);
      return false;
    }
  }

  /**
   * 레거시 스타터 통합 1회성 안내 (QA P1-5).
   *
   * 마이그레이션은 보유 영웅 4명을 1명으로 줄이면서 레벨을 승계하고 장비를 반환한다.
   * 아무 말 없이 벌어지면 유저는 계정이 손상됐다고 읽는다. 무엇이 어디로 갔는지 한 번 알린다.
   *
   * 플래그는 `SaveManager.consumeLegacyMigrationNotice()` 가 꺼내는 즉시 지운다.
   * depth 는 복귀 카드(2500) 위 · 튜토리얼(3000) 아래다.
   *
   * @returns {boolean} 안내를 띄웠는지
   */
  maybeShowLegacyMigrationNotice() {
    try {
      const notice = SaveManager.consumeLegacyMigrationNotice();
      const message = formatLegacyMigrationNotice(notice, {
        resolveName: (id) => getCharacterOrHero(id)?.name || getCharacter(id)?.name || id
      });
      if (!message) return false;

      this.time.delayedCall(LEGACY_NOTICE_DELAY, () => {
        if (!this.scene?.isActive?.()) return;
        const modal = new Modal(this, {
          title: LEGACY_NOTICE_TITLE,
          content: message,
          width: s(420),
          height: s(300),
          closeOnOverlay: false,
          buttons: [{ text: LEGACY_NOTICE_CONFIRM, onClick: () => {} }]
        });
        modal.setDepth(LEGACY_NOTICE_DEPTH);
        modal.once('hide', () => modal.destroy());
        modal.show();
      });
      return true;
    } catch (error) {
      console.warn('[MainMenuScene] 레거시 통합 안내 표시 실패:', error?.message);
      return false;
    }
  }

  /**
   * 복귀 선물 지급. `onboarding.lastReturnRewardAt`으로 중복 수령을 막는다.
   * @param {object} summary buildReturnSummary 결과
   */
  claimReturnGift(summary) {
    const gift = summary?.gift;
    if (!gift) return;

    try {
      const save = SaveManager.load();
      const res = save.resources || (save.resources = {});
      res.gems = (res.gems || 0) + gift.gems;
      res.gold = (res.gold || 0) + gift.gold;
      res.summonTickets = (res.summonTickets || 0) + gift.summonTickets;
      res.spiritStones = (res.spiritStones || 0) + gift.spiritStones;

      if (!save.onboarding || typeof save.onboarding !== 'object') save.onboarding = {};
      save.onboarding.returningPlayerTier = summary.tier ?? RETURN_TIER.NONE;
      save.onboarding.lastReturnRewardAt = Date.now();
      SaveManager.save(save);

      if (gift.energyFull) {
        energySystem.addEnergy(energySystem.getMaxEnergy());
      }

      const newResources = SaveManager.getResources() || {};
      this.registry.set('gems', newResources?.gems ?? 0);
      this.registry.set('gold', newResources?.gold ?? 0);
      this.showToast('복귀 선물을 받았습니다!');
    } catch (error) {
      console.warn('[MainMenuScene] 복귀 선물 지급 실패:', error?.message);
    }
  }

  showOfflineRewardsPopup(rewards) {
    if (!rewards) {
      console.warn('[MainMenuScene] showOfflineRewardsPopup: rewards is null/undefined');
      return;
    }

    const safeRewards = {
      formattedDuration: rewards?.formattedDuration ?? '0분',
      gold: rewards?.gold ?? 0,
      exp: rewards?.exp ?? 0,
      progressGained: rewards?.progressGained ?? 0,
      bossReady: rewards?.bossReady ?? false,
      items: rewards?.items || []
    };

    const contentContainer = this.add.container(0, 0);
    const elements = [];
    let yPos = s(-80);

    // 시간 표시
    elements.push(this.add.text(0, yPos, `${safeRewards.formattedDuration} 동안 모험했습니다!`, {
      fontSize: sf(16), fontFamily: '"Noto Sans KR", Arial', color: '#94A3B8', align: 'center'
    }).setOrigin(0.5));
    yPos += s(40);

    // 골드 보상
    elements.push(this.add.text(0, yPos, `💰 골드: +${safeRewards.gold.toLocaleString()}`, {
      fontSize: sf(20), fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`, fontStyle: 'bold'
    }).setOrigin(0.5));
    yPos += s(35);

    // 경험치 보상
    elements.push(this.add.text(0, yPos, `⭐ 경험치: +${safeRewards.exp.toLocaleString()}`, {
      fontSize: sf(20), fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.success.toString(16).padStart(6, '0')}`, fontStyle: 'bold'
    }).setOrigin(0.5));
    yPos += s(35);

    // 보스 진행도 증가
    if (safeRewards.progressGained > 0) {
      const progressPercent = Math.floor(safeRewards.progressGained * 100);
      const progressColor = safeRewards.bossReady ? '#EF4444' : '#3B82F6';
      elements.push(this.add.text(0, yPos, `⚔️ 보스 진행도: +${progressPercent}%`, {
        fontSize: sf(18), fontFamily: '"Noto Sans KR", Arial', color: progressColor, fontStyle: 'bold'
      }).setOrigin(0.5));
      yPos += s(30);

      if (safeRewards.bossReady) {
        elements.push(this.add.text(0, yPos, '🔥 보스전 도전 가능!', {
          fontSize: sf(16), fontFamily: '"Noto Sans KR", Arial', color: '#EF4444', fontStyle: 'bold'
        }).setOrigin(0.5));
        yPos += s(30);
      }
    }

    // 아이템 드롭
    if (safeRewards.items.length > 0) {
      const itemNames = safeRewards.items.map(i => i.name || i.id).join(', ');
      elements.push(this.add.text(0, yPos, `📦 아이템: ${itemNames}`, {
        fontSize: sf(14), fontFamily: '"Noto Sans KR", Arial', color: '#A78BFA'
      }).setOrigin(0.5));
      yPos += s(25);
    }

    contentContainer.add(elements);

    const modalHeight = Math.max(s(280), yPos + s(160));
    const modal = new Modal(this, {
      title: '🎁 오프라인 보상',
      content: contentContainer,
      width: s(380),
      height: modalHeight,
      buttons: [
        {
          text: '받기',
          onClick: () => {
            SaveManager.claimOfflineRewards();
            this.registry.remove('pendingOfflineRewards');
            this.showOfflineRewards = null;
            const newResources = SaveManager.getResources() || {};
            this.registry.set('gems', newResources?.gems ?? 1500);
            this.registry.set('gold', newResources?.gold ?? 10000);
            this.showToast('보상을 받았습니다!');
          }
        }
      ],
      closeOnOverlay: false
    });

    modal.show();
  }

  /**
   * 배경 (§3-1 / T-09).
   * 생성 일러스트 `bg_main` 이 있으면 cover-fit + 딤, 없으면 BackgroundFactory 의
   * 프로시저럴 폴백이 그대로 남는다. 그 위에 교단색 부유 입자만 얹어 정지 화면이
   * 죽지 않게 한다. 별 25개를 흩뿌리던 기존 연출은 일러스트와 경합하므로 걷어냈다.
   */
  createBackground() {
    this.sceneBg = BackgroundFactory.createSceneBg(this, 'main', { depth: Z_INDEX.BACKGROUND });
    this._bgKey = this.sceneBg?.hasImage ? this.sceneBg.textureKey : null;

    const accent = this._accent?.color ?? DESIGN.colors.brand.primary;
    this._motes = [];
    for (let i = 0; i < 6; i++) {
      const mote = this.add.circle(
        Phaser.Math.Between(s(40), GAME_WIDTH - s(40)),
        Phaser.Math.Between(s(120), s(900)),
        Phaser.Math.FloatBetween(s(2), s(5)),
        accent,
        0.10
      ).setDepth(Z_INDEX.BACKGROUND + 2);
      this.tweens.add({
        targets: mote,
        y: mote.y + Phaser.Math.Between(s(-50), s(50)),
        alpha: { from: 0.10, to: 0.22 },
        duration: Phaser.Math.Between(5000, 9000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this._motes.push(mote);
    }
  }

  /**
   * 상단바 (§3-1). glass.hud + 교단색 언더라인.
   *
   * 에너지 바가 "빈 검은 사각형"으로 보이던 원인은 `EnergyBar` 컨테이너의 depth 가
   * Z_INDEX.UI(200) 여서 상단바 배경(300)에 덮이는 것이었다. 그래서 상단바와 같은
   * depth 로 직접 그린다. `this.energyBar` 는 update()/shutdown() 계약을 유지하도록
   * 같은 이름의 경량 핸들로 남긴다.
   */
  createTopBar() {
    const L = ML.computeTopBarSlots();
    const d = Z_INDEX.TOP_BAR;
    const barH = s(L.bar.h);

    GlassPanel.create(this, {
      x: GAME_WIDTH / 2,
      y: barH / 2,
      w: GAME_WIDTH,
      h: barH,
      variant: GLASS_VARIANT.HUD,
      bgKey: this._bgKey,
      depth: d,
      radius: 0
    });

    // 교단색 언더라인 — 화면 액센트가 여기서 처음 선언된다 (§2-1 Cult Tint)
    this.add.rectangle(GAME_WIDTH / 2, barH, GAME_WIDTH, s(2), this._accent.color, 0.6).setDepth(d + 1);

    const saveData = SaveManager.load();
    const playerLevel = saveData.player?.level || 1;

    const badge = this.add.graphics().setDepth(d + 1);
    badge.fillStyle(this._accent.color, 0.85);
    badge.fillRoundedRect(s(L.level.x - L.level.w / 2), s(L.level.y - L.level.h / 2), s(L.level.w), s(L.level.h), s(6));
    this.levelBadgeText = this.add.text(s(L.level.x), s(L.level.y), `Lv.${playerLevel}`,
      ts('num.sm', { color: '#0D0F1A' })).setOrigin(0.5).setDepth(d + 2);

    // 재화 — 시스템 이모지 대신 생성 아이콘(있으면) 또는 벡터 폴백 (§2-2)
    this._currencyIcon(s(L.gem.iconX), s(L.gem.y), 'gem', L.gem.iconSize, d + 2);
    const gems = this.registry.get('gems') || 1500;
    this.gemText = this.add.text(s(L.gem.textX), s(L.gem.y), gems.toLocaleString(),
      ts('num.md', { color: DESIGN.colors.text.primary })).setOrigin(0, 0.5).setDepth(d + 2);

    this._currencyIcon(s(L.gold.iconX), s(L.gold.y), 'gold', L.gold.iconSize, d + 2);
    const gold = this.registry.get('gold') || 10000;
    this.goldText = this.add.text(s(L.gold.textX), s(L.gold.y), gold.toLocaleString(),
      ts('num.md', { color: DESIGN.colors.text.primary })).setOrigin(0, 0.5).setDepth(d + 2);

    this.createEnergyMeter(L, d);

    // 젬 충전 버튼 — 시각 알약은 작아도 히트 박스는 터치 하한을 지킨다 (§2-5)
    const chargeGfx = this.add.graphics().setDepth(d + 2);
    chargeGfx.fillStyle(DESIGN.colors.bg.secondary, 0.9);
    chargeGfx.fillRoundedRect(s(L.charge.x - 16), s(L.charge.y - 14), s(32), s(28), s(6));
    chargeGfx.lineStyle(s(1), this._accent.color, 0.5);
    chargeGfx.strokeRoundedRect(s(L.charge.x - 16), s(L.charge.y - 14), s(32), s(28), s(6));
    this.add.text(s(L.charge.x), s(L.charge.y), '+',
      ts('num.md', { color: ML.toCss(DESIGN.colors.brand.accent) })).setOrigin(0.5).setDepth(d + 3);
    const chargeHit = this.add.rectangle(s(L.charge.x), s(L.charge.y), s(L.charge.hit.w), s(L.charge.hit.h))
      .setAlpha(0.001).setDepth(d + 4).setInteractive({ useHandCursor: true });
    chargeHit.on('pointerdown', () => this.chargeEnergyWithGems());

    // 설정 — 벡터 아이콘. 히트 72x72 (base 48)
    const settingsHit = this.add.rectangle(s(L.settings.x), s(L.settings.y), s(L.settings.w), s(L.settings.h))
      .setAlpha(0.001).setDepth(d + 4).setInteractive({ useHandCursor: true });
    const settingsIcon = IconFactory.createImage(this, s(L.settings.x), s(L.settings.y), 'settings', s(DESIGN.icon.md), {
      tint: DESIGN.colors.brand.primary
    });
    settingsIcon?.setDepth(d + 2);
    settingsHit.on('pointerover', () => settingsIcon?.setAlpha(0.75));
    settingsHit.on('pointerout', () => settingsIcon?.setAlpha(1));
    settingsHit.on('pointerdown', () => this.openPopup('settings'));

    // 종합 알림 점 — 어느 메뉴든 받을 것/확인할 것이 있으면 켜진다
    this._topBarAlertDot = this.add.circle(
      s(L.settings.x + 15), s(L.settings.y - 14), s(6), DESIGN.colors.status.error, 1
    ).setDepth(d + 5).setVisible(false);
    this._topBarAlertDot.setStrokeStyle(s(2), DESIGN.colors.bg.primary, 0.9);
  }

  /**
   * 에너지 채움바. 트랙 + 채움 + 수치 오버레이 + 회복 타이머 (§3-1).
   * @param {Object} L computeTopBarSlots() 결과
   * @param {number} d 상단바 depth
   */
  createEnergyMeter(L, d) {
    const e = L.energy;
    const x = s(e.x);
    const y = s(e.y);
    const w = s(e.w);
    const h = s(e.h);
    const r = h / 2;

    this._currencyIcon(s(e.iconX), s(L.midY), 'energy', 22, d + 2);

    const track = this.add.graphics().setDepth(d + 1);
    track.fillStyle(DESIGN.colors.bg.primary, 0.85);
    track.fillRoundedRect(x, y, w, h, r);
    track.lineStyle(s(1), this._accent.color, 0.35);
    track.strokeRoundedRect(x, y, w, h, r);

    const fill = this.add.graphics().setDepth(d + 2);
    const text = this.add.text(s(e.textX), s(e.textY), '',
      ts('num.sm', { color: DESIGN.colors.text.primary })).setOrigin(0.5).setDepth(d + 3);
    const timer = this.add.text(s(L.timer.x), s(L.timer.y), '',
      ts('caption', { color: DESIGN.colors.text.muted })).setOrigin(0.5).setDepth(d + 3);

    // EnergyBar 컴포넌트와 같은 계약(update/destroy)을 유지해 update()/shutdown() 을 건드리지 않는다.
    // 마지막 값 캐시는 반드시 이 클로저 안에 둔다. 씬 프로퍼티에 두면 scene.restart() 후에도
    // 값이 남아 있어 "같은 값이라 다시 그리지 않는다"가 새 Graphics 를 빈 채로 남긴다.
    let lastSignature = null;
    this.energyBar = {
      update: (current, max) => {
        const signature = `${current}/${max}`;
        if (lastSignature === signature) return;
        lastSignature = signature;
        const { ratio, fillW } = ML.computeEnergyFill(current, max);
        fill.clear();
        if (fillW > 0) {
          const color = ratio > 0.6
            ? DESIGN.colors.energy.high
            : (ratio > 0.3 ? DESIGN.colors.energy.medium : DESIGN.colors.energy.low);
          fill.fillStyle(color, 0.95);
          fill.fillRoundedRect(x + s(2), y + s(2), Math.max(s(4), s(fillW) - s(4)), h - s(4), Math.max(1, r - s(2)));
        }
        text.setText(`${current}/${max}`);
      },
      destroy: () => {
        track.destroy();
        fill.destroy();
        text.destroy();
        timer.destroy();
      }
    };
    this.energyTimerText = timer;

    const status = energySystem.getStatus() || {};
    this.energyBar.update(status?.current ?? 0, status?.max ?? 100);
  }

  /**
   * 재화 아이콘 하나를 놓는다.
   * `icon_currency_*` 생성 아이콘이 매니페스트로 로드돼 있으면 그것을, 없으면
   * IconFactory 벡터 폴백을 쓴다. 어느 쪽이든 시스템 이모지는 쓰지 않는다 (§2-2).
   *
   * @param {number} x 렌더 x
   * @param {number} y 렌더 y
   * @param {'gold'|'gem'|'energy'} kind
   * @param {number} sizeBase base px 높이
   * @param {number} depth
   * @returns {Phaser.GameObjects.Image}
   */
  _currencyIcon(x, y, kind, sizeBase, depth) {
    const key = `icon_currency_${kind}`;
    const px = s(sizeBase);
    if (this.textures.exists(key)) {
      const src = this.textures.get(key).getSourceImage();
      const ratio = src && src.height ? src.width / src.height : 1;
      return this.add.image(x, y, key).setDisplaySize(px * ratio, px).setDepth(depth);
    }
    const vectorKey = IconFactory.createCurrencyIcon(this, kind, px);
    return this.add.image(x, y, vectorKey).setDepth(depth);
  }

  /**
   * 파티 패널 (§3-1: 20,88 - 700,236).
   *
   * 빈 슬롯은 `???` 가 아니라 점선 테두리 + "동료 없음" 이다
   * (UX_ONBOARDING_FLOW §2-7 — 미획득과 미편성을 같은 그림으로 보여주지 않는다).
   */
  createPartyDisplay() {
    const saveData = SaveManager.load();
    const parties = saveData?.parties || [];
    const rawParty = parties[0];
    const partyIds = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const characters = saveData?.characters || [];

    const panel = ML.MAIN_LAYOUT.party;
    GlassPanel.create(this, {
      x: s(panel.x + panel.w / 2),
      y: s(panel.y + panel.h / 2),
      w: s(panel.w),
      h: s(panel.h),
      variant: GLASS_VARIANT.PANEL,
      tint: this._accent.color,
      bgKey: this._bgKey,
      depth: Z_INDEX.PANELS
    });

    const header = ML.computePartyHeader();
    this.add.text(s(header.title.x), s(header.title.y), '내 파티',
      ts('subtitle', { color: DESIGN.colors.text.primary })).setDepth(Z_INDEX.PANEL_CONTENT);

    // 편성 버튼 — §3-1 대로 오른쪽 끝에서 당겨 우상단 UI 와 겹치지 않게 한다
    const pill = header.editPill;
    const editGfx = this.add.graphics().setDepth(Z_INDEX.PANEL_BUTTONS);
    editGfx.fillStyle(this._accent.color, 0.22);
    editGfx.fillRoundedRect(s(pill.x - pill.w / 2), s(pill.y - pill.h / 2), s(pill.w), s(pill.h), s(pill.h / 2));
    editGfx.lineStyle(s(1), this._accent.color, 0.8);
    editGfx.strokeRoundedRect(s(pill.x - pill.w / 2), s(pill.y - pill.h / 2), s(pill.w), s(pill.h), s(pill.h / 2));
    this.add.text(s(pill.x), s(pill.y), '편성 ▸',
      ts('label', { color: ML.toCss(this._accent.color) })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_BUTTONS + 1);
    const editHit = this.add.rectangle(s(header.editHit.x), s(header.editHit.y), s(header.editHit.w), s(header.editHit.h))
      .setAlpha(0.001).setDepth(Z_INDEX.PANEL_BUTTONS + 2).setInteractive({ useHandCursor: true });
    editHit.on('pointerdown', () => this.openPopup('partyedit'));

    const slots = ML.computePartySlots();
    slots.forEach((slot, i) => {
      const heroId = partyIds[i];
      const x = s(slot.x);
      const y = s(slot.y);
      const r = s(slot.r);

      if (!heroId) {
        this._drawEmptyPartySlot(x, y, r, slot);
        return;
      }

      const charData = characters.find((c) => c.id === heroId || c.characterId === heroId);
      const staticData = getCharacter(heroId);
      const fullData = getCharacterOrHero(heroId) || staticData || charData;
      const ringColor = fullData?.cult ? ML.resolveAccentColor(fullData.cult) : this._accent.color;

      const portraitKey = HeroAssetLoader.ensureTexture(this, fullData) || `hero_${heroId}`;
      if (this.textures.exists(portraitKey)) {
        const maskGfx = this.make.graphics({ x: 0, y: 0 });
        maskGfx.fillCircle(x, y, r);
        const img = this.add.image(x, y, portraitKey).setDisplaySize(r * 2, r * 2)
          .setDepth(Z_INDEX.PANEL_CONTENT);
        img.setMask(maskGfx.createGeometryMask());
      } else {
        this.add.circle(x, y, r, ringColor, 0.28).setDepth(Z_INDEX.PANEL_CONTENT);
        IconFactory.createImage(this, x, y, fullData?.class || 'warrior', s(DESIGN.icon.md), { tint: ringColor })
          ?.setDepth(Z_INDEX.PANEL_CONTENT + 1);
      }
      const hit = this.add.circle(x, y, Math.max(r, s(24)), 0x000000, 0.001)
        .setDepth(Z_INDEX.PANEL_CONTENT + 2).setInteractive({ useHandCursor: true });

      // 교단색 링 — 슬롯마다 그 영웅의 교단이 드러난다
      const ring = this.add.graphics().setDepth(Z_INDEX.PANEL_CONTENT + 1);
      ring.lineStyle(s(2), ringColor, 0.9);
      ring.strokeCircle(x, y, r + s(2));

      // QA P2-6: `substring(0, 5)` 는 `번개의 아이리스`를 `번개의 아`로 음절 중간에서 잘랐다.
      // 어절 단위 말줄임으로 바꾸고, 그래도 슬롯 폭을 넘으면 폰트를 한 단계 줄인다.
      const rawName = staticData?.name || fullData?.name || charData?.name || '???';
      const nameText = this.add.text(x, s(slot.nameY), ML.fitPartySlotName(rawName),
        ts('caption', { color: DESIGN.colors.text.primary })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);
      this._shrinkTextToWidth(nameText, s(slot.nameMaxWidth));
      this.add.text(x, s(slot.levelY), `Lv.${charData?.level || 1}`,
        ts('num.sm', { color: DESIGN.colors.text.secondary })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);

      hit.on('pointerdown', () => this.openHeroInfo(heroId));
      hit.on('pointerover', () => ring.setAlpha(0.6));
      hit.on('pointerout', () => ring.setAlpha(1));
    });
  }

  /**
   * 서체 폴백 등으로 라벨이 예상보다 넓으면 폰트를 한 단계씩 줄여 폭 안에 넣는다.
   * 말줄임(`fitPartySlotName`)만으로는 글자수만 통제되고 실제 픽셀 폭은 통제되지 않는다.
   *
   * @param {Phaser.GameObjects.Text} textObj
   * @param {number} maxWidth 렌더 px
   * @param {number} [minFontPx=s(9)] 이 아래로는 줄이지 않는다
   */
  _shrinkTextToWidth(textObj, maxWidth, minFontPx = s(9)) {
    if (!textObj || !Number.isFinite(maxWidth) || maxWidth <= 0) return textObj;
    let guard = 0;
    while (textObj.width > maxWidth && guard < 8) {
      const current = parseFloat(textObj.style.fontSize);
      if (!Number.isFinite(current) || current <= minFontPx) break;
      textObj.setFontSize(Math.max(minFontPx, current - 1));
      guard += 1;
    }
    return textObj;
  }

  /**
   * 빈 파티 슬롯 — 점선 원 + "동료 없음". 탭하면 편성 팝업으로 간다.
   * @param {number} x 렌더 x
   * @param {number} y 렌더 y
   * @param {number} r 렌더 반지름
   * @param {Object} slot computePartySlots() 항목
   */
  _drawEmptyPartySlot(x, y, r, slot) {
    const gfx = this.add.graphics().setDepth(Z_INDEX.PANEL_CONTENT);
    gfx.lineStyle(s(2), 0x64748B, 0.55);
    const segments = 16;
    for (let i = 0; i < segments; i += 2) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      gfx.beginPath();
      gfx.arc(x, y, r, a0, a1);
      gfx.strokePath();
    }
    this.add.text(x, y, '+', ts('title', { color: DESIGN.colors.text.muted })).setOrigin(0.5)
      .setDepth(Z_INDEX.PANEL_CONTENT + 1);
    const emptyLabel = this.add.text(x, s(slot.nameY), '동료 없음',
      ts('caption', { color: DESIGN.colors.text.muted })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);
    this._shrinkTextToWidth(emptyLabel, s(slot.nameMaxWidth));

    const hit = this.add.circle(x, y, Math.max(r, s(24)), 0x000000, 0.001)
      .setDepth(Z_INDEX.PANEL_CONTENT + 2).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.openPopup('partyedit'));
  }

  /**
   * 전투력 바 (§3-1: 20,244 - 700,304).
   */
  createCombatPowerDisplay() {
    const saveData = SaveManager.load();
    const power = this.calculateCombatPower(saveData);
    const difficulty = this.getDifficulty(power);
    const row = ML.computePowerRow();

    GlassPanel.create(this, {
      x: s(row.panel.x + row.panel.w / 2),
      y: s(row.panel.y + row.panel.h / 2),
      w: s(row.panel.w),
      h: s(row.panel.h),
      variant: GLASS_VARIANT.CARD,
      bgKey: this._bgKey,
      depth: Z_INDEX.PANELS
    });

    IconFactory.createImage(this, s(row.icon.x), s(row.icon.y), 'atk', s(row.icon.size), {
      tint: DESIGN.colors.brand.accent
    })?.setDepth(Z_INDEX.PANEL_CONTENT);

    this.add.text(s(row.label.x), s(row.label.y), '전투력',
      ts('label', { color: DESIGN.colors.text.secondary })).setOrigin(0, 0.5).setDepth(Z_INDEX.PANEL_CONTENT);

    // update()/refreshAfterPopup() 이 갱신하는 값. 고정폭 서체라 갱신해도 좌우로 흔들리지 않는다
    this.powerText = this.add.text(s(row.value.x), s(row.value.y), Math.floor(power).toLocaleString(),
      ts('num.lg', { color: ML.toCss(DESIGN.colors.brand.accent) })).setOrigin(0, 0.5).setDepth(Z_INDEX.PANEL_CONTENT);

    const diffColors = {
      '쉬움': DESIGN.colors.status.success,
      '보통': DESIGN.colors.status.info,
      '어려움': DESIGN.colors.status.warning,
      '매우어려움': DESIGN.colors.status.error,
      '극한': DESIGN.colors.cult.yomi
    };
    const badgeColor = diffColors[difficulty.label] || DESIGN.colors.status.info;
    const badge = this.add.graphics().setDepth(Z_INDEX.PANEL_CONTENT);
    badge.fillStyle(badgeColor, 0.22);
    badge.fillRoundedRect(s(row.badge.x - row.badge.w / 2), s(row.badge.y - row.badge.h / 2),
      s(row.badge.w), s(row.badge.h), s(row.badge.h / 2));
    badge.lineStyle(s(1), badgeColor, 0.9);
    badge.strokeRoundedRect(s(row.badge.x - row.badge.w / 2), s(row.badge.y - row.badge.h / 2),
      s(row.badge.w), s(row.badge.h), s(row.badge.h / 2));
    this.add.text(s(row.badge.x), s(row.badge.y), difficulty.label,
      ts('label', { color: ML.toCss(badgeColor) })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT + 1);
  }

  /**
   * Calculate party combat power from save data
   */
  calculateCombatPower(saveData) {
    const parties = saveData?.parties || [];
    const rawParty = parties[0];
    const partyIds = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const characters = saveData?.characters || [];

    let totalPower = 0;
    partyIds.forEach(heroId => {
      const charData = characters.find(c => c.id === heroId || c.characterId === heroId);
      if (!charData) return;
      try {
        totalPower += ProgressionSystem.calculatePower({
          ...charData,
          characterId: heroId,
          skillLevels: charData.skillLevels || [1, 1]
        });
      } catch (e) {
        // Fallback
        const stats = charData.stats || {};
        totalPower += Math.floor((stats.hp || 0) / 10 + (stats.atk || 0) + (stats.def || 0) + (stats.spd || 0));
      }
    });
    return totalPower || 400;
  }

  /**
   * Get difficulty label based on combat power vs recommended power
   */
  getDifficulty(power) {
    const currentStage = this.idleSystem.getCurrentStage();
    const chapter = currentStage.chapter || 1;
    const stage = currentStage.stage || 1;
    const recommended = chapter * 500 + stage * 100;

    const ratio = power / recommended;
    if (ratio >= 2.0) return { label: '쉬움', color: 0x10B981 };
    if (ratio >= 1.3) return { label: '보통', color: 0x3B82F6 };
    if (ratio >= 0.8) return { label: '어려움', color: 0xF59E0B };
    if (ratio >= 0.5) return { label: '매우어려움', color: 0xEF4444 };
    return { label: '극한', color: 0x7C3AED };
  }

  /**
   * 현재 모험 패널 (§3-1: 20,312 - 700,500, h=188 고정).
   *
   * 높이를 고정한 것이 §1-1 "유휴전투 뷰가 패널 위에 겹쳐 그려짐"의 절반이다.
   * 나머지 절반은 createIdleBattleView() 의 클리핑 마스크가 담당한다.
   * 에너지 잔량은 상단바로 올라갔고, 그 자리는 진행도 바가 대신한다.
   */
  createAdventurePanel() {
    const rows = ML.computeAdventureRows();
    const panel = rows.panel;

    GlassPanel.create(this, {
      x: s(panel.x + panel.w / 2),
      y: s(panel.y + panel.h / 2),
      w: s(panel.w),
      h: s(panel.h),
      variant: GLASS_VARIANT.PANEL,
      tint: this._accent.color,
      bgKey: this._bgKey,
      depth: Z_INDEX.PANELS
    });

    const currentStage = this.idleSystem.getCurrentStage();
    const chapter = currentStage.chapter || 1;
    const stage = currentStage.stage || 1;

    IconFactory.createImage(this, s(rows.title.x + 10), s(rows.title.y + 12), 'adventure', s(DESIGN.icon.sm), {
      tint: this._accent.color
    })?.setDepth(Z_INDEX.PANEL_CONTENT);
    this.add.text(s(rows.title.x + 30), s(rows.title.y), '현재 모험',
      ts('subtitle', { color: DESIGN.colors.text.primary })).setDepth(Z_INDEX.PANEL_CONTENT);

    this.add.text(s(rows.caption.x), s(rows.caption.y), `챕터 ${chapter} · ${chapter}-${stage}`,
      ts('num.md', { color: DESIGN.colors.text.secondary })).setOrigin(1, 0).setDepth(Z_INDEX.PANEL_CONTENT);

    this.add.text(s(rows.stage.x), s(rows.stage.y), currentStage.name || '슬라임 평원',
      ts('body', { color: DESIGN.colors.text.secondary })).setDepth(Z_INDEX.PANEL_CONTENT);

    const saveData = SaveManager.load();
    const parties = saveData?.parties || [];
    const rawParty = parties[0];
    const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const partyHeroes = party.map((heroId) => (saveData.characters || []).find((c) => c.id === heroId)).filter(Boolean);
    const hasParty = partyHeroes.length > 0;

    // 온보딩 구간에는 소탕/보스전 대신 단일 CTA만 노출한다 (UX_ONBOARDING_FLOW §2-7).
    // 클리어한 스테이지가 0개인 유저에게 소탕 버튼은 "누르면 실패하는 버튼"이다.
    const tutorialActive = !TutorialManager.isCompleted();
    if (tutorialActive) {
      this._createOnboardingBattleCta(panel.y);
    } else {
      const [sweepSlot, bossSlot] = ML.computeAdventureButtons(false);
      const canSweep = hasParty;

      this._sweepBtnGfx = this._drawPanelButton(sweepSlot, canSweep ? DESIGN.colors.status.success : DESIGN.colors.bg.surface);
      this._sweepBtnText = this._panelButtonLabel(sweepSlot, '소탕', '10', 'energy');
      this._sweepHit = this.add.rectangle(s(sweepSlot.cx), s(sweepSlot.cy), s(sweepSlot.w), s(sweepSlot.h))
        .setAlpha(0.001).setDepth(Z_INDEX.PANEL_BUTTONS + 2);

      // 튜토리얼 하이라이트 대상 — 현재 모험 패널의 1순위 CTA
      TutorialTargetRegistry.register('mainmenu.adventure.sweep', this._sweepHit, 'MainMenuScene');
      TutorialTargetRegistry.register('mainmenu.adventure.battle_start', this._sweepHit, 'MainMenuScene');

      if (canSweep) {
        this._sweepHit.setInteractive({ useHandCursor: true });
        this._sweepHit.on('pointerdown', () => this.performSweep());
      } else {
        this._sweepBtnText.setAlpha(0.5);
      }

      const bossReady = hasParty && this.idleSystem?.isBossReady?.();
      this._bossReady = bossReady;
      this._bossSlot = bossSlot;
      this._bossBtnGfx = this._drawPanelButton(bossSlot, bossReady ? DESIGN.colors.status.error : DESIGN.colors.bg.surface);
      this._bossBtnText = this._panelButtonLabel(bossSlot, '보스전', '20', 'energy');
      this._bossBtnPanelY = panel.y;

      this._bossHit = this.add.rectangle(s(bossSlot.cx), s(bossSlot.cy), s(bossSlot.w), s(bossSlot.h))
        .setAlpha(0.001).setDepth(Z_INDEX.PANEL_BUTTONS + 2);

      TutorialTargetRegistry.register('mainmenu.adventure.boss', this._bossHit, 'MainMenuScene');

      // 보스전 버튼은 항상 인터랙티브 등록 (상태는 update에서 동적 관리)
      this._bossHit.setInteractive({ useHandCursor: true });
      this._bossHit.on('pointerdown', () => {
        if (this._bossReady) {
          this.prepareBossBattle();
        } else {
          this.showToast('진행도 100%가 되어야 보스전에 도전할 수 있습니다!');
        }
      });

      if (!bossReady) this._bossBtnText.setAlpha(0.5);
    }

    this._createAdventureProgress(rows.progress);
  }

  /**
   * 패널 버튼 배경 하나를 그린다. 색만 바꿔 다시 그릴 수 있도록 Graphics 를 돌려준다.
   * @param {{x:number,y:number,w:number,h:number}} slot base 좌표 (좌상단 기준)
   * @param {number} color Phaser hex
   * @param {Phaser.GameObjects.Graphics} [gfx] 재사용할 Graphics
   * @returns {Phaser.GameObjects.Graphics}
   */
  _drawPanelButton(slot, color, gfx = null) {
    const g = gfx || this.add.graphics().setDepth(Z_INDEX.PANEL_BUTTONS);
    g.clear();
    g.fillStyle(color, 0.9);
    g.fillRoundedRect(s(slot.x), s(slot.y), s(slot.w), s(slot.h), s(DESIGN.radius.lg));
    g.lineStyle(s(1), 0xFFFFFF, 0.12);
    g.strokeRoundedRect(s(slot.x), s(slot.y), s(slot.w), s(slot.h), s(DESIGN.radius.lg));

    // 라벨 캡슐 — 흰 라벨이 status.success(초록)·accent 위에서 대비 3:1 아래로 떨어진다.
    // 같은 Graphics 에 이어 그려 오브젝트 수를 늘리지 않는다(상태 변경 시 함께 다시 그려진다)
    const inset = s(LABEL_PLATE.inset);
    const plateW = Math.max(0, s(slot.w) - inset * 2);
    const plateH = Math.max(0, s(slot.h) - inset);
    if (plateW > 0 && plateH > 0) {
      g.fillStyle(DESIGN.colors.bg.primary, LABEL_PLATE.alpha);
      g.fillRoundedRect(
        s(slot.x) + inset, s(slot.y) + inset / 2, plateW, plateH,
        Math.min(plateH / 2, s(DESIGN.radius.md))
      );
    }
    return g;
  }

  /**
   * 패널 버튼 라벨 — 제목 + 비용 수치 2줄. 수치는 고정폭이라 갱신해도 흔들리지 않는다.
   * @param {Object} slot computeAdventureButtons() 항목
   * @param {string} title 버튼 이름
   * @param {string} cost 비용 수치
   * @param {string} iconKey 비용 아이콘 종류
   * @returns {Phaser.GameObjects.Text} 제목 텍스트 (상태 표시용)
   */
  _panelButtonLabel(slot, title, cost, iconKey) {
    const label = this.add.text(s(slot.cx), s(slot.cy - 10), title,
      ts('subtitle', { color: '#FFFFFF' })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_BUTTONS + 1);
    this._currencyIcon(s(slot.cx - 16), s(slot.cy + 14), iconKey, 14, Z_INDEX.PANEL_BUTTONS + 1);
    this.add.text(s(slot.cx + 2), s(slot.cy + 14), cost,
      ts('num.sm', { color: '#FFFFFF' })).setOrigin(0, 0.5).setDepth(Z_INDEX.PANEL_BUTTONS + 1);
    return label;
  }

  /**
   * 보스 진행도 바 (§3-1: y=474). 유휴전투가 쌓은 누적 피해가 곧 진행도다.
   * @param {Object} slot computeAdventureRows().progress
   */
  _createAdventureProgress(slot) {
    const ratio = this._bossProgress();
    const x = s(slot.x);
    const y = s(slot.y);
    const w = s(slot.w);
    const h = s(slot.h);

    const track = this.add.graphics().setDepth(Z_INDEX.PANEL_CONTENT);
    track.fillStyle(DESIGN.colors.bg.primary, 0.7);
    track.fillRoundedRect(x, y, w, h, h / 2);

    this._progressGfx = this.add.graphics().setDepth(Z_INDEX.PANEL_CONTENT + 1);
    this._progressSlot = slot;
    this._progressText = this.add.text(s(slot.textX), y + h / 2, '',
      ts('num.sm', { color: DESIGN.colors.text.secondary })).setOrigin(1, 0.5).setDepth(Z_INDEX.PANEL_CONTENT + 1);
    this._renderProgress(ratio);
  }

  /**
   * 진행도 바를 비율로 다시 그린다.
   * @param {number} ratio 0~1
   */
  _renderProgress(ratio) {
    if (!this._progressGfx || !this._progressSlot) return;
    const slot = this._progressSlot;
    const x = s(slot.x);
    const y = s(slot.y);
    const h = s(slot.h);
    const fillW = s(ML.progressFillWidth(ratio, slot.w));

    this._progressGfx.clear();
    if (fillW > 0) {
      this._progressGfx.fillStyle(this._accent.color, 0.95);
      this._progressGfx.fillRoundedRect(x, y, Math.max(h, fillW), h, h / 2);
    }
    this._progressText?.setText(`${Math.floor(Math.max(0, Math.min(1, ratio)) * 100)}%`);
  }

  /**
   * 현재 보스 진행도 (0~1). 보스 데이터가 없으면 0.
   * @returns {number}
   */
  _bossProgress() {
    const damage = this.idleSystem?.accumulatedDamage ?? 0;
    const hp = this.idleSystem?.currentBossHp ?? 0;
    if (!hp || hp <= 0) return 0;
    return Math.max(0, Math.min(1, damage / hp));
  }

  /**
   * 온보딩 단일 CTA — "▶ 전투 시작" (UX_ONBOARDING_FLOW §2-7)
   * 현재 튜토리얼 스텝이 요구하는 스테이지로 실제 전투를 시작한다.
   * 튜토리얼 완주 유저에게는 그리지 않는다(기존 소탕/보스전 2분할 유지).
   *
   * @param {number} _panelY 모험 패널 상단 (base px). 좌표는 mainMenuLayout 이 정한다
   */
  _createOnboardingBattleCta(_panelY) {
    const [slot] = ML.computeAdventureButtons(true);
    const stageId = this._onboardingStageId();

    this._drawPanelButton(slot, this._accent.color);

    this._onboardingCtaText = this.add.text(s(slot.cx), s(slot.cy), `▶ 전투 시작 (${stageId})`,
      ts('title', { color: '#FFFFFF' })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_BUTTONS + 1);

    const hit = this.add.rectangle(s(slot.cx), s(slot.cy), s(slot.w), s(slot.h))
      .setAlpha(0.001).setDepth(Z_INDEX.PANEL_BUTTONS + 2).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.startOnboardingBattle());

    // T-03/T-04/T-10/T-11 하이라이트 대상
    TutorialTargetRegistry.register('mainmenu.adventure.battle_start', hit, 'MainMenuScene');
    this._onboardingCtaHit = hit;
  }

  /** 지금 도전해야 할 스테이지 ID — 현재 튜토리얼 스텝의 완료 조건에서 도출한다 */
  _onboardingStageId() {
    const cleared = SaveManager.load()?.progress?.clearedStages || {};
    const isCleared = (id) => cleared[id] !== undefined && cleared[id] !== null;

    const cond = TutorialManager.getCurrentStep()?.completionCondition;
    if (cond?.type === 'stage_clear' && cond.stageId && !isCleared(cond.stageId)) return cond.stageId;
    if (cond?.type === 'stage_clear_all') {
      const next = (cond.stageIds || []).find((id) => !isCleared(id));
      if (next) return next;
    }

    for (let i = 1; i <= 5; i++) {
      const id = `1-${i}`;
      if (!isCleared(id)) return id;
    }
    return '1-5';
  }

  /** 세이브의 파티를 전투용 객체 배열로 만든다. 비어 있으면 보유 캐릭터로 자동 채운다(T-08 폴백). */
  _buildOnboardingParty() {
    const saveData = SaveManager.load();
    const rawParty = (saveData?.parties || [])[0];
    let heroIds = (rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []) || []).filter(Boolean);

    // T-08 폴백: 슬롯이 비어 있으면 보유 캐릭터로 4인까지 자동으로 채운다.
    // (UX_ONBOARDING_FLOW §2-3 "미편성 상태로 진입 시 파티 자동 채움 — 진행 차단 금지")
    if (heroIds.length < 4) {
      const owned = (saveData?.characters || []).map((c) => c.id).filter(Boolean);
      const filled = [...heroIds];
      owned.forEach((id) => {
        if (filled.length < 4 && !filled.includes(id)) filled.push(id);
      });
      const changed = filled.length !== heroIds.length;
      heroIds = filled;
      if (changed && heroIds.length > 0) {
        const parties = saveData.parties || [];
        parties[0] = [...heroIds, null, null, null].slice(0, 4);
        saveData.parties = parties;
        SaveManager.save(saveData);
        this.showToast('파티를 자동으로 편성했습니다');
      }
    }

    // 전투에 넘기는 영웅은 다른 진입 경로(StageSelectScene)와 동일한 소스를 쓴다.
    // StageSelectScene 은 registry.ownedHeroes(정규화 완료본)를 쓰므로 그것을 우선하고,
    // 없을 때만 세이브를 정규화한다. 정규화를 건너뛰면 mood 가 'neutral' 로 남아
    // 전투 중 분위기 상성 계산이 실패한다.
    const registryHeroes = this.registry.get('ownedHeroes');
    const normalized = (Array.isArray(registryHeroes) && registryHeroes.length > 0)
      ? registryHeroes
      : (normalizeHeroes(saveData?.characters || []) || []);

    return heroIds.map((id) => {
      const hero = normalized.find((h) => h.id === id || h.characterId === id);
      if (hero) return hero;

      const charData = (saveData?.characters || []).find((c) => c.id === id || c.characterId === id);
      const staticData = getCharacterOrHero(id);
      if (!charData && !staticData) return null;
      return normalizeHeroes([{ ...staticData, ...charData, id }])[0] || null;
    }).filter(Boolean);
  }

  /**
   * 온보딩 CTA 진입 — StageSelectScene.startBattle()과 동일한 계약
   * (에너지 차감 → chapter_enter/stage_enter 컷씬 → 전투 진입)
   */
  startOnboardingBattle() {
    const stageId = this._onboardingStageId();
    const chapterNum = parseInt(stageId.split('-')[0], 10) || 1;
    const chapterId = `chapter_${chapterNum}`;
    const stage = getStage(chapterId, stageId);
    if (!stage) {
      this.showToast('스테이지 정보를 찾을 수 없습니다');
      return;
    }

    const party = this._buildOnboardingParty();
    if (party.length === 0) {
      this.showToast('파티를 먼저 편성해주세요!');
      return;
    }

    const cost = energySystem.getStageCost(stage.type || 'NORMAL');
    const consumed = energySystem.consumeEnergy(cost);
    if (!consumed.success) {
      this.showToast(`에너지가 부족합니다! (필요: ${cost}🔋)`);
      return;
    }

    this.registry.set('currentTeam', party);

    // 메인 메뉴는 네비게이션 루트다. 여기서 CTA를 누른 시점에 진행 중인 전환은 있을 수 없으므로,
    // 이전 전환이 중간에 끊겨 isTransitioning 이 잠긴 경우를 풀어 준다.
    // (잠긴 채로 두면 battleEntryTransition 이 조용히 무시되어 전투가 시작되지 않는다)
    transitionManager.reset?.();
    console.log('[MainMenu] 온보딩 전투 시작', stageId,
      party.map((h) => `${h.id}:Lv${h.level || 1}`).join(','));

    const triggers = stageId.endsWith('-1') ? ['chapter_enter', 'stage_enter'] : ['stage_enter'];
    StoryManager.triggerSequence(triggers, {
      scene: this,
      stageId,
      chapterId,
      onComplete: () => {
        transitionManager.battleEntryTransition(this, { stage, party });
      }
    });
  }

  /**
   * Prepare boss battle with full party and stage data
   */
  prepareBossBattle() {
    // 보스전 에너지 소모 (20)
    const energyResult = energySystem.consumeEnergy(20);
    if (!energyResult.success) {
      this.showToast('에너지가 부족합니다! (필요: 20🔋)');
      return;
    }

    const currentStage = this.idleSystem.getCurrentStage();
    const chapterId = `chapter_${currentStage.chapter || 1}`;

    // 현재 챕터의 보스 스테이지 찾기
    const chapterStages = getChapterStages(chapterId) || [];
    const bossStage = chapterStages.find(s => s.isBoss);
    const stage = bossStage || getStage(chapterId, `${currentStage.chapter || 1}-${currentStage.stage || 1}`);

    // 파티 로드
    const saveData = SaveManager.load();
    const parties = saveData?.parties || [];
    const rawParty = parties[0];
    const heroIds = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const party = heroIds.map(id => {
      const charData = (saveData?.characters || []).find(c => c.id === id || c.characterId === id);
      const staticData = getCharacter(id);
      if (!charData && !staticData) return null;
      return { ...staticData, ...charData, id, stats: staticData?.stats || charData?.stats };
    }).filter(Boolean);

    if (party.length === 0) {
      this.showToast('파티를 먼저 편성해주세요!');
      return;
    }

    transitionManager.slideTransition(this, 'BattleScene', {
      stage: stage || { id: stageId, name: `스테이지 ${stageId}`, enemies: [], rewards: { gold: 200, exp: 100 } },
      party,
      mode: 'boss'
    }, 'right');
  }

  /**
   * Perform sweep (auto-clear) of current stage
   */
  chargeEnergyWithGems() {
    const saveData = SaveManager.load();
    if (!saveData) return;
    const gems = saveData.resources?.gems ?? 0;

    if (gems < 50) {
      this.showToast('보석이 부족합니다! (필요: 50💎)');
      return;
    }

    const result = energySystem.chargeWithGems(saveData.resources);
    if (result.success) {
      SaveManager.save(saveData);
      this.registry.set('gems', saveData.resources.gems);
      this.showToast(`에너지 충전! +${result.energyGained}🔋 (-${result.gemsSpent}💎)`);
    } else {
      this.showToast(result.message || '충전 실패');
    }
  }

  performSweep() {
    // EnergySystem을 통한 에너지 소모 (시간 회복 자동 적용)
    const result = energySystem.consumeEnergy(10);
    if (!result.success) {
      this.showToast('에너지가 부족합니다!');
      return;
    }

    // 이전 단계의 예상 클리어 시간 기반 보상 계산
    const sweepRewards = this.idleSystem.calculateSweepRewards();
    const goldReward = sweepRewards.gold;
    const expReward = sweepRewards.exp;

    const data = SaveManager.load();
    if (data) {
      data.resources.gold = (data.resources.gold || 0) + goldReward;
      data.statistics = data.statistics || {};
      data.statistics.totalGoldEarned = (data.statistics.totalGoldEarned || 0) + goldReward;
      SaveManager.save(data);

      this.registry.set('gold', data.resources.gold);
      this.registry.set('gems', data.resources.gems);
    }

    // 보상 팝업 표시
    const currentStage = this.idleSystem.getCurrentStage();
    const stageName = `${currentStage.chapter}-${currentStage.stage}`;
    const modal = new Modal(this, {
      title: '⚡ 소탕 완료!',
      message: `📍 스테이지 ${stageName}\n⏱ 예상 클리어: ${sweepRewards.estimatedTime}초\n\n💰 골드: +${goldReward.toLocaleString()}\n✨ 경험치: +${expReward.toLocaleString()} EXP\n🔋 에너지: -10`,
      buttons: [
        { text: '확인', style: 'primary', callback: () => {
          modal.close();
          this.scene.restart();
        }}
      ]
    });
  }

  /**
   * 유휴전투 관측창 (§3-1: y=508~896 전용 대역).
   *
   * §1-1 의 최상위 결함은 이 뷰가 모험 패널 위에 겹쳐 그려지는 것이었다. 원인은
   * 뷰의 그리기 영역이 대역 밖으로 나가도 아무도 막지 않았다는 것이다. 그래서
   * 대역 사각형으로 **지오메트리 마스크**를 만들어 뷰와 장식을 함께 자른다.
   * 그러면 어떤 연출(데미지 텍스트·슬라이드 인)도 대역 밖으로 1px 도 나가지 않는다.
   *
   * 뷰의 자체 배경(chrome)은 끄고 글래스 관측창이 그 자리를 대신한다. 창 뒤에는
   * 대표 영웅의 전신 시트가 서 있다 — 이 화면에서 기억에 남는 한 가지다.
   */
  createIdleBattleView() {
    const { band, clip, view } = ML.computeIdleBand();

    // 관측창 표면
    this.idleWindow = GlassPanel.create(this, {
      x: s(band.x + band.w / 2),
      y: s(band.y + band.h / 2),
      w: s(band.w),
      h: s(band.h),
      variant: GLASS_VARIANT.PANEL,
      tint: this._accent.color,
      bgKey: this._bgKey,
      depth: Z_INDEX.IDLE_BATTLE - 4
    });

    // 클리핑 마스크 — 이 대역 밖으로는 아무 것도 그려지지 않는다
    const maskGfx = this.make.graphics({ x: 0, y: 0 });
    maskGfx.fillStyle(0xFFFFFF, 1);
    maskGfx.fillRoundedRect(s(clip.x), s(clip.y), s(clip.w), s(clip.h), s(DESIGN.radius.lg));
    this._idleMaskGfx = maskGfx;
    const mask = maskGfx.createGeometryMask();
    this._idleMask = mask;

    // 명상 성소 뷰. 속성 이름(idleBattleView)은 호출부 계약이라 그대로 둔다 —
    // 바뀐 것은 표현뿐이고 진행도·보상은 여전히 IdleProgressSystem 이 계산한다.
    this.idleBattleView = new MeditationView(
      this, s(view.cx), s(view.cy), s(view.w), s(view.h), { chrome: false }
    );
    this.idleBattleView.setDepth(Z_INDEX.IDLE_BATTLE);
    this.idleBattleView.setMask(mask);

    // T-12 스포트라이트 대상.
    // 컨테이너 대신 대역 사각형을 등록한다. 컨테이너의 getBounds() 는 마스크를 모르기
    // 때문에 잘려 나간 부분까지 포함해 코치마크 홀이 대역보다 커진다.
    this._idleTarget = this.add.rectangle(
      s(band.x + band.w / 2), s(band.y + band.h / 2), s(band.w), s(band.h)
    ).setAlpha(0.001).setDepth(Z_INDEX.IDLE_BATTLE - 5);
    TutorialTargetRegistry.register('mainmenu.idle.view', this._idleTarget, 'MainMenuScene');

    const currentStage = this.idleSystem.getCurrentStage();
    this.idleBattleView.updateStageInfo(currentStage.chapter || 1, currentStage.stage || 1, currentStage.name || '슬라임 평원');

    const saveData = SaveManager.load();
    const parties = saveData.parties || [];
    const rawParty = parties[0];
    const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const partyHeroes = this._enrichPartyHeroes(party, saveData);

    // Check if party is empty
    const hasParty = partyHeroes.length > 0;

    if (hasParty) {
      this.idleBattleView.updateParty(partyHeroes);
      // 보스 로드 + 표시
      this.idleSystem.loadCurrentBoss();
      if (this.idleSystem.currentBossData) {
        // 오프라인 복귀 시 0 에서 채우는 연출을 건너뛰고 마지막 상태로 즉시 스냅한다
        this.idleBattleView.showBoss(this.idleSystem.currentBossData, {
          accumulatedDamage: this.idleSystem.accumulatedDamage || 0
        });
      }
      this.idleBattleView.startBattleCycle();

      // 보스전 복귀 처리
      if (this.bossVictory) {
        this.idleSystem.advanceStage();
        const newStage = this.idleSystem.getCurrentStage();
        this.idleBattleView.updateStageInfo(newStage.chapter, newStage.stage, newStage.name);
        this.idleBattleView.showStageClear();
        this.showToast(`챕터 ${newStage.chapter}-${newStage.stage} 진출!`);
        // 2초 후 다음 보스 등장
        this.time.delayedCall(2000, () => {
          if (this.idleSystem && this.idleBattleView) {
            this.idleSystem.loadCurrentBoss();
            if (this.idleSystem.currentBossData) {
              this.idleBattleView.showNextBoss(this.idleSystem.currentBossData);
            }
          }
        });
      } else if (this.bossDefeat) {
        // 패배: 진행도 100% 유지, 재도전 가능
        this.showToast('보스전 패배... 다시 도전하세요!');
      }
    } else {
      // Show empty party message
      this.idleBattleView.showEmptyPartyMessage();
    }
  }

  /**
   * 세이브의 파티 id 를 정적 데이터(클래스·교단·분위기)로 보강한다.
   * 유휴전투 뷰가 클래스 아이콘과 분위기 색을 쓰려면 이 정보가 필요하다.
   *
   * @param {Array<string>} heroIds
   * @param {object} saveData
   * @returns {Array<object>}
   */
  _enrichPartyHeroes(heroIds, saveData) {
    const characters = saveData?.characters || [];
    return (heroIds || []).map((id) => {
      const charData = characters.find((c) => c.id === id);
      if (!charData) return null;
      const staticData = getCharacterOrHero(id) || getCharacter(id) || {};
      return {
        ...staticData,
        ...charData,
        id,
        class: charData.class || staticData.class || staticData.baseClass || 'warrior',
        cult: charData.cult || staticData.cult || staticData.cultId || null,
        mood: charData.mood || staticData.mood || staticData.baseMood || null
      };
    }).filter(Boolean);
  }

  /**
   * 수익 요약 (§3-1: 20,904 - 700,956) + 보상받기 버튼.
   */
  createIdleSummary() {
    const panel = ML.MAIN_LAYOUT.summary;

    const surface = GlassPanel.create(this, {
      x: s(panel.x + panel.w / 2),
      y: s(panel.y + panel.h / 2),
      w: s(panel.w),
      h: s(panel.h),
      variant: GLASS_VARIANT.CARD,
      bgKey: this._bgKey,
      depth: Z_INDEX.CLAIM_BUTTON - 1
    });

    // T-12 스포트라이트 2번째 대상 (오프라인 보상 예고)
    const summaryTarget = this.add.rectangle(
      s(panel.x + panel.w / 2), s(panel.y + panel.h / 2), s(panel.w), s(panel.h)
    ).setAlpha(0.001).setDepth(Z_INDEX.CLAIM_BUTTON - 2);
    this._summaryTarget = summaryTarget;
    this._summarySurface = surface;
    TutorialTargetRegistry.register('mainmenu.adventure.offline_notice', summaryTarget, 'MainMenuScene');

    const partyPower = this.idleSystem.getPartyPower();
    const rates = this.idleSystem.getIdleBattleRate(partyPower);
    const goldPerHour = Math.floor((rates.goldPerSec || 0) * 3600);
    const expPerHour = Math.floor((rates.expPerSec || 0) * 3600);
    const currentStage = this.idleSystem.getCurrentStage();

    const cells = ML.computeSummaryCells();
    const values = {
      gold: `${goldPerHour.toLocaleString()}/h`,
      exp: `${expPerHour.toLocaleString()}/h`,
      stage: `${currentStage.chapter || 1}-${currentStage.stage || 1}`
    };
    const colors = {
      gold: ML.toCss(DESIGN.colors.brand.accent),
      exp: ML.toCss(DESIGN.colors.status.success),
      stage: DESIGN.colors.text.secondary
    };
    const icons = { gold: 'gold', exp: null, stage: null };
    const vectorIcons = { exp: 'ascension', stage: 'adventure' };

    cells.forEach((cell) => {
      if (icons[cell.key]) {
        this._currencyIcon(s(cell.iconX), s(cell.y), icons[cell.key], 18, Z_INDEX.CLAIM_BUTTON);
      } else {
        IconFactory.createImage(this, s(cell.iconX), s(cell.y), vectorIcons[cell.key], s(18), {
          tint: cell.key === 'exp' ? DESIGN.colors.status.success : this._accent.color
        })?.setDepth(Z_INDEX.CLAIM_BUTTON);
      }
      this.add.text(s(cell.x), s(cell.y), values[cell.key],
        ts('num.md', { color: colors[cell.key] })).setOrigin(0, 0.5).setDepth(Z_INDEX.CLAIM_BUTTON);
    });

    // === 보상받기 버튼 ===
    this._createClaimRewardsButton();
  }

  /**
   * 누적 보상 수령 버튼 (§3-1: 208,964 304x60).
   * 원색 #22C55E 하드코딩을 걷어내고 `btn_primary` 9-slice + 골드 텍스트로 바꿨다 (§2-2).
   */
  _createClaimRewardsButton() {
    const { rect, center } = ML.computeClaimButton();

    // `btn_primary` 는 밝은 중앙부를 가진 장식 배너라 그 위에 올린 글자가 읽히지 않는다.
    // 그래서 골드 알약을 직접 그리고 글자를 배경색으로 반전한다. 원색 #22C55E 하드코딩을
    // 걷어낸다는 §2-2 의 목적은 그대로 지키면서 가독성을 확보한다.
    const gold = DESIGN.colors.brand.accent;
    const gfx = this.add.graphics().setDepth(Z_INDEX.CLAIM_BUTTON);
    gfx.fillStyle(gold, 0.95);
    gfx.fillRoundedRect(s(rect.x), s(rect.y), s(rect.w), s(rect.h), s(rect.h / 2));
    gfx.lineStyle(s(2), 0xFFFFFF, 0.25);
    gfx.strokeRoundedRect(s(rect.x), s(rect.y), s(rect.w), s(rect.h), s(rect.h / 2));
    this._claimBtnGfx = gfx;

    IconFactory.createImage(this, s(center.x - 74), s(center.y), 'quest', s(DESIGN.icon.sm), {
      tint: DESIGN.colors.bg.primary
    })?.setDepth(Z_INDEX.CLAIM_BUTTON + 1);

    this._claimRewardText = this.add.text(s(center.x + 14), s(center.y), '보상받기',
      ts('subtitle', { color: ML.toCss(DESIGN.colors.bg.primary) }))
      .setOrigin(0.5).setDepth(Z_INDEX.CLAIM_BUTTON + 1);

    this._claimBtnHit = this.add.rectangle(s(center.x), s(center.y), s(rect.w), s(rect.h))
      .setAlpha(0.001).setDepth(Z_INDEX.CLAIM_BUTTON + 2).setInteractive({ useHandCursor: true });

    this._claimBtnHit.on('pointerdown', () => this._onClaimRewards());
    this._claimBtnHit.on('pointerover', () => this._claimBtnGfx?.setAlpha(0.82));
    this._claimBtnHit.on('pointerout', () => this._claimBtnGfx?.setAlpha(1));
  }

  /**
   * 보상 수령 처리 — 버튼 누를 때 누적 보상 + 현재 진행도 합산 계산
   */
  _onClaimRewards() {
    if (!this.idleSystem) return;

    // 누적 보상 + 현재 진행도를 합산하여 최종 보상 계산 후 수령
    const rewards = this.idleSystem.claimRewards();
    if (!rewards.hasRewards) {
      this.showToast('누적된 보상이 없습니다.');
      return;
    }

    // 골드/경험치 적용
    const currentGold = this.registry.get('gold') ?? 0;
    this.registry.set('gold', currentGold + rewards.gold);
    SaveManager.addGold(rewards.gold);

    // 플레이어 경험치 적용
    if (rewards.exp > 0) {
      const data = SaveManager.load();
      if (data?.player) {
        data.player.exp = (data.player.exp || 0) + rewards.exp;
        SaveManager.save(data);
      }
    }

    // 보상 팝업 표시 (계산 결과 보여줌)
    this._showClaimRewardsPopup(rewards);
  }

  /**
   * 보상 수령 팝업
   */
  _showClaimRewardsPopup(rewards) {
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setInteractive().setDepth(1000);

    const popupW = s(320);
    const popupH = s(200);
    const popupX = GAME_WIDTH / 2 - popupW / 2;
    const popupY = GAME_HEIGHT / 2 - popupH / 2;

    const popupBg = this.add.graphics().setDepth(1001);
    popupBg.fillStyle(0x1E293B, 1);
    popupBg.fillRoundedRect(popupX, popupY, popupW, popupH, s(16));
    popupBg.lineStyle(2, 0x22C55E, 0.8);
    popupBg.strokeRoundedRect(popupX, popupY, popupW, popupH, s(16));

    const title = this.add.text(GAME_WIDTH / 2, popupY + s(30), '🎁 보상 수령 완료!', {
      fontSize: sf(18), fontFamily: '"Noto Sans KR", Arial',
      color: '#22C55E', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(1002);

    const goldText = this.add.text(GAME_WIDTH / 2, popupY + s(75), `💰 골드  +${rewards.gold.toLocaleString()}`, {
      fontSize: sf(16), fontFamily: '"Noto Sans KR", Arial',
      color: '#FBBF24', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(1002);

    const expText = this.add.text(GAME_WIDTH / 2, popupY + s(105), `⭐ 경험치  +${rewards.exp.toLocaleString()}`, {
      fontSize: sf(16), fontFamily: '"Noto Sans KR", Arial',
      color: '#34D399', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(1002);

    const closeBtn = this.add.text(GAME_WIDTH / 2, popupY + s(155), '확인', {
      fontSize: sf(16), fontFamily: '"Noto Sans KR", Arial',
      color: '#FFFFFF', backgroundColor: '#22C55E',
      padding: { x: s(30), y: s(8) }
    }).setOrigin(0.5).setDepth(1002).setInteractive({ useHandCursor: true });

    const popupElements = [overlay, popupBg, title, goldText, expText, closeBtn];

    closeBtn.on('pointerdown', () => {
      popupElements.forEach(el => el.destroy());
    });
    overlay.on('pointerdown', () => {
      popupElements.forEach(el => el.destroy());
    });

    // 자동 닫기 (3초)
    this.time.delayedCall(3000, () => {
      popupElements.forEach(el => { if (el.scene) el.destroy(); });
    });
  }

  /**
   * 메뉴 그리드 (§3-1 + 사용자 피드백 반영).
   *
   * 원형 아이콘 나열에서 **타일**로 바꿨다. 배경 일러스트 위에 아이콘만 떠 있으면
   * 실루엣이 분리되지 않아 "눈에 안 들어온다". 어두운 플레이트로 바닥을 깔고,
   * 아이콘을 icon.xl(64) 로 키우고, 라벨을 body bold + 스트로크로 올린다.
   * 받을 것이 있는 메뉴에는 배지가 붙는다(MenuBadgeRules).
   *
   * 아이콘은 전부 IconFactory 벡터다. popupKey 는 별칭으로 해석되므로
   * herolist → heroes, partyedit → party 로 자동 매핑된다.
   */
  createBottomMenu() {
    const allMenuItems = [
      { label: '소환', popupKey: 'gacha' },
      { label: '영웅', popupKey: 'herolist' },
      { label: '파티', popupKey: 'partyedit' },
      { label: '퀘스트', popupKey: 'quest' },
      { label: '무한탑', popupKey: 'tower' },
      { label: '각인', popupKey: 'ascension' },
      { label: '이벤트', popupKey: 'eventdungeon' },
      { label: '가방', popupKey: 'inventory' },
      { label: '설정', popupKey: 'settings' },
      { label: 'PvP', popupKey: 'pvp' },
      { label: '길드', popupKey: 'guild' },
      { label: '레이드', popupKey: 'raid' },
      { label: '친구', popupKey: 'friends' },
      { label: '도감', popupKey: 'collection' },
    ];

    // T-C7 MenuGridGate: 튜토리얼 진행에서 파생한 해금 목록으로 필터링한다.
    // 잠긴 항목은 자물쇠로 표시하지 않고 아예 그리지 않는다 (UX 문서 §1-2).
    const saveDataForMenu = SaveManager.load();
    const menuItems = MenuGridGate.filterMenuItems(allMenuItems, saveDataForMenu);

    // 0개면 그리드 영역 자체를 그리지 않는다 (신규 유저 첫 화면)
    if (!MenuGridGate.shouldRenderGrid(menuItems.length)) {
      this._menuTiles = {};
      this.refreshMenuBadges();
      return;
    }

    this._menuObjects = [];
    this._menuTiles = {};
    const cols = MenuGridGate.getColumnCount(menuItems.length);
    const grid = ML.computeMenuGrid(menuItems.length, cols);
    const accent = this._accent.color;

    grid.cells.forEach((cell, i) => {
      const item = menuItems[i];
      this._createMenuTile(cell, item, accent);
    });

    this.refreshMenuBadges();
  }

  /**
   * 메뉴 타일 하나. 플레이트 → 아이콘 → 라벨 → 배지 순으로 쌓는다.
   *
   * @param {object} cell computeMenuGrid() 항목
   * @param {{label:string, popupKey:string}} item
   * @param {number} accent 교단 액센트 색
   */
  _createMenuTile(cell, item, accent) {
    const d = Z_INDEX.BOTTOM_MENU;
    const tile = cell.tile;
    const x = s(tile.x);
    const y = s(tile.y);
    const w = s(tile.w);
    const h = s(tile.h);
    const r = s(tile.radius);

    // 1) 플레이트 — 배경 일러스트에서 타일을 떼어 내는 바닥
    const plate = this.add.graphics().setDepth(d);
    const drawPlate = (pressed) => {
      plate.clear();
      plate.fillStyle(DESIGN.colors.bg.surface, pressed ? 0.95 : 0.85);
      plate.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
      plate.lineStyle(s(1), pressed ? accent : 0xFFFFFF, pressed ? 0.9 : 0.22);
      plate.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
    };
    drawPlate(false);

    // 2) 아이콘 — icon.xl. 아래로 짙은 그림자를 한 겹 깔아 실루엣을 분리한다
    const iconPx = s(cell.iconSize);
    const iconY = s(cell.iconY);
    const shadowKey = IconFactory.create(this, item.popupKey, iconPx, { tint: 0x000000 });
    if (shadowKey) {
      this.add.image(x, iconY + s(3), shadowKey).setAlpha(0.55).setDepth(d + 1);
    }
    const icon = IconFactory.createImage(this, x, iconY, item.popupKey, iconPx, {
      tint: DESIGN.colors.text.primary
    });
    icon?.setDepth(d + 2);

    // 3) 라벨 — body(16) bold + 스트로크. 배경이 어떤 밝기든 읽힌다
    const label = this.add.text(x, s(cell.labelY), item.label, ts('body', {
      color: DESIGN.colors.text.primary,
      fontStyle: 'bold',
      stroke: '#0D0F1A',
      strokeThickness: s(2)
    })).setOrigin(0.5).setDepth(d + 2);

    // 4) 히트 영역 — 타일 전체 (base 120x100)
    const hitArea = this.add.rectangle(s(cell.hit.x), s(cell.hit.y), s(cell.hit.w), s(cell.hit.h))
      .setAlpha(0.001).setDepth(d + 4).setInteractive({ useHandCursor: true });

    // 튜토리얼 하이라이트 대상 등록 (TID = mainmenu.menu.{popupKey})
    TutorialTargetRegistry.register(
      `mainmenu.menu.${item.popupKey}`, hitArea, 'MainMenuScene'
    );

    this._menuObjects.push(plate, label, hitArea);
    if (icon) this._menuObjects.push(icon);

    this._menuTiles[item.popupKey] = { cell, icon, label, plate, badge: null };

    hitArea.on('pointerover', () => { drawPlate(true); icon?.setScale(1.06); });
    hitArea.on('pointerout', () => { drawPlate(false); icon?.setScale(1); });
    hitArea.on('pointerdown', () => {
      drawPlate(true);
      icon?.setScale(0.92);
      this.time.delayedCall(100, () => {
        drawPlate(false);
        icon?.setScale(1);
        this.openPopup(item.popupKey);
      });
    });
  }

  /**
   * 배지 계산에 필요한 수치를 시스템에서 모은다.
   *
   * 조회마다 try/catch 를 따로 건다. 한 시스템이 실패해도 나머지 배지는 살아야 하고,
   * 실패한 항목은 아예 넘기지 않아 그 메뉴가 조용히 배지 없이 지나간다.
   * **잘못된 알림보다 없는 알림이 낫다** — 눌러 봤더니 아무것도 없으면 다음부터 무시한다.
   *
   * 비동기 API(FriendSystem 등)와 데이터 원천이 없는 항목(도감 완성 보너스)은 넣지 않는다.
   *
   * @param {object} save
   * @returns {object} computeMenuBadges 의 ctx
   */
  _collectMenuBadgeContext(save) {
    const ctx = {};

    try {
      ctx.claimableQuests = (QuestSystem.getClaimableQuests() || []).length;
    } catch (error) { /* 퀘스트 배지 생략 */ }

    try {
      ctx.ascendableHeroes = (save?.characters || [])
        .filter((c) => c && EvolutionSystem.canEvolve(c.id)?.canEvolve === true).length;
    } catch (error) { /* 각인 배지 생략 */ }

    try {
      // 한 번도 오르지 않은 탑은 "확인해 볼 것"이다
      ctx.towerBossReady = (save?.tower?.highestFloor ?? 0) === 0;
    } catch (error) { /* 무한탑 배지 생략 */ }

    try {
      // getEventProgress() 는 세이브를 쓰므로 부르지 않는다. 세이브를 직접 읽는다
      const cleared = save?.eventDungeons || {};
      ctx.eventStages = (EventDungeonSystem.getActiveEvents() || []).reduce((acc, event) => {
        const stages = event?.stages?.length || 0;
        const done = Object.keys(cleared[event.id]?.clearedStages || {}).length;
        return acc + Math.max(0, stages - done);
      }, 0);
    } catch (error) { /* 이벤트 배지 생략 */ }

    return ctx;
  }

  /**
   * 배지를 다시 계산해 타일 위에 그린다. 타일 자체는 다시 만들지 않는다.
   */
  refreshMenuBadges() {
    if (!this._uiCreated && !this._menuTiles) return;

    let badges = {};
    try {
      const save = SaveManager.load();
      badges = computeMenuBadges(save, this._collectMenuBadgeContext(save));
    } catch (error) {
      console.warn('[MainMenuScene] 메뉴 배지 계산 실패:', error?.message);
    }
    this._menuBadges = badges;

    Object.entries(this._menuTiles || {}).forEach(([key, tile]) => {
      this._renderMenuBadge(tile, badges[key] || null);
    });
    this._renderTopBarAlertDot(summarizeBadges(badges));
  }

  /**
   * 타일 하나의 배지를 그린다. 없으면 지운다.
   * @param {object} tile _menuTiles 항목
   * @param {{type:string,count:number}|null} badge
   */
  _renderMenuBadge(tile, badge) {
    if (tile.badge) {
      tile.badge.objects.forEach((o) => o?.destroy?.());
      tile.badge.glow?.stop?.();
      tile.badge = null;
    }
    if (!badge) return;

    const d = Z_INDEX.BOTTOM_MENU + 3;
    const slot = tile.cell.badge;
    const x = s(slot.x);
    const y = s(slot.y);
    const r = s(slot.r);
    const objects = [];

    if (badge.type === BADGE_TYPE.NEW) {
      // NEW 리본 — 숫자 대신 글자로. "새로 생겼다"는 개수가 중요하지 않다
      const ribbon = this.add.graphics().setDepth(d);
      ribbon.fillStyle(DESIGN.colors.brand.primary, 0.95);
      ribbon.fillRoundedRect(x - s(20), y - s(9), s(40), s(18), s(9));
      const text = this.add.text(x, y, 'NEW',
        ts('num.sm', { color: '#0D0F1A', fontStyle: 'bold' })).setOrigin(0.5).setDepth(d + 1);
      objects.push(ribbon, text);
    } else {
      const isReward = badge.type === BADGE_TYPE.REWARD;
      const color = isReward ? DESIGN.colors.brand.accent : DESIGN.colors.status.error;
      const dot = this.add.circle(x, y, r, color, 1).setDepth(d);
      dot.setStrokeStyle(s(2), DESIGN.colors.bg.primary, 0.9);
      objects.push(dot);

      const label = formatBadgeCount(badge.count);
      if (label) {
        objects.push(this.add.text(x, y, label,
          ts('num.sm', { color: '#0D0F1A', fontStyle: 'bold' })).setOrigin(0.5).setDepth(d + 1));
      }

      // 받을 것이 있으면 아이콘을 골드로 물들이고 배지를 맥동시킨다.
      // 트윈은 배지마다 1개만 쓴다(무대 트윈 예산과 겹치지 않게).
      if (isReward) {
        tile.icon?.setTint(DESIGN.colors.brand.accent);
        const glow = this.tweens.add({
          targets: dot,
          scale: { from: 1, to: 1.25 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
        tile.badge = { objects, glow };
        this._menuObjects.push(...objects);
        return;
      }
    }

    tile.badge = { objects, glow: null };
    this._menuObjects.push(...objects);
  }

  /**
   * 상단바 우측 종합 알림 점. 어느 메뉴든 하나라도 켜져 있으면 보인다.
   * @param {{visible:boolean, hasReward:boolean, total:number}} summary
   */
  _renderTopBarAlertDot(summary) {
    if (!this._topBarAlertDot) return;
    const color = summary.hasReward ? DESIGN.colors.brand.accent : DESIGN.colors.status.error;
    this._topBarAlertDot.setVisible(!!summary.visible);
    this._topBarAlertDot.setFillStyle(color, 1);
  }

  /**
   * 메뉴 해금이 갱신되면 그리드를 다시 그린다.
   * 그리지 않으면 T-06처럼 "방금 열린 메뉴를 눌러라"는 안내의 대상이 화면에 없다.
   */
  refreshBottomMenu() {
    if (!this._uiCreated) return;
    (this._menuObjects || []).forEach((obj) => obj?.destroy?.());
    this._menuObjects = [];
    Object.values(this._menuTiles || {}).forEach((tile) => tile.badge?.glow?.stop?.());
    this._menuTiles = {};
    this.createBottomMenu();
    this.tutorialFlow?.scheduleRefresh(150);
  }

  /**
   * 고아 팝업 컨테이너 정리.
   * PopupBase 는 depth 2000 컨테이너에 전체화면 오버레이(2160x3840, interactive)를 담는다.
   * 어떤 이유로든 파괴되지 않고 남으면 화면 전체 입력을 삼켜 메뉴가 눌리지 않는다.
   * (씬이 일시정지된 사이 hide 트윈이 멈춘 경우 등)
   */
  destroyOrphanPopups() {
    // 살아 있는 팝업은 건드리지 않는다. 화면에 보이지 않는데(alpha 0 / invisible)
    // 파괴되지 않은 컨테이너만 고아로 판정한다.
    // 열려 있는 팝업이 자기 안에서 띄운 중첩 팝업(HeroListPopup → HeroInfoPopup)도 살아 있는 쪽이다.
    const alive = [
      this.activePopup?.container,
      this.activePopup?.heroPopup?.container,
      this.heroPopup?.container
    ].filter(Boolean);
    const orphans = [];

    const walk = (list) => {
      (list || []).forEach((obj) => {
        if (!obj) return;
        if (obj.type === 'Container') {
          // 팝업 레이어(2000~2999) 컨테이너는 activePopup / heroPopup 둘 중 하나여야 한다.
          // 그 외는 파괴에 실패하고 남은 고아이며, 전체화면 오버레이로 입력을 삼킨다.
          const isPopupLayer = obj.depth >= 2000 && obj.depth < 3000;
          if (isPopupLayer && !alive.includes(obj)) {
            orphans.push(obj);
            return;   // 컨테이너째 제거하므로 더 내려갈 필요 없다
          }
          walk(obj.list);
        }
      });
    };

    walk(this.children.list);

    // 소환 결과 오버레이(depth 3010)는 팝업 레이어 밖의 씬 루트에 산다.
    // 팝업이 소유권을 놓고 사라지면 전면 입력을 삼키는 고아가 되므로 여기서 같이 회수한다.
    const overlayOrphans = this.collectOrphanOverlays();

    orphans.forEach((obj) => obj.destroy(true));
    overlayOrphans.forEach((overlay) => {
      // 오버레이는 타이머·트윈·텍스처를 들고 있으므로 컨테이너가 아니라 인스턴스를 파괴한다.
      if (typeof overlay.destroy === 'function') overlay.destroy();
    });

    const total = orphans.length + overlayOrphans.length;
    if (total > 0) {
      console.warn(`[MainMenuScene] 고아 팝업 컨테이너 ${total}개 정리`);
    }
    return total;
  }

  /**
   * 살아 있는 팝업이 소유하지 않은 소환 결과 오버레이를 찾는다.
   *
   * depth 3010 에는 튜토리얼 코치마크도 산다. 그래서 depth 가 아니라 루트 컨테이너 이름
   * (`OVERLAY_ROOT_NAME`)으로 판정하고, 역참조로 오버레이 인스턴스를 되찾는다 (QA P1-3).
   *
   * @returns {Array<Object>} 고아 오버레이 인스턴스 목록
   */
  collectOrphanOverlays() {
    const owned = [this.activePopup?.resultOverlay, this.heroPopup?.resultOverlay].filter(Boolean);
    return (this.children?.list || [])
      .filter((obj) => obj && obj.name === GACHA_OVERLAY_NAME)
      .map((obj) => obj.__gachaResultOverlay)
      .filter((overlay) => overlay && !overlay.destroyed && !owned.includes(overlay));
  }

  /**
   * 영웅 정보 팝업을 연다. 여는 김에 고아 오버레이를 회수한다 —
   * 소환 결과 오버레이가 남아 있으면 이 팝업을 덮어 조작이 불가능해진다 (QA P1-3).
   * @param {string} heroId
   */
  openHeroInfo(heroId) {
    this.destroyOrphanPopups();
    this.heroPopup?.show(heroId);
  }

  openPopup(key) {
    // 이미 열린 팝업이 있으면 무시
    if (this.activePopup) return;

    this.destroyOrphanPopups();

    const popups = {
      gacha: GachaPopup,
      herolist: HeroListPopup,
      partyedit: PartyEditPopup,
      quest: QuestPopup,
      tower: TowerPopup,
      ascension: AscensionPopup,
      eventdungeon: EventDungeonPopup,
      inventory: InventoryPopup,
      settings: SettingsPopup,
      pvp: PvPPopup,
      guild: GuildPopup,
      raid: RaidPopup,
      friends: FriendsPopup,
      collection: CollectionPopup,
      // T-Q4: 도감 '이야기' 탭. 도감에서 진입하지만 다른 경로(복귀 카드 등)에서도 열 수 있다.
      storylog: StoryLogPopup,
    };
    const PopupClass = popups[key];
    if (PopupClass) {
      const popup = new PopupClass(this, {
        onClose: () => {
          this.activePopup = null;
          this.activePopupKey = null;
          this.refreshMenuBadges();
          this.tutorialFlow?.notifyPopupClosed();
          this.refreshAfterPopup();
        }
      });
      this.activePopup = popup;
      // 어떤 팝업이 열려 있는지 TutorialFlow 가 알아야 한다.
      // 스텝과 무관한 팝업 위에 코치마크(depth 3010)를 띄우면 팝업을 뚫고 나온다.
      this.activePopupKey = key;
      popup.show();
      this.markMenuSeen(key);
      this.tutorialFlow?.notifyPopupOpened(key);
    }
  }

  refreshAfterPopup() {
    // 부분 갱신으로 변경: 전체 씬 재시작 대신 필요한 부분만 업데이트
    // scene.restart() 제거 → 깜빡임 없이 부드러운 갱신

    // 1. 자원 표시 갱신 (상단바)
    const resources = SaveManager.getResources() || {};
    this.registry.set('gems', resources?.gems ?? 1500);
    this.registry.set('gold', resources?.gold ?? 10000);

    // 2. 파티 전투력 갱신
    if (this.powerText) {
      const partyPower = this.idleSystem.getPartyPower();
      this.powerText.setText(Math.floor(partyPower).toLocaleString());
    }

    // 3. IdleBattleView 파티 갱신 (파티 편성 변경 시)
    if (this.idleBattleView) {
      const saveData = SaveManager.load();
      const parties = saveData?.parties || [];
      const rawParty = parties[0];
      const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
      const partyHeroes = this._enrichPartyHeroes(party, saveData);

      if (partyHeroes.length > 0) {
        this.idleBattleView.updateParty(partyHeroes);
        // 보스 재로드 (파티 변경 시 DPS 변경)
        this.idleSystem.loadCurrentBoss();
        if (this.idleSystem.currentBossData) {
          this.idleBattleView.showNextBoss(this.idleSystem.currentBossData);
        }
        // 전투 사이클이 멈춰있다면 재시작
        if (!this.idleBattleView.battleCycleTimer && !this.idleBattleView.attackInterval) {
          this.idleBattleView.startBattleCycle();
        }
      }
    }

    // 4. 퀘스트 배지 갱신 (필요 시)
    // TODO: 퀘스트 시스템이 추가되면 배지 갱신 로직 추가
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, s(500), message, {
      fontSize: sf(18),
      fontFamily: '"Noto Sans KR", Arial, sans-serif',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
      padding: { x: s(20), y: s(12) }
    }).setOrigin(0.5).setDepth(Z_INDEX.TOOLTIP);

    this.tweens.add({
      targets: toast,
      y: toast.y - 50,
      alpha: 0,
      duration: 1500,
      delay: 800,
      onComplete: () => toast.destroy()
    });
  }

  update() {
    const gems = this.registry.get('gems') ?? 0;
    const gold = this.registry.get('gold') ?? 0;

    if (this.gemText) this.gemText.setText(gems.toLocaleString());
    if (this.goldText) this.goldText.setText(gold.toLocaleString());

    if (this.energyBar) {
      const es = energySystem.getStatus() || {};
      this.energyBar.update(es?.current ?? 0, es?.max ?? 100);
    }

    if (this.energyTimerText) {
      const timeToRecover = energySystem.getTimeToNextRecovery?.() ?? 0;
      this.energyTimerText.setText(timeToRecover > 0 ? `+1 in ${formatTime(timeToRecover)}` : '');
    }

    // 방치 전투 진행 체크 (샌드백 모드: 데미지 누적 → 진행도 → 보스전)
    if (this.idleSystem) {
      const battleResult = this.idleSystem.updateProgress(this.game.loop.delta);
      if (battleResult && this.idleBattleView) {
        // 데미지 텍스트 + 진행도 바 업데이트
        this.idleBattleView.showDamageText(battleResult.damage);
        this.idleBattleView.updateBossHp(battleResult.accumulatedDamage, battleResult.bossMaxHp);
        this.idleBattleView.updateProgress(battleResult.progress);
        this._renderProgress(battleResult.progress);

        // 진행도 100% → 보스전 준비 알림 + 버튼 동적 활성화
        if (battleResult.bossReady) {
          this.idleBattleView.showBossReady();
          this.showToast('⚔️ 보스전 준비 완료! 보스전 버튼을 눌러주세요.');
        }
      }

      // BUG-12 수정: 보스 버튼 상태를 매 프레임 체크하여 동적 갱신 (재접속 시 즉시 반영)
      const nowBossReady = this.idleSystem.isBossReady?.() || false;
      if (nowBossReady !== this._bossReady) {
        this._bossReady = nowBossReady;
        if (this._bossBtnGfx && this._bossBtnText && this._bossSlot) {
          this._drawPanelButton(
            this._bossSlot,
            nowBossReady ? DESIGN.colors.status.error : DESIGN.colors.bg.surface,
            this._bossBtnGfx
          );
          this._bossBtnText.setAlpha(nowBossReady ? 1 : 0.5);

          // 활성화 시 펄스 애니메이션
          if (nowBossReady && !this._bossPulseTween) {
            this._bossPulseTween = this.tweens.add({
              targets: this._bossBtnText,
              scaleX: { from: 1, to: 1.05 },
              scaleY: { from: 1, to: 1.05 },
              duration: 800,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut'
            });
          } else if (!nowBossReady && this._bossPulseTween) {
            this._bossPulseTween.stop();
            this._bossPulseTween = null;
            this._bossBtnText.setScale(1);
          }
        }
      }
    }
  }
}
