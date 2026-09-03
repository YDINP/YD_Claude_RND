/**
 * IdleBattleView — 메인 화면 방치 전투 무대
 *
 * 관측창 안에서 파티 4인이 보스를 계속 두들기는 장면을 보여준다. AFK 방치형의
 * "내가 안 봐도 애들이 싸우고 있다"는 감각이 이 화면의 전부다. 그래서 정적인
 * 아이콘 나열이 아니라 **무대**로 만들었다.
 *
 *   무대   챕터 배경 + 바닥 띠. 좌측 앞줄 2 · 뒷줄 2 로 파티가 서고 우측에 보스가 선다.
 *          영웅은 전신 시트(투명 webp)를 축소한 스탠딩 스프라이트다.
 *   루프   순번대로 전진(lunge) → 히트 플래시 → 데미지 숫자 → 보스 흔들림.
 *          한 바퀴가 끝나면 보스가 한 번 반격한다.
 *   수치   HP 바·진행률·예상 격파 시간은 전부 `IdleProgressSystem` 의 실제 누적치에서
 *          나온다. 화면이 숫자를 지어내지 않는다.
 *
 * **로직은 이 컴포넌트에 없다.** 피해 계산·진행도·보스 교체는 전부 IdleProgressSystem 이
 * 하고, 여기는 그 결과를 받아 그리기만 한다. 그래서 연출을 바꿔도 밸런스가 흔들리지 않는다.
 *
 * 배치·간격·포맷 계산은 `utils/idleBattleLayout.js`(Phaser 비의존)에 있다.
 *
 * 성능 규약: 동시 트윈 6개 이하(`MAX_CONCURRENT_TWEENS`). 넘으면 새 연출을 건너뛴다.
 *
 * 주의: designSystem·gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */

import Phaser from 'phaser';
import { COLORS, MOOD_COLORS, s } from '../config/gameConfig.js';
import { SCALE_FACTOR } from '../config/scaleConfig.js';
import { DESIGN, getCultColor } from '../config/designSystem.js';
import { Z_INDEX } from '../config/layoutConfig.js';
import { ts } from '../utils/textStyles.ts';
import { IconFactory } from '../utils/IconFactory.js';
import PORTRAIT_MAP from '../data/portrait-mapping.json';
import ASSET_MANIFEST from '../../tools/art/asset-manifest.json';
import {
  STAGE,
  ATTACK,
  MAX_CONCURRENT_TWEENS,
  computePartyStands,
  computeBossStand,
  computeBossHpBar,
  computeStageLabels,
  computeFloorBand,
  computeSpriteFit,
  attackDelay,
  attackerIndex,
  isRoundEnd,
  splitDamage,
  hpRatio,
  estimateEtaSeconds,
  formatEta,
  formatHpLabel,
  heroSpriteKey,
  heroSpritePath,
  resolveEnemyArt,
  chapterBgKey
} from '../utils/idleBattleLayout.js';

/** 스프라이트가 아직 없을 때 쓰는 실루엣 색 (교단/분위기 색이 없을 때) */
const NEUTRAL_SILHOUETTE = 0x475569;

export class IdleBattleView extends Phaser.GameObjects.Container {
  /** 지연 로드 임시 키를 유일하게 만드는 시퀀스 (static 즉시 평가 금지 규칙과 무관한 단순 정수) */
  static _loadSeq = 0;

  /**
   * @param {Phaser.Scene} scene
   * @param {number} x - 중심 x (렌더 px)
   * @param {number} y - 중심 y (렌더 px)
   * @param {number} width - 뷰 너비 (렌더 px)
   * @param {number} height - 뷰 높이 (렌더 px)
   * @param {object} [options]
   * @param {boolean} [options.chrome=true] - 자체 배경 패널을 그릴지.
   *        false 면 호출부(MainMenuScene)가 글래스 관측창을 대신 그린다.
   */
  constructor(scene, x, y, width, height, options = {}) {
    super(scene, x, y);

    this.viewWidth = width;
    this.viewHeight = height;
    // 레이아웃 모듈은 base 720 좌표계로 계산한다. 뷰 크기를 base 로 되돌려 넘긴다.
    this.baseW = width / SCALE_FACTOR;
    this.baseH = height / SCALE_FACTOR;
    this.options = { chrome: true, ...options };

    this.currentBoss = null;       // 현재 보스 데이터
    this.bossMaxHp = 0;            // 격파에 필요한 누적 피해
    this.bossCurrentHp = 0;        // 지금까지 쌓인 누적 피해
    this.hasParty = false;
    this.isDefeating = false;      // 처치 연출 중 플래그
    this.battleCycleTimer = null;
    this.attackInterval = null;    // 다음 공격 예약 (MainMenuScene 이 살아 있는지 확인한다)
    this.pendingDelays = [];
    this.partyMembers = [];        // 편성된 영웅 데이터
    this.chapter = 1;
    this.stage = 1;

    this._turn = 0;                // 누적 공격 횟수
    this._pendingDamage = 0;       // 시뮬레이션이 넘긴, 아직 화면에 안 띄운 피해
    this._activeTweens = 0;        // 동시 트윈 수 (성능 상한)
    this._dpsSample = null;        // { damage, at } — 예상 시간 추정용
    this._dps = 0;
    this._pendingLoads = [];       // 이 뷰가 예약한 지연 로드 콜백 (정리용)

    this.createStage();
    this.createPartyStands();
    this.createBossStand();
    this.createHud();

    scene.add.existing(this);
  }

