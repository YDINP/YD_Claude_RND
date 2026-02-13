import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import transitionManager from '../utils/TransitionManager.js';

// 5-tab bottom navigation configuration
const TABS = [
  { id: 'home', icon: '\u{1F3E0}', label: '\uD648', scene: 'MainMenuScene' },
  { id: 'adventure', icon: '\u2694\uFE0F', label: '\uBAA8\uD5D8', scene: 'StageSelectScene' },
  { id: 'inventory', icon: '\u{1F4E6}', label: '\uAC00\uBC29', scene: 'InventoryScene' },
  { id: 'gacha', icon: '\u{1F3B2}', label: '\uC18C\uD658', scene: 'GachaScene' },
  { id: 'more', icon: '\u2261', label: '\uB354\uBCF4\uAE30', scene: 'SettingsScene' }
];

export class BottomNav extends Phaser.GameObjects.Container {
  constructor(scene, activeTab = 'home') {
    super(scene, GAME_WIDTH / 2, GAME_HEIGHT);

    this.navHeight = 120;
    this.activeTab = activeTab;
    this.tabs = TABS;
    this.tabButtons = {};
    this.onTabChangeCallback = null;

    this.createBackground();
    this.createTabs();
    this.setDepth(1000);

    scene.add.existing(this);
  }

  createBackground() {
    this.background = this.scene.add.graphics();
    this.background.fillStyle(0x0F172A, 0.98);
    this.background.fillRect(-GAME_WIDTH / 2, -this.navHeight, GAME_WIDTH, this.navHeight);
    this.background.lineStyle(2, COLORS.primary, 0.6);
    this.background.lineBetween(-GAME_WIDTH / 2, -this.navHeight, GAME_WIDTH / 2, -this.navHeight);
    this.background.fillStyle(COLORS.primary, 0.05);
    this.background.fillRect(-GAME_WIDTH / 2, -this.navHeight, GAME_WIDTH, 15);
    this.add(this.background);
  }

  createTabs() {
    const tabWidth = GAME_WIDTH / this.tabs.length;
    const startX = -GAME_WIDTH / 2 + tabWidth / 2;

    this.tabs.forEach((tab, index) => {
      const x = startX + index * tabWidth;
      const y = -this.navHeight / 2;
      const isActive = tab.id === this.activeTab;

      const tabContainer = this.createTabButton(x, y, tab, isActive);
      this.tabButtons[tab.id] = tabContainer;
      this.add(tabContainer);
    });
  }

  createTabButton(x, y, tab, isActive) {
    const container = this.scene.add.container(x, y);
    const tabWidth = GAME_WIDTH / this.tabs.length;

    const indicator = this.scene.add.graphics();
    if (isActive) {
      indicator.fillStyle(COLORS.primary, 0.25);
      indicator.fillRoundedRect(-tabWidth / 2 + 8, -50, tabWidth - 16, 100, 12);
      indicator.fillStyle(COLORS.primary, 0.9);
      indicator.fillRect(-25, -54, 50, 3);
    }
    container.add(indicator);
    container.indicator = indicator;

    const iconText = this.scene.add.text(0, -10, tab.icon, { fontSize: '28px' }).setOrigin(0.5);
    container.add(iconText);
    container.iconText = iconText;

    const label = this.scene.add.text(0, 20, tab.label, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '13px',
      fontStyle: isActive ? 'bold' : 'normal',
      color: isActive ? '#FFFFFF' : '#64748B'
    }).setOrigin(0.5);
    container.add(label);
    container.label = label;

