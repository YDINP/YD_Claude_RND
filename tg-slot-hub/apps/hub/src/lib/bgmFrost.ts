/**
 * aurora-ice-palace 배경음(`frost`): 극야의 얼음 궁전.
 * E 도리안, 72bpm. 오로라 패드(디튠 톱니, 느린 필터) + 하프 뜯기 아르페지오 + 활로 켠 저음 지속음 + 브러시 셰이커.
 * 얼려 두기 프리스핀(free)은 76bpm·두 반음 위로 올라가고, 높은 FM 대선율 + 서브 맥동 + 16분 하이햇이 얹힌다.
 * 악보 데이터만 있다. 소리는 `bgmVoices.ts`의 `FROST_KIT`가 낸다.
 */
import type { BgmStyle } from './bgm'

type Step = BgmStyle['keys'][number][number]
type ArpStep = BgmStyle['arp'][number][number]
type BassStep = BgmStyle['bass'][number][number]
type PercStep = BgmStyle['freePerc'][number]

const s = (beat: number, dur: number, vel?: number, n?: number): Step => ({ beat, dur, vel, n })
const a = (beat: number, idx: number, dur: number, vel?: number): ArpStep => ({ beat, idx, dur, vel })
const bs = (beat: number, deg: BassStep['deg'], dur: number, vel?: number): BassStep => ({ beat, deg, dur, vel })
const p = (beat: number, role: PercStep['role'], vel: number, midi?: number): PercStep => ({ beat, role, vel, midi })
const beats = (list: readonly number[], role: PercStep['role'], vel: number): PercStep[] => list.map((b) => p(b, role, vel))

export const FROST: BgmStyle = {
  seed: 71,
  bpm: 72,
  swing: 0,
  humanize: 0.014,
  strum: 0.05,
  key: 64,
  scale: [0, 2, 3, 5, 7, 9, 10],
  progression: [
    'E:m7', 'E:m7', 'G:maj7', 'A:9', 'E:m7', 'F#:m7', 'G:maj7', 'D:maj7',
    'B:m7', 'A:9', 'G:maj7', 'E:m7', 'E:m7', 'D:maj7', 'F#:m7', 'A:9',
    'G:maj7', 'A:9', 'B:m7', 'D:maj7', 'E:m7', 'F#:m7', 'G:maj7', 'A:9',
    'D:maj7', 'G:maj7', 'B:m7', 'A:9', 'E:m7', 'G:maj7', 'F#:m7', 'B:m7',
  ],
  padLo: 52,
  keysLo: 59,
  arpLo: 67,
  bassLo: 40,
  freeArpShift: 12,
  freeTempo: 76 / 72,
  freeKeyShift: 2,
  lead: {
    lo: 76,
    hi: 90,
    rest: 0.4,
    cells: [
      [s(0, 2.5), s(2.5, 1.5)],
      [s(1, 1.5), s(2.5, 0.5), s(3, 1)],
      [s(0, 4)],
      [s(0.5, 1), s(2, 2)],
    ],
  },
  keys: [
    [s(0, 4, 0.4, 3)],
    [s(0, 2, 0.4, 3), s(2, 2, 0.36, 3)],
    [s(0.5, 3, 0.38, 2)],
  ],
  arp: [
    [a(0, 0, 0.5, 0.55), a(0.5, 2, 0.5, 0.4), a(1, 3, 0.5, 0.45), a(1.5, 2, 0.5, 0.36), a(2, 4, 0.5, 0.5), a(2.5, 3, 0.5, 0.36), a(3, 2, 0.5, 0.42), a(3.5, 1, 0.5, 0.34)],
    [a(0, 1, 0.5, 0.5), a(1, 3, 0.5, 0.42), a(1.5, 4, 0.5, 0.4), a(2.5, 3, 0.5, 0.4), a(3, 2, 0.5, 0.36)],
    [a(0.5, 2, 0.5, 0.45), a(1.5, 3, 0.5, 0.4), a(2, 4, 0.5, 0.4), a(3, 5, 0.5, 0.36)],
  ],
  bass: [
    [bs(0, 'r', 3.8, 0.7)],
    [bs(0, 'r', 1.9, 0.7), bs(2, '5', 1.8, 0.55)],
  ],
  perc: [
    [...beats([0.5, 1.5, 2.5, 3.5], 'shaker', 0.2)],
    [...beats([0, 1, 2, 3], 'shaker', 0.16), ...beats([0.5, 1.5, 2.5, 3.5], 'shaker', 0.24)],
    [...beats([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 'shaker', 0.22)],
  ],
  freePerc: [
    ...beats([0, 1, 2, 3], 'kick', 0.34),
    ...beats([0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75, 0.5, 1.5, 2.5, 3.5], 'hat', 0.2),
  ],
  counter: {
    lo: 72,
    patterns: [
      [a(0, 3, 0.5, 0.6), a(1, 4, 0.5, 0.5), a(2.5, 5, 0.5, 0.55), a(3.5, 4, 0.5, 0.45)],
      [a(0.5, 4, 0.5, 0.55), a(1.5, 3, 0.5, 0.5), a(2, 5, 0.5, 0.5), a(3, 3, 0.5, 0.5)],
    ],
  },
}
