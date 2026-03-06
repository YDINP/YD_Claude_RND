/**
 * SkillCard - 스킬 카드 컴포넌트
 * 전투 UI 하단에 표시되는 영웅별 스킬 카드
 */
import { COLORS, s, sf } from '../../config/gameConfig.js';

export class SkillCard {
  /**
   * @param {Phaser.Scene} scene Phaser 씬
   * @param {number} x X 좌표
   * @param {number} y Y 좌표
   * @param {Object} hero 영웅 데이터
   * @param {number} index 인덱스
   */
  constructor(scene, x, y, hero, index) {
    this.scene = scene;
    this.hero = hero;
    this.index = index;
    this.isReady = false;
    this.isSelected = false;

    console.log(`[SkillCard] Creating skill card for ${hero.name}`);

    this.container = scene.add.container(x, y);
    this.create();
  }

  create() {
    const gaugePercent = this.hero.skillGauge / this.hero.maxSkillGauge;
    this.isReady = this.hero.skillGauge >= this.hero.maxSkillGauge;

    // 카드 배경
    this.cardBg = this.scene.add.rectangle(0, 0, s(65), s(50),
      this.isReady ? COLORS.secondary : COLORS.backgroundLight,
      this.isReady ? 1 : 0.7
    );
    this.cardBg.setStrokeStyle(s(2), this.isReady ? COLORS.accent : COLORS.primary);

    // 영웅 이름
    const heroName = this.hero.name.length > 4 ? this.hero.name.substring(0, 4) : this.hero.name;
    this.nameText = this.scene.add.text(0, s(-15), heroName, {
      fontSize: sf(10),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 스킬 게이지 바 배경
    this.gaugeBg = this.scene.add.rectangle(0, s(5), s(55), s(6), 0x333333, 1);

    // 스킬 게이지 바 채우기
    this.gaugeFill = this.scene.add.rectangle(s(-27.5), s(5), s(55) * gaugePercent, s(4),
      this.isReady ? COLORS.accent : COLORS.secondary, 1
    );
    this.gaugeFill.setOrigin(0, 0.5);

    // 게이지 텍스트
    this.gaugeText = this.scene.add.text(0, s(17), `${this.hero.skillGauge}/${this.hero.maxSkillGauge}`, {
      fontSize: sf(8),
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 스킬 아이콘 (준비 완료 시)
    if (this.isReady) {
      this.skillIcon = this.scene.add.text(0, s(-2), 'SKILL', {
        fontSize: sf(8),
        fontFamily: 'Arial',
        color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.container.add(this.skillIcon);

      // 반짝임 애니메이션
      this.shimmerTween = this.scene.tweens.add({
        targets: this.cardBg,
        alpha: 0.7,
        duration: 500,
        yoyo: true,
        repeat: -1
      });
    }

    this.container.add([this.cardBg, this.nameText, this.gaugeBg, this.gaugeFill, this.gaugeText]);
  }

  /**
   * 스킬 게이지 업데이트
   * @param {number} gauge 현재 게이지
   */
  updateGauge(gauge) {
    this.hero.skillGauge = gauge;
    const gaugePercent = gauge / this.hero.maxSkillGauge;
    const wasReady = this.isReady;
    this.isReady = gauge >= this.hero.maxSkillGauge;

    // 게이지 바 애니메이션
    this.scene.tweens.add({
      targets: this.gaugeFill,
      width: s(55) * gaugePercent,
      duration: 200
    });

    // 게이지 텍스트 업데이트
    this.gaugeText.setText(`${gauge}/${this.hero.maxSkillGauge}`);

    // 상태 변경 시 스타일 업데이트
    if (this.isReady !== wasReady) {
      this.cardBg.setFillStyle(this.isReady ? COLORS.secondary : COLORS.backgroundLight, this.isReady ? 1 : 0.7);
      this.cardBg.setStrokeStyle(s(2), this.isReady ? COLORS.accent : COLORS.primary);
      this.gaugeFill.setFillStyle(this.isReady ? COLORS.accent : COLORS.secondary, 1);

      if (this.isReady && !this.skillIcon) {
        this.skillIcon = this.scene.add.text(0, s(-2), 'SKILL', {
          fontSize: sf(8),
          fontFamily: 'Arial',
          color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
          fontStyle: 'bold'
        }).setOrigin(0.5);
        this.container.add(this.skillIcon);
      } else if (!this.isReady && this.skillIcon) {
        this.skillIcon.destroy();
        this.skillIcon = null;
      }
    }

    console.log(`[SkillCard] ${this.hero.name} gauge updated: ${gauge}/${this.hero.maxSkillGauge}`);
  }

  /**
   * 인터랙티브 설정
   * @param {Function} callback 클릭 콜백
   */
  setInteractive(callback) {
    if (!this.isReady) return;

    this.cardBg.setInteractive({ useHandCursor: true });
    this.cardBg.on('pointerdown', () => {
      if (this.isReady && this.hero.isAlive) {
        console.log(`[SkillCard] ${this.hero.name} skill card clicked`);
        callback(this.hero, this.index);
      }
    });

    this.cardBg.on('pointerover', () => {
      this.cardBg.setScale(1.1);
    });

    this.cardBg.on('pointerout', () => {
      this.cardBg.setScale(1);
    });
  }

  /**
   * 선택 상태 설정
   * @param {boolean} selected 선택 여부
   */
  setSelected(selected) {
    this.isSelected = selected;
    if (selected) {
      this.cardBg.setStrokeStyle(s(3), 0xffffff);
      this.container.setScale(1.1);
    } else {
      this.cardBg.setStrokeStyle(s(2), this.isReady ? COLORS.accent : COLORS.primary);
      this.container.setScale(1);
    }
  }

  /**
   * 비활성화
   */
  disable() {
    this.cardBg.setAlpha(0.5);
    this.cardBg.removeInteractive();
  }

  /**
   * 활성화
   */
  enable() {
    this.cardBg.setAlpha(1);
    if (this.isReady) {
      this.cardBg.setInteractive({ useHandCursor: true });
    }
  }

  /**
   * 컨테이너 가져오기
   */
  getContainer() {
    return this.container;
  }

  /**
   * 파괴
   */
  destroy() {
    console.log(`[SkillCard] Destroying skill card for ${this.hero.name}`);
    if (this.shimmerTween) {
      this.shimmerTween.stop();
      this.shimmerTween = null;
    }
    this.container.destroy();
  }
}
