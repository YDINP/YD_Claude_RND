import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf } from '../../config/gameConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';

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
      title: '기관 각인',
      width: s(680),
      height: s(1100),
      ...options
    });

    this.currentStep = 1;
    this.selectedBaseHero = null;   // 기본영웅 데이터 객체 (base-heroes.json)
    this.selectedRoute = null;      // ascensionRoutes[] 항목
    this._stepObjects = [];         // 현재 스텝에서 추가된 씬 오브젝트 (clear용)
  }

  buildContent() {
    this.buildStep1();
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

  // ─────────────────────────────────────────
  // Step 1: 기본영웅 선택
  // ─────────────────────────────────────────

  buildStep1() {
    this.currentStep = 1;
    this._clearStep();
    const b = this.contentBounds;

    // 스텝 인디케이터
    this._renderStepIndicator(1);

    // 안내 텍스트
    this.addText(b.centerX, b.top + s(70), '각인할 기본영웅을 선택하세요', {
      fontSize: sf(16),
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 기본영웅 목록
    const allBase = SaveManager.getAllBaseHeroes();
    if (allBase.length === 0) {
      this.addText(b.centerX, b.centerY, '기본영웅 데이터를 불러올 수 없습니다.', {
        fontSize: sf(15),
        color: '#FF6B6B'
      }).setOrigin(0.5);
      return;
    }

    const itemH = s(90);
    const listTop = b.top + s(100);
    const listW = b.width - s(40);

    allBase.forEach((hero, i) => {
      const itemY = listTop + i * (itemH + s(10));
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

    // 영웅 아이콘 (이모지 대체)
    const icon = this.scene.add.text(cx - w / 2 + s(40), cy, this._getClassIcon(hero.baseClass), {
      fontSize: sf(32)
    }).setOrigin(0.5);
    this.contentContainer.add(icon);
    this._track(icon);

    // 영웅 이름
    const nameText = this.scene.add.text(cx - w / 2 + s(85), cy - s(16), hero.name, {
      fontSize: sf(18),
      fontFamily: '"Noto Sans KR", Arial',
      fontStyle: 'bold',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0, 0.5);
    this.contentContainer.add(nameText);
    this._track(nameText);

    // 클래스 + 기관 루트 수
    const routeCount = (hero.ascensionRoutes || []).length;
    const subText = this.scene.add.text(cx - w / 2 + s(85), cy + s(16), `${this._classLabel(hero.baseClass)} · 루트 ${routeCount}종`, {
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
        pityLabel = '⚡ 확정';
        pityColor = '#000000';
        pityBg = 0xFFD700;
      } else if (pityInfo.isSoftPity) {
        pityLabel = '🔥 소프트 피티';
        pityColor = '#ffffff';
        pityBg = 0xFF8C00;
      } else {
        pityLabel = `${pityInfo.pullsUntilSoft}회 후 피티`;
        pityColor = '#aaaaaa';
        pityBg = null;
      }

      const pityText = this.scene.add.text(cx + w / 2 - s(55), cy - s(18), pityLabel, {
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
      this.buildStep2();
    });
  }

  // ─────────────────────────────────────────
  // Step 2: 기관 선택
  // ─────────────────────────────────────────

  buildStep2() {
    this.currentStep = 2;
    this._clearStep();
    const b = this.contentBounds;
    const hero = this.selectedBaseHero;

    // 스텝 인디케이터
    this._renderStepIndicator(2);

    // 뒤로가기
    this._renderBackButton(() => this.buildStep1());

    // 영웅 이름 헤더
    this.addText(b.centerX, b.top + s(70), `${hero.name}의 각인 루트`, {
      fontSize: sf(17),
      fontStyle: 'bold',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 각 루트 카드
    const routes = hero.ascensionRoutes || [];
    if (routes.length === 0) {
      this.addText(b.centerX, b.centerY, '각인 가능한 루트가 없습니다.', {
        fontSize: sf(15),
        color: '#FF6B6B'
      }).setOrigin(0.5);
      return;
    }

    const itemH = s(110);
    const listTop = b.top + s(105);
    const listW = b.width - s(40);

    routes.forEach((route, i) => {
      const itemY = listTop + i * (itemH + s(12));
      this._renderRouteItem(route, b.centerX, itemY, listW, itemH);
    });
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
        color: '#FFD700'
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

    // 스텝 인디케이터
    this._renderStepIndicator(3);

    // 뒤로가기
    this._renderBackButton(() => this.buildStep2());

    // 제목
    this.addText(b.centerX, b.top + s(70), '각인을 확인하세요', {
      fontSize: sf(17),
      fontStyle: 'bold',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 확인 카드 배경
    const cardY = b.top + s(230);
    const cardH = s(280);
    const cardW = b.width - s(40);
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
    this.addText(b.centerX + s(160), arrowY - s(25), '✨', {
      fontSize: sf(36)
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
      this.addText(b.centerX, arrowY + s(90), '★ 공명 보정 적용 (등급 1단계 상향)', {
        fontSize: sf(13),
        color: '#FFD700'
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
    this.addText(b.centerX - s(90), costY + s(30), `📜 영웅 조각 × ${fragRequired}개`, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", Arial',
      color: fragOk ? '#4ADE80' : '#FF6B6B'
    }).setOrigin(0, 0.5);
    this.addText(b.centerX + s(90), costY + s(30), `보유: ${ownedFrag}`, {
      fontSize: sf(13),
      color: fragOk ? '#4ADE80' : '#FF6B6B'
    }).setOrigin(1, 0.5);

    // 정령석(젬)
    const gemsOk = ownedGems >= stonesRequired;
    this.addText(b.centerX - s(90), costY + s(60), `💎 정령석 × ${stonesRequired}개`, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", Arial',
      color: gemsOk ? '#4ADE80' : '#FF6B6B'
    }).setOrigin(0, 0.5);
    this.addText(b.centerX + s(90), costY + s(60), `보유: ${ownedGems}`, {
      fontSize: sf(13),
      color: gemsOk ? '#4ADE80' : '#FF6B6B'
    }).setOrigin(1, 0.5);

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

    // 각인 실행 버튼
    const btnY = b.bottom - s(80);
    const canAscendResult = SaveManager.canAscend(hero.id, route.cultId);
    const btnColor = canAscendResult.canAscend ? 0x6366F1 : 0x555555;

    const { bg: ascBtn } = this.addButton(
      b.centerX,
      btnY,
      b.width - s(80),
      s(64),
      canAscendResult.canAscend ? '✨ 각인 실행' : `각인 불가 — ${canAscendResult.reason}`,
      btnColor,
      () => {
        if (!canAscendResult.canAscend) return;
        this._executeAscension();
      }
    );

    if (!canAscendResult.canAscend) {
      ascBtn.setAlpha(0.5);
      ascBtn.disableInteractive();
    }
  }

  // ─────────────────────────────────────────
  // 각인 실행
  // ─────────────────────────────────────────

  _executeAscension() {
    const hero = this.selectedBaseHero;
    const route = this.selectedRoute;

    const result = SaveManager.performAscension(hero.id, route.cultId);

    if (result.success) {
      const cultData = SaveManager.getCultData(route.cultId);
      const cultName = cultData ? cultData.nameKr : route.cultId;
      const ascData = SaveManager.getAscendedHeroData(route.ascendedHeroId);
      const ascName = ascData ? ascData.name : route.ascendedHeroId;
      this._showSuccessScreen(ascName, cultName, route.resultRarity);
    } else {
      this._showToastInPopup(`각인 실패: ${result.error}`);
    }
  }

  /**
   * 각인 성공 화면
   */
  _showSuccessScreen(ascName, cultName, rarity) {
    this._clearStep();
    const b = this.contentBounds;
    const rarityColor = this._rarityColor(rarity);

    // 성공 이모지
    this.addText(b.centerX, b.centerY - s(120), '✨', {
      fontSize: sf(72)
    }).setOrigin(0.5);

    this.addText(b.centerX, b.centerY, `${ascName}`, {
      fontSize: sf(24),
      fontFamily: '"Noto Sans KR", Arial',
      fontStyle: 'bold',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    this.addText(b.centerX, b.centerY + s(40), `${cultName} 교단 각인 완료!`, {
      fontSize: sf(17),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    this.addText(b.centerX, b.centerY + s(75), rarity, {
      fontSize: sf(20),
      fontStyle: 'bold',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 닫기 버튼
    this.addButton(
      b.centerX,
      b.bottom - s(80),
      b.width - s(80),
      s(64),
      '확인',
      COLORS.primary,
      () => this.close()
    );

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
   * 스텝 인디케이터 (1/2/3 도트)
   */
  _renderStepIndicator(current) {
    const b = this.contentBounds;
    const totalSteps = 3;
    const dotR = s(6);
    const gapX = s(20);
    const startX = b.centerX - (totalSteps - 1) * gapX / 2;
    const dotY = b.top + s(30);

    for (let i = 1; i <= totalSteps; i++) {
      const x = startX + (i - 1) * gapX;
      const color = i === current ? COLORS.primary : COLORS.bgLight;
      const dot = this.scene.add.graphics();
      dot.fillStyle(color, 1);
      dot.fillCircle(x, dotY, dotR);
      this.contentContainer.add(dot);
      this._track(dot);
    }
  }

  /**
   * 뒤로가기 버튼
   */
  _renderBackButton(callback) {
    const b = this.contentBounds;
    const backBtn = this.scene.add.text(b.left + s(10), b.top + s(30), '‹ 뒤로', {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", Arial',
      color: `#${COLORS.primary.toString(16).padStart(6, '0')}`
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

    backBtn.on('pointerover', () => backBtn.setAlpha(0.7));
    backBtn.on('pointerout', () => backBtn.setAlpha(1));
    backBtn.on('pointerdown', callback);

    this.contentContainer.add(backBtn);
    this._track(backBtn);
  }

  /**
   * 팝업 내 토스트 메시지
   */
  _showToastInPopup(message) {
    const b = this.contentBounds;
    const toast = this.scene.add.text(b.centerX, b.bottom - s(40), message, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", Arial',
      color: '#FF6B6B',
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

  _getClassIcon(baseClass) {
    const icons = {
      warrior: '⚔️',
      mage: '🔮',
      archer: '🏹',
      healer: '✨',
      rogue: '🗡️',
      tank: '🛡️'
    };
    return icons[baseClass] || '👤';
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
