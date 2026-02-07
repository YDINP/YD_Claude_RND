/**
 * Character Type Definitions
 * characters.json 스키마 기반 타입 정의
 */

/** 분위기(Mood) 9종 */
export type MoodType =
  | 'brave'    // 열혈 (공격형)
  | 'fierce'   // 격렬 (공격형)
  | 'wild'     // 광폭 (공격형)
  | 'calm'     // 고요 (방어형)
  | 'stoic'    // 의연 (방어형)
  | 'devoted'  // 헌신 (방어형)
  | 'cunning'  // 냉철 (전략형)
  | 'noble'    // 고결 (전략형)
  | 'mystic';  // 신비 (전략형)

/** 분위기 그룹 */
export type MoodGroup = 'offensive' | 'defensive' | 'tactical';

/** 교단(Cult) 9종 */
export type CultType =
  | 'olympus'        // 올림푸스
  | 'takamagahara'   // 타카마가하라
  | 'yomi'           // 요미
  | 'asgard'         // 아스가르드
  | 'valhalla'       // 발할라
  | 'tartarus'       // 타르타로스
  | 'avalon'         // 아발론
  | 'helheim'        // 헬하임
  | 'kunlun';        // 곤륜

/** 클래스 4종 */
export type ClassType = 'warrior' | 'mage' | 'healer' | 'archer';

/** 등급 (숫자 기반, characters.json의 rarity 필드) */
export type RarityNumber = 1 | 2 | 3 | 4 | 5;

/** 등급 키 (문자열 기반, 내부 변환용) */
export type RarityKey = 'N' | 'R' | 'SR' | 'SSR';

/** 기본 스탯 */
export interface CharacterStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

/** 캐릭터 인라인 스킬 (characters.json 내장 스킬) */
export interface CharacterSkill {
  id: string;
  name: string;
  description: string;
  multiplier: number;
  /** 기본공격 시 게이지 획득량 */
  gaugeGain?: number;
  /** 스킬 사용 시 게이지 소비량 */
  gaugeCost?: number;
  /** 타겟 유형 */
  target?: 'single' | 'all';
}

/** 캐릭터 디자인 정보 */
export interface CharacterDesign {
  style: string;
  bodyRatio: string;
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  eyeStyle: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  outfit: string;
  accessories: string[];
  signaturePose: string;
  chibiFeatures: string;
  height: string;
  age: string;
}

/** 캐릭터 보이스 라인 */
export interface VoiceLines {
  greeting: string;
  battleStart: string;
  victory: string;
  defeat: string;
  levelUp: string;
  summon: string;
  idle1: string;
  idle2: string;
}

/** characters.json의 캐릭터 엔트리 */
export interface Character {
  id: string;
  name: string;
  nameEn: string;
  rarity: RarityNumber;
  cult: CultType;
  class: ClassType;
  description: string;
  mood: MoodType;
  quote: string;
  stats: CharacterStats;
  growthStats: CharacterStats;
  skills: CharacterSkill[];
  design: CharacterDesign;
  voiceLines: VoiceLines;
}

/** 소유한 영웅 인스턴스 (세이브 데이터) */
export interface OwnedHero {
  id: string;
  instanceId?: string;
  characterId: string;
  name?: string;
  rarity: RarityNumber;
  rarityKey?: RarityKey;
  stars?: number;
  cult?: CultType;
  class?: ClassType;
  mood?: MoodType;
  description?: string;
  level: number;
  exp: number;
  stats?: CharacterStats;
  growthStats?: CharacterStats;
  skills?: CharacterSkill[];
  skillLevels?: number[];
  equipped?: string | null;
  evolutionCount?: number;
}

/** normalizeHero()가 반환하는 정규화된 영웅 객체 */
export interface NormalizedHero {
  id: string;
  instanceId: string;
  characterId: string;
  name: string;
  rarity: RarityNumber;
  rarityKey: RarityKey;
  stars: number;
  cult: CultType;
  class: ClassType;
  mood: MoodType;
  description: string;
  level: number;
  exp: number;
  stats: CharacterStats;
  growthStats: CharacterStats;
  skills: CharacterSkill[];
  skillLevels: number[];
  equipped: string | null;
  evolutionCount: number;
}

/** characters.json 루트 구조 */
export interface CharactersData {
  characters: Character[];
}

/** 분위기 상성 정보 */
export interface MoodAdvantage {
  strong: MoodType[];
  weak: MoodType[];
}

/** 분위기 상성 맵 */
export type MoodAdvantages = Record<MoodType, MoodAdvantage>;
