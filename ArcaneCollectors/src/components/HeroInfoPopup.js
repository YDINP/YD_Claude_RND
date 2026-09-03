/**
 * HeroInfoPopup.js — 영웅 정보 팝업 (REDESIGN_PLAN §3-3/§3-6, T-15b 재작성)
 *
 * 영웅 목록·파티 편성에서 카드를 누르면 뜨는 빠른 조회용 팝업이다.
 *
 * ## 이전 구현의 결함
 * 400×600 패널에 절대좌표로 그렸고, 스킬 3칸(top+490~550)과 액션 버튼(top+515),
 * 재화 표시(top+485)가 같은 자리에 겹쳐 서로를 덮어썼다. 4슬롯 골격(PopupBase)도
 * 쓰지 않아 팝업 15개와 헤더·닫기·액션바 규격이 어긋나 있었다.
 *
 * ## 지금 구조
 * `PopupBase` 의 4슬롯(헤더/콘텐츠/액션바) 위에 얹고, 콘텐츠 슬롯 하나를 다시 넷으로 쪼갠다.
 * HeroDetailScene(§3-3)의 구조를 팝업 크기(656×1184 기획 px)로 축약한 것이다.
 *
 *   헤더      영웅 이름 + 닫기 ✕ + 교단색 언더라인
 *   콘텐츠 ┬─ 전신 시트  40%  (가로를 채우고 아래를 잘라 상반신만, 하단은 페이드)
 *          ├─ 리본           (등급 배지 · 교단 · 성급 · 레벨 · 전투력)
 *          ├─ 능력치 4행     (IconFactory 아이콘 + 값 + 교단색 바)
 *          └─ 스킬 3칸
 *   액션바    상세 보기 → HeroDetailScene / 파티에 편성 / 닫기
 *
 * 좌표 계산은 전부 `utils/heroInfoLayout.js` 의 순수 함수가 한다. 겹침 0 은 그 모듈의
 * `anyOverlap()` 으로 단위 테스트가 지킨다.
 *
 * ## 공개 API (호출부 시그니처 불변)
 *   new HeroInfoPopup(scene)  ·  show(heroId)  ·  destroy()  ·  isVisible()
 *
 * 주의: designSystem/gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { GAME_WIDTH, GAME_HEIGHT, RARITY, CULT_INFO, s, sf } from '../config/gameConfig.js';
import { Z_INDEX, RARITY_COLORS } from '../config/layoutConfig.js';
import { DESIGN, getCultColor, hexToCSS } from '../config/designSystem.js';
import { ts } from '../utils/textStyles.ts';
import { PopupBase } from './PopupBase.js';
import { GlassPanel, GLASS_VARIANT } from './GlassPanel.js';
import { IconFactory } from '../utils/IconFactory.js';
import { POPUP_SLOT, normalizeActions } from '../utils/popupLayout.js';
import { getCharacterOrHero } from '../data/index.ts';
import { SaveManager } from '../systems/SaveManager.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { PartyManager } from '../systems/PartyManager.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
import { getRarityKey, getRarityNum } from '../utils/rarityUtils.js';
import navigationManager from '../systems/NavigationManager.js';
import transitionManager from '../utils/TransitionManager.js';
import PORTRAIT_MAP from '../data/portrait-mapping.json';
import CULTS_DATA from '../data/cults.json';
import ASSET_MANIFEST from '../../tools/art/asset-manifest.json';
import { resolveFullbodyKey, fullbodyPath, hasFullbodyAsset } from '../utils/heroDetailLayout.js';
import {
  HERO_INFO_LAYOUT as L,
  computeSections,
  computePortraitCover,
  computePortraitFade,
  computeStatRows,
  computeSkillRows,
  computeRibbonSlots,
  formatNumber,
  truncate,
  buildStars
} from '../utils/heroInfoLayout.js';

/** 클래스 표시 이름 */
const CLASS_NAMES = { warrior: '전사', mage: '마법사', archer: '궁수', healer: '힐러' };

/** 등급별 최대 레벨. ProgressionSystem.MAX_LEVEL 이 없을 때의 폴백 */
const FALLBACK_MAX_LEVEL = { N: 30, R: 40, SR: 50, SSR: 60 };

