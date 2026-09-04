/**
 * MeditationView — 메인 화면 명상 성소 (구 IdleBattleView)
 *
 * 관측창 안에서 파티 4인이 **제단을 둘러싸고 명상하며 마력을 쌓는다**. 방치형의
 * "내가 안 봐도 애들이 뭔가 하고 있다"는 감각은 그대로 두고, 그 "뭔가"를 두들기기에서
 * 쌓기로 바꿨다. 화면에서 전투 어휘가 사라진다.
 *
 *   성소   챕터 배경(교단색 틴트) + 바닥 룬 원. 룬 원 위에 앞 2 · 뒤 2 로 앉는다.
 *          치비 시트가 있는 영웅은 2.5등신 스프라이트로, 없는 영웅은 기존 폴백
 *          (전신 시트 축소 / 실루엣)으로 같은 자리에 앉는다.
 *   루프   호흡(y ±4px) · 룬 원 회전 · 각자에게서 제단으로 흐르는 교단색 오라 입자.
 *          마력이 찰수록 오라가 잦아지고 meditate <-> channel 교차가 빨라진다.
 *   수확   100% 에서 빛기둥 + 수확 준비 배너 펄스. 수확 순간 전원 awaken 0.6초.
 *
 * **로직은 이 컴포넌트에 없다.** 집중력·축적 마력·수확 임계치·보상·오프라인 누적은
 * 전부 IdleProgressSystem 이 계산하고, 여기는 그 결과를 받아 그리기만 한다. 기존
 * IdleBattleView 와 **받는 값도 호출 순서도 같다** — 바뀐 것은 라벨과 연출뿐이라
 * 밸런스가 흔들릴 여지가 없다.
 *
 *   기존 값                     화면 표현
 *   파티 DPS                 -> 집중력/초
 *   보스 최대 HP             -> 다음 수확까지 필요한 마력
 *   누적 피해                -> 축적 마력
 *   보스 격파                -> 수확
 *   BOSS READY               -> 수확 준비 완료
 *
 * 배치·주기·라벨 계산은 `utils/meditationLayout.js`(Phaser 비의존)에 있다.
 * 에셋 키 조회(전신 시트·챕터 배경)는 기존 `utils/idleBattleLayout.js` 를 그대로 쓴다.
 *
 * 성능 규약
 *   - 일회성 트윈 8개 이하(`MAX_CONCURRENT_TWEENS`). 넘으면 새 연출을 건너뛴다.
 *   - 상시 루프 트윈은 3개 고정(룬 회전 · 호흡 · 구슬 맥박). 생성 시 한 번만 만든다.
 *   - 오라 입자 동시 6개 이하. 씬이 비활성이거나 뷰가 안 보이면 아무 것도 만들지 않는다.
 *   - 텍스처는 **이 뷰가 직접 로드한 치비 시트만** 해제한다. 챕터 배경·전신 시트는
 *     다른 씬과 공유하므로 건드리지 않는다(공용 텍스처 해제는 회귀 이력이 있다).
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
  computeSpriteFit,
  heroSpriteKey,
  heroSpritePath,
  chapterBgKey
} from '../utils/idleBattleLayout.js';
import {
  AURA,
  BREATH,
  CHANNEL,
  HARVEST,
  MAX_CONCURRENT_TWEENS,
  LABELS,
  computeRuneRing,
  computeMeditationSeats,
  computeAltar,
  computeManaGauge,
  computeSanctumLabels,
  computeReadyBanner,
  computeLightPillar,
  computeSeatDisc,
  computeChibiFit,
  auraSpawnDelay,
  channelPulseDelay,
  altarGlowAlpha,
  runeSpinDuration,
  manaRatio,
  formatManaLabel,
  formatFocusRate,
  estimateHarvestSeconds,
  formatHarvestEta,
  formatSanctumTitle,
  frameIndex,
  resolveChibiSheet
} from '../utils/meditationLayout.js';

/** 시트도 포트레이트도 없을 때 쓰는 실루엣 색 */
const NEUTRAL_SILHOUETTE = 0x475569;

export class MeditationView extends Phaser.GameObjects.Container {
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

    this.currentBoss = null;       // 현재 정화 대상 (IdleProgressSystem.currentBossData)
    this.requiredMana = 0;         // 수확에 필요한 마력 (= 보스 최대 HP)
    this.storedMana = 0;           // 축적 마력 (= 누적 피해)
    this.hasParty = false;
    this.isHarvesting = false;     // 수확 연출 중 플래그
    this.pendingDelays = [];
    this.partyMembers = [];
    this.chapter = 1;
    this.stage = 1;

    this._manaRatio = 0;
    this._focus = 0;               // 집중력/초 (= 관측된 DPS)
    this._focusSample = null;      // { mana, at }
    this._activeTweens = 0;        // 일회성 트윈 수 (성능 상한)
    this._ambientTweens = [];      // 상시 루프 3개
    this._auraAlive = 0;
    this._breathPhase = { v: 0 };  // 호흡 트윈이 갱신하는 공유 위상 (슬롯마다 트윈을 만들지 않는다)
    this._pendingLoads = [];       // 이 뷰가 예약한 지연 로드 임시 키
    this._ownedChibiKeys = [];     // 이 뷰가 로드한 치비 텍스처 (파기 시 자기 것만 해제)
    this._accentColor = null;

    this.auraTimer = null;
    this.channelTimer = null;

    this.createSanctum();
    this.createSeats();
    this.createAltar();
    this.createHud();

