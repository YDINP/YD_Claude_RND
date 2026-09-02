import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf } from '../../config/gameConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { EvolutionSystem } from '../../systems/EvolutionSystem.js';
import { StoryManager } from '../../systems/StoryManager.js';
import { TutorialTargetRegistry } from '../../systems/TutorialTargetRegistry.js';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { POPUP_SLOT, pickActionChild } from '../../utils/popupLayout.js';

/** 헤더 타이틀 */
const TITLE = '기관 각인';

/** Step 3 액션 바에서 '각인 실행' 이 놓이는 순번 — 튜토리얼 타깃 재등록용 */
const ASCEND_ACTION_INDEX = 0;

/**
 * Step 1 기본영웅 목록 카드 (기획 px).
 * 기본영웅 10명 × (72 + 8) = 800 으로 콘텐츠 슬롯 888 안에 전부 들어간다.
 */
const HERO_ITEM_HEIGHT = 72;
const HERO_ITEM_GAP = 8;

/** 카드 좌측 클래스 라벨 열의 중심 x 오프셋과 이름 열 시작 x 오프셋 */
const CLASS_COLUMN_X = 44;
const NAME_COLUMN_X = 96;

/**
 * AscensionPopup - 기관 각인 팝업 (CHAR-3)
 * 3단계 UI:
 *   Step 1: 보유 기본영웅 목록 + 선택
 *   Step 2: 선택 영웅의 각인 가능 기관 목록 + 선택
 *   Step 3: 확인 화면 + 각인 실행 버튼
 */
