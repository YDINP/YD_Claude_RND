import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, LAYOUT, s, sf } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
import { energySystem } from '../systems/EnergySystem.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import transitionManager from '../utils/TransitionManager.js';
import navigationManager from '../systems/NavigationManager.js';
import { safeGet, safeCall } from '../utils/safeAccess.js';
import { Z_INDEX } from '../config/layoutConfig.js';
import EnergyBar from '../components/EnergyBar.js';
import { Modal } from '../components/Modal.js';
import { formatTime } from '../utils/colorUtils.js';
import { IdleProgressSystem } from '../systems/IdleProgressSystem.js';
import { IdleBattleView } from '../components/IdleBattleView.js';
import { getCharacter, calculatePower, getStage, getChapterStages } from '../data/index.ts';
import { HeroInfoPopup } from '../components/HeroInfoPopup.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
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

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  init(data) {
    this.showOfflineRewards = data?.showOfflineRewards || null;
    this.bossVictory = data?.bossVictory || false;
    this.bossDefeat = data?.bossDefeat || false;
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
      this.idleBattleView.destroy();
      this.idleBattleView = null;
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

  createBackground() {
    BackgroundFactory.createMainBg(this);
  }

  createTopBar() {
    const barY = s(40);
    const barH = s(80);
    const topBarDepth = Z_INDEX.TOP_BAR;

    // TopBar 배경 (DESIGN_SYSTEM 4.1: bgDark + 구분선)
    const topBar = this.add.rectangle(GAME_WIDTH / 2, barY, GAME_WIDTH, barH, COLORS.bgDark, 0.95);
    topBar.setDepth(topBarDepth);

    // 하단 구분선 (primary alpha 0.3)
    const divider = this.add.rectangle(GAME_WIDTH / 2, barY + barH / 2, GAME_WIDTH, 1, COLORS.primary, 0.3);
    divider.setDepth(topBarDepth);

    const saveData = SaveManager.load();
    const playerLevel = saveData.player?.level || 1;

    // ── 왼쪽 구역: Lv 배지 (x=s(30)=45px) ──
    const levelBadge = this.add.rectangle(s(30), barY, s(55), s(30), COLORS.primary, 0.9)
      .setDepth(topBarDepth + 1);
    levelBadge.setStrokeStyle(1, COLORS.text, 0.3);
    this.levelBadgeText = this.add.text(s(30), barY, `Lv.${playerLevel}`, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(topBarDepth + 1);

    // ── 중간 구역: 에너지바 (x=s(240)=360px) ──
    const energyStatus = energySystem.getStatus() || {};
    this.energyBar = new EnergyBar(this);
    this.energyBar.create(s(240), barY);
    this.energyBar.update(energyStatus?.current ?? 0, energyStatus?.max ?? 100);
    if (this.energyBar.container) this.energyBar.container.setDepth(topBarDepth + 2);
    else if (this.energyBar.setDepth) this.energyBar.setDepth(topBarDepth + 2);

    // 에너지 회복 타이머 (에너지바 하단 barY+s(16) 에 작게 표시)
    const timeToRecover = energySystem.getTimeToNextRecovery?.() ?? 0;
    this.energyTimerText = this.add.text(s(240), barY + s(16), timeToRecover > 0 ? `+1 in ${formatTime(timeToRecover)}` : '', {
      fontSize: sf(10),
      fontFamily: '"Noto Sans KR", Arial',
      color: '#AAAAAA',
      fontStyle: 'bold'
    }).setOrigin(0.5, 0).setDepth(topBarDepth + 2);

    // ── 골드(gold) 아이콘 + 수치 (icon:x=s(400)=600px, text:x=s(420)=630px) ──
    let goldIcon;
    if (this.textures.exists('gold')) {
      goldIcon = this.add.image(s(400), barY, 'gold').setScale(1).setDepth(topBarDepth + 1);
    } else {
      goldIcon = this.add.text(s(400), barY, '🪙', { fontSize: sf(20) }).setOrigin(0.5).setDepth(topBarDepth + 1);
    }

    const gold = this.registry.get('gold') || 10000;
    this.goldText = this.add.text(s(420), barY, gold.toLocaleString(), {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(topBarDepth + 1);

    // ── 보석(gem) 아이콘 + 수치 (icon:x=s(510)=765px, text:x=s(530)=795px) ──
    let gemIcon;
    if (this.textures.exists('gem')) {
      gemIcon = this.add.image(s(510), barY, 'gem').setScale(1).setDepth(topBarDepth + 1);
    } else {
      gemIcon = this.add.text(s(510), barY, '💎', { fontSize: sf(20) }).setOrigin(0.5).setDepth(topBarDepth + 1);
    }

    const gems = this.registry.get('gems') || 1500;
    this.gemText = this.add.text(s(530), barY, gems.toLocaleString(), {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(topBarDepth + 1);

    // ── 보석+ 충전 버튼 (x=s(610)=915px): 보석 아이콘과 동일한 그래픽 사용 ──
    let chargeBtnIcon;
    if (this.textures.exists('gem')) {
      chargeBtnIcon = this.add.image(s(610), barY, 'gem').setScale(0.85).setDepth(topBarDepth + 2);
    } else {
      chargeBtnIcon = this.add.text(s(610), barY, '💎', { fontSize: sf(18) }).setOrigin(0.5).setDepth(topBarDepth + 2);
    }
    const chargePlusLabel = this.add.text(s(610) + s(14), barY - s(9), '+', {
      fontSize: sf(12), fontFamily: '"Noto Sans KR", Arial', fontStyle: 'bold',
      color: '#A78BFA'
    }).setOrigin(0.5).setDepth(topBarDepth + 2);

    // 투명 히트 영역으로 클릭 인터랙션 처리
    const chargeBtnHit = this.add.rectangle(s(610), barY, s(40), s(40), 0x000000, 0)
      .setDepth(topBarDepth + 2).setInteractive({ useHandCursor: true });
    chargeBtnHit.on('pointerdown', () => {
      const modal = new Modal(this, {
        title: '에너지 충전',
        content: '젬 50개를 소모하여 에너지를 충전합니다.',
        buttons: [
          { text: '충전', color: 0x6366F1, onClick: () => { this.chargeEnergyWithGems(); } },
          { text: '취소', color: 0x475569, onClick: () => {} }
        ]
      });
      modal.show();
    });
    chargeBtnHit.on('pointerover', () => {
      if (chargeBtnIcon.setAlpha) chargeBtnIcon.setAlpha(0.75);
      chargePlusLabel.setColor('#C4B5FD');
    });
    chargeBtnHit.on('pointerout', () => {
      if (chargeBtnIcon.setAlpha) chargeBtnIcon.setAlpha(1);
      chargePlusLabel.setColor('#A78BFA');
    });

    // ── 전투력 (Lv 배지 오른쪽, x=s(70)=105px, left-origin) + 설정 (x=GAME_WIDTH-s(28)=1038px) ──
    const partyPower = this.idleSystem.getPartyPower();
    this.powerText = this.add.text(s(70), barY, `⚔ ${Math.floor(partyPower).toLocaleString()}`, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(topBarDepth + 1);

    const settingsBtn = this.add.rectangle(GAME_WIDTH - s(28), barY, s(44), s(44), COLORS.bgDark, 0.01)
      .setDepth(topBarDepth + 1)
      .setInteractive({ useHandCursor: true });

    const settingsIcon = this.add.text(GAME_WIDTH - s(28), barY, '⚙️', {
      fontSize: sf(20)
    }).setOrigin(0.5).setDepth(topBarDepth + 1);

    settingsBtn.on('pointerover', () => {
      settingsBtn.setFillStyle(COLORS.primary, 0.3);
      settingsIcon.setAlpha(0.8);
    });
    settingsBtn.on('pointerout', () => {
      settingsBtn.setFillStyle(COLORS.bgDark, 0.01);
      settingsIcon.setAlpha(1.0);
    });
    settingsBtn.on('pointerdown', () => {
      this.openPopup('settings');
    });
  }

  /**
   * WS-3: Party hero display (y=110~270)
   */
  createPartyDisplay() {
    // [HIGH-1] 파티 HUD 오브젝트 추적 배열 초기화
    this._partyObjects = [];

    const saveData = SaveManager.load();
    const parties = saveData?.parties || [];
    // PartyManager 형식: {heroIds: [...]} 또는 레거시 배열 형식 둘 다 지원
    const rawParty = parties[0];
    const partyIds = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const characters = saveData?.characters || [];

    const panelY = s(95);
    const panelH = s(175);
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.bgLight, 0.9);
    panel.fillRoundedRect(s(20), panelY, GAME_WIDTH - s(40), panelH, s(12));
    panel.setDepth(Z_INDEX.PANELS);
    this._partyObjects.push(panel);

    const partyLabel = this.add.text(s(40), panelY + s(10), '내 파티', {
      fontSize: sf(16), fontFamily: '"Noto Sans KR", Arial', fontStyle: 'bold',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setDepth(Z_INDEX.PANEL_CONTENT);
    this._partyObjects.push(partyLabel);

    // 전투력 — 파티 패널 헤더 중앙
    const _cpSaveData = SaveManager.load();
    const _cpPower = this.calculateCombatPower(_cpSaveData);
    const _cpDifficulty = this.getDifficulty(_cpPower);
    const _cpDiffColors = { '쉬움': '#10B981', '보통': '#60A5FA', '어려움': '#F59E0B', '매우어려움': '#EF4444', '극한': '#7C3AED' };
    const _cpText = this.add.text(GAME_WIDTH / 2, panelY + s(17), `⚡ ${_cpPower.toLocaleString()} (${_cpDifficulty.label})`, {
      fontSize: sf(14), fontFamily: '"Noto Sans KR", Arial', fontStyle: 'bold',
      color: _cpDiffColors[_cpDifficulty.label] || '#60A5FA'
    }).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);
    this._partyObjects.push(_cpText);

    // 파티 편성 바로가기 버튼
    const editBtn = this.add.container(GAME_WIDTH - s(60), panelY + s(18));
    editBtn.setDepth(Z_INDEX.PANEL_BUTTONS);
    const editBg = this.add.rectangle(0, 0, s(60), s(26), COLORS.primary, 0.8)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x818CF8);
    const editText = this.add.text(0, 0, '편성', {
      fontSize: sf(12), fontFamily: '"Noto Sans KR", Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    editBtn.add([editBg, editText]);
    this._partyObjects.push(editBtn);
    editBg.on('pointerdown', () => {
      this.openPopup('partyedit');
    });

    const classColors = { warrior: 0xEF4444, mage: 0x8B5CF6, archer: 0x10B981, healer: 0x3B82F6 };
    const classIcons = { warrior: '⚔️', mage: '🔮', archer: '🏹', healer: '💚' };

    // Calculate slot positions for 4 heroes evenly across panel
    const slotWidth = (GAME_WIDTH - s(80)) / 4;

    partyIds.forEach((heroId, i) => {
      const charData = characters.find(c => c.id === heroId || c.characterId === heroId);
      const staticData = getCharacter(heroId);
      const x = s(40) + slotWidth / 2 + i * slotWidth;
      const y = panelY + s(90); // [B] s(30) 위로 이동 (120 → 90)

      const charClass = staticData?.class || charData?.class || 'warrior';
      const color = classColors[charClass] || 0x64748B;

      // Circular avatar — DiceBear 이미지 우선, 없으면 컬러 원형 폴백
      const portraitKey = `hero_${heroId}`;
      const avatarR = s(32);
      let avatar;
      if (this.textures.exists(portraitKey)) {
        // 원형 마스크 + DiceBear 이미지
        const maskGfx = this.make.graphics({ x: 0, y: 0 });
        maskGfx.fillCircle(x, y, avatarR);
        const mask = maskGfx.createGeometryMask();
        const img = this.add.image(x, y, portraitKey).setDisplaySize(avatarR * 2, avatarR * 2)
          .setDepth(Z_INDEX.PANEL_CONTENT);
        img.setMask(mask);
        avatar = this.add.circle(x, y, avatarR, 0x000000, 0.001)
          .setDepth(Z_INDEX.PANEL_CONTENT + 1)
          .setInteractive({ useHandCursor: true });
        // [HIGH-1] DiceBear 경로 추적
        this._partyObjects.push(maskGfx, img, avatar);
      } else {
        avatar = this.add.circle(x, y, avatarR, color, 0.9)
          .setDepth(Z_INDEX.PANEL_CONTENT)
          .setInteractive({ useHandCursor: true });
        const classIconText = this.add.text(x, y - s(5), classIcons[charClass] || (staticData?.name || charData?.name || '?')[0], {
          fontSize: sf(24)
        }).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT + 1);
        // [HIGH-1] 폴백 경로 추적
        this._partyObjects.push(avatar, classIconText);
      }

      // Name (max 4 chars)
      const name = (staticData?.name || charData?.name || '???').substring(0, 4);
      const nameText = this.add.text(x, y + s(40), name, {
        fontSize: sf(12), fontFamily: '"Noto Sans KR", Arial',
        color: `#${COLORS.text.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);
      this._partyObjects.push(nameText);

      // Level
      const level = charData?.level || 1;
      const levelText = this.add.text(x, y + s(55), `Lv.${level}`, {
        fontSize: sf(11), fontFamily: '"Noto Sans KR", Arial',
        color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);
      this._partyObjects.push(levelText);

      // 영웅 클릭 → 팝업 정보
      avatar.on('pointerdown', () => {
        this.heroPopup?.show(heroId);
      });
      avatar.on('pointerover', () => avatar.setScale(1.1));
      avatar.on('pointerout', () => avatar.setScale(1));
    });

    // If party is empty, show placeholder
    if (partyIds.length === 0) {
      const emptyMsg = this.add.text(GAME_WIDTH / 2, panelY + s(90), '파티를 편성해주세요!', { // [B] s(30) 위로
        fontSize: sf(16), fontFamily: '"Noto Sans KR", Arial',
        color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);
      this._partyObjects.push(emptyMsg);
    }
  }

  /**
   * WS-3: Combat power + difficulty display (y=280~350)
   */
  createCombatPowerDisplay() {
    // 전투력 표시가 내 파티 프레임으로 통합됨 (createPartyDisplay 참고)
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
   * WS-3: Adventure panel with sweep + boss battle (y=360~560)
   */
  createAdventurePanel() {
    const panelY = s(310);
    const panelH = s(190);
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.bgLight, 0.9);
    panel.fillRoundedRect(s(20), panelY, GAME_WIDTH - s(40), panelH, s(12));
    panel.setDepth(Z_INDEX.PANELS);

    const saveData = SaveManager.load();
    const progress = saveData?.progress || {};

    // Current stage info
    const currentStage = this.idleSystem.getCurrentStage();
    this.add.text(s(40), panelY + s(15), '🗺️ 현재 모험', {
      fontSize: sf(18), fontFamily: '"Noto Sans KR", Arial', fontStyle: 'bold',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setDepth(Z_INDEX.PANEL_CONTENT);
    // [A] 스테이지 이름 텍스트 삭제됨

    // Check if party exists
    const parties = saveData?.parties || [];
    const rawParty = parties[0];
    const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    // BUG-1 수정: heroIds 배열이 비어있지 않으면 파티 편성으로 인식
    // saveData.characters에 없더라도 heroId가 존재하면 파티 있음으로 처리
    const hasParty = party.length > 0;

    // Sweep availability: 파티만 있으면 항상 가능
    const canSweep = hasParty;

    // === 3버튼 레이아웃: 소탕 | 보상받기 | 보스전 (동일 너비) ===
    const btnGap = s(10);
    const btnW = Math.floor((GAME_WIDTH - s(80) - s(20)) / 3);
    const btnH = s(50);
    const btnY = panelY + s(80);
    const sweepBtnX = s(40);
    const claimBtnX = sweepBtnX + btnW + btnGap;
    const bossBtnX = sweepBtnX + (btnW + btnGap) * 2;

    // 소탕 버튼
    this._sweepBtnGfx = this.add.graphics();
    this._sweepBtnGfx.fillStyle(canSweep ? COLORS.success : COLORS.bgPanel, 1);
    this._sweepBtnGfx.fillRoundedRect(sweepBtnX, btnY, btnW, btnH, s(10));
    this._sweepBtnGfx.setDepth(Z_INDEX.PANEL_BUTTONS);
    this._sweepBtnText = this.add.text(sweepBtnX + btnW / 2, btnY + btnH / 2, `⚡ 소탕`, {
      fontSize: sf(15), fontFamily: '"Noto Sans KR", Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(Z_INDEX.PANEL_BUTTONS + 1);

    this._sweepHit = this.add.rectangle(sweepBtnX + btnW / 2, btnY + btnH / 2, btnW, btnH)
      .setAlpha(0.001).setDepth(Z_INDEX.PANEL_BUTTONS + 2);

    if (canSweep) {
      this._sweepHit.setInteractive({ useHandCursor: true });
      this._sweepHit.on('pointerdown', () => {
        this.performSweep();
      });
    } else {
      this._sweepBtnText.setAlpha(0.5);
    }

    // 보상받기 버튼 (가운데)
    this._createClaimRewardsButton(claimBtnX, btnY, btnW, btnH);

    // BUG-12 수정: 보스 버튼 생성 전 보스 데이터 로드 완료 보장
    const bossReady = hasParty && this.idleSystem?.isBossReady?.();
    this._bossReady = bossReady;
    this._bossBtnGfx = this.add.graphics();
    this._bossBtnGfx.fillStyle(bossReady ? COLORS.danger : COLORS.bgPanel, 1);
    this._bossBtnGfx.fillRoundedRect(bossBtnX, btnY, btnW, btnH, s(10));
    if (bossReady) {
      this._bossBtnGfx.lineStyle(2, 0xFF6B6B, 0.9);
      this._bossBtnGfx.strokeRoundedRect(bossBtnX, btnY, btnW, btnH, s(10));
    }
    this._bossBtnGfx.setDepth(Z_INDEX.PANEL_BUTTONS);
    this._bossBtnText = this.add.text(bossBtnX + btnW / 2, btnY + btnH / 2, bossReady ? '🗡️ 보스전 ⚡20' : '🗡️ 보스전', {
      fontSize: sf(15), fontFamily: '"Noto Sans KR", Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(Z_INDEX.PANEL_BUTTONS + 1);
    this._bossBtnPanelY = panelY;
    this._bossBtnX = bossBtnX;
    this._bossBtnW = btnW;
    this._bossBtnH = btnH;

    this._bossHit = this.add.rectangle(bossBtnX + btnW / 2, btnY + btnH / 2, btnW, btnH)
      .setAlpha(0.001).setDepth(Z_INDEX.PANEL_BUTTONS + 2);

    // 보스전 버튼은 항상 인터랙티브 등록 (상태는 update에서 동적 관리)
    this._bossHit.setInteractive({ useHandCursor: true });
    this._bossHit.on('pointerdown', () => {
      if (this._bossReady) {
        this.prepareBossBattle();
      } else {
        this.showToast('진행도 100%가 되어야 보스전에 도전할 수 있습니다!');
      }
    });

    if (!bossReady) {
      this._bossBtnText.setAlpha(0.5);
    }

    // [A] 에너지 수치 텍스트 및 스테이지 이름 텍스트 삭제됨
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

    // [E] 소탕 완료 토스트 표시
    const currentStage = this.idleSystem.getCurrentStage();
    const stageName = `${currentStage.chapter}-${currentStage.stage}`;
    this.showToast(`✅ 소탕 완료! 💰 +${goldReward.toLocaleString()} / ⭐ +${expReward.toLocaleString()} EXP`);
  }

  /**
   * IdleBattleView (y=580~880, expanded)
   */
  createIdleBattleView() {
    const viewY = s(632);
    const viewWidth = s(560);
    const viewHeight = s(300);

    this.idleBattleView = new IdleBattleView(this, GAME_WIDTH / 2, viewY, viewWidth, viewHeight);
    this.idleBattleView.setDepth(Z_INDEX.IDLE_BATTLE);

    const saveData = SaveManager.load();
    const parties = saveData.parties || [];
    const rawParty = parties[0];
    const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    // BUG-2 수정: saveData.characters에 없는 영웅도 getCharacter()로 폴백하여 매핑
    const partyHeroes = party.map(heroId => {
      const saved = (saveData.characters || []).find(c => c.id === heroId || c.characterId === heroId);
      if (saved) return saved;
      const staticData = getCharacter(heroId);
      if (staticData) return { ...staticData, id: heroId, level: 1 };
      return null;
    }).filter(Boolean);

    // Check if party is empty
    const hasParty = partyHeroes.length > 0;

    if (hasParty) {
      this.idleBattleView.updateParty(partyHeroes);
      // 보스 로드 + 표시
      this.idleSystem.loadCurrentBoss();
      if (this.idleSystem.currentBossData) {
        this.idleBattleView.showBoss(this.idleSystem.currentBossData);
      }
      this.idleBattleView.startBattleCycle();

      // 보스전 복귀 처리
      if (this.bossVictory) {
        this.idleSystem.advanceStage();
        const newStage = this.idleSystem.getCurrentStage();
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
   * Idle income summary (y=900)
   */
  createIdleSummary() {
    // viewY(632) + viewHeight/2(170) = 802 → summaryY는 그 아래로
    const summaryY = s(840);

    const summaryBg = this.add.rectangle(GAME_WIDTH / 2, summaryY, s(460), s(50), COLORS.bgLight, 0.5);
    summaryBg.setStrokeStyle(1, COLORS.primary, 0.3);
    summaryBg.setDepth(Z_INDEX.CLAIM_BUTTON - 1);

    const partyPower = this.idleSystem.getPartyPower();
    const rates = this.idleSystem.getIdleBattleRate(partyPower);
    const goldPerHour = Math.floor((rates.goldPerSec || 0) * 3600);
    const expPerHour = Math.floor((rates.expPerSec || 0) * 3600);

    this.add.text(GAME_WIDTH / 2 - s(110), summaryY, `💰 ${goldPerHour.toLocaleString()}/h`, {
      fontSize: sf(15), fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(Z_INDEX.CLAIM_BUTTON);

    this.add.text(GAME_WIDTH / 2 + s(110), summaryY, `⭐ ${expPerHour.toLocaleString()}/h`, {
      fontSize: sf(15), fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.success.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(Z_INDEX.CLAIM_BUTTON);
  }

  /**
   * 누적 보상 수령 버튼 생성 (항상 활성 상태)
   */
  _createClaimRewardsButton(x, y, w, h) {
    const btnW = w || s(300);
    const btnH = h || s(44);
    const btnX = x !== undefined ? x : (GAME_WIDTH / 2 - btnW / 2);
    const centerX = btnX + btnW / 2;
    const centerY = y + btnH / 2;
    const radius = s(10);

    // 버튼 배경 (항상 녹색 활성)
    this._claimBtnGfx = this.add.graphics();
    this._claimBtnGfx.fillStyle(0x22C55E, 1);
    this._claimBtnGfx.fillRoundedRect(btnX, y, btnW, btnH, radius);
    this._claimBtnGfx.setDepth(Z_INDEX.CLAIM_BUTTON);

    // 버튼 텍스트
    this._claimRewardText = this.add.text(centerX, centerY, '🎁 보상받기', {
      fontSize: sf(14), fontFamily: '"Noto Sans KR", Arial',
      color: '#FFFFFF',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(Z_INDEX.CLAIM_BUTTON + 1);

    // 히트 영역
    this._claimBtnHit = this.add.rectangle(centerX, centerY, btnW, btnH)
      .setAlpha(0.001).setDepth(Z_INDEX.CLAIM_BUTTON + 2).setInteractive({ useHandCursor: true });

    this._claimBtnHit.on('pointerdown', () => this._onClaimRewards());
    this._claimBtnHit.on('pointerover', () => {
      this._claimBtnGfx.clear();
      this._claimBtnGfx.fillStyle(0x16A34A, 1);
      this._claimBtnGfx.fillRoundedRect(btnX, y, btnW, btnH, radius);
    });
    this._claimBtnHit.on('pointerout', () => {
      this._claimBtnGfx.clear();
      this._claimBtnGfx.fillStyle(0x22C55E, 1);
      this._claimBtnGfx.fillRoundedRect(btnX, y, btnW, btnH, radius);
    });

    this._claimBtnX = btnX;
    this._claimBtnY = y;
    this._claimBtnW = btnW;
    this._claimBtnH = btnH;
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

    // 보상 수령 후 IdleBattleView 상태 복원 (진행도 유지)
    if (this.idleBattleView) {
      // 현재 보스가 없으면 다시 로드
      if (!this.idleSystem.currentBossData) {
        this.idleSystem.loadCurrentBoss();
      }
      if (this.idleSystem.currentBossData) {
        this.idleBattleView.showBoss(this.idleSystem.currentBossData);
      }
      // 실제 누적 진행도(accumulatedDamage / bossHp)로 바 업데이트
      const currentProgress = this.idleSystem.currentBossHp > 0
        ? Math.min(1, (this.idleSystem.accumulatedDamage || 0) / this.idleSystem.currentBossHp)
        : 0;
      this.idleBattleView.updateProgress(currentProgress);
    }
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

  createBottomMenu() {
    // ──────────────────────────────────────────────
    // P1/P2/P3 계층 UX 구조
    // P1: 전투/스테이지 (최우선 CTA, 펄스 애니메이션)
    // P2: 가챠, 파티 편성 (중간 크기 2버튼, 균등 배치)
    // P3: 서브 콘텐츠 8개 (사각 카드, 2행4열, 통일 스타일)
    // ──────────────────────────────────────────────

    const padding = s(16);
    const menuWidth = GAME_WIDTH - padding * 2;
    const menuBaseY = s(910);

    // ── P2: 가챠 + 파티 편성 버튼 (균등 2분할) ──────
    const p2Gap = s(12);
    const p2BtnW = Math.floor((menuWidth - p2Gap) / 2);
    const p2BtnH = s(58);
    const p2Y = menuBaseY;
    const p2StartX = padding;

    const p2Items = [
      { label: '🎰 가챠', popupKey: 'gacha', color: 0x7C3AED, borderColor: 0xA78BFA },
      { label: '⚔ 파티 편성', popupKey: 'partyedit', color: 0x1E40AF, borderColor: 0x60A5FA },
    ];

    p2Items.forEach((item, i) => {
      const bx = p2StartX + i * (p2BtnW + p2Gap);
      const bCenterX = bx + p2BtnW / 2;
      const bCenterY = p2Y + p2BtnH / 2;
      const radius = s(10);

      const gfx = this.add.graphics().setDepth(Z_INDEX.BOTTOM_MENU);
      const drawP2Normal = () => {
        gfx.clear();
        gfx.fillStyle(item.color, 0.9);
        gfx.fillRoundedRect(bx, p2Y, p2BtnW, p2BtnH, radius);
        gfx.lineStyle(s(2), item.borderColor, 0.6);
        gfx.strokeRoundedRect(bx, p2Y, p2BtnW, p2BtnH, radius);
      };
      const drawP2Hover = () => {
        gfx.clear();
        gfx.fillStyle(item.color, 1);
        gfx.fillRoundedRect(bx, p2Y, p2BtnW, p2BtnH, radius);
        gfx.lineStyle(s(2), item.borderColor, 1);
        gfx.strokeRoundedRect(bx, p2Y, p2BtnW, p2BtnH, radius);
      };
      drawP2Normal();

      const txt = this.add.text(bCenterX, bCenterY, item.label, {
        fontSize: sf(17),
        fontFamily: '"Noto Sans KR", Arial',
        color: '#FFFFFF',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(Z_INDEX.BOTTOM_MENU + 1);

      const hit = this.add.rectangle(bCenterX, bCenterY, p2BtnW, p2BtnH)
        .setAlpha(0.001).setDepth(Z_INDEX.BOTTOM_MENU + 2).setInteractive({ useHandCursor: true });

      hit.on('pointerover', () => { drawP2Hover(); });
      hit.on('pointerout', () => { drawP2Normal(); });
      hit.on('pointerdown', () => {
        txt.setScale(0.93);
        this.time.delayedCall(100, () => {
          txt.setScale(1);
          this.openPopup(item.popupKey);
        });
      });
    });

    // ── 구분선 (P2/P3 사이) ──
    const divY = p2Y + p2BtnH + s(8);
    this.add.rectangle(GAME_WIDTH / 2, divY, menuWidth, s(1), COLORS.primary, 0.3)
      .setDepth(Z_INDEX.BOTTOM_MENU);

    // ── P3: 서브 콘텐츠 사각 카드 버튼 8개 (2행 4열) ──────
    const p3Items = [
      { icon: '📋', label: '퀘스트', popupKey: 'quest' },
      { icon: '🦸', label: '도감', popupKey: 'herolist' },
      { icon: '⚔️', label: 'PvP', popupKey: 'pvp' },
      { icon: '🏰', label: '길드', popupKey: 'guild' },
      { icon: '🗼', label: '타워', popupKey: 'tower' },
      { icon: '🎉', label: '이벤트', popupKey: 'eventdungeon' },
      { icon: '🛒', label: '상점', popupKey: 'inventory' },
      { icon: '⚙️', label: '설정', popupKey: 'settings' },
    ];

    const p3Cols = 4;
    const p3GapX = s(10);
    const p3GapY = s(10);
    const p3BtnW = Math.floor((menuWidth - p3GapX * (p3Cols - 1)) / p3Cols);
    const p3BtnH = s(80);
    const p3StartY = divY + s(8);
    const p3StartX = padding;
    const p3Radius = s(8);
    // 카드 배경색: bgPanel보다 약간 밝게(대비 강화)
    const p3BgColor = 0x2D3F5A;
    const p3BgColorHover = 0x3D5272;

    p3Items.forEach((item, i) => {
      const col = i % p3Cols;
      const row = Math.floor(i / p3Cols);
      const bx = p3StartX + col * (p3BtnW + p3GapX);
      const by = p3StartY + row * (p3BtnH + p3GapY);
      const bCenterX = bx + p3BtnW / 2;
      const bCenterY = by + p3BtnH / 2;

      const bg = this.add.graphics().setDepth(Z_INDEX.BOTTOM_MENU);
      const drawP3Normal = () => {
        bg.clear();
        bg.fillStyle(p3BgColor, 1);
        bg.fillRoundedRect(bx, by, p3BtnW, p3BtnH, p3Radius);
        bg.lineStyle(s(1), COLORS.primary, 0.5);
        bg.strokeRoundedRect(bx, by, p3BtnW, p3BtnH, p3Radius);
      };
      const drawP3Hover = () => {
        bg.clear();
        bg.fillStyle(p3BgColorHover, 1);
        bg.fillRoundedRect(bx, by, p3BtnW, p3BtnH, p3Radius);
        bg.lineStyle(s(2), COLORS.primary, 0.9);
        bg.strokeRoundedRect(bx, by, p3BtnW, p3BtnH, p3Radius);
      };
      drawP3Normal();

      // 아이콘: 카드 위쪽 40% 위치
      const iconY = by + p3BtnH * 0.38;
      const iconTxt = this.add.text(bCenterX, iconY, item.icon, {
        fontSize: sf(22),
      }).setOrigin(0.5).setDepth(Z_INDEX.BOTTOM_MENU + 1);

      // 레이블: 카드 아래쪽 75% 위치
      const labelY = by + p3BtnH * 0.75;
      const labelTxt = this.add.text(bCenterX, labelY, item.label, {
        fontSize: sf(11),
        fontFamily: '"Noto Sans KR", Arial',
        color: '#CBD5E1',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(Z_INDEX.BOTTOM_MENU + 1);

      const hitArea = this.add.rectangle(bCenterX, bCenterY, p3BtnW, p3BtnH)
        .setAlpha(0.001).setDepth(Z_INDEX.BOTTOM_MENU + 2).setInteractive({ useHandCursor: true });

      hitArea.on('pointerover', () => {
        drawP3Hover();
        labelTxt.setColor('#FFFFFF');
      });
      hitArea.on('pointerout', () => {
        drawP3Normal();
        labelTxt.setColor('#CBD5E1');
        iconTxt.setScale(1);
      });
      hitArea.on('pointerdown', () => {
        iconTxt.setScale(0.88);
        this.time.delayedCall(100, () => {
          iconTxt.setScale(1);
          this.openPopup(item.popupKey);
        });
      });
    });
  }

  openPopup(key) {
    // 이미 열린 팝업이 있으면 무시
    if (this.activePopup) return;

    // [HIGH-1] 파티 HUD 숨기기 (z-order 잃상 방지)
    if (this._partyObjects) {
      this._partyObjects.forEach(obj => { if (obj?.setVisible) obj.setVisible(false); });
    }

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
    };
    const PopupClass = popups[key];
    if (PopupClass) {
      const popup = new PopupClass(this, {
        onClose: () => {
          this.activePopup = null;
          // [HIGH-1] 파티 HUD 복원
          if (this._partyObjects) {
            this._partyObjects.forEach(obj => { if (obj?.setVisible) obj.setVisible(true); });
          }
          this.refreshAfterPopup();
        }
      });
      this.activePopup = popup;
      popup.show();
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
      this.powerText.setText(`⚔ ${Math.floor(partyPower).toLocaleString()}`);
    }

    // 3. IdleBattleView 파티 갱신 (파티 편성 변경 시)
    if (this.idleBattleView) {
      const saveData = SaveManager.load();
      const parties = saveData?.parties || [];
      const rawParty = parties[0];
      const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
      // BUG-2 수정: saveData.characters에 없는 영웅도 getCharacter()로 폴백하여 매핑
      const partyHeroes = party.map(heroId => {
        const saved = (saveData.characters || []).find(c => c.id === heroId || c.characterId === heroId);
        if (saved) return saved;
        const staticData = getCharacter(heroId);
        if (staticData) return { ...staticData, id: heroId, level: 1 };
        return null;
      }).filter(Boolean);

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

        // 진행도 100% → 보스전 준비 알림 + 버튼 동적 활성화
        if (battleResult.bossReady) {
          this.showToast('⚔️ 보스전 준비 완료! 보스전 버튼을 눌러주세요.');
        }
        // 로드 시 이미 ready 상태면 즉시 표시 (bossReadyShown 가드가 중복 호출 방지)
        if (battleResult.bossReady || this.idleSystem.isBossReady?.()) {
          this.idleBattleView.showBossReady();
        }
      }

      // BUG-12 수정: 보스 버튼 상태를 매 프레임 체크하여 동적 갱신 (재접속 시 즉시 반영)
      const nowBossReady = this.idleSystem.isBossReady?.() || false;
      if (nowBossReady !== this._bossReady) {
        this._bossReady = nowBossReady;
        if (this._bossBtnGfx && this._bossBtnText) {
          this._bossBtnGfx.clear();
          this._bossBtnGfx.fillStyle(nowBossReady ? COLORS.danger : COLORS.bgPanel, 1);
          this._bossBtnGfx.fillRoundedRect(this._bossBtnX, this._bossBtnPanelY + s(80), this._bossBtnW, this._bossBtnH, s(10));
          if (nowBossReady) {
            this._bossBtnGfx.lineStyle(2, 0xFF6B6B, 0.9);
            this._bossBtnGfx.strokeRoundedRect(this._bossBtnX, this._bossBtnPanelY + s(80), this._bossBtnW, this._bossBtnH, s(10));
          }
          this._bossBtnText.setText(nowBossReady ? '🗡️ 보스전 ⚡20' : '🗡️ 보스전');
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
