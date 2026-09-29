/**
 * BossInfoPopup — 현재 정화 대상(보스) 정보
 *
 * 사용자 요청: 로비에서 "지금 뭘 상대하고 있는지" 를 눌러 볼 수 있어야 한다.
 * 성소는 명상 장면에 집중하고, 대상 정보는 "현재 모험" 패널의 보스 줄을 탭해 여기로 온다.
 *
 * 보여 주는 것
 *   아트      `assets/characters/enemies/<id>.webp` (지연 로드, 없으면 벡터 실루엣)
 *   스탯      체력·공격·방어 (요약 슬롯) + 레벨대·분위기·보상 (콘텐츠)
 *   비교      내 파티 전투력 대 보스 전투력(추정) — 막대 + 문장
 *   진행도    축적 마력 / 필요 마력. 성소 게이지와 같은 값이다
 *
 * **여기에는 계산이 없다.** 전투력은 ProgressionSystem 이, 진행도는 IdleProgressSystem 이
 * 계산한 값을 받아 배치만 한다. 배치·판정 문구는 `utils/bossInfoLayout.js`(Phaser 비의존).
 *
 * 주의: designSystem·gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */

import { PopupBase } from '../PopupBase.js';
import { s } from '../../config/gameConfig.js';
import { DESIGN } from '../../config/designSystem.js';
import { ts } from '../../utils/textStyles.ts';
import { POPUP_SLOT } from '../../utils/popupLayout.js';
import { IconFactory } from '../../utils/IconFactory.js';
import { resolveEnemyArt } from '../../utils/idleBattleLayout.js';
import ASSET_MANIFEST from '../../../tools/art/asset-manifest.json';
import { getEnemy } from '../../data/index.ts';
import {
  computeBossInfoRows,
  bossSummaryCells,
  estimateBossPower,
  comparePower,
  verdictForRatio,
  moodLabel,
  moodHint
} from '../../utils/bossInfoLayout.js';

const TITLE = '정화 대상';

