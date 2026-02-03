/**
 * ArcaneCollectors - Energy Bar Component
 * 에너지 표시 UI 컴포넌트
 */

import { ENERGY_UI, UI_STYLES, Z_INDEX } from '../config/layoutConfig.js';

export default class EnergyBar {
    /**
     * EnergyBar 생성자
     * @param {Phaser.Scene} scene - Phaser 씬 인스턴스
     */
    constructor(scene) {
        this.scene = scene;
        this.container = null;
        this.background = null;
        this.fill = null;
        this.border = null;
        this.text = null;
        this.icon = null;

        this.currentEnergy = 0;
        this.maxEnergy = 100;
    }

    /**
     * 에너지 바 생성
     * @param {number} x - X 좌표
     * @param {number} y - Y 좌표
     * @returns {Phaser.GameObjects.Container} 생성된 컨테이너
     */
    create(x, y) {
        this.container = this.scene.add.container(x, y);
        this.container.setDepth(Z_INDEX.UI);

        // 아이콘 생성
        this.createIcon();

        // 배경 생성
        this.createBackground();

        // 채우기 바 생성
        this.createFill();

        // 테두리 생성
        this.createBorder();

        // 텍스트 생성
        this.createText();

        // 초기값 설정
        this.update(this.currentEnergy, this.maxEnergy);

        return this.container;
    }

    /**
     * 에너지 아이콘 생성
     */
    createIcon() {
        this.icon = this.scene.add.text(-ENERGY_UI.BAR_WIDTH / 2 - 30, 0, '⚡', {
            fontSize: '24px'
        });
        this.icon.setOrigin(0.5);
        this.container.add(this.icon);
    }

    /**
     * 배경 바 생성
     */
    createBackground() {
        this.background = this.scene.add.rectangle(
            0,
            0,
            ENERGY_UI.BAR_WIDTH,
            ENERGY_UI.BAR_HEIGHT,
            UI_STYLES.BACKGROUND.SECONDARY
        );
        this.background.setOrigin(0.5);
        this.container.add(this.background);
    }

    /**
     * 채우기 바 생성
     */
    createFill() {
        this.fill = this.scene.add.rectangle(
            -ENERGY_UI.BAR_WIDTH / 2,
            0,
            0,
            ENERGY_UI.BAR_HEIGHT - 4,
            ENERGY_UI.COLORS.HIGH
        );
        this.fill.setOrigin(0, 0.5);
        this.container.add(this.fill);
    }

    /**
     * 테두리 생성
     */
    createBorder() {
        this.border = this.scene.add.rectangle(
            0,
            0,
            ENERGY_UI.BAR_WIDTH,
            ENERGY_UI.BAR_HEIGHT,
            0x000000,
            0
        );
        this.border.setStrokeStyle(2, UI_STYLES.BACKGROUND.ACCENT);
        this.border.setOrigin(0.5);
        this.container.add(this.border);
    }

    /**
     * 에너지 텍스트 생성
     */
    createText() {
        this.text = this.scene.add.text(0, 0, '0/0', {
            fontSize: `${UI_STYLES.FONT_SIZE.SMALL}px`,
            fontFamily: 'Arial, sans-serif',
            color: UI_STYLES.TEXT.PRIMARY,
            fontStyle: 'bold'
        });
        this.text.setOrigin(0.5);
        this.container.add(this.text);
    }

    /**
     * 에너지 바 업데이트
     * @param {number} current - 현재 에너지
     * @param {number} max - 최대 에너지
     */
    update(current, max) {
        this.currentEnergy = Math.max(0, Math.min(current, max));
        this.maxEnergy = Math.max(1, max);

        const ratio = this.currentEnergy / this.maxEnergy;
        const targetWidth = (ENERGY_UI.BAR_WIDTH - 4) * ratio;
        const color = this.getColorForRatio(ratio);

        // 채우기 바 애니메이션
        if (this.fill) {
            this.scene.tweens.add({
                targets: this.fill,
                width: targetWidth,
                duration: 200,
                ease: 'Power2'
            });

            // 색상 변경
            this.fill.setFillStyle(color);
        }

        // 텍스트 업데이트
        if (this.text) {
            this.text.setText(`${this.currentEnergy}/${this.maxEnergy}`);
        }

        // 아이콘 효과 (에너지 부족 시 깜빡임)
        this.updateIconEffect(ratio);
    }

