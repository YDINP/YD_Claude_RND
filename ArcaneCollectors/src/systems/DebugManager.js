/**
 * DebugManager - 개발/테스트용 치트 기능
 * 디버그 모드에서만 활성화
 */
export class DebugManager {
  static isDebugMode = false;
  static invincible = false;
  static oneHitKill = false;
  static battleSpeedMultiplier = 1;

  /**
   * 디버그 모드 활성화/비활성화
   * @param {boolean} enabled 활성화 여부
   */
  static setDebugMode(enabled) {
    this.isDebugMode = enabled;
    this.log('System', `Debug mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  // ========== 리소스 치트 ==========

  /**
   * 골드 추가
   * @param {number} amount 추가할 양
   */
  static addGold(amount) {
    if (!this.isDebugMode) return false;

    const { SaveManager } = require('./SaveManager.js');
    SaveManager.addGold(amount);
    this.log('Cheat', `Added ${amount} gold`);
    return true;
  }

  /**
   * 젬 추가
   * @param {number} amount 추가할 양
   */
  static addGems(amount) {
    if (!this.isDebugMode) return false;

    const { SaveManager } = require('./SaveManager.js');
    SaveManager.addGems(amount);
    this.log('Cheat', `Added ${amount} gems`);
    return true;
  }

  /**
   * 소환 티켓 추가
   * @param {number} amount 추가할 양
   */
  static addSummonTickets(amount) {
    if (!this.isDebugMode) return false;

    const { SaveManager } = require('./SaveManager.js');
    SaveManager.addSummonTickets(amount);
    this.log('Cheat', `Added ${amount} summon tickets`);
    return true;
  }

  /**
   * 모든 리소스 최대치 부여
   */
  static maxResources() {
    if (!this.isDebugMode) return false;

    this.addGold(9999999);
    this.addGems(999999);
    this.addSummonTickets(999);
    this.log('Cheat', 'All resources set to maximum');
    return true;
  }

  // ========== 캐릭터 치트 ==========

  /**
   * 모든 캐릭터 해금
   */
  static unlockAllCharacters() {
    if (!this.isDebugMode) return false;

    const { SaveManager } = require('./SaveManager.js');
    const { getAllCharacters } = require('../data/index.js');

    const allCharacters = getAllCharacters();
    allCharacters.forEach(char => {
      SaveManager.addCharacter(char.id, 1);
    });

    this.log('Cheat', `All ${allCharacters.length} characters unlocked`);
    return true;
  }

  /**
   * 캐릭터 레벨 설정
   * @param {string} charId 캐릭터 ID
   * @param {number} level 레벨
   */
  static setCharacterLevel(charId, level) {
    if (!this.isDebugMode) return false;

    const { SaveManager } = require('./SaveManager.js');
    const character = SaveManager.getCharacter(charId);

    if (!character) {
      this.log('Error', `Character ${charId} not found`);
      return false;
    }

    SaveManager.updateCharacter(charId, { level, exp: 0 });
    this.log('Cheat', `Set ${charId} to level ${level}`);
    return true;
  }

  /**
   * 캐릭터 모든 스킬 최대 레벨
   * @param {string} charId 캐릭터 ID
   */
  static maxAllSkills(charId) {
    if (!this.isDebugMode) return false;

    const { SaveManager } = require('./SaveManager.js');
    const character = SaveManager.getCharacter(charId);

    if (!character) {
      this.log('Error', `Character ${charId} not found`);
      return false;
    }

    SaveManager.updateCharacter(charId, {
      skillLevels: [10, 10, 10]
    });
    this.log('Cheat', `Maxed all skills for ${charId}`);
    return true;
  }

  /**
   * 캐릭터 별 등급 설정
   * @param {string} charId 캐릭터 ID
   * @param {number} stars 별 등급 (1-6)
   */
  static setCharacterStars(charId, stars) {
    if (!this.isDebugMode) return false;

    const { SaveManager } = require('./SaveManager.js');
    const character = SaveManager.getCharacter(charId);

    if (!character) {
      this.log('Error', `Character ${charId} not found`);
      return false;
    }

    SaveManager.updateCharacter(charId, { stars: Math.min(stars, 6) });
    this.log('Cheat', `Set ${charId} to ${stars} stars`);
    return true;
  }

  // ========== 진행도 치트 ==========

  /**
   * 모든 스테이지 클리어
   */
  static clearAllStages() {
    if (!this.isDebugMode) return false;

    const { SaveManager } = require('./SaveManager.js');
    const data = SaveManager.load();

    // 모든 스테이지를 3성으로 클리어
    for (let chapter = 1; chapter <= 10; chapter++) {
      for (let stage = 1; stage <= 10; stage++) {
        const stageId = `stage_${chapter}_${stage}`;
        data.progress.clearedStages[stageId] = 3;
      }
    }

    SaveManager.save(data);
    this.log('Cheat', 'All stages cleared with 3 stars');
    return true;
  }

  /**
   * 특정 챕터로 스킵
   * @param {number} chapter 챕터 번호
   */
  static skipToChapter(chapter) {
    if (!this.isDebugMode) return false;

    const { SaveManager } = require('./SaveManager.js');
    const data = SaveManager.load();

    // 해당 챕터까지의 모든 스테이지 클리어
    for (let c = 1; c < chapter; c++) {
      for (let s = 1; s <= 10; s++) {
        const stageId = `stage_${c}_${s}`;
        data.progress.clearedStages[stageId] = 3;
      }
    }

    data.progress.currentChapter = `chapter_${chapter}`;
    SaveManager.save(data);
    this.log('Cheat', `Skipped to chapter ${chapter}`);
    return true;
  }

  // ========== 전투 치트 ==========

  /**
   * 무적 모드 설정
   * @param {boolean} enabled 활성화 여부
   */
  static setInvincible(enabled) {
    if (!this.isDebugMode) return false;

    this.invincible = enabled;
    this.log('Cheat', `Invincibility ${enabled ? 'ON' : 'OFF'}`);
    return true;
  }

  /**
   * 원킬 모드 설정
   * @param {boolean} enabled 활성화 여부
   */
  static setOneHitKill(enabled) {
    if (!this.isDebugMode) return false;

    this.oneHitKill = enabled;
    this.log('Cheat', `One-hit kill ${enabled ? 'ON' : 'OFF'}`);
    return true;
  }

  /**
   * 전투 속도 설정
   * @param {number} speed 배속 (0.5 ~ 5.0)
   */
  static setBattleSpeed(speed) {
    if (!this.isDebugMode) return false;

    this.battleSpeedMultiplier = Math.max(0.5, Math.min(5.0, speed));
    this.log('Cheat', `Battle speed set to ${this.battleSpeedMultiplier}x`);
    return true;
  }

  // ========== 로그 ==========

  /**
   * 디버그 로그 출력
   * @param {string} category 카테고리
   * @param {string} message 메시지
   * @param {*} data 추가 데이터
   */
  static log(category, message, data) {
    if (!this.isDebugMode) return;

    const colors = {
      'System': '#3498db',
      'Cheat': '#e74c3c',
      'Battle': '#e67e22',
      'Gacha': '#9b59b6',
      'Save': '#27ae60',
      'Error': '#c0392b'
    };

    const color = colors[category] || '#95a5a6';
    console.log(
      `%c[DEBUG:${category}] ${message}`,
      `color: ${color}; font-weight: bold;`,
      data || ''
    );
  }

  // ========== 디버그 UI ==========

  /**
   * 디버그 메뉴 UI 표시
   * @param {Phaser.Scene} scene 현재 씬
   */
  static showDebugUI(scene) {
    if (!this.isDebugMode) return;

    const width = scene.cameras.main.width;
    const height = scene.cameras.main.height;

    // 배경
    const bg = scene.add.rectangle(width / 2, height / 2, width * 0.9, height * 0.8, 0x000000, 0.9);
    bg.setDepth(9000);

    // 제목
    const title = scene.add.text(width / 2, 100, 'DEBUG MENU', {
      fontSize: '32px',
      fontFamily: 'Arial',
      color: '#ff0000',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(9001);

    // 버튼들
    const buttons = [
      { text: '골드 +10000', action: () => this.addGold(10000) },
      { text: '젬 +1000', action: () => this.addGems(1000) },
      { text: '티켓 +10', action: () => this.addSummonTickets(10) },
      { text: '모든 리소스 MAX', action: () => this.maxResources() },
      { text: '모든 캐릭터 해금', action: () => this.unlockAllCharacters() },
      { text: '모든 스테이지 클리어', action: () => this.clearAllStages() },
      { text: '무적 ON/OFF', action: () => this.setInvincible(!this.invincible) },
      { text: '원킬 ON/OFF', action: () => this.setOneHitKill(!this.oneHitKill) },
      { text: '닫기', action: () => {
        bg.destroy();
        title.destroy();
        debugContainer.destroy();
      }}
    ];

    const debugContainer = scene.add.container(0, 0).setDepth(9001);

    buttons.forEach((btn, i) => {
      const y = 180 + i * 60;

      const btnBg = scene.add.rectangle(width / 2, y, 300, 50, 0x333333)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          btn.action();
          // UI 새로고침 이벤트 발생
          scene.events.emit('debug-action');
        })
        .on('pointerover', () => btnBg.setFillStyle(0x555555))
        .on('pointerout', () => btnBg.setFillStyle(0x333333));

      const btnText = scene.add.text(width / 2, y, btn.text, {
        fontSize: '18px',
        fontFamily: 'Arial',
        color: '#ffffff'
      }).setOrigin(0.5);

      debugContainer.add([btnBg, btnText]);
    });

    debugContainer.add([bg, title]);
  }

  // ========== 치트 코드 입력 ==========

  /**
   * 치트 코드 처리
   * @param {string} code 치트 코드
   * @returns {boolean} 성공 여부
   */
  static processCheatCode(code) {
    if (!this.isDebugMode) return false;

    const cheats = {
      'GOLDRAIN': () => this.addGold(999999),
      'GEMSTORM': () => this.addGems(99999),
      'SUMMONALL': () => this.addSummonTickets(100),
      'GODMODE': () => this.setInvincible(true),
      'ONEPUNCH': () => this.setOneHitKill(true),
      'SPEEDUP': () => this.setBattleSpeed(3.0),
      'UNLOCKALL': () => this.unlockAllCharacters(),
      'CLEARALL': () => this.clearAllStages()
    };

    const cheat = cheats[code.toUpperCase()];
    if (cheat) {
      cheat();
      this.log('Cheat', `Cheat code activated: ${code}`);
      return true;
    }

    return false;
  }
}
