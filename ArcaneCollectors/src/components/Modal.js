import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../config/gameConfig.js';
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
      width: options.width ?? s(320),
      height: options.height ?? s(240),
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
        cornerRadius: s(16)
      }
    );

    // Remove from scene and add to this container
    this.scene.children.remove(this.panel);
    this.add(this.panel);
  }

  createContent() {
    const contentBounds = this.panel.getContentBounds();
    const buttonAreaHeight = this.options.buttons.length > 0 ? s(60) : 0;

    if (typeof this.options.content === 'string') {
      this.contentText = this.scene.add.text(
        0,
        this.options.title ? s(-10) : 0,
        this.options.content,
        {
          fontFamily: '"Noto Sans KR", sans-serif',
          fontSize: sf(16),
          color: '#E2E8F0',
          align: 'center',
          wordWrap: { width: this.options.width - s(40) }
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

    const buttonWidth = Math.min(s(120), (this.options.width - s(40) - (buttonCount - 1) * s(10)) / buttonCount);
    const buttonHeight = s(40);
    const buttonY = this.options.height / 2 - buttonHeight / 2 - s(15);
    const totalButtonsWidth = buttonWidth * buttonCount + (buttonCount - 1) * s(10);
    const startX = -totalButtonsWidth / 2 + buttonWidth / 2;

    this.options.buttons.forEach((btnConfig, index) => {
      const x = startX + index * (buttonWidth + s(10));

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

    // PRD VFX-4.7: overlay alpha 0→0.6 (200ms) + panel scale 0.85→1.0 + alpha 0→1 (200ms)
    this.overlay.setAlpha(0);
    this.panel.setScale(0.85);
    this.panel.setAlpha(0);

    // Overlay fade in
    this.scene.tweens.add({
      targets: this.overlay,
      alpha: 1,
      duration: 200,
      ease: 'Power2'
    });

    // Panel scale + alpha
    this.scene.tweens.add({
      targets: this.panel,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 200,
      ease: 'Cubic.easeOut'
    });

    // Content and buttons fade in
    if (this.contentText) {
      this.contentText.setAlpha(0);
      this.scene.tweens.add({
        targets: this.contentText,
        alpha: 1,
        duration: 200,
        delay: 100,
        ease: 'Power2'
      });
    }

    if (this.buttonInstances.length > 0) {
      this.buttonInstances.forEach((btn, index) => {
        btn.setAlpha(0);
        this.scene.tweens.add({
          targets: btn,
          alpha: 1,
          scaleX: { from: 0.85, to: 1 },
          scaleY: { from: 0.85, to: 1 },
          duration: 200,
          delay: 100 + index * 50,
          ease: 'Power2'
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

    // PRD VFX-4.7: panel scale 1.0→0.9 + alpha 1→0 (150ms) + overlay alpha→0 (200ms)
    this.scene.tweens.add({
      targets: this.panel,
      scaleX: 0.9,
      scaleY: 0.9,
      alpha: 0,
      duration: 150,
      ease: 'Cubic.easeIn'
    });

    this.scene.tweens.add({
      targets: this.overlay,
      alpha: 0,
      duration: 200,
      ease: 'Power2',
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
