/**
 * AwakeningPopup.js
 * AWAKE-3: 교단 각성 UI 팝업
 *
 * PopupBase 상속, AwakeningSystem 연동
 */

import { PopupBase } from '../components/PopupBase.js';
import { COLORS, s, sf } from '../config/gameConfig.js';
import {
  AWAKENING_REQUIREMENTS,
  AWAKENING_STAGE_NAMES
} from '../systems/AwakeningSystem.js';
import { AwakeningCutscene } from '../systems/AwakeningCutscene.js';

export const LEVEL_REQUIREMENTS_BY_RARITY = {
  SSR: 40,
  SR: 30,
  R: 20
};

export function getCultRarity(cultId) {
  if (!cultId || !AWAKENING_REQUIREMENTS[cultId]) return null;
  return AWAKENING_REQUIREMENTS[cultId].rarity;
}

export function computeLevelCondition(currentLevel, cultId) {
  const rarity = getCultRarity(cultId);
  if (!rarity) {
    return { current: currentLevel || 0, required: 0, fulfilled: false };
  }
  const required = LEVEL_REQUIREMENTS_BY_RARITY[rarity] || 20;
  return {
    current: currentLevel || 0,
    required,
    fulfilled: (currentLevel || 0) >= required
  };
}

export function computeCanAwaken({ affinityOk, materialOk, trialOk, imprintOk, isSSR }) {
  if (isSSR) {
    return affinityOk && materialOk && trialOk && imprintOk;
  }
  return affinityOk && materialOk && trialOk;
}

export function getMaterialDisplayInfo(cultId, awakeningSystem) {
  if (!cultId || !awakeningSystem) return null;
  const info = awakeningSystem.getMaterialInfo(cultId);
  if (!info) return null;
  return {
    nameKr: info.nameKr || AWAKENING_REQUIREMENTS[cultId]?.materialName || '소재',
    icon: info.icon || '',
    imprintStone: info.imprintStone === true
  };
}

export function formatCultName(cultId) {
  const CULT_NAMES = {
    prism_stars: '프리즘 스타즈',
    neon_crow: '네온 크로우',
    ink_cyclone: '잉크 사이클론',
    stella_club: '스텔라 클럽',
    card_cartel: '카드 카르텔',
    buddy_garden: '버디 가든',
    glitch_paradise: '글리치 파라다이스',
    cafe_encore: '카페 앙코르',
    lunatic_circus: '루나틱 서커스',
    iron_beat: '아이언 비트'
  };
  return CULT_NAMES[cultId] || cultId || '미각성';
}
// ============================================
// AwakeningPopup 클래스
// ============================================

