/**
 * GachaBannerPanel.js — 소환 배너 (REDESIGN_PLAN §3-2, T-12)
 *
 * 이전 화면에서 배너 자리는 회색 플레이스홀더 상자였고 그 아래로 720px 이 비어 있었다.
 * 이 컴포넌트가 그 자리를 통째로 채운다. 위에서 아래로 4겹이다.
 *
 *   ① 키 비주얼   banner_pickup_* 일러스트를 cover-fit 후 라운드 사각형으로 마스킹
 *   ② 픽업 전신   픽업 캐릭터의 fullbody 시트를 배너 위에 세운다 (지연 로드)
 *   ③ 페이드 플레이트  하단 34% 를 bg.primary 로 녹여 글자 대비를 만든다
 *   ④ 정보        배너 탭 스트립 · 재화 칩 · 픽업 이름/등급/기간
 *
 * ①②는 asset-manifest 의 lazyTextures / fullbody 버킷이라 **없을 수 있다**.
 * 없으면 교단색 방사 그라디언트와 포트레이트 확대로 내려가고, 레이아웃은 그대로 성립한다.
 *
 * ## 배너 스트립이 표시 전용인 이유
 * `GachaSystem.pull()` 은 배너 인자를 받지 않는다. 뽑기는 전역 풀 하나에서 나오고
 * `determinePickupCharacter()` 는 pull 경로에서 호출되지 않는다. 그래서 스트립 선택은
 * **보여주는 배너만 바꾼다**. 다만 선택 시 `GachaSystem.setCurrentBanner()` 를 불러
 * 시스템이 배너 라우팅을 지원하게 되는 날 UI 는 이미 배선돼 있게 해 둔다.
 *
 * 주의: gameConfig/designSystem 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { s } from '../config/gameConfig.js';
import { DESIGN, getCultColor } from '../config/designSystem.js';
import { ts } from '../utils/textStyles.ts';
import { GlassPanel, GLASS_VARIANT } from './GlassPanel.js';
import { IconFactory } from '../utils/IconFactory.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
import { GachaSystem } from '../systems/GachaSystem.js';
import { SaveManager } from '../systems/SaveManager.js';
import { getCharacterOrHero } from '../data/index.js';
import { resolveFullbodyKey, fullbodyPath, hasFullbodyAsset } from '../utils/heroDetailLayout.js';
import { ensureTextureFromPath, lazyTexturePath } from '../utils/lazyTexture.js';
import PORTRAIT_MAP from '../data/portrait-mapping.json';
import ASSET_MANIFEST from '../../tools/art/asset-manifest.json';
import {
  resolveBannerTextureKey,
  pickFeaturedBanner,
  SUMMON_CIRCLE_TEXTURE,
  bannerChipLabel,
  bannerBadgeLabel,
  coverFitBanner,
  computePickupFit,
  computeStripSlots
} from '../utils/gachaBannerLayout.js';

/** 하단 페이드 플레이트가 차지하는 배너 높이 비율 */
const PLATE_RATIO = 0.36;

/** 페이드 밴드 수. 많을수록 부드럽지만 드로우콜이 는다 */
const FADE_BANDS = 9;

/**
 * 알약(pill) 모서리 반경.
 * `DESIGN.radius.round` 는 9999 라 Graphics.fillRoundedRect 에 그대로 넣으면
 * 경로 생성이 무너져 화면을 가로지르는 막대가 그려진다. 항상 짧은 변의 절반으로 자른다.
 * @param {number} w
 * @param {number} h
 * @returns {number}
 */
function pillRadius(w, h) {
  return Math.max(1, Math.min(w, h) / 2);
}