/**
 * 패널 채움색. PopupBase.createPanelSurface() 의 PANEL_FILL 과 같은 값이어야
 * 전신 시트 하단 페이드가 패널 바닥에 정확히 녹아든다.
 */
const PANEL_FILL = 0x0F172A;

/**
 * 중첩 팝업 규격 (QA P1-4).
 *
 * 이 팝업은 영웅 목록 팝업 **위에** 뜬다. 하위 팝업과 패널 크기·헤더 규격이 같아
 * 타이틀과 닫기 ✕ 가 픽셀 단위로 같은 자리에 겹쳤고, 어느 ✕ 가 눌리는지 알 수 없었다.
 *   - depth: 하위 팝업(2000)보다 위 층으로 올려 입력 순서를 확정한다
 *   - offsetY: 헤더를 32px(base) 내려 두 헤더가 다른 줄에 서게 한다
 *   - overlayAlpha: 스크림을 거의 불투명하게 해 하위 헤더가 비쳐 읽히지 않게 한다
 */
const NESTED = Object.freeze({ offsetY: 32, overlayAlpha: 0.97 });

export class HeroInfoPopup extends PopupBase {
  /**
   * @param {Phaser.Scene} scene
   * @param {Object} [options] - PopupBase 옵션 덮어쓰기
   */
  constructor(scene, options = {}) {
    super(scene, {
      title: '',
      layoutSpec: 'redesign',
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      depth: Z_INDEX.POPUP_NESTED,
      offsetY: s(NESTED.offsetY),
      overlayAlpha: NESTED.overlayAlpha,
      ...options
    });

    this.heroId = null;
    this.hero = null;
    /** 이 팝업이 지연 로드한 전신 텍스처 키. destroy 에서만 해제한다 */
    this._fullbodyKey = null;
    /** 전신 시트를 섹션 밖으로 새지 않게 자르는 지오메트리 마스크의 원본 Graphics */
    this._maskShape = null;
  }

  // ================================================================
  // 공개 API — 호출부 시그니처 불변
  // ================================================================

  /**
   * 영웅 정보를 표시한다.
   * @param {string} heroId - 캐릭터 id. 생략하면 마지막 영웅을 다시 그린다
   */
  show(heroId) {
    const targetId = heroId === undefined ? this.heroId : heroId;
    if (!targetId) return;

    if (this.isOpen) this._close(false);
    if (!this._loadHero(targetId)) return;

    this.title = this.hero.name || '???';
    this.accentColor = this.cultColor;
    this.summaryItems = [];  // 요약 슬롯은 쓰지 않는다 — 리본이 콘텐츠 안에 있다
    this.actions = normalizeActions(this._composeActions());

    super.show();
  }

  /** 팝업이 떠 있는가 */
  isVisible() {
    return this.isOpen === true;
  }

  /** 퇴장 애니메이션과 함께 닫는다 */
  hide() {
    this._close(true);
  }

  /**
   * 닫는다. 기존 호출부(HeroListPopup.destroy 등)가 destroy() 로 닫으므로
   * 열려 있으면 퇴장 애니메이션을 거치고, 이미 닫혀 있으면 즉시 정리한다.
   */
  destroy() {
    this._close(this.isOpen === true);
  }

  /**
   * 닫기 단일 경로.
   *
   * 퇴장 트윈을 걸기 전에 컨테이너를 `this` 에서 떼어낸다. 떼어내지 않으면
   * "닫는 도중 다른 영웅으로 다시 열기" 순서에서 이전 트윈의 완료 콜백이
   * **새로 연 팝업**을 파괴한다(공유 인스턴스라 `this` 가 같기 때문).
   * 자원 해제도 컨테이너 파괴 뒤로 미룬다 — 퇴장 중인 이미지가 아직 전신 텍스처를 쓴다.
   *
   * @param {boolean} animate - 퇴장 애니메이션 사용 여부
   * @private
   */
  _close(animate) {
    if (!this.isOpen) {
      this._releaseResources();
      super.destroy();
      return;
    }

    navigationManager.popPopup();
    this.isOpen = false;

    const container = this.container;
    const maskShape = this._maskShape;

    this.container = null;
    this.contentContainer = null;
    this.headerContainer = null;
    this.summaryContainer = null;
    this.actionContainer = null;
    this.titleText = null;
    this.portraitImage = null;
    this._maskShape = null;
    this._fullbodyKey = null;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (container) container.destroy(true);
      if (maskShape) maskShape.destroy();
      if (this.onCloseCallback) this.onCloseCallback();
    };

