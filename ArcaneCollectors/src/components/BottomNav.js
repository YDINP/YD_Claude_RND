import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, LAYOUT, s, sf } from '../config/gameConfig.js';
import transitionManager from '../utils/TransitionManager.js';

// 5-tab bottom navigation configuration
const TABS = [
  { id: 'home', icon: '🏠', iconKey: 'icon_home', label: '홈', scene: 'MainMenuScene' },
  { id: 'gacha', icon: '🎲', iconKey: 'icon_dice', label: '소환', scene: 'GachaScene' },
  { id: 'hero', icon: '🦸', iconKey: 'icon_hero', label: '영웅', scene: 'HeroListScene' },
  { id: 'inventory', icon: '📦', iconKey: 'icon_bag', label: '가방', scene: 'InventoryScene' },
  { id: 'menu', icon: '≡', iconKey: 'icon_menu', label: '메뉴', scene: null }
];

export class BottomNav extends Phaser.GameObjects.Container {
  constructor(scene, activeTab = 'home') {
    super(scene, GAME_WIDTH / 2, LAYOUT.bottomNav.y + s(120) / 2);

    this.navHeight = s(120);
    this.activeTab = activeTab;
    this.tabs = TABS;
    this.tabButtons = {};
    this.onTabChangeCallback = null;
    this.isDrawerOpen = false;
    this.drawerElements = [];

    this.createBackground();
    this.createTabs();
    this.setDepth(1000);

    scene.add.existing(this);
  }

  createBackground() {
    this.background = this.scene.add.graphics();
    this.background.fillStyle(0x0F172A, 0.98);
    this.background.fillRect(-GAME_WIDTH / 2, -this.navHeight / 2, GAME_WIDTH, this.navHeight);
    this.background.lineStyle(s(2), COLORS.primary, 0.6);
    this.background.lineBetween(-GAME_WIDTH / 2, -this.navHeight / 2, GAME_WIDTH / 2, -this.navHeight / 2);
    this.background.fillStyle(COLORS.primary, 0.05);
    this.background.fillRect(-GAME_WIDTH / 2, -this.navHeight / 2, GAME_WIDTH, s(15));
    this.add(this.background);
  }

  createTabs() {
    const tabWidth = GAME_WIDTH / this.tabs.length;
    const startX = -GAME_WIDTH / 2 + tabWidth / 2;

    this.tabs.forEach((tab, index) => {
      const x = startX + index * tabWidth;
      const y = 0;
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
      indicator.fillRoundedRect(-tabWidth / 2 + s(8), s(-50), tabWidth - s(16), s(100), s(12));
      indicator.fillStyle(COLORS.primary, 0.9);
      indicator.fillRect(s(-25), -this.navHeight / 2 + s(3), s(50), s(3));
    }
    container.add(indicator);
    container.indicator = indicator;

    // ART-1: 텍스처 아이콘 사용 (폴백: 이모지)
    let iconObj;
    if (tab.iconKey && this.scene.textures.exists(tab.iconKey)) {
      iconObj = this.scene.add.image(0, s(-15), tab.iconKey).setOrigin(0.5).setDisplaySize(s(32), s(32));
    } else {
      iconObj = this.scene.add.text(0, s(-15), tab.icon, { fontSize: sf(28) }).setOrigin(0.5);
    }
    container.add(iconObj);
    container.iconText = iconObj;

    const label = this.scene.add.text(0, s(20), tab.label, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: sf(12),
      fontStyle: isActive ? 'bold' : 'normal',
      color: isActive ? '#FFFFFF' : '#64748B'
    }).setOrigin(0.5);
    container.add(label);
    container.label = label;

    // hitArea: navHeight 전체 영역 커버
    const hitY = -this.navHeight / 2;
    const hitH = this.navHeight;
    const hitArea = new Phaser.Geom.Rectangle(-tabWidth / 2, hitY, tabWidth, hitH);
    container.setSize(tabWidth, hitH);
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => {
      if (tab.id !== this.activeTab) container.iconText.setScale(1.1);
    });