    // UIX-3.1: Expanded hit area with top margin (120px height, 15px top margin)
    const hitArea = new Phaser.Geom.Rectangle(-tabWidth / 2, -60 + 15, tabWidth, 120);
    container.setSize(tabWidth, 120);
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => {
      if (tab.id !== this.activeTab) iconText.setScale(1.1);
    });

    container.on('pointerout', () => {
      if (tab.id !== this.activeTab) iconText.setScale(1);
    });

    // UIX-3.1: Press feedback (pointer down)
    container.on('pointerdown', () => {
      // Stop any ongoing tweens
      this.scene.tweens.killTweensOf(container);
      this.scene.tweens.killTweensOf(indicator);

      // Press animation: scale down + brighten background
      this.scene.tweens.add({
        targets: container,
        scaleX: 0.92,
        scaleY: 0.92,
        duration: 100,
        ease: 'Power1'
      });

      // Brighten indicator on press
      indicator.clear();
      if (tab.id === this.activeTab) {
        indicator.fillStyle(COLORS.primary, 0.35); // Brighter when active
        indicator.fillRoundedRect(-tabWidth / 2 + 8, -50, tabWidth - 16, 100, 12);
        indicator.fillStyle(COLORS.primary, 0.9);
        indicator.fillRect(-25, -54, 50, 3);
      } else {
        indicator.fillStyle(COLORS.primary, 0.15); // Subtle feedback when inactive
        indicator.fillRoundedRect(-tabWidth / 2 + 8, -50, tabWidth - 16, 100, 12);
      }
    });

    // UIX-3.1: Release feedback (pointer up)
    container.on('pointerup', () => {
      // Stop any ongoing tweens
      this.scene.tweens.killTweensOf(container);
      this.scene.tweens.killTweensOf(indicator);

      if (tab.id !== this.activeTab) {
        // Navigate to new tab
        this.scene.tweens.add({
          targets: container,
          scaleX: 1.0,
          scaleY: 1.0,
          duration: 150,
          ease: 'Power2.easeOut'
        });

        this.setActiveTab(tab.id);

        if (this.onTabChangeCallback) {
          this.onTabChangeCallback(tab.id, tab.scene);
        } else {
          this.navigateToScene(tab.scene);
        }
      } else {
        // UIX-3.1: Same tab re-click - bounce feedback
        this.scene.tweens.add({
          targets: container,
          scaleX: 0.95,
          scaleY: 0.95,
          duration: 100,
          yoyo: true,
          repeat: 0,
          ease: 'Power1',
          onComplete: () => {
            this.scene.tweens.add({
              targets: container,
              scaleX: 1.05,
              scaleY: 1.05,
              duration: 100,
              yoyo: true,
              repeat: 0,
              ease: 'Power1'
            });
          }
        });

        // Restore indicator brightness
        indicator.clear();
        indicator.fillStyle(COLORS.primary, 0.25);
        indicator.fillRoundedRect(-tabWidth / 2 + 8, -50, tabWidth - 16, 100, 12);
        indicator.fillStyle(COLORS.primary, 0.9);
        indicator.fillRect(-25, -54, 50, 3);
      }
    });

    container.tabData = tab;
    return container;
  }

  navigateToScene(sceneName) {
    const validScenes = ['MainMenuScene', 'StageSelectScene', 'GachaScene', 'HeroListScene', 'InventoryScene', 'PartyEditScene', 'TowerScene', 'QuestScene', 'SettingsScene'];

    if (validScenes.includes(sceneName)) {
      transitionManager.fadeTransition(this.scene, sceneName);
    } else {
      this.showToast('\uC900\uBE44 \uC911\uC785\uB2C8\uB2E4!');
    }
  }

  showToast(message) {
    const toast = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 200, message, {
      fontSize: '18px',
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF',
      backgroundColor: `#${  COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
      padding: { x: 24, y: 14 }
    }).setOrigin(0.5).setDepth(2000);

    this.scene.tweens.add({
      targets: toast,
      y: toast.y - 50,
      alpha: 0,
      duration: 1500,
      delay: 500,
      onComplete: () => toast.destroy()
    });
  }

  setActiveTab(tabId) {
    const tabExists = this.tabs.find(t => t.id === tabId);
    if (!tabExists) return this;

    const previousTabIndex = this.tabs.findIndex(t => t.id === this.activeTab);
    const newTabIndex = this.tabs.findIndex(t => t.id === tabId);

    this.activeTab = tabId;

    this.tabs.forEach((tab) => {
      const tabContainer = this.tabButtons[tab.id];
      if (!tabContainer) return;

      const isActive = tab.id === tabId;
      const tabWidth = GAME_WIDTH / this.tabs.length;

      tabContainer.indicator.clear();
      if (isActive) {
        tabContainer.indicator.fillStyle(COLORS.primary, 0.25);
        tabContainer.indicator.fillRoundedRect(-tabWidth / 2 + 8, -50, tabWidth - 16, 100, 12);
        tabContainer.indicator.fillStyle(COLORS.primary, 0.9);
        tabContainer.indicator.fillRect(-25, -54, 50, 3);
      }

      tabContainer.iconText.setScale(isActive ? 1.15 : 1);
      tabContainer.label.setStyle({
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: '13px',
        fontStyle: isActive ? 'bold' : 'normal',
        color: isActive ? '#FFFFFF' : '#64748B'
      });
    });

    // VFX-4.2: Underline slide animation
    this.animateUnderlineSlide(previousTabIndex, newTabIndex);

    return this;
  }

  /**
   * VFX-4.2: Animate underline sliding from previous tab to new tab
   * @param {number} fromIndex - Previous tab index
   * @param {number} toIndex - New tab index
   */
  animateUnderlineSlide(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex === -1) return;

    const tabWidth = GAME_WIDTH / this.tabs.length;
    const startX = -GAME_WIDTH / 2 + tabWidth / 2;

    const fromX = startX + fromIndex * tabWidth;
    const toX = startX + toIndex * tabWidth;

    // Remove existing underline if present
    if (this.underlineBar) {
      this.underlineBar.destroy();
    }

    // Create sliding underline bar
    this.underlineBar = this.scene.add.graphics();
    this.underlineBar.fillStyle(COLORS.primary, 0.9);
    this.underlineBar.fillRect(fromX - 25, -this.navHeight - 54, 50, 3);
    this.add(this.underlineBar);

    // Animate slide
    this.scene.tweens.add({
      targets: this.underlineBar,
      x: toX - fromX,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        // Clean up temporary underline
        if (this.underlineBar) {
          this.underlineBar.destroy();
          this.underlineBar = null;
        }
      }
    });
  }

  onTabChange(callback) {
    this.onTabChangeCallback = callback;
    return this;
  }

  setBadge(tabId, show, count = 0) {
    const tab = this.tabButtons[tabId];
    if (!tab) return this;

    if (tab.badge) { tab.badge.destroy(); tab.badge = null; }
    if (tab.badgeText) { tab.badgeText.destroy(); tab.badgeText = null; }

    if (show) {
      const badgeX = 18;
      const badgeY = -25;

      const badge = this.scene.add.graphics();
      badge.fillStyle(COLORS.danger, 1);

      if (count > 0) {
        const badgeWidth = count > 99 ? 30 : count > 9 ? 24 : 18;
        badge.fillRoundedRect(badgeX - badgeWidth / 2, badgeY - 9, badgeWidth, 18, 9);

        const badgeText = this.scene.add.text(badgeX, badgeY, count > 99 ? '99+' : count.toString(), {
          fontFamily: '"Noto Sans KR", sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#FFFFFF'
        }).setOrigin(0.5);
        tab.add(badgeText);
        tab.badgeText = badgeText;
      } else {
        badge.fillCircle(badgeX, badgeY, 6);
      }

      tab.add(badge);
      tab.badge = badge;
    }

    return this;
  }

  getHeight() { return this.navHeight; }
  static getNavHeight() { return 120; }
}
