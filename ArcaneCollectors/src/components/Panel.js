import Phaser from 'phaser';
import { COLORS } from '../config/gameConfig.js';

export class Panel extends Phaser.GameObjects.Container {
  /**
   * Card/Modal panel component
   * @param {Phaser.Scene} scene - The scene this panel belongs to
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} width - Panel width
   * @param {number} height - Panel height
   * @param {Object} options - Configuration options
   */
  constructor(scene, x, y, width, height, options = {}) {
    super(scene, x, y);

    this.panelWidth = width;
    this.panelHeight = height;
    this.options = {
      backgroundColor: options.backgroundColor ?? COLORS.backgroundLight,
      borderColor: options.borderColor ?? null,
      borderWidth: options.borderWidth ?? 2,
      cornerRadius: options.cornerRadius ?? 12,
      title: options.title ?? null,
      titleColor: options.titleColor ?? COLORS.text,
      titleFontSize: options.titleFontSize ?? 20,
      shadowOffset: options.shadowOffset ?? 4,
      shadowAlpha: options.shadowAlpha ?? 0.3
    };

    this.createShadow();
    this.createBackground();
    if (this.options.title) {
      this.createTitleBar();
    }

    scene.add.existing(this);
  }

  createShadow() {
    if (this.options.shadowOffset <= 0) return;

    this.shadow = this.scene.add.graphics();
    this.shadow.fillStyle(0x000000, this.options.shadowAlpha);
    this.shadow.fillRoundedRect(
      -this.panelWidth / 2 + this.options.shadowOffset,
      -this.panelHeight / 2 + this.options.shadowOffset,
      this.panelWidth,
      this.panelHeight,
      this.options.cornerRadius
    );
    this.add(this.shadow);
  }

  createBackground() {
    this.background = this.scene.add.graphics();

    // Fill background with semi-transparency for glassmorphism
    const bgAlpha = this.options.backgroundColor === COLORS.backgroundLight ? 0.85 : 1;
    this.background.fillStyle(this.options.backgroundColor, bgAlpha);
    this.background.fillRoundedRect(
      -this.panelWidth / 2,
      -this.panelHeight / 2,
      this.panelWidth,
      this.panelHeight,
      this.options.cornerRadius
    );

    // Add inner glow for depth
    this.background.fillStyle(0xffffff, 0.05);
    this.background.fillRoundedRect(
      -this.panelWidth / 2 + 2,
      -this.panelHeight / 2 + 2,
      this.panelWidth - 4,
      this.panelHeight * 0.3,
      this.options.cornerRadius
    );

    // Draw border if specified
    if (this.options.borderColor !== null) {
      this.background.lineStyle(this.options.borderWidth, this.options.borderColor, 1);
      this.background.strokeRoundedRect(
        -this.panelWidth / 2,
        -this.panelHeight / 2,
        this.panelWidth,
        this.panelHeight,
        this.options.cornerRadius
      );

      // Subtle outer glow
      this.background.lineStyle(this.options.borderWidth + 2, this.options.borderColor, 0.2);
      this.background.strokeRoundedRect(
        -this.panelWidth / 2 - 1,
        -this.panelHeight / 2 - 1,
        this.panelWidth + 2,
        this.panelHeight + 2,
        this.options.cornerRadius + 1
      );
    }

    this.add(this.background);
  }

  createTitleBar() {
    const titleBarHeight = 40;
    const r = this.options.cornerRadius;

    // Title bar background
    this.titleBar = this.scene.add.graphics();
    this.titleBar.fillStyle(COLORS.primary, 0.3);
    this.titleBar.fillRoundedRect(
      -this.panelWidth / 2,
      -this.panelHeight / 2,
      this.panelWidth,
      titleBarHeight,
      { tl: r, tr: r, bl: 0, br: 0 }
    );

    // Title bar bottom line
    this.titleBar.lineStyle(1, COLORS.primary, 0.5);
    this.titleBar.lineBetween(
      -this.panelWidth / 2,
      -this.panelHeight / 2 + titleBarHeight,
      this.panelWidth / 2,
      -this.panelHeight / 2 + titleBarHeight
    );

    this.add(this.titleBar);

    // Title text
    this.titleText = this.scene.add.text(
      0,
      -this.panelHeight / 2 + titleBarHeight / 2,
      this.options.title,
      {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: `${this.options.titleFontSize}px`,
        fontStyle: 'bold',
        color: Phaser.Display.Color.IntegerToColor(this.options.titleColor).rgba
      }
    ).setOrigin(0.5);

    this.add(this.titleText);
  }

  /**
   * Get the content area bounds (excluding title bar)
   * @returns {Object} { x, y, width, height } of content area
   */
  getContentBounds() {
    const titleOffset = this.options.title ? 40 : 0;
    const padding = 10;

    return {
      x: -this.panelWidth / 2 + padding,
      y: -this.panelHeight / 2 + titleOffset + padding,
      width: this.panelWidth - padding * 2,
      height: this.panelHeight - titleOffset - padding * 2
    };
  }

  /**
   * Update the panel title
   * @param {string} title - New title text
   */
  setTitle(title) {
    if (this.titleText) {
      this.titleText.setText(title);
    }
    return this;
  }

  /**
   * Add a child to the panel content area
   * @param {Phaser.GameObjects.GameObject} child - Child to add
   */
  addContent(child) {
    this.add(child);
    return this;
  }
}
