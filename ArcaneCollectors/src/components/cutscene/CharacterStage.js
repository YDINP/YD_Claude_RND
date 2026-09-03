/**
 * CharacterStage — 컷씬 좌/우 화자 무대
 *
 * 화자에 `portraitId` 가 있으면 전신 시트(asset-manifest `fullbody` 버킷)를 지연 로드해
 * 좌/우 슬롯에 세운다. 시트가 없으면 512 포트레이트로 폴백하고, 그것도 없으면
 * `SpeakerSilhouette` 의 실루엣 메달을 세운다(등록관·적·미공개 화자).
 *
 * 발화자는 밝게·살짝 앞으로, 상대는 어둡게(틴트 0.55) 물러난다.
 * 슬롯의 인물이 바뀌면 바깥쪽으로 슬라이드 아웃하고 새 인물이 슬라이드 인한다.
 *
 * 주의: gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { s } from '../../config/scaleConfig.js';
import { ACTOR_DIM, ACTOR_SLOT, actorSlot } from '../../utils/cutsceneLayout.js';
import { computeFullbodyFit, resolveFullbodyKey, fullbodyPath, hasFullbodyAsset } from '../../utils/heroDetailLayout.js';
import { ensureTextureFromPath } from '../../utils/lazyTexture.js';
import PORTRAIT_MAP from '../../data/portrait-mapping.json';
import ASSET_MANIFEST from '../../../tools/art/asset-manifest.json';
import { SpeakerSilhouette } from './SpeakerSilhouette.js';

/** 트윈 지속 시간 (ms) */
const TWEEN = Object.freeze({ enter: 260, exit: 200, focus: 180 });

export class CharacterStage {
  /**
   * @param {Phaser.Scene} scene
   * @param {Phaser.GameObjects.Container} [parent]
   */
  constructor(scene, parent = null) {
    this.scene = scene;
    this.root = scene.add.container(0, 0);
    if (parent) parent.add(this.root);

    /** @type {{left: object|null, right: object|null}} 슬롯별 배우 */
    this.actors = { left: null, right: null };
    this.destroyed = false;
  }

  // ================================================================
  // 공개 API
  // ================================================================

  /**
   * 한 줄의 화자를 무대에 반영한다.
   * @param {object} line - story.json LineObject
   * @param {'left'|'right'|null} side - `assignSpeakerSides` 결과
   */
  show(line, side) {
    if (this.destroyed) return;

    if (side === 'left' || side === 'right') {
      this._ensureActor(side, line);
      this._focus(side);
    } else {
      // 내레이터·수집가 줄: 아무도 발화하지 않으므로 전원 물러난다
      this._focus(null);
    }
  }

  /** 무대의 배우를 모두 퇴장시킨다 (씬 전환·종료) */
  clearAll() {
    ['left', 'right'].forEach((side) => this._removeActor(side));
  }

  /** 현재 무대에 선 배우 식별자 (테스트·디버그용) */
  getActorIds() {
    return {
      left: this.actors.left ? this.actors.left.identity : null,
      right: this.actors.right ? this.actors.right.identity : null
    };
  }

  destroy() {
    this.destroyed = true;
    ['left', 'right'].forEach((side) => {
      const actor = this.actors[side];
      if (actor?.object) this.scene.tweens.killTweensOf(actor.object);
      if (actor?.silhouette) actor.silhouette.destroy();
      else if (actor?.object?.scene) actor.object.destroy();
      this.actors[side] = null;
    });
    this.root?.destroy(true);
    this.root = null;
  }

  // ================================================================
  // 배우 생성/교체
  // ================================================================

  /** @private 슬롯에 해당 화자를 세운다. 이미 같은 인물이면 아무것도 하지 않는다 */
  _ensureActor(side, line) {
    const identity = line.portraitId || `${line.speakerType}:${line.speaker}`;
    const current = this.actors[side];
    if (current && current.identity === identity) return;

    this._removeActor(side);

    const slot = actorSlot(side);
    const actor = { identity, side, object: null, silhouette: null, isPortrait: false };

    if (line.portraitId) {
      actor.object = this._createPortraitActor(line.portraitId, slot, actor);
      actor.isPortrait = !!actor.object;
    }
    if (!actor.object) {
      // 포트레이트 자산이 없는 화자(등록관·적·???)는 실루엣 메달로 세운다
      actor.silhouette = new SpeakerSilhouette(this.scene, this.root, { x: slot.x, y: slot.y });
      actor.silhouette.show(line);
      actor.object = actor.silhouette.root;
    }

    this.actors[side] = actor;
    this._playEntry(actor, slot);
  }