export class GachaBannerPanel {
  /**
   * @param {Phaser.Scene} scene
   * @param {Object} options
   * @param {number} options.x - 배너 중심 x (렌더 px)
   * @param {number} options.y - 배너 중심 y (렌더 px)
   * @param {number} options.w - 너비 (렌더 px)
   * @param {number} options.h - 높이 (렌더 px)
   * @param {Array<Object>} [options.banners] - 표시할 배너 목록. 기본 활성 배너 전체
   * @param {string} [options.selectedId] - 초기 선택 배너 id
   * @param {boolean} [options.showStrip] - 배너 탭 스트립 표시. 기본 true
   * @param {boolean} [options.showResources] - 재화 칩 표시. 기본 true
   * @param {string} [options.bgKey] - 글래스 백드롭용 배경 텍스처 키
   * @param {Function} [options.onSelect] - 배너 선택 콜백 (bannerId)
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.w = options.w || 0;
    this.h = options.h || 0;
    this.showStrip = options.showStrip !== false;
    this.showResources = options.showResources !== false;
    this.bgKey = options.bgKey || null;
    this.onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;

    this.banners = Array.isArray(options.banners) && options.banners.length > 0
      ? options.banners
      : GachaSystem.getActiveBanners();

    const featured = pickFeaturedBanner(this.banners);
    this.selectedId = options.selectedId || (featured ? featured.id : null);

    this.container = this.scene.add.container(0, 0);
    this.artLayer = this.scene.add.container(0, 0);
    this.infoLayer = this.scene.add.container(0, 0);
    this.stripLayer = this.scene.add.container(0, 0);
    this.container.add([this.artLayer, this.infoLayer, this.stripLayer]);

    this._mask = null;
    this._maskShape = null;
    this._lazyKeys = [];
    this.gemText = null;
    this.ticketText = null;

    this._buildFrame();
    this._buildStrip();
    this.setBanner(this.selectedId);
    this.warmSummonCircle();
  }

  /** 배너 경계 (렌더 px) */
  get bounds() {
    return {
      left: this.x - this.w / 2,
      right: this.x + this.w / 2,
      top: this.y - this.h / 2,
      bottom: this.y + this.h / 2,
      centerX: this.x,
      centerY: this.y
    };
  }

  /** 현재 선택된 배너 객체 */
  get banner() {
    return this.banners.find((b) => b && b.id === this.selectedId) || null;
  }

  /** 현재 배너의 픽업 캐릭터 데이터 (없으면 null) */
  get pickupHero() {
    const banner = this.banner;
    const id = banner && Array.isArray(banner.pickupCharacters) ? banner.pickupCharacters[0] : null;
    return id ? (getCharacterOrHero(id) || null) : null;
  }

  /** 화면 액센트 — 픽업 캐릭터의 교단색. 없으면 brand.accent */
  get accentColor() {
    const hero = this.pickupHero;
    const cult = hero && (hero.cult || hero.cultId);
    return cult ? getCultColor(cult) : DESIGN.colors.brand.accent;
  }

  // ================================================================
  // 구축
  // ================================================================

  /** @private 글래스 표면 + 마스크. 배너 내용물은 전부 이 사각형 안에 갇힌다 */
  _buildFrame() {
    const glass = GlassPanel.create(this.scene, {
      x: this.x, y: this.y, w: this.w, h: this.h,
      variant: GLASS_VARIANT.CARD,
      tint: this.accentColor,
      bgKey: this.bgKey
    });
    this.container.addAt(glass, 0);

    const b = this.bounds;
    const radius = s(DESIGN.radius.lg);
    const shape = this.scene.make.graphics({ add: false });
    shape.fillStyle(0xffffff, 1);
    shape.fillRoundedRect(b.left, b.top, this.w, this.h, radius);
    this._maskShape = shape;
    this._mask = shape.createGeometryMask();
    this.artLayer.setMask(this._mask);
  }

