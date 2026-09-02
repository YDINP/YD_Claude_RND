/**
 * RateDisclosurePanel - 소환 확률 상시 고지 패널
 *
 * 법적 요구(SYSTEM_ONBOARDING_ECONOMY.md GA-4) + 가챠 재활성화 차단 조건.
 * 등급별 확률, 10연 SR 이상 확정, 소프트/하드 피티, 픽업 확률/천장을
 * GachaSystem.RATES / GachaSystem.PITY_CONFIG (SSOT)에서 읽어 표시한다.
 * 하드코딩 금지 — 확률/피티 수치는 반드시 GachaSystem에서 읽는다.
 *
 * PopupBase 상속. GachaScene.js / GachaPopup.js 양쪽에서 재사용.
 *
 * 데이터 변환(순수 함수)은 Phaser 비의존 src/utils/gachaRateDisclosure.js에 분리했다
 * (vitest node 환경에서 단위 테스트 가능하게 하기 위함). 이 파일은 Phaser 렌더링만 담당한다.
 */
import { PopupBase } from '../PopupBase.js';
import { COLORS, RARITY, s, sf } from '../../config/gameConfig.js';
import { collectLiveRateRows } from '../../utils/gachaRateDisclosure.js';
import { DESIGN } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';

/** 헤더 타이틀 */
const TITLE = '확률 정보';

export { buildRateRows, collectLiveRateRows } from '../../utils/gachaRateDisclosure.js';

const GRADE_DESCRIPTIONS = {
  SSR: '전설 등급',
  SR: '영웅 등급',
  R: '희귀 등급',
  N: '일반 등급'
};

function hex(color) {
  return `#${(color ?? COLORS.text).toString(16).padStart(6, '0')}`;
}

/** row 1개를 { label, value, color }로 번역한다 (렌더 전용, 표시 문구 SSOT) */
function describeRow(row) {
  if (row.type === 'rarity') {
    const rarityColor = RARITY[row.grade]?.color ?? COLORS.text;
    return {
      label: `${row.grade} · ${GRADE_DESCRIPTIONS[row.grade] || ''}`,
      value: `${row.ratePercent}%`,
      color: rarityColor
    };
  }
  if (row.type === 'pity' && row.key === 'soft') {
    return {
      label: `소프트 천장 · ${row.threshold}회부터 SSR 확률 회당 +${(row.bonus * 100).toFixed(0)}%`,
      value: row.active ? `${row.current}/${row.threshold} · 적용 중` : `${row.current}/${row.threshold} · 남은 ${row.remaining}회`,
      color: row.active ? COLORS.raritySSR : COLORS.textDark
    };
  }
  if (row.type === 'pity' && row.key === 'hard') {
    return {
      label: `하드 천장 · ${row.threshold}회 SSR 확정`,
      value: row.active ? '확정' : `${row.current}/${row.threshold} · 남은 ${row.remaining}회`,
      color: row.active ? COLORS.raritySSR : COLORS.textDark
    };
  }
  if (row.type === 'pickup') {
    return {
      label: `픽업 확정 천장 · ${row.threshold}회`,
      value: row.active ? '확정' : `${row.current}/${row.threshold} · 남은 ${row.remaining}회`,
      color: COLORS.raritySR
    };
  }
  // guarantee
  return {
    label: '10연 소환 보장',
    value: 'SR 이상 1개 확정',
    color: COLORS.accent
  };
}

/**
 * row 배열을 Phaser 텍스트 목록으로 렌더링한다. RateDisclosurePanel(팝업)과
 * GachaPopup 온보딩 모드(상시 임베드)가 공용으로 사용하는 렌더 헬퍼.
 *
 * @returns {{ elements: Array, endY: number }}
 */
export function renderRateTable(scene, container, { left, top, width, rows, lineHeight } = {}) {
  const gap = lineHeight || s(30);
  const elements = [];
  let y = top;
  let lastType = null;

  const sectionTitle = (text) => {
    const t = scene.add.text(left, y, text, {
      fontSize: sf(14), fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: DESIGN.colors.text.primary
    }).setOrigin(0, 0.5);
    container.add(t);
    elements.push(t);
    y += gap * 0.85;
  };

  (rows || []).forEach((row) => {
    if (row.type !== lastType) {
      if (row.type === 'rarity') sectionTitle('등급별 확률');
      if (row.type === 'pity' && lastType !== 'pity') { y += gap * 0.3; sectionTitle('천장(피티) 시스템'); }
      if (row.type === 'pickup') { y += gap * 0.2; sectionTitle('픽업 확정'); }
      if (row.type === 'guarantee') { y += gap * 0.3; sectionTitle('보장 규칙'); }
      lastType = row.type;
    }

    const { label, value, color } = describeRow(row);

    const labelText = scene.add.text(left, y, label, {
      fontSize: sf(13), fontFamily: '"Noto Sans KR", sans-serif',
      color: '#CBD5E1', wordWrap: { width: width * 0.62 }
    }).setOrigin(0, 0.5);

    const valueText = scene.add.text(left + width, y, value, {
      fontSize: sf(13), fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: hex(color)
    }).setOrigin(1, 0.5);

    container.add([labelText, valueText]);
    elements.push(labelText, valueText);
    y += gap;
  });

  return { elements, endY: y };
}

export class RateDisclosurePanel extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.brand.accent,
      ...options
    });
    this.bannerId = options.bannerId || null;
  }

  buildContent() {
    this.setTitle(TITLE);
    this.setActions([{ label: '확인', variant: 'primary', onClick: () => this.hide() }]);

    const b = this.contentBounds;

    this.addText(b.left, b.top, '소환 확률과 천장(피티) 시스템을 안내합니다.', {
      fontSize: sf(13),
      color: DESIGN.colors.text.secondary,
      wordWrap: { width: b.width }
    });

    const rows = collectLiveRateRows(this.bannerId);
    const { endY } = renderRateTable(this.scene, this.contentContainer, {
      left: b.left,
      top: b.top + s(44),
      width: b.width,
      rows
    });

    this.addText(b.left, Math.min(endY + s(14), b.bottom - s(20)),
      '확률 표시는 게임물관리위원회 확률형 아이템 표시 기준을 따릅니다.', {
        fontSize: sf(11),
        color: DESIGN.colors.text.muted,
        wordWrap: { width: b.width }
      });
  }
}