    /**
     * 에너지 비율에 따른 색상 반환
     * @param {number} ratio - 에너지 비율 (0-1)
     * @returns {number} Phaser 색상 값
     */
    getColorForRatio(ratio) {
        if (ratio <= ENERGY_UI.THRESHOLDS.LOW) {
            return ENERGY_UI.COLORS.LOW;      // 빨강 - 부족
        } else if (ratio <= ENERGY_UI.THRESHOLDS.MEDIUM) {
            return ENERGY_UI.COLORS.MEDIUM;   // 주황 - 중간
        } else {
            return ENERGY_UI.COLORS.HIGH;     // 초록 - 충분
        }
    }

    /**
     * 아이콘 효과 업데이트
     * @param {number} ratio - 에너지 비율
     */
    updateIconEffect(ratio) {
        if (!this.icon) return;

        // 기존 애니메이션 제거
        this.scene.tweens.killTweensOf(this.icon);

        if (ratio <= ENERGY_UI.THRESHOLDS.LOW) {
            // 에너지 부족 - 깜빡임 효과
            this.scene.tweens.add({
                targets: this.icon,
                alpha: 0.3,
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        } else {
            // 정상 상태 - 알파값 복원
            this.icon.setAlpha(1);
        }
    }

    /**
     * 에너지 추가
     * @param {number} amount - 추가할 에너지
     */
    addEnergy(amount) {
        this.update(this.currentEnergy + amount, this.maxEnergy);

        // 에너지 획득 효과
        if (amount > 0 && this.icon) {
            this.scene.tweens.add({
                targets: this.icon,
                scaleX: 1.3,
                scaleY: 1.3,
                duration: 100,
                yoyo: true,
                ease: 'Power2'
            });
        }
    }

    /**
     * 에너지 사용
     * @param {number} amount - 사용할 에너지
     * @returns {boolean} 사용 성공 여부
     */
    useEnergy(amount) {
        if (this.currentEnergy >= amount) {
            this.update(this.currentEnergy - amount, this.maxEnergy);

            // 에너지 사용 효과
            this.flashEffect();
            return true;
        }

        // 에너지 부족 효과
        this.shakeEffect();
        return false;
    }

    /**
     * 플래시 효과 (에너지 사용 시)
     */
    flashEffect() {
        if (!this.fill) return;

        this.scene.tweens.add({
            targets: this.fill,
            alpha: 0.5,
            duration: 100,
            yoyo: true,
            ease: 'Power2'
        });
    }

    /**
     * 흔들림 효과 (에너지 부족 시)
     */
    shakeEffect() {
        if (!this.container) return;

        const originalX = this.container.x;

        this.scene.tweens.add({
            targets: this.container,
            x: originalX + 5,
            duration: 50,
            yoyo: true,
            repeat: 3,
            ease: 'Power2',
            onComplete: () => {
                this.container.x = originalX;
            }
        });
    }

    /**
     * 에너지가 충분한지 확인
     * @param {number} required - 필요한 에너지
     * @returns {boolean} 충분 여부
     */
    hasEnergy(required) {
        return this.currentEnergy >= required;
    }

    /**
     * 현재 에너지 비율 반환
     * @returns {number} 에너지 비율 (0-1)
     */
    getRatio() {
        return this.currentEnergy / this.maxEnergy;
    }

    /**
     * 최대 에너지 설정
     * @param {number} max - 새로운 최대 에너지
     */
    setMaxEnergy(max) {
        this.update(this.currentEnergy, max);
    }

    /**
     * 에너지 바 표시/숨김
     * @param {boolean} visible - 표시 여부
     */
    setVisible(visible) {
        if (this.container) {
            this.container.setVisible(visible);
        }
    }

    /**
     * 컴포넌트 제거
     */
    destroy() {
        if (this.icon) {
            this.scene.tweens.killTweensOf(this.icon);
        }
        if (this.fill) {
            this.scene.tweens.killTweensOf(this.fill);
        }
        if (this.container) {
            this.container.destroy(true);
            this.container = null;
        }
    }
}
