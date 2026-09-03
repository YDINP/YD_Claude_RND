/**
 * HeroDetailScene.js — 영웅 상세 (REDESIGN_PLAN §3-3, T-15 전면 재작성)
 *
 * 이전 화면은 절대좌표 패널 4개가 서로 겹치고 y=700 아래가 55% 비어 있었다.
 * 이번 재작성은 화면을 두 단으로 나눈다.
 *
 *   상단  영웅 스테이지 — 교단색 방사광 + 교단 엠블럼 워터마크 + 전신 시트 1장
 *   하단  탭 4개(능력치·스킬·장비·이야기)가 글래스 패널 하나를 번갈아 쓴다
 *
 * 화면 액센트는 COLORS.primary 고정이 아니라 그 영웅의 교단색이다. 아이리스를 열면
 * 화면이 올림푸스의 주황으로, 요미 소속을 열면 보라로 물든다 — 영웅마다 화면 색이 바뀐다.
 *
 * 배치 수치는 전부 `utils/heroDetailLayout.js`(Phaser 비의존 순수 모듈)에 있다.
 * 여기서는 그 결과를 s() 로 렌더 좌표(1080x1920)로 옮겨 그리기만 한다.
 *
 * 주의:
 *   - gameConfig/designSystem 값을 모듈 스코프나 static 필드에서 즉시 평가하지 않는다
 *     (씬 그래프 순환 import 로 인한 부팅 TDZ 방지 — tests/e2e/boot-smoke.mjs 참고).
 *   - 존재하지 않는 텍스처 키는 로드하지 않는다. 전신 시트는 asset-manifest 의
 *     fullbody 버킷에 있는 키만 요청한다(dev 서버 404 가드가 콘솔 에러를 남기므로).
 */
import {
  COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, CULT_INFO, EQUIPMENT_SLOTS, MOODS, s, sf
} from '../config/gameConfig.js';
import { RARITY_COLORS, Z_INDEX } from '../config/layoutConfig.js';
import { DESIGN, getCultColor, getMoodColor, hexToCSS } from '../config/designSystem.js';
import { getRarityKey } from '../utils/rarityUtils.js';
import { ts } from '../utils/textStyles.ts';
import { GlassPanel, GLASS_VARIANT } from '../components/GlassPanel.js';
import { NineSliceFrame } from '../components/NineSliceFrame.js';
import { IconFactory } from '../utils/IconFactory.js';
import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import { EvolutionSystem } from '../systems/EvolutionSystem.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { SaveManager } from '../systems/SaveManager.js';
import characterRenderer from '../renderers/CharacterRenderer.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
import { RadarChart } from '../components/RadarChart.js';
import { getCharacterOrHero } from '../data/index.js';
import navigationManager from '../systems/NavigationManager.js';
import PORTRAIT_MAP from '../data/portrait-mapping.json';
import CULTS_DATA from '../data/cults.json';
import { soundManager } from '../systems/SoundManager.js';
import ASSET_MANIFEST from '../../tools/art/asset-manifest.json';
import {
  HERO_DETAIL_LAYOUT as L,
  HERO_DETAIL_TABS,
  EQUIP_SLOT_ORDER,
  computeTabSlots,
  computeActionSlots,
  computeFullbodyFit,
  computeFullbodyAnchor,
  computeStatRows,
  computeRadarPlacement,
  computeEquipSlots,
  computeCardStack,
  computeSkillCardParts,
  computeRibbonSlots,
  splitStatArea,
  resolveTabId,
  resolveFullbodyKey,
  fullbodyPath,
  hasFullbodyAsset,
  formatNumber,
  truncate,
  buildSubtitle
} from '../utils/heroDetailLayout.js';

/** 클래스 표시 이름 */
const CLASS_LABELS = { warrior: '전사', mage: '마법사', archer: '궁수', healer: '힐러' };

/**
 * 액션 바의 최대 레벨 판정 폴백.
 * 세이브에 없는 영웅이라 ProgressionSystem.getCharacterDetails() 가 null 일 때 쓴다.
 * 레벨업 로직 자체가 쓰는 값과 같다.
 */
const ACTION_MAX_LEVEL = { N: 30, R: 40, SR: 50, SSR: 60 };

/** 탭 전환·이탈 전환 시간 (ms) */
const TAB_FADE_MS = 120;

/**
 * 장비 슬롯 → 벡터 아이콘 키.
 * 전용 장비 아이콘(weapon/armor/…)은 아직 없다. 슬롯 넷이 같은 그림이 되지 않도록
 * 의미가 가장 가까운 기존 아이콘으로 갈라 둔다. 전용 아이콘이 생기면 이 표만 바꾼다.
 */
const EQUIP_ICON = {
  weapon: 'atk',
  armor: 'def',
  accessory: 'collection',
  relic: 'ascension'
};

/** 씬 안에서 쓰는 depth 층 */
const DEPTH = {
  BG: 0,
  GLOW: 2,
  WATERMARK: 3,
  FULLBODY: 5,
  FADE: 6,
  RIBBON: 12,
  HEADER: 20,
  PANEL: 18,
  CONTENT: 22,
  ACTION: 24
};