export class AscensionPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.cult.yomi,
      ...options
    });

    this.currentStep = 1;
    this.selectedBaseHero = null;   // 기본영웅 데이터 객체 (base-heroes.json)
    this.selectedRoute = null;      // ascensionRoutes[] 항목
    this._stepObjects = [];         // 현재 스텝에서 추가된 씬 오브젝트 (clear용)
  }

  buildContent() {
    this.setTitle(TITLE);
    this.buildStep1();
  }

  /**
   * 슬롯 2 — 현재 단계와 선택 상태.
   * 항목 수가 항상 3개라 단계가 바뀌어도 콘텐츠 높이가 흔들리지 않는다.
   */
  _applySummary(step) {
    this.setSummary([
      { label: '단계', value: `${step} / 3` },
      { label: '기본영웅', value: this.selectedBaseHero ? this.selectedBaseHero.name : '미선택' },
      { label: '기관', value: this.selectedRoute ? this._routeCultName(this.selectedRoute) : '미선택' }
    ]);
  }

  /** cultId → 표시 이름 (요약 슬롯용) */
  _routeCultName(route) {
    const cultData = SaveManager.getCultData(route.cultId);
    return cultData ? cultData.nameKr : route.cultId;
  }

  /** 액션 바 콜백이 자기 액션 바를 지우지 않도록 한 프레임 미룬다 */
  _deferStep(fn) {
    if (this.scene?.time?.delayedCall) this.scene.time.delayedCall(0, fn);
    else fn();
  }

  // ─────────────────────────────────────────
  // 스텝 전환 헬퍼
  // ─────────────────────────────────────────

  /**
   * 현재 스텝 오브젝트를 모두 제거하고 새 스텝을 렌더링
   */
  _clearStep() {
    this._stepObjects.forEach(obj => {
      if (obj && obj.scene) {
        obj.destroy();
      }
    });
    this._stepObjects = [];
    // contentContainer 내 모든 자식도 비움 (addText/addButton 경로)
    if (this.contentContainer) {
      this.contentContainer.removeAll(true);
    }
  }

  /**
   * 씬에 오브젝트를 추가하고 _stepObjects에 등록 (clear 추적용)
   */
  _track(obj) {
    if (obj) this._stepObjects.push(obj);
    return obj;
  }

  /**
   * 컷씬 재생 중 팝업이 닫히거나 씬이 전환되었는지 확인.
   * StoryManager.trigger의 onComplete는 부모 씬 resume 이후에 호출되므로,
   * 그 사이에 팝업이 사라졌을 수 있다.
   * @returns {boolean} 후속 UI를 그려도 안전한지 여부
   */
  _isAlive() {
    return this.isOpen && !!this.scene && !!this.contentContainer;
  }

  /**
   * 콘텐츠 영역의 세로 중앙 좌표.
   * `PopupBase.contentBounds`는 centerX만 제공하고 centerY는 정의하지 않는다.
   * contentBounds에서 centerY를 직접 읽으면 undefined 연산이 NaN이 되어 텍스트가 화면 밖으로 나간다.
   * @returns {number}
   */
  _centerY() {
    const b = this.contentBounds;
    return (b.top + b.bottom) / 2;
  }

  /**
   * T-Q1: 스토리 컷씬 트리거 후 콜백 실행.
   * 재생할 씬이 없으면 StoryManager가 onComplete를 즉시 동기 호출하므로
   * 호출부는 컷씬 유무와 무관하게 동일한 흐름을 갖는다.
   * @param {string} triggerName - evolve_gate / hero_evolve 등
   * @param {Object} ctx - { heroId, cultId }
   * @param {Function} next - 컷씬 종료 후 실행할 다음 단계
   */
  _playCutsceneThen(triggerName, ctx, next) {
    StoryManager.trigger(triggerName, {
      ...ctx,
      scene: this.scene,
      onComplete: () => {
        if (!this._isAlive()) return;
        next();
      }
    });
  }

  // ─────────────────────────────────────────
  // Step 1: 기본영웅 선택
  // ─────────────────────────────────────────

  buildStep1() {
    this.currentStep = 1;
    this.selectedRoute = null;
    this._clearStep();
    this._applySummary(1);
    this.setActions([{ label: '닫기', variant: 'ghost', onClick: () => this.hide() }]);
    const b = this.contentBounds;

    // 안내 텍스트
    this.addText(b.centerX, b.top + s(20), '각인할 기본영웅을 선택하세요', {
      fontSize: sf(16),
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 기본영웅 목록
    const allBase = SaveManager.getAllBaseHeroes();
    if (allBase.length === 0) {
      this.addText(b.centerX, this._centerY(), '기본영웅 데이터를 불러올 수 없습니다.', {
        fontSize: sf(15),
        color: hexToCSS(DESIGN.colors.status.error)
      }).setOrigin(0.5);
      return;
    }

    const itemH = s(HERO_ITEM_HEIGHT);
    const listTop = b.top + s(64);
    const listW = b.width - s(16);

    allBase.forEach((hero, i) => {
      const itemY = listTop + i * (itemH + s(HERO_ITEM_GAP));
      this._renderHeroListItem(hero, b.centerX, itemY, listW, itemH);
    });
  }

  /**
   * 영웅 목록 아이템 렌더링 (Step 1)
   */
  _renderHeroListItem(hero, cx, cy, w, h) {
    const b = this.contentBounds;

    // CHAR-5: 피티 정보 조회
    const pityInfo = SaveManager.getPityInfo(hero.id);

    // 배경 카드
    const bg = this.scene.add.rectangle(cx, cy, w, h, COLORS.bgLight, 0.9);
    bg.setStrokeStyle(s(2), COLORS.primary, 0.3);
    bg.setInteractive({ useHandCursor: true });
    this.contentContainer.add(bg);
    this._track(bg);

    // 튜토리얼 타깃 (T-07/T-09) — 예: ascension.card.base_omar
    TutorialTargetRegistry.register(`ascension.card.${hero.id}`, bg, this.scene?.scene?.key);

    // 영웅 아이콘 (이모지 대체)
    const icon = this.scene.add.text(cx - w / 2 + s(CLASS_COLUMN_X), cy, this._getClassIcon(hero.baseClass), {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.primary.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(icon);
    this._track(icon);

    // 영웅 이름
    const nameText = this.scene.add.text(cx - w / 2 + s(NAME_COLUMN_X), cy - s(13), hero.name, {
      fontSize: sf(17),
      fontFamily: '"Noto Sans KR", Arial',
      fontStyle: 'bold',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0, 0.5);
    this.contentContainer.add(nameText);
    this._track(nameText);

    // 클래스 + 기관 루트 수
    const routeCount = (hero.ascensionRoutes || []).length;
    const subText = this.scene.add.text(cx - w / 2 + s(NAME_COLUMN_X), cy + s(14), `루트 ${routeCount}종`, {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0, 0.5);
    this.contentContainer.add(subText);
    this._track(subText);

    // CHAR-5: 피티 배지 렌더링
    if (pityInfo.count > 0) {
      let pityLabel = '';
      let pityColor = '#aaaaaa';
      let pityBg = null;

      if (pityInfo.isHardPity || pityInfo.count >= 50) {
        pityLabel = '확정';
        pityColor = '#000000';
        pityBg = 0xFFD700;
      } else if (pityInfo.isSoftPity) {
        pityLabel = '소프트 피티';
        pityColor = '#ffffff';
        pityBg = 0xFF8C00;
      } else {
        pityLabel = `${pityInfo.pullsUntilSoft}회 후 피티`;
        pityColor = '#aaaaaa';
        pityBg = null;
      }

      const pityText = this.scene.add.text(cx + w / 2 - s(52), cy - s(14), pityLabel, {
        fontSize: sf(11),
        fontFamily: '"Noto Sans KR", Arial',
        fontStyle: 'bold',
        color: pityColor,
        backgroundColor: pityBg ? `#${pityBg.toString(16).padStart(6, '0')}` : undefined,
        padding: pityBg ? { x: s(4), y: s(2) } : undefined
      }).setOrigin(1, 0.5);
      this.contentContainer.add(pityText);
      this._track(pityText);
    }

    // 화살표
    const arrow = this.scene.add.text(cx + w / 2 - s(25), cy, '›', {
      fontSize: sf(28),
      color: `#${COLORS.primary.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(arrow);
    this._track(arrow);

    // 인터랙션
    bg.on('pointerover', () => {
      bg.setFillStyle(COLORS.bgPanel, 1);
      bg.setStrokeStyle(s(2), COLORS.primary, 0.8);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(COLORS.bgLight, 0.9);
      bg.setStrokeStyle(s(2), COLORS.primary, 0.3);
    });
    bg.on('pointerdown', () => {
      this.selectedBaseHero = hero;
      // T-Q1: 기관 선택 화면 최초 진입 직전에 evolve_gate 컷씬을 재생한다
      // (NARRATIVE_STORY_MODE R-04 체인: 벽 인지 → evolve_gate → 기관 선택 → hero_evolve)
      this._playCutsceneThen('evolve_gate', { heroId: hero.id }, () => this.buildStep2());
    });
  }

  // ─────────────────────────────────────────
  // Step 2: 기관 선택
  // ─────────────────────────────────────────

  buildStep2() {
    this.currentStep = 2;
    this.selectedRoute = null;
    this._clearStep();
    this._applySummary(2);
    this.setActions([
      { label: '뒤로', variant: 'secondary', onClick: () => this._deferStep(() => this.buildStep1()) },
      { label: '닫기', variant: 'ghost', onClick: () => this.hide() }
    ]);
    const b = this.contentBounds;
    const hero = this.selectedBaseHero;

    // 영웅 이름 헤더
    this.addText(b.centerX, b.top + s(20), `${hero.name}의 각인 루트`, {
      fontSize: sf(17),
      fontStyle: 'bold',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 각 루트 카드
    const routes = hero.ascensionRoutes || [];
    if (routes.length === 0) {
      this.addText(b.centerX, this._centerY(), '각인 가능한 루트가 없습니다.', {
        fontSize: sf(15),
        color: hexToCSS(DESIGN.colors.status.error)
      }).setOrigin(0.5);
      return;
    }

    const itemH = s(110);
    const listTop = b.top + s(72);
    const listW = b.width - s(16);

    routes.forEach((route, i) => {
      const itemY = listTop + i * (itemH + s(12));
      this._renderRouteItem(route, b.centerX, itemY, listW, itemH);
    });

    // 튜토리얼 타깃 (T-09 mask_choice) — 루트 카드 전체를 감싸는 영역.
    // Graphics 대신 Zone 을 쓰는 이유는 getBounds() 신뢰성(UX 문서 §4-1 바운드 규약).
    const listH = routes.length * itemH + (routes.length - 1) * s(12);
    const listZone = this.scene.add.zone(b.centerX, listTop + listH / 2 - itemH / 2, listW, listH);
    this.contentContainer.add(listZone);
    this._track(listZone);
    TutorialTargetRegistry.register('ascension.route.list', listZone, this.scene?.scene?.key);
  }

  /**
   * 기관 루트 카드 렌더링 (Step 2)
   */
  _renderRouteItem(route, cx, cy, w, h) {
    const cultData = SaveManager.getCultData(route.cultId);
    const cultColor = cultData ? parseInt(cultData.color.replace('#', '0x')) : COLORS.primary;
    const cultName = cultData ? cultData.nameKr : route.cultId;
    const isOwned = SaveManager.hasAscendedHero(route.ascendedHeroId);

    // 배경
    const alpha = isOwned ? 0.4 : 0.9;
    const bg = this.scene.add.rectangle(cx, cy, w, h, COLORS.bgLight, alpha);
    bg.setStrokeStyle(s(3), cultColor, isOwned ? 0.3 : 0.8);
    this.contentContainer.add(bg);
    this._track(bg);

    // 튜토리얼 타깃 (T-09 루트 카드)
    TutorialTargetRegistry.register(`ascension.route.${route.cultId}`, bg, this.scene?.scene?.key);

    // 기관 색상 왼쪽 띠
    const stripe = this.scene.add.rectangle(cx - w / 2 + s(6), cy, s(8), h - s(10), cultColor, isOwned ? 0.3 : 1);
    this.contentContainer.add(stripe);
    this._track(stripe);

    // 기관명
    const nameText = this.scene.add.text(cx - w / 2 + s(25), cy - s(30), cultName, {
      fontSize: sf(17),
      fontFamily: '"Noto Sans KR", Arial',
      fontStyle: 'bold',
      color: `#${cultColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0, 0.5);
    this.contentContainer.add(nameText);
    this._track(nameText);

    // 등급 배지
    const rarityColor = this._rarityColor(route.resultRarity);
    const rarityBadge = this.scene.add.text(cx + w / 2 - s(20), cy - s(30), route.resultRarity, {
      fontSize: sf(14),
      fontStyle: 'bold',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`
    }).setOrigin(1, 0.5);
    this.contentContainer.add(rarityBadge);
    this._track(rarityBadge);

    // 키워드
    const keywords = (route.routeKeywords || []).slice(0, 3).join(' · ');
    const kwText = this.scene.add.text(cx - w / 2 + s(25), cy, keywords, {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0, 0.5);
    this.contentContainer.add(kwText);
    this._track(kwText);

    // 공명 보정 표시
    if (route.resonanceBoost) {
      const boostText = this.scene.add.text(cx + w / 2 - s(20), cy, '공명 ▲', {
        fontSize: sf(12),
        fontStyle: 'bold',
        color: hexToCSS(DESIGN.colors.brand.accent)
      }).setOrigin(1, 0.5);
      this.contentContainer.add(boostText);
      this._track(boostText);
    }

    // 이미 보유 or 선택 가능 상태
    if (isOwned) {
      const ownedText = this.scene.add.text(cx - w / 2 + s(25), cy + s(28), '이미 각인됨', {
        fontSize: sf(13),
        fontFamily: '"Noto Sans KR", Arial',
        color: '#888888'
      }).setOrigin(0, 0.5);
      this.contentContainer.add(ownedText);
      this._track(ownedText);
    } else {
      // 비용 표시
      const hero = this.selectedBaseHero;
      const fragRequired = hero.fragmentsRequired || 30;
      const stonesRequired = hero.spiritStonesRequired || 3;
      const costText = this.scene.add.text(cx - w / 2 + s(25), cy + s(28), `조각 ${fragRequired}개 · 정령석 ${stonesRequired}개`, {
        fontSize: sf(13),
        fontFamily: '"Noto Sans KR", Arial',
        color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0, 0.5);
      this.contentContainer.add(costText);
      this._track(costText);

      // 인터랙션
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        bg.setFillStyle(COLORS.bgPanel, 1);
        bg.setStrokeStyle(s(3), cultColor, 1);
      });
      bg.on('pointerout', () => {
        bg.setFillStyle(COLORS.bgLight, 0.9);
        bg.setStrokeStyle(s(3), cultColor, 0.8);
      });
      bg.on('pointerdown', () => {
        this.selectedRoute = route;
        this.buildStep3();
      });

      // 화살표
      const arrow = this.scene.add.text(cx + w / 2 - s(20), cy + s(28), '›', {
        fontSize: sf(22),
        color: `#${COLORS.primary.toString(16).padStart(6, '0')}`
      }).setOrigin(1, 0.5);
      this.contentContainer.add(arrow);
      this._track(arrow);
    }
  }

  // ─────────────────────────────────────────
  // Step 3: 확인 + 각인 실행
  // ─────────────────────────────────────────

  buildStep3() {
    this.currentStep = 3;
    this._clearStep();
    const b = this.contentBounds;
    const hero = this.selectedBaseHero;
    const route = this.selectedRoute;
    const cultData = SaveManager.getCultData(route.cultId);
    const cultColor = cultData ? parseInt(cultData.color.replace('#', '0x')) : COLORS.primary;
    const cultName = cultData ? cultData.nameKr : route.cultId;

    this._applySummary(3);

    // 제목
    this.addText(b.centerX, b.top + s(20), '각인을 확인하세요', {
      fontSize: sf(17),
      fontStyle: 'bold',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 확인 카드 배경
    const cardY = b.top + s(190);
    const cardH = s(280);
    const cardW = b.width - s(16);
    const cardBg = this.scene.add.rectangle(b.centerX, cardY, cardW, cardH, COLORS.bgLight, 0.95);
    cardBg.setStrokeStyle(s(3), cultColor, 0.9);
    this.contentContainer.add(cardBg);
    this._track(cardBg);

    // 기본영웅 → 기관 → 전직영웅 흐름
    const arrowY = cardY - s(30);

    // 기본영웅
    this.addText(b.centerX - s(160), arrowY - s(25), this._getClassIcon(hero.baseClass), {
      fontSize: sf(36)
    }).setOrigin(0.5);
    this.addText(b.centerX - s(160), arrowY + s(20), hero.name, {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", Arial',
      fontStyle: 'bold',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 화살표
    const arrText = this.scene.add.text(b.centerX, arrowY, '→', {
      fontSize: sf(28),
      color: `#${cultColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(arrText);
    this._track(arrText);

    // 전직영웅
    const ascData = SaveManager.getAscendedHeroData(route.ascendedHeroId);
    const ascName = ascData ? ascData.name : route.ascendedHeroId;
    this.addText(b.centerX + s(160), arrowY - s(25), '각인', {
      fontSize: sf(20),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${cultColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.addText(b.centerX + s(160), arrowY + s(20), ascName, {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", Arial',
      fontStyle: 'bold',
      color: `#${cultColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 기관명 + 등급 표시
    const rarityColor = this._rarityColor(route.resultRarity);
    this.addText(b.centerX, arrowY + s(65), `${cultName} 교단 · ${route.resultRarity}`, {
      fontSize: sf(16),
      fontStyle: 'bold',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 공명 보정
    if (route.resonanceBoost) {
      this.addText(b.centerX, arrowY + s(90), '공명 보정 적용 (등급 1단계 상향)', {
        fontSize: sf(13),
        color: hexToCSS(DESIGN.colors.brand.accent)
      }).setOrigin(0.5);
    }

    // 비용 섹션
    const costY = cardY + s(100);
    const fragRequired = hero.fragmentsRequired || 30;
    const stonesRequired = hero.spiritStonesRequired || 3;
    const data = SaveManager.load();
    const ownedFrag = (data.resources.characterShards || {})[hero.id] || 0;
    const ownedGems = data.resources.gems || 0;

    this.addText(b.centerX - s(90), costY, '필요 재화', {
      fontSize: sf(15),
      fontStyle: 'bold',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0, 0.5);

    // 조각
    const fragOk = ownedFrag >= fragRequired;
    this.addText(b.centerX - s(90), costY + s(30), `영웅 조각 × ${fragRequired}개`, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", Arial',
      color: fragOk ? '#4ADE80' : hexToCSS(DESIGN.colors.status.error)
    }).setOrigin(0, 0.5);
    this.addText(b.centerX + s(90), costY + s(30), `보유: ${ownedFrag}`, {
      fontSize: sf(13),
      color: fragOk ? '#4ADE80' : hexToCSS(DESIGN.colors.status.error)
    }).setOrigin(1, 0.5);

    // 정령석(젬)
    const gemsOk = ownedGems >= stonesRequired;
    this.addText(b.centerX - s(90), costY + s(60), `정령석 × ${stonesRequired}개`, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", Arial',
      color: gemsOk ? '#4ADE80' : hexToCSS(DESIGN.colors.status.error)
    }).setOrigin(0, 0.5);
    this.addText(b.centerX + s(90), costY + s(60), `보유: ${ownedGems}`, {
      fontSize: sf(13),
      color: gemsOk ? '#4ADE80' : hexToCSS(DESIGN.colors.status.error)
    }).setOrigin(1, 0.5);

    // T-C8: 첫 각인 보증 안내 (계정당 1회, 기관 재화 부족분 자동 보전)
    if (EvolutionSystem.isFirstAscensionGuaranteeAvailable()) {
      this.addText(b.centerX - s(90), costY + s(90), '첫 각인 보증 — 기관 재화는 이번 1회 자동 보전', {
        fontSize: sf(13),
        fontFamily: '"Noto Sans KR", Arial',
        color: hexToCSS(DESIGN.colors.brand.accent)
      }).setOrigin(0, 0.5);
    }

    // 로어 힌트
    if (route.loreHint) {
      this.addText(b.centerX, cardY + s(130), `"${route.loreHint}"`, {
        fontSize: sf(12),
        fontFamily: 'Georgia, serif',
        color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`,
        fontStyle: 'italic',
        wordWrap: { width: cardW - s(40) }
      }).setOrigin(0.5, 0);
    }

    // 각인 실행 — 액션 바(슬롯 4)로 이관.
    // 튜토리얼 타깃(`ascension.button.confirm` / `.ascend`)은 setActions 가 만든
    // 히트 영역을 다시 찾아 등록한다(인덱스 계약은 popupLayout.pickActionChild).
    const canAscendResult = SaveManager.canAscend(hero.id, route.cultId);
    this.setActions([
      {
        label: canAscendResult.canAscend ? '각인 실행' : `각인 불가 — ${canAscendResult.reason}`,
        variant: 'primary',
        disabled: !canAscendResult.canAscend,
        onClick: () => this._deferStep(() => this._executeAscension())
      },
      { label: '뒤로', variant: 'secondary', onClick: () => this._deferStep(() => this.buildStep2()) }
    ]);
    this._registerAscendTarget();
  }

  /** 액션 바의 '각인 실행' 을 튜토리얼 타깃으로 등록한다 (T-07 / T-09) */
  _registerAscendTarget() {
    const btn = pickActionChild(this.actionContainer?.list, ASCEND_ACTION_INDEX);
    if (!btn) return;
    const sceneKey = this.scene?.scene?.key;
    // ascend 는 tutorial.json 의 기존 키 별칭이다. 둘 다 같은 오브젝트를 가리킨다.
    TutorialTargetRegistry.register('ascension.button.confirm', btn, sceneKey);
    TutorialTargetRegistry.register('ascension.button.ascend', btn, sceneKey);
  }

  // ─────────────────────────────────────────
  // 각인 실행
  // ─────────────────────────────────────────

  _executeAscension() {
    const hero = this.selectedBaseHero;
    const route = this.selectedRoute;

    // T-C8: 기관 선택 확정 시점에 레이어 2 재화 부족분을 1회 한정 보전한다.
    // 각인 실행보다 먼저 수행해야 첫 전직이 재화 부족으로 막히지 않는다.
    EvolutionSystem.applyFirstAscensionGuarantee(hero.id, route.cultId);

    const result = SaveManager.performAscension(hero.id, route.cultId);

    if (result.success) {
      const cultData = SaveManager.getCultData(route.cultId);
      const cultName = cultData ? cultData.nameKr : route.cultId;
      const ascData = SaveManager.getAscendedHeroData(route.ascendedHeroId);
      const ascName = ascData ? ascData.name : route.ascendedHeroId;
      // T-Q1: 전직 확정 직후 해당 루트의 전직 대사를 재생하고, 종료 후 성공 화면으로 넘어간다.
      // 첫 각인 보증은 위에서 이미 소모했으므로 이 콜백에서 재적용하지 않는다.
      this._playCutsceneThen(
        'hero_evolve',
        { heroId: hero.id, cultId: route.cultId },
        () => this._showSuccessScreen(ascName, cultName, route.resultRarity)
      );
    } else {
      this._showToastInPopup(`각인 실패: ${result.error}`);
    }
  }

  /**
   * 각인 성공 화면
   */
  _showSuccessScreen(ascName, cultName, rarity) {
    this._clearStep();
    this._applySummary(3);
    this.setActions([{ label: '확인', variant: 'primary', onClick: () => this.close() }]);
    const b = this.contentBounds;
    const rarityColor = this._rarityColor(rarity);

    this.addText(b.centerX, this._centerY(), `${ascName}`, {
      fontSize: sf(24),
      fontFamily: '"Noto Sans KR", Arial',
      fontStyle: 'bold',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    this.addText(b.centerX, this._centerY() + s(40), `${cultName} 교단 각인 완료!`, {
      fontSize: sf(17),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    this.addText(b.centerX, this._centerY() + s(75), rarity, {
      fontSize: sf(20),
      fontStyle: 'bold',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 팝업 닫힌 후 리소스 갱신 트리거 (scene refresh)
    this.scene.time.delayedCall(200, () => {
      if (this.scene && this.scene.refreshAfterPopup) {
        this.scene.refreshAfterPopup();
      }
    });
  }

  // ─────────────────────────────────────────
  // 공통 UI 헬퍼
  // ─────────────────────────────────────────

  /**
   * 팝업 내 토스트 메시지
   */
  _showToastInPopup(message) {
    const b = this.contentBounds;
    const toast = this.scene.add.text(b.centerX, b.bottom - s(40), message, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", Arial',
      color: hexToCSS(DESIGN.colors.status.error),
      backgroundColor: '#1A1A2E',
      padding: { x: s(16), y: s(8) }
    }).setOrigin(0.5).setDepth(3100);

    this._track(toast);

    this.scene.time.delayedCall(2500, () => {
      if (toast && toast.scene) toast.destroy();
    });
  }

  // ─────────────────────────────────────────
  // 유틸
  // ─────────────────────────────────────────

  /**
   * 클래스 표기. 이모지 대신 짧은 한글 라벨을 쓴다.
   * 벡터 아이콘(IconFactory)은 warrior/mage/archer/healer 4종만 있어
   * rogue/tank 가 빈칸이 되므로 목록에서는 텍스트로 통일한다.
   */
  _getClassIcon(baseClass) {
    return this._classLabel(baseClass);
  }

  _classLabel(baseClass) {
    const labels = {
      warrior: '전사',
      mage: '마법사',
      archer: '궁수',
      healer: '힐러',
      rogue: '로그',
      tank: '탱커'
    };
    return labels[baseClass] || baseClass;
  }

  _rarityColor(rarity) {
    const colors = {
      SSR: 0xFFD700,
      SR: 0xA855F7,
      R: 0x60A5FA
    };
    return colors[rarity] || COLORS.primary;
  }
}