  /** @private 슬롯을 비운다 (바깥쪽으로 슬라이드 아웃) */
  _removeActor(side) {
    const actor = this.actors[side];
    if (!actor) return;
    this.actors[side] = null;

    const slot = actorSlot(side);
    const target = actor.object;
    if (!target) return;

    this.scene.tweens.killTweensOf(target);
    this.scene.tweens.add({
      targets: target,
      x: target.x + s(slot.slideFrom),
      alpha: 0,
      duration: TWEEN.exit,
      onComplete: () => {
        // 트윈 완료 시점에 이미 파괴됐을 수 있다 (씬 종료와 경쟁)
        if (actor.silhouette) actor.silhouette.destroy();
        else if (target.scene) target.destroy();
      }
    });
  }

  /** @private 전신 시트(없으면 포트레이트) 이미지를 만든다 */
  _createPortraitActor(portraitId, slot, actor) {
    const portraitKey = `hero_${portraitId}`;
    const fullbodyKey = resolveFullbodyKey(portraitId, PORTRAIT_MAP);

    // 1) 전신 시트가 이미 로드돼 있으면 그대로 쓴다
    if (fullbodyKey && this.scene.textures.exists(fullbodyKey)) {
      return this._createImage(fullbodyKey, slot);
    }

    // 2) 512 포트레이트로 먼저 세우고, 전신 시트는 뒤에서 받아 교체한다
    const fallbackKey = this.scene.textures.exists(portraitKey) ? portraitKey : null;
    if (!fallbackKey && !fullbodyKey) return null;

    const image = fallbackKey ? this._createImage(fallbackKey, slot) : null;

    if (fullbodyKey && hasFullbodyAsset(fullbodyKey, ASSET_MANIFEST.fullbody)) {
      ensureTextureFromPath(this.scene, fullbodyKey, fullbodyPath(fullbodyKey), () => {
        // 로드가 끝나기 전에 화자가 바뀌었으면 버린다
        if (this.destroyed || this.actors[actor.side] !== actor) return;
        this._swapTexture(actor, fullbodyKey, slot);
      });
    }

    return image;
  }

  /** @private 슬롯 규격에 맞춘 이미지 생성 */
  _createImage(key, slot) {
    const source = this.scene.textures.get(key).getSourceImage();
    const fit = computeFullbodyFit(source.width, source.height, {
      boxH: slot.boxH,
      maxW: slot.maxW,
      overscan: 1
    });

    const image = this.scene.add.image(s(slot.x), s(slot.y), key).setOrigin(0.5, 1);
    image.setDisplaySize(s(fit.width), s(fit.height));
    this.root.add(image);
    return image;
  }

  /** @private 포트레이트 → 전신 시트 교체 (같은 자리에서 크로스페이드) */
  _swapTexture(actor, key, slot) {
    const next = this._createImage(key, slot);
    if (!next) return;

    const prev = actor.object;
    next.setAlpha(0);
    next.setTint(prev.tintTopLeft);
    actor.object = next;
    actor.isPortrait = true;

    this.scene.tweens.killTweensOf(prev);
    this.scene.tweens.add({ targets: next, alpha: prev.alpha, duration: TWEEN.focus });
    this.scene.tweens.add({
      targets: prev,
      alpha: 0,
      duration: TWEEN.focus,
      onComplete: () => {
        if (prev.scene) prev.destroy();
      }
    });
  }

  // ================================================================
  // 포커스 연출
  // ================================================================

  /** @private 발화 슬롯을 밝히고 나머지를 어둡게 한다 */
  _focus(activeSide) {
    ['left', 'right'].forEach((side) => {
      const actor = this.actors[side];
      if (!actor?.object) return;

      const slot = actorSlot(side);
      const isActive = side === activeSide;
      const target = actor.object;

      if (typeof target.setTint === 'function') {
        if (isActive) target.clearTint();
        else target.setTint(ACTOR_DIM.tint);
      }
      if (isActive && typeof target.setDepth === 'function') target.setDepth(1);
      else if (typeof target.setDepth === 'function') target.setDepth(0);

      this.scene.tweens.add({
        targets: target,
        y: s(slot.y) - (isActive ? s(ACTOR_SLOT.focusLift) : 0),
        alpha: isActive ? ACTOR_DIM.focusAlpha : ACTOR_DIM.alpha,
        duration: TWEEN.focus,
        ease: 'Sine.easeOut'
      });
    });
  }

  /** @private 등장 슬라이드 */
  _playEntry(actor, slot) {
    const target = actor.object;
    if (!target) return;
    const finalX = s(slot.x);
    target.setPosition(finalX + s(slot.slideFrom), s(slot.y));
    target.setAlpha(0);
    this.scene.tweens.add({
      targets: target,
      x: finalX,
      alpha: ACTOR_DIM.alpha,
      duration: TWEEN.enter,
      ease: 'Sine.easeOut'
    });
  }
}

export default CharacterStage;
