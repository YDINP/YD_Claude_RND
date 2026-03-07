/**
 * SweepRewardPopup - 소탕 완료 보상 팝업
 * 소탕(자동 전투) 완료 후 획득 보상 내역을 표시한다.
 */
import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf } from '../../config/gameConfig.js';

export class SweepRewardPopup extends PopupBase {
  /**
   * @param {Phaser.Scene} scene - 현재 씬
   * @param {Object} rewardData - 소탕 결과 데이터
   * @param {string}  rewardData.stageId   - 소탕한 스테이지 ID
   * @param {string}  rewardData.stageName - 스테이지 표시 이름
   * @param {number}  rewardData.count     - 소탕 횟수
   * @param {number}  rewardData.gold      - 획득 골드
   * @param {number}  rewardData.exp       - 획득 경험치
   * @param {Array}   rewardData.items     - 획득 아이템 목록 [{ itemId, quantity }]
   * @param {number}  rewardData.energyCost - 소모된 에너지
   * @param {Object}  options - PopupBase 옵션
   */
  constructor(scene, rewardData = {}, options = {}) {
    super(scene, {
      title: '소탕 완료',
      width: s(560),
      height: s(700),
      ...options
    });

    this.rewardData = {
      stageId: rewardData.stageId || '',
      stageName: rewardData.stageName || rewardData.stageId || '알 수 없음',
      count: rewardData.count || 1,
      gold: rewardData.gold || 0,
      exp: rewardData.exp || 0,
      items: rewardData.items || [],
      energyCost: rewardData.energyCost || 0,
    };
  }

  buildContent() {
    this._buildStageBanner();
    this._buildRewardRows();
    this._buildItemList();
    this._buildConfirmButton();
  }

  /**
   * 상단 스테이지 정보 배너
   * @private
   */
  _buildStageBanner() {
    const { left, top, width, centerX } = this.contentBounds;
    const bannerH = s(70);

    // 배너 배경
    const banner = this.scene.add.graphics();
    banner.fillStyle(0x1E293B, 0.95);
    banner.fillRoundedRect(left, top, width, bannerH, s(10));
    this.contentContainer.add(banner);

    // 스테이지 이름
    this.addText(centerX, top + s(18), this.rewardData.stageName, {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: '#F8FAFC',
    }).setOrigin(0.5, 0);

    // 소탕 횟수
    this.addText(centerX, top + bannerH - s(18), `${this.rewardData.count}회 소탕 완료`, {
      fontSize: sf(13),
      color: '#94A3B8',
    }).setOrigin(0.5, 1);
  }

  /**
   * 골드 / 경험치 / 에너지 소모 행 표시
   * @private
   */
  _buildRewardRows() {
    const { left, top, width, centerX } = this.contentBounds;
    const sectionTop = top + s(90);

    // 섹션 레이블
    this.addText(left + s(10), sectionTop, '획득 보상', {
      fontSize: sf(15),
      fontStyle: 'bold',
      color: '#CBD5E1',
    });

    const rows = [
      { icon: '🪙', label: '골드',     value: `+${this.rewardData.gold.toLocaleString()}`,    color: '#F59E0B' },
      { icon: '✨', label: '경험치',   value: `+${this.rewardData.exp.toLocaleString()}`,      color: '#818CF8' },
      { icon: '⚡', label: '에너지 소모', value: `-${this.rewardData.energyCost}`,             color: '#F87171' },
    ];

    const rowH = s(52);
    const rowTop = sectionTop + s(28);

    rows.forEach((row, idx) => {
      const y = rowTop + idx * rowH;
      const isLast = idx === rows.length - 1;

      // 행 배경
      const rowBg = this.scene.add.graphics();
      rowBg.fillStyle(isLast ? 0x1a1a2e : 0x1E293B, 0.7);
      rowBg.fillRoundedRect(left, y, width, rowH - s(4), s(8));
      this.contentContainer.add(rowBg);

      // 아이콘 + 레이블
      this.addText(left + s(16), y + rowH / 2 - s(2), `${row.icon}  ${row.label}`, {
        fontSize: sf(15),
        color: '#94A3B8',
      }).setOrigin(0, 0.5);

      // 값
      this.addText(left + width - s(16), y + rowH / 2 - s(2), row.value, {
        fontSize: sf(16),
        fontStyle: 'bold',
        color: row.color,
      }).setOrigin(1, 0.5);
    });

    // 에너지 소모 행 구분선
    const sepY = rowTop + rows.length * rowH - s(4);
    const sep = this.scene.add.graphics();
    sep.lineStyle(s(1), COLORS.primary, 0.2);
    sep.lineBetween(left + s(10), sepY, left + width - s(10), sepY);
    this.contentContainer.add(sep);

    // 다음 섹션 기준점 저장
    this._itemSectionTop = sepY + s(12);
  }