export class HeroDetailScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HeroDetailScene' });
    this.hero = null;
    this.isLevelingUp = false;
    this.activeTweens = [];
    this.tabObjects = [];
    this._loadedHeroId = null;    // RES-ABS-4: 로드된 히어로 추적
    this._hiresKey = null;        // 이 씬이 로드한 @2x 포트레이트 키
    this._fullbodyKey = null;     // 이 씬이 로드한 전신 시트 키
    this._keepFullbody = false;   // 같은 영웅으로 restart 할 때 전신을 유지
    this._tabSwitching = false;   // 탭 전환 페이드 진행 중 중복 입력 차단
    this._leaving = false;        // 이탈 페이드 진행 중 중복 입력 차단
  }

  init(data) {
    this.heroId = data?.heroId;
    this.activeTab = resolveTabId(data?.tab);
    this.isLevelingUp = false;
    this.tabObjects = [];
    this._tabSwitching = false;
    this._leaving = false;
  }

  create() {
    try {
      this.cameras.main.fadeIn(TAB_FADE_MS * 2);

      const heroes = this.registry.get('ownedHeroes') || [];
      this.hero = heroes.find(h => h.id === this.heroId);

      if (!this.hero) {
        this.scene.start('HeroListScene');
        return;
      }

      this._loadedHeroId = this.hero.id;
      this.heroData = getCharacterOrHero(this.hero.id) || this.hero;
      this.rarityKey = getRarityKey(this.hero.rarity);
      this.cultId = this.heroData.cultId || this.heroData.cult || this.hero.cult || null;
      this.cultColor = this.cultId ? getCultColor(this.cultId) : DESIGN.colors.brand.primary;
      this.cultCss = hexToCSS(this.cultColor);

      // T-29: 큰 표시용 원본(@2x, 최대 1024 PNG)을 이 씬에서만 지연 로드한다.
      // 전신 시트가 없는 영웅(char_1~4, 039~)의 폴백 확대 표시에 쓰인다.
      this._hiresKey = HeroAssetLoader.queueHiresTexture(this, this.heroData);

      // 전신 시트도 같은 배치에 올린다. 따로 올리면 @2x 가 끝난 뒤에야 시작해
      // 첫 화면이 폴백(정사각 포트레이트)으로 뜬 뒤 뒤늦게 바뀐다.
      this.prepareFullbody();

      if (characterRenderer.useAssets) {
        characterRenderer.preloadAssets(this, [this.hero], { ids: [this.hero.id], types: ['card'] });
      }

      if (this.load.list.size > 0) {
        // @2x 로드가 실패해도 화면은 떠야 한다. complete 는 실패 파일이 있어도 발생한다.
        this.load.once('complete', () => this.initUI());
        this.load.start();
      } else {
        this.initUI();
      }
    } catch (error) {
      console.error('[HeroDetailScene] create() 실패:', error);
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  initUI() {
    this.refreshDerivedData();
    this.createBackground();
    this.createHeroStage();
    this.createHeader();
    this.createRibbon();
    this.createTabBar();
    this.createContentPanel();
    this.renderTab(this.activeTab);
    this.createActionBar();
  }

  /**
   * 표시용 파생 데이터를 다시 계산한다.
   * 스탯·전투력의 SSOT 는 ProgressionSystem 이다 (장비·컬렉션 보너스 포함).
   */
  refreshDerivedData() {
    let details = null;
    try {
      details = ProgressionSystem.getCharacterDetails(this.hero.id);
    } catch (e) {
      console.warn('[HeroDetail] 상세 조회 실패:', e.message);
    }
    this.details = details;

    let finalStats = null;
    try {
      finalStats = ProgressionSystem.getFinalStats(this.hero);
    } catch {
      finalStats = null;
    }
    this.finalStats = finalStats || details?.finalStats || this.hero.stats ||
      { hp: 0, atk: 0, def: 0, spd: 0 };

    let power = 0;
    try {
      power = ProgressionSystem.calculatePower(this.hero);
    } catch {
      power = 0;
    }
    this.power = power;

    this.stars = details?.stars ?? this.hero.stars ?? this.hero.rarity ?? 1;
    this.maxStars = details?.evolution?.maxStars ?? ProgressionSystem.MAX_STARS ?? 6;
  }

  /**
   * 교단 표시 정보를 찾는다.
   * cults.json 이 15개 교단 전부를 담은 SSOT 이고, gameConfig.CULT_INFO 는
   * 9개만 가진 레거시 표다. chaos/nature/balance 가 id 그대로 노출되지 않게 한다.
   *
   * @param {string|null} cultId
   * @returns {{name:string,origin:string,description:string}|null}
   */
  resolveCultInfo(cultId) {
    if (!cultId) return null;

    const raw = CULTS_DATA && CULTS_DATA.cults ? CULTS_DATA.cults[cultId] : null;
    if (raw) {
      return {
        name: raw.nameKr || raw.name || cultId,
        origin: raw.origin || '',
        description: raw.description || raw.lore || ''
      };
    }

    const legacy = CULT_INFO[cultId];
    if (legacy) return { name: legacy.name, origin: legacy.origin, description: legacy.description };

    return { name: cultId, origin: '', description: '' };
  }

  // ================================================================
  // 배경 · 스테이지
  // ================================================================

  createBackground() {
    // bg_main 은 PreloadScene 이 미리 굽는다. 없으면 프로시저럴 폴백이 나온다.
    const bg = BackgroundFactory.createSceneBg(this, 'main', { dimAlpha: 0.62, depth: DEPTH.BG });
    this.bgKey = bg && bg.hasImage ? bg.textureKey : null;

    // 교단색 방사광 — 동심원 알파 계단으로 그라디언트를 흉내낸다.
    // Phaser Graphics 에는 방사 그라디언트가 없고, 이 배경은 매 프레임 바뀌지 않는다.
    const glow = this.add.graphics().setDepth(DEPTH.GLOW);
    const cx = s(L.width * 0.60);
    const cy = s(L.stage.y + L.stage.h * 0.42);
    const steps = 16;
    const maxR = s(400);
    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      glow.fillStyle(this.cultColor, 0.055 * (1 - t) + 0.012);
      glow.fillCircle(cx, cy, maxR * t);
    }

    // 교단 엠블럼 워터마크 — 텍스처가 있을 때만
    const emblemKey = this.cultId ? `icon_cult_${this.cultId}` : null;
    if (emblemKey && this.textures.exists(emblemKey)) {
      const emblem = this.add.image(s(L.width / 2), s(L.stage.y + L.stage.h * 0.46), emblemKey)
        .setDisplaySize(s(340), s(340))
        .setAlpha(0.12)
        .setDepth(DEPTH.WATERMARK);
      emblem.setTint(this.cultColor);
      this.tweens.add({
        targets: emblem,
        scale: { from: emblem.scale * 0.97, to: emblem.scale * 1.03 },
        alpha: { from: 0.09, to: 0.15 },
        duration: 4200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  createHeroStage() {
    const anchor = computeFullbodyAnchor();
    this.stageAnchor = { x: s(anchor.x), y: s(anchor.y) };

    // 전신 시트가 이미 있으면 바로 쓰고, 없으면 포트레이트 확대 폴백을 띄운 뒤
    // 백그라운드에서 전신을 불러와 교체한다. 로드 실패 시 폴백이 그대로 남는다.
    const fbKey = resolveFullbodyKey(this.hero.id, PORTRAIT_MAP);
    const available = hasFullbodyAsset(fbKey, ASSET_MANIFEST.fullbody);

    if (fbKey && this.textures.exists(fbKey)) {
      this.showFullbody(fbKey, { animate: false });
    } else {
      this.showPortraitFallback();
      if (fbKey && available) this.queueFullbody(fbKey);
    }

    this.createStageFade();
  }

  /**
   * 전신 시트를 create() 의 로드 배치에 올린다.
   * 매니페스트에 있는 키만 요청한다 — dev 서버의 404 가드가 콘솔 에러를 남기기 때문이다.
   *
   * @returns {string|null} 큐에 올렸거나 이미 있는 텍스처 키. 대상이 없으면 null
   */
  prepareFullbody() {
    const key = resolveFullbodyKey(this.hero.id, PORTRAIT_MAP);
    if (!key) return null;
    if (this.textures.exists(key)) return key;
    if (!hasFullbodyAsset(key, ASSET_MANIFEST.fullbody)) return null;

    const path = fullbodyPath(key);
    if (!path) return null;

    this.load.image(key, path);
    this._fullbodyKey = key;   // 이 씬이 로드했다 → shutdown 에서 해제 대상
    return key;
  }

  /**
   * 전신 시트를 스테이지에 배치한다.
   * @param {string} key - 전신 텍스처 키
   * @param {{animate:boolean}} [options] - animate 면 페이드인으로 폴백을 대체한다
   */
  showFullbody(key, options = {}) {
    const source = this.textures.get(key).getSourceImage();
    const fit = computeFullbodyFit(source.width, source.height);

    const image = this.add.image(this.stageAnchor.x, this.stageAnchor.y, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(s(fit.width), s(fit.height))
      .setDepth(DEPTH.FULLBODY);

    if (options.animate) {
      image.setAlpha(0);
      this.tweens.add({ targets: image, alpha: 1, duration: 320, ease: 'Quad.easeOut' });
      if (this.fallbackImage) {
        const old = this.fallbackImage;
        this.fallbackImage = null;
        this.tweens.add({
          targets: old, alpha: 0, duration: 260,
          onComplete: () => old.destroy()
        });
      }
    }

    // 아주 느린 호흡. 서 있는 인물이 살아 있다는 최소한의 신호다.
    const tween = this.tweens.add({
      targets: image,
      y: this.stageAnchor.y - s(6),
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.activeTweens.push(tween);

    this.fullbodyImage = image;
    return image;
  }

  /**
   * 전신 시트가 없는 영웅용 폴백 — 포트레이트를 전신 폭으로 확대하고 실루엣처럼 어둡게 깐다.
   */
  showPortraitFallback() {
    const texKey =
      (this._hiresKey && this.textures.exists(this._hiresKey) ? this._hiresKey : null) ||
      HeroAssetLoader.ensureTexture(this, this.heroData);

    if (!texKey) return null;

    const source = this.textures.get(texKey).getSourceImage();
    const fit = computeFullbodyFit(source.width, source.height, { overscan: 0.86 });

    const image = this.add.image(this.stageAnchor.x, this.stageAnchor.y - s(40), texKey)
      .setOrigin(0.5, 1)
      .setDisplaySize(s(fit.width), s(fit.height))
      .setDepth(DEPTH.FULLBODY);

    // 실루엣 대좌 — 확대된 포트레이트가 허공에 뜬 것처럼 보이지 않게 받친다
    const base = this.add.graphics().setDepth(DEPTH.FULLBODY - 1);
    base.fillStyle(this.cultColor, 0.20);
    base.fillEllipse(this.stageAnchor.x, this.stageAnchor.y - s(26), s(fit.width * 0.82), s(48));
    base.fillStyle(DESIGN.colors.bg.primary, 0.35);
    base.fillEllipse(this.stageAnchor.x, this.stageAnchor.y - s(26), s(fit.width * 0.62), s(30));

    const tween = this.tweens.add({
      targets: image,
      y: image.y - s(8),
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.activeTweens.push(tween);

    this.fallbackImage = image;
    return image;
  }

  /**
   * 전신 시트를 지연 로드한다. 매니페스트에 있는 키만 요청한다.
   * @param {string} key - 전신 텍스처 키 (fb_hero_XXX)
   */
  queueFullbody(key) {
    const path = fullbodyPath(key);
    if (!path) return;

    this.load.image(key, path);

    this.load.once(`filecomplete-image-${key}`, () => {
      if (!this.sys || !this.sys.isActive() || !this.textures.exists(key)) return;
      this._fullbodyKey = key;
      this.showFullbody(key, { animate: true });
    });

    // 실패해도 폴백이 남는다. 조용히 흡수하고 키만 기록하지 않는다.
    this.load.once('loaderror', (file) => {
      if (file && file.key === key) {
        console.warn(`[HeroDetail] 전신 시트 로드 실패, 포트레이트 폴백 유지: ${key}`);
      }
    });

    if (!this.load.isLoading()) this.load.start();
  }

  /**
   * 전신 하단을 배경색으로 녹이는 페이드 띠. 리본과 만나 자연스럽게 끊긴다.
   */
  createStageFade() {
    const fade = this.add.graphics().setDepth(DEPTH.FADE);
    const bg = DESIGN.colors.bg.primary;
    fade.fillGradientStyle(bg, bg, bg, bg, 0, 0, 0.92, 0.92);
    fade.fillRect(0, s(L.fade.y), GAME_WIDTH, s(L.fade.h));
  }

  // ================================================================
  // 헤더
  // ================================================================

  createHeader() {
    GlassPanel.create(this, {
      x: GAME_WIDTH / 2,
      y: s(L.header.h / 2),
      w: GAME_WIDTH,
      h: s(L.header.h),
      variant: GLASS_VARIANT.HUD,
      tint: this.cultColor,
      bgKey: this.bgKey,
      depth: DEPTH.HEADER
    });

    // 교단색 헤어라인 — 화면 액센트가 어디서 오는지 알려주는 1px
    const line = this.add.graphics().setDepth(DEPTH.HEADER + 1);
    line.fillStyle(this.cultColor, 0.75);
    line.fillRect(0, s(L.header.h) - s(2), GAME_WIDTH, s(2));

    // 뒤로 — 터치 타겟 88x56 (기획), 렌더 132x84
    this.createHitArea(s(58), s(L.header.h / 2), s(96), s(60), () => this.goBack(), DEPTH.HEADER + 2);

    this.add.text(s(58), s(L.header.h / 2), '←', ts('title', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5).setDepth(DEPTH.HEADER + 2);

    // 이름 + 부제
    const name = this.heroData.name || this.hero.name || '이름 없음';
    this.add.text(GAME_WIDTH / 2, s(30), name, ts('title', {
      color: DESIGN.colors.text.primary,
      align: 'center'
    })).setOrigin(0.5).setDepth(DEPTH.HEADER + 2);

    const rarityColor = (RARITY[this.rarityKey] || RARITY.N).color;
    const cultName = this.resolveCultInfo(this.cultId)?.name || null;
    const subtitle = buildSubtitle({
      rarity: this.rarityKey,
      level: this.hero.level,
      cultName
    });

    this.add.text(GAME_WIDTH / 2, s(58), subtitle, ts('label', {
      color: hexToCSS(rarityColor),
      align: 'center'
    })).setOrigin(0.5).setDepth(DEPTH.HEADER + 2);

    // 우측 — 클래스 아이콘 + 분위기 점
    const classKey = this.heroData.class || this.heroData.baseClass || this.hero.class;
    if (classKey && IconFactory.has(classKey)) {
      IconFactory.createImage(this, GAME_WIDTH - s(100), s(L.header.h / 2), classKey, 'md', {
        tint: this.cultColor
      })?.setDepth(DEPTH.HEADER + 2);
    }

    const moodKey = this.heroData.mood || this.heroData.baseMood || this.hero.mood || 'balanced';
    const moodInfo = MOODS[moodKey];
    const moodColor = moodInfo?.color || getMoodColor(moodKey);
    const moodName = moodInfo?.name || moodKey;
    this.add.circle(GAME_WIDTH - s(52), s(L.header.h / 2), s(18), moodColor, 0.85)
      .setDepth(DEPTH.HEADER + 2);
    this.add.text(GAME_WIDTH - s(52), s(L.header.h / 2), moodName.substring(0, 1), ts('caption', {
      color: '#FFFFFF'
    })).setOrigin(0.5).setDepth(DEPTH.HEADER + 3);
  }

  // ================================================================
  // 성급 · 전투력 리본
  // ================================================================

  createRibbon() {
    const slots = computeRibbonSlots();

    GlassPanel.create(this, {
      x: GAME_WIDTH / 2,
      y: s(L.ribbon.y + L.ribbon.h / 2),
      w: GAME_WIDTH - s(L.margin * 2),
      h: s(L.ribbon.h),
      variant: GLASS_VARIANT.CARD,
      tint: this.cultColor,
      bgKey: this.bgKey,
      depth: DEPTH.RIBBON
    });

    const D = DEPTH.RIBBON + 1;

    // 윗줄 좌 — 등급 배지 + 교단·클래스
    const rarityColor = (RARITY[this.rarityKey] || RARITY.N).color;
    const badge = this.add.graphics().setDepth(D);
    badge.fillStyle(rarityColor, 1);
    badge.fillRoundedRect(s(slots.badge.x), s(slots.badge.y), s(slots.badge.w), s(slots.badge.h), s(6));

    this.add.text(s(slots.badge.x + slots.badge.w / 2), s(slots.badge.y + slots.badge.h / 2),
      this.rarityKey, ts('caption', { color: '#FFFFFF' })).setOrigin(0.5).setDepth(D);

    const cultName = this.resolveCultInfo(this.cultId)?.name;
    const className = CLASS_LABELS[this.heroData.class || this.heroData.baseClass] || null;
    this.add.text(s(slots.cult.x), s(slots.cult.y + slots.cult.h / 2),
      [cultName, className].filter(Boolean).join(' · ') || '무소속',
      ts('label', { color: this.cultCss })).setOrigin(0, 0.5).setDepth(D);

    // 아랫줄 좌 — 성급과 진화 진행
    const stars = Math.max(0, Math.min(this.maxStars, Math.floor(this.stars)));
    this.add.text(s(slots.stars.x), s(slots.stars.y + slots.stars.h / 2),
      '★'.repeat(stars) + '☆'.repeat(Math.max(0, this.maxStars - stars)),
      ts('label', { color: hexToCSS(DESIGN.colors.brand.accent) }))
      .setOrigin(0, 0.5).setDepth(D);

    this.add.text(s(slots.evolution.x + slots.evolution.w), s(slots.evolution.y + slots.evolution.h / 2),
      `진화 ${stars}/${this.maxStars}`,
      ts('num.sm', { color: DESIGN.colors.text.secondary })).setOrigin(1, 0.5).setDepth(D);

    // 우 — 전투력. 화면에서 가장 큰 숫자 하나다
    this.add.text(s(slots.power.right), s(slots.power.y + 22), '전투력',
      ts('caption', { color: DESIGN.colors.text.secondary })).setOrigin(1, 0.5).setDepth(D);

    const powerText = this.add.text(s(slots.power.right), s(slots.power.y + 50),
      formatNumber(this.power),
      ts('display.lg', { color: hexToCSS(DESIGN.colors.brand.accent) }))
      .setOrigin(1, 0.5).setDepth(D);

    IconFactory.createImage(this, powerText.x - powerText.width - s(14), s(slots.power.y + 50),
      'atk', 'sm', { tint: DESIGN.colors.brand.accent })?.setDepth(D);
  }

  // ================================================================
  // 탭
  // ================================================================

  createTabBar() {
    this.tabButtons = [];

    computeTabSlots().forEach((slot) => {
      const cx = s(slot.centerX);
      const cy = s(slot.centerY);
      const w = s(slot.w);
      const h = s(slot.h);
      const active = slot.id === this.activeTab;

      const bg = this.add.graphics().setDepth(DEPTH.PANEL);
      this.paintTab(bg, w, h, cx, cy, active);

      const icon = IconFactory.createImage(this, cx - s(34), cy, slot.icon, 'sm', {
        tint: active ? this.cultColor : DESIGN.colors.rarityNamed.N.hex
      });
      icon?.setDepth(DEPTH.PANEL + 1);

      const label = this.add.text(cx + s(6), cy, slot.label, ts('label', {
        color: active ? this.cultCss : DESIGN.colors.text.secondary
      })).setOrigin(0.5).setDepth(DEPTH.PANEL + 1);

      this.createHitArea(cx, cy, w, h, () => this.switchTab(slot.id), DEPTH.PANEL + 2);

      this.tabButtons.push({ id: slot.id, bg, icon, label, cx, cy, w, h });
    });
  }

  /**
   * 탭 배경을 다시 그린다. 활성 탭만 교단색을 쓴다.
   * @private
   */
  paintTab(graphics, w, h, cx, cy, active) {
    const r = s(DESIGN.radius.md);
    graphics.clear();
    graphics.fillStyle(active ? this.cultColor : DESIGN.colors.bg.secondary, active ? 0.22 : 0.55);
    graphics.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
    graphics.lineStyle(s(active ? 2 : 1), active ? this.cultColor : DESIGN.colors.bg.surface, active ? 0.9 : 0.6);
    graphics.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
    if (active) {
      graphics.fillStyle(this.cultColor, 1);
      graphics.fillRect(cx - w * 0.28, cy + h / 2 - s(3), w * 0.56, s(3));
    }
  }

  /**
   * 탭을 바꾼다. 씬을 재시작하지 않고 콘텐츠만 다시 그린다.
   * @param {string} id - 탭 id
   */
  switchTab(id) {
    const next = resolveTabId(id);
    if (next === this.activeTab || this._tabSwitching) return;
    this.activeTab = next;

    this.tabButtons.forEach((tab) => {
      const active = tab.id === next;
      this.paintTab(tab.bg, tab.w, tab.h, tab.cx, tab.cy, active);
      tab.label.setColor(active ? this.cultCss : DESIGN.colors.text.secondary);
      if (tab.icon) {
        const key = HERO_DETAIL_TABS.find(t => t.id === tab.id)?.icon;
        const texture = IconFactory.create(this, key, 'sm', {
          tint: active ? this.cultColor : DESIGN.colors.rarityNamed.N.hex
        });
        if (texture) tab.icon.setTexture(texture);
      }
    });

    // 이전 탭 내용을 120ms 동안 지우고 새 내용을 올린다.
    // 즉시 교체하면 내용이 넘어가는 방향을 읽을 수 없다.
    const leaving = this.tabObjects.filter((obj) => obj && typeof obj.setAlpha === 'function');
    if (leaving.length === 0) {
      this.renderTab(next);
      return;
    }

    this._tabSwitching = true;
    this.tweens.add({
      targets: leaving,
      alpha: 0,
      duration: TAB_FADE_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this._tabSwitching = false;
        if (this.sys && this.sys.isActive()) this.renderTab(this.activeTab);
      }
    });
  }

  createContentPanel() {
    this.contentPanel = GlassPanel.create(this, {
      x: GAME_WIDTH / 2,
      y: s(L.content.y + L.content.h / 2),
      w: GAME_WIDTH - s(L.margin * 2),
      h: s(L.content.h),
      variant: GLASS_VARIANT.PANEL,
      tint: this.cultColor,
      bgKey: this.bgKey,
      depth: DEPTH.PANEL
    });
  }

  /**
   * 탭 콘텐츠를 그린다. 이전 탭이 만든 오브젝트는 전부 버린다.
   * @param {string} id - 탭 id
   */
  renderTab(id) {
    this.clearTabObjects();

    switch (id) {
      case 'skills': this.renderSkillsTab(); break;
      case 'equip': this.renderEquipTab(); break;
      case 'story': this.renderStoryTab(); break;
      case 'stats':
      default: this.renderStatsTab(); break;
    }

    // 콘텐츠 등장 — 아래에서 살짝 밀어 올린다
    this.tabObjects.forEach((obj, index) => {
      if (!obj || typeof obj.setAlpha !== 'function') return;
      obj.setAlpha(0);
      this.tweens.add({
        targets: obj,
        alpha: obj.__targetAlpha ?? 1,
        duration: TAB_FADE_MS,
        delay: Math.min(index, 8) * 10,
        ease: 'Quad.easeOut'
      });
    });
  }

  /** @private */
  clearTabObjects() {
    this.radarChart = null;
    this.tabObjects.forEach((obj) => {
      if (obj && typeof obj.destroy === 'function') obj.destroy();
    });
    this.tabObjects = [];
  }

  /** 탭 콘텐츠 오브젝트를 추적 목록에 넣는다 @private */
  track(...objects) {
    objects.forEach((obj) => { if (obj) this.tabObjects.push(obj); });
    return objects[0];
  }

  /** 탭 제목 @private */
  addTabTitle(text, sub) {
    const y = s(L.content.y + 34);
    this.track(this.add.text(s(L.margin + 24), y, text, ts('subtitle', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT));

    if (sub) {
      this.track(this.add.text(GAME_WIDTH - s(L.margin + 24), y, sub, ts('caption', {
        color: DESIGN.colors.text.muted
      })).setOrigin(1, 0.5).setDepth(DEPTH.CONTENT));
    }
    return y;
  }

  // ================================================================
  // 탭 1 — 능력치
  // ================================================================

  renderStatsTab() {
    this.addTabTitle('능력치', '장비 · 컬렉션 보너스 반영');

    const area = splitStatArea();
    const left = { ...area.left, y: area.left.y + 44 };
    const rows = computeStatRows(this.finalStats, { area: left, rowGap: 42 });

    rows.forEach((row) => {
      const cy = s(row.y);

      const icon = IconFactory.createImage(this, s(row.iconX), cy, row.key, 'sm', {
        tint: this.cultColor
      });
      icon?.setDepth(DEPTH.CONTENT);
      this.track(icon);

      // 라벨은 왼쪽 고정, 값은 오른쪽 고정. 네 행의 숫자 끝자리가 한 줄로 설다
      this.track(this.add.text(s(row.labelX), cy, row.label, ts('caption', {
        color: DESIGN.colors.text.secondary
      })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT));

      this.track(this.add.text(s(row.valueRight), cy, formatNumber(row.value), ts('num.md', {
        color: DESIGN.colors.text.primary
      })).setOrigin(1, 0.5).setDepth(DEPTH.CONTENT));

      // 바 — 트랙 + 교단색 채움
      const bar = this.add.graphics().setDepth(DEPTH.CONTENT);
      const bx = s(row.barX);
      const bw = s(row.barW);
      const bh = s(10);
      bar.fillStyle(DESIGN.colors.bg.surface, 0.9);
      bar.fillRoundedRect(bx, cy - bh / 2, bw, bh, bh / 2);
      if (row.fillW > 0) {
        bar.fillStyle(this.cultColor, 1);
        bar.fillRoundedRect(bx, cy - bh / 2, Math.max(s(row.fillW), bh), bh, bh / 2);
      }
      this.track(bar);
    });

    // 좌측 하단 — 이 수치가 어디서 왔는지. 스탯 행과 EXP 사이의 빈칸을 메운다
    this.renderStatSources(left, rows[rows.length - 1].y + 54);

    // 우측 — 레이더. 좌측 수치 열과 좌표가 겹치지 않는다
    const radar = computeRadarPlacement({ ...area.right, y: area.right.y + 30 });
    this.radarChart = new RadarChart(this, s(radar.cx), s(radar.cy), this.finalStats, {
      radius: s(radar.radius),
      rarity: this.rarityKey,
      maxStats: { hp: 2000, atk: 500, def: 400, spd: 150 },
      showAverage: true,
      averageStats: this.calculateAverageStats(this.rarityKey),
      previewStats: null
    });
    this.radarChart.setDepth(DEPTH.CONTENT);
    this.track(this.radarChart);

    // 경험치 진행 — 다음 레벨까지 얼마나 남았는지가 이 탭의 행동 유도다
    const exp = this.details?.expProgress;
    if (exp && exp.required > 0) {
      const y = s(L.content.y + L.content.h - 46);
      const barX = s(L.margin + 24);
      const barW = GAME_WIDTH - s((L.margin + 24) * 2);

      this.track(this.add.text(barX, y - s(22), `EXP  ${formatNumber(exp.current)} / ${formatNumber(exp.required)}`,
        ts('caption', { color: DESIGN.colors.text.secondary }))
        .setOrigin(0, 0.5).setDepth(DEPTH.CONTENT));

      this.track(this.add.text(barX + barW, y - s(22), `Lv.${this.hero.level} / ${this.details?.maxLevel ?? '-'}`,
        ts('num.sm', { color: DESIGN.colors.text.muted }))
        .setOrigin(1, 0.5).setDepth(DEPTH.CONTENT));

      const g = this.add.graphics().setDepth(DEPTH.CONTENT);
      const h = s(8);
      g.fillStyle(DESIGN.colors.bg.surface, 0.9);
      g.fillRoundedRect(barX, y, barW, h, h / 2);
      const ratio = Math.max(0, Math.min(1, exp.current / exp.required));
      if (ratio > 0) {
        g.fillStyle(DESIGN.colors.status.success, 1);
        g.fillRoundedRect(barX, y, Math.max(barW * ratio, h), h, h / 2);
      }
      this.track(g);
    }
  }

  /**
   * 최종 스탯의 출처를 세 줄로 보여준다 — 성급 / 장비 / 컬렉션.
   * ProgressionSystem 의 적용 순서(기본 → 성급% → 장비 가산 → 컬렉션 곱)와 같은 순서다.
   *
   * @param {{x:number,w:number}} area - 좌측 열
   * @param {number} top - 첫 줄 y (기획 좌표)
   */
  renderStatSources(area, top) {
    let starPercent = 0;
    let equipTotal = 0;
    let collectionPercent = 0;

    try {
      starPercent = ProgressionSystem.getStarBonus(this.stars).atk || 0;
      const equip = ProgressionSystem.getEquipmentBonus(this.hero);
      equipTotal = ['hp', 'atk', 'def', 'spd'].reduce((sum, k) => sum + (equip[k] || 0), 0);
      collectionPercent = Math.round((ProgressionSystem.getCollectionBonus(this.hero).atk || 0) * 100);
    } catch (e) {
      console.warn('[HeroDetail] 보너스 조회 실패:', e.message);
    }

    // 출처별로 색을 나눈다. 어느 경로가 지금 이 수치를 올리고 있는지 한눈에 보이게 한다
    const lines = [
      {
        label: '성급 보너스',
        value: `+${starPercent}%`,
        on: starPercent > 0,
        color: DESIGN.colors.brand.accent
      },
      {
        label: '장비 합계',
        value: `+${formatNumber(equipTotal)}`,
        on: equipTotal > 0,
        color: DESIGN.colors.status.info
      },
      {
        label: '컬렉션 보너스',
        value: `+${collectionPercent}%`,
        on: collectionPercent > 0,
        color: DESIGN.colors.status.success
      }
    ];

    lines.forEach((line, index) => {
      const y = s(top + index * 34);
      const dotColor = line.on ? line.color : DESIGN.colors.bg.surface;
      const valueColor = line.on ? hexToCSS(line.color) : DESIGN.colors.text.muted;

      const dot = this.add.circle(s(area.x + 12), y, s(5), dotColor, 1).setDepth(DEPTH.CONTENT);
      this.track(dot);

      this.track(this.add.text(s(area.x + 30), y, line.label, ts('caption', {
        color: line.on ? DESIGN.colors.text.secondary : DESIGN.colors.text.muted
      })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT));

      this.track(this.add.text(s(area.x + area.w - 10), y, line.value,
        ts('num.sm', { color: valueColor })).setOrigin(1, 0.5).setDepth(DEPTH.CONTENT));
    });
  }

  /**
   * UIX-2.3.1: 같은 등급 영웅의 평균 스탯 (레이더 비교선)
   * @param {string} rarity - 등급 키
   * @returns {{hp:number,atk:number,def:number,spd:number}}
   */
  calculateAverageStats(rarity) {
    const heroes = this.registry.get('ownedHeroes') || [];
    const sameRarityHeroes = heroes.filter(h => getRarityKey(h.rarity) === rarity);

    if (sameRarityHeroes.length === 0) {
      return { hp: 0, atk: 0, def: 0, spd: 0 };
    }

    const sum = sameRarityHeroes.reduce((acc, h) => ({
      hp: acc.hp + (h.stats?.hp || 0),
      atk: acc.atk + (h.stats?.atk || 0),
      def: acc.def + (h.stats?.def || 0),
      spd: acc.spd + (h.stats?.spd || 0)
    }), { hp: 0, atk: 0, def: 0, spd: 0 });

    return {
      hp: Math.floor(sum.hp / sameRarityHeroes.length),
      atk: Math.floor(sum.atk / sameRarityHeroes.length),
      def: Math.floor(sum.def / sameRarityHeroes.length),
      spd: Math.floor(sum.spd / sameRarityHeroes.length)
    };
  }

  // ================================================================
  // 탭 2 — 스킬
  // ================================================================

  renderSkillsTab() {
    const skillLevels = this.hero.skillLevels || [1, 1];
    const skills = (this.hero.skills && this.hero.skills.length > 0)
      ? this.hero.skills
      : (this.heroData.skills && this.heroData.skills.length > 0 ? this.heroData.skills : [
        { name: '기본 공격', description: '적에게 100% 피해를 입힌다' },
        { name: '특수 공격', description: '적에게 150% 피해를 입힌다' }
      ]);

    const gold = this.registry.get('gold') || 0;
    const books = this.registry.get('skillBooks') || 0;
    this.addTabTitle('스킬', `스킬북 ${formatNumber(books)}`);

    const visible = skills.slice(0, 3);
    const cards = computeCardStack(visible.length, { top: L.content.y + 66, cardH: 96, gap: 14 });
    const maxSkillLevel = ProgressionSystem.MAX_SKILL_LEVEL || 10;

    visible.forEach((skill, index) => {
      const card = cards[index];
      const cy = s(card.centerY);
      const level = skillLevels[index] || 1;

      const bg = this.add.graphics().setDepth(DEPTH.CONTENT);
      bg.fillStyle(DESIGN.colors.bg.secondary, 0.55);
      bg.fillRoundedRect(s(card.x), s(card.y), s(card.w), s(card.h), s(DESIGN.radius.md));
      bg.lineStyle(s(1), this.cultColor, 0.28);
      bg.strokeRoundedRect(s(card.x), s(card.y), s(card.w), s(card.h), s(DESIGN.radius.md));
      this.track(bg);

      // 카드를 아이콘 · 텍스트 · 버튼 세 열로 나눈다. 세 열의 세로 중심이 모두 카드 중심이다
      const parts = computeSkillCardParts(card);

      // 1열 — 아이콘 배지 + 레벨
      const badgeX = s(parts.icon.centerX);
      const badge = this.add.circle(badgeX, cy - s(8), s(28), this.cultColor, 0.18).setDepth(DEPTH.CONTENT);
      badge.setStrokeStyle(s(2), this.cultColor, 0.7);
      this.track(badge);

      const icon = IconFactory.createImage(this, badgeX, cy - s(8), 'atk', 'sm', { tint: this.cultColor });
      icon?.setDepth(DEPTH.CONTENT + 1);
      this.track(icon);

      this.track(this.add.text(badgeX, cy + s(26), `Lv.${level}/${maxSkillLevel}`, ts('num.sm', {
        color: level >= maxSkillLevel
          ? hexToCSS(DESIGN.colors.brand.accent)
          : DESIGN.colors.text.secondary
      })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 1));

      // 2열 — 이름 · 설명
      const textX = s(parts.text.x);
      this.track(this.add.text(textX, cy - s(18), skill.name || `스킬 ${index + 1}`, ts('body', {
        color: DESIGN.colors.text.primary
      })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT + 1));

      this.track(this.add.text(textX, cy + s(16), truncate(skill.description || '스킬 설명', 30), ts('caption', {
        color: DESIGN.colors.text.secondary,
        wordWrap: { width: s(parts.text.w) }
      })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT + 1));

      // 3열 — 강화 버튼. 터치 타겟 112x56 (기획)
      const btnX = s(parts.button.centerX);
      if (level < maxSkillLevel) {
        const cost = level * level * 1000;
        const enabled = gold >= cost;

        const btn = this.add.graphics().setDepth(DEPTH.CONTENT + 1);
        btn.fillStyle(enabled ? DESIGN.colors.status.success : DESIGN.colors.bg.surface, enabled ? 0.92 : 0.7);
        btn.fillRoundedRect(btnX - s(56), cy - s(28), s(112), s(56), s(DESIGN.radius.md));
        if (!enabled) {
          btn.lineStyle(s(1), DESIGN.colors.bg.surface, 1);
          btn.strokeRoundedRect(btnX - s(56), cy - s(28), s(112), s(56), s(DESIGN.radius.md));
        }
        this.track(btn);

        this.track(this.add.text(btnX, cy - s(8), '강화', ts('label', {
          color: enabled ? '#FFFFFF' : DESIGN.colors.text.muted
        })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 2));

        this.track(this.add.text(btnX, cy + s(14), formatNumber(cost), ts('num.sm', {
          color: enabled ? '#FFFFFF' : DESIGN.colors.text.muted
        })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 2));

        this.track(this.createHitArea(btnX, cy, s(112), s(56), () => this.enhanceSkill(index), DEPTH.CONTENT + 3));
      } else {
        const maxBg = this.add.graphics().setDepth(DEPTH.CONTENT + 1);
        maxBg.lineStyle(s(2), DESIGN.colors.brand.accent, 0.6);
        maxBg.strokeRoundedRect(btnX - s(56), cy - s(28), s(112), s(56), s(DESIGN.radius.md));
        this.track(maxBg);

        this.track(this.add.text(btnX, cy, 'MAX', ts('label', {
          color: hexToCSS(DESIGN.colors.brand.accent)
        })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 2));
      }
    });

    // 카드 아래 빈칸 — 강화가 전투력에 어떻게 반영되는지 한 줄로 못 박는다
    const lastCard = cards[cards.length - 1];
    const footTop = (lastCard ? lastCard.y + lastCard.h : L.content.y + 90) + 30;
    const footY = s(footTop + 26);
    const foot = this.add.graphics().setDepth(DEPTH.CONTENT);
    foot.fillStyle(DESIGN.colors.bg.secondary, 0.4);
    foot.fillRoundedRect(s(L.margin + 24), s(footTop), GAME_WIDTH - s((L.margin + 24) * 2), s(52),
      s(DESIGN.radius.md));
    this.track(foot);

    const skillPower = skillLevels.reduce((sum, lv) => sum + (Number(lv) || 0), 0) *
      (ProgressionSystem.POWER_PER_SKILL_LEVEL || 10);

    this.track(this.add.text(s(L.margin + 44), footY, '스킬 전투력 기여', ts('caption', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT + 1));

    this.track(this.add.text(GAME_WIDTH - s(L.margin + 44), footY, `+${formatNumber(skillPower)}`,
      ts('num.md', { color: hexToCSS(DESIGN.colors.brand.accent) }))
      .setOrigin(1, 0.5).setDepth(DEPTH.CONTENT + 1));
  }

  // ================================================================
  // 탭 3 — 장비
  // ================================================================

  renderEquipTab() {
    const equipped = this.hero.equipment || {};
    const equippedCount = EQUIP_SLOT_ORDER.filter(key => equipped[key]).length;

    this.addTabTitle('장비', `${equippedCount} / ${EQUIP_SLOT_ORDER.length} 장착`);

    const slots = computeEquipSlots(EQUIP_SLOT_ORDER.length, { top: L.content.y + 74 });
    const bonus = { hp: 0, atk: 0, def: 0, spd: 0 };

    EQUIP_SLOT_ORDER.forEach((slotKey, index) => {
      const cell = slots[index];
      const cx = s(cell.centerX);
      const cy = s(cell.centerY);
      const item = equipped[slotKey];
      const meta = EQUIPMENT_SLOTS[slotKey] || { name: slotKey, icon: slotKey };

      let bgColor = DESIGN.colors.bg.secondary;
      let bgAlpha = 0.5;
      let borderColor = DESIGN.colors.bg.surface;
      let borderAlpha = 0.8;

      if (item) {
        const set = RARITY_COLORS[getRarityKey(item.rarity)] || RARITY_COLORS.N;
        bgColor = set.bg;
        bgAlpha = 0.55;
        borderColor = set.border;
        borderAlpha = 1;

        const stats = item.stats || {};
        bonus.hp += Number(stats.HP || stats.hp) || 0;
        bonus.atk += Number(stats.ATK || stats.atk) || 0;
        bonus.def += Number(stats.DEF || stats.def) || 0;
        bonus.spd += Number(stats.SPD || stats.spd) || 0;
      }

      const box = this.add.graphics().setDepth(DEPTH.CONTENT);
      box.fillStyle(bgColor, bgAlpha);
      box.fillRoundedRect(s(cell.x), s(cell.y), s(cell.w), s(cell.h), s(DESIGN.radius.lg));
      box.lineStyle(s(2), borderColor, borderAlpha);
      box.strokeRoundedRect(s(cell.x), s(cell.y), s(cell.w), s(cell.h), s(DESIGN.radius.lg));
      this.track(box);

      const iconKey = IconFactory.has(meta.icon) ? meta.icon : (EQUIP_ICON[slotKey] || 'inventory');
      const icon = IconFactory.createImage(this, cx, cy - s(10), iconKey, 'lg', {
        tint: item ? DESIGN.colors.brand.accent : DESIGN.colors.rarityNamed.N.hex
      });
      if (icon) {
        icon.setDepth(DEPTH.CONTENT + 1);
        // 빈 슬롯 아이콘은 반투명으로 남긴다 (등장 트윈의 목표 알파를 지정)
        if (!item) icon.__targetAlpha = 0.3;
        this.track(icon);
      }

      if (item) {
        this.track(this.add.text(cx, cy + s(30), `+${item.enhanceLevel || 0}`, ts('num.sm', {
          color: hexToCSS(DESIGN.colors.brand.accent)
        })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 1));
      } else {
        this.track(this.add.text(cx, cy + s(30), '+', ts('subtitle', {
          color: DESIGN.colors.text.muted
        })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 1));
      }

      this.track(this.add.text(cx, s(cell.y + cell.h + 20), meta.name, ts('caption', {
        color: DESIGN.colors.text.secondary
      })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 1));

      const hit = this.createHitArea(cx, cy, s(cell.w), s(cell.h), () => {
        if (item) this.showEquipmentOptions(slotKey, item);
        else this.showEquipmentList(slotKey);
      }, DEPTH.CONTENT + 2);
      this.track(hit);

      // 호버 시 레이더 프리뷰는 능력치 탭에서만 의미가 있다. 여기서는 툴팁만 띄운다.
      if (item) {
        hit.on('pointerover', () => {
          const stats = item.stats || {};
          const lines = Object.entries(stats).map(([k, v]) => `${k} +${v}`).join('\n');
          this.showTooltip(cx, s(cell.y) - s(20), `${item.name}\n${getRarityKey(item.rarity)} +${item.enhanceLevel || 0}\n${lines}`);
        });
        hit.on('pointerout', () => this.hideTooltip());
      }
    });

    // 빈 슬롯 안내 — 무엇을 눌러야 하는지 말해준다. 전부 채웠으면 다른 문장을 쓴다.
    // 위치는 슬롯 라벨(+20)에서 파생해 라벨과 붙지 않게 한다.
    const lastCell = slots[slots.length - 1];
    const guideY = s(lastCell.y + lastCell.h + 56);
    const allFilled = equippedCount === EQUIP_SLOT_ORDER.length;
    this.track(this.add.text(GAME_WIDTH / 2, guideY,
      allFilled ? '슬롯을 눌러 장비를 교체하거나 해제할 수 있습니다' : '비어 있는 칸을 눌러 장비를 장착하세요',
      ts('caption', {
        color: allFilled ? DESIGN.colors.text.muted : this.cultCss,
        align: 'center'
      })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 1));

    // 장비 합계 — 슬롯 아래 여백을 채우는 요약 줄
    const summaryY = s(L.content.y + L.content.h - 74);
    const g = this.add.graphics().setDepth(DEPTH.CONTENT);
    g.fillStyle(DESIGN.colors.bg.secondary, 0.45);
    g.fillRoundedRect(s(L.margin + 24), summaryY - s(28), GAME_WIDTH - s((L.margin + 24) * 2), s(56), s(DESIGN.radius.md));
    this.track(g);

    this.track(this.add.text(s(L.margin + 44), summaryY, '장비 합계', ts('caption', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT + 1));

    const summary = ['hp', 'atk', 'def', 'spd']
      .map(k => `${k.toUpperCase()} +${formatNumber(bonus[k])}`)
      .join('   ');
    this.track(this.add.text(GAME_WIDTH - s(L.margin + 44), summaryY, summary, ts('num.sm', {
      color: bonus.hp + bonus.atk + bonus.def + bonus.spd > 0
        ? hexToCSS(DESIGN.colors.brand.accent)
        : DESIGN.colors.text.muted
    })).setOrigin(1, 0.5).setDepth(DEPTH.CONTENT + 1));
  }

  // ================================================================
  // 탭 4 — 이야기
  // ================================================================

  renderStoryTab() {
    const cultInfo = this.resolveCultInfo(this.cultId);
    this.addTabTitle('이야기', cultInfo ? cultInfo.name : '무소속');

    const x = s(L.margin + 24);
    const wrapW = GAME_WIDTH - s((L.margin + 24) * 2);
    let y = s(L.content.y + 84);

    const identity = this.heroData.identity || this.heroData.description || null;
    if (identity) {
      const text = this.add.text(x, y, identity, ts('body', {
        color: DESIGN.colors.text.primary,
        wordWrap: { width: wrapW }
      })).setDepth(DEPTH.CONTENT);
      this.track(text);
      y += text.height + s(24);
    }

    if (cultInfo) {
      const bar = this.add.graphics().setDepth(DEPTH.CONTENT);
      bar.fillStyle(this.cultColor, 0.85);
      bar.fillRect(x, y, s(4), s(52));
      this.track(bar);

      this.track(this.add.text(x + s(18), y + s(10), `${cultInfo.name} · ${cultInfo.origin}`, ts('label', {
        color: this.cultCss
      })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT));

      this.track(this.add.text(x + s(18), y + s(38), truncate(cultInfo.description, 34), ts('caption', {
        color: DESIGN.colors.text.secondary
      })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT));

      y += s(78);
    }

    // 대사 — 있으면 인용문으로. 이 화면에서 캐릭터의 목소리가 들리는 유일한 자리다
    const voice = this.heroData.voiceLines || {};
    const line = voice.obtained || voice.battle || voice.skill || null;
    if (line) {
      const quote = this.add.text(x, y, `“${line}”`, ts('body', {
        color: this.cultCss,
        fontStyle: 'italic',
        wordWrap: { width: wrapW }
      })).setDepth(DEPTH.CONTENT);
      this.track(quote);
      y += quote.height + s(20);
    }

    // 전직 영웅이면 원본 영웅의 해당 경로 로어를 붙인다.
    // 이 영웅이 "무엇에서 무엇이 되었는지"를 이 화면에서만 읽을 수 있다.
    const loreHint = this.resolveAscensionLore();
    if (loreHint) {
      this.track(this.add.text(x, y, '전직 기록', ts('label', {
        color: DESIGN.colors.text.secondary
      })).setDepth(DEPTH.CONTENT));
      y += s(32);

      const lore = this.add.text(x, y, loreHint, ts('body', {
        color: DESIGN.colors.text.primary,
        wordWrap: { width: wrapW }
      })).setDepth(DEPTH.CONTENT);
      this.track(lore);
      y += lore.height + s(24);
    }

    // 전직 경로 힌트 (기본 영웅) — 다음 행동을 알려준다
    const routes = this.heroData.ascensionRoutes;
    if (Array.isArray(routes) && routes.length > 0) {
      this.track(this.add.text(x, y, '전직 경로', ts('label', {
        color: DESIGN.colors.text.secondary
      })).setDepth(DEPTH.CONTENT));
      y += s(30);

      routes.slice(0, 3).forEach((route) => {
        const color = getCultColor(route.cultId);
        const dot = this.add.circle(x + s(6), y + s(10), s(6), color, 1).setDepth(DEPTH.CONTENT);
        this.track(dot);

        const name = this.resolveCultInfo(route.cultId)?.name || route.cultId;
        const keywords = (route.routeKeywords || []).join(' · ');
        this.track(this.add.text(x + s(24), y + s(10), `${name}   ${keywords}`, ts('caption', {
          color: DESIGN.colors.text.secondary
        })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT));
        y += s(32);
      });
    }

    if (!identity && !line && !cultInfo && !loreHint) {
      this.track(this.add.text(GAME_WIDTH / 2, s(L.content.y + L.content.h / 2),
        '아직 기록되지 않은 영웅입니다', ts('body', {
          color: DESIGN.colors.text.muted,
          align: 'center'
        })).setOrigin(0.5).setDepth(DEPTH.CONTENT));
    }
  }

  /**
   * 전직 영웅의 로어 한 줄을 원본 영웅의 전직 경로에서 찾는다.
   * ascended-heroes.json 에는 로어가 없고 base-heroes.json 의 ascensionRoutes 에 있다.
   *
   * @returns {string|null} 경로 로어. 기본 영웅이거나 찾지 못하면 null
   */
  resolveAscensionLore() {
    const baseId = this.heroData.baseHeroId;
    if (!baseId || !this.cultId) return null;

    const base = getCharacterOrHero(baseId);
    const routes = base && Array.isArray(base.ascensionRoutes) ? base.ascensionRoutes : null;
    if (!routes) return null;

    const route = routes.find((r) => r.cultId === this.cultId || r.ascendedHeroId === this.hero.id);
    return route && route.loreHint ? route.loreHint : null;
  }

  // ================================================================
  // 액션 바
  // ================================================================

  /**
   * 액션 바. 버튼은 지금 누를 수 있는지를 스스로 말한다 —
   * 재화가 모자라거나 최대 레벨·최고 등급이면 흐려지고 부제에 이유가 붙는다.
   * 눌러도 되지만 기존 안내 메시지가 그대로 뜬다(로직 불변, 표시만 추가).
   */
  createActionBar() {
    const gold = this.registry.get('gold') || 0;
    const levelCost = this.hero.level * 100;
    const maxLevel = this.details?.maxLevel ?? ACTION_MAX_LEVEL[this.rarityKey] ?? 60;
    const isMaxLevel = this.hero.level >= maxLevel;
    const canLevelUp = !isMaxLevel && gold >= levelCost;
    const canEvolve = !EvolutionSystem.isMaxRarity(this.hero.rarity);

    const actions = [
      {
        label: '레벨업',
        sub: isMaxLevel ? '최대 레벨' : formatNumber(levelCost),
        key: 'btn_primary',
        tint: null,
        enabled: canLevelUp,
        onPress: () => this.levelUpHero()
      },
      {
        label: '자동 레벨업',
        sub: isMaxLevel ? '최대 레벨' : '가능한 만큼',
        key: 'btn_secondary',
        tint: null,
        enabled: canLevelUp,
        onPress: () => this.autoLevelUp()
      },
      {
        label: '진화',
        sub: canEvolve ? '조각 필요' : '최고 등급',
        key: canEvolve ? 'btn_secondary' : 'btn_ghost',
        tint: canEvolve ? DESIGN.colors.brand.secondary : DESIGN.colors.rarityNamed.N.hex,
        enabled: canEvolve,
        onPress: () => this.evolveHero()
      }
    ];

    computeActionSlots(actions.length).forEach((slot, index) => {
      const action = actions[index];
      const cx = s(slot.centerX);
      const cy = s(slot.centerY);
      const w = s(slot.w);
      const h = s(slot.h);

      const frame = NineSliceFrame.create(this, {
        x: cx, y: cy, w, h,
        key: action.key,
        tint: action.enabled ? action.tint : DESIGN.colors.rarityNamed.N.hex,
        alpha: action.enabled ? 1 : 0.42,
        depth: DEPTH.ACTION
      });

      const label = this.add.text(cx, cy, action.label, ts('label', {
        color: action.enabled ? DESIGN.colors.text.primary : DESIGN.colors.text.muted
      })).setOrigin(0.5).setDepth(DEPTH.ACTION + 1);

      // 부제는 버튼 밖 아래에 둔다. 9-slice 장식 띠가 두꺼워 안에 넣으면 글자가 물린다
      const sub = this.add.text(cx, s(L.actionBar.y + L.actionBar.h + 14), action.sub, ts('num.sm', {
        color: action.enabled ? DESIGN.colors.text.secondary : DESIGN.colors.text.muted
      })).setOrigin(0.5).setDepth(DEPTH.ACTION + 1).setAlpha(action.enabled ? 1 : 0.7);

      const hit = this.createHitArea(cx, cy, w, h, action.onPress, DEPTH.ACTION + 2);

      if (action.enabled) {
        hit.on('pointerover', () => { frame.setScale?.(1.03); label.setScale(1.03); sub.setScale(1.03); });
        hit.on('pointerout', () => { frame.setScale?.(1); label.setScale(1); sub.setScale(1); });
      }
    });
  }

  /**
   * 보이지 않는 터치 영역을 만든다. 9-slice·Graphics 어느 쪽이든 같은 방식으로 눌린다.
   *
   * @param {number} x - 중심 x (렌더 px)
   * @param {number} y - 중심 y (렌더 px)
   * @param {number} w - 너비 (렌더 px)
   * @param {number} h - 높이 (렌더 px)
   * @param {Function} onPress - 탭 콜백
   * @param {number} depth
   * @returns {Phaser.GameObjects.Rectangle}
   */
  createHitArea(x, y, w, h, onPress, depth) {
    const min = s(DESIGN.touch.minTarget);
    const rect = this.add.rectangle(x, y, Math.max(w, min), Math.max(h, min), 0xffffff, 0)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });

    rect.on('pointerdown', () => {
      this.tweens.add({ targets: rect, scale: 0.97, duration: 60, yoyo: true });
      onPress();
    });
    return rect;
  }

  /**
   * 화면을 떠난다. 120ms 페이드로 끊기지 않게 넘긴다.
   * 내비게이션 스택이 비어 있으면(씬을 직접 열었을 때) 영웅 목록으로 돌린다 —
   * 뒤로가 아무 일도 하지 않는 막다른 화면이 되지 않게 한다.
   */
  goBack() {
    if (this._leaving) return;
    this._leaving = true;

    this.cameras.main.fadeOut(TAB_FADE_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this._leaving = false;
      if (!navigationManager.goBack(this)) {
        this.scene.start('HeroListScene');
      }
    });
  }

  /**
   * 같은 영웅으로 화면을 다시 그린다. 전신 텍스처는 유지해 깜빡임을 막는다.
   * @param {string} [tab] - 되돌아갈 탭. 생략하면 현재 탭
   */
  refresh(tab) {
    this._keepFullbody = true;
    this.scene.restart({ heroId: this.heroId, tab: tab || this.activeTab });
  }

  // ================================================================
  // 기능 — 스킬 강화 / 레벨업 / 진화 / 장비 (로직 불변, 콜백만 재배치)
  // ================================================================

  enhanceSkill(skillIndex) {
    const gold = this.registry.get('gold') || 0;
    const skillBooks = this.registry.get('skillBooks') || 0;
    const currentLevel = (this.hero.skillLevels || [1, 1])[skillIndex] || 1;

    const goldCost = currentLevel * currentLevel * 1000;
    const bookCost = Math.ceil(Math.pow(1.5, currentLevel - 1));

    if (gold < goldCost) {
      this.showMessage(`골드가 부족합니다! (${goldCost} 필요)`);
      return;
    }

    if (skillBooks < bookCost) {
      this.showMessage(`스킬북이 부족합니다! (${bookCost} 필요)`);
      return;
    }

    this.registry.set('gold', gold - goldCost);
    this.registry.set('skillBooks', skillBooks - bookCost);

    if (!this.hero.skillLevels) {
      this.hero.skillLevels = [1, 1];
    }
    this.hero.skillLevels[skillIndex] = currentLevel + 1;

    const heroes = this.registry.get('ownedHeroes') || [];
    const heroIndex = heroes.findIndex(h => h.id === this.hero.id);
    if (heroIndex >= 0) {
      heroes[heroIndex] = this.hero;
      this.registry.set('ownedHeroes', heroes);
    }
    this.persistHeroData();

    this.showMessage(`스킬 Lv.${currentLevel + 1} 달성!`, COLORS.success);

    this.time.delayedCall(300, () => this.refresh('skills'));
  }

  showEquipmentOptions(slotKey, equipment) {
    const popup = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(Z_INDEX.MODAL);

    const panel = GlassPanel.create(this, {
      x: 0, y: 0, w: s(420), h: s(300),
      variant: GLASS_VARIANT.POPUP,
      tint: this.cultColor
    });
    popup.add(panel);

    popup.add(this.add.text(0, s(-100), equipment.name, ts('subtitle', {
      color: DESIGN.colors.text.primary, align: 'center'
    })).setOrigin(0.5));

    popup.add(this.add.text(0, s(-60), `${getRarityKey(equipment.rarity)} +${equipment.enhanceLevel || 0}`,
      ts('caption', { color: DESIGN.colors.text.secondary })).setOrigin(0.5));

    const unequipBg = this.add.rectangle(0, s(-4), s(260), s(72), DESIGN.colors.status.error, 0.9)
      .setInteractive({ useHandCursor: true });
    popup.add(unequipBg);
    popup.add(this.add.text(0, s(-4), '장비 해제', ts('label', { color: '#FFFFFF' })).setOrigin(0.5));

    const closeBg = this.add.rectangle(0, s(88), s(260), s(72), DESIGN.colors.bg.surface, 0.95)
      .setInteractive({ useHandCursor: true });
    popup.add(closeBg);
    popup.add(this.add.text(0, s(88), '닫기', ts('label', { color: DESIGN.colors.text.secondary })).setOrigin(0.5));

    unequipBg.on('pointerdown', () => {
      if (!this.hero.equipment) this.hero.equipment = {};
      this.hero.equipment[slotKey] = null;

      const heroes = this.registry.get('ownedHeroes') || [];
      const heroIndex = heroes.findIndex(h => h.id === this.hero.id);
      if (heroIndex >= 0) {
        heroes[heroIndex] = this.hero;
        this.registry.set('ownedHeroes', heroes);
      }
      this.persistHeroData();

      popup.destroy();
      this.showMessage('장비 해제 완료!');
      this.time.delayedCall(200, () => this.refresh('equip'));
    });

    closeBg.on('pointerdown', () => popup.destroy());
  }

  showEquipmentList(slotKey) {
    this.showMessage(`${EQUIPMENT_SLOTS[slotKey]?.name || slotKey} 장비 선택 준비 중!`);
  }

  autoLevelUp() {
    const gold = this.registry.get('gold') || 0;
    let totalLevels = 0;
    let totalCost = 0;

    while (true) {
      const cost = this.hero.level * 100;
      if (gold - totalCost < cost) break;

      totalCost += cost;
      this.hero.level++;
      totalLevels++;

      this.hero.stats.hp = Math.floor(this.hero.stats.hp * 1.05);
      this.hero.stats.atk = Math.floor(this.hero.stats.atk * 1.03);
      this.hero.stats.def = Math.floor(this.hero.stats.def * 1.03);
      this.hero.stats.spd = Math.floor(this.hero.stats.spd * 1.01);

      const maxLevels = { N: 30, R: 40, SR: 50, SSR: 60 };
      if (this.hero.level >= (maxLevels[this.hero.rarity] || 60)) break;
    }

    if (totalLevels === 0) {
      this.showMessage('골드가 부족합니다!');
      return;
    }

    this.registry.set('gold', gold - totalCost);

    const heroes = this.registry.get('ownedHeroes') || [];
    const heroIndex = heroes.findIndex(h => h.id === this.hero.id);
    if (heroIndex >= 0) {
      heroes[heroIndex] = this.hero;
      this.registry.set('ownedHeroes', heroes);
    }
    this.persistHeroData();

    this.showMessage(`+${totalLevels} 레벨! (Lv.${this.hero.level})`, COLORS.success);

    this.time.delayedCall(300, () => this.refresh());
  }

  evolveHero() {
    if (EvolutionSystem.isMaxRarity(this.hero.rarity)) {
      this.showMessage('이미 최고 등급입니다!');
      return;
    }

    const cost = EvolutionSystem.getEvolutionCost(this.hero.rarity);
    const gold = this.registry.get('gold') || 0;
    const shards = this.registry.get(`shards_${this.hero.id}`) || 0;

    if (gold < cost.gold) {
      this.showMessage(`골드가 부족합니다! (${cost.gold} 필요)`);
      return;
    }

    if (shards < cost.shards) {
      this.showMessage(`조각이 부족합니다! (${shards}/${cost.shards})`);
      return;
    }

    this.showEvolutionPreview(cost, shards);
  }

  showEvolutionPreview(cost) {
    const preview = EvolutionSystem.previewEvolution(this.hero.id);
    if (!preview) {
      this.showMessage('진화 정보를 불러올 수 없습니다!');
      return;
    }

    const popup = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(Z_INDEX.MODAL);

    popup.add(GlassPanel.create(this, {
      x: 0, y: 0, w: s(520), h: s(440),
      variant: GLASS_VARIANT.POPUP,
      tint: this.cultColor
    }));

    popup.add(this.add.text(0, s(-170), '진화 확인', ts('subtitle', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5));

    popup.add(this.add.text(0, s(-110), `${preview.currentRarity} → ${preview.nextRarity}`,
      ts('display.lg', { color: hexToCSS(RARITY[preview.nextRarity].color) })).setOrigin(0.5));

    popup.add(this.add.text(0, s(-40),
      `HP +${preview.statGain.hp}   ATK +${preview.statGain.atk}\nDEF +${preview.statGain.def}   SPD +${preview.statGain.spd}`,
      ts('num.md', { color: hexToCSS(DESIGN.colors.status.success), align: 'center' })).setOrigin(0.5));

    popup.add(this.add.text(0, s(50), `비용  ${formatNumber(cost.gold)} 골드 · ${cost.shards} 조각`,
      ts('caption', { color: DESIGN.colors.text.secondary })).setOrigin(0.5));

    const confirmBg = this.add.rectangle(s(-100), s(140), s(180), s(76), DESIGN.colors.brand.secondary, 0.95)
      .setInteractive({ useHandCursor: true });
    popup.add(confirmBg);
    popup.add(this.add.text(s(-100), s(140), '진화', ts('label', { color: '#FFFFFF' })).setOrigin(0.5));

    const cancelBg = this.add.rectangle(s(100), s(140), s(180), s(76), DESIGN.colors.bg.surface, 0.95)
      .setInteractive({ useHandCursor: true });
    popup.add(cancelBg);
    popup.add(this.add.text(s(100), s(140), '취소', ts('label', { color: DESIGN.colors.text.secondary })).setOrigin(0.5));

    confirmBg.on('pointerdown', () => {
      popup.destroy();
      this.executeEvolution(cost, preview);
    });

    cancelBg.on('pointerdown', () => popup.destroy());
  }

  executeEvolution(cost, preview) {
    const gold = this.registry.get('gold') || 0;
    const shards = this.registry.get(`shards_${this.hero.id}`) || 0;

    this.registry.set('gold', gold - cost.gold);
    this.registry.set(`shards_${this.hero.id}`, shards - cost.shards);

    this.hero.rarity = preview.nextRarity;
    this.hero.stats.hp = preview.previewStats.hp;
    this.hero.stats.atk = preview.previewStats.atk;
    this.hero.stats.def = preview.previewStats.def;
    this.hero.stats.spd = preview.previewStats.spd;

    if (this.hero.skillLevels && preview.skillBoost > 0) {
      this.hero.skillLevels = this.hero.skillLevels.map(lv => Math.min(10, lv + preview.skillBoost));
    }

    this.hero.evolutionCount = (this.hero.evolutionCount || 0) + 1;

    const heroes = this.registry.get('ownedHeroes') || [];
    const heroIndex = heroes.findIndex(h => h.id === this.hero.id);
    if (heroIndex >= 0) {
      heroes[heroIndex] = this.hero;
      this.registry.set('ownedHeroes', heroes);
    }
    this.persistHeroData();

    this.showEvolutionSuccess(preview.nextRarity);
  }

  showEvolutionSuccess(newRarity) {
    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT,
      RARITY[newRarity].color, 0.8).setDepth(Z_INDEX.MODAL + 50);

    const successText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `${newRarity} 진화 성공!`,
      ts('display.lg', { color: '#FFFFFF' })).setOrigin(0.5).setDepth(Z_INDEX.MODAL + 51);

    this.tweens.add({
      targets: [flash, successText],
      alpha: 0,
      duration: 1500,
      delay: 800,
      onComplete: () => {
        flash.destroy();
        successText.destroy();
        this.refresh('stats');
      }
    });
  }

  levelUpHero() {
    if (this.isLevelingUp) {
      return;
    }

    const gold = this.registry.get('gold') || 0;
    const cost = this.hero.level * 100;

    if (gold < cost) {
      this.showMessage(`골드가 부족합니다! (${cost} 필요)`);
      return;
    }

    const maxLevels = { N: 30, R: 40, SR: 50, SSR: 60 };
    if (this.hero.level >= (maxLevels[this.hero.rarity] || 60)) {
      this.showMessage('최대 레벨입니다!');
      return;
    }

    this.isLevelingUp = true;

    this.registry.set('gold', gold - cost);
    this.hero.level++;

    this.hero.stats.hp = Math.floor(this.hero.stats.hp * 1.05);
    this.hero.stats.atk = Math.floor(this.hero.stats.atk * 1.03);
    this.hero.stats.def = Math.floor(this.hero.stats.def * 1.03);
    this.hero.stats.spd = Math.floor(this.hero.stats.spd * 1.01);

    const heroes = this.registry.get('ownedHeroes') || [];
    const heroIndex = heroes.findIndex(h => h.id === this.hero.id);
    if (heroIndex >= 0) {
      heroes[heroIndex] = this.hero;
      this.registry.set('ownedHeroes', heroes);
    }
    this.persistHeroData();

    this.showLevelUpEffect();
  }

  showLevelUpEffect() {
    // SND-02: 레벨업 효과음 (수동/자동 레벨업 공통 지점)
    soundManager.playSFX('levelup');

    this.stopAllActiveTweens();

    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT,
      DESIGN.colors.status.success, 0.3).setDepth(Z_INDEX.MODAL);

    const levelText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `Lv.${this.hero.level}!`,
      ts('display.xl', { color: hexToCSS(DESIGN.colors.status.success) }))
      .setOrigin(0.5).setDepth(Z_INDEX.MODAL + 1);

    const tween = this.tweens.add({
      targets: [flash, levelText],
      alpha: 0,
      y: levelText.y - s(30),
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        flash.destroy();
        levelText.destroy();

        this.cameras.main.fadeOut(150, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.isLevelingUp = false;
          this.refresh();
        });
      }
    });

    this.activeTweens.push(tween);
  }

  stopAllActiveTweens() {
    this.activeTweens.forEach(tween => {
      if (tween && tween.isPlaying && tween.isPlaying()) {
        tween.stop();
      }
    });
    this.activeTweens = [];
  }

  showTooltip(x, y, text) {
    this.hideTooltip();

    this.tooltip = this.add.container(x, y).setDepth(Z_INDEX.TOOLTIP);

    const label = this.add.text(0, 0, text, ts('caption', {
      color: DESIGN.colors.text.primary,
      align: 'center',
      wordWrap: { width: s(220) }
    })).setOrigin(0.5);

    const panel = GlassPanel.create(this, {
      x: 0, y: 0,
      w: label.width + s(32),
      h: label.height + s(24),
      variant: GLASS_VARIANT.POPUP,
      tint: this.cultColor
    });

    this.tooltip.add([panel, label]);
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  /**
   * 영웅 데이터를 SaveManager에 영속화
   */
  persistHeroData() {
    try {
      if (this.hero && this.hero.id) {
        SaveManager.updateCharacter(this.hero.id, {
          level: this.hero.level,
          exp: this.hero.exp || 0,
          rarity: this.hero.rarity,
          stats: this.hero.stats,
          skillLevels: this.hero.skillLevels,
          evolutionCount: this.hero.evolutionCount || 0,
          equipment: this.hero.equipment || null
        });
      }
      const saveData = SaveManager.load();
      const gold = this.registry.get('gold');
      if (gold !== undefined) {
        saveData.resources.gold = gold;
      }
      const skillBooks = this.registry.get('skillBooks');
      if (skillBooks !== undefined) {
        saveData.resources.skillBooks = skillBooks;
      }
      if (this.hero && this.hero.id) {
        const shards = this.registry.get(`shards_${this.hero.id}`);
        if (shards !== undefined) {
          if (!saveData.resources.characterShards) {
            saveData.resources.characterShards = {};
          }
          saveData.resources.characterShards[this.hero.id] = shards;
        }
      }
      SaveManager.save(saveData);
    } catch (e) {
      console.warn('[HeroDetail] Save error:', e.message);
    }
  }

  shutdown() {
    // T-29: 이 씬이 직접 로드한 것만 해제한다.
    // 512 런타임 텍스처는 PreloadScene 소유의 공용 자산이므로 여기서 지우면
    // 메인 메뉴·영웅 목록이 플레이스홀더로 되돌아간다.
    if (this._hiresKey && this.textures.exists(this._hiresKey)) {
      this.textures.remove(this._hiresKey);
      this._hiresKey = null;
    }

    // 같은 영웅으로 다시 그리는 중이면 전신 시트를 남긴다(재로드 깜빡임 방지).
    if (this._keepFullbody) {
      this._keepFullbody = false;
    } else if (this._fullbodyKey && this.textures.exists(this._fullbodyKey)) {
      this.textures.remove(this._fullbodyKey);
      this._fullbodyKey = null;
    }

    this.clearTabObjects();
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
    this.stopAllActiveTweens();
  }

  showMessage(text, color = COLORS.text) {
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, text, ts('body', {
      color: hexToCSS(color),
      backgroundColor: hexToCSS(DESIGN.colors.bg.secondary),
      padding: { x: s(28), y: s(16) },
      align: 'center'
    })).setOrigin(0.5).setDepth(Z_INDEX.MODAL);

    this.tweens.add({
      targets: msg,
      alpha: 0,
      y: msg.y - s(50),
      duration: 1500,
      delay: 500,
      onComplete: () => msg.destroy()
    });
  }
}