    if (!animate || !container || !this.scene?.tweens) {
      finish();
      return;
    }

    this.scene.tweens.add({
      targets: container,
      alpha: 0,
      duration: 150,
      ease: 'Power2',
      onComplete: finish
    });

    // 안전장치: 트윈이 완료되지 않아도 반드시 파괴한다.
    // 남으면 오버레이와 패널 블로커가 화면 전체 입력을 삼킨다.
    this.scene.time?.delayedCall?.(400, finish);
  }

  /**
   * 이 팝업이 잡고 있던 자원을 놓는다.
   *
   * 지오메트리 마스크의 원본 Graphics 는 디스플레이 리스트에 없어 컨테이너를 파괴해도
   * 함께 사라지지 않으므로 직접 지운다.
   *
   * **전신 텍스처(fb_hero_XXX)는 지우지 않는다.** 이 팝업 뒤에 살아 있는
   * MainMenuScene 의 `IdleBattleView` 가 파티원 스프라이트로 같은 키를 쓴다.
   * 팝업이 닫히면서 지우면 뒤 화면의 스프라이트가 텍스처를 잃고
   * `glTexture` null 로 렌더 예외가 난다. 공유 캐시로 두고 씬 종료 때 정리한다.
   *
   * @private
   */
  _releaseResources() {
    if (this._maskShape) {
      this._maskShape.destroy();
      this._maskShape = null;
    }
    this._fullbodyKey = null;
  }

  // ================================================================
  // 데이터
  // ================================================================

  /**
   * 세이브와 정적 데이터를 합쳐 표시용 영웅 정보를 만든다.
   * @param {string} heroId
   * @returns {boolean} 표시할 데이터가 있으면 true
   * @private
   */
  _loadHero(heroId) {
    const saveData = SaveManager.load();
    const charData = (saveData?.characters || [])
      .find(c => c.id === heroId || c.characterId === heroId);
    const staticData = getCharacterOrHero(heroId);
    if (!staticData && !charData) return false;

    this.heroId = heroId;
    this.staticData = staticData || {};
    this.hero = { ...staticData, ...charData, id: heroId };

    this.rarityKey = getRarityKey(this.hero.rarity);
    this.rarityColor = (RARITY[this.rarityKey] || RARITY.N).color;

    // 화면 액센트는 교단색이다. 교단이 없는 기본 영웅은 브랜드 시안으로 간다 —
    // 등급색으로 떨어지면 N 등급 영웅의 화면이 통째로 무채색이 된다.
    this.cultId = this.staticData.cultId || this.staticData.cult || this.hero.cult || null;
    this.cultColor = this.cultId ? getCultColor(this.cultId) : DESIGN.colors.brand.primary;
    this.cultCss = hexToCSS(this.cultColor);

    this.level = this.hero.level || 1;
    const maxLevels = ProgressionSystem.MAX_LEVEL || FALLBACK_MAX_LEVEL;
    this.maxLevel = maxLevels[this.rarityKey] || FALLBACK_MAX_LEVEL[this.rarityKey] || 60;

    this.stars = this.hero.stars || getRarityNum(this.hero.rarity) || 1;
    this.maxStars = ProgressionSystem.MAX_STARS || 6;

    this.finalStats = this._resolveStats();
    this.power = this._resolvePower();

    this.skills = (this.staticData.skills && this.staticData.skills.length > 0)
      ? this.staticData.skills
      : (this.hero.skills || []);
    this.skillLevels = this.hero.skillLevels || [1, 1, 1];

    return true;
  }

  /**
   * 표시 스탯. ProgressionSystem 이 SSOT 다 (장비·컬렉션 보너스 포함).
   * @returns {{hp:number,atk:number,def:number,spd:number}}
   * @private
   */
  _resolveStats() {
    try {
      const finalStats = ProgressionSystem.getFinalStats({ ...this.hero, characterId: this.heroId });
      if (finalStats && Number.isFinite(finalStats.hp)) return finalStats;
    } catch { /* 아래 폴백 */ }

    try {
      const leveled = ProgressionSystem.getStatsAtLevel(this.heroId, this.level);
      if (leveled) return leveled;
    } catch { /* 아래 폴백 */ }

    return this.hero.stats || { hp: 0, atk: 0, def: 0, spd: 0 };
  }

  /**
   * 전투력. 계산이 실패하면 스탯 합으로 근사한다.
   * @returns {number}
   * @private
   */
  _resolvePower() {
    try {
      return ProgressionSystem.calculatePower({
        ...this.hero,
        characterId: this.heroId,
        skillLevels: this.hero.skillLevels || [1, 1]
      });
    } catch {
      const st = this.finalStats || {};
      return Math.floor((st.hp || 0) / 10 + (st.atk || 0) + (st.def || 0) + (st.spd || 0));
    }
  }

  /**
   * 교단 표시 이름. cults.json 이 15개 교단 전부를 담은 SSOT 이고
   * gameConfig.CULT_INFO 는 9개만 가진 레거시 표다.
   * @returns {string|null}
   * @private
   */
  _cultName() {
    if (!this.cultId) return null;
    const raw = CULTS_DATA && CULTS_DATA.cults ? CULTS_DATA.cults[this.cultId] : null;
    if (raw) return raw.nameKr || raw.name || this.cultId;
    return CULT_INFO[this.cultId]?.name || this.cultId;
  }

  // ================================================================
  // 액션 바
  // ================================================================

  /**
   * 액션 바 버튼 정의.
   * 레벨업·진화·스킬 강화는 HeroDetailScene 이 맡는다. 이 팝업은 조회와 진입만 한다.
   * @returns {Array<Object>}
   * @private
   */
  _composeActions() {
    const inParty = this._isInParty(this.heroId);

    return [
      {
        label: '상세 보기',
        variant: 'primary',
        onClick: () => this._openDetailScene()
      },
      {
        label: inParty ? '편성됨' : '파티에 편성',
        variant: 'secondary',
        disabled: inParty,
        onClick: () => this._addToParty()
      },
      {
        label: '닫기',
        variant: 'ghost',
        onClick: (popup) => popup.hide()
      }
    ];
  }

  /**
   * 활성 파티(parties[0])를 4칸 배열로 정규화해 돌려준다.
   * 세이브에는 `[[heroId, null, null, null]]` 형태로 들어 있고 일부 경로는
   * `{ heroIds: [] }` 형태를 쓴다. 둘 다 받는다.
   * @returns {{parties:Array, slot:Array}}
   * @private
   */
  _readParties() {
    const saveData = SaveManager.load();
    const size = PartyManager.PARTY_SIZE || 4;

    const raw = Array.isArray(saveData?.parties) ? saveData.parties : [];
    const parties = raw.map((entry) => {
      if (Array.isArray(entry)) return [...entry];
      if (entry && Array.isArray(entry.heroIds)) return [...entry.heroIds];
      return [];
    });

    if (parties.length === 0) parties.push([]);
    const slot = parties[0];
    while (slot.length < size) slot.push(null);

    return { parties, slot };
  }

  /**
   * 활성 파티에 이미 들어 있는가.
   * @param {string} heroId
   * @returns {boolean}
   * @private
   */
  _isInParty(heroId) {
    try {
      return this._readParties().slot.includes(heroId);
    } catch {
      return false;
    }
  }

  /**
   * 활성 파티의 첫 빈 자리에 편성한다.
   * @private
   */
  _addToParty() {
    let parties;
    let slot;
    try {
      ({ parties, slot } = this._readParties());
    } catch {
      this._showMessage('파티 정보를 불러오지 못했습니다');
      return;
    }

    if (slot.includes(this.heroId)) {
      this._showMessage('이미 파티에 있는 영웅입니다');
      return;
    }

    const index = slot.findIndex(id => !id);
    if (index < 0) {
      this._showMessage(`파티가 가득 찼습니다 (${slot.length}/${slot.length})`);
      return;
    }

    slot[index] = this.heroId;
    parties[0] = slot;
    SaveManager.saveParties(parties);

    this._showMessage(`${index + 1}번 자리에 편성했습니다`);
    this.setActions(this._composeActions());
  }

  /**
   * 상세 화면으로 넘어간다. 팝업을 먼저 닫고 페이드 전환한다.
   * @private
   */
  _openDetailScene() {
    const heroId = this.heroId;
    const scene = this.scene;
    this.hide();
    scene.time?.delayedCall?.(180, () => {
      transitionManager.fadeTransition(scene, 'HeroDetailScene', { heroId });
    });
  }

  // ================================================================
  // 콘텐츠
  // ================================================================

  /**
   * 배치 상수를 렌더 px 로 옮긴다. 순수 계산 함수에 넘길 옵션이다.
   * @returns {Object}
   * @private
   */
  _metrics() {
    return {
      gap: s(L.gap),
      ribbonHeight: s(L.ribbonHeight),
      statsHeight: s(L.statsHeight),
      ribbon: { padX: s(20) },
      metrics: {
        sectionTitleHeight: s(L.sectionTitleHeight),
        statRowHeight: s(L.statRowHeight),
        statRowGap: s(L.statRowGap),
        statIconWidth: s(L.statIconWidth),
        statIconGap: s(L.statIconGap),
        statLabelWidth: s(L.statLabelWidth),
        statLabelGap: s(L.statLabelGap),
        statValueWidth: s(L.statValueWidth),
        statValueGap: s(L.statValueGap),
        skillRowHeight: s(L.skillRowHeight),
        skillRowGap: s(L.skillRowGap),
        skillIconWidth: s(L.skillIconWidth),
        skillIconGap: s(L.skillIconGap),
        skillLevelWidth: s(L.skillLevelWidth)
      }
    };
  }

  buildContent() {
    if (!this.hero) return;

    const options = this._metrics();
    const sections = computeSections(this.getContentBounds(), options);

    this._buildPortrait(sections.portrait);
    this._buildRibbon(sections.ribbon);
    this._buildStats(sections.stats, options);
    this._buildSkills(sections.skills, options);
  }

  /** 콘텐츠 컨테이너에 오브젝트를 넣는다 @private */
  _add(...objects) {
    objects.forEach((obj) => {
      if (obj && this.contentContainer) this.contentContainer.add(obj);
    });
    return objects[0];
  }

  /** 섹션 제목 @private */
  _sectionTitle(section, text) {
    return this._add(this.scene.add.text(
      section.x, section.y + s(L.sectionTitleHeight) / 2, text,
      ts('label', { color: DESIGN.colors.text.secondary })
    ).setOrigin(0, 0.5));
  }

  // ---------------- 전신 시트 ----------------

  /**
   * 전신 시트를 그린다. 없으면 512 포트레이트를 같은 자리에 깔고
   * 매니페스트에 전신이 있으면 지연 로드해 교체한다.
   * @param {Object} section
   * @private
   */
  _buildPortrait(section) {
    this.portraitSection = section;

    // 교단색 방사광 — 인물 뒤 배경. 화면 액센트가 어디서 오는지 알려준다
    const glow = this.scene.add.graphics();
    for (let i = 10; i >= 1; i--) {
      const t = i / 10;
      glow.fillStyle(this.cultColor, 0.05 * (1 - t) + 0.015);
      glow.fillCircle(section.centerX, section.y + section.h * 0.45, section.w * 0.42 * t);
    }
    this._add(glow);

    const fbKey = resolveFullbodyKey(this.heroId, PORTRAIT_MAP);

    if (fbKey && this.scene.textures.exists(fbKey)) {
      this._placePortrait(fbKey, section);
    } else {
      const fallbackKey = HeroAssetLoader.ensureTexture(this.scene, this.hero);
      if (fallbackKey) this._placePortrait(fallbackKey, section);
      if (fbKey && hasFullbodyAsset(fbKey, ASSET_MANIFEST.fullbody)) {
        this._queueFullbody(fbKey, section);
      }
    }

    // 잘린 하단을 패널 바닥색으로 녹인다
    const fadeRect = computePortraitFade(section, s(L.portraitFadeHeight));
    const fade = this.scene.add.graphics();
    fade.fillGradientStyle(PANEL_FILL, PANEL_FILL, PANEL_FILL, PANEL_FILL, 0, 0, 1, 1);
    fade.fillRect(fadeRect.x, fadeRect.y, fadeRect.w, fadeRect.h);
    this._add(fade);
  }

  /**
   * 텍스처를 전신 자리에 채워 넣고 섹션 밖으로 새지 않게 자른다.
   * @param {string} key
   * @param {Object} section
   * @private
   */
  _placePortrait(key, section) {
    const source = this.scene.textures.get(key).getSourceImage();
    const fit = computePortraitCover(source.width, source.height, section);
    if (fit.width <= 0) return null;

    const image = this.scene.add.image(fit.x, fit.y, key)
      .setOrigin(fit.originX, fit.originY)
      .setDisplaySize(fit.width, fit.height);

    // 지오메트리 마스크로 섹션 밖을 자른다. 이미지가 리본·능력치를 침범하지 않는다.
    if (!this._maskShape) {
      this._maskShape = this.scene.make.graphics({ add: false });
      this._maskShape.fillStyle(0xffffff, 1);
      this._maskShape.fillRect(section.x, section.y, section.w, section.h);
    }
    image.setMask(this._maskShape.createGeometryMask());

    this._add(image);

    if (this.portraitImage && this.portraitImage !== image) {
      const old = this.portraitImage;
      this.scene.tweens.add({
        targets: old, alpha: 0, duration: 220,
        onComplete: () => old.destroy()
      });
      image.setAlpha(0);
      this.scene.tweens.add({ targets: image, alpha: 1, duration: 260, ease: 'Quad.easeOut' });
    }

    this.portraitImage = image;
    return image;
  }

  /**
   * 전신 시트를 지연 로드한다. 매니페스트에 있는 키만 요청한다
   * (dev 서버의 404 가드가 콘솔 에러를 남기므로 선검사한다).
   * @param {string} key
   * @param {Object} section
   * @private
   */
  _queueFullbody(key, section) {
    const path = fullbodyPath(key);
    if (!path || !this.scene.load) return;

    this.scene.load.image(key, path);

    this.scene.load.once(`filecomplete-image-${key}`, () => {
      // 로드가 끝나기 전에 팝업이 닫혔을 수 있다
      if (!this.isOpen || !this.contentContainer || !this.scene.textures.exists(key)) return;
      this._fullbodyKey = key;
      this._placePortrait(key, section);
      // 페이드 띠가 인물 위에 남아야 한다
      if (this.contentContainer) this.contentContainer.bringToTop(this.contentContainer.last);
    });

    this.scene.load.once('loaderror', (file) => {
      if (file && file.key === key) {
        console.warn(`[HeroInfoPopup] 전신 시트 로드 실패, 포트레이트 폴백 유지: ${key}`);
      }
    });

    if (!this.scene.load.isLoading()) this.scene.load.start();
  }

  // ---------------- 리본 ----------------

  /**
   * 등급 · 교단 · 성급 · 레벨 · 전투력 리본.
   * @param {Object} section
   * @private
   */
  _buildRibbon(section) {
    const slots = computeRibbonSlots(section, { padX: s(20) });

    this._add(GlassPanel.create(this.scene, {
      x: section.centerX, y: section.centerY, w: section.w, h: section.h,
      variant: GLASS_VARIANT.CARD,
      tint: this.cultColor
    }));

    // 등급 배지
    const rarityStyle = RARITY_COLORS[this.rarityKey] || RARITY_COLORS.N;
    const badge = this.scene.add.graphics();
    badge.fillStyle(rarityStyle.border, 1);
    badge.fillRoundedRect(slots.rarity.x, slots.rarity.y, slots.rarity.w, slots.rarity.h, s(6));
    this._add(badge);

    this._add(this.scene.add.text(slots.rarity.centerX, slots.rarity.centerY, this.rarityKey,
      ts('caption', { color: '#FFFFFF' })).setOrigin(0.5));

    // 교단 · 클래스
    const cultName = this._cultName();
    const className = CLASS_NAMES[this.hero.class || this.staticData.baseClass] || null;
    const cultLine = [cultName, className].filter(Boolean).join(' · ') || '무소속';
    this._add(this.scene.add.text(slots.cult.x, slots.cult.centerY, cultLine,
      ts('label', { color: this.cultCss })).setOrigin(0, 0.5));

    // 성급
    this._add(this.scene.add.text(slots.stars.x, slots.stars.centerY,
      buildStars(this.stars, this.maxStars),
      ts('label', { color: hexToCSS(DESIGN.colors.brand.accent) })).setOrigin(0, 0.5));

    // 레벨
    this._add(this.scene.add.text(slots.level.right, slots.level.centerY,
      `Lv.${this.level} / ${this.maxLevel}`,
      ts('num.sm', { color: DESIGN.colors.text.secondary })).setOrigin(1, 0.5));

    // 전투력 — 이 팝업에서 가장 큰 수치 하나
    this._add(this.scene.add.text(slots.power.right, slots.power.centerY - s(14), '전투력',
      ts('caption', { color: DESIGN.colors.text.secondary })).setOrigin(1, 0.5));

    this._add(this.scene.add.text(slots.power.right, slots.power.centerY + s(14),
      formatNumber(this.power),
      ts('num.lg', { color: hexToCSS(DESIGN.colors.brand.accent) })).setOrigin(1, 0.5));
  }

  // ---------------- 능력치 ----------------

  /**
   * 능력치 4행. 아이콘 · 라벨 · 값 · 바가 한 줄에 겹치지 않고 놓인다.
   * @param {Object} section
   * @param {Object} options
   * @private
   */
  _buildStats(section, options) {
    this._sectionTitle(section, '능력치');

    computeStatRows(this.finalStats, section, options).forEach((row) => {
      const icon = IconFactory.createImage(
        this.scene, row.icon.centerX, row.icon.centerY, row.key, 'sm', { tint: this.cultColor }
      );
      this._add(icon);

      this._add(this.scene.add.text(row.labelBox.x, row.labelBox.centerY, row.label,
        ts('caption', { color: DESIGN.colors.text.secondary })).setOrigin(0, 0.5));

      this._add(this.scene.add.text(row.valueBox.right, row.valueBox.centerY,
        formatNumber(row.value),
        ts('num.md', { color: DESIGN.colors.text.primary })).setOrigin(1, 0.5));

      const bar = this.scene.add.graphics();
      const h = s(10);
      const y = row.bar.centerY - h / 2;
      bar.fillStyle(DESIGN.colors.bg.surface, 0.9);
      bar.fillRoundedRect(row.bar.x, y, row.bar.w, h, h / 2);
      if (row.fillWidth > 0) {
        bar.fillStyle(this.cultColor, 1);
        bar.fillRoundedRect(row.bar.x, y, Math.max(row.fillWidth, h), h, h / 2);
      }
      this._add(bar);
    });
  }

  // ---------------- 스킬 ----------------

  /**
   * 스킬 3칸. 스킬 데이터가 없으면 빈 상태 문구를 놓는다.
   * @param {Object} section
   * @param {Object} options
   * @private
   */
  _buildSkills(section, options) {
    if (!this.skills || this.skills.length === 0) {
      this._buildAscensionRoutes(section, options);
      return;
    }

    this._sectionTitle(section, '스킬');

    const { rows } = computeSkillRows(this.skills.length, section, options);
    const maxSkillLevel = ProgressionSystem.MAX_SKILL_LEVEL || 10;

    rows.forEach((row) => {
      const skill = this.skills[row.index] || {};
      const level = this.skillLevels[row.index] || 1;

      const box = this.scene.add.graphics();
      box.fillStyle(DESIGN.colors.bg.secondary, 0.5);
      box.fillRoundedRect(row.row.x, row.row.y, row.row.w, row.row.h, s(DESIGN.radius.md));
      box.lineStyle(s(1), this.cultColor, 0.25);
      box.strokeRoundedRect(row.row.x, row.row.y, row.row.w, row.row.h, s(DESIGN.radius.md));
      this._add(box);

      const badge = this.scene.add.circle(row.icon.centerX, row.icon.centerY, s(18), this.cultColor, 0.18);
      badge.setStrokeStyle(s(2), this.cultColor, 0.7);
      this._add(badge);

      this._add(IconFactory.createImage(
        this.scene, row.icon.centerX, row.icon.centerY, 'atk', 'xs', { tint: this.cultColor }
      ));

      this._add(this.scene.add.text(row.nameBox.x, row.nameBox.centerY,
        truncate(skill.name || `스킬 ${row.index + 1}`, 16),
        ts('body', { color: DESIGN.colors.text.primary })).setOrigin(0, 0.5));

      this._add(this.scene.add.text(row.descBox.x, row.descBox.centerY,
        truncate(skill.description || '설명 없음', 26),
        ts('caption', { color: DESIGN.colors.text.secondary })).setOrigin(0, 0.5));

      this._add(this.scene.add.text(row.levelBox.right, row.levelBox.centerY,
        `Lv.${level}/${maxSkillLevel}`,
        ts('num.sm', { color: hexToCSS(DESIGN.colors.brand.accent) })).setOrigin(1, 0.5));
    });
  }

  /**
   * 스킬 데이터가 없는 기본 영웅에게는 전직 경로를 대신 보여준다.
   * base-heroes.json 에는 skills 가 없고 ascensionRoutes 만 있다. 빈 칸을 남기는 대신
   * "이 영웅이 무엇이 될 수 있는가"라는 실제 데이터로 채운다.
   *
   * @param {Object} section
   * @param {Object} options
   * @private
   */
  _buildAscensionRoutes(section, options) {
    const routes = Array.isArray(this.staticData.ascensionRoutes)
      ? this.staticData.ascensionRoutes
      : [];

    if (routes.length === 0) {
      this._sectionTitle(section, '스킬');
      this._add(this.scene.add.text(section.centerX, section.centerY, '스킬 정보 없음',
        ts('body', { color: DESIGN.colors.text.muted })).setOrigin(0.5));
      return;
    }

    this._sectionTitle(section, '전직 경로');

    const { rows } = computeSkillRows(routes.length, section, options);

    rows.forEach((row) => {
      const route = routes[row.index];
      const color = getCultColor(route.cultId);
      const cults = CULTS_DATA && CULTS_DATA.cults ? CULTS_DATA.cults[route.cultId] : null;
      const name = (cults && (cults.nameKr || cults.name)) || CULT_INFO[route.cultId]?.name || route.cultId;

      const box = this.scene.add.graphics();
      box.fillStyle(DESIGN.colors.bg.secondary, 0.5);
      box.fillRoundedRect(row.row.x, row.row.y, row.row.w, row.row.h, s(DESIGN.radius.md));
      box.lineStyle(s(1), color, 0.35);
      box.strokeRoundedRect(row.row.x, row.row.y, row.row.w, row.row.h, s(DESIGN.radius.md));
      this._add(box);

      this._add(this.scene.add.circle(row.icon.centerX, row.icon.centerY, s(12), color, 0.9));

      this._add(this.scene.add.text(row.nameBox.x, row.nameBox.centerY, name,
        ts('body', { color: hexToCSS(color) })).setOrigin(0, 0.5));

      this._add(this.scene.add.text(row.descBox.x, row.descBox.centerY,
        truncate((route.routeKeywords || []).join(' · ') || route.loreHint || '', 26),
        ts('caption', { color: DESIGN.colors.text.secondary })).setOrigin(0, 0.5));

      this._add(this.scene.add.text(row.levelBox.right, row.levelBox.centerY,
        route.resultRarity || '',
        ts('num.sm', { color: hexToCSS(DESIGN.colors.brand.accent) })).setOrigin(1, 0.5));
    });
  }

  // ================================================================
  // 토스트
  // ================================================================

  /**
   * 짧은 안내 메시지. 팝업 위에 떠서 사라진다.
   * @param {string} text
   * @private
   */
  _showMessage(text) {
    const scene = this.scene;
    const msg = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(50), text, {
      fontSize: sf(16),
      fontFamily: DESIGN.font.family.primary,
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary,
      backgroundColor: hexToCSS(DESIGN.colors.bg.surface),
      padding: { x: s(16), y: s(8) }
    }).setOrigin(0.5).setDepth(Z_INDEX.TOOLTIP + 10);

    scene.tweens.add({
      targets: msg,
      y: msg.y - s(40),
      alpha: 0,
      duration: 1200,
      delay: 600,
      onComplete: () => msg.destroy()
    });
  }
}

export default HeroInfoPopup;