  /**
   * 드롭 아이템 목록 표시
   * @private
   */
  _buildItemList() {
    const { left, width } = this.contentBounds;
    const sectionTop = this._itemSectionTop;

    if (!this.rewardData.items || this.rewardData.items.length === 0) {
      // 아이템 없음 안내
      this.addText(left + width / 2, sectionTop + s(20), '드롭된 아이템 없음', {
        fontSize: sf(13),
        color: '#475569',
      }).setOrigin(0.5);
      return;
    }

    // 섹션 레이블
    this.addText(left + s(10), sectionTop, '획득 아이템', {
      fontSize: sf(15),
      fontStyle: 'bold',
      color: '#CBD5E1',
    });

    const itemTop = sectionTop + s(28);
    const itemH = s(40);

    this.rewardData.items.forEach((item, idx) => {
      const y = itemTop + idx * itemH;

      const itemBg = this.scene.add.graphics();
      itemBg.fillStyle(0x1E293B, 0.6);
      itemBg.fillRoundedRect(left, y, width, itemH - s(4), s(6));
      this.contentContainer.add(itemBg);

      // 아이템 ID 표시 (실제 프로젝트에서 아이템 이름 매핑 가능)
      this.addText(left + s(16), y + itemH / 2 - s(2), `📦 ${item.itemId}`, {
        fontSize: sf(13),
        color: '#CBD5E1',
      }).setOrigin(0, 0.5);

      this.addText(left + width - s(16), y + itemH / 2 - s(2), `×${item.quantity}`, {
        fontSize: sf(14),
        fontStyle: 'bold',
        color: '#10B981',
      }).setOrigin(1, 0.5);
    });
  }

  /**
   * 확인 버튼
   * @private
   */
  _buildConfirmButton() {
    const { bottom, centerX } = this.contentBounds;
    const btnW = s(260);
    const btnH = s(54);
    const btnY = bottom - btnH / 2 - s(10);

    // 버튼 배경 (그라데이션 효과 — graphics로 구현)
    const btnBg = this.scene.add.graphics();
    btnBg.fillStyle(COLORS.primary, 1);
    btnBg.fillRoundedRect(centerX - btnW / 2, btnY - btnH / 2, btnW, btnH, s(12));
    this.contentContainer.add(btnBg);

    // 버튼 텍스트
    this.addText(centerX, btnY, '확인', {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);

    // 인터랙션 영역
    const hitArea = this.scene.add.rectangle(centerX, btnY, btnW, btnH)
      .setAlpha(0.001)
      .setInteractive({ useHandCursor: true });
    this.contentContainer.add(hitArea);

    hitArea.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(COLORS.accent, 1);
      btnBg.fillRoundedRect(centerX - btnW / 2, btnY - btnH / 2, btnW, btnH, s(12));
    });

    hitArea.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(COLORS.primary, 1);
      btnBg.fillRoundedRect(centerX - btnW / 2, btnY - btnH / 2, btnW, btnH, s(12));
    });

    hitArea.on('pointerdown', () => {
      this.hide();
    });
  }
}
