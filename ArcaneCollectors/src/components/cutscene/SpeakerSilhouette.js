/**
 * SpeakerSilhouette — 포트레이트 자산이 없는 화자의 실루엣 메달
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §3-4
 * 등록관·적·보스·미공개 화자는 전신/포트레이트 자산이 없다(내러티브 §7 이슈 5).
 * 이 경우 형태가 뭉개진 그림자 대신 **정돈된 메달**을 세운다:
 *   원형 판(화자색 림) + `IconFactory` 벡터 아이콘 + 화자 유형 라벨.
 * 아이콘이 없는 유형(미공개 화자)은 모노그램(`?`)으로 대체한다.
 *
 * 주의: gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { s, sf } from '../../config/scaleConfig.js';
import { IconFactory } from '../../utils/IconFactory.js';

/** 화자 유형별 색상/표기 규칙 (UX §3-4) */
export const SPEAKER_STYLE = {
  hero: { accent: 0x6366f1, showBox: true, showName: true, icon: 'heroes' },
  npc: { accent: 0xc8a951, showBox: true, showName: true, icon: 'quest' },
  enemy: { accent: 0xef4444, showBox: true, showName: true, icon: 'raid' },
  unknown: { accent: 0x64748b, showBox: true, showName: true, icon: null, monogram: '?' },
  player: { accent: 0xf8fafc, showBox: true, showName: false, icon: null },
  narrator: { accent: 0x94a3b8, showBox: false, showName: false, icon: null }
};

export function getSpeakerStyle(speakerType) {
  return SPEAKER_STYLE[speakerType] || SPEAKER_STYLE.narrator;
}

/**
 * 메달 규격 (base px).
 * `centerY` 는 화면 절대 좌표다. 전신 시트와 달리 메달은 발치 기준이 아니라
 * 대화박스(y 890~) 위 빈 공간의 한가운데에 떠 있어야 가려지지 않는다.
 */
const MEDAL = Object.freeze({
  radius: 132,
  iconSize: 120,
  centerY: 660,
  plateAlpha: 0.82,
  rimWidth: 3
});

export class SpeakerSilhouette {
  /**
   * @param {Phaser.Scene} scene
   * @param {Phaser.GameObjects.Container} [parent]
   * @param {{x?: number, y?: number}} [slot] - base 좌표. origin (0.5, 1.0) 기준의 발치
   */
  constructor(scene, parent = null, slot = {}) {
    this.scene = scene;
    this.slot = { x: slot.x ?? 250, y: slot.y ?? 900 };
    this.root = scene.add.container(s(this.slot.x), s(this.slot.y));
    this.current = null;
    if (parent) parent.add(this.root);
  }

  /**
   * 화자를 표시한다.
   * @param {{speaker: string, speakerType: string, portraitId: string|null}} line
   */
  show(line) {
    this.clear();
    if (!line) return;
    if (line.speakerType === 'narrator' || line.speakerType === 'player') return;

    const medal = this._createMedal(line);
    this.root.add(medal);
    this.current = medal;
  }

  clear() {
    this.root?.removeAll(true);
    this.current = null;
  }

  destroy() {
    this.root?.destroy(true);
    this.root = null;
    this.current = null;
  }

  // ================================================================
  // 내부 구현
  // ================================================================

  /** @private 원형 판 + 아이콘 + 라벨 */
  _createMedal(line) {
    const style = getSpeakerStyle(line.speakerType);
    const radius = s(MEDAL.radius);
    // 컨테이너는 발치(slot.y)에 있으므로 메달 중심까지의 차이만큼 위로 올린다
    const container = this.scene.add.container(0, s(MEDAL.centerY - this.slot.y));

    const plate = this.scene.add.graphics();
    plate.fillStyle(0x0b1220, MEDAL.plateAlpha);
    plate.fillCircle(0, 0, radius);
    plate.lineStyle(s(MEDAL.rimWidth), style.accent, 0.9);
    plate.strokeCircle(0, 0, radius);
    container.add(plate);

    const glyph = this._createGlyph(style);
    if (glyph) container.add(glyph);

    return container;
  }

  /** @private IconFactory 벡터 아이콘. 없으면 모노그램 텍스트 */
  _createGlyph(style) {
    if (style.icon && IconFactory.has(style.icon)) {
      try {
        const icon = IconFactory.createImage(this.scene, 0, 0, style.icon, s(MEDAL.iconSize), {
          tint: style.accent
        });
        if (icon) return icon.setOrigin(0.5);
      } catch (e) {
        console.warn('[SpeakerSilhouette] 아이콘 생성 실패:', style.icon, e?.message);
      }
    }

    const glyph = style.monogram || '·';
    return this.scene.add
      .text(0, 0, glyph, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(96),
        color: `#${style.accent.toString(16).padStart(6, '0')}`
      })
      .setOrigin(0.5);
  }
}

export default SpeakerSilhouette;
