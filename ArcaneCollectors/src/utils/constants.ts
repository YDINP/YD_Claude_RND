/**
 * constants.ts - Game system constants and configurations
 * 분위기 시스템, 교단 시스템, 상성 관계 정의
 */

// ============================================
// Mood System (분위기 시스템)
// ============================================

/**
 * 분위기 타입 정의
 * 9가지 분위기 (공격형: 열혈/격렬/광폭, 방어형: 고요/의연/헌신, 전략형: 냉철/고결/신비)
 */
export const MOOD = {
  BRAVE: 'brave',       // 열혈 - 공격적, 전투 지향
  FIERCE: 'fierce',     // 격렬 - 폭발적, 근접 극대화
  WILD: 'wild',         // 광폭 - 본능적, 예측 불가
  CALM: 'calm',         // 고요 - 방어적, 안정적
  STOIC: 'stoic',       // 의연 - 인내, 생존 특화
  DEVOTED: 'devoted',   // 헌신 - 자기희생, 치유/보호
  CUNNING: 'cunning',   // 냉철 - 전략적, 약점 공략
  NOBLE: 'noble',       // 고결 - 리더십, 팀 버프
  MYSTIC: 'mystic'      // 신비 - 초월적, 마법 특화
} as const;

export type MoodType = typeof MOOD[keyof typeof MOOD];

/**
 * 분위기 상성 관계 (매트릭스 구조)
 * 각 분위기는 2개에 강하고 2개에 약함, 나머지 4개는 중립
 * 그룹: 공격형(brave/fierce/wild), 방어형(calm/stoic/devoted), 전략형(cunning/noble/mystic)
 */
export interface MoodMatchup {
  strongAgainst: MoodType[];
  weakAgainst: MoodType[];
}

export const MOOD_MATCHUP: Record<MoodType, MoodMatchup> = {
  [MOOD.BRAVE]: {
    strongAgainst: [MOOD.WILD, MOOD.CUNNING],
    weakAgainst: [MOOD.FIERCE, MOOD.DEVOTED]
  },
  [MOOD.FIERCE]: {
    strongAgainst: [MOOD.BRAVE, MOOD.NOBLE],
    weakAgainst: [MOOD.WILD, MOOD.CALM]
  },
  [MOOD.WILD]: {
    strongAgainst: [MOOD.FIERCE, MOOD.MYSTIC],
    weakAgainst: [MOOD.BRAVE, MOOD.STOIC]
  },
  [MOOD.CALM]: {
    strongAgainst: [MOOD.DEVOTED, MOOD.FIERCE],
    weakAgainst: [MOOD.STOIC, MOOD.CUNNING]
  },
  [MOOD.STOIC]: {
    strongAgainst: [MOOD.CALM, MOOD.WILD],
    weakAgainst: [MOOD.DEVOTED, MOOD.MYSTIC]
  },
  [MOOD.DEVOTED]: {
    strongAgainst: [MOOD.STOIC, MOOD.BRAVE],
    weakAgainst: [MOOD.CALM, MOOD.NOBLE]
  },
  [MOOD.CUNNING]: {
    strongAgainst: [MOOD.MYSTIC, MOOD.CALM],
    weakAgainst: [MOOD.NOBLE, MOOD.BRAVE]
  },
  [MOOD.NOBLE]: {
    strongAgainst: [MOOD.CUNNING, MOOD.DEVOTED],
    weakAgainst: [MOOD.MYSTIC, MOOD.FIERCE]
  },
  [MOOD.MYSTIC]: {
    strongAgainst: [MOOD.NOBLE, MOOD.STOIC],
    weakAgainst: [MOOD.CUNNING, MOOD.WILD]
  }
};

/**
 * 분위기 상성 데미지 배율
 */
export const MOOD_DAMAGE = {
  ADVANTAGE: 1.2,       // 상성 우위: 20% 추가 데미지
  DISADVANTAGE: 0.8,    // 상성 열세: 20% 데미지 감소
  NEUTRAL: 1.0          // 중립: 변화 없음
} as const;

/**
 * 분위기별 한글 이름 및 설명
 */
export interface MoodInfo {
  name: string;
  description: string;
  color: string;
}

export const MOOD_INFO: Record<MoodType, MoodInfo> = {
  [MOOD.BRAVE]: {
    name: '열혈',
    description: '두려움을 모르는 전사의 기질',
    color: '#E74C3C'
  },
  [MOOD.FIERCE]: {
    name: '격렬',
    description: '폭발적인 힘으로 적을 압도하는 파괴자',
    color: '#FF5722'
  },
  [MOOD.WILD]: {
    name: '광폭',
    description: '본능에 따라 행동하는 야수의 기질',
    color: '#27AE60'
  },
  [MOOD.CALM]: {
    name: '고요',
    description: '어떤 상황에서도 냉정함을 유지',
    color: '#3498DB'
  },
  [MOOD.STOIC]: {
    name: '의연',
    description: '어떤 고통도 견디는 불굴의 인내',
    color: '#607D8B'
  },
  [MOOD.DEVOTED]: {
    name: '헌신',
    description: '동료를 위해 모든 것을 바치는 수호자',
    color: '#E91E63'
  },
  [MOOD.CUNNING]: {
    name: '냉철',
    description: '상대의 허점을 노리는 전략가',
    color: '#9B59B6'
  },
  [MOOD.NOBLE]: {
    name: '고결',
    description: '고귀한 의지로 아군을 이끄는 지휘관',
    color: '#FFD700'
  },
  [MOOD.MYSTIC]: {
    name: '신비',
    description: '신비로운 힘을 지닌 초월적 존재',
    color: '#F39C12'
  }
};

