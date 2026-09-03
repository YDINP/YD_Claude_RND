import { COLORS, GAME_WIDTH, GAME_HEIGHT, MOODS, s, sf } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
import { sweepSystem } from '../systems/SweepSystem.js';
import transitionManager from '../utils/TransitionManager.js';
import navigationManager from '../systems/NavigationManager.js';
import { StoryManager } from '../systems/StoryManager.js';
import { energySystem } from '../systems/EnergySystem.js';
import { buildDefeatGuidance, getDefeatEnergyRefund, isBossStage } from '../systems/StageWallRules.js';
import { soundManager } from '../systems/SoundManager.js';
// T-18 리디자인 — 렌더/레이아웃 전용 의존
import { GlassPanel, GLASS_VARIANT } from '../components/GlassPanel.js';
import { NineSliceFrame } from '../components/NineSliceFrame.js';
import { UIButton } from '../components/UIButton.js';
import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import { IconFactory } from '../utils/IconFactory.js';
import { ts } from '../utils/textStyles.ts';
import { DESIGN } from '../config/designSystem.js';
import {
  RESULT_LAYOUT,
  computeStarSlots,
  computeResultButtonLayout,
  computePartyExpSlots
} from '../utils/battleLayout.js';

/**
 * BattleResultScene - 전투 결과 화면
 * BattleScene에서 전환되며, 별점/보상/레벨업/소탕 버튼을 표시
 */
/**
 * 승패 스팅을 다 들려주고 로비 테마로 넘어가기까지의 시간(ms).
 * 스팅 원본은 승리 11초 · 패배 9초라 9초 뒤 크로스페이드하면 두 곡 모두 끝맺음이 살아 있다.
 */
const RESULT_STING_MS = 9000;

