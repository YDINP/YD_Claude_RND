import { s, sf, GAME_WIDTH } from '../../config/scaleConfig.js';
import { DebugManager } from '../../systems/DebugManager.js';
import { SaveManager } from '../../systems/SaveManager.js';
import energySystem from '../../systems/EnergySystem.js';

export class DebugStatusBar {
  constructor(scene, x, y, width) {
    this.scene = scene;
    this.barX = x;
    this.barY = y;
    this.barWidth = width;
    this._create();
  }

  _create() {
    // 배경
    this.bg = this.scene.add.rectangle(this.barX, this.barY, this.barWidth, s(28), 0x111122, 0.9)
      .setDepth(8501).setOrigin(0.5, 0);

    // 상태 텍스트
    this.text = this.scene.add.text(this.barX, this.barY + s(4), '', {
      fontSize: sf(11), fontFamily: 'monospace', color: '#88ff88'
    }).setOrigin(0.5, 0).setDepth(8502);

    // 500ms 간격 업데이트
    this.updateTimer = this.scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => this.refresh()
    });

    this.refresh();
  }

  refresh() {
    const data = SaveManager.load();
    const gold = this._formatNum(data?.resources?.gold || 0);
    const gems = this._formatNum(data?.resources?.gems || 0);

    let energy = '?';
    try { energy = energySystem.getCurrentEnergy(); } catch (e) { /* fallback */ }

    const fps = Math.round(this.scene.game.loop.actualFps);

    // 활성 플래그
    const flags = [];
    if (DebugManager.invincible) flags.push('GOD');
    if (DebugManager.oneHitKill) flags.push('1HIT');
    if (DebugManager.infiniteEnergy) flags.push('∞EN');
    if (DebugManager.freeGachaMode) flags.push('FREE');
    if (DebugManager.battleSpeedMultiplier > 1) flags.push(`${DebugManager.battleSpeedMultiplier}x`);

    const flagStr = flags.length > 0 ? ` [${flags.join(' ')}]` : '';
    this.text.setText(`G:${gold} 💎${gems} ⚡${energy} FPS:${fps}${flagStr}`);
  }

  _formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
    return String(n);
  }

  destroy() {
    this.bg?.destroy();
    this.text?.destroy();
    this.updateTimer?.destroy();
  }
}
