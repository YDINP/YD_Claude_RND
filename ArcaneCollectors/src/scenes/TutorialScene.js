/**
 * TutorialScene.js - 신규 유저 온보딩 튜토리얼 씬 (TASK-C)
 * 4단계: 환영 -> 파티 안내 -> 가챠 체험 -> 전직 안내
 */
import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from "../config/gameConfig.js";
import { GachaSystem } from "../systems/GachaSystem.js";

const TUTORIAL_STEPS = [
  {
    title: "ArcaneCollectors에 오신 걸 환영합니다!",
    description: "신화의 교단에서 영웅을 모아 강력한 파티를 꾸려보세요.\n이 짧은 안내를 따라 게임의 기본을 배워봅시다.",
    highlight: null,
    buttonText: "시작하기"
  },
  {
    title: "파티 구성",
    description: "화면 하단의 파티 버튼으로 최대 5명의 영웅을 편성할 수 있습니다.\n다양한 영웅을 조합해 더 강력한 파티를 만들어보세요!",
    highlight: "bottom",
    buttonText: "다음"
  },
  {
    title: "가챠 소환 체험",
    description: "소환을 통해 새로운 영웅을 획득할 수 있습니다.\n지금 무료 소환을 체험해보세요!",
    highlight: "center",
    buttonText: "무료 소환!"
  },
  {
    title: "전직 시스템",
    description: "영웅이 일정 레벨에 도달하면 전직을 통해 더욱 강해질 수 있습니다.\n전직은 영웅의 스킬과 스탯을 크게 향상시킵니다.\n이제 모험을 시작하세요!",
    highlight: null,
    buttonText: "게임 시작!"
  }
];

export class TutorialScene extends Phaser.Scene {
  constructor() {
    super({ key: "TutorialScene" });
    this.currentStep = 0;
    this._stepObjects = [];
    this._gachaResult = null;
  }