    container.on('pointerout', () => {
      if (tab.id !== this.activeTab) container.iconText.setScale(1);
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
        indicator.fillRoundedRect(-tabWidth / 2 + s(8), s(-50), tabWidth - s(16), s(100), s(12));
        indicator.fillStyle(COLORS.primary, 0.9);
        indicator.fillRect(s(-25), -this.navHeight / 2 + s(3), s(50), s(3));
      } else {
        indicator.fillStyle(COLORS.primary, 0.15); // Subtle feedback when inactive
        indicator.fillRoundedRect(-tabWidth / 2 + s(8), s(-50), tabWidth - s(16), s(100), s(12));
      }
    });

    // UIX-3.1: Release feedback (pointer up)
    container.on('pointerup', () => {
      // Stop any ongoing tweens
      this.scene.tweens.killTweensOf(container);
      this.scene.tweens.killTweensOf(indicator);

      // Handle menu tab specially
      if (tab.id === 'menu') {
        this.scene.tweens.add({
          targets: container,
          scaleX: 1.0,
          scaleY: 1.0,
          duration: 150,
          ease: 'Power2.easeOut'
        });

        this.toggleDrawer();

        // Restore indicator brightness
        indicator.clear();
        if (this.isDrawerOpen) {
          indicator.fillStyle(COLORS.primary, 0.25);
          indicator.fillRoundedRect(-tabWidth / 2 + s(8), s(-50), tabWidth - s(16), s(100), s(12));
          indicator.fillStyle(COLORS.primary, 0.9);
          indicator.fillRect(s(-25), -this.navHeight / 2 + s(3), s(50), s(3));
        }

        return;
      }

      // If drawer is open and another tab is tapped, close drawer first
      if (this.isDrawerOpen) {
        this.closeDrawer();
      }

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
        indicator.fillRoundedRect(-tabWidth / 2 + s(8), s(-50), tabWidth - s(16), s(100), s(12));
        indicator.fillStyle(COLORS.primary, 0.9);
        indicator.fillRect(s(-25), -this.navHeight / 2 + s(3), s(50), s(3));
      }
    });

    container.tabData = tab;
    return container;
  }

  toggleDrawer() {
    if (this.isDrawerOpen) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  }

  openDrawer() {
    if (this.isDrawerOpen) return;
    this.isDrawerOpen = true;

    // Update menu tab indicator to show active state
    const menuTab = this.tabButtons['menu'];
    if (menuTab) {
      const tabWidth = GAME_WIDTH / this.tabs.length;
      menuTab.indicator.clear();
      menuTab.indicator.fillStyle(COLORS.primary, 0.25);
      menuTab.indicator.fillRoundedRect(-tabWidth / 2 + s(8), s(-50), tabWidth - s(16), s(100), s(12));
      menuTab.indicator.fillStyle(COLORS.primary, 0.9);
      menuTab.indicator.fillRect(s(-25), -this.navHeight / 2 + s(3), s(50), s(3));

      menuTab.iconText.setScale(1.15);
      menuTab.label.setStyle({
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(12),
        fontStyle: 'bold',
        color: '#FFFFFF'
      });
    }

    // Create semi-transparent overlay (above everything except drawer panel)
    const overlay = this.scene.add.rectangle(
      GAME_WIDTH / 2,
      1160 / 2,
      GAME_WIDTH,
      1160,
      0x000000,
      0.6
    );
    overlay.setOrigin(0.5);
    overlay.setDepth(1499);
    overlay.setInteractive();
    overlay.on('pointerup', () => this.closeDrawer());
    this.drawerElements.push(overlay);

    // Create drawer panel
    const panelHeight = s(320);
    const panel = this.scene.add.graphics();
    panel.fillStyle(0x0F172A, 0.98);
    panel.fillRect(0, 0, GAME_WIDTH, panelHeight);
    panel.lineStyle(s(2), COLORS.primary, 0.6);
    panel.lineBetween(0, 0, GAME_WIDTH, 0);

    const panelContainer = this.scene.add.container(0, 1160);
    panelContainer.add(panel);
    panelContainer.setDepth(1500);
    this.drawerElements.push(panelContainer);

    // Drawer menu items (2x2 grid)
    const menuItems = [
      { icon: '👥', label: '파티편성', scene: 'PartyEditScene' },
      { icon: '📜', label: '퀘스트', scene: 'QuestScene' },
      { icon: '🗼', label: '무한탑', scene: 'TowerScene' },
      { icon: '⚙️', label: '설정', scene: 'SettingsScene' }
    ];

    const buttonWidth = s(280);
    const buttonHeight = s(100);
    const spacing = s(40);
    const startX = (GAME_WIDTH - 2 * buttonWidth - spacing) / 2;
    const startY = s(40);

    menuItems.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = startX + col * (buttonWidth + spacing);
      const y = startY + row * (buttonHeight + s(40));

      const btn = this.createDrawerButton(x, y, buttonWidth, buttonHeight, item);
      panelContainer.add(btn);
    });

    // Animate panel sliding up
    this.scene.tweens.add({
      targets: panelContainer,
      y: 840,
      duration: 300,
      ease: 'Power2.easeOut'
    });
  }

  createDrawerButton(x, y, width, height, item) {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(COLORS.primary, 0.15);
    bg.fillRoundedRect(0, 0, width, height, s(12));
    bg.lineStyle(s(2), COLORS.primary, 0.3);
    bg.strokeRoundedRect(0, 0, width, height, s(12));
    container.add(bg);

    const icon = this.scene.add.text(width / 2, height / 2 - s(15), item.icon, {
      fontSize: sf(28)
    }).setOrigin(0.5);
    container.add(icon);

    const label = this.scene.add.text(width / 2, height / 2 + s(20), item.label, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: sf(16),
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);
    container.add(label);

    const hitArea = new Phaser.Geom.Rectangle(0, 0, width, height);
    container.setSize(width, height);
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(COLORS.primary, 0.25);
      bg.fillRoundedRect(0, 0, width, height, s(12));
      bg.lineStyle(s(2), COLORS.primary, 0.5);
      bg.strokeRoundedRect(0, 0, width, height, s(12));
      icon.setScale(1.1);
    });

    container.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(COLORS.primary, 0.15);
      bg.fillRoundedRect(0, 0, width, height, s(12));
      bg.lineStyle(s(2), COLORS.primary, 0.3);
      bg.strokeRoundedRect(0, 0, width, height, s(12));
      icon.setScale(1);
    });

    container.on('pointerdown', () => {
      this.scene.tweens.add({
        targets: container,
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 100,
        ease: 'Power1'
      });
    });

    container.on('pointerup', () => {
      this.scene.tweens.add({
        targets: container,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 100,
        ease: 'Power1',
        onComplete: () => {
          this.closeDrawer();
          this.navigateToScene(item.scene);
        }
      });
    });

    return container;
  }

  closeDrawer() {
    if (!this.isDrawerOpen) return;
    this.isDrawerOpen = false;

    // Update menu tab indicator to show inactive state
    const menuTab = this.tabButtons['menu'];
    if (menuTab && this.activeTab !== 'menu') {
      const tabWidth = GAME_WIDTH / this.tabs.length;
      menuTab.indicator.clear();

      menuTab.iconText.setScale(1);
      menuTab.label.setStyle({
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(12),
        fontStyle: 'normal',
        color: '#64748B'
      });
    }

    // Find panel and animate it down
    const panel = this.drawerElements.find(el => el.type === 'Container');
    if (panel) {
      this.scene.tweens.add({
        targets: panel,
        y: 1160,
        duration: 250,
        ease: 'Power2.easeIn',
        onComplete: () => {
          this.destroyDrawerElements();
        }
      });
    } else {
      this.destroyDrawerElements();
    }
  }

  destroyDrawerElements() {
    this.drawerElements.forEach(el => {
      if (el && !el.scene) return; // Already destroyed
      el.destroy();
    });
    this.drawerElements = [];
  }

  navigateToScene(sceneName) {
    const validScenes = ['MainMenuScene', 'StageSelectScene', 'GachaScene', 'HeroListScene', 'InventoryScene', 'PartyEditScene', 'TowerScene', 'QuestScene', 'SettingsScene'];

    if (validScenes.includes(sceneName)) {
      transitionManager.fadeTransition(this.scene, sceneName);
    } else {
      this.showToast('준비 중입니다!');
    }
  }

  showToast(message) {
    const toast = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(200), message, {
      fontSize: sf(18),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF',
      backgroundColor: `#${COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
      padding: { x: s(24), y: s(14) }
    }).setOrigin(0.5).setDepth(2000);

    this.scene.tweens.add({
      targets: toast,
      y: toast.y - s(50),
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
        tabContainer.indicator.fillRoundedRect(-tabWidth / 2 + s(8), s(-50), tabWidth - s(16), s(100), s(12));
        tabContainer.indicator.fillStyle(COLORS.primary, 0.9);
        tabContainer.indicator.fillRect(s(-25), -this.navHeight / 2 + s(3), s(50), s(3));
      }

      tabContainer.iconText.setScale(isActive ? 1.15 : 1);
      tabContainer.label.setStyle({
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(12),
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
    this.underlineBar.fillRect(fromX - s(25), -this.navHeight / 2 + s(3), s(50), s(3));
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
      const badgeX = s(18);
      const badgeY = s(-25);

      const badge = this.scene.add.graphics();
      badge.fillStyle(COLORS.danger, 1);

      if (count > 0) {
        const badgeWidth = count > 99 ? s(30) : count > 9 ? s(24) : s(18);
        badge.fillRoundedRect(badgeX - badgeWidth / 2, badgeY - s(9), badgeWidth, s(18), s(9));

        const badgeText = this.scene.add.text(badgeX, badgeY, count > 99 ? '99+' : count.toString(), {
          fontFamily: '"Noto Sans KR", sans-serif',
          fontSize: sf(11),
          fontStyle: 'bold',
          color: '#FFFFFF'
        }).setOrigin(0.5);
        tab.add(badgeText);
        tab.badgeText = badgeText;
      } else {
        badge.fillCircle(badgeX, badgeY, s(6));
      }

      tab.add(badge);
      tab.badge = badge;
    }

    return this;
  }

  destroy() {
    if (this.isDrawerOpen) {
      this.destroyDrawerElements();
    }
    super.destroy();
  }

  getHeight() { return this.navHeight; }
  static getNavHeight() { return s(120); }
}