  /**
   * @private 배너 탭 스트립. 활성 배너를 칩으로 늘어놓는다.
   * 선택은 표시만 바꾼다(파일 상단 주석 참고).
   */
  _buildStrip() {
    this.stripLayer.removeAll(true);
    if (!this.showStrip || this.banners.length <= 1) return;

    const b = this.bounds;
    const chipH = s(40);
    const y = b.top + s(30);
    const slots = computeStripSlots(this.banners.length, {
      width: this.w - s(28),
      gap: s(8),
      left: b.left + s(14),
      maxChipW: s(200)
    });

    this._stripChips = slots.map((slot, index) => {
      const banner = this.banners[index];
      const active = banner.id === this.selectedId;

      const bg = this.scene.add.graphics();
      const color = active ? this.accentColor : DESIGN.colors.bg.primary;
      bg.fillStyle(color, active ? 0.9 : 0.62);
      const chipR = pillRadius(slot.w, chipH);
      bg.fillRoundedRect(slot.x, y - chipH / 2, slot.w, chipH, chipR);
      bg.lineStyle(s(1), active ? color : DESIGN.colors.brand.primary, active ? 1 : 0.35);
      bg.strokeRoundedRect(slot.x, y - chipH / 2, slot.w, chipH, chipR);

      const label = this.scene.add.text(slot.centerX, y, bannerChipLabel(banner, 7), ts('caption', {
        color: active ? DESIGN.colors.text.inverse : DESIGN.colors.text.secondary,
        fontStyle: active ? 'bold' : 'normal'
      })).setOrigin(0.5);

      // 히트 영역은 칩보다 크게 잡아 터치 하한(48 base)을 맞춘다
      const hit = this.scene.add.rectangle(
        slot.centerX, y, slot.w, Math.max(chipH, s(DESIGN.touch.minTarget)), 0xffffff, 0
      ).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.setBanner(banner.id));

      this.stripLayer.add([bg, label, hit]);
      return { bg, label, hit, banner };
    });
  }

  /**
   * 표시 배너를 바꾼다.
   * @param {string} bannerId
   * @returns {GachaBannerPanel} this
   */
  setBanner(bannerId) {
    const next = this.banners.find((b) => b && b.id === bannerId);
    this.selectedId = next ? next.id : this.selectedId;

    // 시스템이 배너 라우팅을 지원하게 되면 여기서 이미 현재 배너가 넘어간다
    if (next && typeof GachaSystem.setCurrentBanner === 'function') {
      GachaSystem.setCurrentBanner(next.id);
    }

    this.artLayer.removeAll(true);
    this.infoLayer.removeAll(true);

    this._buildKeyVisual();
    this._buildPickupFigure();
    this._buildPlate();
    this._buildInfo();
    if (this.showResources) this._buildResourceChips();
    this._buildStrip();

    if (this.onSelect && next) this.onSelect(next.id);
    return this;
  }

  /** @private ① 키 비주얼. 텍스처가 없으면 교단색 방사 폴백 */
  _buildKeyVisual() {
    const key = resolveBannerTextureKey(this.banner);

    if (this.scene.textures.exists(key)) {
      this._placeKeyVisual(key);
      return;
    }

    this._buildRadialFallback();
    this._queueLazyTexture(key, () => {
      if (!this.scene.sys?.isActive()) return;
      // 폴백을 지우고 실제 일러스트로 교체한다
      this.artLayer.removeAll(true);
      this._placeKeyVisual(key, true);
      this._buildPickupFigure();
      this._buildPlate();
    });
  }

  /** @private */
  _placeKeyVisual(key, animate = false) {
    const source = this.scene.textures.get(key).getSourceImage();
    const fit = coverFitBanner(source.width, source.height, this.w, this.h);
    const image = this.scene.add.image(this.x, this.y, key)
      .setDisplaySize(fit.width, fit.height)
      .setAlpha(0.9);
    this.artLayer.add(image);
    this.artLayer.sendToBack(image);

    // 키 비주얼 자체에도 인물이 그려져 있다. 전신 시트를 그 위에 세우면 인물이 둘로 읽히므로
    // 키 비주얼을 한 단 눌러 배경으로 물러나게 한다. 합쳐서 한 장면으로 보이게 하는 장치다.
    const veil = this.scene.add.graphics();
    veil.fillStyle(DESIGN.colors.bg.primary, 0.34);
    veil.fillRect(this.bounds.left, this.bounds.top, this.w, this.h);
    this.artLayer.add(veil);

    if (animate) {
      image.setAlpha(0);
      this.scene.tweens.add({ targets: image, alpha: 1, duration: 280, ease: 'Quad.easeOut' });
    }
  }

  /** @private 일러스트가 없을 때의 교단색 방사 그라디언트 + 룬 원 */
  _buildRadialFallback() {
    const color = this.accentColor;
    const g = this.scene.add.graphics();

    g.fillStyle(DESIGN.colors.bg.primary, 1);
    g.fillRect(this.bounds.left, this.bounds.top, this.w, this.h);

    // 중심에서 퍼지는 원 6겹으로 방사 그라디언트를 흉내낸다
    const cx = this.x;
    const cy = this.y - this.h * 0.08;
    for (let i = 6; i >= 1; i--) {
      g.fillStyle(color, 0.04 * i);
      g.fillCircle(cx, cy, (this.h * 0.62 * i) / 6);
    }

    // 룬 원 — 아트가 없어도 "소환대" 라는 장소감은 남는다
    g.lineStyle(s(2), color, 0.35);
    g.strokeCircle(cx, cy, this.h * 0.34);
    g.lineStyle(s(1), color, 0.22);
    g.strokeCircle(cx, cy, this.h * 0.44);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineBetween(
        cx + Math.cos(a) * this.h * 0.34, cy + Math.sin(a) * this.h * 0.34,
        cx + Math.cos(a) * this.h * 0.44, cy + Math.sin(a) * this.h * 0.44
      );
    }

    this.artLayer.add(g);
    this.artLayer.sendToBack(g);
  }

  /** @private ② 픽업 캐릭터 전신. 없으면 포트레이트를 확대해 세운다 */
  _buildPickupFigure() {
    const hero = this.pickupHero;
    if (!hero) return;

    const fbKey = resolveFullbodyKey(hero.id, PORTRAIT_MAP);
    const available = fbKey && hasFullbodyAsset(fbKey, ASSET_MANIFEST.fullbody);

    if (fbKey && this.scene.textures.exists(fbKey)) {
      this._placeFigure(fbKey, true);
      return;
    }

    const portraitKey = HeroAssetLoader.ensureTexture(this.scene, hero);
    if (portraitKey) this._placeFigure(portraitKey, false);

    if (available) {
      this._queueLazyImage(fbKey, fullbodyPath(fbKey), () => {
        if (!this.scene.sys?.isActive()) return;
        if (this._figure) { this._figure.destroy(); this._figure = null; }
        this._placeFigure(fbKey, true, true);
      });
    }
  }

  /** @private */
  _placeFigure(key, isFullbody, animate = false) {
    const source = this.scene.textures.get(key).getSourceImage();
    if (!source || !source.width) return;

    const fit = computePickupFit(source.width, source.height, {
      bannerW: this.w,
      bannerH: this.h,
      heightRatio: isFullbody ? 1.02 : 0.78,
      maxWidthRatio: isFullbody ? 0.78 : 0.56
    });

    const image = this.scene.add.image(
      this.x + this.w * 0.08,
      this.bounds.bottom - s(4),
      key
    ).setOrigin(0.5, 1).setDisplaySize(fit.width, fit.height);

    this.artLayer.add(image);
    this._figure = image;

    if (animate) {
      image.setAlpha(0);
      this.scene.tweens.add({ targets: image, alpha: 1, duration: 320, ease: 'Quad.easeOut' });
    }

    // 아주 느린 호흡. 서 있는 인물이 살아 있다는 최소한의 신호다
    this.scene.tweens.add({
      targets: image,
      y: image.y - s(6),
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /** @private ③ 하단 페이드 플레이트 — 밴드 9겹으로 그라디언트를 흉내낸다 */
  _buildPlate() {
    const b = this.bounds;
    const plateH = this.h * PLATE_RATIO;
    const g = this.scene.add.graphics();
    const bandH = plateH / FADE_BANDS;

    for (let i = 0; i < FADE_BANDS; i++) {
      const alpha = 0.08 + (0.92 * (i + 1)) / FADE_BANDS;
      g.fillStyle(DESIGN.colors.bg.primary, Math.min(alpha, 0.96));
      g.fillRect(b.left, b.bottom - plateH + bandH * i, this.w, bandH + 1);
    }

    this.artLayer.add(g);
  }

  /** @private ④ 픽업 정보 — 등급 배지 · 이름 · 배너명 · 기간 */
  _buildInfo() {
    const b = this.bounds;
    const banner = this.banner;
    const hero = this.pickupHero;
    const accent = this.accentColor;

    const left = b.left + s(24);
    const nameY = b.bottom - s(74);

    // 등급 배지 + 픽업 이름
    const grade = hero ? 'SSR' : (banner && banner.isPermanent ? '상시' : 'PICK');
    const badgeW = s(58);
    const badge = this.scene.add.graphics();
    badge.fillStyle(DESIGN.colors.brand.accent, 1);
    badge.fillRoundedRect(left, nameY - s(17), badgeW, s(34), s(DESIGN.radius.sm));
    this.infoLayer.add(badge);
    this.infoLayer.add(this.scene.add.text(left + badgeW / 2, nameY, grade, ts('num.sm', {
      color: DESIGN.colors.text.inverse, fontStyle: 'bold'
    })).setOrigin(0.5));

    const heroName = hero ? (hero.name || hero.id) : (banner ? banner.name : '소환');
    this.infoLayer.add(this.scene.add.text(left + badgeW + s(14), nameY, heroName, ts('title', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0, 0.5));

    // 배너명 · 상태
    const sub = banner
      ? `${banner.name} · ${bannerBadgeLabel(banner)}`
      : '소환';
    this.infoLayer.add(this.scene.add.text(left, b.bottom - s(34), sub, ts('label', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0, 0.5));

    // 교단색 언더라인 — Cult Tint 가 배너에서도 드러나는 지점
    const rule = this.scene.add.graphics();
    rule.fillStyle(accent, 0.9);
    rule.fillRect(left, b.bottom - s(52), s(180), s(3));
    this.infoLayer.add(rule);
  }

  /** @private 재화 칩 — 배너 우상단. 소환 비용과 같은 화면에 있어야 판단이 선다 */
  _buildResourceChips() {
    const b = this.bounds;
    const resources = SaveManager.getResources();
    // 스트립과 겹치지 않도록 배너 우하단(정보 플레이트 오른쪽 빈 자리)에 놓는다
    const chipY = b.bottom - s(58);

    const build = (rightX, iconType, value, color) => {
      const chipW = s(132);
      const chipH = s(44);
      const left = rightX - chipW;

      const bg = this.scene.add.graphics();
      bg.fillStyle(DESIGN.colors.bg.primary, 0.72);
      const r = pillRadius(chipW, chipH);
      bg.fillRoundedRect(left, chipY - chipH / 2, chipW, chipH, r);
      bg.lineStyle(s(1), color, 0.4);
      bg.strokeRoundedRect(left, chipY - chipH / 2, chipW, chipH, r);
      this.infoLayer.add(bg);

      const iconKey = IconFactory.createIcon(this.scene, iconType, 24);
      if (iconKey) {
        this.infoLayer.add(this.scene.add.image(left + s(22), chipY, iconKey).setDisplaySize(s(22), s(22)));
      }

      const text = this.scene.add.text(rightX - s(14), chipY, value, ts('num.md', {
        color: `#${color.toString(16).padStart(6, '0')}`
      })).setOrigin(1, 0.5);
      this.infoLayer.add(text);
      return text;
    };

    this.ticketText = build(b.right - s(16), 'star', `${resources.summonTickets || 0}`, DESIGN.colors.brand.primary);
    this.gemText = build(b.right - s(16) - s(140), 'gem', (resources.gems || 0).toLocaleString(), DESIGN.colors.brand.accent);
  }

  /** 재화 칩을 최신 세이브 값으로 갱신한다 */
  refreshResources() {
    const resources = SaveManager.getResources();
    if (this.gemText) this.gemText.setText((resources.gems || 0).toLocaleString());
    if (this.ticketText) this.ticketText.setText(`${resources.summonTickets || 0}`);
    return this;
  }

  // ================================================================
  // 지연 로드
  // ================================================================

  /** @private asset-manifest lazyTextures 항목을 로드한다 */
  _queueLazyTexture(key, onDone) {
    this._queueLazyImage(key, lazyTexturePath(ASSET_MANIFEST, key), onDone);
  }

  /**
   * @private 임의 경로 이미지를 로드한다. 실패는 조용히 흡수하고 폴백을 남긴다.
   * 씬 로더가 아니라 lazyTexture 헬퍼를 쓴다 — 로더가 이미 돌고 있으면
   * `scene.load.image()` 로 넣은 파일이 받아지고도 TextureManager 에 등록되지 않는다.
   */
  _queueLazyImage(key, path, onDone) {
    if (!path || this.scene.textures.exists(key)) return;
    if (this._lazyKeys.includes(key)) return;
    this._lazyKeys.push(key);

    ensureTextureFromPath(this.scene, key, path, () => {
      if (this._destroyed) return;
      onDone();
    });
  }

  /**
   * 소환진 텍스처를 미리 받아 둔다. 결과 연출(GachaResultOverlay) 1단계가
   * 바로 시작하므로 소환 화면에 들어온 시점에 데워 두지 않으면 항상 벡터 폴백이 된다.
   */
  warmSummonCircle() {
    this._queueLazyTexture(SUMMON_CIRCLE_TEXTURE, () => {});
    return this;
  }

  /** 컨테이너와 마스크를 정리한다 */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this.artLayer) this.artLayer.clearMask();
    if (this._mask) { this._mask.destroy(); this._mask = null; }
    if (this._maskShape) { this._maskShape.destroy(); this._maskShape = null; }
    if (this.container) { this.container.destroy(true); this.container = null; }
    this._figure = null;
    this.gemText = null;
    this.ticketText = null;
  }
}

export default GachaBannerPanel;
