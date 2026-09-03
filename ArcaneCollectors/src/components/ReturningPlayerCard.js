import { COLORS, GAME_WIDTH, s, sf } from '../config/gameConfig.js';
import {
  CARD_LAYOUT,
  buildCardLines,
  formatGift,
} from '../systems/ReturningPlayerRules.js';
import { ensureMinTouchTarget } from '../utils/touchTarget.js';

/**
 * ReturningPlayerCard — 복귀 유저 진행도 요약 카드 (T-Q5 / T-25)
 *
 * SSOT
 *  - docs/story/SYSTEM_ONBOARDING_ECONOMY.md §5-3 (티어·보상표·요약 4항목)
 *  - docs/story/UX_ONBOARDING_FLOW.md §5-3 (화면 명세), §7 UXI-03 (오프라인 상한 확정)
 *
 * 원칙
 *  - **컷씬을 자동 재생하지 않는다.** 놓친 이야기는 ③번 줄 링크로만 제공한다.
 *  - 완주 유저에게 튜토리얼을 다시 태우지 않는다. 이 카드가 그 대체물이다.
 *  - 판정은 전부 순수 함수로 분리한다. 이 파일의 Phaser 부분은 그 결과를 그리기만 한다.
 *
 * 주의: 모듈 스코프에서 COLORS/s/sf를 평가하지 않는다(순환 import TDZ 방지).
 */

// 판정·문구 생성은 순수 모듈이 담당한다. 여기서는 그리기만 한다.
export {
  CARD_LAYOUT,
  getDaysAway,
  resolveReturningTier,
  getReturnGift,
  getLastClearedStageId,
  countAscendableHeroes,
  countUnclaimedQuests,
  buildReturnSummary,
  buildCardLines,
  formatGift,
} from '../systems/ReturningPlayerRules.js';

/**
 * 복귀 카드 UI. `summary.visible === false`면 아무것도 그리지 않는다.
 *
 * @param {Phaser.Scene} scene
 * @param {object} summary buildReturnSummary 결과
 * @param {{onClaim?: Function, onLater?: Function, onCta?: Function}} [handlers]
 */
export class ReturningPlayerCard {
  constructor(scene, summary, handlers = {}) {
    this.scene = scene;
    this.summary = summary;
    this.handlers = handlers;
    this.container = null;
    this.visible = false;
  }

  show() {
    if (!this.summary?.visible || this.container) return false;

    const width = s(CARD_LAYOUT.width);
    const left = s(CARD_LAYOUT.x);
    const top = s(CARD_LAYOUT.y);
    const centerX = GAME_WIDTH / 2;

    this.container = this.scene.add.container(0, 0).setDepth(2500);

    const overlay = this.scene.add.rectangle(
      centerX, top + s(400), GAME_WIDTH * 2, s(2560), 0x000000, 0.82
    ).setInteractive();
    this.container.add(overlay);

    const lines = buildCardLines(this.summary);
    const reminders = this.summary.reminders || [];
    const height = s(300) + lines.length * s(76) + reminders.length * s(26);

    const panel = this.scene.add.graphics();
    panel.fillStyle(0x0F172A, 0.98);
    panel.fillRoundedRect(left, top, width, height, s(CARD_LAYOUT.radius));
    panel.lineStyle(s(2), COLORS.primary, 0.55);
    panel.strokeRoundedRect(left, top, width, height, s(CARD_LAYOUT.radius));
    this.container.add(panel);

    let y = top + s(44);
    this.container.add(this.scene.add.text(centerX, y, '다시 오셨군요, 수집가', {
      fontSize: sf(24), fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#F8FAFC',
    }).setOrigin(0.5));

    y += s(34);
    this.container.add(this.scene.add.text(centerX, y, `${this.summary.daysAway}일 만입니다`, {
      fontSize: sf(16), fontFamily: '"Noto Sans KR", sans-serif', color: '#94A3B8',
    }).setOrigin(0.5));

    y += s(36);
    lines.forEach((line) => {
      this.container.add(this.scene.add.text(left + s(28), y, line.value, {
        fontSize: sf(18), fontFamily: '"Noto Sans KR", sans-serif', color: '#F8FAFC',
      }));
      if (line.sub) {
        this.container.add(this.scene.add.text(left + s(28), y + s(26), line.sub, {
          fontSize: sf(16), fontFamily: '"Noto Sans KR", sans-serif', color: '#FBBF24',
        }));
      }
      if (line.ctaLabel) {
        // 링크형 텍스트라 글리프는 99×19 지만 히트는 터치 하한까지 넓힌다 (QA P2-1)
        const cta = this.scene.add.text(left + width - s(28), y + s(4), `[${line.ctaLabel}]`, {
          fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif', color: '#38BDF8',
        }).setOrigin(1, 0);
        ensureMinTouchTarget(cta);
        cta.on('pointerup', () => {
          this.hide();
          this.handlers.onCta?.(line.ctaKey);
        });
        this.container.add(cta);
      }
      y += s(76);
    });

    reminders.forEach((text) => {
      this.container.add(this.scene.add.text(left + s(28), y, `· ${text}`, {
        fontSize: sf(14), fontFamily: '"Noto Sans KR", sans-serif', color: '#94A3B8',
      }));
      y += s(26);
    });

    const giftText = formatGift(this.summary.gift);
    if (giftText) {
      y += s(8);
      this.container.add(this.scene.add.text(centerX, y, `복귀 선물   ${giftText}`, {
        fontSize: sf(17), fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold', color: '#FBBF24',
      }).setOrigin(0.5));
      y += s(40);
    }

    // 최우선 버튼 (h 64 · UX §6-3 탭 타겟 기준 충족)
    const btnY = y + s(30);
    const btnBg = this.scene.add.rectangle(centerX, btnY, s(380), s(64), COLORS.primary, 1)
      .setInteractive({ useHandCursor: true });
    btnBg.setStrokeStyle(s(2), 0xFFFFFF, 0.2);
    const btnText = this.scene.add.text(centerX, btnY, '받고 시작하기', {
      fontSize: sf(19), fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5);
    btnBg.on('pointerup', () => {
      this.hide();
      this.handlers.onClaim?.(this.summary);
    });
    this.container.add([btnBg, btnText]);

    // 확인 팝업 없는 텍스트 버튼 (다크패턴 방지 · UX §6-6)
    // 52 → 62: 히트를 48 로 넓히면 위쪽 최우선 버튼(h 64, 아래끝 btnY+32)과 4px 겹쳐
    // '받고 시작하기'의 하단 띠가 '나중에'로 먹힌다. 10px 더 내려 6px 여백을 만든다.
    const later = this.scene.add.text(centerX, btnY + s(62), '나중에', {
      fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif', color: '#64748B',
    }).setOrigin(0.5);
    ensureMinTouchTarget(later);
    later.on('pointerup', () => {
      this.hide();
      this.handlers.onLater?.();
    });
    this.container.add(later);

    this.visible = true;
    return true;
  }

  hide() {
    this.visible = false;
    this.container?.destroy(true);
    this.container = null;
  }

  destroy() {
    this.hide();
    this.scene = null;
  }
}

export default ReturningPlayerCard;
