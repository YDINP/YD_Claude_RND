/**
 * SynergyDisplay - 시너지 효과 표시 컴포넌트
 * 같은 교단/분위기 영웅 조합 시 버프 표시
 */
import { COLORS, GAME_WIDTH } from '../../config/gameConfig.js';

/**
 * 시너지 타입 정의
 */
const SYNERGY_TYPES = {
  class: {
    warrior: { name: '전사', color: COLORS.danger },
    mage: { name: '마법사', color: COLORS.primary },
    archer: { name: '궁수', color: COLORS.success },
    healer: { name: '힐러', color: COLORS.secondary }
  },
  mood: {
    brave: { name: '열혈', color: 0xE74C3C },
    fierce: { name: '격렬', color: 0xFF5722 },
    wild: { name: '광폭', color: 0x27AE60 },
    calm: { name: '고요', color: 0x3498DB },
    stoic: { name: '의연', color: 0x607D8B },
    devoted: { name: '헌신', color: 0xE91E63 },
    cunning: { name: '냉철', color: 0x9B59B6 },
    noble: { name: '고결', color: 0xFFD700 },
    mystic: { name: '신비', color: 0xF39C12 }
  }
};

export class SynergyDisplay {
  /**
   * @param {Phaser.Scene} scene Phaser 씬
   * @param {number} x X 좌표
   * @param {number} y Y 좌표
   */
  constructor(scene, x = GAME_WIDTH - 100, y = 130) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.buffs = { atk: 0, def: 0, spd: 0 };
    this.activeSynergies = [];

    console.log('[SynergyDisplay] Creating synergy display');

    this.container = scene.add.container(x, y).setDepth(12);
  }

  /**
   * 시너지 계산 및 표시
   * @param {Array} allies 아군 배열
   * @returns {Object} 시너지 버프
   */
  calculate(allies) {
    console.log('[SynergyDisplay] Calculating synergies...');

    // 클래스/분위기 카운트
    const classCounts = {};
    const moodCounts = {};

    allies.forEach(ally => {
      const heroClass = ally.class || 'warrior';
      const mood = ally.mood || 'calm';

      classCounts[heroClass] = (classCounts[heroClass] || 0) + 1;
      moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    });

    // 버프 초기화
    this.buffs = { atk: 0, def: 0, spd: 0 };
    this.activeSynergies = [];

    // 클래스 시너지 계산
    Object.entries(classCounts).forEach(([cls, count]) => {
      if (count >= 2) {
        const synergyInfo = SYNERGY_TYPES.class[cls] || { name: cls, color: COLORS.primary };
        let buff = {};

        if (count >= 4) {
          buff = { atk: 0.20, def: 0.15, spd: 0.10 };
          this.activeSynergies.push({
            type: 'class',
            name: synergyInfo.name,
            count: count,
            tier: 3,
            buff,
            color: synergyInfo.color
          });
        } else if (count >= 3) {
          buff = { atk: 0.15, def: 0.10, spd: 0 };
          this.activeSynergies.push({
            type: 'class',
            name: synergyInfo.name,
            count: count,
            tier: 2,
            buff,
            color: synergyInfo.color
          });
        } else {
          buff = { atk: 0.10, def: 0, spd: 0 };
          this.activeSynergies.push({
            type: 'class',
            name: synergyInfo.name,
            count: count,
            tier: 1,
            buff,
            color: synergyInfo.color
          });
        }

        this.buffs.atk += buff.atk || 0;
        this.buffs.def += buff.def || 0;
        this.buffs.spd += buff.spd || 0;
      }
    });

    // 분위기 시너지 계산
    Object.entries(moodCounts).forEach(([mood, count]) => {
      if (count >= 2) {
        const synergyInfo = SYNERGY_TYPES.mood[mood] || { name: mood, color: COLORS.primary };
        let buff = {};

        if (count >= 3) {
          buff = { atk: 0.10, def: 0, spd: 0 };
          this.activeSynergies.push({
            type: 'mood',
            name: synergyInfo.name,
            count: count,
            tier: 2,
            buff,
            color: synergyInfo.color
          });
        } else {
          buff = { atk: 0, def: 0.05, spd: 0 };
          this.activeSynergies.push({
            type: 'mood',
            name: synergyInfo.name,
            count: count,
            tier: 1,
            buff,
            color: synergyInfo.color
          });
        }

        this.buffs.atk += buff.atk || 0;
        this.buffs.def += buff.def || 0;
        this.buffs.spd += buff.spd || 0;
      }
    });

    console.log('[SynergyDisplay] Active synergies:', this.activeSynergies);
    console.log('[SynergyDisplay] Total buffs:', this.buffs);

    this.render();
    return this.buffs;
  }

  /**
   * UI 렌더링
   */
  render() {
    // 기존 내용 제거
    this.container.removeAll(true);

    // 시너지가 없으면 숨김
    if (this.activeSynergies.length === 0) {
      this.container.setVisible(false);
      return;
    }

    this.container.setVisible(true);

    // 배경 높이 계산
    const bgHeight = 30 + this.activeSynergies.length * 20 + 40;

    // 배경
    const bg = this.scene.add.rectangle(0, bgHeight / 2 - 20, 90, bgHeight, COLORS.backgroundLight, 0.9);
    bg.setStrokeStyle(1, COLORS.accent);
    this.container.add(bg);

    // 타이틀
    const title = this.scene.add.text(0, -5, '시너지', {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.container.add(title);

    // 활성 시너지 목록
    let yOffset = 15;
    this.activeSynergies.forEach(synergy => {
      // 시너지 이름과 카운트
      const tierStars = '★'.repeat(synergy.tier);
      const synergyText = this.scene.add.text(0, yOffset, `${synergy.name}(${synergy.count})${tierStars}`, {
        fontSize: '9px',
        fontFamily: 'Arial',
        color: `#${  synergy.color.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
      this.container.add(synergyText);
      yOffset += 18;
    });

    // 구분선
    yOffset += 5;
    const line = this.scene.add.rectangle(0, yOffset, 70, 1, COLORS.textDark, 0.5);
    this.container.add(line);
    yOffset += 10;

    // 총 버프 표시
    if (this.buffs.atk > 0) {
      const atkText = this.scene.add.text(0, yOffset, `ATK +${Math.round(this.buffs.atk * 100)}%`, {
        fontSize: '9px',
        fontFamily: 'Arial',
        color: `#${  COLORS.danger.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.container.add(atkText);
      yOffset += 12;
    }

    if (this.buffs.def > 0) {
      const defText = this.scene.add.text(0, yOffset, `DEF +${Math.round(this.buffs.def * 100)}%`, {
        fontSize: '9px',
        fontFamily: 'Arial',
        color: `#${  COLORS.primary.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.container.add(defText);
      yOffset += 12;
    }

    if (this.buffs.spd > 0) {
      const spdText = this.scene.add.text(0, yOffset, `SPD +${Math.round(this.buffs.spd * 100)}%`, {
        fontSize: '9px',
        fontFamily: 'Arial',
        color: `#${  COLORS.success.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.container.add(spdText);
    }

    // 입장 애니메이션
    this.container.setAlpha(0);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 500
    });
  }

  /**
   * 버프 가져오기
   */
  getBuffs() {
    return { ...this.buffs };
  }

  /**
   * 활성 시너지 가져오기
   */
  getActiveSynergies() {
    return [...this.activeSynergies];
  }

  /**
   * 표시/숨김
   * @param {boolean} visible 표시 여부
   */
  setVisible(visible) {
    this.container.setVisible(visible);
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
    console.log('[SynergyDisplay] Destroying synergy display');
    this.container.destroy();
  }
}
