/**
 * TurnOrderBar - 턴 순서 표시 바
 * 상단에 각 영웅/적의 행동 순서를 SPD 기반으로 표시
 */
import { COLORS, GAME_WIDTH } from '../../config/gameConfig.js';

export class TurnOrderBar {
  /**
   * @param {Phaser.Scene} scene Phaser 씬
   * @param {number} y Y 좌표
   */
  constructor(scene, y = 70) {
    this.scene = scene;
    this.y = y;
    this.icons = [];
    this.currentTurnIndex = 0;

    console.log('[TurnOrderBar] Creating turn order bar');

    this.container = scene.add.container(0, y).setDepth(15);
    this.create();
  }

  create() {
    // 배경
    this.background = this.scene.add.rectangle(
      GAME_WIDTH / 2, 0,
      GAME_WIDTH - 20, 50,
      COLORS.backgroundLight, 0.9
    );
    this.background.setStrokeStyle(2, COLORS.primary);
    this.container.add(this.background);

    // 라벨
    this.label = this.scene.add.text(20, 0, '턴 순서:', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0, 0.5);
    this.container.add(this.label);
  }

  /**
   * 턴 순서 업데이트
   * @param {Array} battlers 배틀러 배열 (SPD 내림차순 정렬됨)
   * @param {number} currentIndex 현재 턴 인덱스
   */
  update(battlers, currentIndex = 0) {
    console.log(`[TurnOrderBar] Updating with ${battlers.length} battlers, current index: ${currentIndex}`);

    // 기존 아이콘 제거
    this.icons.forEach(icon => {
      if (icon.bg) icon.bg.destroy();
      if (icon.text) icon.text.destroy();
      if (icon.spdText) icon.spdText.destroy();
    });
    this.icons = [];

    this.currentTurnIndex = currentIndex;

    const startX = 90;
    const spacing = 45;
    const maxIcons = Math.min(8, battlers.length);

    battlers.slice(0, maxIcons).forEach((battler, index) => {
      const x = startX + index * spacing;
      const isCurrentTurn = index === currentIndex;
      const isAlly = battler.isAlly !== false && !battler.isEnemy;

      // 아이콘 배경
      const bgColor = isAlly ? COLORS.primary : COLORS.danger;
      const bgSize = isCurrentTurn ? 18 : 15;
      const bg = this.scene.add.circle(x, 0, bgSize, bgColor, isCurrentTurn ? 1 : 0.7);

      if (isCurrentTurn) {
        bg.setStrokeStyle(3, COLORS.accent);

        // 현재 턴 펄스 애니메이션
        this.scene.tweens.add({
          targets: bg,
          scale: 1.2,
          duration: 500,
          yoyo: true,
          repeat: -1
        });
      }

      // 유닛 이름 첫글자
      const initial = battler.name.charAt(0);
      const text = this.scene.add.text(x, 0, initial, {
        fontSize: isCurrentTurn ? '14px' : '11px',
        fontFamily: 'Arial',
        color: '#ffffff',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      // SPD 표시
      const spd = battler.stats?.spd || battler.spd || 0;
      const spdText = this.scene.add.text(x, 20, `${spd}`, {
        fontSize: '8px',
        fontFamily: 'Arial',
        color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      this.container.add([bg, text, spdText]);
      this.icons.push({ bg, text, spdText, battler });
    });

    console.log('[TurnOrderBar] Turn order:', battlers.slice(0, maxIcons).map(b => `${b.name}(${b.stats?.spd || b.spd || 0})`).join(' > '));
  }

  /**
   * 현재 턴 하이라이트
   * @param {number} index 인덱스
   */
  highlightCurrent(index) {
    this.icons.forEach((icon, i) => {
      if (i === index) {
        icon.bg.setStrokeStyle(3, COLORS.accent);
        icon.bg.setScale(1.2);
        icon.text.setFontSize(14);
      } else {
        icon.bg.setStrokeStyle(0);
        icon.bg.setScale(1);
        icon.text.setFontSize(11);
      }
    });
  }

  /**
   * 유닛 제거 (사망 시)
   * @param {string} unitId 유닛 ID
   */
  removeUnit(unitId) {
    const iconIndex = this.icons.findIndex(icon => icon.battler?.id === unitId);
    if (iconIndex !== -1) {
      const icon = this.icons[iconIndex];

      // 페이드아웃 애니메이션
      this.scene.tweens.add({
        targets: [icon.bg, icon.text, icon.spdText],
        alpha: 0,
        duration: 300,
        onComplete: () => {
          icon.bg.destroy();
          icon.text.destroy();
          icon.spdText.destroy();
          this.icons.splice(iconIndex, 1);
        }
      });

      console.log(`[TurnOrderBar] Removed unit: ${unitId}`);
    }
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
    console.log('[TurnOrderBar] Destroying turn order bar');
    this.container.destroy();
  }
}
