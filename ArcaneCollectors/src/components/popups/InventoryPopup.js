/**
 * InventoryPopup.js
 * 인벤토리 팝업 - InventoryScene 로직을 팝업으로 변환
 * 3탭: 장비, 소비, 재료
 */
import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, s, sf } from '../../config/gameConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { getItemsByType } from '../../data/index.js';

export class InventoryPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '인벤토리',
      width: s(680),
      height: s(1100),
      ...options
    });

    this.activeTab = 'equipment';
    this.inventory = [];
    this.equipment = [];
    this.gold = 0;

    this.tabElements = [];
    this.itemElements = [];
    this.listContainer = null;
    this.scrollY = 0;
    this.maxScroll = 0;
  }

  buildContent() {
    this.loadData();
    this.createTopInfo();
    this.createTabs();
    this.createItemList();
  }

  loadData() {
    const saved = SaveManager.load();
    this.inventory = saved?.inventory || [];
    this.equipment = saved?.equipment || [];
    this.gold = this.scene.registry?.get('gold') || saved?.resources?.gold || 0;
  }

  createTopInfo() {
    const { centerX, top } = this.contentBounds;

    // Gold display
    this.goldText = this.addText(centerX, top + s(10), `🪙 ${this.gold.toLocaleString()}`, {
      fontSize: sf(16), fontStyle: 'bold', color: '#FFD700'
    });
    this.goldText.setOrigin(0.5);

    // Item count
    this.countText = this.addText(centerX, top + s(35), '', {
      fontSize: sf(14), color: '#94A3B8'
    });
    this.countText.setOrigin(0.5);
  }

  createTabs() {
    const { left, top, width } = this.contentBounds;

    const tabs = [
      { key: 'equipment', label: '⚔️ 장비' },
      { key: 'consumable', label: '🧪 소비' },
      { key: 'material', label: '🔧 재료' }
    ];

    const tabY = top + s(60);
    const tabW = width / tabs.length;

    tabs.forEach((tab, i) => {
      const x = left + i * tabW;
      const isActive = tab.key === this.activeTab;

      const bg = this.scene.add.rectangle(x + tabW / 2, tabY, tabW - s(4), s(40),
        isActive ? COLORS.primary : 0x334155, isActive ? 0.9 : 0.5);
      bg.setInteractive({ useHandCursor: true });

      const label = this.scene.add.text(x + tabW / 2, tabY, tab.label, {
        fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif',
        color: '#FFFFFF', fontStyle: isActive ? 'bold' : 'normal'
      }).setOrigin(0.5);

      bg.on('pointerdown', () => this.switchTab(tab.key));

      this.contentContainer.add([bg, label]);
      this.tabElements.push({ bg, label, key: tab.key });
    });
  }

  switchTab(tabKey) {
    this.activeTab = tabKey;

    // Update tab styles
    this.tabElements.forEach(tab => {
      const isActive = tab.key === tabKey;
      tab.bg.setFillStyle(isActive ? COLORS.primary : 0x334155, isActive ? 0.9 : 0.5);
      tab.label.setFontStyle(isActive ? 'bold' : 'normal');
    });

    this.refreshItemList();
  }

  createItemList() {
    const { left, top, width, height } = this.contentBounds;

    this.listContainer = this.scene.add.container(0, top + s(110));
    this.contentContainer.add(this.listContainer);

    // Mask for scrolling
    const maskShape = this.scene.make.graphics();
    maskShape.fillRect(left, top + s(110), width, height - s(110));
    const mask = maskShape.createGeometryMask();
    this.listContainer.setMask(mask);

    this.refreshItemList();
    this.setupScrolling();
  }

  refreshItemList() {
    if (!this.listContainer) return;
    this.listContainer.removeAll(true);
    this.itemElements = [];

    let items = [];
    if (this.activeTab === 'equipment') {
      items = this.getEquipmentList();
    } else if (this.activeTab === 'consumable') {
      items = this.getConsumableList();
    } else {
      items = this.getMaterialList();
    }

    // Update count
    if (this.countText) {
      this.countText.setText(`${items.length}개`);
    }

    if (items.length === 0) {
      const emptyText = this.scene.add.text(
        this.contentBounds.centerX,
        s(50),
        '아이템이 없습니다',
        {
          fontSize: sf(16),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: '#94A3B8'
        }
      ).setOrigin(0.5);
      this.listContainer.add(emptyText);
      return;
    }

    const itemH = s(75);
    const padX = s(20);

    items.forEach((item, i) => {
      const y = i * itemH;
      const elements = this.createItemRow(item, y, i, padX);
      this.listContainer.add(elements);
      this.itemElements.push(...elements);
    });

    // Update max scroll
    this.maxScroll = Math.max(0, items.length * itemH - (this.contentBounds.height - s(110)));
    this.scrollY = Math.min(this.scrollY, this.maxScroll);
  }

  createItemRow(item, y, index, padX) {
    const elements = [];
    const rowW = this.contentBounds.width - padX * 2;

    // Row background
    const rowBg = this.scene.add.rectangle(
      this.contentBounds.centerX,
      y + s(35),
      rowW,
      s(68),
      index % 2 === 0 ? 0x1E293B : 0x334155,
      0.4
    );
    rowBg.setInteractive({ useHandCursor: true });
    elements.push(rowBg);

    // Icon
    const rarityColor = this.getRarityColor(item.rarity);
    const icon = this.scene.add.rectangle(
      this.contentBounds.left + padX + s(28),
      y + s(35),
      s(44),
      s(44),
      rarityColor,
      0.7
    );
    icon.setStrokeStyle(s(1), 0xFFFFFF, 0.3);
    elements.push(icon);

    // Slot icon
    const slotIcon = this.getSlotIcon(item);
    const iconText = this.scene.add.text(
      this.contentBounds.left + padX + s(28),
      y + s(35),
      slotIcon,
      { fontSize: sf(20) }
    ).setOrigin(0.5);
    elements.push(iconText);

    // Item name
    const name = this.scene.add.text(
      this.contentBounds.left + padX + s(65),
      y + s(23),
      item.name || item.nameKo || item.id,
      {
        fontSize: sf(15),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold',
        color: '#FFFFFF'
      }
    ).setOrigin(0, 0.5);
    elements.push(name);

    // Info line
    let infoStr = '';
    if (this.activeTab === 'equipment') {
      const level = item.enhanceLevel || 0;
      infoStr = `${item.rarity || 'N'} · ${this.getSlotName(item.slotType)} · +${level}`;
      if (item.equippedBy) infoStr += ' (장착중)';
    } else {
      infoStr = `${item.rarity || 'common'} · 수량: ${item.quantity || 1}`;
    }

    const info = this.scene.add.text(
      this.contentBounds.left + padX + s(65),
      y + s(45),
      infoStr,
      {
        fontSize: sf(12),
        fontFamily: 'Arial',
        color: '#94A3B8'
      }
    ).setOrigin(0, 0.5);
    elements.push(info);

    // Stats summary (right side)
    const statStr = this.getItemStatSummary(item);
    const statText = this.scene.add.text(
      this.contentBounds.right - padX - s(10),
      y + s(35),
      statStr,
      {
        fontSize: sf(13),
        fontFamily: 'Arial',
        fontStyle: 'bold',
        color: '#FFD700',
        align: 'right'
      }
    ).setOrigin(1, 0.5);
    elements.push(statText);

    // Hover effect
    rowBg.on('pointerover', () => rowBg.setFillStyle(COLORS.primary, 0.2));
    rowBg.on('pointerout', () =>
      rowBg.setFillStyle(index % 2 === 0 ? 0x1E293B : 0x334155, 0.4)
    );

    // Click handler (simple for now)
    rowBg.on('pointerdown', () => {
      // Future: show item detail popup
      console.log('Item clicked:', item.id);
    });

    return elements;
  }

  getEquipmentList() {
    const saved = SaveManager.load();
    const equipment = saved?.equipment || [];

    try {
      const jsonEquip = getItemsByType('equipment') || [];
      const savedIds = new Set(equipment.map(e => e.id));
      const merged = [...equipment];
      jsonEquip.forEach(e => {
        if (!savedIds.has(e.id)) merged.push(e);
      });
      return merged;
    } catch {
      return equipment;
    }
  }

  getConsumableList() {
    try {
      const items = getItemsByType('consumable') || [];
      const inv = this.inventory || [];
      return items.map(item => {
        const owned = inv.find(i => i.id === item.id);
        return { ...item, quantity: owned?.quantity || 0 };
      }).filter(i => i.quantity > 0);
    } catch {
      return [];
    }
  }

  getMaterialList() {
    try {
      const items = getItemsByType('material') || [];
      const inv = this.inventory || [];
      return items.map(item => {
        const owned = inv.find(i => i.id === item.id);
        return { ...item, quantity: owned?.quantity || 0 };
      }).filter(i => i.quantity > 0);
    } catch {
      return [];
    }
  }

  getRarityColor(rarity) {
    const map = {
      N: COLORS.rarity?.N || 0x9CA3AF,
      R: COLORS.rarity?.R || 0x3B82F6,
      SR: COLORS.rarity?.SR || 0xA855F7,
      SSR: COLORS.rarity?.SSR || 0xF97316,
      common: 0x9CA3AF,
      uncommon: 0x3B82F6,
      rare: 0xA855F7,
      epic: 0xF97316
    };
    return map[rarity] || 0x9CA3AF;
  }

  getSlotIcon(item) {
    if (this.activeTab !== 'equipment') {
      const typeIcons = { consumable: '🧪', material: '🔧', currency: '💎' };
      return typeIcons[item.type] || '📦';
    }
    const icons = { weapon: '⚔️', armor: '🛡️', accessory: '💍', relic: '🔮' };
    return icons[item.slotType] || '📦';
  }

  getSlotName(slotType) {
    const names = { weapon: '무기', armor: '방어구', accessory: '악세서리', relic: '유물' };
    return names[slotType] || slotType || '기타';
  }

  getItemStatSummary(item) {
    if (this.activeTab === 'equipment') {
      const stats = item.stats || {};
      const parts = [];
      if (stats.ATK) parts.push(`ATK+${stats.ATK}`);
      if (stats.HP) parts.push(`HP+${stats.HP}`);
      if (stats.DEF) parts.push(`DEF+${stats.DEF}`);
      if (stats.SPD) parts.push(`SPD+${stats.SPD}`);
      return parts.slice(0, 2).join('\n') || '-';
    }
    if (item.value) return `효과: ${item.value}`;
    return '';
  }

  setupScrolling() {
    const { left, top, width, height } = this.contentBounds;
    const scrollTop = top + s(110);
    const scrollHeight = height - s(110);

    this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (!this.isOpen) return;
      if (pointer.y < scrollTop || pointer.y > scrollTop + scrollHeight) return;
      if (pointer.x < left || pointer.x > left + width) return;

      this.scrollY += deltaY * 0.3;
      this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
      this.updateListPosition();
    });
  }

  updateListPosition() {
    if (this.listContainer) {
      this.listContainer.y = this.contentBounds.top + s(110) - this.scrollY;
    }
  }
}
