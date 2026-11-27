/**
 * volcano-forge 배경음(`forge`): 화산 대장간의 밝고 힘찬 작업 리듬.
 * A 믹솔리디안, 104bpm. 따뜻한 패드 + 뮤트된 사각파 플럭 선율 + 둥근 사인 베이스 + 1·3박 둥근 북 + 2·4박 모루 핑.
 * 프리스핀(free)은 두 반음 위로 올라가고(같은 빠르기), 16분 셰이커 + 모루 핑 8분 + 금관풍 톱니 대선율이 얹힌다.
 * 악보 데이터만 있다. 소리는 `bgmVoices.ts`의 `FORGE_KIT`가 낸다.
 */
import type { BgmStyle } from './bgm'

type Step = BgmStyle['keys'][number][number]
type ArpStep = BgmStyle['arp'][number][number]
type BassStep = BgmStyle['bass'][number][number]
type PercStep = BgmStyle['freePerc'][number]

const s = (beat: number, dur: number, vel?: number, n?: number): Step => ({ beat, dur, vel, n })
const a = (beat: number, idx: number, dur: number, vel?: number): ArpStep => ({ beat, idx, dur, vel })
const bs = (beat: number, deg: BassStep['deg'], dur: number, vel?: number): BassStep => ({ beat, deg, dur, vel })
const p = (beat: number, role: PercStep['role'], vel: number): PercStep => ({ beat, role, vel })
const beats = (list: readonly number[], role: PercStep['role'], vel: number): PercStep[] => list.map((b) => p(b, role, vel))

export const FORGE: BgmStyle = {
  seed: 71,
  bpm: 104,
  swing: 0.04,
  humanize: 0.01,
  strum: 0.02,
  key: 57,
  scale: [0, 2, 4, 5, 7, 9, 10],
  progression: [
    'A:5', 'G:5', 'D:5', 'A:5', 'A:5', 'G:5', 'D:6', 'E:m7',
    'F#:m7', 'G:5', 'D:5', 'A:5', 'F#:m7', 'G:5', 'E:m7', 'A:7sus',
    'D:5', 'A:5', 'G:5', 'D:5', 'A:5', 'E:m7', 'G:5', 'A:5',
    'F#:m7', 'D:5', 'G:5', 'A:5', 'D:6', 'G:5', 'E:m7', 'A:7sus',
  ],
  padLo: 45,
  keysLo: 57,
  arpLo: 69,
  bassLo: 33,
  freeArpShift: 7,
  freeTempo: 1.04,
  freeKeyShift: 2,
  lead: {
    lo: 69,
    hi: 83,
    rest: 0.35,
    cells: [
      [s(0, 1), s(1.5, 0.5), s(2, 1.5)],
      [s(0.5, 0.5), s(1, 1), s(2.5, 1.5)],
      [s(0, 2), s(2.5, 0.5), s(3, 1)],
      [s(1, 0.5), s(1.5, 0.5), s(2, 1), s(3.5, 0.5)],
      [s(0, 0.5), s(0.5, 0.5), s(1, 1.5), s(3, 1)],
    ],
  },
  keys: [
    [s(0, 1.5, 0.5, 3), s(2, 1.5, 0.45, 3)],
    [s(0.5, 1, 0.45, 3), s(2.5, 1, 0.42, 3)],
    [s(0, 1, 0.5, 2), s(1.5, 0.5, 0.4, 2), s(3, 0.75, 0.42, 3)],
  ],
  arp: [
    [a(0.5, 3, 0.5, 0.4), a(1.5, 4, 0.5, 0.35), a(2.5, 3, 0.5, 0.4), a(3.5, 5, 0.5, 0.35)],
    [a(0, 2, 0.5, 0.4), a(1.5, 3, 0.5, 0.35), a(3, 4, 0.5, 0.35)],
  ],
  bass: [
    [bs(0, 'r', 1.2, 0.75), bs(2.5, '5', 0.8, 0.6)],
    [bs(0.5, 'r', 0.8, 0.7), bs(2, 'r', 0.9, 0.65), bs(3.5, 'o', 0.4, 0.5)],
  ],
  perc: [
    [p(0, 'kick', 0.34), p(2, 'kick', 0.3), ...beats([1, 3], 'wood', 0.22)],
    [p(0, 'kick', 0.34), p(2, 'kick', 0.32), p(2.75, 'kick', 0.22), ...beats([1, 3], 'wood', 0.26), ...beats([0.5, 1.5, 2.5, 3.5], 'shaker', 0.14)],
    [p(0, 'kick', 0.34), p(2, 'kick', 0.32), ...beats([1, 3, 3.5], 'wood', 0.26), ...beats([0.5, 1.5, 2.5, 3, 3.25, 3.5, 3.75], 'shaker', 0.16)],
  ],
  freePerc: [
    p(0, 'kick', 0.36),
    p(2, 'kick', 0.34),
    ...beats([0.5, 1, 1.5, 2, 2.5, 3, 3.5], 'wood', 0.22),
    ...beats([0.25, 0.5, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75, 1, 2, 3], 'shaker', 0.17),
  ],
  counter: {
    lo: 57,
    patterns: [
      [a(0, 2, 1.5, 0.55), a(2, 4, 1.5, 0.5)],
      [a(0, 3, 1, 0.55), a(1.5, 2, 0.5, 0.45), a(2, 4, 2, 0.5)],
    ],
  },
}