  // ==================================================================
  // 지연 로드
  // ==================================================================

  /**
   * 텍스처를 지연 로드하고 준비되면 콜백한다.
   *
   * **임시 키로 받아 승격한다.** `scene.restart()` 가 로드 도중 들어오면 Phaser 가
   * 로더를 리셋하는데, 다음 뷰가 같은 최종 키로 다시 요청하면 두 로드가 겹쳐
   * "Texture key already in use" 콘솔 에러가 난다(부팅 스모크가 이걸 잡는다).
   * 요청마다 유일한 임시 키를 쓰면 충돌 자체가 생기지 않는다.
   * PreloadScene.loadPhase0_Assets() 와 같은 방식이다.
   *
   * @param {string} finalKey 씬 코드가 참조할 텍스처 키
   * @param {string} path public 기준 경로
   * @param {(key:string) => void} onReady 준비 완료 콜백
   */
  loadTexture(finalKey, path, onReady) {
    if (!finalKey || !path || !this.scene) return;

    if (this.scene.textures.exists(finalKey)) {
      onReady(finalKey);
      return;
    }

    IdleBattleView._loadSeq += 1;
    const tempKey = `__idle__${finalKey}__${IdleBattleView._loadSeq}`;

    const handler = () => {
      if (!this.scene || !this.scene.sys.isActive()) return;
      const textures = this.scene.textures;
      if (!textures.exists(finalKey) && textures.exists(tempKey)) {
        textures.renameTexture(tempKey, finalKey);
      } else if (textures.exists(tempKey)) {
        textures.remove(tempKey);
      }
      if (this.active && textures.exists(finalKey)) onReady(finalKey);
    };

    this.scene.load.once(`filecomplete-image-${tempKey}`, handler);
    this._pendingLoads.push(tempKey);

    this.scene.load.image(tempKey, path);
    if (!this.scene.load.isLoading()) this.scene.load.start();
  }

  // ==================================================================
  // 무대
  // ==================================================================

  /**
   * 무대 = (선택적 패널) + 챕터 배경 + 바닥 띠.
   * 배경은 지연 로드다. 없으면 그라디언트 바닥만 남고 화면은 그대로 성립한다.
   */
  createStage() {
    if (this.options.chrome !== false) this.createBackground();

    // 챕터 배경 자리. 로드되면 여기에 이미지를 넣는다
    this.stageBgImage = null;
    this.queueChapterBackdrop(this.chapter);

    // 배경 위 딤 — 유닛과 텍스트 대비 확보
    this.stageDim = this.scene.add.graphics();
    this.stageDim.fillStyle(DESIGN.colors.bg.primary, 0.52);
    this.stageDim.fillRect(-this.viewWidth / 2, -this.viewHeight / 2, this.viewWidth, this.viewHeight);
    this.add(this.stageDim);

    this.createFloor();
  }

  /**
   * 배경 패널 (chrome=true 일 때만). 기존 호출부 호환용이다.
   */
  createBackground() {
    const bg = this.scene.add.graphics();
    bg.fillStyle(COLORS.bgDark, 0.6);
    bg.fillRoundedRect(-this.viewWidth / 2, -this.viewHeight / 2, this.viewWidth, this.viewHeight, s(16));
    bg.lineStyle(s(2), COLORS.primary, 0.4);
    bg.strokeRoundedRect(-this.viewWidth / 2, -this.viewHeight / 2, this.viewWidth, this.viewHeight, s(16));
    this.add(bg);
  }

  /**
   * 바닥 띠 — 유닛의 발을 같은 평면에 놓는다. 이것만으로 나열이 무대가 된다.
   */
  createFloor() {
    const band = computeFloorBand(this.baseW, this.baseH);
    const y = s(band.y);
    const h = s(band.h);

    const floor = this.scene.add.graphics();
    floor.fillStyle(DESIGN.colors.bg.primary, 0.55);
    floor.fillEllipse(0, y + h * 0.35, this.viewWidth * 1.05, h * 2.2);
    floor.lineStyle(s(1), DESIGN.colors.brand.primary, 0.22);
    floor.beginPath();
    floor.moveTo(-this.viewWidth / 2, y);
    floor.lineTo(this.viewWidth / 2, y);
    floor.strokePath();
    this.add(floor);
    this.floorGfx = floor;
  }

  /**
   * 챕터 배경을 지연 로드해 무대 뒤에 깐다.
   * 매니페스트에 등록된 키만 요청한다(없는 경로는 dev 404 가드가 콘솔 에러를 남긴다).
   * @param {number} chapter
   */
  queueChapterBackdrop(chapter) {
    const key = chapterBgKey(chapter);
    if (this._stageBgKey === key) return;
    this._stageBgKey = key;

    if (this.scene.textures.exists(key)) {
      this.placeChapterBackdrop(key);
      return;
    }

    const meta = ASSET_MANIFEST.lazyTextures?.[key] || ASSET_MANIFEST.textures?.[key];
    if (!meta || !meta.path) return;
    this.loadTexture(key, meta.path, (ready) => this.placeChapterBackdrop(ready));
  }