export class BattleResultScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleResultScene' });
    this.transitioning = false;
  }

  init(data) {
    this.victory = data?.victory ?? false;
    this.stars = data?.stars ?? 0;
    this.rewards = data?.rewards ?? { gold: 0, exp: 0 };
    this.levelUpResults = data?.levelUpResults ?? [];
    this.stage = data?.stage ?? null;
    this.party = data?.party ?? [];
    this.turnCount = data?.turnCount ?? 0;
    this.aliveCount = data?.aliveCount ?? 0;
    this.totalAllies = data?.totalAllies ?? 0;
    this.mode = data?.mode ?? 'normal';
    this.towerFloor = data?.towerFloor;  // 추가: 타워 층 번호
    this.enemyHpRemainRatio = data?.enemyHpRemainRatio ?? null;
    this.defeatGuidance = null;
  }

  create() {
    this.transitioning = false; // 씬 재진입 시 반드시 리셋
    this.cameras.main.fadeIn(400);

    // SND-01: 승패 스팅을 틀고, 끝나면 로비 테마로 돌아온다
    soundManager.init(this);
    this.playResultBGM();

    try {
      this.createBackground();

      // T-Q1: 승리 정산 직전 컷씬 (stage_clear / boss_after → epilogue)
      // 컷씬이 없으면 onComplete가 즉시 호출되므로 기존 흐름과 동일하다.
      // T-Q3: 패배 진단·재도전 정책은 화면을 그리기 전에 확정한다.
      // 버튼 구성이 이 결과(반복 실패 단계)에 따라 달라지기 때문이다.
      this.prepareDefeatGuidance();

      this.playClearCutscene(() => {
        if (this.victory) {
          this.createVictoryDisplay();
        } else {
          this.createDefeatDisplay();
        }

        this.createActionButtons();
      });
    } catch (error) {
      console.error('[BattleResultScene] create() 실패:', error);
      this.add.text(s(360), s(640), '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  /**
   * 승리 시 스테이지 클리어 컷씬을 재생하고 콜백으로 결과 화면을 구성한다.
   * 보스는 `boss_after`(+ 최종 보스는 `epilogue`), 일반 스테이지는 `stage_clear`를 쓴다.
   * @param {Function} onDone
   */
  playClearCutscene(onDone) {
    const stageId = this.stage?.id;
    const isStoryStage = this.victory && typeof stageId === 'string' && /^\d+-\d+$/.test(stageId);

    if (!isStoryStage) {
      onDone();
      return;
    }

    const chapterId = `chapter_${stageId.split('-')[0]}`;
    const triggers = this.stage?.isBoss ? ['boss_after', 'epilogue'] : ['stage_clear'];

    StoryManager.triggerSequence(triggers, {
      scene: this,
      stageId,
      chapterId,
      onComplete: onDone
    });
  }

  createBackground() {
    // §3-9: 승/패 전용 배경. lazyTextures 라 로드 전에는 프로시저럴 폴백이 먼저 그려진다
    this.resultBgKey = this.victory ? 'bg_result_victory' : 'bg_result_defeat';
    BackgroundFactory.createSceneBg(this, this.resultBgKey, { depth: 0 });
  }

  /**
   * 결과 화면 액센트. 승리는 신성의 골드, 패배는 오류의 적색이다.
   * @returns {number} Phaser hex
   */
  getResultAccent() {
    return this.victory ? DESIGN.colors.brand.accent : DESIGN.colors.status.error;
  }

  createVictoryDisplay() {
    const centerX = GAME_WIDTH / 2;

    // === 승리 타이틀 === display.xl Orbitron
    const title = this.add.text(centerX, s(RESULT_LAYOUT.title.y), 'VICTORY', ts('display.xl', {
      color: '#FFD60A',
      stroke: '#000000',
      strokeThickness: s(4)
    })).setOrigin(0.5).setDepth(10);

    // 타이틀 글로우 애니메이션
    this.tweens.add({
      targets: title,
      alpha: { from: 0.85, to: 1 },
      scaleX: { from: 0.97, to: 1.04 },
      scaleY: { from: 0.97, to: 1.04 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // === 별점 표시 ===
    this.createStarDisplay(centerX, s(RESULT_LAYOUT.stars.y));

    // === 스테이지 정보 ===
    if (this.stage) {
      this.add.text(centerX, s(RESULT_LAYOUT.stageName.y), this.stage.name || `Stage ${this.stage.id}`, ts('body', {
        color: DESIGN.colors.text.primary,
        stroke: '#000000',
        strokeThickness: s(3)
      })).setOrigin(0.5).setDepth(10);
    }

    // === 보상 패널 (아이콘 그리드) ===
    this.createRewardsPanel();

    // === 파티 획득 EXP + 레벨업 배지 — 화면 40% 공백을 채운다 ===
    this.createPartyExpPanel();
  }

  createStarDisplay(x, y) {
    const xs = computeStarSlots(3);
    const starPx = s(RESULT_LAYOUT.stars.size);

    xs.forEach((baseX, i) => {
      const starX = s(baseX);
      const filled = i < this.stars;

      // 별은 IconFactory 벡터 텍스처를 쓴다 (시스템 이모지 금지, §2-2)
      const key = IconFactory.createIcon(this, 'star', starPx);
      const star = this.add.image(starX, y, key)
        .setOrigin(0.5)
        .setDepth(10)
        .setAlpha(0)
        .setScale(0);
      star.setTint(filled ? 0xFFD60A : 0x475569);

      // 순차적 별 등장 애니메이션 (0.15s 간격 팝인)
      this.tweens.add({
        targets: star,
        alpha: filled ? 1 : 0.55,
        scale: 1,
        duration: 320,
        delay: 300 + i * 150,
        ease: 'Back.easeOut',
        onComplete: () => { if (filled) this.burstStarSparkle(starX, y); }
      });

      // 채워진 별 반짝임
      if (filled) {
        this.tweens.add({
          targets: star,
          scaleX: { from: 1, to: 1.12 },
          scaleY: { from: 1, to: 1.12 },
          duration: 900,
          delay: 1300 + i * 100,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    });
  }

  /**
   * 별이 자리를 잡는 순간의 파티클. 획득한 별에만 붙는다.
   * @param {number} x - 렌더 px
   * @param {number} y - 렌더 px
   */
  burstStarSparkle(x, y) {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const spark = this.add.circle(x, y, s(3), 0xFFD60A, 0.9).setDepth(11);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * s(38),
        y: y + Math.sin(angle) * s(38),
        alpha: 0,
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy()
      });
    }
  }

  /**
   * 보상 항목 목록. 골드·EXP 를 먼저 두고 드롭 아이템을 뒤에 붙인다.
   * @returns {Array<{icon:string, label:string, value:string, color:string}>}
   */
  buildRewardEntries() {
    const entries = [
      { icon: 'coin', label: '골드', value: `+${(this.rewards.gold || 0).toLocaleString()}`, color: '#FFD60A' },
      { icon: 'star', label: 'EXP', value: `+${(this.rewards.exp || 0).toLocaleString()}`, color: '#06BBFA' }
    ];

    const items = Array.isArray(this.rewards.items) ? this.rewards.items : [];
    items.slice(0, 4).forEach(item => {
      entries.push({
        icon: 'gem',
        label: item.name || item.itemId || item.id || '아이템',
        value: item.count ? `x${item.count}` : '획득',
        color: '#10B981'
      });
    });

    return entries;
  }

  createRewardsPanel() {
    const band = RESULT_LAYOUT.reward;
    const entries = this.buildRewardEntries();
    const cols = 3;
    const rows = Math.max(1, Math.ceil(entries.length / cols));
    const panelH = s(band.h);

    const panel = GlassPanel.create(this, {
      x: s(band.x + band.w / 2),
      y: s(band.y) + panelH / 2,
      w: s(band.w),
      h: panelH,
      variant: GLASS_VARIANT.PANEL,
      tint: this.getResultAccent(),
      bgKey: this.resultBgKey,
      depth: 8
    });
    panel.setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 400, delay: 400 });

    this.add.text(s(band.x + 24), s(band.y + 26), '보상', ts('subtitle', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0, 0.5).setDepth(10);

    const gridTop = band.y + 54;
    const cellW = band.w / cols;
    const cellH = (band.h - 62) / rows;

    entries.forEach((entry, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const cx = s(band.x + cellW * (col + 0.5));
      const cy = s(gridTop + cellH * (row + 0.5));

      // 슬롯 프레임 — 텍스처가 없으면 NineSliceFrame 이 폴백 프레임을 그린다
      NineSliceFrame.create(this, {
        x: cx,
        y: cy,
        w: s(cellW - 16),
        h: s(cellH - 12),
        key: 'frame_card_R',
        depth: 9
      }).setAlpha(0.9);

      const iconKey = IconFactory.createIcon(this, entry.icon, s(DESIGN.icon.lg));
      this.add.image(cx, cy - s(20), iconKey).setOrigin(0.5).setDepth(10);

      this.add.text(cx, cy + s(14), entry.value, ts('num.md', {
        color: entry.color,
        fontStyle: 'bold'
      })).setOrigin(0.5).setDepth(10);

      this.add.text(cx, cy + s(36), entry.label, ts('caption', {
        color: DESIGN.colors.text.muted
      })).setOrigin(0.5).setDepth(10);
    });
  }

  /**
   * 파티 4인 획득 EXP 바 + 레벨업 배지 (§3-9 공백 구간 해소).
   * 정확한 EXP 곡선은 ProgressionSystem 소관이라 여기서는 이번 전투 배분량만 보여 준다.
   */
  createPartyExpPanel() {
    const party = Array.isArray(this.party) ? this.party.slice(0, 4) : [];
    if (party.length === 0) {
      this.createBattleStats();
      return;
    }

    const slots = computePartyExpSlots(party.length);
    const totalExp = this.rewards.exp || 0;
    const perHero = party.length > 0 ? Math.floor(totalExp / party.length) : 0;

    this.add.text(s(RESULT_LAYOUT.party.x + 24), s(RESULT_LAYOUT.party.y - 18), '파티 획득 경험치', ts('label', {
      color: DESIGN.colors.text.primary,
      stroke: '#000000',
      strokeThickness: s(3)
    })).setOrigin(0, 0.5).setDepth(10);

    slots.forEach((slot, index) => {
      const hero = party[index];
      const levelUp = this.levelUpResults.find(r => r.name === hero?.name);

      GlassPanel.create(this, {
        x: s(slot.x),
        y: s(slot.y),
        w: s(slot.w),
        h: s(slot.h - 6),
        variant: GLASS_VARIANT.CARD,
        bgKey: this.resultBgKey,
        depth: 8
      });

      const left = s(slot.x - slot.w / 2);

      this.add.text(left + s(20), s(slot.y - 12), hero?.name || '???', ts('body', {
        color: DESIGN.colors.text.primary
      })).setOrigin(0, 0.5).setDepth(10);

      this.add.text(s(slot.x + slot.w / 2) - s(20), s(slot.y - 12), `+${perHero.toLocaleString()} EXP`, ts('num.sm', {
        color: '#06BBFA'
      })).setOrigin(1, 0.5).setDepth(10);

      // EXP 게이지 — 비율을 지어내지 않는다. 이번에 들어간 경험치가
      // 왼쪽에서 차오르는 연출로만 보여 주고, 정확한 값은 위의 숫자가 말한다
      const barW = s(slot.w - 40);
      const barX = left + s(20);
      const barY = s(slot.y + 14);

      const track = this.add.graphics().setDepth(10);
      track.fillStyle(DESIGN.colors.bg.surface, 1);
      track.fillRoundedRect(barX, barY, barW, s(8), s(4));

      const fillBar = this.add.rectangle(barX, barY + s(4), 0, s(8), 0x06BBFA, 1)
        .setOrigin(0, 0.5)
        .setDepth(11);
      this.tweens.add({
        targets: fillBar,
        width: perHero > 0 ? barW : s(4),
        duration: 700,
        delay: 300 + index * 120,
        ease: 'Cubic.easeOut'
      });

      if (levelUp) {
        const badgeRight = s(slot.x + slot.w / 2) - s(20);
        const badge = this.add.graphics().setDepth(10);
        badge.fillStyle(DESIGN.colors.status.success, 0.9);
        badge.fillRoundedRect(badgeRight - s(104), barY - s(7), s(104), s(24), s(12));
        this.add.text(badgeRight - s(52), barY + s(5), `Lv.${levelUp.newLevel} 달성`, ts('num.sm', {
          color: '#0F172A',
          fontStyle: 'bold'
        })).setOrigin(0.5).setDepth(11);
      }
    });

    // 전투 통계는 파티 대역 아래 한 줄로 줄인다
    this.createBattleStats();
  }

  createBattleStats() {
    const band = RESULT_LAYOUT.party;
    const y = s(band.y + band.h + 16);
    const line = `${this.turnCount}턴 · 생존 ${this.aliveCount}/${this.totalAllies}`;
    this.add.text(GAME_WIDTH / 2, y, line, ts('num.sm', {
      color: DESIGN.colors.text.secondary,
      stroke: '#000000',
      strokeThickness: s(3)
    })).setOrigin(0.5).setDepth(10);
  }

  /**
   * 이 스테이지의 연속 패배 횟수. 승리하면 0으로 지운다.
   * 세이브가 아니라 registry에 둔다 — 세션 안에서만 의미가 있는 값이고
   * SaveManager는 수정 금지 대상이라 필드를 늘릴 수 없다.
   * @returns {number}
   */
  trackFailCount() {
    const stageId = this.stage?.id;
    if (!stageId) return this.victory ? 0 : 1;

    const counts = this.registry.get('stageFailCounts') || {};
    if (this.victory) {
      delete counts[stageId];
      this.registry.set('stageFailCounts', counts);
      return 0;
    }
    counts[stageId] = (counts[stageId] || 0) + 1;
    this.registry.set('stageFailCounts', counts);
    return counts[stageId];
  }

  /**
   * 편성 전투력. 스테이지 선택 화면의 "총 전투력"과 같은 식을 써서
   * 플레이어가 방금 본 숫자와 진단의 숫자가 어긋나지 않게 한다.
   * @returns {number}
   */
  getPartyPower() {
    if (!Array.isArray(this.party)) return 0;
    return this.party.reduce((sum, hero) => {
      const st = hero?.stats;
      if (!st) return sum;
      return sum + (st.hp || 0) + (st.atk || 0) * 5 + (st.def || 0) * 3 + (st.spd || 0) * 2;
    }, 0);
  }

  /**
   * T-Q3: 패배 진단 + 보스 에너지 환급.
   * 승리했거나 스토리 스테이지가 아니면 아무것도 하지 않는다.
   */
  /**
   * SND-01: 결과 화면 사운드.
   * 승패 스팅(루프 없음)을 틀고 길이만큼 기다렸다가 로비 테마로 크로스페이드한다.
   */
  playResultBGM() {
    // BGM 스팅 자체가 팡파르/하강 연출이라 같은 이름의 SFX 를 겹쳐 틀지 않는다
    const sting = this.victory ? 'victory' : 'defeat';
    soundManager.playBGM(sting, 0);
    this.time.delayedCall(RESULT_STING_MS, () => {
      soundManager.playBGM('main_theme');
    });
  }

  prepareDefeatGuidance() {
    if (this.victory) {
      this.trackFailCount();
      return;
    }

    const failCount = this.trackFailCount();
    const spentEnergy = this.stage?.energyCost || 0;

    this.defeatGuidance = buildDefeatGuidance({
      stage: this.stage,
      power: this.getPartyPower(),
      failCount,
      enemyHpRemainRatio: this.enemyHpRemainRatio,
      spentEnergy,
    });

    // LV-01: 보스 패배는 에너지 50%를 돌려준다.
    // 20 × 5회 실패 = 일일 탱크 98% 소진으로 진행이 물리적으로 막히기 때문이다.
    const refund = getDefeatEnergyRefund(this.stage, spentEnergy);
    if (refund > 0 && isBossStage(this.stage)) {
      try {
        energySystem.addEnergy(refund);
      } catch (error) {
        console.warn('[BattleResultScene] 보스 패배 에너지 환급 실패:', error?.message);
      }
    }
  }

  createDefeatDisplay() {
    const centerX = GAME_WIDTH / 2;

    // 패배 타이틀 — display.xl Orbitron, status.error
    this.add.text(centerX, s(RESULT_LAYOUT.title.y), 'DEFEAT', ts('display.xl', {
      color: '#EF4444',
      stroke: '#000000',
      strokeThickness: s(4)
    })).setOrigin(0.5).setDepth(10);

    // 빈 별 3개 — 승리 화면과 같은 자리를 지켜 두 결과가 같은 화면으로 읽히게 한다
    this.createStarDisplay(centerX, s(RESULT_LAYOUT.stars.y));

    const g = this.defeatGuidance;
    const band = RESULT_LAYOUT.detail;

    GlassPanel.create(this, {
      x: s(band.x + band.w / 2),
      y: s(band.y + band.h / 2),
      w: s(band.w),
      h: s(band.h),
      variant: GLASS_VARIANT.PANEL,
      tint: this.getResultAccent(),
      bgKey: this.resultBgKey,
      depth: 8
    });

    // 실패 원인 요약 — 왜 졌는지를 숫자로 말한다 (UX §2-5 / LEVEL §4-3 진단 1줄)
    this.add.text(centerX, s(band.y + 44), g?.hint || '파티를 강화하고 다시 도전하세요', ts('subtitle', {
      color: '#FFD60A',
      wordWrap: { width: s(band.w - 80) },
      align: 'center'
    })).setOrigin(0.5).setDepth(10);

    if (g?.diagnosis) {
      this.add.text(centerX, s(band.y + 96), g.diagnosis, ts('label', {
        color: DESIGN.colors.text.secondary,
        wordWrap: { width: s(band.w - 60) },
        align: 'center'
      })).setOrigin(0.5).setDepth(10);
    }

    // 진행도 — 투자감 유지. 얼마나 근접했는지 보이면 재도전 의사가 유지된다.
    if (g?.progressText) {
      this.add.text(centerX, s(band.y + 148), g.progressText, ts('num.sm', {
        color: '#F97316'
      })).setOrigin(0.5).setDepth(10);

      const barW = s(band.w - 120);
      const barX = centerX - barW / 2;
      const barY = s(band.y + 170);
      const remain = Math.min(1, Math.max(0, Number(this.enemyHpRemainRatio) || 0));
      const bar = this.add.graphics().setDepth(10);
      bar.fillStyle(DESIGN.colors.bg.surface, 1);
      bar.fillRoundedRect(barX, barY, barW, s(10), s(5));
      bar.fillStyle(DESIGN.colors.status.error, 1);
      bar.fillRoundedRect(barX, barY, Math.max(s(6), barW * remain), s(10), s(5));
    }

    // 전투 통계 (패배 시에도)
    if (this.stage) {
      this.add.text(centerX, s(band.y + 214), this.stage.name || `Stage ${this.stage.id}`, ts('label', {
        color: DESIGN.colors.text.muted
      })).setOrigin(0.5).setDepth(10);
    }

    // 재도전 에너지 고지 (보스는 50% 환급까지 명시)
    if (g?.retryWarning) {
      this.add.text(centerX, s(band.y + 252), g.retryWarning, ts('caption', {
        color: DESIGN.colors.text.muted,
        wordWrap: { width: s(band.w - 60) },
        align: 'center'
      })).setOrigin(0.5).setDepth(10);
    }

    // '이번 편성' 라벨과 같은 줄의 오른쪽 끝. 가운데 두면 라벨과 겹친다
    this.add.text(s(RESULT_LAYOUT.defeatParty.x + RESULT_LAYOUT.defeatParty.w - 24),
      s(RESULT_LAYOUT.defeatParty.y - 18), `${this.turnCount}턴 · 생존 ${this.aliveCount}/${this.totalAllies}`,
      ts('num.sm', {
        color: DESIGN.colors.text.secondary,
        stroke: '#000000',
        strokeThickness: s(3)
      })).setOrigin(1, 0.5).setDepth(10);

    // 진단 패널과 액션 버튼 사이가 비어 있으면 "무엇을 고쳐야 하는가"가 끊긴다.
    // 이번 편성을 그대로 보여 주고 빈 슬롯을 드러내 다음 행동에 연결한다.
    this.createDefeatPartyPanel();
  }

  /**
   * 패배 화면의 편성 진단. 출전한 4칸을 그대로 보여 주고
   * 비어 있는 칸은 점선으로 남긴다 — "동료를 늘리면 넘을 수 있습니다" 조언의 근거다.
   */
  createDefeatPartyPanel() {
    const party = Array.isArray(this.party) ? this.party.slice(0, 4) : [];
    const band = RESULT_LAYOUT.defeatParty;
    const slots = computePartyExpSlots(4, band);

    this.add.text(s(band.x + 24), s(band.y - 18), '이번 편성', ts('label', {
      color: DESIGN.colors.text.primary,
      stroke: '#000000',
      strokeThickness: s(3)
    })).setOrigin(0, 0.5).setDepth(10);

    slots.forEach((slot, index) => {
      const hero = party[index];
      const left = s(slot.x - slot.w / 2);
      const right = s(slot.x + slot.w / 2);

      if (!hero) {
        // 빈 칸 — 자물쇠나 물음표 대신 점선으로 남긴다
        const dash = this.add.graphics().setDepth(10);
        dash.lineStyle(s(2), DESIGN.effects.borderColor, 1);
        dash.strokeRoundedRect(left, s(slot.y - slot.h / 2 + 3), s(slot.w), s(slot.h - 6), s(DESIGN.radius.md));
        this.add.text(s(slot.x), s(slot.y), '빈 자리', ts('label', {
          color: DESIGN.colors.text.muted
        })).setOrigin(0.5).setDepth(11);
        return;
      }

      GlassPanel.create(this, {
        x: s(slot.x),
        y: s(slot.y),
        w: s(slot.w),
        h: s(slot.h - 6),
        variant: GLASS_VARIANT.CARD,
        bgKey: this.resultBgKey,
        depth: 8
      });

      const st = hero.stats || {};
      const power = (st.hp || 0) + (st.atk || 0) * 5 + (st.def || 0) * 3 + (st.spd || 0) * 2;

      const classIcon = IconFactory.createImage(this, left + s(30), s(slot.y), hero.class || 'warrior', 'md', {
        tint: DESIGN.colors.brand.primary
      });
      if (classIcon) classIcon.setDepth(11);

      this.add.text(left + s(60), s(slot.y), hero.name || '???', ts('body', {
        color: DESIGN.colors.text.primary
      })).setOrigin(0, 0.5).setDepth(11);

      this.add.text(right - s(20), s(slot.y), power.toLocaleString(), ts('num.md', {
        color: '#FFD60A'
      })).setOrigin(1, 0.5).setDepth(11);
    });

    // 합계 — 진단 문구의 "내 파티" 숫자와 같은 식을 쓴다
    this.add.text(GAME_WIDTH / 2, s(band.y + band.h + 14),
      `총 전투력 ${this.getPartyPower().toLocaleString()}`, ts('num.sm', {
        color: DESIGN.colors.text.secondary,
        stroke: '#000000',
        strokeThickness: s(3)
      })).setOrigin(0.5).setDepth(10);
  }

  createActionButtons() {
    const buttons = [];

    if (this.victory) {
      // 다음 스테이지 버튼
      let label = '다음 스테이지';
      if (this.mode === 'boss') label = '스테이지 진행';
      if (this.mode === 'tower') label = '타워로 복귀';

      buttons.push({
        label,
        color: COLORS.primary,
        action: () => this.goToNextStage()
      });

      // 소탕 버튼 (3성일 때만, 보스전 모드 제외)
      if (this.stars >= 3 && this.stage && this.mode !== 'boss') {
        buttons.push({
          label: '소탕',
          color: COLORS.success,
          action: () => this.showSweepModal()
        });
      }

      // 재도전 버튼
      buttons.push({
        label: '재도전',
        color: COLORS.bgPanel,
        action: () => this.retryBattle()
      });
    } else {
      // T-Q3: 반복 실패 유도(3/5/7회)를 최상단에 둔다. 벽에 부딪힌 플레이어에게는
      // 재도전 버튼보다 "다음에 무엇을 할 수 있는가"가 먼저 보여야 한다(LD-2).
      const repeatStep = this.defeatGuidance?.repeatStep;
      if (repeatStep) {
        buttons.push({
          label: repeatStep.ctaLabel,
          color: COLORS.accent,
          action: () => this.handleRepeatFailAction(repeatStep.action)
        });
      }

      // 보스는 파티 편성이 가장 유효한 행동이다(LEVEL §4-3 버튼 A 기본 포커스).
      // 일반 스테이지는 즉시 재도전이 이탈 방지에 유리하다(UX §2-5).
      const bossFirst = isBossStage(this.stage);
      const retryBtn = {
        label: '재도전',
        color: bossFirst ? COLORS.secondary : COLORS.primary,
        action: () => this.retryBattle()
      };
      const partyBtn = {
        label: '파티 편성',
        color: bossFirst ? COLORS.primary : COLORS.secondary,
        action: () => this.goToPartyEdit()
      };
      buttons.push(...(bossFirst ? [partyBtn, retryBtn] : [retryBtn, partyBtn]));
    }

    // 메인으로 버튼 (항상)
    buttons.push({
      label: '메인으로',
      color: COLORS.bgPanel,
      action: () => this.goToMain()
    });

    // §3-9: 첫 버튼은 폭 100% primary, 나머지는 2분할 ghost
    const slots = computeResultButtonLayout(buttons.length);
    const accent = this.getResultAccent();

    buttons.forEach((btn, i) => {
      const slot = slots[i];
      if (!slot) return;

      const x = s(slot.x);
      const y = s(slot.y);
      const w = s(slot.w);
      const h = s(slot.h);

      // 라벨 캡슐·외곽선·터치 하한은 UIButton 이 공통으로 건다.
      // 9-slice 아트가 없으면 NineSliceFrame 폴백이 색 면을 대신 그리므로
      // 별도 fill 레이어는 두지 않는다 — 아트가 있을 때 모서리 투명부로 원색이 샜다
      UIButton.createParts(this, {
        x, y, w, h,
        label: btn.label,
        variant: slot.primary ? 'primary' : 'ghost',
        tint: slot.primary ? null : accent,
        token: slot.primary ? 'subtitle' : 'body',
        bold: true,
        depth: 12,
        onClick: btn.action
      });
    });
  }

  // === 소탕 모달 ===
  showSweepModal() {
    if (!this.stage) return;

    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setDepth(50).setInteractive();

    const panelW = s(340);
    const panelH = s(320);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH, COLORS.bgLight, 0.98)
      .setDepth(51).setStrokeStyle(s(2), COLORS.primary);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(120), '⚡ 소탕', {
      fontSize: sf(24), fontFamily: 'Noto Sans KR',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(52);

    // 소탕 가능 여부 체크
    const canSweep = sweepSystem.canSweep(this.stage.id, 1);

    // 남은 횟수 표시
    const remaining = sweepSystem.getDailyRemaining();
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(75), `남은 소탕: ${remaining}회`, {
      fontSize: sf(16), fontFamily: 'Noto Sans KR',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setDepth(52);

    // 횟수 선택
    let sweepCount = 1;
    const maxSweep = Math.min(remaining, 10);

    const countText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(30), `${sweepCount}회`, {
      fontSize: sf(28), fontFamily: 'Noto Sans KR',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(52);

    // -/+ 버튼
    const minusBtn = this.add.text(GAME_WIDTH / 2 - s(80), GAME_HEIGHT / 2 - s(30), '◀', {
      fontSize: sf(28), color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    const plusBtn = this.add.text(GAME_WIDTH / 2 + s(80), GAME_HEIGHT / 2 - s(30), '▶', {
      fontSize: sf(28), color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    minusBtn.on('pointerdown', () => {
      if (sweepCount > 1) { sweepCount--; countText.setText(`${sweepCount}회`); updatePreview(); }
    });
    plusBtn.on('pointerdown', () => {
      if (sweepCount < maxSweep) { sweepCount++; countText.setText(`${sweepCount}회`); updatePreview(); }
    });

    // 예상 보상 미리보기
    const previewText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(30), '', {
      fontSize: sf(14), fontFamily: 'Noto Sans KR',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`,
      align: 'center'
    }).setOrigin(0.5).setDepth(52);

    const updatePreview = () => {
      const preview = sweepSystem.calculateRewards(this.stage.id, sweepCount);
      if (preview) {
        previewText.setText(`예상: 🪙 ${preview.gold} / ⭐ ${preview.exp} EXP`);
      }
    };
    updatePreview();

    // 소탕 실행 버튼
    const execBtn = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(90), s(180), s(50),
      canSweep.canSweep !== false ? COLORS.success : COLORS.bgPanel)
      .setDepth(52).setInteractive({ useHandCursor: true });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(90), '소탕 실행', {
      fontSize: sf(18), fontFamily: 'Noto Sans KR',
      color: '#FFFFFF', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(52);

    execBtn.on('pointerdown', () => {
      const result = sweepSystem.executeSweep(this.stage.id, sweepCount);
      if (result && result.success) {
        // 보상 적용
        if (result.rewards.gold) {
          const newGold = SaveManager.addGold(result.rewards.gold);
          this.registry.set('gold', newGold);
        }
        this.closeSweepModal(overlay, panel);
        this.showToast(`소탕 완료! 🪙 +${result.rewards.gold || 0}`);
      } else {
        this.showToast(result?.error || '소탕 실패!');
      }
    });

    // 닫기 버튼
    const closeBtn = this.add.text(GAME_WIDTH / 2 + panelW / 2 - s(20), GAME_HEIGHT / 2 - panelH / 2 + s(20), '✕', {
      fontSize: sf(24), color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => this.closeSweepModal(overlay, panel));

    // 모달 요소 저장 (닫기용)
    this.sweepModalElements = [overlay, panel, countText, minusBtn, plusBtn, previewText, execBtn, closeBtn];
  }

  closeSweepModal(overlay) {
    if (this.sweepModalElements) {
      this.sweepModalElements.forEach(el => { if (el && el.destroy) el.destroy(); });
      this.sweepModalElements = null;
    }
    // depth 52 요소들도 정리
    this.children.list
      .filter(c => c.depth >= 50 && c.depth <= 52)
      .forEach(c => c.destroy());
  }

  // === 네비게이션 (D-1.5: 중복 전환 방지 + TransitionManager) ===
  _navigate(sceneName, data = {}) {
    if (this.transitioning) return;
    this.transitioning = true;
    transitionManager.fadeTransition(this, sceneName, data);
  }

  goToNextStage() {
    if (this.transitioning) return;
    this.transitioning = true;

    // 타워 모드: TowerScene으로 복귀
    if (this.mode === 'tower') {
      transitionManager.fadeTransition(this, 'TowerScene');
      return;
    }

    // 보스 모드 또는 일반 모드: MainMenuScene으로 복귀
    const data = this.mode === 'boss' ? { bossVictory: true } : {};
    transitionManager.slideTransition(this, 'MainMenuScene', data, 'left');
  }

  retryBattle() {
    if (this.transitioning) return;
    this.transitioning = true;
    transitionManager.battleEntryTransition(this, { stage: this.stage, party: this.party });
  }

  /**
   * 반복 실패 유도 CTA 처리 (UX §2-5).
   * @param {'gacha'|'autoparty'|'idle'} action
   */
  handleRepeatFailAction(action) {
    if (this.transitioning) return;
    if (action === 'autoparty') {
      this.goToPartyEdit();
      return;
    }
    this.transitioning = true;
    // 유휴전투 유도는 메인 메뉴 자체가 유휴전투 뷰를 갖고 있으므로 팝업을 열지 않는다.
    const payload = action === 'gacha' ? { openPopup: 'gacha' } : {};
    this.scene.start('MainMenuScene', payload);
  }

  goToPartyEdit() {
    this._navigate('PartyEditScene', { returnTo: 'MainMenuScene', stage: this.stage });
  }

  goToMain() {
    if (this.transitioning) return;
    this.transitioning = true;
    navigationManager.goBackToScene(this, 'MainMenuScene');
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, message, {
      fontSize: sf(18),
      fontFamily: 'Noto Sans KR',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${  COLORS.bgLight.toString(16).padStart(6, '0')}`,
      padding: { x: s(20), y: s(12) }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: toast,
      y: toast.y - s(50),
      alpha: 0,
      duration: 1500,
      delay: 500,
      onComplete: () => toast.destroy()
    });
  }

  shutdown() {
    this.transitioning = false;
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
    if (this.particles) {
      this.particles.destroy();
      this.particles = null;
    }
  }
}