// ============================================
// Cult System (교단 시스템)
// ============================================

/**
 * 교단 타입 정의
 * 10개의 서브컬쳐 기반 교단 (v3.0)
 */
export const CULT = {
  PRISM_STARS:     'prism_stars',     // 프리즘 스타즈 (아이돌/팬덤)
  NEON_CROW:       'neon_crow',       // 네온 크로우 (사이버펑크/해커)
  INK_CYCLONE:     'ink_cyclone',     // 잉크 사이클론 (스트리트 그라피티)
  STELLA_CLUB:     'stella_club',     // 스텔라 클럽 (천문 동아리)
  CARD_CARTEL:     'card_cartel',     // 카드 카르텔 (TCG 대회)
  BUDDY_GARDEN:    'buddy_garden',    // 버디 가든 (원예/식물)
  GLITCH_PARADISE: 'glitch_paradise', // 글리치 파라다이스 (인터넷 밈)
  CAFE_ENCORE:     'cafe_encore',     // 카페 앙코르 (카페/중립)
  LUNATIC_CIRCUS:  'lunatic_circus',  // 루나틱 서커스 (서커스/마술)
  IRON_BEAT:       'iron_beat'        // 아이언 비트 (록밴드/언더그라운드)
} as const;

export type CultType = typeof CULT[keyof typeof CULT];

/**
 * 교단별 상세 정보
 */
export interface CultInfo {
  name: string;
  origin: string;
  description: string;
  color: string;
}

export const CULT_INFO: Record<CultType, CultInfo> = {
  [CULT.PRISM_STARS]: {
    name: '프리즘 스타즈',
    origin: '허구 — 아이돌/팬덤 서브컬쳐',
    description: '무대 위 완벽한 퍼포먼스를 추구하는 아이돌 교단',
    color: '#FF6EB4'
  },
  [CULT.NEON_CROW]: {
    name: '네온 크로우',
    origin: '허구 — 사이버펑크/해커 서브컬쳐',
    description: '디지털 세계의 그림자에서 활동하는 해커 교단',
    color: '#00F5FF'
  },
  [CULT.INK_CYCLONE]: {
    name: '잉크 사이클론',
    origin: '허구 — 스트리트 그라피티 서브컬쳐',
    description: '도시 곳곳에 작품을 남기는 그라피티 아티스트 교단',
    color: '#FF4500'
  },
  [CULT.STELLA_CLUB]: {
    name: '스텔라 클럽',
    origin: '허구 — 천문 동아리/성좌 서브컬쳐',
    description: '별을 관측하고 성좌의 비밀을 연구하는 천문 동아리 교단',
    color: '#E8E8FF'
  },
  [CULT.CARD_CARTEL]: {
    name: '카드 카르텔',
    origin: '허구 — TCG 대회 문화',
    description: 'TCG 대회를 지배하는 전략가 교단',
    color: '#2D2D5B'
  },
  [CULT.BUDDY_GARDEN]: {
    name: '버디 가든',
    origin: '허구 — 원예/식물 덕후 서브컬쳐',
    description: '식물을 키우고 나누는 원예 동호회 교단',
    color: '#3DDC84'
  },
  [CULT.GLITCH_PARADISE]: {
    name: '글리치 파라다이스',
    origin: '허구 — 인터넷 밈/카오스 미학',
    description: '버그를 예술로 승화시키는 밈 교단',
    color: '#FF00FF'
  },
  [CULT.CAFE_ENCORE]: {
    name: '카페 앙코르',
    origin: '허구 — 카페/바리스타 문화 (중립)',
    description: '모든 교단원이 쉬어가는 중립 카페 교단',
    color: '#C8602A'
  },
  [CULT.LUNATIC_CIRCUS]: {
    name: '루나틱 서커스',
    origin: '허구 — 서커스/마술사 서브컬쳐',
    description: '현실과 환상의 경계에서 공연하는 마술사 교단',
    color: '#8B2BE2'
  },
  [CULT.IRON_BEAT]: {
    name: '아이언 비트',
    origin: '허구 — 록밴드/언더그라운드 음악',
    description: '지하 공연장에서 폭발적인 사운드를 쏟아내는 록밴드 교단',
    color: '#E63946'
  }
};

/**
 * 교단-분위기 최적 조합 보너스
 * 특정 교단에서 특정 분위기 영웅이 추가 보너스를 받음
 */