  /**
   * 챕터 배경을 무대 맨 뒤에 cover-fit 으로 놓는다. 넘치는 부분은 관측창 마스크가 자른다.
   * @param {string} key
   */
  placeChapterBackdrop(key) {
    const source = this.scene.textures.get(key).getSourceImage();
    if (!source || !source.width) return;

    if (this.stageBgImage) this.stageBgImage.destroy();

    const scale = Math.max(this.viewWidth / source.width, this.viewHeight / source.height);
    const image = this.scene.add.image(0, 0, key)
      .setDisplaySize(source.width * scale, source.height * scale)
      .setAlpha(0);
    this.add(image);
    // 딤·바닥·유닛보다 뒤로
    this.sendToBack(image);
    if (this.options.chrome !== false) this.moveUp(image);

    this.scene.tweens.add({ targets: image, alpha: 0.6, duration: 420, ease: 'Sine.easeOut' });
    this.stageBgImage = image;
  }

  // ==================================================================
  // 파티 스탠딩
  // ==================================================================

  /**
   * 파티 4자리를 만든다. 처음에는 전부 실루엣이고 `updateParty()` 가 채운다.
   */
  createPartyStands() {
    const stands = computePartyStands(this.baseW, this.baseH);
    this.partyStands = stands.map((stand) => {
      const x = s(stand.x);
      const y = s(stand.y);
      const height = s(stand.height);

      const shadow = this.scene.add.ellipse(x, y, height * 0.52, height * 0.14, 0x000000, 0.35);
      this.add(shadow);

      const root = this.scene.add.container(x, y);
      this.add(root);

      const slot = {
        ...stand,
        renderX: x,
        renderY: y,
        renderH: height,
        root,
        shadow,
        sprite: null,
        silhouette: null,
        levelText: null,
        hero: null
      };
      this.drawSilhouette(slot, NEUTRAL_SILHOUETTE, 'warrior');
      return slot;
    });
  }

  /**
   * 스탠딩 실루엣 — 전신 시트가 없거나 아직 로드 전일 때의 대역.
   * 이모지를 쓰지 않는다(REDESIGN_PLAN §2-2). 캡슐 몸체 + 클래스 벡터 아이콘이다.
   *
   * @param {object} slot 파티 자리
   * @param {number} color 실루엣 색 (교단/분위기)
   * @param {string} classKey 클래스 아이콘 키
   */
  drawSilhouette(slot, color, classKey) {
    if (slot.silhouette) {
      slot.silhouette.destroy();
      slot.silhouette = null;
    }
    if (slot.classIcon) {
      slot.classIcon.destroy();
      slot.classIcon = null;
    }

    const h = slot.renderH;
    const w = h * 0.42;
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(color, 0.55);
    // 몸통 캡슐 + 머리
    gfx.fillRoundedRect(-w / 2, -h * 0.72, w, h * 0.72, w * 0.34);
    gfx.fillCircle(0, -h * 0.80, w * 0.28);
    gfx.lineStyle(s(2), color, 0.9);
    gfx.strokeRoundedRect(-w / 2, -h * 0.72, w, h * 0.72, w * 0.34);
    slot.root.add(gfx);
    slot.silhouette = gfx;

    const iconKey = IconFactory.create(this.scene, classKey || 'warrior', Math.round(w * 0.62), {
      tint: 0xFFFFFF
    });
    if (iconKey) {
      const icon = this.scene.add.image(0, -h * 0.38, iconKey).setOrigin(0.5).setAlpha(0.85);
      slot.root.add(icon);
      slot.classIcon = icon;
    }
  }