export class BossInfoPopup extends PopupBase {
  /** 지연 로드 임시 키 시퀀스 */
  static _loadSeq = 0;

  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.status.error,
      ...options
    });
    this._objects = [];
  }

  /**
   * 씬에서 현재 보스와 진행도를 읽는다. 팝업은 상태를 만들지 않는다.
   * @returns {{boss:Object|null, accumulated:number, required:number, partyPower:number}}
   */
  _readState() {
    const idle = this.scene.idleSystem;
    if (!idle) return { boss: null, accumulated: 0, required: 0, partyPower: 0 };
    if (!idle.currentBossData) idle.loadCurrentBoss?.();
    return {
      boss: idle.currentBossData || null,
      accumulated: idle.accumulatedDamage || 0,
      required: idle.currentBossHp || 0,
      partyPower: Math.floor(idle.getPartyPower?.() || 0)
    };
  }

  buildContent() {
    const state = this._readState();
    const boss = state.boss;

    this.setTitle(boss?.name || TITLE);
    this.setSummary(bossSummaryCells(boss));
    this.setActions([
      {
        label: '보스전 도전',
        variant: 'primary',
        onClick: () => {
          this.hide();
          this.scene.time.delayedCall(0, () => this.scene.prepareBossBattle?.());
        }
      },
      { label: '닫기', variant: 'ghost', onClick: () => this.hide() }
    ]);

    if (!boss) {
      this._addText(this.contentBounds.centerX, this.contentBounds.top + s(40),
        '정화 대상 정보를 불러오지 못했습니다', 'body', DESIGN.colors.text.secondary, 0.5);
      return;
    }

    const rows = computeBossInfoRows(this.getContentBounds(), s(1));
    this._renderArt(rows.art, boss);
    this._renderStats(rows.stats, boss);
    this._renderPower(rows.power, boss, state.partyPower);
    this._renderProgress(rows.progress, state.accumulated, state.required);
  }

  /**
   * 아트 영역 — 적 아트가 매니페스트에 있으면 지연 로드, 없으면 벡터 실루엣.
   * 매니페스트에 없는 키는 요청하지 않는다(dev 404 가드가 콘솔 에러를 남긴다).
   */
  _renderArt(slot, boss) {
    const plate = this.scene.add.graphics();
    plate.fillStyle(DESIGN.colors.bg.secondary, 0.55);
    plate.fillRoundedRect(slot.x - slot.w / 2, slot.y, slot.w, slot.h, s(DESIGN.radius.lg));
    plate.lineStyle(s(1), DESIGN.colors.status.error, 0.35);
    plate.strokeRoundedRect(slot.x - slot.w / 2, slot.y, slot.w, slot.h, s(DESIGN.radius.lg));
    this._track(plate);

    const fallback = IconFactory.createImage(this.scene, slot.x, slot.centerY, 'raid',
      s(DESIGN.icon.xl || 64), { tint: DESIGN.colors.status.error });
    if (fallback) this._track(fallback);

    const art = resolveEnemyArt(boss.id, ASSET_MANIFEST);
    if (!art) return;

    this._loadTexture(art.key, art.path, (ready) => {
      if (!this.isOpen) return;
      const source = this.scene.textures.get(ready).getSourceImage();
      if (!source || !source.width) return;
      const box = slot.h - s(16);
      const scale = Math.min(box / source.width, box / source.height);
      const image = this.scene.add.image(slot.x, slot.centerY, ready)
        .setDisplaySize(source.width * scale, source.height * scale)
        .setAlpha(0);
      this._track(image);
      fallback?.destroy();
      this.scene.tweens.add({ targets: image, alpha: 1, duration: 260, ease: 'Sine.easeOut' });
    });
  }

  /** 스탯 4줄 — 레벨대·분위기·보상. 체력/공격/방어는 요약 슬롯이 이미 보여 준다 */
  _renderStats(slot, boss) {
    const enemy = getEnemy?.(boss.id) || null;
    const mood = moodLabel(enemy?.mood);

    const lines = [
      { label: '유형', value: enemy?.type === 'boss' ? '보스' : (enemy?.type === 'elite' ? '정예' : '일반') },
      { label: '분위기', value: mood || '알 수 없음' },
      { label: '처치 보상', value: `${(boss.goldReward || 0).toLocaleString()} 골드 · ${(boss.expReward || 0).toLocaleString()} EXP` },
      { label: '상성 힌트', value: moodHint(enemy?.mood) }
    ];

    lines.forEach((line, i) => {
      const y = slot.top + slot.rowH * i;
      this._addText(slot.left, y, line.label, 'caption', DESIGN.colors.text.secondary, 0);
      const value = this._addText(slot.right, y, line.value, 'label', DESIGN.colors.text.primary, 1);
      // 상성 힌트는 길어서 넘칠 수 있다. 줄 폭 안으로 줄인다
      if (value.width > slot.width * 0.72) value.setFontSize(value.style.fontSize ? s(12) : s(12));
    });
  }

  /** 전투력 비교 — 막대 + 문장. 색만으로 전하지 않는다(A11Y) */
  _renderPower(slot, boss, partyPower) {
    const enemy = getEnemy?.(boss.id) || null;
    const bossPower = estimateBossPower({
      hp: boss.hp, atk: boss.atk, def: boss.def, spd: enemy?.stats?.spd || 0
    });
    const { ratio, fill } = comparePower(partyPower, bossPower);
    const verdict = verdictForRatio(ratio);

    this._addText(slot.left, slot.labelY, '전투력 비교', 'caption', DESIGN.colors.text.secondary, 0);
    this._addText(slot.right, slot.labelY,
      `내 파티 ${partyPower.toLocaleString()} · 대상 ${bossPower.toLocaleString()}(추정)`,
      'num.sm', DESIGN.colors.text.primary, 1);

    const tones = {
      danger: DESIGN.colors.status.error,
      warn: DESIGN.colors.status.warning,
      ok: DESIGN.colors.status.success,
      strong: DESIGN.colors.brand.accent
    };
    const color = tones[verdict.tone] || DESIGN.colors.brand.primary;

    const bar = this.scene.add.graphics();
    bar.fillStyle(DESIGN.colors.bg.primary, 0.85);
    bar.fillRoundedRect(slot.bar.x, slot.bar.y, slot.bar.w, slot.bar.h, slot.bar.h / 2);
    if (fill > 0) {
      bar.fillStyle(color, 0.95);
      bar.fillRoundedRect(slot.bar.x, slot.bar.y, Math.max(slot.bar.h, slot.bar.w * fill),
        slot.bar.h, slot.bar.h / 2);
    }
    // 동등선 — "절반이 곧 대등"이라는 것을 눈금으로 알린다
    bar.lineStyle(s(2), 0xFFFFFF, 0.55);
    bar.beginPath();
    bar.moveTo(slot.bar.x + slot.bar.w / 2, slot.bar.y - s(3));
    bar.lineTo(slot.bar.x + slot.bar.w / 2, slot.bar.y + slot.bar.h + s(3));
    bar.strokePath();
    this._track(bar);

    this._addText(slot.left, slot.verdictY, verdict.text, 'label', color, 0);
  }

  /** 진행도 — 성소 게이지와 같은 값 */
  _renderProgress(slot, accumulated, required) {
    const pct = required > 0 ? Math.floor(Math.min(1, accumulated / required) * 100) : 0;
    // 표시는 필요치에서 멈춘다. 시뮬레이션은 만충 뒤에도 계속 쌓아서 "4,414 / 528" 같은
    // 값이 나오는데, 화면에서 그 초과분은 뜻이 없다(수확하면 어차피 리셋된다).
    const shown = required > 0 ? Math.min(accumulated, required) : accumulated;
    this._addText(slot.left, slot.top, '축적 마력', 'caption', DESIGN.colors.text.secondary, 0);
    this._addText(slot.right, slot.top,
      `${Math.floor(shown).toLocaleString()} / ${Math.floor(required).toLocaleString()} (${pct}%)`,
      'num.sm', DESIGN.colors.text.primary, 1);
  }

  // ================================================================
  // 유틸
  // ================================================================

  /**
   * @param {number} x @param {number} y @param {string} text
   * @param {string} token textStyles 토큰
   * @param {string|number} color
   * @param {number} originX
   * @returns {Phaser.GameObjects.Text}
   */
  _addText(x, y, text, token, color, originX) {
    const css = typeof color === 'number'
      ? `#${color.toString(16).padStart(6, '0')}`
      : color;
    const obj = this.scene.add.text(x, y, text, ts(token, { color: css })).setOrigin(originX, 0);
    return this._track(obj);
  }

  /**
   * 콘텐츠 컨테이너에 붙이고 정리 목록에 넣는다.
   * @param {Phaser.GameObjects.GameObject} obj
   */
  _track(obj) {
    this.contentContainer?.add(obj);
    this._objects.push(obj);
    return obj;
  }

  /**
   * 텍스처 지연 로드 — 임시 키로 받아 승격한다(키 충돌 방지, IdleBattleView 와 같은 방식).
   * @param {string} finalKey @param {string} path @param {(key:string)=>void} onReady
   */
  _loadTexture(finalKey, path, onReady) {
    if (this.scene.textures.exists(finalKey)) { onReady(finalKey); return; }

    BossInfoPopup._loadSeq += 1;
    const tempKey = `__bossinfo__${finalKey}__${BossInfoPopup._loadSeq}`;
    this.scene.load.once(`filecomplete-image-${tempKey}`, () => {
      if (!this.scene?.sys?.isActive()) return;
      const textures = this.scene.textures;
      if (!textures.exists(finalKey) && textures.exists(tempKey)) {
        textures.renameTexture(tempKey, finalKey);
      } else if (textures.exists(tempKey)) {
        textures.remove(tempKey);
      }
      if (textures.exists(finalKey)) onReady(finalKey);
    });
    this.scene.load.image(tempKey, path);
    if (!this.scene.load.isLoading()) this.scene.load.start();
  }

  destroy() {
    this._objects = [];
    super.destroy();
  }
}

export default BossInfoPopup;
