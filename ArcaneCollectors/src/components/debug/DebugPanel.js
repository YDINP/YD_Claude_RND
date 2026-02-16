import { s, sf, GAME_WIDTH, GAME_HEIGHT } from '../../config/scaleConfig.js';
import { DebugManager } from '../../systems/DebugManager.js';
import { DebugStatusBar } from './DebugStatusBar.js';
import { DebugTabContent } from './DebugTabContent.js';

export class DebugPanel {
  constructor(scene) {
    this.scene = scene;
    this.isVisible = false;
    this.currentTab = 0;
    this.elements = [];
    this.tabContent = null;
    this.statusBar = null;
  }

  open(tabIndex = 0) {
    if (this.isVisible) return;
    this.isVisible = true;
    this.currentTab = tabIndex;
    this._create();
  }

  close() {
    if (!this.isVisible) return;
    this.isVisible = false;
    this._destroyAll();
  }

  _create() {
    const panelW = GAME_WIDTH * 0.85;
    const panelH = GAME_HEIGHT * 0.7;
    const panelX = GAME_WIDTH / 2;
    const panelY = GAME_HEIGHT / 2;

    // 딤 배경 (터치 블로킹)
    this.dimBg = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5)
      .setDepth(8499).setInteractive();
    this.dimBg.on('pointerdown', () => this.close());
    this.elements.push(this.dimBg);

    // 패널 컨테이너 배경
    this.panelBg = this.scene.add.rectangle(panelX, panelY, panelW, panelH, 0x0A0A1A, 0.97)
      .setDepth(8500).setInteractive();
    this.panelBg.setStrokeStyle(s(2), 0x6366F1);
    this.elements.push(this.panelBg);

    const topY = panelY - panelH / 2;
    const leftX = panelX - panelW / 2;

    // 헤더
    this.title = this.scene.add.text(panelX, topY + s(20), 'DEBUG PANEL', {
      fontSize: sf(18), fontFamily: 'Arial', color: '#FF4444', fontStyle: 'bold'
    }).setOrigin(0.5, 0).setDepth(8501);
    this.elements.push(this.title);

    // 닫기 버튼
    const closeX = panelX + panelW / 2 - s(25);
    this.closeBtn = this.scene.add.text(closeX, topY + s(18), '\u2715', {
      fontSize: sf(22), fontFamily: 'Arial', color: '#FF4444'
    }).setOrigin(0.5, 0).setDepth(8501).setInteractive({ useHandCursor: true });
    this.closeBtn.on('pointerdown', () => this.close());
    this.elements.push(this.closeBtn);

    // 상태바
    this.statusBar = new DebugStatusBar(this.scene, panelX, topY + s(45), panelW - s(20));
    this.elements.push(this.statusBar);

    // 탭 바
    const tabY = topY + s(80);
    const tabNames = ['\uB9AC\uC18C\uC2A4', '\uCE90\uB9AD\uD130', '\uC804\uD22C', '\uAC00\uCC28', '\uAE30\uD0C0'];
    const tabW = panelW / tabNames.length;

    this.tabBgs = [];
    this.tabTexts = [];
    tabNames.forEach((name, i) => {
      const tx = leftX + tabW * i + tabW / 2;
      const isActive = i === this.currentTab;

      const tabBg = this.scene.add.rectangle(tx, tabY, tabW - s(4), s(32), isActive ? 0x6366F1 : 0x1E293B)
        .setDepth(8501).setInteractive({ useHandCursor: true });
      tabBg.on('pointerdown', () => this._switchTab(i));

      const tabText = this.scene.add.text(tx, tabY, name, {
        fontSize: sf(13), fontFamily: '"Noto Sans KR", Arial', color: isActive ? '#FFFFFF' : '#94A3B8'
      }).setOrigin(0.5).setDepth(8502);

      this.tabBgs.push(tabBg);
      this.tabTexts.push(tabText);
      this.elements.push(tabBg, tabText);
    });

    // 콘텐츠 영역
    const contentY = tabY + s(25);
    const contentH = panelH - s(120);
    this.tabContent = new DebugTabContent(
      this.scene,
      leftX + s(10),
      contentY,
      panelW - s(20),
      contentH,
      this.currentTab
    );
    this.elements.push(this.tabContent);

    // 열기 애니메이션
    this.panelBg.setScale(1, 0);
    this.scene.tweens.add({
      targets: this.panelBg,
      scaleY: 1,
      duration: 200,
      ease: 'Back.easeOut'
    });
  }

  _switchTab(index) {
    if (index === this.currentTab) return;
    this.currentTab = index;

    // 탭 시각 업데이트
    this.tabBgs.forEach((bg, i) => {
      bg.setFillStyle(i === index ? 0x6366F1 : 0x1E293B);
    });
    this.tabTexts.forEach((txt, i) => {
      txt.setColor(i === index ? '#FFFFFF' : '#94A3B8');
    });

    // 콘텐츠 교체
    if (this.tabContent) {
      this.tabContent.destroy();
    }
    const panelW = GAME_WIDTH * 0.85;
    const panelH = GAME_HEIGHT * 0.7;
    const topY = GAME_HEIGHT / 2 - panelH / 2;
    const leftX = GAME_WIDTH / 2 - panelW / 2;
    const contentY = topY + s(80) + s(25);
    const contentH = panelH - s(120);

    this.tabContent = new DebugTabContent(
      this.scene,
      leftX + s(10),
      contentY,
      panelW - s(20),
      contentH,
      index
    );
  }

  _destroyAll() {
    this.elements.forEach(el => {
      if (el && typeof el.destroy === 'function') el.destroy();
    });
    this.elements = [];
    this.tabBgs = [];
    this.tabTexts = [];
    if (this.tabContent) {
      this.tabContent.destroy();
      this.tabContent = null;
    }
    this.statusBar = null;
  }

  destroy() {
    this._destroyAll();
  }
}
