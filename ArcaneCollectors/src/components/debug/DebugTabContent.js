import { s, sf, GAME_WIDTH } from '../../config/scaleConfig.js';
import { DebugManager } from '../../systems/DebugManager.js';

export class DebugTabContent {
  constructor(scene, x, y, width, height, tabIndex) {
    this.scene = scene;
    this.startX = x;
    this.startY = y;
    this.areaWidth = width;
    this.areaHeight = height;
    this.tabIndex = tabIndex;
    this.elements = [];
    this.scrollY = 0;
    this.maxScroll = 0;
    this._render();
  }

  _getTabButtons() {
    const tabs = [
      // 탭 0: 리소스
      [
        { text: '\uD83D\uDCB0 \uACE8\uB4DC +100K', action: () => DebugManager.addGold(100000) },
        { text: '\uD83D\uDC8E \uC820 +10K', action: () => DebugManager.addGems(10000) },
        { text: '\uD83C\uDFAB \uD2F0\uCF13 +50', action: () => DebugManager.addSummonTickets(50) },
        { text: '\uD83D\uDCE6 \uB9AC\uC18C\uC2A4 MAX', action: () => DebugManager.maxResources() },
      ],
      // 탭 1: 캐릭터
      [
        { text: '\uD83E\uDDB8 \uC804\uCE90\uB9AD \uD574\uAE08', action: () => DebugManager.unlockAllCharacters() },
        { text: '\u2B50 \uC804\uC2A4\uD14C\uC774\uC9C0 \uD074\uB9AC\uC5B4', action: () => DebugManager.clearAllStages() },
        { text: '\uD83D\uDDFC \uD0D1 \uC804\uCE35 \uD074\uB9AC\uC5B4', action: () => DebugManager.clearAllTowerFloors() },
        { text: '\u2705 \uC77C\uC77C\uD038 \uC644\uB8CC', action: () => DebugManager.completeAllDailyQuests() },
        { text: '\u2705 \uC8FC\uAC04\uD038 \uC644\uB8CC', action: () => DebugManager.completeAllWeeklyQuests() },
        { text: '\uD83C\uDF81 \uD038\uC2A4\uD2B8 \uBCF4\uC0C1 \uC218\uB839', action: () => DebugManager.claimAllQuestRewards() },
      ],
      // 탭 2: 전투
      [
        {
          text: () => `\uD83D\uDEE1\uFE0F \uBB34\uC801 ${DebugManager.invincible ? 'ON' : 'OFF'}`,
          action: () => DebugManager.setInvincible(!DebugManager.invincible),
          toggle: true,
          getState: () => DebugManager.invincible,
        },
        {
          text: () => `\u2694\uFE0F \uC6D0\uD0AC ${DebugManager.oneHitKill ? 'ON' : 'OFF'}`,
          action: () => DebugManager.setOneHitKill(!DebugManager.oneHitKill),
          toggle: true,
          getState: () => DebugManager.oneHitKill,
        },
        {
          text: () => `\uD83D\uDE80 \uBC30\uC18D ${DebugManager.battleSpeedMultiplier}x`,
          action: () => {
            const speeds = [1, 2, 3];
            const idx = speeds.indexOf(DebugManager.battleSpeedMultiplier);
            DebugManager.setBattleSpeed(speeds[(idx + 1) % speeds.length]);
          },
          toggle: true,
          getState: () => DebugManager.battleSpeedMultiplier > 1,
        },
        {
          text: () => `\u267E\uFE0F \uBB34\uD55C\uC5D0\uB108\uC9C0 ${DebugManager.infiniteEnergy ? 'ON' : 'OFF'}`,
          action: () => DebugManager.setInfiniteEnergy(!DebugManager.infiniteEnergy),
          toggle: true,
          getState: () => DebugManager.infiniteEnergy,
        },
        { text: '\u26A1 \uC5D0\uB108\uC9C0 \uCDA9\uC804', action: () => DebugManager.refillEnergy() },
      ],
      // 탭 3: 가챠
      [
        {
          text: () => `\uD83C\uDFB2 \uBB34\uB8CC\uAC00\uCC28 ${DebugManager.freeGachaMode ? 'ON' : 'OFF'}`,
          action: () => DebugManager.freeGacha(!DebugManager.freeGachaMode),
          toggle: true,
          getState: () => DebugManager.freeGachaMode,
        },
        { text: '\uD83C\uDFAF \uCC9C\uC7A5\u219289', action: () => DebugManager.setPityCounter(89) },
        { text: '\uD83D\uDC8E \uAC15\uC81C SSR', action: () => DebugManager.setNextPullRarity('SSR') },
        {
          text: () => `\uD83C\uDFAA \uAC15\uC81C\uD53D\uC5C5 ${DebugManager.forcePickupMode ? 'ON' : 'OFF'}`,
          action: () => DebugManager.forcePickup(!DebugManager.forcePickupMode),
          toggle: true,
          getState: () => DebugManager.forcePickupMode,
        },
      ],
      // 탭 4: 기타
      [
        { text: '\uD83D\uDCBE \uC138\uC774\uBE0C \uB0B4\uBCF4\uB0B4\uAE30', action: () => DebugManager.exportSave() },
        {
          text: '\uD83D\uDD04 \uC804\uCCB4 \uCD08\uAE30\uD654',
          action: () => {
            if (confirm('\uC815\uB9D0 \uCD08\uAE30\uD654?')) {
              DebugManager.resetAllData();
              location.reload();
            }
          },
        },
        { text: '\uD83C\uDFE0 \uBA54\uC778\uC73C\uB85C', action: () => this.scene.scene.start('MainMenuScene') },
        { text: '\uD83D\uDD03 \uC528 \uB9AC\uB85C\uB4DC', action: () => this.scene.scene.restart() },
        {
          text: () => `\uD83C\uDFAD \uC0C1\uC131\uC720\uB9AC ${DebugManager.alwaysMoodAdvantage ? 'ON' : 'OFF'}`,
          action: () => DebugManager.setMoodAdvantage(!DebugManager.alwaysMoodAdvantage),
          toggle: true,
          getState: () => DebugManager.alwaysMoodAdvantage,
        },
        { text: '\uD83E\uDD16 \uCD5C\uC801\uD30C\uD2F0', action: () => DebugManager.autoOptimalParty() },
      ],
    ];
    return tabs[this.tabIndex] || [];
  }