    scene.add.existing(this);
  }

  // ==================================================================
  // 호출부 호환 별칭
  //
  // MainMenuScene 은 기존 IdleBattleView 의 이름으로 이 뷰를 부른다. 표현만 바꾸는
  // 교체라 호출부를 고치지 않는 것이 정확하다 — 아래가 그 접점이다.
  // ==================================================================

  /** MainMenuScene.refreshAfterPopup() 이 "루프가 멈췄나" 를 이 두 값으로 본다 */
  get battleCycleTimer() { return this.auraTimer; }
  get attackInterval() { return this.channelTimer; }

  /** 정화 대상 등장 (구 showBoss) */
  showBoss(bossData, options = {}) { return this.setHarvestTarget(bossData, options); }
  /** 다음 대상으로 교체 (구 showNextBoss) */
  showNextBoss(bossData) { return this.advanceHarvestTarget(bossData); }
  /** 축적 마력 반영 (구 updateBossHp) */
  updateBossHp(accumulated, required) { return this.updateMana(accumulated, required); }
  /** 수확 준비 완료 (구 showBossReady) */
  showBossReady() { return this.showHarvestReady(); }
  /** 수확 준비 해제 (구 clearBossReady) */
  clearBossReady() { return this.clearHarvestReady(); }
  /** 명상 루프 시작 (구 startBattleCycle) */
  startBattleCycle() { return this.beginMeditation(); }
  /** 명상 루프 정지 (구 stopBattleCycle) */
  stopBattleCycle() { return this.stopMeditation(); }
  /** 스테이지 클리어 = 수확 완료 (구 showStageClear) */
  showStageClear() { return this.showHarvestComplete(); }
  /** 한 틱의 실제 증가분 (구 showDamageText) */
  showDamageText(amount) { return this.addFocusGain(amount); }

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
   *
   * @param {string} finalKey 씬 코드가 참조할 텍스처 키
   * @param {string} path public 기준 경로
   * @param {(key:string) => void} onReady 준비 완료 콜백
   * @param {object} [sheet] 주면 spritesheet 으로 로드한다 { frameWidth, frameHeight }
   */
  loadTexture(finalKey, path, onReady, sheet) {
    if (!finalKey || !path || !this.scene) return;

    if (this.scene.textures.exists(finalKey)) {
      onReady(finalKey);
      return;
    }

    MeditationView._loadSeq += 1;
    const tempKey = `__meditate__${finalKey}__${MeditationView._loadSeq}`;

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

    const eventName = sheet ? `filecomplete-spritesheet-${tempKey}` : `filecomplete-image-${tempKey}`;
    this.scene.load.once(eventName, handler);
    this._pendingLoads.push(tempKey);

    if (sheet) {
      this.scene.load.spritesheet(tempKey, path, sheet);
    } else {
      this.scene.load.image(tempKey, path);
    }
    if (!this.scene.load.isLoading()) this.scene.load.start();
  }

  // ==================================================================
  // 성소 (배경 · 룬 원)
  // ==================================================================

  /**
   * 성소 = (선택적 패널) + 챕터 배경 + 딤 + 바닥 룬 원.
   * 배경은 지연 로드다. 없으면 룬 원만 남고 화면은 그대로 성립한다.
   */
  createSanctum() {
    if (this.options.chrome !== false) this.createBackground();

    this.stageBgImage = null;
    this.queueChapterBackdrop(this.chapter);

    // 배경 위 딤 — 유닛과 텍스트 대비 확보. 전투보다 어둡게 깔아 성소의 정적을 만든다
    this.stageDim = this.scene.add.graphics();
    this.stageDim.fillStyle(DESIGN.colors.bg.primary, 0.58);
    this.stageDim.fillRect(-this.viewWidth / 2, -this.viewHeight / 2, this.viewWidth, this.viewHeight);
    this.add(this.stageDim);

    // 교단색 워시 — 배경 자체에 틴트를 먹이면 배경 디테일이 색으로 뭉개진다.
    // 얇은 색 막을 한 겹 덮어 "성소가 파티의 색을 띤다"만 전한다.
    this.cultWash = this.scene.add.rectangle(0, 0, this.viewWidth, this.viewHeight,
      DESIGN.colors.brand.primary, 0.14);
    this.add(this.cultWash);

    this.createLightPillar();
    this.createRuneCircle();
  }

  /**
   * 100% 에서 제단이 쏘아 올리는 빛기둥. **유닛 뒤**에 서야 기둥이지 판때기가 아니다.
   * 위로 갈수록 사라지는 세로 그라디언트라 창 상단에서 자연스럽게 끊긴다.
   */
  createLightPillar() {
    const pillar = computeLightPillar(this.baseW, this.baseH);
    this.pillarRect = { x: s(pillar.x), y: s(pillar.y), w: s(pillar.w), h: s(pillar.h) };

    const gfx = this.scene.add.graphics();
    gfx.setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setAlpha(0);
    this.add(gfx);
    this.lightPillar = gfx;
    this.drawLightPillar(DESIGN.colors.brand.accent);
  }

  /**
   * 빛기둥을 교단색으로 다시 그린다. 아래(제단)가 밝고 위로 갈수록 투명해진다.
   * @param {number} color
   */
  drawLightPillar(color) {
    const gfx = this.lightPillar;
    const rect = this.pillarRect;
    if (!gfx || !rect) return;
    gfx.clear();
    gfx.fillGradientStyle(color, color, color, color, 0, 0, 0.85, 0.85);
    gfx.fillRect(rect.x - rect.w / 2, rect.y, rect.w, rect.h);
    // 심지 — 가운데 얇은 밝은 줄이 있어야 기둥으로 읽힌다
    gfx.fillGradientStyle(0xFFFFFF, 0xFFFFFF, color, color, 0, 0, 0.55, 0.55);
    gfx.fillRect(rect.x - rect.w * 0.16, rect.y, rect.w * 0.32, rect.h);
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
   * 바닥 룬 원 — 이 화면에서 기억에 남는 한 가지다.
   *
   * 타원을 직접 회전시키면 도형이 흔들려 보인다(회전 후 스케일이라 원근이 깨진다).
   * 그래서 **원을 원인 채로 돌리고, 바깥 컨테이너가 세로로 눌러** 바닥에 누운 원근을
   * 만든다. 회전은 눌리기 전 공간에서 일어나므로 어느 각도에서도 모양이 같다.
   */
  createRuneCircle() {
    const ring = computeRuneRing(this.baseW, this.baseH);
    const rx = s(ring.rx);
    const ry = s(ring.ry);

    const flat = this.scene.add.container(s(ring.cx), s(ring.cy));
    flat.setScale(1, ry / rx);
    this.add(flat);

    const spin = this.scene.add.container(0, 0);
    flat.add(spin);

    const gfx = this.scene.add.graphics();
    spin.add(gfx);

    this.runeFlat = flat;
    this.runeSpin = spin;
    this.runeGfx = gfx;
    this.runeRadius = rx;
    this.drawRuneCircle(DESIGN.colors.brand.primary);
  }

  /**
   * 룬 문양을 교단색으로 다시 그린다. 두 겹 링 + 12 방향 눈금 + 안쪽 사각 별.
   * @param {number} color
   */
  drawRuneCircle(color) {
    const gfx = this.runeGfx;
    if (!gfx) return;
    const r = this.runeRadius;

    gfx.clear();
    gfx.lineStyle(s(1.5), color, 0.34);
    gfx.strokeCircle(0, 0, r);
    gfx.lineStyle(s(1), color, 0.22);
    gfx.strokeCircle(0, 0, r * 0.74);
    gfx.strokeCircle(0, 0, r * 0.42);

    // 12 방향 눈금 — 회전이 눈에 보이게 하는 최소 표식
    gfx.lineStyle(s(2), color, 0.4);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const inner = r * (i % 3 === 0 ? 0.82 : 0.9);
      gfx.beginPath();
      gfx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      gfx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      gfx.strokePath();
    }

    // 안쪽 사각 별 (룬)
    gfx.lineStyle(s(1), color, 0.26);
    for (let i = 0; i < 4; i += 1) {
      const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const a1 = a0 + Math.PI / 2;
      gfx.beginPath();
      gfx.moveTo(Math.cos(a0) * r * 0.42, Math.sin(a0) * r * 0.42);
      gfx.lineTo(Math.cos(a1) * r * 0.42, Math.sin(a1) * r * 0.42);
      gfx.strokePath();
    }
  }

  /**
   * 챕터 배경을 지연 로드해 성소 뒤에 깐다.
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
    // 챕터 배경은 다른 씬과 공유하는 공용 텍스처다. 로드만 하고 해제하지 않는다.
    this.loadTexture(key, meta.path, (ready) => this.placeChapterBackdrop(ready));
  }

  /**
   * 챕터 배경을 성소 맨 뒤에 cover-fit 으로 놓는다. 넘치는 부분은 관측창 마스크가 자른다.
   * 색은 배경에 직접 먹이지 않는다 — 위에 덮인 교단색 워시가 그 일을 한다.
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
    this.sendToBack(image);
    if (this.options.chrome !== false) this.moveUp(image);

    this.scene.tweens.add({ targets: image, alpha: 0.62, duration: 420, ease: 'Sine.easeOut' });
    this.stageBgImage = image;
  }

  // ==================================================================
  // 좌석 (파티 4인)
  // ==================================================================

  /**
   * 좌석 4자리를 만든다. 처음에는 전부 빈 방석이고 `updateParty()` 가 채운다.
   *
   * 자식 순서가 곧 앞뒤다. 뒷줄 -> 제단 -> 앞줄 순으로 넣어야 제단이 뒷줄을 가리고
   * 앞줄이 제단을 가린다. 제단은 createAltar() 가 이 사이에 끼운다.
   */
  createSeats() {
    const seats = computeMeditationSeats(this.baseW, this.baseH);
    const ordered = [...seats].sort((a, b) => a.depth - b.depth);

    this.seats = new Array(seats.length);
    this._backSeatTop = null;

    ordered.forEach((seat) => {
      const x = s(seat.x);
      const y = s(seat.y);
      const height = s(seat.height);

      // 명상 원(방석) — 빈 자리에도 남아 "미편성"을 자리로 보여 준다.
      // 4인이 각자 자기 원 위에 앉으면 배치가 나열이 아니라 진형으로 읽힌다.
      const cushion = this.scene.add.graphics();
      this.add(cushion);
      const disc = computeSeatDisc(seat);
      const discSize = disc ? { rx: s(disc.rx), ry: s(disc.ry), ticks: disc.ticks } : null;

      // 광배 — 어두운 성소에서 유닛(치비든 폴백이든)을 배경에서 떼어 놓는 최소 장치
      const halo = this.scene.add.ellipse(x, y - height * 0.38, height * 0.95, height * 1.05,
        NEUTRAL_SILHOUETTE, 0).setBlendMode(Phaser.BlendModes.ADD);
      this.add(halo);

      const root = this.scene.add.container(x, y);
      this.add(root);

      const slot = {
        ...seat,
        renderX: x,
        renderY: y,
        renderH: height,
        root,
        cushion,
        discSize,
        halo,
        sprite: null,       // meditate 프레임 (또는 폴백 이미지)
        channelSprite: null,// channel 프레임 (교차 페이드용)
        silhouette: null,
        classIcon: null,
        levelText: null,
        chibi: null,        // 치비 시트 메타 (없으면 폴백)
        hero: null
      };
      this.drawSeatDisc(slot, NEUTRAL_SILHOUETTE, 0.22);
      this.drawSilhouette(slot, NEUTRAL_SILHOUETTE, 'warrior');
      this.seats[seat.index] = slot;

      if (seat.row === 'back') this._backSeatTop = root;
    });
  }

  /**
   * 좌석 명상 원 — 교단색 바닥 원반 + 테두리 + 눈금.
   * 룬 원과 같은 원근(납작한 타원)이라 바닥에 놓인 것으로 읽힌다.
   *
   * @param {object} slot 좌석
   * @param {number} color 교단/분위기 색
   * @param {number} alpha 채움 알파. 0 이면 빈 자리
   */
  drawSeatDisc(slot, color, alpha) {
    const gfx = slot.cushion;
    const size = slot.discSize;
    if (!gfx || !size) return;

    const { rx, ry, ticks } = size;
    const cx = slot.renderX;
    const cy = slot.renderY;

    gfx.clear();
    gfx.fillStyle(color, alpha);
    gfx.fillEllipse(cx, cy, rx * 2, ry * 2);
    gfx.lineStyle(s(1.5), color, Math.min(1, alpha * 3));
    gfx.strokeEllipse(cx, cy, rx * 2, ry * 2);
    gfx.lineStyle(s(1), color, Math.min(1, alpha * 2));
    gfx.strokeEllipse(cx, cy, rx * 1.3, ry * 1.3);

    // 눈금 — 원이 도형이 아니라 문양으로 보이게 하는 최소 표식
    gfx.lineStyle(s(2), color, Math.min(1, alpha * 2.4));
    for (let i = 0; i < ticks; i += 1) {
      const a = (i / ticks) * Math.PI * 2;
      gfx.beginPath();
      gfx.moveTo(cx + Math.cos(a) * rx * 0.78, cy + Math.sin(a) * ry * 0.78);
      gfx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
      gfx.strokePath();
    }
  }

  /**
   * 앉은 실루엣 — 치비 시트도 전신 시트도 없을 때의 대역.
   * 이모지를 쓰지 않는다(REDESIGN_PLAN §2-2). 가부좌를 암시하는 낮은 캡슐 + 클래스 아이콘이다.
   *
   * @param {object} slot 좌석
   * @param {number} color 실루엣 색 (교단/분위기)
   * @param {string} classKey 클래스 아이콘 키
   */
  drawSilhouette(slot, color, classKey) {
    if (slot.silhouette) { slot.silhouette.destroy(); slot.silhouette = null; }
    if (slot.classIcon) { slot.classIcon.destroy(); slot.classIcon = null; }

    const h = slot.renderH;
    const w = h * 0.46;
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(color, 0.55);
    // 앉은 몸통(넓고 낮은 사다리꼴 대용 캡슐) + 머리
    gfx.fillRoundedRect(-w / 2, -h * 0.46, w, h * 0.46, w * 0.38);
    gfx.fillCircle(0, -h * 0.58, w * 0.30);
    gfx.lineStyle(s(2), color, 0.9);
    gfx.strokeRoundedRect(-w / 2, -h * 0.46, w, h * 0.46, w * 0.38);
    slot.root.add(gfx);
    slot.silhouette = gfx;

    const iconKey = IconFactory.create(this.scene, classKey || 'warrior', Math.round(w * 0.58), {
      tint: 0xFFFFFF
    });
    if (iconKey) {
      const icon = this.scene.add.image(0, -h * 0.26, iconKey).setOrigin(0.5).setAlpha(0.8);
      slot.root.add(icon);
      slot.classIcon = icon;
    }
  }

  /**
   * 치비 시트를 좌석에 앉힌다.
   *
   * 시트는 셀 안에서 규격 정렬(발밑 footY)되어 있으므로 **셀 높이 기준으로 배치**하고
   * 발밑만 좌석 원점에 맞춘다. 프레임마다 크기가 달라 보이는 문제를 후처리가 이미
   * 없앴기 때문에 여기서 프레임별 보정을 하지 않는다.
   *
   * @param {object} slot
   * @param {string} key 텍스처 키
   * @param {object} meta resolveChibiSheet() 결과
   */
  placeChibi(slot, key, meta) {
    const fit = computeChibiFit(meta.cell, meta.cell, slot.renderH);
    if (!fit) return;

    if (slot.sprite) { slot.sprite.destroy(); slot.sprite = null; }
    if (slot.channelSprite) { slot.channelSprite.destroy(); slot.channelSprite = null; }

    // 셀 안에서 발밑이 footY 에 있다. 셀 전체를 그린 뒤 그만큼 위로 올려 발을 좌석에 붙인다.
    const footOffset = (meta.footY / meta.cell) * fit.h;
    const mk = (frame, alpha) => {
      const sprite = this.scene.add.sprite(0, -footOffset + fit.h / 2, key, frame)
        .setOrigin(0.5)
        .setDisplaySize(fit.w, fit.h)
        .setAlpha(alpha);
      slot.root.add(sprite);
      return sprite;
    };

    slot.chibi = meta;
    slot.frames = {
      idle: frameIndex(meta.frames, 'idle'),
      meditate: frameIndex(meta.frames, 'meditate'),
      channel: frameIndex(meta.frames, 'channel'),
      awaken: frameIndex(meta.frames, 'awaken')
    };
    slot.sprite = mk(slot.frames.meditate, 0);
    slot.channelSprite = mk(slot.frames.channel, 0);

    // 전직 영웅이 원본 시트를 빌려 쓰면 교단색으로 물들여 구분한다(계획서 C-6 의 출발점)
    if (meta.inherited && slot.hero) {
      const tint = this.resolveUnitColor(slot.hero);
      slot.sprite.setTint(tint);
      slot.channelSprite.setTint(tint);
    }

    if (slot.silhouette) { slot.silhouette.destroy(); slot.silhouette = null; }
    if (slot.classIcon) { slot.classIcon.destroy(); slot.classIcon = null; }

    this.scene.tweens.add({ targets: slot.sprite, alpha: 1, duration: 320, ease: 'Sine.easeOut' });
  }

  /**
   * 폴백 스탠딩 — 치비 시트가 없는 영웅. 전신 시트를 **앉은 자세 크기로 축소**해
   * 같은 자리에 놓는다. 좌석 높이의 0.92 배로 낮춰 치비와 눈높이를 맞춘다.
   * @param {object} slot
   * @param {string} key
   */
  placeFallbackSprite(slot, key) {
    const source = this.scene.textures.get(key).getSourceImage();
    const fit = computeSpriteFit(source?.width, source?.height, slot.renderH * 0.92);
    if (!fit) return;

    if (slot.sprite) { slot.sprite.destroy(); slot.sprite = null; }
    const sprite = this.scene.add.image(0, 0, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(fit.w, fit.h)
      .setAlpha(0);
    slot.root.add(sprite);
    slot.sprite = sprite;
    slot.chibi = null;

    if (slot.silhouette) { slot.silhouette.destroy(); slot.silhouette = null; }
    if (slot.classIcon) { slot.classIcon.destroy(); slot.classIcon = null; }

    this.scene.tweens.add({ targets: sprite, alpha: 1, duration: 320, ease: 'Sine.easeOut' });
  }

  /**
   * 좌석의 아트를 지연 로드한다. 치비 시트가 있으면 그것을, 없으면 기존 전신 시트를.
   * 어느 쪽도 매니페스트에 없으면 실루엣이 그대로 남는다.
   *
   * 시트가 나중에 추가되면 매니페스트만 바뀌고 이 코드는 그대로다 — 자동 전환(C-4).
   *
   * @param {object} slot
   * @param {object} hero
   */
  queueSeatArt(slot, hero) {
    const chibi = resolveChibiSheet(hero, ASSET_MANIFEST);
    if (chibi) {
      this.loadTexture(chibi.key, chibi.path, (ready) => {
        // 로드가 끝나기 전에 편성이 바뀌었으면 그 자리에 다른 영웅을 그리지 않는다
        if (slot.hero && slot.hero.id === hero.id) this.placeChibi(slot, ready, chibi);
      }, { frameWidth: chibi.cell, frameHeight: chibi.cell });
      if (!this._ownedChibiKeys.includes(chibi.key)) this._ownedChibiKeys.push(chibi.key);
      return;
    }

    const key = heroSpriteKey(hero.id, PORTRAIT_MAP);
    if (!key || !ASSET_MANIFEST.fullbody || !ASSET_MANIFEST.fullbody[key]) return;
    const path = heroSpritePath(key);
    if (!path) return;

    // 전신 시트는 HeroDetailScene 과 공유하는 공용 텍스처다. 로드만 하고 해제하지 않는다.
    this.loadTexture(key, path, (ready) => {
      if (slot.hero && slot.hero.id === hero.id) this.placeFallbackSprite(slot, ready);
    });
  }

  /**
   * 파티 갱신. 빈 자리는 방석만 남는다.
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

    this.applyAccent(members);

    (this.seats || []).forEach((slot, index) => {
      const hero = members[index] || null;
      slot.hero = hero;

      if (!hero) {
        slot.root.setAlpha(0.2);
        this.drawSeatDisc(slot, NEUTRAL_SILHOUETTE, 0.10);
        slot.halo.setFillStyle(NEUTRAL_SILHOUETTE, 0);
        if (slot.levelText) slot.levelText.setVisible(false);
        return;
      }

      slot.root.setAlpha(1);

      const color = this.resolveUnitColor(hero);
      this.drawSeatDisc(slot, color, 0.26);
      slot.halo.setFillStyle(color, 0.16);
      if (!slot.sprite) this.drawSilhouette(slot, color, hero.class || hero.baseClass || 'warrior');
      this.queueSeatArt(slot, hero);

      const label = `Lv.${hero.level || 1}`;
      if (!slot.levelText) {
        // 명상 원 **아래**에 적는다. 원 위에 겹치면 문양과 글자가 서로를 갉아먹는다
        const below = slot.renderY + (slot.discSize ? slot.discSize.ry : 0) + s(3);
        slot.levelText = this.scene.add.text(slot.renderX, below, label,
          ts('num.sm', { color: DESIGN.colors.text.secondary })).setOrigin(0.5, 0);
        this.add(slot.levelText);
      }
      slot.levelText.setText(label).setVisible(true);
    });
  }

  /**
   * 성소의 색을 파티에서 정한다 — 가장 많은 교단색. 룬 원·제단·오라가 이 색을 따른다.
   * @param {Array<object>} members
   */
  applyAccent(members) {
    const tally = new Map();
    (members || []).forEach((hero) => {
      const color = this.resolveUnitColor(hero);
      tally.set(color, (tally.get(color) || 0) + 1);
    });

    let best = DESIGN.colors.brand.primary;
    let bestCount = 0;
    tally.forEach((count, color) => {
      if (count > bestCount) { best = color; bestCount = count; }
    });

    this._accentColor = best;
    this.drawRuneCircle(best);
    this.drawAltar(best);
    this.drawLightPillar(best);
    this.cultWash?.setFillStyle(best, 0.14);
    this.altarGlow?.setFillStyle(best, this.altarGlow.fillAlpha);

    // 좌석 광배·명상 원도 각자의 교단색으로 — 어두운 배경에서 유닛을 떼어 놓는다
    (this.seats || []).forEach((slot) => {
      if (!slot.halo) return;
      const color = slot.hero ? this.resolveUnitColor(slot.hero) : NEUTRAL_SILHOUETTE;
      slot.halo.setFillStyle(color, slot.hero ? 0.16 : 0);
      this.drawSeatDisc(slot, color, slot.hero ? 0.26 : 0.10);
    });
  }

  /**
   * 유닛 색 — 교단색이 있으면 그것을, 없으면 분위기색, 둘 다 없으면 중립.
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
  // 제단
  // ==================================================================

  /**
   * 중앙 제단 — 받침 + 기둥 + 마력 구슬 + (100% 에서) 빛기둥.
   * 뒷줄과 앞줄 사이에 끼워 넣어 원근을 지킨다.
   */
  createAltar() {
    const altar = computeAltar(this.baseW, this.baseH);
    const ring = computeRuneRing(this.baseW, this.baseH);
    this.altar = {
      x: s(altar.x), y: s(altar.y),
      baseRx: s(altar.baseRx), baseRy: s(altar.baseRy),
      topY: s(altar.topY),
      orbX: s(altar.orbX), orbY: s(altar.orbY), orbR: s(altar.orbR)
    };

    const color = DESIGN.colors.brand.primary;

    // 바닥 인장 — 큰 룬 원과 같은 원근으로 눕히고 **반대로** 돈다.
    // 두 원이 서로 반대로 돌면 정적인 도형 두 개가 하나의 장치처럼 읽힌다.
    const flatten = ring.ry / ring.rx;
    const sigilFlat = this.scene.add.container(this.altar.x, this.altar.y).setScale(1, flatten);
    const sigilSpin = this.scene.add.container(0, 0);
    sigilFlat.add(sigilSpin);
    this.altarSigilGfx = this.scene.add.graphics();
    sigilSpin.add(this.altarSigilGfx);
    this.altarSigilSpin = sigilSpin;
    this.altarSigilRadius = this.altar.baseRx;

    // 부유 결정 — 축적 마력의 얼굴. 컨테이너째 떠오르고 커진다
    const crystal = this.scene.add.container(this.altar.orbX, this.altar.orbY);
    this.altarGlow = this.scene.add.circle(0, 0, this.altar.orbR * 2.6, color, 0.12)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.altarCrystalGfx = this.scene.add.graphics();
    crystal.add([this.altarGlow, this.altarCrystalGfx]);
    this.altarCrystal = crystal;

    // 결정과 인장을 잇는 빛줄기 — 결정이 떠 있다는 것을 바닥과 연결해 알린다
    this.altarTether = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);

    const group = [sigilFlat, this.altarTether, crystal];
    group.forEach((obj) => this.add(obj));
    this.drawAltar(color);
    this.applyManaToAltar(0);

    // 앞줄보다 뒤, 뒷줄보다 앞. 뒷줄 컨테이너 바로 위로 올린다
    if (this._backSeatTop) {
      const at = this.getIndex(this._backSeatTop) + 1;
      group.forEach((obj, i) => this.moveTo(obj, at + i));
    }
  }

  /**
   * 제단을 교단색으로 다시 그린다 — 바닥 룬 인장 + 부유 결정 + 잇는 빛줄기.
   *
   * 원통 기둥을 세우지 않는다. 기둥은 어두운 성소에서 그냥 막대로 보였다.
   * "떠 있는 결정"은 실루엣이 분명하고 마력 비율을 크기·밝기로 바로 전한다.
   *
   * @param {number} color
   */
  drawAltar(color) {
    const altar = this.altar;
    if (!altar) return;

    // 바닥 인장 — 이중 링 + 눈금 + 안쪽 삼각. 원 공간에서 그리고 컨테이너가 눕힌다
    const sigil = this.altarSigilGfx;
    if (sigil) {
      const r = this.altarSigilRadius;
      sigil.clear();
      sigil.fillStyle(color, 0.16);
      sigil.fillCircle(0, 0, r);
      sigil.lineStyle(s(2), color, 0.9);
      sigil.strokeCircle(0, 0, r);
      sigil.lineStyle(s(1), color, 0.55);
      sigil.strokeCircle(0, 0, r * 0.66);
      sigil.lineStyle(s(2), color, 0.7);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        sigil.beginPath();
        sigil.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        sigil.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        sigil.strokePath();
      }
      sigil.lineStyle(s(1), color, 0.45);
      for (let i = 0; i < 3; i += 1) {
        const a0 = (i / 3) * Math.PI * 2;
        const a1 = ((i + 1) / 3) * Math.PI * 2;
        sigil.beginPath();
        sigil.moveTo(Math.cos(a0) * r * 0.66, Math.sin(a0) * r * 0.66);
        sigil.lineTo(Math.cos(a1) * r * 0.66, Math.sin(a1) * r * 0.66);
        sigil.strokePath();
      }
    }

    // 부유 결정 — 위아래 두 뿔을 가진 마름모. 왼/오 면의 밝기를 달리해 입체를 만든다
    const gfx = this.altarCrystalGfx;
    if (gfx) {
      const r = altar.orbR;
      const topY = -r * 1.35;
      const botY = r * 1.05;
      const halfW = r * 0.62;
      gfx.clear();
      // 오른쪽 면 (밝은 쪽)
      gfx.fillStyle(color, 0.95);
      gfx.beginPath();
      gfx.moveTo(0, topY); gfx.lineTo(halfW, -r * 0.12); gfx.lineTo(0, botY); gfx.closePath();
      gfx.fillPath();
      // 왼쪽 면 (그늘)
      gfx.fillStyle(color, 0.55);
      gfx.beginPath();
      gfx.moveTo(0, topY); gfx.lineTo(-halfW, -r * 0.12); gfx.lineTo(0, botY); gfx.closePath();
      gfx.fillPath();
      // 능선 + 외곽
      gfx.lineStyle(s(1.5), 0xFFFFFF, 0.75);
      gfx.beginPath();
      gfx.moveTo(0, topY); gfx.lineTo(0, botY);
      gfx.strokePath();
      gfx.lineStyle(s(1.5), 0xFFFFFF, 0.5);
      gfx.beginPath();
      gfx.moveTo(0, topY);
      gfx.lineTo(halfW, -r * 0.12);
      gfx.lineTo(0, botY);
      gfx.lineTo(-halfW, -r * 0.12);
      gfx.closePath();
      gfx.strokePath();
    }

    // 결정 -> 인장 빛줄기
    const tether = this.altarTether;
    if (tether) {
      tether.clear();
      tether.fillGradientStyle(color, color, color, color, 0.5, 0.5, 0.02, 0.02);
      tether.fillRect(altar.orbX - s(3), altar.orbY, s(6), altar.y - altar.orbY);
    }
  }

  // ==================================================================
  // HUD
  // ==================================================================

  /**
   * 헤더 라벨 · 마력 게이지 · 수확 준비 배너. 수치를 항상 병기한다(색상 단독 전달 금지).
   */
  createHud() {
    const labels = computeSanctumLabels(this.baseW, this.baseH);
    const gauge = computeManaGauge(this.baseW, this.baseH);

    this.titleText = this.scene.add.text(s(labels.title.x), s(labels.title.y), '',
      ts('label', { color: DESIGN.colors.text.primary })).setOrigin(labels.title.originX, labels.title.originY);
    this.add(this.titleText);

    this.progressText = this.scene.add.text(s(labels.progress.x), s(labels.progress.y), '0%',
      ts('num.md', { color: DESIGN.colors.text.primary })).setOrigin(labels.progress.originX, labels.progress.originY);
    this.add(this.progressText);

    this.etaText = this.scene.add.text(s(labels.eta.x), s(labels.eta.y), formatHarvestEta(Infinity),
      ts('caption', { color: DESIGN.colors.text.secondary })).setOrigin(labels.eta.originX, labels.eta.originY);
    this.add(this.etaText);

    this.gaugeSlot = { x: s(gauge.x), y: s(gauge.y), w: s(gauge.w), h: s(gauge.h), labelY: s(gauge.labelY) };

    const track = this.scene.add.graphics();
    track.fillStyle(DESIGN.colors.bg.primary, 0.8);
    track.fillRoundedRect(this.gaugeSlot.x - this.gaugeSlot.w / 2, this.gaugeSlot.y,
      this.gaugeSlot.w, this.gaugeSlot.h, this.gaugeSlot.h / 2);
    track.lineStyle(s(1), 0xFFFFFF, 0.18);
    track.strokeRoundedRect(this.gaugeSlot.x - this.gaugeSlot.w / 2, this.gaugeSlot.y,
      this.gaugeSlot.w, this.gaugeSlot.h, this.gaugeSlot.h / 2);
    this.add(track);
    this.gaugeTrack = track;

    this.gaugeFill = this.scene.add.graphics();
    this.add(this.gaugeFill);

    // 축적/필요 마력 (좌) · 집중력 (우) — 한 줄에 둘 다 적는다
    this.manaLabel = this.scene.add.text(this.gaugeSlot.x - this.gaugeSlot.w / 2, this.gaugeSlot.labelY, '',
      ts('num.sm', { color: DESIGN.colors.text.primary })).setOrigin(0, 0.5);
    this.add(this.manaLabel);

    this.focusLabel = this.scene.add.text(this.gaugeSlot.x + this.gaugeSlot.w / 2, this.gaugeSlot.labelY,
      formatFocusRate(0), ts('num.sm', { color: DESIGN.colors.text.secondary })).setOrigin(1, 0.5);
    this.add(this.focusLabel);

    // 수확 준비 배너 (기본 숨김).
    // 성소 위에 글자만 띄우면 유닛과 겹쳐 읽히지 않는다. 알약 배경을 깔아
    // "화면 위의 알림"으로 분리한다 — 배경 대비도 이 알약이 보장한다(A11Y).
    const banner = computeReadyBanner(this.baseW, this.baseH);
    this.readyPill = this.scene.add.graphics().setVisible(false);
    this.add(this.readyPill);

    this.readyText = this.scene.add.text(s(banner.x), s(banner.y), LABELS.harvestReady,
      ts('title', { color: `#${DESIGN.colors.brand.accent.toString(16).padStart(6, '0')}` }))
      .setOrigin(0.5).setVisible(false);
    // 컨테이너 안이라 실제 렌더 순서는 컨테이너 depth(IDLE_BATTLE)를 따르지만,
    // 이 배너가 "씬 연출이지 팝업이 아니다"라는 것을 토큰으로 명시해 둔다.
    this.readyText.setDepth(Z_INDEX.IDLE_FX);
    this.add(this.readyText);
    this.drawReadyPill();
  }

  /**
   * 수확 준비 배너의 알약 배경을 글자 크기에 맞춰 그린다.
   */
  drawReadyPill() {
    const gfx = this.readyPill;
    const text = this.readyText;
    if (!gfx || !text) return;

    const padX = s(18);
    const padY = s(8);
    const w = text.width + padX * 2;
    const h = text.height + padY * 2;
    const x = text.x - w / 2;
    const y = text.y - h / 2;

    gfx.clear();
    gfx.fillStyle(DESIGN.colors.bg.primary, 0.82);
    gfx.fillRoundedRect(x, y, w, h, h / 2);
    gfx.lineStyle(s(1.5), DESIGN.colors.brand.accent, 0.85);
    gfx.strokeRoundedRect(x, y, w, h, h / 2);
  }

  /**
   * 마력 게이지를 비율로 그린다.
   * @param {number} accumulated 축적 마력
   * @param {number} required 필요 마력
   * @param {object} [options]
   * @param {boolean} [options.immediate] 트윈 없이 즉시 (오프라인 복귀 스냅)
   */
  renderMana(accumulated, required, options = {}) {
    if (!this.gaugeFill || !this.gaugeSlot) return;
    const ratio = manaRatio(accumulated, required);
    const slot = this.gaugeSlot;

    const draw = (r) => {
      this.gaugeFill.clear();
      const w = slot.w * r;
      if (w <= 0) return;
      const color = r >= 1
        ? DESIGN.colors.brand.accent
        : (this._accentColor || DESIGN.colors.brand.primary);
      this.gaugeFill.fillStyle(color, 0.95);
      this.gaugeFill.fillRoundedRect(slot.x - slot.w / 2, slot.y, Math.max(slot.h, w), slot.h, slot.h / 2);
    };

    if (options.immediate || !this._manaRatio) {
      this._manaRatio = ratio;
      draw(ratio);
    } else {
      const from = { r: this._manaRatio };
      this.trackTween({
        targets: from,
        r: ratio,
        duration: 220,
        onUpdate: () => draw(from.r),
        onComplete: () => { this._manaRatio = ratio; }
      });
      this._manaRatio = ratio;
    }

    this.manaLabel?.setText(formatManaLabel(accumulated, required));
    this.progressText?.setText(`${Math.floor(ratio * 100)}%`);
    this.applyManaToAltar(ratio);
  }

  /**
   * 마력 비율을 제단에 반영 — 구슬 밝기·크기, 룬 회전 속도.
   * @param {number} ratio 0~1
   */
  applyManaToAltar(ratio) {
    const alpha = altarGlowAlpha(ratio);
    this.altarCrystalGfx?.setAlpha(alpha);
    this.altarCrystal?.setScale(0.9 + 0.35 * ratio);
    this.altarGlow?.setAlpha(0.10 + 0.40 * ratio);
    this.altarTether?.setAlpha(0.35 + 0.65 * ratio);
    this.altarSigilGfx?.setAlpha(0.55 + 0.45 * ratio);

    if (this._runeTween) {
      // 회전 속도는 트윈을 새로 만들지 않고 timeScale 로만 바꾼다(상시 루프 3개 유지)
      const base = runeSpinDuration(0);
      this._runeTween.setTimeScale(base / runeSpinDuration(ratio));
    }
  }

  /**
   * 헤더 제목 — "챕터 N-M 성소 · 정화 대상".
   */
  updateSanctumTitle() {
    this.titleText?.setText(formatSanctumTitle(this.chapter, this.stage, this.currentBoss?.name || ''));
  }

  /**
   * 집중력(= DPS)을 축적 마력의 증가분에서 관측한다.
   * IdleProgressSystem 을 직접 참조하지 않기 위해서다 — 계산식은 기존과 같다.
   * @param {number} accumulated
   */
  updateFocus(accumulated) {
    const now = Date.now();
    if (this._focusSample) {
      const dt = (now - this._focusSample.at) / 1000;
      const dv = accumulated - this._focusSample.mana;
      if (dt > 0.25 && dv > 0) {
        const sample = dv / dt;
        // 지수 평활 — 틱마다 값이 튀지 않게
        this._focus = this._focus > 0 ? this._focus * 0.7 + sample * 0.3 : sample;
      }
    }
    this._focusSample = { mana: accumulated, at: now };

    const remaining = Math.max(0, this.requiredMana - accumulated);
    this.etaText?.setText(formatHarvestEta(estimateHarvestSeconds(remaining, this._focus)));
    this.focusLabel?.setText(formatFocusRate(this._focus));
  }

  // ==================================================================
  // 정화 대상 (구 보스)
  // ==================================================================

  /**
   * 정화 대상 설정 = 다음 수확까지 필요한 마력 갱신.
   *
   * @param {object} bossData IdleProgressSystem.currentBossData
   * @param {object} [options]
   * @param {number} [options.accumulatedDamage] 이미 쌓인 축적 마력.
   *        오프라인 복귀 시 0 에서 채우는 연출을 건너뛰고 마지막 상태로 즉시 스냅한다.
   */
  setHarvestTarget(bossData, options = {}) {
    if (!bossData) return;

    this.currentBoss = bossData;
    this.requiredMana = bossData.hp || 1000;
    this.isHarvesting = false;

    // 오프라인 복귀 스냅 — 누적 연출 없이 마지막 상태로
    const accumulated = Number.isFinite(options.accumulatedDamage) ? options.accumulatedDamage : 0;
    this.storedMana = accumulated;
    this._manaRatio = 0;
    this.renderMana(accumulated, this.requiredMana, { immediate: true });
    this.updateSanctumTitle();
  }

  /**
   * 다음 대상으로 교체. 제단이 한 번 비워졌다가 다시 찬다.
   * @param {object} bossData
   */
  advanceHarvestTarget(bossData) {
    if (!bossData) return;
    this.playHarvestBurst();
    const delay = this.scene.time.delayedCall(420, () => {
      this._focusSample = null;
      this.setHarvestTarget(bossData, { accumulatedDamage: 0 });
    });
    this.pendingDelays.push(delay);
  }

  /**
   * 수확 연출 — 제단에서 퍼지는 링 + 전원 awaken 0.6초 + 스케일 펀치.
   * 파티클 시스템을 쓰지 않아 가볍다.
   */
  playHarvestBurst() {
    if (!this.altar) return;
    this.isHarvesting = true;

    const ring = this.scene.add.circle(this.altar.orbX, this.altar.orbY, s(10),
      this._accentColor || DESIGN.colors.brand.accent, 0.75);
    this.add(ring);
    this.trackTween({
      targets: ring,
      radius: s(110),
      alpha: 0,
      duration: 460,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    this.playAwaken();

    const reset = this.scene.time.delayedCall(HARVEST.awakenMs + 120, () => { this.isHarvesting = false; });
    this.pendingDelays.push(reset);
  }

  /**
   * 전원 awaken 프레임 0.6초 + 스케일 펀치. 치비가 없는 좌석은 펀치만 준다.
   */
  playAwaken() {
    (this.seats || []).forEach((slot) => {
      if (!slot.hero) return;

      if (slot.chibi && slot.sprite) {
        slot.channelSprite?.setAlpha(0);
        slot.sprite.setAlpha(1).setFrame(slot.frames.awaken);
        const back = this.scene.time.delayedCall(HARVEST.awakenMs, () => {
          if (slot.sprite && slot.chibi) slot.sprite.setFrame(slot.frames.meditate);
        });
        this.pendingDelays.push(back);
      }

      if (this._activeTweens >= MAX_CONCURRENT_TWEENS) return;
      this.trackTween({
        targets: slot.root,
        scale: HARVEST.punchScale,
        duration: 180,
        yoyo: true,
        ease: 'Sine.easeOut',
        onComplete: () => slot.root.setScale(1)
      });
    });
  }

  // ==================================================================
  // 명상 루프
  // ==================================================================

  /**
   * 명상 시작 — 상시 루프(룬 회전·호흡·구슬 맥박) + 오라/교차 타이머.
   * 파티가 없으면 아무 것도 하지 않는다.
   */
  beginMeditation() {
    if (!this.hasParty) return;
    this.stopMeditation();
    this.startAmbientLoops();
    this.scheduleAura();
    this.scheduleChannelPulse();
  }

  /**
   * 예약된 연출을 모두 취소한다. 상시 루프는 남긴다(정지 상태의 성소도 숨은 쉰다).
   */
  stopMeditation() {
    if (this.auraTimer) { this.auraTimer.remove(); this.auraTimer = null; }
    if (this.channelTimer) { this.channelTimer.remove(); this.channelTimer = null; }
  }

  /**
   * 상시 루프 3개. **생성 시 한 번만** 만든다 — 이후 속도는 timeScale 로만 바꾼다.
   * 무한 반복 트윈이라 일회성 트윈 카운터(`trackTween`)에 넣지 않는다.
   */
  startAmbientLoops() {
    if (this._ambientTweens.length > 0) return;
    const tw = this.scene.tweens;

    // 1) 룬 원 회전
    if (this.runeSpin) {
      this._runeTween = tw.add({
        targets: this.runeSpin,
        rotation: Math.PI * 2,
        duration: runeSpinDuration(0),
        repeat: -1,
        ease: 'Linear',
        // 제단 인장은 반대로 돈다. 트윈을 하나 더 만들지 않고 큰 원의 각도를 뒤집어 쓴다
        onUpdate: () => {
          if (this.altarSigilSpin) this.altarSigilSpin.rotation = -this.runeSpin.rotation * 1.6;
        }
      });
      this._ambientTweens.push(this._runeTween);
    }

    // 2) 호흡 — 좌석마다 트윈을 만들지 않고 위상 하나를 공유해 onUpdate 에서 4명을 옮긴다
    this._ambientTweens.push(tw.add({
      targets: this._breathPhase,
      v: 1,
      duration: BREATH.durationMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.applyBreath()
    }));

    // 3) 마력 구슬 맥박
    if (this.altarGlow) {
      this._ambientTweens.push(tw.add({
        targets: this.altarGlow,
        scale: { from: 0.92, to: 1.12 },
        duration: 1800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      }));
    }
  }

  /**
   * 호흡 위상을 좌석 y 로 옮긴다. 좌석마다 위상을 어긋나게 해 4명이 한 몸처럼 뜨지 않게 한다.
   */
  applyBreath() {
    if (!this._canAnimate()) return;
    const amp = s(BREATH.amplitudeY);
    (this.seats || []).forEach((slot, i) => {
      if (!slot.hero) return;
      const phase = this._breathPhase.v + i * 0.25;
      slot.root.y = slot.renderY - Math.sin(phase * Math.PI) * amp;
    });

    // 결정도 같은 위상으로 뜬다. 트윈을 더 만들지 않고 호흡 하나를 나눠 쓴다
    if (this.altarCrystal && this.altar) {
      this.altarCrystal.y = this.altar.orbY - Math.sin(this._breathPhase.v * Math.PI) * amp * 1.6;
    }
  }

  /**
   * 다음 오라 입자를 예약한다. 간격은 집중력이 정한다.
   */
  scheduleAura() {
    if (!this.scene || !this.scene.time) return;
    const delay = auraSpawnDelay(this._focus);
    this.auraTimer = this.scene.time.delayedCall(delay, () => {
      this.auraTimer = null;
      this.spawnAuraMote();
      this.scheduleAura();
    });
  }

  /**
   * 오라 입자 하나 — 좌석에서 제단 구슬로 흐른다. 교단색이고, 도착하면서 사라진다.
   * 로직은 없다. 빈도만 실제 집중력에서 나온다.
   */
  spawnAuraMote() {
    if (!this._canAnimate() || this.isHarvesting) return;
    if (this._auraAlive >= AURA.maxAlive) return;
    if (this._activeTweens >= MAX_CONCURRENT_TWEENS) return;

    const seated = (this.seats || []).filter((slot) => slot.hero);
    if (seated.length === 0) return;

    const slot = seated[Phaser.Math.Between(0, seated.length - 1)];
    const color = this.resolveUnitColor(slot.hero);
    const startY = slot.renderY - slot.renderH * 0.42;

    const mote = this.scene.add.circle(slot.renderX, startY, s(AURA.radius), color, 0.95)
      .setStrokeStyle(s(1.5), 0xFFFFFF, 0.55)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.add(mote);
    this._auraAlive += 1;

    // 제단으로 가되 한 번 위로 부풀었다 내려온다 — 직선으로 가면 레이저처럼 보인다
    const midY = Math.min(startY, this.altar.orbY) - s(14);
    this.trackTween({
      targets: mote,
      x: this.altar.orbX,
      y: { value: this.altar.orbY, ease: 'Sine.easeIn' },
      duration: AURA.travelMs,
      ease: 'Sine.easeInOut',
      onStart: () => { mote.y = startY; },
      onUpdate: (tween) => {
        // 포물선 부풀림 — 진행 중간에서 가장 높다
        const p = tween.progress;
        mote.y += Math.sin(p * Math.PI) * (midY - startY) * 0.35;
        mote.setScale(1 - 0.5 * p);
      },
      onComplete: () => {
        this._auraAlive = Math.max(0, this._auraAlive - 1);
        mote.destroy();
        this.pulseOrb();
      }
    });
  }

  /**
   * 입자가 도착할 때 구슬이 한 번 밝아진다 — 흐름이 제단에 닿았다는 신호.
   */
  pulseOrb() {
    if (!this.altarCrystalGfx || this._activeTweens >= MAX_CONCURRENT_TWEENS) return;
    const base = altarGlowAlpha(this._manaRatio);
    this.trackTween({
      targets: this.altarCrystalGfx,
      alpha: Math.min(1, base + 0.3),
      duration: 130,
      yoyo: true,
      onComplete: () => this.altarCrystalGfx?.setAlpha(altarGlowAlpha(this._manaRatio))
    });
  }

  /**
   * meditate <-> channel 교차를 예약한다. 마력이 찰수록 잦아진다.
   */
  scheduleChannelPulse() {
    if (!this.scene || !this.scene.time) return;
    const delay = channelPulseDelay(this._manaRatio);
    this.channelTimer = this.scene.time.delayedCall(delay, () => {
      this.channelTimer = null;
      this.playChannelCrossfade();
      this.scheduleChannelPulse();
    });
  }

  /**
   * 치비가 있는 좌석에서 channel 프레임을 겹쳐 페이드했다 되돌린다.
   * 두 스프라이트를 겹쳐 두었기 때문에 프레임이 툭 바뀌지 않고 **교차**된다.
   */
  playChannelCrossfade() {
    if (!this._canAnimate() || this.isHarvesting) return;

    (this.seats || []).forEach((slot) => {
      if (!slot.hero || !slot.chibi || !slot.channelSprite) return;
      if (this._activeTweens >= MAX_CONCURRENT_TWEENS) return;

      this.trackTween({
        targets: slot.channelSprite,
        alpha: { from: 0, to: 1 },
        duration: CHANNEL.fadeMs,
        yoyo: true,
        hold: Math.round(CHANNEL.fadeMs * 0.6),
        ease: 'Sine.easeInOut',
        onComplete: () => slot.channelSprite?.setAlpha(0)
      });
    });
  }

  /**
   * 지금 연출을 만들어도 되는가 — 씬이 살아 있고, 뷰가 보이고, 탭이 앞에 있을 때만.
   * @returns {boolean}
   */
  _canAnimate() {
    if (!this.scene || !this.scene.sys || !this.scene.sys.isActive()) return false;
    if (!this.active || !this.visible) return false;
    if (typeof document !== 'undefined' && document.hidden) return false;
    return true;
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
   * 시뮬레이션 한 틱의 실제 증가분. 게이지 갱신에서 이미 반영되므로 여기서는
   * 다음 오라 입자의 색만 진하게 할 뿐 숫자를 지어내지 않는다.
   * (기존 showDamageText 자리 — 전투 데미지 숫자는 성소에서 띄우지 않는다)
   * @param {number} amount
   */
  addFocusGain(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this._lastGain = amount;
  }

  /**
   * 축적 마력 반영 — 게이지 · 진행률 · 다음 수확까지.
   * @param {number} accumulated 축적 마력 (= 누적 피해)
   * @param {number} required 필요 마력 (= 보스 최대 HP)
   */
  updateMana(accumulated, required) {
    if (!this.currentBoss) return;
    if (Number.isFinite(required) && required > 0) this.requiredMana = required;
    this.storedMana = accumulated;
    this.renderMana(accumulated, this.requiredMana);
    this.updateFocus(accumulated);
  }

  /**
   * 진행률 직접 갱신 (0~1). updateMana 와 같은 값을 받지만 호출부 계약을 유지한다.
   * @param {number} progress
   */
  updateProgress(progress) {
    if (!Number.isFinite(progress)) return;
    this.progressText?.setText(`${Math.floor(Math.max(0, Math.min(1, progress)) * 100)}%`);
  }

  /**
   * 마력 100% — 수확 가능. 배너를 띄우고 제단이 빛기둥을 세운다.
   * (구 showBossReady. 보스전 진입 경로는 MainMenuScene 의 보스 버튼 그대로다)
   */
  showHarvestReady() {
    if (this._readyShown || !this.readyText) return;
    this._readyShown = true;

    this.drawReadyPill();
    this.readyText.setVisible(true).setAlpha(0);
    this.readyPill?.setVisible(true).setAlpha(0);
    this.scene.tweens.add({
      targets: [this.readyText, this.readyPill],
      alpha: 1,
      duration: 260,
      ease: 'Back.easeOut'
    });
    this._readyPulse = this.scene.tweens.add({
      targets: [this.readyText, this.readyPill],
      alpha: { from: 1, to: 0.55 },
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    if (this.lightPillar) {
      this.drawLightPillar(this._accentColor || DESIGN.colors.brand.accent);
      this.lightPillar.setVisible(true).setAlpha(0.45);
      this._pillarTween = this.scene.tweens.add({
        targets: this.lightPillar,
        alpha: { from: 0.45, to: 0.95 },
        duration: HARVEST.pillarMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  /**
   * 수확 준비 연출 해제.
   */
  clearHarvestReady() {
    this._readyShown = false;
    if (this._readyPulse) { this._readyPulse.stop(); this._readyPulse = null; }
    if (this._pillarTween) { this._pillarTween.stop(); this._pillarTween = null; }
    this.readyText?.setVisible(false);
    this.readyPill?.setVisible(false);
    this.lightPillar?.setVisible(false).setAlpha(0);
  }

  /**
   * 수확 완료 연출 (구 showStageClear).
   */
  showHarvestComplete() {
    this.clearHarvestReady();
    this.playAwaken();

    const text = this.scene.add.text(0, s(-this.baseH * 0.06), '수확 완료',
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
   * 스테이지 정보 갱신. 챕터가 바뀌면 성소 배경도 바뀐다.
   * @param {number} chapter
   * @param {number} stage
   * @param {string} name
   */
  updateStageInfo(chapter, stage, name) {
    this.chapter = chapter || 1;
    this.stage = stage || 1;
    this.stageName = name || '';
    this.queueChapterBackdrop(this.chapter);
    this.updateSanctumTitle();
  }

  /**
   * 파티 미편성 안내.
   */
  showEmptyPartyMessage() {
    this.hasParty = false;
    if (this.emptyMessage) return;

    const text = this.scene.add.text(0, 0, LABELS.emptyParty,
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
   * 정리 — 타이머·트윈·지연 호출을 회수하고, **이 뷰가 로드한 치비 시트만** 해제한다.
   * 챕터 배경과 전신 시트는 다른 씬과 공유하므로 남긴다.
   * @param {boolean} fromScene
   */
  destroy(fromScene) {
    this.stopMeditation();
    this.clearHarvestReady();
    this._ambientTweens.forEach((tween) => tween?.stop?.());
    this._ambientTweens = [];
    this._runeTween = null;
    if (this.pendingDelays) {
      this.pendingDelays.forEach((d) => d?.remove?.());
      this.pendingDelays = [];
    }

    const textures = this.scene?.textures;
    const owned = this._ownedChibiKeys.slice();
    this._pendingLoads = [];
    this._ownedChibiKeys = [];

    // 스프라이트를 먼저 파기한 뒤 텍스처를 지운다(반대 순서면 파기 중 텍스처 조회가 터진다)
    super.destroy(fromScene);

    if (textures) {
      owned.forEach((key) => {
        if (textures.exists(key)) textures.remove(key);
      });
    }
  }
}

export default MeditationView;
