/**
 * CharacterStage — 컷씬 좌/우 화자 무대
 *
 * 화자 종류에 따라 세 가지 배우를 세운다 (`resolveSpeakerAsset` 이 판정).
 *   1. 영웅 — 전신 시트(asset-manifest `fullbody`)를 지연 로드해 발치 기준으로 세운다.
 *      시트가 없으면 512 포트레이트로 폴백한다.
 *   2. 적·보스와 NPC(등록관) — `enemies` / `npc` 버킷의 512² 흉상을 **초상 카드**로 세운다.
 *      이 아트들은 알파가 없는 정사각 이미지라 그대로 놓으면 배경 위에 사진을 붙인 것처럼
 *      보인다. 그래서 뒤판 + `frame_card_*` 9-slice + 하단 그라디언트 페이드로 감싼다.
 *      글로우 색은 화자 유형색을 따른다(적=적색, NPC=길드 금색).
 *   3. 그 외(정체 미공개 `???`) — `SpeakerSilhouette` 의 실루엣 메달.
 *
 * 발화자는 밝게·살짝 앞으로, 상대는 어둡게(틴트 0.55) 물러난다.
 * 슬롯의 인물이 바뀌면 바깥쪽으로 슬라이드 아웃하고 새 인물이 슬라이드 인한다.
 *
 * 텍스처 수명: **이 무대가 직접 등록한 적 아트만** 해제한다(`_ownedTextures`).
 * 영웅 전신 시트는 영웅 상세·전투와 공용이라 건드리지 않는다(공용 해제 회귀 이력).
 *
 * 주의: gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { s } from '../../config/scaleConfig.js';
import { DESIGN } from '../../config/designSystem.js';
import {
  ACTOR_DIM,
  ACTOR_SLOT,
  ENEMY_CARD,
  actorSlot,
  buildEnemyIndex,
  buildSpeakerNameIndex,
  enemyCardRect,
  isPortraitCardKind,
  resolveSpeakerAsset,
  SPEAKER_ASSET_KIND
} from '../../utils/cutsceneLayout.js';
import { computeFullbodyFit, resolveFullbodyKey, fullbodyPath, hasFullbodyAsset } from '../../utils/heroDetailLayout.js';
import { ensureTextureFromPath } from '../../utils/lazyTexture.js';
import { NineSliceFrame } from '../NineSliceFrame.js';
import PORTRAIT_MAP from '../../data/portrait-mapping.json';
import ENEMY_DATA from '../../data/enemies.json';
import SPEAKER_ASSETS from '../../data/speaker-assets.json';
import ASSET_MANIFEST from '../../../tools/art/asset-manifest.json';
import { SpeakerSilhouette, getSpeakerStyle } from './SpeakerSilhouette.js';

/** 트윈 지속 시간 (ms) — 등장/퇴장 200ms 이내 규약 */
const TWEEN = Object.freeze({ enter: 200, exit: 180, focus: 160 });

/** 색인은 모듈 스코프에서 만들지 않고 최초 사용 시 한 번만 만든다(TDZ 회피) */
let enemyIndexCache = null;
function getEnemyIndex() {
  if (!enemyIndexCache) enemyIndexCache = buildEnemyIndex(ENEMY_DATA);
  return enemyIndexCache;
}

