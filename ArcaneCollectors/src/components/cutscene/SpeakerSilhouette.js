/**
 * SpeakerSilhouette — 포트레이트 자산이 없는 화자의 실루엣 메달
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §3-4
 * 등록관·미공개 화자는 전신/포트레이트 자산이 없다(내러티브 §7 이슈 5).
 * 등록관은 컷씬 전체에서 가장 많이 말하는 화자(68줄)라 이 폴백이 사실상 **기본 연출**이다.
 * 그래서 형태가 뭉개진 그림자 대신 **문장(紋章) 메달**을 세운다:
 *   글로우 → 어두운 원판 → 액센트 림 + 안쪽 헤어라인 → 4방향 눈금 → 아이콘.
 * 아이콘이 없는 유형(미공개 화자)은 모노그램(`?`)으로 대체한다.
 *
 * 적·보스는 이 경로를 타지 않는다 — `CharacterStage` 가 `enemies` 버킷 아트로 초상 카드를 세운다.
 *
 * 주의: gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { s, sf } from '../../config/scaleConfig.js';
import { IconFactory } from '../../utils/IconFactory.js';
import { ENEMY_CARD } from '../../utils/cutsceneLayout.js';

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
 * 적 초상 카드(`ENEMY_CARD.centerY`)와 같은 높이를 쓴다 — 화자가 바뀌어도 시선이 튀지 않는다.
 */
const MEDAL = Object.freeze({
  radius: 124,
  iconSize: 112,
  centerY: ENEMY_CARD.centerY,
  plateColor: 0x0b1220,
  plateAlpha: 0.9,
  rimWidth: 3,
  /** 림 안쪽 헤어라인 */
  innerInset: 12,
  /** 4방향 눈금 */
  tick: { count: 4, len: 18, width: 3, gap: 10 },
  /** 바깥 글로우 */
  glow: { rings: 3, spread: 26, alpha: 0.16 },
  /** 바닥 그림자 타원 */
  shadow: { dy: 150, rx: 96, ry: 18, alpha: 0.35 }
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

  /** @private 글로우 + 원판 + 림 + 눈금 + 아이콘 */
  _createMedal(line) {
    const style = getSpeakerStyle(line.speakerType);
    const radius = s(MEDAL.radius);
    // 컨테이너는 발치(slot.y)에 있으므로 메달 중심까지의 차이만큼 위로 올린다
    const container = this.scene.add.container(0, s(MEDAL.centerY - this.slot.y));

    const gfx = this.scene.add.graphics();

    // 바닥 그림자 — 메달이 공중에 붕 뜨지 않게 잡아준다
    gfx.fillStyle(0x000000, MEDAL.shadow.alpha);
    gfx.fillEllipse(0, s(MEDAL.shadow.dy), s(MEDAL.shadow.rx) * 2, s(MEDAL.shadow.ry) * 2);

    // 바깥 글로우
    for (let i = MEDAL.glow.rings; i >= 1; i -= 1) {
      gfx.fillStyle(style.accent, (MEDAL.glow.alpha / MEDAL.glow.rings) * (MEDAL.glow.rings - i + 1));
      gfx.fillCircle(0, 0, radius + (s(MEDAL.glow.spread) * i) / MEDAL.glow.rings);
    }

    // 원판
    gfx.fillStyle(MEDAL.plateColor, MEDAL.plateAlpha);
    gfx.fillCircle(0, 0, radius);

    // 림 + 안쪽 헤어라인
    gfx.lineStyle(s(MEDAL.rimWidth), style.accent, 0.92);
    gfx.strokeCircle(0, 0, radius);
    gfx.lineStyle(s(1), 0xffffff, 0.14);
    gfx.strokeCircle(0, 0, radius - s(MEDAL.innerInset));

    container.add(gfx);
    container.add(this._createTicks(style, radius));

    const glyph = this._createGlyph(style);
    if (glyph) container.add(glyph);

    return container;
  }

  /** @private 4방향 눈금 — 메달에 "문장" 느낌을 준다 */
  _createTicks(style, radius) {
    const ticks = this.scene.add.graphics();
    ticks.lineStyle(s(MEDAL.tick.width), style.accent, 0.75);
    const inner = radius + s(MEDAL.tick.gap);
    const outer = inner + s(MEDAL.tick.len);
    for (let i = 0; i < MEDAL.tick.count; i += 1) {
      const angle = (Math.PI / 2) * i + Math.PI / 4;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      ticks.lineBetween(cos * inner, sin * inner, cos * outer, sin * outer);
    }
    return ticks;
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
        fontSize: sf(92),
        color: `#${style.accent.toString(16).padStart(6, '0')}`
      })
      .setOrigin(0.5);
  }
}

export default SpeakerSilhouette;