export interface CultMoodBonusInfo {
  optimalMood: MoodType;
  bonusMultiplier: number;
  description: string;
}

export const CULT_MOOD_BONUS: Record<CultType, CultMoodBonusInfo> = {
  [CULT.PRISM_STARS]: {
    optimalMood: MOOD.NOBLE,
    bonusMultiplier: 1.15,
    description: '프리즘 스타즈는 고결한 퍼포먼스의 리더를 환영합니다'
  },
  [CULT.NEON_CROW]: {
    optimalMood: MOOD.CUNNING,
    bonusMultiplier: 1.15,
    description: '네온 크로우는 냉철한 분석과 전략을 최고로 칩니다'
  },
  [CULT.INK_CYCLONE]: {
    optimalMood: MOOD.WILD,
    bonusMultiplier: 1.15,
    description: '잉크 사이클론은 본능적이고 자유로운 표현을 추구합니다'
  },
  [CULT.STELLA_CLUB]: {
    optimalMood: MOOD.MYSTIC,
    bonusMultiplier: 1.15,
    description: '스텔라 클럽은 신비로운 우주의 관찰자를 환영합니다'
  },
  [CULT.CARD_CARTEL]: {
    optimalMood: MOOD.CUNNING,
    bonusMultiplier: 1.15,
    description: '카드 카르텔은 냉철한 전략가를 무엇보다 중시합니다'
  },
  [CULT.BUDDY_GARDEN]: {
    optimalMood: MOOD.DEVOTED,
    bonusMultiplier: 1.15,
    description: '버디 가든은 헌신적인 돌봄의 마음을 지닌 자를 환영합니다'
  },
  [CULT.GLITCH_PARADISE]: {
    optimalMood: MOOD.FIERCE,
    bonusMultiplier: 1.15,
    description: '글리치 파라다이스는 격렬한 혼돈의 에너지를 사랑합니다'
  },
  [CULT.CAFE_ENCORE]: {
    optimalMood: MOOD.CALM,
    bonusMultiplier: 1.15,
    description: '카페 앙코르는 고요하고 평화로운 이를 포용합니다'
  },
  [CULT.LUNATIC_CIRCUS]: {
    optimalMood: MOOD.BRAVE,
    bonusMultiplier: 1.15,
    description: '루나틱 서커스는 열혈적인 용기와 도전을 원합니다'
  },
  [CULT.IRON_BEAT]: {
    optimalMood: MOOD.FIERCE,
    bonusMultiplier: 1.15,
    description: '아이언 비트는 격렬하게 타오르는 반항의 정신을 칭송합니다'
  }
};

// ============================================
// Helper Functions
// ============================================

/**
 * 분위기 상성 데미지 배율 계산
 * @param attackerMood - 공격자 분위기
 * @param defenderMood - 방어자 분위기
 * @returns 데미지 배율
 */
export function getMoodDamageMultiplier(attackerMood: MoodType, defenderMood: MoodType): number {
  const matchup = MOOD_MATCHUP[attackerMood];
  if (!matchup) return MOOD_DAMAGE.NEUTRAL;

  if (matchup.strongAgainst.includes(defenderMood)) {
    return MOOD_DAMAGE.ADVANTAGE;
  }
  if (matchup.weakAgainst.includes(defenderMood)) {
    return MOOD_DAMAGE.DISADVANTAGE;
  }

  return MOOD_DAMAGE.NEUTRAL;
}

/**
 * 교단-분위기 보너스 배율 계산
 * @param cult - 교단
 * @param mood - 분위기
 * @returns 보너스 배율 (1.0 = 보너스 없음)
 */
export function getCultMoodBonus(cult: CultType, mood: MoodType): number {
  const bonus = CULT_MOOD_BONUS[cult];
  if (!bonus) return 1.0;

  if (bonus.optimalMood === mood) {
    return bonus.bonusMultiplier;
  }

  return 1.0;
}

/**
 * 분위기 상성 관계 설명 문자열 반환
 * @param mood - 분위기
 * @returns 상성 설명
 */
export function getMoodMatchupDescription(mood: MoodType): string {
  const matchup = MOOD_MATCHUP[mood];
  const info = MOOD_INFO[mood];

  if (!matchup || !info) return '';

  const strongNames = matchup.strongAgainst
    .map(m => MOOD_INFO[m]?.name)
    .filter(Boolean)
    .join(', ');
  const weakNames = matchup.weakAgainst
    .map(m => MOOD_INFO[m]?.name)
    .filter(Boolean)
    .join(', ');

  return `${info.name}: ${strongNames}에 강함, ${weakNames}에 약함`;
}

export default {
  MOOD,
  MOOD_MATCHUP,
  MOOD_DAMAGE,
  MOOD_INFO,
  CULT,
  CULT_INFO,
  CULT_MOOD_BONUS,
  getMoodDamageMultiplier,
  getCultMoodBonus,
  getMoodMatchupDescription
};