  create() {
    this.currentStep = 0;
    this._stepObjects = [];
    this._gachaResult = null;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.bgDark || 0x0F172A);
    this._createStarField();
    this._progressIndicators = this._createProgressIndicators();
    this.showStep(0);
  }

  _createStarField() {
    for (let i = 0; i < 25; i++) {
      const x = Phaser.Math.Between(s(10), GAME_WIDTH - s(10));
      const y = Phaser.Math.Between(s(10), GAME_HEIGHT - s(10));
      const r = Phaser.Math.Between(1, 2);
      const alpha = Phaser.Math.FloatBetween(0.1, 0.4);
      const star = this.add.circle(x, y, r, COLORS.primary || 0x6366F1, alpha);
      this.tweens.add({
        targets: star, alpha: { from: alpha, to: alpha * 0.3 },
        duration: Phaser.Math.Between(1200, 2800), yoyo: true, repeat: -1, ease: "Sine.easeInOut"
      });
    }
  }

  _createProgressIndicators() {
    const indicators = [];
    const totalSteps = TUTORIAL_STEPS.length;
    const spacing = s(20);
    const startX = GAME_WIDTH / 2 - ((totalSteps - 1) * spacing) / 2;
    const y = s(32);
    for (let i = 0; i < totalSteps; i++) {
      indicators.push(this.add.circle(startX + i * spacing, y, s(4), 0x475569));
    }
    return indicators;
  }

  _updateProgressIndicators(stepIndex) {
    this._progressIndicators.forEach((dot, i) => {
      dot.setFillStyle(i < stepIndex ? (COLORS.primary || 0x6366F1) : i === stepIndex ? 0xA5B4FC : 0x475569);
    });
  }

  /** @param {number} stepIndex */
  showStep(stepIndex) {
    this._clearStepObjects();
    this.currentStep = stepIndex;
    this._updateProgressIndicators(stepIndex);
    const step = TUTORIAL_STEPS[stepIndex];
    if (!step) return;
    const objs = [];

    const overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT * 0.52, GAME_WIDTH - s(32), GAME_HEIGHT * 0.58, 0x1E293B, 0.92
    );
    overlay.setStrokeStyle(1, COLORS.primary || 0x6366F1, 0.5);
    objs.push(overlay);

    if (step.highlight === "bottom") {
      const hlBox = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - s(60), GAME_WIDTH - s(16), s(80), 0x000000, 0);
      hlBox.setStrokeStyle(2, 0xF59E0B, 0.9);
      objs.push(hlBox);
      objs.push(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - s(60), "[파티 버튼 영역]",
        { fontSize: sf(11), fontFamily: "Noto Sans KR", color: "#F59E0B" }).setOrigin(0.5));
    }

    if (step.highlight === "center") {
      const mg = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT * 0.25, s(48), 0x000000, 0);
      mg.setStrokeStyle(2, COLORS.secondary || 0xEC4899, 0.8);
      objs.push(mg);
      objs.push(this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT * 0.25, s(32), COLORS.secondary || 0xEC4899, 0.15));
      const si = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.25, "*",
        { fontSize: sf(28), color: "#EC4899" }).setOrigin(0.5);
      objs.push(si);
      this.tweens.add({ targets: [mg, si], angle: 360, duration: 3000, repeat: -1, ease: "Linear" });
    }

    if (stepIndex === 2 && this._gachaResult) {
      objs.push(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.25, this._gachaResult,
        { fontSize: sf(14), fontFamily: "Noto Sans KR", color: "#A5B4FC", align: "center" }).setOrigin(0.5));
    }

    const titleY = step.highlight === "bottom" ? GAME_HEIGHT * 0.32 : GAME_HEIGHT * 0.35;
    const titleText = this.add.text(GAME_WIDTH / 2, titleY, step.title, {
      fontSize: sf(18), fontFamily: "Noto Sans KR", color: "#E2E8F0",
      fontStyle: "bold", align: "center", wordWrap: { width: GAME_WIDTH - s(60) }
    }).setOrigin(0.5, 0).setAlpha(0);
    objs.push(titleText);

    const descText = this.add.text(GAME_WIDTH / 2, titleY + s(60), step.description, {
      fontSize: sf(13), fontFamily: "Noto Sans KR", color: "#94A3B8",
      align: "center", wordWrap: { width: GAME_WIDTH - s(60) }
    }).setOrigin(0.5, 0).setAlpha(0);
    objs.push(descText);

    this.tweens.add({ targets: [titleText, descText], alpha: 1, duration: 350, ease: "Power2" });

    const button = this._createButton(GAME_WIDTH / 2, GAME_HEIGHT * 0.82, step.buttonText, () => {
      this._onNextButton(stepIndex);
    });
    objs.push(...button);

    objs.push(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - s(20),
      (stepIndex + 1) + " / " + TUTORIAL_STEPS.length,
      { fontSize: sf(11), fontFamily: "Noto Sans KR", color: "#475569" }).setOrigin(0.5));

    this._stepObjects = objs;
  }

  _onNextButton(stepIndex) {
    if (stepIndex === 2) {
      this._performTutorialGacha();
    } else if (stepIndex === TUTORIAL_STEPS.length - 1) {
      this._completeTutorial();
    } else {
      this.showStep(stepIndex + 1);
    }
  }

  /** GachaSystem.pull() 실제 호출; 실패해도 단계 진행 */
  _performTutorialGacha() {
    let resultMsg = "소환 체험 완료!";
    try {
      const result = GachaSystem.pull(1, "gems", { skipEnergyCheck: true, tutorial: true });
      if (result && result.success && result.results && result.results.length > 0) {
        resultMsg = (result.results[0].rarity || "R") + " 등급 영웅 획득!";
      }
    } catch (_err) {
      resultMsg = "소환 체험 완료!";
    }
    this._gachaResult = resultMsg;
    this.showStep(3);
  }

  /** localStorage tutorial_completed 저장 후 MainMenuScene 전환 */
  _completeTutorial() {
    localStorage.setItem("tutorial_completed", "true");
    this.cameras.main.fadeOut(300, 15, 23, 42);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("MainMenuScene");
    });
  }

  _clearStepObjects() {
    this._stepObjects.forEach(obj => { if (obj && obj.destroy) obj.destroy(); });
    this._stepObjects = [];
  }

  _createButton(x, y, label, onClick) {
    const bg = this.add.rectangle(x, y, s(180), s(44), COLORS.primary || 0x6366F1);
    bg.setStrokeStyle(1, 0xA5B4FC, 0.7);
    bg.setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label,
      { fontSize: sf(14), fontFamily: "Noto Sans KR", color: "#FFFFFF", fontStyle: "bold" }
    ).setOrigin(0.5);
    bg.on("pointerdown", () => {
      this.tweens.add({ targets: [bg, text], scaleX: 0.95, scaleY: 0.95, duration: 80, yoyo: true, onComplete: onClick });
    });
    bg.on("pointerover", () => { bg.setFillStyle(0x818CF8); });
    bg.on("pointerout", () => { bg.setFillStyle(COLORS.primary || 0x6366F1); });
    return [bg, text];
  }

  shutdown() {
    this._clearStepObjects();
    this.tweens.killAll();
    if (this.input) { this.input.removeAllListeners(); }
  }
}