  _render() {
    const buttons = this._getTabButtons();
    const cols = 2;
    const btnW = (this.areaWidth - s(10)) / cols;
    const btnH = s(50);
    const gap = s(8);

    buttons.forEach((btn, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = this.startX + col * (btnW + gap) + btnW / 2;
      const y = this.startY + row * (btnH + gap) + btnH / 2;

      const isToggle = btn.toggle;
      const isActive = isToggle && btn.getState?.();

      const btnBg = this.scene.add.rectangle(x, y, btnW - s(4), btnH, isActive ? 0x2D5A27 : 0x222244)
        .setDepth(8510)
        .setInteractive({ useHandCursor: true });

      const labelText = typeof btn.text === 'function' ? btn.text() : btn.text;
      const btnText = this.scene.add.text(x, y, labelText, {
        fontSize: sf(13),
        fontFamily: '"Noto Sans KR", Arial',
        color: '#ffffff',
        wordWrap: { width: btnW - s(16) },
        align: 'center',
      }).setOrigin(0.5).setDepth(8511);

      btnBg.on('pointerdown', () => {
        btn.action();

        // 토글 버튼이면 상태 갱신
        if (isToggle) {
          const newState = btn.getState?.();
          btnBg.setFillStyle(newState ? 0x2D5A27 : 0x222244);
          const newLabel = typeof btn.text === 'function' ? btn.text() : btn.text;
          btnText.setText(newLabel);
        }

        // 클릭 피드백
        btnBg.setFillStyle(0x444488);
        this.scene.time.delayedCall(150, () => {
          if (isToggle) {
            btnBg.setFillStyle(btn.getState?.() ? 0x2D5A27 : 0x222244);
          } else {
            btnBg.setFillStyle(0x222244);
          }
        });
      });

      this.elements.push(btnBg, btnText);
    });

    // 전체 콘텐츠 높이 계산
    const totalRows = Math.ceil(buttons.length / cols);
    const totalH = totalRows * (btnH + gap);
    this.maxScroll = Math.max(0, totalH - this.areaHeight);
  }

  destroy() {
    this.elements.forEach(el => el?.destroy());
    this.elements = [];
  }
}