let speakerIndexCache = null;
function getSpeakerIndex() {
  if (!speakerIndexCache) speakerIndexCache = buildSpeakerNameIndex(SPEAKER_ASSETS);
  return speakerIndexCache;
}

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
    /** @type {Set<string>} 이 무대가 직접 등록한 텍스처 키 (해제 대상) */
    this._ownedTextures = new Set();
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

  /**
   * 슬롯별로 실제 화면에 올라간 텍스처 키 (e2e·디버그용).
   * 실루엣 메달이면 `null` 이다 — "아트가 붙었는가"를 이 값으로 판정한다.
   * @returns {{left: string|null, right: string|null}}
   */
  getActorTextures() {
    return {
      left: this.actors.left?.textureKey || null,
      right: this.actors.right?.textureKey || null
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
    this._releaseOwnedTextures();
    this.root?.destroy(true);
    this.root = null;
  }

  /** @private 자기가 등록한 텍스처만 되돌린다. 공용 텍스처는 절대 건드리지 않는다 */
  _releaseOwnedTextures() {
    if (!this.scene?.textures) {
      this._ownedTextures.clear();
      return;
    }
    this._ownedTextures.forEach((key) => {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    });
    this._ownedTextures.clear();
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

    const asset = resolveSpeakerAsset(line, {
      enemyIndex: getEnemyIndex(),
      speakerIndex: getSpeakerIndex(),
      manifestEnemies: ASSET_MANIFEST.enemies,
      manifestNpc: ASSET_MANIFEST.npc
    });
    const slot = this._slotFor(side, asset);
    const actor = { identity, side, slot, object: null, silhouette: null, tintTargets: [], textureKey: null, isPortrait: false };

    if (isPortraitCardKind(asset?.kind)) {
      actor.object = this._createPortraitCard(asset, side, actor, getSpeakerStyle(line.speakerType).accent);
    } else if (asset?.kind === SPEAKER_ASSET_KIND.HERO) {
      actor.object = this._createPortraitActor(asset.portraitId, slot, actor);
      actor.isPortrait = !!actor.object;
      if (actor.object) {
        actor.tintTargets = [actor.object];
        actor.textureKey = actor.object.texture?.key || null;
      }
    }

    if (!actor.object) {
      // 아트가 없는 화자(등록관·???)는 실루엣 메달로 세운다
      actor.silhouette = new SpeakerSilhouette(this.scene, this.root, { x: slot.x, y: slot.y });
      actor.silhouette.show(line);
      actor.object = actor.silhouette.root;
    }

    this.actors[side] = actor;
    this._playEntry(actor, slot);
  }

  /** @private 배우 종류별 슬롯. 초상 카드는 발치가 아니라 카드 중심에 선다 */
  _slotFor(side, asset) {
    const slot = actorSlot(side);
    if (isPortraitCardKind(asset?.kind)) {
      return { ...slot, y: enemyCardRect(side).y, isCard: true };
    }
    return slot;
  }

  /** @private 슬롯을 비운다 (바깥쪽으로 슬라이드 아웃) */
  _removeActor(side) {
    const actor = this.actors[side];
    if (!actor) return;
    this.actors[side] = null;

    const slot = actor.slot || actorSlot(side);
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

  // ================================================================
  // 초상 카드 (적·보스·NPC)
  // ================================================================

  /**
   * @private 512² 흉상 초상 카드. 글로우 → 뒤판 → 아트 → 하단 페이드 → 프레임 순으로 겹친다.
   * 아트가 아직 없으면 카드 골격만 세우고 지연 로드가 끝나면 안쪽에 끼워 넣는다.
   *
   * @param {object} asset - resolveSpeakerAsset 결과
   * @param {'left'|'right'} side
   * @param {object} actor
   * @param {number} accent - 화자 유형색 (글로우)
   */
  _createPortraitCard(asset, side, actor, accent) {
    const card = enemyCardRect(side);
    const container = this.scene.add.container(s(card.x), s(card.y));
    this.root.add(container);

    const half = s(card.size) / 2;
    const radius = s(18);

    const artSize = s(card.artSize);
    const plateHalf = artSize / 2 + s(8);

    // 액센트 글로우 — 아트 자리 뒤에서만 번진다. 카드 전체 크기로 깔면
    // 배경 위에 붉은 사각형이 떠 있는 것처럼 보인다.
    const glow = this.scene.add.graphics();
    for (let i = 3; i >= 1; i -= 1) {
      const spread = s(ENEMY_CARD.glowSpread) * (i / 3);
      glow.fillStyle(accent, (ENEMY_CARD.glowAlpha / 3) * (4 - i) * 0.4);
      glow.fillRoundedRect(
        -plateHalf - spread, -plateHalf - spread,
        plateHalf * 2 + spread * 2, plateHalf * 2 + spread * 2,
        radius + spread
      );
    }
    container.add(glow);

    // 뒤판 — 프레임 안쪽(아트 자리)만 덮는다
    const plate = this.scene.add.graphics();
    plate.fillStyle(DESIGN.colors.bg.primary, ENEMY_CARD.plateAlpha);
    plate.fillRoundedRect(-plateHalf, -plateHalf, plateHalf * 2, plateHalf * 2, radius);
    container.add(plate);
    const mountArt = () => {
      if (this.destroyed || this.actors[side] !== actor || !container.scene) return;
      if (!this.scene.textures.exists(asset.textureKey)) return;

      const art = this.scene.add.image(0, 0, asset.textureKey).setOrigin(0.5);
      art.setDisplaySize(artSize, artSize);
      art.setAlpha(0);
      container.addAt(art, 2);
      actor.tintTargets = [art];
      actor.textureKey = asset.textureKey;
      this.scene.tweens.add({ targets: art, alpha: 1, duration: TWEEN.focus });

      // 하단 페이드 — 잘린 정사각형이 배경으로 녹아들게 한다
      const fadeH = artSize * ENEMY_CARD.fadeRatio;
      const fade = this.scene.add.graphics();
      fade.fillGradientStyle(
        DESIGN.colors.bg.primary, DESIGN.colors.bg.primary,
        DESIGN.colors.bg.primary, DESIGN.colors.bg.primary,
        0, 0, 0.92, 0.92
      );
      fade.fillRect(-artSize / 2, artSize / 2 - fadeH, artSize, fadeH);
      container.addAt(fade, 3);
    };

    if (this.scene.textures.exists(asset.textureKey)) {
      mountArt();
    } else if (asset.path) {
      ensureTextureFromPath(this.scene, asset.textureKey, asset.path, (key, added) => {
        if (added) this._ownedTextures.add(key);
        mountArt();
      });
    }

    // 등급 프레임 — 아트 모서리를 덮어 "사진을 붙인" 인상을 지운다
    const frame = NineSliceFrame.create(this.scene, {
      x: 0, y: 0, w: half * 2, h: half * 2, key: asset.frameKey
    });
    container.add(frame);

    return container;
  }

  // ================================================================
  // 영웅 전신/포트레이트
  // ================================================================

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
    actor.tintTargets = [next];
    actor.textureKey = key;
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

      const slot = actor.slot || actorSlot(side);
      const isActive = side === activeSide;
      const target = actor.object;

      // 컨테이너(적 카드)는 setTint 가 없다. 안쪽 아트에 건다
      const tintTargets = actor.tintTargets?.length ? actor.tintTargets : [target];
      tintTargets.forEach((obj) => {
        if (typeof obj?.setTint !== 'function') return;
        if (isActive) obj.clearTint();
        else obj.setTint(ACTOR_DIM.tint);
      });

      if (typeof target.setDepth === 'function') target.setDepth(isActive ? 1 : 0);

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