  /**
   * 전신 시트를 자리에 세운다. 실루엣은 지운다.
   * @param {object} slot
   * @param {string} key 텍스처 키
   */
  placeHeroSprite(slot, key) {
    const source = this.scene.textures.get(key).getSourceImage();
    const fit = computeSpriteFit(source?.width, source?.height, slot.renderH);
    if (!fit) return;

    if (slot.sprite) slot.sprite.destroy();
    const sprite = this.scene.add.image(0, 0, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(fit.w, fit.h)
      .setAlpha(0);
    slot.root.add(sprite);
    slot.sprite = sprite;

    if (slot.silhouette) { slot.silhouette.destroy(); slot.silhouette = null; }
    if (slot.classIcon) { slot.classIcon.destroy(); slot.classIcon = null; }

    this.scene.tweens.add({ targets: sprite, alpha: 1, duration: 320, ease: 'Sine.easeOut' });
  }

  /**
   * 영웅의 전신 시트를 지연 로드한다. 매니페스트에 있는 키만 요청한다.
   * @param {object} slot
   * @param {string} heroId
   */
  queueHeroSprite(slot, heroId) {
    const key = heroSpriteKey(heroId, PORTRAIT_MAP);
    if (!key || !ASSET_MANIFEST.fullbody || !ASSET_MANIFEST.fullbody[key]) return;

    const path = heroSpritePath(key);
    if (!path) return;

    this.loadTexture(key, path, (ready) => {
      // 로드가 끝나기 전에 편성이 바뀌었으면 그 자리에 다른 영웅을 그리지 않는다
      if (slot.hero && slot.hero.id === heroId) this.placeHeroSprite(slot, ready);
    });
  }

  /**
   * 파티 갱신. 빈 자리는 실루엣으로 남는다(미편성과 미획득을 구분하지 않는다).
   * @param {Array<object>} party 보강된 영웅 배열 (id/class/cult/mood/level)
   */
  updateParty(party) {
    const members = (party || []).filter(Boolean).slice(0, 4);
    this.partyMembers = members;
    this.hasParty = members.length > 0;

    if (this.emptyMessage && this.hasParty) {
      this.emptyMessage.destroy();
      this.emptyMessage = null;
    }

    (this.partyStands || []).forEach((slot, index) => {
      const hero = members[index] || null;
      slot.hero = hero;

      if (!hero) {
        slot.root.setAlpha(0.2);
        slot.shadow.setAlpha(0.08);
        if (slot.levelText) { slot.levelText.setVisible(false); }
        return;
      }

      slot.root.setAlpha(1);
      slot.shadow.setAlpha(0.35);

      const color = this.resolveUnitColor(hero);
      if (!slot.sprite) this.drawSilhouette(slot, color, hero.class || hero.baseClass || 'warrior');
      this.queueHeroSprite(slot, hero.id);

      const label = `Lv.${hero.level || 1}`;
      if (!slot.levelText) {
        slot.levelText = this.scene.add.text(slot.renderX, slot.renderY + s(8), label,
          ts('num.sm', { color: DESIGN.colors.text.secondary })).setOrigin(0.5, 0);
        this.add(slot.levelText);
      }
      slot.levelText.setText(label).setVisible(true);
    });
  }

  /**
   * 유닛 실루엣 색 — 교단색이 있으면 그것을, 없으면 분위기색, 둘 다 없으면 중립.
   * @param {object} hero
   * @returns {number}
   */
  resolveUnitColor(hero) {
    if (hero?.cult) return getCultColor(hero.cult);
    const mood = hero?.mood && MOOD_COLORS[String(hero.mood).toUpperCase()];
    if (mood) return Phaser.Display.Color.HexStringToColor(mood).color;
    return NEUTRAL_SILHOUETTE;
  }

  // ==================================================================
  // 보스
  // ==================================================================

  /**
   * 보스 자리를 만든다. 아트가 아직 없으므로 실루엣으로 시작하고,
   * `enemies/<id>.webp` 가 매니페스트에 들어오면 자동으로 교체된다.
   */
  createBossStand() {
    const stand = computeBossStand(this.baseW, this.baseH);
    const x = s(stand.x);
    const y = s(stand.y);
    const h = s(stand.height);

    this.bossSlot = { ...stand, renderX: x, renderY: y, renderH: h };

    this.bossShadow = this.scene.add.ellipse(x, y, h * 0.55, h * 0.15, 0x000000, 0.4).setVisible(false);
    this.add(this.bossShadow);

    this.bossRoot = this.scene.add.container(x, y);
    this.bossRoot.setVisible(false);
    this.add(this.bossRoot);

    this.bossSprite = null;
    this.bossSilhouette = null;

    this.bossNameText = this.scene.add.text(x, y + s(10), '',
      ts('label', { color: DESIGN.colors.text.primary })).setOrigin(0.5, 0).setVisible(false);
    this.add(this.bossNameText);
  }

  /**
   * 보스 실루엣 — 아트 부재 시의 대역. 이모지를 쓰지 않는다.
   * @param {number} color
   */
  drawBossSilhouette(color) {
    if (this.bossSilhouette) { this.bossSilhouette.destroy(); this.bossSilhouette = null; }
    if (this.bossIcon) { this.bossIcon.destroy(); this.bossIcon = null; }

    const h = this.bossSlot.renderH;
    const w = h * 0.62;
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(color, 0.6);
    gfx.fillRoundedRect(-w / 2, -h * 0.78, w, h * 0.78, w * 0.28);
    gfx.fillCircle(0, -h * 0.86, w * 0.26);
    gfx.lineStyle(s(2), color, 0.95);
    gfx.strokeRoundedRect(-w / 2, -h * 0.78, w, h * 0.78, w * 0.28);
    this.bossRoot.add(gfx);
    this.bossSilhouette = gfx;

    const iconKey = IconFactory.create(this.scene, 'raid', Math.round(w * 0.58), { tint: 0xFFFFFF });
    if (iconKey) {
      const icon = this.scene.add.image(0, -h * 0.44, iconKey).setOrigin(0.5).setAlpha(0.9);
      this.bossRoot.add(icon);
      this.bossIcon = icon;
    }
  }

  /**
   * 적 아트가 매니페스트에 있으면 지연 로드해 실루엣을 교체한다.
   * @param {string} bossId
   */
  queueBossArt(bossId) {
    const art = resolveEnemyArt(bossId, ASSET_MANIFEST);
    if (!art) return;

    this.loadTexture(art.key, art.path, (ready) => {
      if (this.currentBoss && this.currentBoss.id === bossId) this.placeBossSprite(ready);
    });
  }

  /**
   * 보스 스프라이트를 세운다.
   * @param {string} key
   */
  placeBossSprite(key) {
    const source = this.scene.textures.get(key).getSourceImage();
    const fit = computeSpriteFit(source?.width, source?.height, this.bossSlot.renderH);
    if (!fit) return;

    if (this.bossSprite) this.bossSprite.destroy();
    const sprite = this.scene.add.image(0, 0, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(fit.w, fit.h)
      .setAlpha(0);
    this.bossRoot.add(sprite);
    this.bossSprite = sprite;

    if (this.bossSilhouette) { this.bossSilhouette.destroy(); this.bossSilhouette = null; }
    if (this.bossIcon) { this.bossIcon.destroy(); this.bossIcon = null; }

    this.scene.tweens.add({ targets: sprite, alpha: 1, duration: 320 });
  }

  /**
   * 보스 등장.
   *
   * @param {object} bossData IdleProgressSystem.currentBossData
   * @param {object} [options]
   * @param {number} [options.accumulatedDamage] 이미 쌓인 누적 피해.
   *        오프라인 복귀 시 0 에서 채우는 연출을 건너뛰고 마지막 상태로 즉시 스냅한다.
   * @param {boolean} [options.slideIn] 우측에서 슬라이드 인 (기본 true)
   */
  showBoss(bossData, options = {}) {
    if (!bossData) return;

    this.currentBoss = bossData;
    this.bossMaxHp = bossData.hp || 1000;
    this.isDefeating = false;

    const color = DESIGN.colors.status.error;
    if (!this.bossSprite) this.drawBossSilhouette(color);
    this.queueBossArt(bossData.id);

    this.bossRoot.setVisible(true).setAlpha(1);
    this.bossShadow.setVisible(true);
    this.bossNameText.setText(bossData.name || '보스').setVisible(true);

    if (options.slideIn !== false) {
      this.bossRoot.x = this.bossSlot.renderX + s(120);
      this.scene.tweens.add({
        targets: this.bossRoot,
        x: this.bossSlot.renderX,
        duration: 520,
        ease: 'Back.easeOut'
      });
    } else {
      this.bossRoot.x = this.bossSlot.renderX;
    }

    // 오프라인 복귀 스냅 — 누적 연출 없이 마지막 상태로
    const accumulated = Number.isFinite(options.accumulatedDamage) ? options.accumulatedDamage : 0;
    this.bossCurrentHp = accumulated;
    this.renderHp(accumulated, this.bossMaxHp, { immediate: true });
    this.updateStageTitle();
  }

  /**
   * 다음 보스로 교체. 이전 보스는 폭발하며 사라진다.
   * @param {object} bossData
   */
  showNextBoss(bossData) {
    if (!bossData) return;
    this.playDefeatBurst();
    const delay = this.scene.time.delayedCall(420, () => {
      this._dpsSample = null;
      this.showBoss(bossData, { accumulatedDamage: 0 });
    });
    this.pendingDelays.push(delay);
  }

  /**
   * 보스 격파 연출 — 섬광 + 확산 링. 파티클 시스템을 쓰지 않아 가볍다.
   */
  playDefeatBurst() {
    if (!this.bossRoot) return;
    this.isDefeating = true;

    const x = this.bossSlot.renderX;
    const y = this.bossSlot.renderY - this.bossSlot.renderH * 0.5;

    const ring = this.scene.add.circle(x, y, s(10), DESIGN.colors.brand.accent, 0.75);
    this.add(ring);
    this.trackTween({
      targets: ring,
      radius: s(90),
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    this.trackTween({
      targets: [this.bossRoot, this.bossShadow, this.bossNameText],
      alpha: 0,
      duration: 300,
      onComplete: () => {
        this.bossRoot.setVisible(false);
        this.bossShadow.setVisible(false);
        this.bossNameText.setVisible(false);
      }
    });
  }

  // ==================================================================
  // HUD
  // ==================================================================

  /**
   * 상단 라벨 · 보스 HP 바. 수치를 항상 병기한다(색상 단독 전달 금지).
   */
  createHud() {
    const labels = computeStageLabels(this.baseW, this.baseH);
    const bar = computeBossHpBar(this.baseW, this.baseH);

    this.titleText = this.scene.add.text(s(labels.title.x), s(labels.title.y), '',
      ts('label', { color: DESIGN.colors.text.primary })).setOrigin(labels.title.originX, labels.title.originY);
    this.add(this.titleText);

    this.progressText = this.scene.add.text(s(labels.progress.x), s(labels.progress.y), '0%',
      ts('num.md', { color: DESIGN.colors.text.primary })).setOrigin(labels.progress.originX, labels.progress.originY);
    this.add(this.progressText);

    this.etaText = this.scene.add.text(s(labels.eta.x), s(labels.eta.y), '—',
      ts('caption', { color: DESIGN.colors.text.secondary })).setOrigin(labels.eta.originX, labels.eta.originY);
    this.add(this.etaText);

    this.hpBarSlot = {
      x: s(bar.x), y: s(bar.y), w: s(bar.w), h: s(bar.h), textY: s(bar.textY)
    };

    const track = this.scene.add.graphics();
    track.fillStyle(DESIGN.colors.bg.primary, 0.8);
    track.fillRoundedRect(this.hpBarSlot.x - this.hpBarSlot.w / 2, this.hpBarSlot.y,
      this.hpBarSlot.w, this.hpBarSlot.h, this.hpBarSlot.h / 2);
    track.lineStyle(s(1), 0xFFFFFF, 0.18);
    track.strokeRoundedRect(this.hpBarSlot.x - this.hpBarSlot.w / 2, this.hpBarSlot.y,
      this.hpBarSlot.w, this.hpBarSlot.h, this.hpBarSlot.h / 2);
    this.add(track);
    this.hpTrack = track;

    this.hpFill = this.scene.add.graphics();
    this.add(this.hpFill);

    this.hpLabel = this.scene.add.text(this.hpBarSlot.x, this.hpBarSlot.textY, '',
      ts('num.sm', { color: DESIGN.colors.text.primary })).setOrigin(0.5);
    this.add(this.hpLabel);

    // 진행 100% 배너 (기본 숨김)
    // 파티 머리 위, 타이틀 줄 아래. 유닛을 가리지 않는 자리다
    this.bossReadyText = this.scene.add.text(0, s(-this.baseH * 0.32), 'BOSS READY',
      ts('display.lg', { color: `#${DESIGN.colors.status.error.toString(16).padStart(6, '0')}` }))
      .setOrigin(0.5).setVisible(false);
    // 컨테이너 안이라 실제 렌더 순서는 컨테이너 depth(IDLE_BATTLE)를 따르지만,
    // 이 배너가 "씬 연출이지 팝업이 아니다"라는 것을 토큰으로 명시해 둔다.
    this.bossReadyText.setDepth(Z_INDEX.IDLE_FX);
    this.add(this.bossReadyText);
  }

  /**
   * HP 바를 비율로 그린다.
   * @param {number} accumulated
   * @param {number} maxHp
   * @param {object} [options]
   * @param {boolean} [options.immediate] 트윈 없이 즉시 (오프라인 복귀 스냅)
   */
  renderHp(accumulated, maxHp, options = {}) {
    if (!this.hpFill || !this.hpBarSlot) return;
    const ratio = hpRatio(accumulated, maxHp);
    const slot = this.hpBarSlot;

    const draw = (r) => {
      this.hpFill.clear();
      const w = slot.w * r;
      if (w <= 0) return;
      const color = r >= 0.9
        ? DESIGN.colors.status.error
        : (r >= 0.6 ? DESIGN.colors.brand.accent : DESIGN.colors.brand.primary);
      this.hpFill.fillStyle(color, 0.95);
      this.hpFill.fillRoundedRect(slot.x - slot.w / 2, slot.y, Math.max(slot.h, w), slot.h, slot.h / 2);
    };

    if (options.immediate || !this._hpRatio) {
      this._hpRatio = ratio;
      draw(ratio);
    } else {
      const from = { r: this._hpRatio };
      this.trackTween({
        targets: from,
        r: ratio,
        duration: 220,
        onUpdate: () => draw(from.r),
        onComplete: () => { this._hpRatio = ratio; }
      });
      this._hpRatio = ratio;
    }

    this.hpLabel?.setText(formatHpLabel(accumulated, maxHp));
    this.progressText?.setText(`${Math.floor(ratio * 100)}%`);
  }

  /**
   * 상단 좌측 라벨 — "챕터 N-M · 보스명".
   */
  updateStageTitle() {
    const name = this.currentBoss?.name || '';
    const label = name
      ? `챕터 ${this.chapter}-${this.stage} · ${name}`
      : `챕터 ${this.chapter}-${this.stage}`;
    this.titleText?.setText(label);
  }

  /**
   * 예상 격파 시간을 갱신한다. DPS 는 실제 누적 피해의 증가분에서 관측한다
   * (IdleProgressSystem 을 직접 참조하지 않기 위해서다).
   * @param {number} accumulated
   */
  updateEta(accumulated) {
    const now = Date.now();
    if (this._dpsSample) {
      const dt = (now - this._dpsSample.at) / 1000;
      const dd = accumulated - this._dpsSample.damage;
      if (dt > 0.25 && dd > 0) {
        const sample = dd / dt;
        // 지수 평활 — 틱마다 값이 튀지 않게
        this._dps = this._dps > 0 ? this._dps * 0.7 + sample * 0.3 : sample;
      }
    }
    this._dpsSample = { damage: accumulated, at: now };

    const remaining = Math.max(0, this.bossMaxHp - accumulated);
    this.etaText?.setText(formatEta(estimateEtaSeconds(remaining, this._dps)));
  }

  // ==================================================================
  // 전투 루프
  // ==================================================================

  /**
   * 공격 사이클 시작. 파티가 없으면 아무 것도 하지 않는다.
   */
  startBattleCycle() {
    if (!this.hasParty) return;
    this.stopBattleCycle();
    this.scheduleNextAttack(0);
  }

  /**
   * 예약된 공격을 모두 취소한다.
   */
  stopBattleCycle() {
    if (this.attackInterval) {
      this.attackInterval.remove();
      this.attackInterval = null;
    }
    if (this.battleCycleTimer) {
      this.battleCycleTimer.remove();
      this.battleCycleTimer = null;
    }
  }

  /**
   * 다음 공격을 예약한다.
   * @param {number} delay ms. 0 이면 순번에 맞는 간격을 쓴다
   */
  scheduleNextAttack(delay) {
    if (!this.scene || !this.scene.time) return;
    const wait = delay > 0 ? delay : attackDelay(this._turn);
    this.attackInterval = this.scene.time.delayedCall(wait, () => {
      this.attackInterval = null;
      this.performAttack();
      this.scheduleNextAttack(0);
    });
  }

  /**
   * 한 순번의 공격 연출. 전진 → 히트 플래시 → 데미지 숫자 → 보스 흔들림.
   * 로직은 없다. 숫자는 시뮬레이션이 넘긴 실제 피해에서 나온다.
   */
  performAttack() {
    if (!this.hasParty || this.isDefeating || !this.currentBoss) return;
    if (!this.scene || !this.scene.sys.isActive()) return;

    const index = attackerIndex(this._turn, this.partyMembers.length);
    const slot = (this.partyStands || [])[index];
    const roundEnd = isRoundEnd(this._turn, this.partyMembers.length);
    this._turn += 1;

    if (!slot || !slot.hero) return;
    if (this._activeTweens >= MAX_CONCURRENT_TWEENS) return;

    // 전진 → 복귀
    this.trackTween({
      targets: slot.root,
      x: slot.renderX + s(ATTACK.lungeDx),
      duration: ATTACK.lungeIn,
      ease: 'Cubic.easeOut',
      yoyo: true,
      hold: 40,
      onYoyo: () => this.onHit(),
      onComplete: () => { slot.root.x = slot.renderX; }
    });

    if (roundEnd) {
      const delay = this.scene.time.delayedCall(ATTACK.lungeIn + ATTACK.lungeOut + 120, () => this.bossCounter());
      this.pendingDelays.push(delay);
    }
  }

  /**
   * 타격 순간 — 보스 플래시 + 흔들림 + 데미지 숫자.
   */
  onHit() {
    const target = this.bossSprite || this.bossSilhouette;
    if (target && this._activeTweens < MAX_CONCURRENT_TWEENS) {
      if (this.bossSprite) {
        this.bossSprite.setTintFill(0xFFFFFF);
        const delay = this.scene.time.delayedCall(ATTACK.flashMs, () => this.bossSprite?.clearTint());
        this.pendingDelays.push(delay);
      }
      this.trackTween({
        targets: this.bossRoot,
        x: this.bossSlot.renderX + s(ATTACK.shakePx),
        duration: 70,
        yoyo: true,
        repeat: 1,
        onComplete: () => { this.bossRoot.x = this.bossSlot.renderX; }
      });
    }
    this.popDamageNumber();
  }

  /**
   * 보스 반격 — 한 바퀴에 한 번. 앞줄이 밀린다.
   */
  bossCounter() {
    if (this.isDefeating || !this.currentBoss || !this.bossRoot) return;
    if (this._activeTweens >= MAX_CONCURRENT_TWEENS) return;

    this.trackTween({
      targets: this.bossRoot,
      x: this.bossSlot.renderX + s(ATTACK.bossLungeDx),
      duration: ATTACK.bossLungeIn,
      ease: 'Cubic.easeOut',
      yoyo: true,
      hold: 60,
      onYoyo: () => {
        (this.partyStands || []).forEach((slot) => {
          if (slot.row !== 'front' || !slot.hero) return;
          slot.root.setAlpha(0.55);
          const delay = this.scene.time.delayedCall(ATTACK.flashMs, () => slot.root.setAlpha(1));
          this.pendingDelays.push(delay);
        });
      },
      onComplete: () => { this.bossRoot.x = this.bossSlot.renderX; }
    });
  }

  /**
   * 데미지 숫자 팝업. 시뮬레이션이 넘긴 실제 값만 띄운다.
   */
  popDamageNumber() {
    if (this._pendingDamage <= 0) return;
    if (this._activeTweens >= MAX_CONCURRENT_TWEENS) return;

    const value = splitDamage(this._pendingDamage, 1);
    this._pendingDamage = 0;

    const x = this.bossSlot.renderX + Phaser.Math.Between(s(-16), s(16));
    const y = this.bossSlot.renderY - this.bossSlot.renderH * 0.62;

    const text = this.scene.add.text(x, y, `-${value.toLocaleString()}`,
      ts('num.md', { color: `#${DESIGN.colors.status.error.toString(16).padStart(6, '0')}` }))
      .setOrigin(0.5);
    this.add(text);

    this.trackTween({
      targets: text,
      y: y + s(ATTACK.damageRiseY),
      alpha: 0,
      duration: ATTACK.damageMs,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy()
    });
  }

  /**
   * 동시 트윈 수를 세면서 트윈을 만든다. 상한을 지키기 위한 최소 장치다.
   * @param {object} config Phaser 트윈 설정
   * @returns {Phaser.Tweens.Tween|null}
   */
  trackTween(config) {
    if (!this.scene || !this.scene.tweens) return null;
    this._activeTweens += 1;
    const userComplete = config.onComplete;
    const tween = this.scene.tweens.add({
      ...config,
      onComplete: (...args) => {
        this._activeTweens = Math.max(0, this._activeTweens - 1);
        if (typeof userComplete === 'function') userComplete(...args);
      },
      onStop: () => { this._activeTweens = Math.max(0, this._activeTweens - 1); }
    });
    return tween;
  }

  // ==================================================================
  // MainMenuScene 이 호출하는 갱신 API
  // ==================================================================

  /**
   * 시뮬레이션 한 틱의 실제 피해. 다음 타격 순간에 숫자로 뜬다.
   * @param {number} damage
   */
  showDamageText(damage) {
    if (!Number.isFinite(damage) || damage <= 0) return;
    this._pendingDamage += damage;
  }

  /**
   * 누적 피해 반영 — HP 바 · 진행률 · 예상 시간.
   * @param {number} accumulatedDamage
   * @param {number} bossMaxHp
   */
  updateBossHp(accumulatedDamage, bossMaxHp) {
    if (!this.currentBoss) return;
    if (Number.isFinite(bossMaxHp) && bossMaxHp > 0) this.bossMaxHp = bossMaxHp;
    this.bossCurrentHp = accumulatedDamage;
    this.renderHp(accumulatedDamage, this.bossMaxHp);
    this.updateEta(accumulatedDamage);
  }

  /**
   * 진행률 직접 갱신 (0~1). updateBossHp 와 같은 값을 받지만 호출부 계약을 유지한다.
   * @param {number} progress
   */
  updateProgress(progress) {
    if (!Number.isFinite(progress)) return;
    this.progressText?.setText(`${Math.floor(Math.max(0, Math.min(1, progress)) * 100)}%`);
  }

  /**
   * 진행 100% — 보스전 도전 가능. 배너를 띄우고 보스를 들썩이게 한다.
   */
  showBossReady() {
    if (this._bossReadyShown || !this.bossReadyText) return;
    this._bossReadyShown = true;

    this.bossReadyText.setVisible(true).setAlpha(0).setScale(0.8);
    this.scene.tweens.add({
      targets: this.bossReadyText,
      alpha: 1,
      scale: 1,
      duration: 260,
      ease: 'Back.easeOut'
    });
    this._bossReadyPulse = this.scene.tweens.add({
      targets: this.bossReadyText,
      alpha: { from: 1, to: 0.45 },
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * BOSS READY 연출 해제.
   */
  clearBossReady() {
    this._bossReadyShown = false;
    if (this._bossReadyPulse) {
      this._bossReadyPulse.stop();
      this._bossReadyPulse = null;
    }
    this.bossReadyText?.setVisible(false);
  }

  /**
   * 스테이지 클리어 연출.
   */
  showStageClear() {
    this.clearBossReady();
    const text = this.scene.add.text(0, s(-this.baseH * 0.06), 'STAGE CLEAR',
      ts('display.lg', { color: `#${DESIGN.colors.brand.accent.toString(16).padStart(6, '0')}` }))
      .setOrigin(0.5).setScale(0.7);
    this.add(text);

    this.trackTween({
      targets: text,
      scale: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        const delay = this.scene.time.delayedCall(900, () => {
          this.trackTween({
            targets: text,
            alpha: 0,
            duration: 300,
            onComplete: () => text.destroy()
          });
        });
        this.pendingDelays.push(delay);
      }
    });
  }

  /**
   * 스테이지 정보 갱신. 챕터가 바뀌면 배경도 바뀐다.
   * @param {number} chapter
   * @param {number} stage
   * @param {string} name 스테이지 이름 (라벨에는 보스명을 쓴다)
   */
  updateStageInfo(chapter, stage, name) {
    this.chapter = chapter || 1;
    this.stage = stage || 1;
    this.stageName = name || '';
    this.queueChapterBackdrop(this.chapter);
    this.updateStageTitle();
  }

  /**
   * 파티 미편성 안내.
   */
  showEmptyPartyMessage() {
    this.hasParty = false;
    if (this.emptyMessage) return;

    const text = this.scene.add.text(0, 0, '파티를 편성하면 자동으로 싸웁니다',
      ts('subtitle', { color: DESIGN.colors.text.secondary })).setOrigin(0.5);
    this.add(text);
    this.emptyMessage = text;

    this.scene.tweens.add({
      targets: text,
      alpha: { from: 1, to: 0.45 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * 보상 플로팅 텍스트 (호출부 호환 유지).
   * @param {number} gold
   * @param {number} exp
   */
  showRewardFloat(gold, exp) {
    const y = s(-this.baseH * 0.12);
    const goldText = this.scene.add.text(s(-40), y, `+${gold}`,
      ts('num.md', { color: `#${DESIGN.colors.brand.accent.toString(16).padStart(6, '0')}` })).setOrigin(0.5);
    const expText = this.scene.add.text(s(40), y, `+${exp} EXP`,
      ts('num.sm', { color: `#${DESIGN.colors.status.success.toString(16).padStart(6, '0')}` })).setOrigin(0.5);
    this.add([goldText, expText]);

    this.trackTween({
      targets: [goldText, expText],
      y: y - s(40),
      alpha: 0,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => { goldText.destroy(); expText.destroy(); }
    });
  }

  /**
   * 정리 — 타이머·트윈·지연 호출을 전부 회수한다.
   * @param {boolean} fromScene
   */
  destroy(fromScene) {
    this.stopBattleCycle();
    this.clearBossReady();
    if (this.pendingDelays) {
      this.pendingDelays.forEach((d) => d?.remove?.());
      this.pendingDelays = [];
    }
    this._pendingLoads = [];
    super.destroy(fromScene);
  }
}

export default IdleBattleView;
export { STAGE as IDLE_STAGE };
