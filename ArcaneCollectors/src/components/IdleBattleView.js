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
import { COLORS, MOOD_COLORS, s, sf } from '../config/gameConfig.js';

export class IdleBattleView extends Phaser.GameObjects.Container {
  constructor(scene, x, y, width, height) {
    super(scene, x, y);

    this.viewWidth = width;
    this.viewHeight = height;
    this.currentBoss = null;          // 현재 보스 데이터
    this.bossMaxHp = 0;               // 보스 최대 HP
    this.bossCurrentHp = 0;           // 보스 현재 HP (비주얼용)
    this.attackInterval = null;        // 공격 반복 타이머
    this.isDefeating = false;          // 처치 연출 중 플래그
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
    bg.fillRoundedRect(-this.viewWidth / 2, -this.viewHeight / 2, this.viewWidth, this.viewHeight, s(16));
    bg.lineStyle(s(2), COLORS.primary, 0.4);
    bg.strokeRoundedRect(-this.viewWidth / 2, -this.viewHeight / 2, this.viewWidth, this.viewHeight, s(16));
    this.add(bg);

    // (타이틀 제거됨 — 패널 자체가 전투 영역)
  }

  /**
   * 파티 표시 (좌측)
   */
  createPartyDisplay() {
    const startX = -this.viewWidth / 2 + s(60);
    const spacing = s(55);
    const startY = -((4 - 1) * spacing) / 2; // 4명 수직 중앙 정렬

    this.partyAvatars = [];

    for (let i = 0; i < 4; i++) {
      const y = startY + i * spacing;

      // 아바타 원
      const avatar = this.scene.add.circle(startX, y, s(18), COLORS.primary, 1);
      this.add(avatar);

      // 이모지 (임시)
      const emoji = this.scene.add.text(startX, y, '⚔️', {
        fontSize: sf(20)
      }).setOrigin(0.5);
      this.add(emoji);

      // 레벨 배지
      const levelBg = this.scene.add.rectangle(startX + s(25), y, s(36), s(14), COLORS.bgLight, 0.9);
      const levelText = this.scene.add.text(startX + s(25), y, `Lv.?`, {
        fontSize: sf(10),
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
    const enemyX = this.viewWidth / 2 - s(80);
    const enemyY = 0;

    // 적 배경 원
    this.enemyCircle = this.scene.add.circle(enemyX, enemyY, s(40), COLORS.danger, 0.8);
    this.enemyCircle.setVisible(false);
    this.add(this.enemyCircle);

    // 적 이모지
    this.enemyEmoji = this.scene.add.text(enemyX, enemyY, '👾', {
      fontSize: sf(40)
    }).setOrigin(0.5);
    this.enemyEmoji.setVisible(false);
    this.add(this.enemyEmoji);

    // 적 이름 (보스 이름 - 크게 강조)
    this.enemyName = this.scene.add.text(enemyX, enemyY + s(55), '', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.enemyName.setVisible(false);
    this.add(this.enemyName);

    // HP 바
    this.enemyHpBg = this.scene.add.rectangle(enemyX, enemyY - s(55), s(80), s(6), COLORS.bgLight, 0.8);
    this.enemyHpBar = this.scene.add.rectangle(enemyX, enemyY - s(55), s(80), s(6), COLORS.success, 1);
    this.enemyHpBg.setVisible(false);
    this.enemyHpBar.setVisible(false);
    this.add([this.enemyHpBg, this.enemyHpBar]);

    // 보스 HP 텍스트 (수치 표시)
    this.bossHpText = this.scene.add.text(enemyX, enemyY - s(65), '', {
      fontSize: sf(10),
      fontFamily: 'Arial',
      color: '#FFFFFF',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.bossHpText.setVisible(false);
    this.add(this.bossHpText);
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
    const infoY = this.viewHeight / 2 - s(30);

    // 진행 바 배경
    this.progressBg = this.scene.add.rectangle(0, infoY, this.viewWidth - s(40), s(8), COLORS.bgLight, 0.6);
    this.add(this.progressBg);

    // 진행 바 (보스 HP 테마로 빨간색)
    this.progressBar = this.scene.add.rectangle(
      -this.viewWidth / 2 + s(20),
      infoY,
      (this.viewWidth - s(40)) * 0.3,
      s(8),
      COLORS.danger,
      1
    );
    this.progressBar.setOrigin(0, 0.5);
    this.add(this.progressBar);

    // 진행도 텍스트
    this.progressText = this.scene.add.text(0, infoY + s(14), '전투 진행도: 0%', {
      fontSize: sf(11),
      fontFamily: '"Noto Sans KR", Arial',
      color: '#EF4444',
      fontStyle: 'bold'
    }).setOrigin(0.5, 0);
    this.add(this.progressText);

  }

  /**
   * 전투 사이클 시작
   */
  startBattleCycle() {
    // Guard: don't start if no party
    if (!this.hasParty) {
      return;
    }

    // 기존 타이머 정리
    if (this.battleCycleTimer) {
      this.battleCycleTimer.remove();
    }
    if (this.attackInterval) {
      this.attackInterval.remove();
    }

    // 1.5초 간격 연속 공격 루프
    this.attackInterval = this.scene.time.addEvent({
      delay: 1500,
      callback: () => {
        if (!this.isDefeating) {
          this.performAttack();
        }
      },
      loop: true
    });

    // 즉시 첫 공격
    this.performAttack();
  }

  /**
   * 보스 표시
   */
  showBoss(bossData) {
    if (!bossData) return;
    this.currentBoss = bossData;
    this.bossMaxHp = bossData.hp || 1000;
    this.bossCurrentHp = this.bossMaxHp;
    this.isDefeating = false;

    // 보스 표시
    this.enemyCircle.setFillStyle(COLORS.danger, 0.9);
    this.enemyCircle.setVisible(true);
    this.enemyEmoji.setText(bossData.emoji || '👹');
    this.enemyEmoji.setVisible(true);
    this.enemyName.setText(bossData.name || '보스');
    this.enemyName.setVisible(true);
    this.enemyHpBg.setVisible(true);
    this.enemyHpBar.setVisible(true);
    if (this.bossHpText) {
      this.bossHpText.setText('0%');
      this.bossHpText.setVisible(true);
    }

    // 슬라이드 인 (최초만)
    const targetX = this.viewWidth / 2 - s(80);
    this.enemyCircle.x = this.viewWidth / 2 + s(100);
    this.enemyEmoji.x = this.viewWidth / 2 + s(100);
    this.enemyName.x = this.viewWidth / 2 + s(100);
    this.enemyHpBg.x = this.viewWidth / 2 + s(100);
    this.enemyHpBar.x = this.viewWidth / 2 + s(100);
    if (this.bossHpText) this.bossHpText.x = this.viewWidth / 2 + s(100);

    this.scene.tweens.add({
      targets: [this.enemyCircle, this.enemyEmoji, this.enemyName, this.enemyHpBg, this.enemyHpBar, this.bossHpText].filter(Boolean),
      x: targetX,
      duration: 600,
      ease: 'Back.easeOut'
    });

    // 진행도 바 초기화 (0%에서 시작)
    this.enemyHpBar.setScale(0, 1);
    this.enemyHpBar.setFillStyle(COLORS.primary, 1);
    this.bossReadyShown = false;
  }

  /**
   * 공격 수행 (시각적 연출만)
   */
  performAttack() {
    if (!this.currentBoss || this.isDefeating) return;

    const startX = -this.viewWidth / 2 + s(60);
    const endX = this.viewWidth / 2 - s(80);
    const y = 0;

    // 공격 이펙트 (좌→우 스윙)
    this.attackEffect.clear();
    this.attackEffect.lineStyle(s(4), COLORS.accent, 1);
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
      x: `+=${Phaser.Math.Between(s(-8), s(8))}`,
      y: `+=${Phaser.Math.Between(s(-8), s(8))}`,
      duration: 100,
      yoyo: true
    });
  }

  /**
   * 진행도 업데이트 (샌드백 모드 — 0→100% 채워지는 방향)
   */
  updateBossHp(accumulatedDamage, bossMaxHp) {
    if (!this.currentBoss) return;

    const progress = Math.min(1, accumulatedDamage / bossMaxHp);

    // 진행도 바 스케일 조정 (0→1 채워지는 방향)
    this.scene.tweens.add({
      targets: this.enemyHpBar,
      scaleX: progress,
      duration: 200
    });

    // 퍼센트 텍스트 업데이트
    if (this.bossHpText) {
      this.bossHpText.setText(`${Math.floor(progress * 100)}%`);
    }

    // 진행도에 따라 색상 변경
    if (progress >= 0.9) {
      this.enemyHpBar.setFillStyle(COLORS.danger, 1);
    } else if (progress >= 0.6) {
      this.enemyHpBar.setFillStyle(COLORS.accent, 1);
    } else {
      this.enemyHpBar.setFillStyle(COLORS.primary, 1);
    }
  }

  /**
   * 데미지 텍스트 표시 (외부에서 호출)
   */
  showDamageText(damage) {
    const endX = this.viewWidth / 2 - s(80);
    const y = Phaser.Math.Between(s(-30), s(-10));

    const damageText = this.scene.add.text(endX - s(40), y, `-${damage.toLocaleString()}`, {
      fontSize: sf(18),
      fontFamily: 'Arial',
      color: '#FFAA00',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add(damageText);

    this.scene.tweens.add({
      targets: damageText,
      y: damageText.y - s(30),
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => damageText.destroy()
    });
  }

  /**
   * 보스전 준비 완료 연출 (진행도 100%)
   */
  showBossReady() {
    if (!this.currentBoss || this.bossReadyShown) return;
    this.bossReadyShown = true;

    // 진행도 바 100% + 빛남
    this.enemyHpBar.setFillStyle(COLORS.danger, 1);
    this.scene.tweens.add({
      targets: this.enemyHpBar,
      scaleX: 1,
      duration: 300
    });

    // "BOSS READY!" 텍스트
    this.bossReadyText = this.scene.add.text(0, s(-20), '⚔️ BOSS READY!', {
      fontSize: sf(26),
      fontFamily: 'Arial',
      color: '#FF4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: s(3)
    }).setOrigin(0.5);
    this.add(this.bossReadyText);

    // 텍스트 펄스 효과
    this.bossReadyTween = this.scene.tweens.add({
      targets: this.bossReadyText,
      scaleX: { from: 1, to: 1.1 },
      scaleY: { from: 1, to: 1.1 },
      alpha: { from: 1, to: 0.7 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 보스 빛남 효과 (외곽선 깜빡임)
    this.bossGlowTween = this.scene.tweens.add({
      targets: this.enemyCircle,
      alpha: { from: 0.9, to: 0.5 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * 보스전 준비 연출 정리 (보스전 진입 또는 다음 스테이지 전환 시)
   */
  clearBossReady() {
    if (this.bossReadyText) {
      if (this.bossReadyTween) this.bossReadyTween.stop();
      this.bossReadyText.destroy();
      this.bossReadyText = null;
      this.bossReadyTween = null;
    }
    if (this.bossGlowTween) {
      this.bossGlowTween.stop();
      this.enemyCircle.setAlpha(0.9);
      this.bossGlowTween = null;
    }
    this.bossReadyShown = false;
  }

  /**
   * 스테이지 클리어 연출 (보스전 승리 후 호출)
   */
  showStageClear() {
    if (!this.currentBoss) return;

    this.clearBossReady();

    // "STAGE CLEAR!" 텍스트
    const clearText = this.scene.add.text(0, s(-20), 'STAGE CLEAR!', {
      fontSize: sf(28),
      fontFamily: 'Arial',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: s(3)
    }).setOrigin(0.5);
    this.add(clearText);

    // CLEAR 텍스트 부유 후 소멸
    this.scene.tweens.add({
      targets: clearText,
      y: clearText.y - s(40),
      alpha: 0,
      duration: 1500,
      delay: 500,
      onComplete: () => clearText.destroy()
    });

    // 보상 표시
    const gold = this.currentBoss.goldReward || 100;
    const exp = this.currentBoss.expReward || 50;
    this.showRewardFloat(gold, exp);
  }

  /**
   * 다음 보스 표시
   */
  showNextBoss(bossData) {
    // 보스 준비 연출 정리
    this.clearBossReady();

    // 이전 보스 요소 초기화
    this.enemyCircle.setAlpha(1).setScale(1);
    this.enemyEmoji.setAlpha(1).setScale(1);
    this.enemyName.setAlpha(1).setScale(1);
    this.enemyHpBg.setAlpha(1).setScale(1);
    this.enemyHpBar.setAlpha(1).setScale(0, 1); // 진행도 0%에서 시작
    this.enemyHpBar.setFillStyle(COLORS.primary, 1);
    if (this.bossHpText) this.bossHpText.setAlpha(1);

    // 새 보스 표시
    this.showBoss(bossData);
  }

  /**
   * 프로그레스 바 업데이트
   */
  updateProgress(progress) {
    // progress = 0~1 비율
    const maxWidth = this.viewWidth - s(40);
    const newWidth = Math.max(1, maxWidth * progress);

    this.scene.tweens.add({
      targets: this.progressBar,
      width: newWidth,
      duration: 300
    });

    if (this.progressText) {
      this.progressText.setText('전투 진행도: ' + Math.floor(progress * 100) + '%');
    }
  }

  /**
   * 보상 플로팅 텍스트
   * @param {number} gold - 골드
   * @param {number} exp - 경험치
   */
  showRewardFloat(gold, exp) {
    const centerX = 0;
    const centerY = s(-40);

    // 골드 텍스트
    const goldText = this.scene.add.text(centerX - s(30), centerY, `+${gold}G`, {
      fontSize: sf(16),
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add(goldText);

    // 경험치 텍스트
    const expText = this.scene.add.text(centerX + s(30), centerY, `+${exp}EXP`, {
      fontSize: sf(16),
      fontFamily: 'Arial',
      color: `#${COLORS.success.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add(expText);

    // 부유 후 소멸
    this.scene.tweens.add({
      targets: [goldText, expText],
      y: centerY - s(50),
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
   * 파티 정보 업데이트
   * @param {Array} party - 파티 데이터 배열
   */
  updateParty(party) {
    this.hasParty = party && party.length > 0;

    // 파티 편성 시 '파티를 먼저 편성해주세요' 안내 메시지 제거
    if (this.hasParty && this.emptyPartyMessage) {
      this.emptyPartyMessage.destroy();
      this.emptyPartyMessage = null;
      if (this.emptyPartyTween) {
        this.emptyPartyTween.stop();
        this.emptyPartyTween = null;
      }
    }

    party.forEach((hero, index) => {
      if (index >= this.partyAvatars.length) return;

      const avatar = this.partyAvatars[index];
      if (hero) {
        // 실제 영웅 데이터로 업데이트
        avatar.emoji.setText(hero.emoji || '⚔️');
        // 슬롯 번호(L1~L4) 대신 실제 영웅 레벨 표시
        avatar.levelText.setText(`Lv.${hero.level || 1}`);
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

    // 이미 표시 중이면 중복 생성 방지
    if (this.emptyPartyMessage) return;

    // 중앙에 안내 메시지 표시
    this.emptyPartyMessage = this.scene.add.text(0, 0, '파티를 먼저 편성해주세요!', {
      fontSize: sf(20),
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add(this.emptyPartyMessage);

    // 깜빡임 효과 (참조 저장 — updateParty에서 정리)
    this.emptyPartyTween = this.scene.tweens.add({
      targets: this.emptyPartyMessage,
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
    // (타이틀 트윈 제거됨)
    // 전투 사이클 타이머 정리
    if (this.battleCycleTimer) {
      this.battleCycleTimer.remove();
      this.battleCycleTimer = null;
    }
    // 공격 반복 타이머 정리
    if (this.attackInterval) {
      this.attackInterval.remove();
      this.attackInterval = null;
    }
    // 보스 준비 연출 정리
    this.clearBossReady();
    // 파티 미편성 안내 메시지 정리
    if (this.emptyPartyTween) {
      this.emptyPartyTween.stop();
      this.emptyPartyTween = null;
    }
    if (this.emptyPartyMessage) {
      this.emptyPartyMessage.destroy();
      this.emptyPartyMessage = null;
    }
    // 대기중인 delayedCall 정리
    if (this.pendingDelays) {
      this.pendingDelays.forEach(d => d.remove());
      this.pendingDelays = [];
    }
    super.destroy(fromScene);
  }
}
