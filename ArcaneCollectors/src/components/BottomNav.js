import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';

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

    this.navHeight = 80;
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
      indicator.fillRoundedRect(-tabWidth / 2 + 8, -32, tabWidth - 16, 64, 12);
      indicator.fillStyle(COLORS.primary, 0.9);
      indicator.fillRect(-25, -36, 50, 3);
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

    const hitArea = new Phaser.Geom.Rectangle(-tabWidth / 2, -35, tabWidth, 70);
    container.setSize(tabWidth, 70);
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => {
      if (tab.id !== this.activeTab) iconText.setScale(1.1);
    });

    container.on('pointerout', () => {
      if (tab.id !== this.activeTab) iconText.setScale(1);
    });

    container.on('pointerdown', () => {
      if (tab.id !== this.activeTab) {
        this.scene.tweens.add({
          targets: container,
          scaleX: 0.95,
          scaleY: 0.95,
          duration: 50,
          yoyo: true
        });

        this.setActiveTab(tab.id);

        if (this.onTabChangeCallback) {
          this.onTabChangeCallback(tab.id, tab.scene);
        } else {
          this.navigateToScene(tab.scene);
        }
      }
    });

    container.tabData = tab;
    return container;
  }

  navigateToScene(sceneName) {
    const validScenes = ['MainMenuScene', 'StageSelectScene', 'GachaScene', 'HeroListScene', 'InventoryScene', 'PartyEditScene', 'TowerScene', 'QuestScene', 'SettingsScene'];

    if (validScenes.includes(sceneName)) {
      this.scene.cameras.main.fadeOut(200, 0, 0, 0);
      this.scene.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.scene.start(sceneName);
      });
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

    this.activeTab = tabId;

    this.tabs.forEach((tab) => {
      const tabContainer = this.tabButtons[tab.id];
      if (!tabContainer) return;

      const isActive = tab.id === tabId;
      const tabWidth = GAME_WIDTH / this.tabs.length;

      tabContainer.indicator.clear();
      if (isActive) {
        tabContainer.indicator.fillStyle(COLORS.primary, 0.25);
        tabContainer.indicator.fillRoundedRect(-tabWidth / 2 + 8, -32, tabWidth - 16, 64, 12);
        tabContainer.indicator.fillStyle(COLORS.primary, 0.9);
        tabContainer.indicator.fillRect(-25, -36, 50, 3);
      }

      tabContainer.iconText.setScale(isActive ? 1.15 : 1);
      tabContainer.label.setStyle({
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: '13px',
        fontStyle: isActive ? 'bold' : 'normal',
        color: isActive ? '#FFFFFF' : '#64748B'
      });
    });

    return this;
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
  static getNavHeight() { return 80; }
}
