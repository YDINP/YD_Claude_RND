import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

export class Modal extends Phaser.GameObjects.Container {
  /**
   * Popup modal dialog
   * @param {Phaser.Scene} scene - The scene this modal belongs to
   * @param {Object} options - Configuration options
   */
  constructor(scene, options = {}) {
    super(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2);

    this.options = {
      title: options.title ?? '',
      content: options.content ?? '',
      buttons: options.buttons ?? [{ text: '확인', onClick: () => this.hide() }],
      width: options.width ?? 320,
      height: options.height ?? 240,
      closeOnOverlay: options.closeOnOverlay ?? true,
      showCloseButton: options.showCloseButton ?? false
    };

    this.isVisible = false;
    this.buttonInstances = [];

    this.createOverlay();
    this.createPanel();
    this.createContent();
    this.createButtons();

    if (this.options.showCloseButton) {
      this.createCloseButton();
    }

    // Start hidden
    this.setAlpha(0);
    this.setVisible(false);

    // High depth to appear on top
    this.setDepth(1000);

    scene.add.existing(this);
  }

  createOverlay() {
    this.overlay = this.scene.add.graphics();
    this.overlay.fillStyle(0x000000, 0.7);
    this.overlay.fillRect(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);

    // Make overlay interactive
    const hitArea = new Phaser.Geom.Rectangle(
      -GAME_WIDTH / 2,
      -GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT
    );
    this.overlay.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    if (this.options.closeOnOverlay) {
      this.overlay.on('pointerdown', (pointer) => {
        // Check if clicked outside panel
        const panelBounds = {
          left: -this.options.width / 2,
          right: this.options.width / 2,
          top: -this.options.height / 2,
          bottom: this.options.height / 2
        };

        const localX = pointer.x - this.x;
        const localY = pointer.y - this.y;

        if (localX < panelBounds.left || localX > panelBounds.right ||
            localY < panelBounds.top || localY > panelBounds.bottom) {
          this.hide();
        }
      });
    }

    this.add(this.overlay);
  }

  createPanel() {
    this.panel = new Panel(
      this.scene,
      0,
      0,
      this.options.width,
      this.options.height,
      {
        backgroundColor: COLORS.backgroundLight,
        borderColor: COLORS.primary,
        title: this.options.title || null,
        cornerRadius: 16
      }
    );

    // Remove from scene and add to this container
    this.scene.children.remove(this.panel);
    this.add(this.panel);
  }

  createContent() {
    const contentBounds = this.panel.getContentBounds();
    const buttonAreaHeight = this.options.buttons.length > 0 ? 60 : 0;

    if (typeof this.options.content === 'string') {
      this.contentText = this.scene.add.text(
        0,
        this.options.title ? -10 : 0,
        this.options.content,
        {
          fontFamily: '"Noto Sans KR", sans-serif',
          fontSize: '16px',
          color: '#E2E8F0',
          align: 'center',
          wordWrap: { width: this.options.width - 40 }
        }
      ).setOrigin(0.5);

      this.add(this.contentText);
    } else if (this.options.content instanceof Phaser.GameObjects.GameObject) {
      // Custom content object
      this.add(this.options.content);
    }
  }

  createButtons() {
    const buttonCount = this.options.buttons.length;
    if (buttonCount === 0) return;

    const buttonWidth = Math.min(120, (this.options.width - 40 - (buttonCount - 1) * 10) / buttonCount);
    const buttonHeight = 40;
    const buttonY = this.options.height / 2 - buttonHeight / 2 - 15;
    const totalButtonsWidth = buttonWidth * buttonCount + (buttonCount - 1) * 10;
    const startX = -totalButtonsWidth / 2 + buttonWidth / 2;

    this.options.buttons.forEach((btnConfig, index) => {
      const x = startX + index * (buttonWidth + 10);

      const button = new Button(
        this.scene,
        x,
        buttonY,
        buttonWidth,
        buttonHeight,
        btnConfig.text,
        {
          color: btnConfig.color ?? (index === buttonCount - 1 ? COLORS.primary : COLORS.backgroundLight),
          onClick: () => {
            if (btnConfig.onClick) {
              btnConfig.onClick();
            }
            if (btnConfig.closeOnClick !== false) {
              this.hide();
            }
          }
        }
      );

      // Remove from scene and add to this container
      this.scene.children.remove(button);
      this.add(button);
      this.buttonInstances.push(button);
    });
  }

  createCloseButton() {
    const closeX = this.options.width / 2 - 20;
    const closeY = -this.options.height / 2 + 20;

    this.closeBtn = this.scene.add.graphics();
    this.closeBtn.fillStyle(COLORS.danger, 1);
    this.closeBtn.fillCircle(closeX, closeY, 14);

    // X mark
    this.closeBtn.lineStyle(2, 0xFFFFFF, 1);
    this.closeBtn.lineBetween(closeX - 5, closeY - 5, closeX + 5, closeY + 5);
    this.closeBtn.lineBetween(closeX + 5, closeY - 5, closeX - 5, closeY + 5);

    const hitArea = new Phaser.Geom.Circle(closeX, closeY, 14);
    this.closeBtn.setInteractive(hitArea, Phaser.Geom.Circle.Contains);

    this.closeBtn.on('pointerdown', () => this.hide());

    this.add(this.closeBtn);
  }

  /**
   * Show the modal with animation
   */
  show() {
    if (this.isVisible) return this;

    this.isVisible = true;
    this.setVisible(true);

    // Reset scale and alpha
    this.panel.setScale(0.7);
    this.setAlpha(0);

    // Animate in with enhanced easing
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 250,
      ease: 'Cubic.easeOut'
    });

    this.scene.tweens.add({
      targets: this.panel,
      scaleX: 1,
      scaleY: 1,
      duration: 400,
      ease: 'Back.easeOut'
    });

    // Subtle bounce for buttons
    if (this.buttonInstances.length > 0) {
      this.scene.time.delayedCall(200, () => {
        this.buttonInstances.forEach((btn, index) => {
          this.scene.tweens.add({
            targets: btn,
            scaleX: { from: 0.8, to: 1 },
            scaleY: { from: 0.8, to: 1 },
            duration: 300,
            delay: index * 50,
            ease: 'Back.easeOut'
          });
        });
      });
    }

    this.emit('show');
    return this;
  }

  /**
   * Hide the modal with animation
   */
  hide() {
    if (!this.isVisible) return this;

    // Animate out with smooth transition
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 250,
      ease: 'Cubic.easeIn'
    });

    this.scene.tweens.add({
      targets: this.panel,
      scaleX: 0.7,
      scaleY: 0.7,
      duration: 250,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.isVisible = false;
        this.setVisible(false);
        this.emit('hide');
      }
    });

    return this;
  }

  /**
   * Update modal title
   * @param {string} title - New title
   */
  setTitle(title) {
    this.panel.setTitle(title);
    return this;
  }

  /**
   * Update modal content
   * @param {string} content - New content text
   */
  setContent(content) {
    if (this.contentText) {
      this.contentText.setText(content);
    }
    return this;
  }

  /**
   * Check if modal is visible
   * @returns {boolean}
   */
  isShowing() {
    return this.isVisible;
  }
}
