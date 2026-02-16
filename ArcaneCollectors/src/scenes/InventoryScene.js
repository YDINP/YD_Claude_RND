import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../config/gameConfig.js';
import { EquipmentSystem } from '../systems/EquipmentSystem.js';
import { SaveManager } from '../systems/SaveManager.js';
import { getAllItems, getItemsByType } from '../data/index.js';
import transitionManager from '../utils/TransitionManager.js';
import navigationManager from '../systems/NavigationManager.js';

/**
 * InventoryScene - 인벤토리/장비 관리
 * 3탭: 장비(Equipment), 소비(Consumable), 재료(Material)
 */
export class InventoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'InventoryScene' });
  }

  init(data) {
    this.returnTo = data?.returnTo || 'MainMenuScene';
    this.activeTab = data?.tab || 'equipment';
    this.selectedItem = null;
    this.detailOpen = false;
  }

  create() {
    try {
    this.cameras.main.fadeIn(300);

    this.loadInventoryData();
    this.createBackground();
    this.createTopBar();
    this.createTabs();
    this.createItemList();
    this.refreshItemList();
    } catch (error) {
      console.error('[InventoryScene] create() 실패:', error);
      this.add.text(s(360), s(640), '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  loadInventoryData() {
    const saved = SaveManager.load();
    this.inventory = saved?.inventory || [];
    this.equipment = saved?.equipment || [];
    this.gold = this.registry.get('gold') || 0;
  }

  createBackground() {
    const g = this.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const r = y / GAME_HEIGHT;
      const red = Math.floor(15 + r * 8);
      const green = Math.floor(23 + r * 10);
      const blue = Math.floor(42 + r * 12);
      g.fillStyle(Phaser.Display.Color.GetColor(red, green, blue), 1);
      g.fillRect(0, y, GAME_WIDTH, 1);
    }
  }

  createTopBar() {
    // LAYOUT 통일: Top bar background (100px)
    this.add.rectangle(GAME_WIDTH / 2, s(50), GAME_WIDTH, s(100), COLORS.bgDark, 0.9);

    // Back button (좌상단 30, 50 위치, 50×40 터치 영역)
    const backBg = this.add.rectangle(s(30), s(50), s(50), s(40), COLORS.bgDark, 0.8)
      .setInteractive({ useHandCursor: true });
    const backBtn = this.add.text(s(30), s(50), '← 뒤로', {
      fontSize: sf(14), fontFamily: 'Arial', color: '#FFFFFF'
    }).setOrigin(0.5);
    backBg.on('pointerdown', () => this.goBack());

    // 제목
    this.add.text(GAME_WIDTH / 2, s(50), '인벤토리', {
      fontSize: sf(24), fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // 골드 표시
    this.goldText = this.add.text(GAME_WIDTH - s(30), s(38), `🪙 ${this.gold.toLocaleString()}`, {
      fontSize: sf(16), fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(1, 0.5);

    // 아이템 수
    this.countText = this.add.text(GAME_WIDTH - s(30), s(60), '', {
      fontSize: sf(12), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(1, 0.5);
  }

  createTabs() {
    // LAYOUT 통일: 장비 카테고리 탭 (y=120, content 시작)
    const tabs = [
      { key: 'equipment', label: '⚔️ 장비', icon: '⚔️' },
      { key: 'consumable', label: '🧪 소비', icon: '🧪' },
      { key: 'material', label: '🔧 재료', icon: '🔧' }
    ];

    const tabY = s(120);
    const tabW = GAME_WIDTH / tabs.length;

    this.tabElements = [];

    tabs.forEach((tab, i) => {
      const x = tabW / 2 + i * tabW;
      const isActive = tab.key === this.activeTab;

      const bg = this.add.rectangle(x, tabY, tabW - s(4), s(40),
        isActive ? COLORS.primary : COLORS.bgPanel, isActive ? 0.9 : 0.5)
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(x, tabY, tab.label, {
        fontSize: sf(15), fontFamily: 'Arial',
        color: '#FFFFFF',
        fontStyle: isActive ? 'bold' : 'normal'
      }).setOrigin(0.5);

      bg.on('pointerdown', () => this.switchTab(tab.key));

      this.tabElements.push({ bg, label, key: tab.key });
    });
  }

  switchTab(tabKey) {
    this.activeTab = tabKey;

    this.tabElements.forEach(tab => {
      const isActive = tab.key === tabKey;
      tab.bg.setFillStyle(isActive ? COLORS.primary : COLORS.bgPanel, isActive ? 0.9 : 0.5);
      tab.label.setFontStyle(isActive ? 'bold' : 'normal');
    });

    this.refreshItemList();
  }

  createItemList() {
    // LAYOUT 통일: 리스트 영역 정의 (탭 아래 y=160 ~ BottomNav y=1160)
    this.listY = s(160);
    this.listH = GAME_HEIGHT - this.listY - s(140);
    this.itemElements = [];
  }

  refreshItemList() {
    // 기존 아이템 요소 삭제
    this.itemElements.forEach(el => { if (el && el.destroy) el.destroy(); });
    this.itemElements = [];

    let items = [];

    if (this.activeTab === 'equipment') {
      items = this.getEquipmentList();
    } else if (this.activeTab === 'consumable') {
      items = this.getConsumableList();
    } else {
      items = this.getMaterialList();
    }

    this.countText.setText(`${items.length}개`);

    if (items.length === 0) {
      const emptyText = this.add.text(GAME_WIDTH / 2, this.listY + s(100), '아이템이 없습니다', {
        fontSize: sf(16), fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
      this.itemElements.push(emptyText);
      return;
    }

    const itemH = s(75);
    const startY = this.listY + s(10);

    items.forEach((item, i) => {
      const y = startY + i * itemH;
      if (y + itemH > s(1160)) return; // BottomNav(y=1160) 겹침 방지

      const elements = this.createItemRow(item, y, i);
      this.itemElements.push(...elements);
    });
  }

  createItemRow(item, y, index) {
    const elements = [];
    const padX = s(20);

    // 행 배경
    const rowBg = this.add.rectangle(GAME_WIDTH / 2, y + s(30), GAME_WIDTH - padX * 2, s(68),
      index % 2 === 0 ? COLORS.bgLight : COLORS.bgPanel, 0.4)
      .setInteractive({ useHandCursor: true });
    elements.push(rowBg);

    // 등급 색상 아이콘
    const rarityColor = this.getRarityColor(item.rarity);
    const icon = this.add.rectangle(padX + s(28), y + s(30), s(44), s(44), rarityColor, 0.7)
      .setStrokeStyle(s(1), 0xFFFFFF, 0.3);
    elements.push(icon);

    // 장비 슬롯 아이콘
    const slotIcon = this.getSlotIcon(item);
    const iconText = this.add.text(padX + s(28), y + s(30), slotIcon, {
      fontSize: sf(20)
    }).setOrigin(0.5);
    elements.push(iconText);

    // 아이템 이름
    const name = this.add.text(padX + s(65), y + s(18), item.name || item.nameKo || item.id, {
      fontSize: sf(15), fontFamily: 'Arial',
      color: '#FFFFFF', fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    elements.push(name);

    // 부가 정보
    let infoStr = '';
    if (this.activeTab === 'equipment') {
      const level = item.enhanceLevel || 0;
      infoStr = `${item.rarity || 'N'} · ${this.getSlotName(item.slotType)} · +${level}`;
      if (item.equippedBy) infoStr += ' (장착중)';
    } else {
      infoStr = `${item.rarity || 'common'} · 수량: ${item.quantity || 1}`;
    }

    const info = this.add.text(padX + s(65), y + s(40), infoStr, {
      fontSize: sf(12), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0, 0.5);
    elements.push(info);

    // 스탯/효과 요약 (우측)
    const statStr = this.getItemStatSummary(item);
    const statText = this.add.text(GAME_WIDTH - padX - s(10), y + s(30), statStr, {
      fontSize: sf(13), fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
      align: 'right'
    }).setOrigin(1, 0.5);
    elements.push(statText);

    // 탭 시 상세 보기
    rowBg.on('pointerdown', () => this.showItemDetail(item));
    rowBg.on('pointerover', () => rowBg.setFillStyle(COLORS.primary, 0.2));
    rowBg.on('pointerout', () => rowBg.setFillStyle(
      index % 2 === 0 ? COLORS.bgLight : COLORS.bgPanel, 0.4));

    return elements;
  }

  // === 데이터 헬퍼 ===
  getEquipmentList() {
    // SaveManager에서 저장된 장비 목록
    const saved = SaveManager.load();
    const equipment = saved?.equipment || [];

    // items.json의 equipment 타입도 포함
    try {
      const jsonEquip = getItemsByType('equipment') || [];
      // 중복 제거 후 병합 (saved 우선)
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
      // 인벤토리에서 보유 수량 매칭
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

  // === 아이템 상세 모달 ===
  showItemDetail(item) {
    if (this.detailOpen) return;
    this.detailOpen = true;
    this.selectedItem = item;

    // 오버레이
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75)
      .setDepth(80).setInteractive();

    // 패널
    const panelH = this.activeTab === 'equipment' ? s(400) : s(280);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - s(60), panelH, COLORS.bgLight, 0.98)
      .setDepth(81).setStrokeStyle(s(2), this.getRarityColor(item.rarity));

    const cx = GAME_WIDTH / 2;
    const topY = GAME_HEIGHT / 2 - panelH / 2;

    // 닫기
    const closeBtn = this.add.text(cx + (GAME_WIDTH - s(60)) / 2 - s(20), topY + s(20), '✕', {
      fontSize: sf(24), color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(82).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeDetail());

    // 아이템 이름 + 등급
    this.add.text(cx, topY + s(35), `${item.name || item.id}`, {
      fontSize: sf(22), fontFamily: 'Arial',
      color: '#FFFFFF', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82);

    this.add.text(cx, topY + s(62), `${item.rarity || 'common'}`, {
      fontSize: sf(14), fontFamily: 'Arial',
      color: `#${  this.getRarityColor(item.rarity).toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setDepth(82);

    // 설명
    this.add.text(cx, topY + s(90), item.description || '', {
      fontSize: sf(13), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`,
      wordWrap: { width: GAME_WIDTH - s(120) },
      align: 'center'
    }).setOrigin(0.5, 0).setDepth(82);

    if (this.activeTab === 'equipment') {
      this.showEquipmentDetail(item, cx, topY + s(140));
    } else {
      this.showConsumableDetail(item, cx, topY + s(130));
    }
  }

  showEquipmentDetail(item, cx, y) {
    // 스탯 표시
    const stats = item.stats || {};
    const statEntries = Object.entries(stats);

    statEntries.forEach(([key, val], i) => {
      this.add.text(cx - s(100), y + i * s(25), key, {
        fontSize: sf(14), fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setDepth(82);

      this.add.text(cx + s(100), y + i * s(25), `+${val}`, {
        fontSize: sf(14), fontFamily: 'Arial',
        color: `#${  COLORS.success.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(1, 0).setDepth(82);
    });

    // 강화 레벨
    const enhY = y + statEntries.length * s(25) + s(15);
    this.add.text(cx, enhY, `강화: +${item.enhanceLevel || 0}/15`, {
      fontSize: sf(15), fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82);

    // 장착/해제 버튼
    const btnY = enhY + s(45);
    const equipped = !!item.equippedBy;

    const actionBg = this.add.rectangle(cx, btnY, s(180), s(45),
      equipped ? COLORS.danger : COLORS.primary)
      .setDepth(82).setInteractive({ useHandCursor: true });

    this.add.text(cx, btnY, equipped ? '장비 해제' : '장비 장착', {
      fontSize: sf(16), fontFamily: 'Arial',
      color: '#FFFFFF', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82);

    actionBg.on('pointerdown', () => {
      if (equipped) {
        this.unequipItem(item);
      } else {
        this.showToast('영웅 상세에서 장착할 수 있습니다');
      }
      this.closeDetail();
    });
  }

  showConsumableDetail(item, cx, y) {
    this.add.text(cx, y, `보유: ${item.quantity || 0}개`, {
      fontSize: sf(18), fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82);

    if (item.value) {
      this.add.text(cx, y + s(30), `효과: ${item.value}`, {
        fontSize: sf(14), fontFamily: 'Arial',
        color: `#${  COLORS.success.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5).setDepth(82);
    }

    if (item.sellPrice) {
      this.add.text(cx, y + s(55), `판매가: 🪙 ${item.sellPrice}`, {
        fontSize: sf(13), fontFamily: 'Arial',
        color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5).setDepth(82);
    }
  }

  unequipItem(item) {
    if (item.equippedBy) {
      try {
        EquipmentSystem.unequip(item.equippedBy, item.slotType);
        this.showToast('장비 해제 완료');
        this.refreshItemList();
      } catch (e) {
        this.showToast(`해제 실패: ${  e.message}`);
      }
    }
  }

  closeDetail() {
    this.detailOpen = false;
    this.selectedItem = null;
    this.children.list
      .filter(c => c.depth >= 80 && c.depth <= 82)
      .forEach(c => c.destroy());
  }

  goBack() {
    navigationManager.goBack(this);
  }

  shutdown() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, s(1100), message, { // BottomNav(y=1160) 위에 표시
      fontSize: sf(16), fontFamily: 'Arial',
      color: '#FFFFFF',
      backgroundColor: `#${  COLORS.bgPanel.toString(16).padStart(6, '0')}`,
      padding: { x: s(16), y: s(10) }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: toast,
      y: toast.y - s(40),
      alpha: 0,
      duration: 1200,
      delay: 600,
      onComplete: () => toast.destroy()
    });
  }
}
