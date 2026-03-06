/**
 * PvPPopup - PvP 전투 팝업 UI (GP-1)
 *
 * 3-탭 구조:
 *   Tab 1 (대전): 비슷한 전투력 상대 목록 표시 + 전투 실행
 *   Tab 2 (결과): 최근 전투 결과 표시
 *   Tab 3 (랭킹): 글로벌 리더보드 TOP 20
 *
 * PopupBase 상속, PvPSystem 사용
 */

import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf } from '../../config/gameConfig.js';
import { PvPSystem } from '../../systems/PvPSystem.js';

// 탭 인덱스 상수
const TAB = { BATTLE: 0, RESULT: 1, RANKING: 2 };

// 랭크 티어별 색상
const TIER_COLORS = {
  master:   '#FF4500',
  diamond:  '#00BFFF',
  platinum: '#40E0D0',
  gold:     '#FFD700',
  silver:   '#C0C0C0',
  bronze:   '#CD7F32'
};

// 결과 표시 텍스트
const RESULT_LABELS = {
  win:  '승리',
  lose: '패배',
  draw: '무승부'
};

const RESULT_COLORS = {
  win:  '#10B981',
  lose: '#EF4444',
  draw: '#F59E0B'
};

export class PvPPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '⚔️ PvP 아레나',
      width: s(680),
      height: s(1100),
      ...options
    });

    this._activeTab = TAB.BATTLE;
    this._opponents = [];
    this._rankings = [];
    this._myRecord = null;
    this._lastBattleResult = null;
    this._isLoading = false;
    this._tabObjects = [];
  }

  buildContent() {
    this._renderTabs();
    this._loadAndRenderTab(TAB.BATTLE);
  }

  // ─────────────────────────────────────────
  // 탭 렌더링
  // ─────────────────────────────────────────

  _renderTabs() {
    const b = this.contentBounds;
    const tabLabels = ['대전', '결과', '랭킹'];
    const tabW = b.width / 3;

    tabLabels.forEach((label, idx) => {
      const tx = b.left + tabW * idx + tabW / 2;
      const ty = b.top + s(20);

      const isActive = idx === this._activeTab;
      const bg = this.scene.add.rectangle(tx, ty, tabW - s(4), s(36),
        isActive ? COLORS.primary : COLORS.bgLight, 1);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (!this._isLoading) this._loadAndRenderTab(idx);
      });
      this.contentContainer.add(bg);

      const txt = this.scene.add.text(tx, ty, label, {
        fontSize: sf(15),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: isActive ? 'bold' : 'normal',
        color: isActive ? '#FFFFFF' : '#94A3B8'
      }).setOrigin(0.5);
      this.contentContainer.add(txt);
    });
  }

  // ─────────────────────────────────────────
  // 탭 전환 + 데이터 로드
  // ─────────────────────────────────────────

  _loadAndRenderTab(tabIdx) {
    this._activeTab = tabIdx;
    this._clearTabContent();
    this._renderTabs();

    const b = this.contentBounds;
    const contentTop = b.top + s(60);

    this._isLoading = true;
    const loadingText = this.scene.add.text(b.centerX, contentTop + s(60), '로딩 중...', {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#94A3B8'
    }).setOrigin(0.5);
    this.contentContainer.add(loadingText);
    this._tabObjects.push(loadingText);

    if (tabIdx === TAB.BATTLE) {
      this._loadBattleTab(contentTop, loadingText);
    } else if (tabIdx === TAB.RESULT) {
      this._loadResultTab(contentTop, loadingText);
    } else {
      this._loadRankingTab(contentTop, loadingText);
    }
  }

  _clearTabContent() {
    this._tabObjects.forEach(obj => {
      if (obj && obj.scene) obj.destroy();
    });
    this._tabObjects = [];
  }

  // ─────────────────────────────────────────
  // Tab 1: 대전 — 상대 목록
  // ─────────────────────────────────────────

  async _loadBattleTab(contentTop, loadingText) {
    // 내 스냅샷 업데이트 + 상대 조회 병렬 실행
    const [, opponentResult] = await Promise.all([
      PvPSystem.savePartySnapshot(),
      PvPSystem.findOpponents()
    ]);

    if (loadingText && loadingText.scene) loadingText.destroy();
    this._isLoading = false;

    this._opponents = opponentResult.opponents || [];

    const b = this.contentBounds;
    const cx = b.centerX;

    // 안내 텍스트
    const infoText = opponentResult.offline
      ? '오프라인 상태 — 캐시된 상대 표시'
      : `${this._opponents.length}명의 상대를 찾았습니다`;

    const infoLabel = this.scene.add.text(cx, contentTop, infoText, {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: opponentResult.offline ? '#F59E0B' : '#94A3B8'
    }).setOrigin(0.5);
    this.contentContainer.add(infoLabel);
    this._tabObjects.push(infoLabel);

    if (this._opponents.length === 0) {
      const noOpponent = this.scene.add.text(cx, contentTop + s(100),
        '매칭 가능한 상대가 없습니다\n전투력이 비슷한 플레이어를 기다리는 중...', {
          fontSize: sf(15),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: '#94A3B8',
          align: 'center',
          wordWrap: { width: b.width - s(40) }
        }).setOrigin(0.5);
      this.contentContainer.add(noOpponent);
      this._tabObjects.push(noOpponent);
      return;
    }

    const itemH = s(100);
    this._opponents.forEach((opponent, idx) => {
      const itemY = contentTop + s(30) + idx * (itemH + s(8));
      this._renderOpponentCard(opponent, cx, itemY, b.width - s(20), itemH);
    });
  }

  /**
   * 상대 카드 렌더링
   */
  _renderOpponentCard(opponent, cx, cy, w, h) {
    const bg = this.scene.add.rectangle(cx, cy, w, h, COLORS.bgLight, 0.9);
    bg.setStrokeStyle(s(2), COLORS.primary, 0.3);
    bg.setInteractive({ useHandCursor: true });
    this.contentContainer.add(bg);
    this._tabObjects.push(bg);

    // 플레이어 이름
    const nameText = this.scene.add.text(cx - w / 2 + s(15), cy - s(20),
      opponent.player_name || '???', {
        fontSize: sf(17),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold',
        color: '#F8FAFC'
      }).setOrigin(0, 0.5);
    this.contentContainer.add(nameText);
    this._tabObjects.push(nameText);

    // 전투력
    const powerText = this.scene.add.text(cx - w / 2 + s(15), cy + s(10),
      `전투력 ${(opponent.combat_power || 0).toLocaleString()}`, {
        fontSize: sf(13),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#94A3B8'
      }).setOrigin(0, 0.5);
    this.contentContainer.add(powerText);
    this._tabObjects.push(powerText);

    // 전투 버튼
    const btnBg = this.scene.add.rectangle(cx + w / 2 - s(70), cy, s(110), s(44),
      COLORS.danger, 1);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerover', () => btnBg.setAlpha(0.8));
    btnBg.on('pointerout', () => btnBg.setAlpha(1));
    btnBg.on('pointerdown', () => this._onAttackPressed(opponent));
    this.contentContainer.add(btnBg);
    this._tabObjects.push(btnBg);

    const btnText = this.scene.add.text(cx + w / 2 - s(70), cy, '전투!', {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);
    this.contentContainer.add(btnText);
    this._tabObjects.push(btnText);
  }

  /**
   * 전투 버튼 클릭 처리
   */
  async _onAttackPressed(opponent) {
    if (this._isLoading) return;
    this._isLoading = true;

    this._clearTabContent();
    this._renderTabs();

    const b = this.contentBounds;
    const loadingText = this.scene.add.text(b.centerX, b.top + s(120), '전투 중...', {
      fontSize: sf(20),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold',
      color: '#F59E0B'
    }).setOrigin(0.5);
    this.contentContainer.add(loadingText);
    this._tabObjects.push(loadingText);

    const battleResult = await PvPSystem.executePvPBattle(opponent);
    this._isLoading = false;
    this._lastBattleResult = { ...battleResult, opponent };

    // 결과 탭으로 자동 전환
    this._loadAndRenderTab(TAB.RESULT);
  }

  // ─────────────────────────────────────────
  // Tab 2: 결과
  // ─────────────────────────────────────────

  async _loadResultTab(contentTop, loadingText) {
    const myRecord = await PvPSystem.getMyRecord();
    if (loadingText && loadingText.scene) loadingText.destroy();
    this._isLoading = false;

    const b = this.contentBounds;
    const cx = b.centerX;
    let offsetY = contentTop;

    // 마지막 전투 결과 표시
    if (this._lastBattleResult) {
      const { result, scoreChange, newScore, log, opponent } = this._lastBattleResult;
      const resultColor = RESULT_COLORS[result] || '#94A3B8';
      const resultLabel = RESULT_LABELS[result] || result;

      const resultText = this.scene.add.text(cx, offsetY + s(30), resultLabel, {
        fontSize: sf(40),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold',
        color: resultColor
      }).setOrigin(0.5);
      this.contentContainer.add(resultText);
      this._tabObjects.push(resultText);

      const vsText = this.scene.add.text(cx, offsetY + s(75),
        `vs ${opponent?.player_name || '???'}`, {
          fontSize: sf(15),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: '#94A3B8'
        }).setOrigin(0.5);
      this.contentContainer.add(vsText);
      this._tabObjects.push(vsText);

      const scoreSign = scoreChange >= 0 ? `+${scoreChange}` : `${scoreChange}`;
      const scoreText = this.scene.add.text(cx, offsetY + s(105),
        `점수 변동: ${scoreSign}  →  ${newScore}점`, {
          fontSize: sf(16),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: scoreChange >= 0 ? '#10B981' : '#EF4444'
        }).setOrigin(0.5);
      this.contentContainer.add(scoreText);
      this._tabObjects.push(scoreText);

      // 전투 로그 (최대 5줄)
      if (Array.isArray(log) && log.length > 0) {
        log.slice(0, 5).forEach((line, i) => {
          const logLine = this.scene.add.text(cx, offsetY + s(135) + i * s(22), line, {
            fontSize: sf(12),
            fontFamily: '"Noto Sans KR", sans-serif',
            color: '#64748B',
            wordWrap: { width: b.width - s(40) }
          }).setOrigin(0.5);
          this.contentContainer.add(logLine);
          this._tabObjects.push(logLine);
        });
      }

      offsetY += s(280);
    }

    // 내 전적 요약
    if (myRecord.success && myRecord.record) {
      const rec = myRecord.record;
      const tierColor = TIER_COLORS[rec.rank_tier] || '#C0C0C0';

      const tierText = this.scene.add.text(cx, offsetY + s(20),
        `${rec.rank_tier?.toUpperCase() || 'BRONZE'} — ${rec.score || 0}점`, {
          fontSize: sf(22),
          fontFamily: '"Noto Sans KR", sans-serif',
          fontStyle: 'bold',
          color: tierColor
        }).setOrigin(0.5);
      this.contentContainer.add(tierText);
      this._tabObjects.push(tierText);

      const wldText = this.scene.add.text(cx, offsetY + s(55),
        `${rec.wins || 0}승 ${rec.losses || 0}패 ${rec.draws || 0}무`, {
          fontSize: sf(16),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: '#94A3B8'
        }).setOrigin(0.5);
      this.contentContainer.add(wldText);
      this._tabObjects.push(wldText);
    }
  }

  // ─────────────────────────────────────────
  // Tab 3: 랭킹
  // ─────────────────────────────────────────

  async _loadRankingTab(contentTop, loadingText) {
    const { success, rankings, myRank, offline } = await PvPSystem.getLeaderboard(20);
    if (loadingText && loadingText.scene) loadingText.destroy();
    this._isLoading = false;

    this._rankings = rankings;

    const b = this.contentBounds;
    const cx = b.centerX;

    if (offline) {
      const offlineNote = this.scene.add.text(cx, contentTop, '오프라인 — 캐시 데이터', {
        fontSize: sf(12),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#F59E0B'
      }).setOrigin(0.5);
      this.contentContainer.add(offlineNote);
      this._tabObjects.push(offlineNote);
    }

    if (!success || rankings.length === 0) {
      const emptyText = this.scene.add.text(cx, contentTop + s(80),
        '랭킹 데이터가 없습니다', {
          fontSize: sf(16),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: '#94A3B8'
        }).setOrigin(0.5);
      this.contentContainer.add(emptyText);
      this._tabObjects.push(emptyText);
      return;
    }

    // 내 순위 표시 (있을 경우)
    if (myRank) {
      const myRankText = this.scene.add.text(cx, contentTop + s(10),
        `내 순위: ${myRank}위`, {
          fontSize: sf(14),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: '#6366F1'
        }).setOrigin(0.5);
      this.contentContainer.add(myRankText);
      this._tabObjects.push(myRankText);
    }

    const itemH = s(46);
    const listTop = contentTop + s(36);

    rankings.forEach((entry, idx) => {
      const itemY = listTop + idx * (itemH + s(2));
      this._renderRankingRow(entry, cx, itemY, b.width - s(20), itemH, idx);
    });
  }

  /**
   * 랭킹 행 렌더링
   */
  _renderRankingRow(entry, cx, cy, w, h, idx) {
    const isTop3 = idx < 3;
    const bgColor = isTop3 ? COLORS.bgPanel : COLORS.bgLight;
    const bg = this.scene.add.rectangle(cx, cy, w, h, bgColor, 0.8);
    this.contentContainer.add(bg);
    this._tabObjects.push(bg);

    // 순위
    const rankColor = ['#FFD700', '#C0C0C0', '#CD7F32'][idx] || '#94A3B8';
    const rankText = this.scene.add.text(cx - w / 2 + s(20), cy,
      `${entry.rank}`, {
        fontSize: sf(isTop3 ? 18 : 14),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: isTop3 ? 'bold' : 'normal',
        color: rankColor
      }).setOrigin(0.5);
    this.contentContainer.add(rankText);
    this._tabObjects.push(rankText);

    // 티어 뱃지
    const tierColor = TIER_COLORS[entry.rank_tier] || '#94A3B8';
    const tierBadge = this.scene.add.text(cx - w / 2 + s(48), cy,
      entry.rank_tier?.toUpperCase()?.slice(0, 2) || 'BR', {
        fontSize: sf(10),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold',
        color: tierColor,
        backgroundColor: '#1E293B',
        padding: { x: s(3), y: s(2) }
      }).setOrigin(0.5);
    this.contentContainer.add(tierBadge);
    this._tabObjects.push(tierBadge);

    // 플레이어 이름
    const nameText = this.scene.add.text(cx - w / 2 + s(75), cy,
      entry.player_name || '???', {
        fontSize: sf(14),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#F8FAFC'
      }).setOrigin(0, 0.5);
    this.contentContainer.add(nameText);
    this._tabObjects.push(nameText);

    // 점수
    const scoreText = this.scene.add.text(cx + w / 2 - s(60), cy,
      `${entry.score}점`, {
        fontSize: sf(14),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold',
        color: '#F59E0B'
      }).setOrigin(0.5);
    this.contentContainer.add(scoreText);
    this._tabObjects.push(scoreText);

    // 승패 기록
    const wlText = this.scene.add.text(cx + w / 2 - s(130), cy,
      `${entry.wins}W ${entry.losses}L`, {
        fontSize: sf(11),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#64748B'
      }).setOrigin(0.5);
    this.contentContainer.add(wlText);
    this._tabObjects.push(wlText);
  }
}
