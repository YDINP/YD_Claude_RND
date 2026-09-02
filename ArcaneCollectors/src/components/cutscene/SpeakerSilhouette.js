/**
 * SpeakerSilhouette — 컷씬 화자 포트레이트 슬롯
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §3-4 (`portraitId: null` 폴백 연출 명세)
 *
 * 등록관·적·보스·미공개 화자는 포트레이트 자산이 없다(내러티브 §7 이슈 5).
 * 따라서 실루엣은 예외 처리가 아니라 **기본 연출**이며, 신규 이미지 자산 요구는 0건이다.
 * `portraitId`가 있으면 `HeroAssetLoader.ensureTexture`로 기존 자산을 재사용한다.
 *
 * 주의: gameConfig.js에서 값을 import하지 않는다(순환 import TDZ 회귀 방지).
 */
import { s } from '../../config/scaleConfig.js';
import { HeroAssetLoader } from '../../systems/HeroAssetLoader.js';

/** 화자 유형별 색상/표기 규칙 (UX §3-4) */
export const SPEAKER_STYLE = {
  hero: { accent: 0x6366f1, showBox: true, showName: true },
  npc: { accent: 0xc8a951, showBox: true, showName: true },
  enemy: { accent: 0xef4444, showBox: true, showName: true },
  unknown: { accent: 0x64748b, showBox: true, showName: true },
  player: { accent: 0xf8fafc, showBox: true, showName: false },
  narrator: { accent: 0x94a3b8, showBox: false, showName: false }
};

export function getSpeakerStyle(speakerType) {
  return SPEAKER_STYLE[speakerType] || SPEAKER_STYLE.narrator;
}

/** 슬롯 기준 좌표 (base 720×1280) — origin (0.5, 1.0) */
const SLOT_BASE = { x: 250, y: 900, maxW: 380, maxH: 540 };
const EMBLEM_BASE = { size: 260, y: 700 };
const ENEMY_BASE = { w: 340, h: 460 };

export class SpeakerSilhouette {
  /**
   * @param {Phaser.Scene} scene
   * @param {Phaser.GameObjects.Container} [parent] - 붙일 컨테이너 (없으면 씬에 직접)
   */
  constructor(scene, parent = null) {
    this.scene = scene;
    this.root = scene.add.container(s(SLOT_BASE.x), s(SLOT_BASE.y));
    this.current = null;
    if (parent) parent.add(this.root);
  }

  /**
   * 한 줄의 화자를 표시한다.
   * @param {{speaker: string, speakerType: string, portraitId: string|null}} line
   */
  show(line) {
    this.clear();
    if (!line) return;

    const type = line.speakerType;
    if (type === 'narrator' || type === 'player') {
      // 슬롯 비움 (내레이터·수집가는 얼굴이 없다)
      this.current = null;
      return;
    }

    if (line.portraitId) {
      const portrait = this._createPortrait(line.portraitId);
      if (portrait) {
        this.root.add(portrait);
        this.current = portrait;
        this._playEntry(portrait);
        return;
      }
    }

    const silhouette = this._createSilhouette(type);
    this.root.add(silhouette);
    this.current = silhouette;
    this._playEntry(silhouette);
  }

  clear() {
    this.root.removeAll(true);
    this.current = null;
  }

  destroy() {
    this.root?.destroy(true);
    this.root = null;
    this.current = null;
  }

  // ============================================
  // 내부 구현
  // ============================================

  _playEntry(target) {
    target.setAlpha(0);
    this.scene.tweens.add({ targets: target, alpha: target.getData('baseAlpha') ?? 1, duration: 220 });
  }

  /** 실제 포트레이트 자산 (없으면 HeroAssetLoader 플레이스홀더) */
  _createPortrait(portraitId) {
    let key = `hero_${portraitId}`;
    if (!this.scene.textures.exists(key)) {
      key = HeroAssetLoader.ensureTexture(this.scene, { id: portraitId });
    }
    if (!key || !this.scene.textures.exists(key)) return null;

    const image = this.scene.add.image(0, 0, key).setOrigin(0.5, 1);
    const source = this.scene.textures.get(key).getSourceImage();
    const scale = Math.min(s(SLOT_BASE.maxW) / source.width, s(SLOT_BASE.maxH) / source.height);
    image.setScale(scale);
    image.setData('baseAlpha', 1);
    return image;
  }

  /** 화자 유형별 벡터 실루엣 (Graphics — 신규 이미지 자산 0건) */
  _createSilhouette(speakerType) {
    if (speakerType === 'npc') return this._createGuildEmblem();

    const graphics = this.scene.add.graphics();
    const width = s(ENEMY_BASE.w);
    const height = s(ENEMY_BASE.h);
    const color = 0x0b1220;
    const alpha = speakerType === 'unknown' ? 0.35 : 1;
    const accent = getSpeakerStyle(speakerType).accent;

    const headR = width * 0.19;
    const headY = -height + headR + s(10);
    const bodyY = -height + headR * 2;
    const bodyH = height - headR * 2;

    // 인형(humanoid) 프리셋: 머리 + 어깨 + 몸통
    graphics.fillStyle(color, 1);
    graphics.fillCircle(0, headY, headR);
    graphics.fillRoundedRect(-width / 2, bodyY, width, bodyH, s(28));

    // 어두운 배경에서도 형태가 읽히도록 화자색 림을 얇게 얹는다
    graphics.lineStyle(s(2), accent, 0.55);
    graphics.strokeCircle(0, headY, headR);
    graphics.strokeRoundedRect(-width / 2, bodyY, width, bodyH, s(28));

    graphics.setData('baseAlpha', alpha);
    graphics.setAlpha(alpha);
    return graphics;
  }

  /** 등록관: 길드 엠블럼(저울 + 열쇠) — 금색 단색 */
  _createGuildEmblem() {
    const container = this.scene.add.container(0, s(EMBLEM_BASE.y - SLOT_BASE.y));
    const size = s(EMBLEM_BASE.size);
    const half = size / 2;
    const gold = 0xc8a951;

    const g = this.scene.add.graphics();
    g.lineStyle(s(6), gold, 1);
    g.fillStyle(gold, 1);

    // 저울: 기둥 + 빔 + 좌우 접시
    g.lineBetween(0, -half * 0.7, 0, half * 0.55);
    g.lineBetween(-half * 0.62, -half * 0.45, half * 0.62, -half * 0.45);
    g.lineBetween(-half * 0.62, -half * 0.45, -half * 0.62, -half * 0.1);
    g.lineBetween(half * 0.62, -half * 0.45, half * 0.62, -half * 0.1);
    g.strokeEllipse(-half * 0.62, -half * 0.05, half * 0.5, half * 0.22);
    g.strokeEllipse(half * 0.62, -half * 0.05, half * 0.5, half * 0.22);
    g.lineBetween(-half * 0.32, half * 0.55, half * 0.32, half * 0.55);

    // 열쇠: 고리 + 대 + 이빨 (저울 위에 겹친다)
    g.strokeCircle(0, -half * 0.78, half * 0.16);
    g.lineBetween(0, -half * 0.62, 0, -half * 0.2);
    g.lineBetween(0, -half * 0.28, half * 0.16, -half * 0.28);

    container.add(g);
    container.setData('baseAlpha', 0.55);
    container.setAlpha(0.55);
    return container;
  }
}

export default SpeakerSilhouette;
