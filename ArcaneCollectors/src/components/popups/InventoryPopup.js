/**
 * InventoryPopup.js
 * 인벤토리 팝업 - InventoryScene 로직을 팝업으로 변환
 * 3탭: 장비, 소비, 재료
 */
import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, s, sf } from '../../config/gameConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { getItemsByType } from '../../data/index.js';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';
import { IconFactory } from '../../utils/IconFactory.js';

/** 헤더 타이틀 */
const TITLE = '인벤토리';

/** 탭 스트립 높이 + 목록 시작 오프셋 (기획 px) */
const TAB_STRIP_HEIGHT = 44;
const LIST_TOP_OFFSET = TAB_STRIP_HEIGHT + 12;

export class InventoryPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.status.info,
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
    this.setTitle(TITLE);
    this.applySummary(0);
    this.applyActions();
    this.createTabs();
    this.createItemList();
  }

  /** 슬롯 2 — 보유 골드 · 현재 탭 아이템 수 */
  applySummary(itemCount) {
    this.setSummary([
      { label: '골드', value: this.gold.toLocaleString() },
      { label: '보유 아이템', value: `${itemCount}개` }
    ]);
  }

  /** 슬롯 4 — 닫기 */
  applyActions() {
    this.setActions([{ label: '닫기', variant: 'ghost', onClick: () => this.hide() }]);
  }

  loadData() {
    const saved = SaveManager.load();
    this.inventory = saved?.inventory || [];
    this.equipment = saved?.equipment || [];
    this.gold = this.scene.registry?.get('gold') || saved?.resources?.gold || 0;
  }

  createTabs() {
    const { left, top, width } = this.contentBounds;

    const tabs = [
      { key: 'equipment', label: '장비', icon: 'atk' },
      { key: 'consumable', label: '소비', icon: 'hp' },
      { key: 'material', label: '재료', icon: 'inventory' }
    ];

    const tabY = top + s(TAB_STRIP_HEIGHT) / 2;
    const tabW = width / tabs.length;

    tabs.forEach((tab, i) => {
      const x = left + i * tabW;
      const isActive = tab.key === this.activeTab;

      const bg = this.scene.add.rectangle(x + tabW / 2, tabY, tabW - s(4), s(TAB_STRIP_HEIGHT - 8),
        isActive ? DESIGN.colors.status.info : DESIGN.colors.bg.surface, isActive ? 0.9 : 0.5);
      bg.setInteractive({ useHandCursor: true });

      const label = this.scene.add.text(x + tabW / 2 + s(10), tabY, tab.label, {
        fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif',
        color: DESIGN.colors.text.primary, fontStyle: isActive ? 'bold' : 'normal'
      }).setOrigin(0.5);

      // 이모지 대신 벡터 아이콘. 정의가 없는 키는 null 을 돌려주므로 라벨만 남는다
      const icon = IconFactory.createImage(
        this.scene, x + tabW / 2 - s(22), tabY, tab.icon, 'xs',
        { tint: isActive ? DESIGN.colors.text.primary : DESIGN.colors.brand.primary }
      );
      if (icon) this.contentContainer.add(icon);

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
      tab.bg.setFillStyle(isActive ? COLORS.primary : DESIGN.colors.bg.surface, isActive ? 0.9 : 0.5);
      tab.label.setFontStyle(isActive ? 'bold' : 'normal');
    });

    this.refreshItemList();
  }

  createItemList() {
    const { left, top, width, height } = this.contentBounds;

    this.listContainer = this.scene.add.container(0, top + s(LIST_TOP_OFFSET));
    this.contentContainer.add(this.listContainer);

    // Mask for scrolling
    const maskShape = this.scene.make.graphics();
    maskShape.fillRect(left, top + s(LIST_TOP_OFFSET), width, height - s(LIST_TOP_OFFSET));
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

    // 아이템 수는 요약 슬롯(슬롯 2)이 표시한다
    this.applySummary(items.length);

    if (items.length === 0) {
      const emptyText = this.scene.add.text(
        this.contentBounds.centerX,
        s(50),
        '아이템이 없습니다',
        {
          fontSize: sf(16),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: DESIGN.colors.text.secondary
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
    this.maxScroll = Math.max(0, items.length * itemH - (this.contentBounds.height - s(LIST_TOP_OFFSET)));
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
      index % 2 === 0 ? DESIGN.colors.bg.secondary : DESIGN.colors.bg.surface,
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
      { fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.primary }
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
        color: DESIGN.colors.text.primary
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
        color: DESIGN.colors.text.secondary
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
        color: hexToCSS(DESIGN.colors.brand.accent),
        align: 'right'
      }
    ).setOrigin(1, 0.5);
    elements.push(statText);

    // Hover effect
    rowBg.on('pointerover', () => rowBg.setFillStyle(COLORS.primary, 0.2));
    rowBg.on('pointerout', () =>
      rowBg.setFillStyle(index % 2 === 0 ? DESIGN.colors.bg.secondary : DESIGN.colors.bg.surface, 0.4)
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
      const typeLabels = { consumable: '소비', material: '재료', currency: '재화' };
      return typeLabels[item.type] || '기타';
    }
    const labels = { weapon: '무기', armor: '방어', accessory: '악세', relic: '유물' };
    return labels[item.slotType] || '기타';
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
    const scrollTop = top + s(LIST_TOP_OFFSET);
    const scrollHeight = height - s(LIST_TOP_OFFSET);

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
      this.listContainer.y = this.contentBounds.top + s(LIST_TOP_OFFSET) - this.scrollY;
    }
  }
}