export class AwakeningPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '교단 각성',
      width: s(680),
      height: s(820),
      onClose: options.onClose || null
    });
    this.character = options.character || null;
    this.cultId = options.cultId || null;
    this.awakeningSystem = options.awakeningSystem || null;
    this.hasImprintStone = options.hasImprintStone === true;
    this.onAwaken = options.onAwaken || null;
    this._canAwaken = false;
    this._glowGraphics = null;
    this._trackedObjects = [];
  }

  static showAwakeningPopup(scene, character, cultId, awakeningSystem, extraOptions = {}) {
    const popup = new AwakeningPopup(scene, {
      character,
      cultId,
      awakeningSystem,
      ...extraOptions
    });
    popup.show();
    return popup;
  }

  _track(obj) {
    if (obj) this._trackedObjects.push(obj);
    return obj;
  }

  buildContent() {
    const b = this.contentBounds;
    let y = b.top + s(10);
    this._canAwaken = this._resolveCanAwaken();
    if (this._canAwaken) {
      this._applyGlowEffect();
    }
    y = this._buildHeader(b, y);
    y += s(12);
    this._drawSeparator(b.left, b.right, y);
    y += s(16);
    y = this._buildLevelCondition(b, y);
    y += s(14);
    y = this._buildAffinityCondition(b, y);
    y += s(14);
    y = this._buildMaterialCondition(b, y);
    y += s(14);
    y = this._buildTrialCondition(b, y);
    y += s(14);
    const rarity = getCultRarity(this.cultId);
    if (rarity === 'SSR') {
      y = this._buildSSRImprintCondition(b, y);
      y += s(14);
    }
    this._drawSeparator(b.left, b.right, y);
    y += s(20);
    this._buildAwakeningButton(b.centerX, y, this._canAwaken);
  }

  _buildHeader(b, y) {
    const charName = this.character?.name || '영웅';
    const cultDisplay = this.cultId ? formatCultName(this.cultId) : '미각성';
    const rarity = getCultRarity(this.cultId);
    const rarityColor = rarity === 'SSR' ? '#FFD700' : rarity === 'SR' ? '#C0C0C0' : '#CD7F32';
    const nameText = this.addText(b.centerX, y, charName, {
      fontSize: sf(22),
      fontStyle: 'bold',
      color: '#FFFFFF'
    });
    nameText.setOrigin(0.5, 0);
    this._track(nameText);
    y += s(32);
    const cultLabel = rarity ? (cultDisplay + " [" + rarity + "]") : cultDisplay;
    const cultText = this.addText(b.centerX, y, cultLabel, {
      fontSize: sf(15),
      color: rarityColor || '#FFFFFF'
    });
    cultText.setOrigin(0.5, 0);
    this._track(cultText);
    y += s(24);
    return y;
  }

  _buildLevelCondition(b, y) {
    if (!this.character || !this.cultId) return y;
    const cond = computeLevelCondition(this.character.level, this.cultId);
    const checkIcon = cond.fulfilled ? '[완료]' : '[미완]';
    const iconColor = cond.fulfilled ? '#4ADE80' : '#94A3B8';
    const label = this.addText(b.left + s(10), y,
      checkIcon + ' 레벨 조건: Lv.' + cond.current + ' / Lv.' + cond.required,
      { fontSize: sf(14), color: iconColor }
    );
    label.setOrigin(0, 0);
    this._track(label);
    y += s(20);
    return y;
  }
  _buildAffinityCondition(b, y) {
    if (!this.character || !this.cultId || !this.awakeningSystem) return y;
    const heroId = this.character.id || this.character.heroId || '';
    const affinityOk = this.awakeningSystem.checkAffinityCondition(heroId, this.cultId);
    const progress = this.awakeningSystem.getAwakeningProgress(heroId, this.cultId);
    const checkIcon = affinityOk ? '[완료]' : '[미완]';
    const iconColor = affinityOk ? '#4ADE80' : '#94A3B8';
    const label = this.addText(b.left + s(10), y,
      checkIcon + ' 친밀도: ' + progress.affinity + ' / ' + progress.affinityRequired,
      { fontSize: sf(14), color: iconColor }
    );
    label.setOrigin(0, 0);
    this._track(label);
    y += s(18);
    const ratio = progress.affinityRequired > 0 ? progress.affinity / progress.affinityRequired : 0;
    this._drawProgressBar(b.left + s(10), y, b.width - s(20), s(10), ratio, affinityOk);
    y += s(14);
    return y;
  }

  _buildMaterialCondition(b, y) {
    if (!this.character || !this.cultId || !this.awakeningSystem) return y;
    const heroId = this.character.id || this.character.heroId || '';
    const matResult = this.awakeningSystem.checkMaterialCondition(heroId, this.cultId);
    const matInfo = getMaterialDisplayInfo(this.cultId, this.awakeningSystem);
    const matName = matInfo ? matInfo.icon + ' ' + matInfo.nameKr : '소재';
    const checkIcon = matResult.fulfilled ? '[완료]' : '[미완]';
    const iconColor = matResult.fulfilled ? '#4ADE80' : '#94A3B8';
    const label = this.addText(b.left + s(10), y,
      checkIcon + ' ' + matName + ': ' + matResult.current + ' / ' + matResult.required,
      { fontSize: sf(14), color: iconColor }
    );
    label.setOrigin(0, 0);
    this._track(label);
    y += s(18);
    const ratio = matResult.required > 0 ? matResult.current / matResult.required : 0;
    this._drawProgressBar(b.left + s(10), y, b.width - s(20), s(10), ratio, matResult.fulfilled);
    y += s(14);
    return y;
  }

  _buildTrialCondition(b, y) {
    if (!this.character || !this.cultId || !this.awakeningSystem) return y;
    const heroId = this.character.id || this.character.heroId || '';
    const trialOk = this.awakeningSystem.checkTrialCondition(heroId, this.cultId);
    const progress = this.awakeningSystem.getAwakeningProgress(heroId, this.cultId);
    const checkIcon = trialOk ? '[완료]' : '[미완]';
    const iconColor = trialOk ? '#4ADE80' : '#94A3B8';
    let starStr = '';
    for (let i = 0; i < 3; i++) {
      starStr += i < progress.trialRequired ? (i < progress.trialCleared ? '★' : '☆') : '·';
    }
    const label = this.addText(b.left + s(10), y,
      checkIcon + ' 시련 ' + starStr + ' (' + progress.trialRequired + '성 필요)',
      { fontSize: sf(14), color: iconColor }
    );
    label.setOrigin(0, 0);
    this._track(label);
    y += s(20);
    return y;
  }

  _buildSSRImprintCondition(b, y) {
    const imprintOk = this.hasImprintStone;
    const checkIcon = imprintOk ? '[완료]' : '[미완]';
    const iconColor = imprintOk ? '#4ADE80' : '#F59E0B';
    const label = this.addText(b.left + s(10), y,
      checkIcon + ' 교단 각인석 소지 (SSR 필수)',
      { fontSize: sf(14), color: iconColor }
    );
    label.setOrigin(0, 0);
    this._track(label);
    y += s(20);
    return y;
  }

  _buildAwakeningButton(cx, y, canAwaken) {
    const btnColor = canAwaken ? 0x7C3AED : 0x475569;
    const btnLabel = canAwaken ? '교단 각성!' : '조건 미충족';
    const btn = this.addButton(cx, y, s(260), s(48), btnLabel, btnColor, () => {
      if (canAwaken) { this._executeAwakening(); }
    });
    this._track(btn);
  }

  _executeAwakening() {
    if (!this.character || !this.cultId || !this.awakeningSystem) return;
    const heroId = this.character.id || this.character.heroId || '';
    const result = this.awakeningSystem.executeAwakening(heroId, this.cultId);
    if (result.success) {
      const onComplete = () => {
        if (this.onAwaken) { this.onAwaken(this.cultId); }
        this.hide();
      };
      AwakeningCutscene.play(this.scene, this.character, this.cultId, onComplete);
    }
  }

  _applyGlowEffect() {
    if (!this.scene || !this.scene.add) return;
    try {
      const gfx = this.scene.add.graphics();
      const w = s(680);
      const h = s(820);
      const x = this.scene.scale ? this.scene.scale.width / 2 - w / 2 : 0;
      const yPos = this.scene.scale ? this.scene.scale.height / 2 - h / 2 : 0;
      gfx.lineStyle(3, 0x7C3AED, 0.85);
      gfx.strokeRoundedRect(x, yPos, w, h, 16);
      this._glowGraphics = gfx;
      if (this.scene.tweens) {
        this.scene.tweens.add({
          targets: gfx,
          alpha: { from: 0.4, to: 1 },
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    } catch (e) {}
  }

  _drawSeparator(x1, x2, y) {
    if (!this.scene || !this.scene.add) return;
    try {
      const gfx = this.scene.add.graphics();
      gfx.lineStyle(1, 0x475569, 0.6);
      gfx.beginPath();
      gfx.moveTo(x1 + s(4), y);
      gfx.lineTo(x2 - s(4), y);
      gfx.strokePath();
      this._track(gfx);
    } catch (e) {}
  }

  _drawProgressBar(x, y, width, height, ratio, fulfilled) {
    if (!this.scene || !this.scene.add) return;
    try {
      const gfx = this.scene.add.graphics();
      gfx.fillStyle(0x1E293B, 1);
      gfx.fillRoundedRect(x, y, width, height, 4);
      const fillColor = fulfilled ? 0x4ADE80 : 0x7C3AED;
      const clampedRatio = Math.min(1, Math.max(0, ratio));
      if (clampedRatio > 0) {
        gfx.fillStyle(fillColor, 1);
        gfx.fillRoundedRect(x, y, width * clampedRatio, height, 4);
      }
      this._track(gfx);
    } catch (e) {}
  }

  _resolveCanAwaken() {
    if (!this.character || !this.cultId || !this.awakeningSystem) return false;
    const heroId = this.character.id || this.character.heroId || '';
    const affinityOk = this.awakeningSystem.checkAffinityCondition(heroId, this.cultId);
    const matResult = this.awakeningSystem.checkMaterialCondition(heroId, this.cultId);
    const materialOk = matResult.fulfilled;
    const trialOk = this.awakeningSystem.checkTrialCondition(heroId, this.cultId);
    const rarity = getCultRarity(this.cultId);
    const isSSR = rarity === 'SSR';
    return computeCanAwaken({
      affinityOk,
      materialOk,
      trialOk,
      imprintOk: this.hasImprintStone,
      isSSR
    });
  }

  destroy() {
    if (this._glowGraphics) {
      try { this._glowGraphics.destroy(); } catch (e) {}
      this._glowGraphics = null;
    }
    for (const obj of this._trackedObjects) {
      try { if (obj && obj.destroy) { obj.destroy(); } } catch (e) {}
    }
    this._trackedObjects = [];
    super.destroy ? super.destroy() : null;
  }
}

export default AwakeningPopup;
