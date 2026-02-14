/**
 * IdleBattleView - 자동 전투 미니뷰 컴포넌트
 *
 * 홈 화면에서 자동으로 전투하는 모습을 시각적으로 표현
 * - 파티 4명 아바타 (좌측)
 * - 적 몬스터 (우측)
 * - 공격 이펙트 (중앙)
 * - 보상 팝업 (플로팅 텍스트)
 * - 진행 바 (현재 스테이지)
 */

import Phaser from 'phaser';
import { COLORS, MOOD_COLORS } from '../config/gameConfig.js';

export class IdleBattleView extends Phaser.GameObjects.Container {
  constructor(scene, x, y, width, height) {
    super(scene, x, y);

    this.viewWidth = width;
    this.viewHeight = height;
    this.battlePhase = 0; // 0: idle, 1: enemy appear, 2: attack, 3: victory
    this.phaseTimer = 0;
    this.currentEnemy = null;
    this.pendingDelays = [];

    this.createBackground();
    this.createPartyDisplay();
    this.createEnemyDisplay();
    this.createEffectLayer();
    this.createStageInfo();

    scene.add.existing(this);
  }

  /**
   * 배경 생성 (반투명 다크 패널)
   */
  createBackground() {
    const bg = this.scene.add.graphics();
    bg.fillStyle(COLORS.bgDark, 0.6);
    bg.fillRoundedRect(-this.viewWidth / 2, -this.viewHeight / 2, this.viewWidth, this.viewHeight, 16);
    bg.lineStyle(2, COLORS.primary, 0.4);
    bg.strokeRoundedRect(-this.viewWidth / 2, -this.viewHeight / 2, this.viewWidth, this.viewHeight, 16);
    this.add(bg);

    // 제목 텍스트
    const title = this.scene.add.text(0, -this.viewHeight / 2 + 20, '⚔️ 자동 전투 중...', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add(title);

    // 제목 깜빡임
    this.titleTween = this.scene.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.5 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * 파티 표시 (좌측)
   */
  createPartyDisplay() {
    const startX = -this.viewWidth / 2 + 60;
    const startY = -30;
    const spacing = 50;

    this.partyAvatars = [];

    for (let i = 0; i < 4; i++) {
      const y = startY + i * spacing;

      // 아바타 원
      const avatar = this.scene.add.circle(startX, y, 18, COLORS.primary, 1);
      this.add(avatar);

      // 이모지 (임시)
      const emoji = this.scene.add.text(startX, y, '⚔️', {
        fontSize: '20px'
      }).setOrigin(0.5);
      this.add(emoji);

      // 레벨 배지
      const levelBg = this.scene.add.rectangle(startX + 25, y, 24, 14, COLORS.bgLight, 0.9);
      const levelText = this.scene.add.text(startX + 25, y, `L${i + 1}`, {
        fontSize: '10px',
        fontFamily: 'Arial',
        color: '#FFFFFF'
      }).setOrigin(0.5);
      this.add([levelBg, levelText]);

      this.partyAvatars.push({ avatar, emoji, levelBg, levelText });
    }
  }

  /**
   * 적 표시 (우측)
   */
  createEnemyDisplay() {
    const enemyX = this.viewWidth / 2 - 80;
    const enemyY = 0;

    // 적 배경 원
    this.enemyCircle = this.scene.add.circle(enemyX, enemyY, 40, COLORS.danger, 0.8);
    this.enemyCircle.setVisible(false);
    this.add(this.enemyCircle);

    // 적 이모지
    this.enemyEmoji = this.scene.add.text(enemyX, enemyY, '👾', {
      fontSize: '40px'
    }).setOrigin(0.5);
    this.enemyEmoji.setVisible(false);
    this.add(this.enemyEmoji);

    // 적 이름
    this.enemyName = this.scene.add.text(enemyX, enemyY + 55, '', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.enemyName.setVisible(false);
    this.add(this.enemyName);

    // HP 바
    this.enemyHpBg = this.scene.add.rectangle(enemyX, enemyY - 55, 80, 6, COLORS.bgLight, 0.8);
    this.enemyHpBar = this.scene.add.rectangle(enemyX, enemyY - 55, 80, 6, COLORS.success, 1);
    this.enemyHpBg.setVisible(false);
    this.enemyHpBar.setVisible(false);
    this.add([this.enemyHpBg, this.enemyHpBar]);
  }

  /**
   * 이펙트 레이어 (공격 표현)
   */
  createEffectLayer() {
    this.attackEffect = this.scene.add.graphics();
    this.attackEffect.setVisible(false);
    this.add(this.attackEffect);
  }

  /**
   * 스테이지 정보 (하단)
   */
  createStageInfo() {
    const infoY = this.viewHeight / 2 - 30;

    // 진행 바 배경
    this.progressBg = this.scene.add.rectangle(0, infoY, this.viewWidth - 40, 8, COLORS.bgLight, 0.6);
    this.add(this.progressBg);

    // 진행 바
    this.progressBar = this.scene.add.rectangle(
      -this.viewWidth / 2 + 20,
      infoY,
      (this.viewWidth - 40) * 0.3,
      8,
      COLORS.accent,
      1
    );
    this.progressBar.setOrigin(0, 0.5);
    this.add(this.progressBar);

    // 스테이지 텍스트
    this.stageText = this.scene.add.text(0, infoY + 18, '챕터 1-1: 슬라임 평원', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.add(this.stageText);
  }

  /**
   * 전투 사이클 시작
   */
  startBattleCycle() {
    // Guard: don't start if no party
    if (!this.hasParty) {
      return;
    }

    if (this.battleCycleTimer) {
      this.battleCycleTimer.remove();
    }

    this.battleCycleTimer = this.scene.time.addEvent({
      delay: 5000, // 전투 시퀀스(4s) + 여유(1s) = 5초 간격
      callback: () => {
        this.runBattleSequence();
      },
      loop: true
    });

    // 즉시 첫 전투 시작
    this.runBattleSequence();
  }

  /**
   * 전투 시퀀스 실행
   */
  runBattleSequence() {
    // 이전 시퀀스 delayedCall 정리
    this.pendingDelays.forEach(d => d.remove());
    this.pendingDelays = [];

    // Phase 1: 적 등장 (0-1s)
    this.pendingDelays.push(this.scene.time.delayedCall(0, () => {
      this.showEnemy();
    }));

    // Phase 2: 공격 (1-4s)
    this.pendingDelays.push(this.scene.time.delayedCall(1000, () => {
      this.performAttack();
    }));

    this.pendingDelays.push(this.scene.time.delayedCall(2000, () => {
      this.performAttack();
    }));

    this.pendingDelays.push(this.scene.time.delayedCall(3000, () => {
      this.performAttack();
    }));

    // Phase 3: 적 처치 + 보상 (4-5s)
    this.pendingDelays.push(this.scene.time.delayedCall(4000, () => {
      this.defeatEnemy();
    }));
  }

  /**
   * 적 등장 애니메이션
   */
  showEnemy() {
    // 랜덤 적 선택
    const enemies = [
      { name: '슬라임', emoji: '🟢', color: COLORS.success },
      { name: '고블린', emoji: '👺', color: COLORS.danger },
      { name: '늑대', emoji: '🐺', color: COLORS.textDark },
      { name: '독버섯', emoji: '🍄', color: COLORS.accent }
    ];
    const enemy = enemies[Math.floor(Math.random() * enemies.length)];

    this.currentEnemy = enemy;
    this.attackCount = 0;

    // 적 표시
    this.enemyCircle.setFillStyle(enemy.color, 0.8);
    this.enemyCircle.setVisible(true);
    this.enemyEmoji.setText(enemy.emoji);
    this.enemyEmoji.setVisible(true);
    this.enemyName.setText(enemy.name);
    this.enemyName.setVisible(true);
    this.enemyHpBg.setVisible(true);
    this.enemyHpBar.setVisible(true);

    // 슬라이드 인 애니메이션
    const targetX = this.viewWidth / 2 - 80;
    this.enemyCircle.x = this.viewWidth / 2 + 100;
    this.enemyEmoji.x = this.viewWidth / 2 + 100;
    this.enemyName.x = this.viewWidth / 2 + 100;
    this.enemyHpBg.x = this.viewWidth / 2 + 100;
    this.enemyHpBar.x = this.viewWidth / 2 + 100;

    this.scene.tweens.add({
      targets: [this.enemyCircle, this.enemyEmoji, this.enemyName, this.enemyHpBg, this.enemyHpBar],
      x: targetX,
      duration: 600,
      ease: 'Back.easeOut'
    });

    // HP 바 초기화
    this.enemyHpBar.setScale(1, 1);
  }

  /**
   * 공격 수행
   */
  performAttack() {
    if (!this.currentEnemy) return;

    const startX = -this.viewWidth / 2 + 60;
    const endX = this.viewWidth / 2 - 80;
    const y = 0;

    // 공격 이펙트 (좌→우 스윙)
    this.attackEffect.clear();
    this.attackEffect.lineStyle(4, COLORS.accent, 1);
    this.attackEffect.beginPath();
    this.attackEffect.moveTo(startX, y);
    this.attackEffect.lineTo(endX, y);
    this.attackEffect.strokePath();
    this.attackEffect.setVisible(true);

    // 반짝임
    this.scene.tweens.add({
      targets: this.attackEffect,
      alpha: { from: 1, to: 0 },
      duration: 300,
      onComplete: () => {
        this.attackEffect.setVisible(false);
        this.attackEffect.setAlpha(1);
      }
    });

    // 적 흔들림
    this.scene.tweens.add({
      targets: [this.enemyCircle, this.enemyEmoji],
      x: `+=${Phaser.Math.Between(-8, 8)}`,
      y: `+=${Phaser.Math.Between(-8, 8)}`,
      duration: 100,
      yoyo: true
    });

    // HP 감소 — 3회 공격으로 정확히 0 도달 (1.0 → 0.67 → 0.33 → 0)
    this.attackCount = (this.attackCount || 0) + 1;
    const newScale = Math.max(0, 1 - (this.attackCount / 3));
    this.scene.tweens.add({
      targets: this.enemyHpBar,
      scaleX: newScale,
      duration: 200
    });

    // 데미지 텍스트
    const damageText = this.scene.add.text(endX - 40, y - 20, `-${Phaser.Math.Between(50, 150)}`, {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#FFAA00',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add(damageText);

    this.scene.tweens.add({
      targets: damageText,
      y: damageText.y - 30,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        damageText.destroy();
      }
    });
  }

  /**
   * 적 처치 + 보상 표시
   */
  defeatEnemy() {
    if (!this.currentEnemy) return;

    // 적 사라지는 애니메이션
    this.scene.tweens.add({
      targets: [this.enemyCircle, this.enemyEmoji, this.enemyName, this.enemyHpBg, this.enemyHpBar],
      alpha: 0,
      scale: 0.5,
      duration: 400,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.enemyCircle.setVisible(false);
        this.enemyEmoji.setVisible(false);
        this.enemyName.setVisible(false);
        this.enemyHpBg.setVisible(false);
        this.enemyHpBar.setVisible(false);
        this.enemyCircle.setAlpha(1).setScale(1);
        this.enemyEmoji.setAlpha(1).setScale(1);
        this.enemyName.setAlpha(1).setScale(1);
        this.enemyHpBg.setAlpha(1).setScale(1);
        this.enemyHpBar.setAlpha(1).setScale(1);
      }
    });

    // 보상 팝업
    const gold = Phaser.Math.Between(10, 30);
    const exp = Phaser.Math.Between(5, 15);
    this.showRewardFloat(gold, exp);

    // 진행 바 증가
    const currentWidth = this.progressBar.width;
    const maxWidth = this.viewWidth - 40;
    const newWidth = Math.min(maxWidth, currentWidth + 10);
    this.scene.tweens.add({
      targets: this.progressBar,
      width: newWidth,
      duration: 400
    });

    // 진행 바 가득 차면 리셋
    if (newWidth >= maxWidth) {
      this.scene.time.delayedCall(1000, () => {
        this.progressBar.width = (this.viewWidth - 40) * 0.3;
      });
    }
  }

  /**
   * 보상 플로팅 텍스트
   * @param {number} gold - 골드
   * @param {number} exp - 경험치
   */
  showRewardFloat(gold, exp) {
    const centerX = 0;
    const centerY = -40;

    // 골드 텍스트
    const goldText = this.scene.add.text(centerX - 30, centerY, `+${gold}G`, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add(goldText);

    // 경험치 텍스트
    const expText = this.scene.add.text(centerX + 30, centerY, `+${exp}EXP`, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${COLORS.success.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add(expText);

    // 부유 후 소멸
    this.scene.tweens.add({
      targets: [goldText, expText],
      y: centerY - 50,
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => {
        goldText.destroy();
        expText.destroy();
      }
    });
  }

  /**
   * 스테이지 정보 업데이트
   * @param {number} chapter - 챕터 번호
   * @param {number} stage - 스테이지 번호
   * @param {string} name - 스테이지 이름
   */
  updateStageInfo(chapter, stage, name) {
    this.stageText.setText(`챕터 ${chapter || 1}-${stage || 1}: ${name || '슬라임 평원'}`);
  }

  /**
   * 파티 정보 업데이트
   * @param {Array} party - 파티 데이터 배열
   */
  updateParty(party) {
    this.hasParty = party && party.length > 0;

    party.forEach((hero, index) => {
      if (index >= this.partyAvatars.length) return;

      const avatar = this.partyAvatars[index];
      if (hero) {
        // 실제 영웅 데이터로 업데이트
        avatar.emoji.setText(hero.emoji || '⚔️');
        avatar.levelText.setText(`L${hero.level || 1}`);
        // mood 색상 적용 (optional)
        if (hero.mood && MOOD_COLORS[hero.mood.toUpperCase()]) {
          const moodColor = Phaser.Display.Color.HexStringToColor(
            MOOD_COLORS[hero.mood.toUpperCase()]
          ).color;
          avatar.avatar.setFillStyle(moodColor, 1);
        }
      }
    });
  }

  /**
   * 파티가 비어있을 때 안내 메시지 표시
   */
  showEmptyPartyMessage() {
    this.hasParty = false;

    // 중앙에 안내 메시지 표시
    const messageText = this.scene.add.text(0, 0, '파티를 먼저 편성해주세요!', {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add(messageText);

    // 깜빡임 효과
    this.scene.tweens.add({
      targets: messageText,
      alpha: { from: 1, to: 0.4 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * 정리
   */
  destroy(fromScene) {
    // 타이틀 반복 트윈 정리
    if (this.titleTween) {
      this.titleTween.stop();
      this.titleTween = null;
    }
    // 전투 사이클 타이머 정리
    if (this.battleCycleTimer) {
      this.battleCycleTimer.remove();
      this.battleCycleTimer = null;
    }
    // 대기중인 delayedCall 정리
    if (this.pendingDelays) {
      this.pendingDelays.forEach(d => d.remove());
      this.pendingDelays = [];
    }
    super.destroy(fromScene);
  }
}
