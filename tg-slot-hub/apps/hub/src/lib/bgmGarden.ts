/**
 * greenhouse-garden 배경음(`garden`): 햇살 드는 유리 온실의 통통 튀는 산책.
 * F 장조, 92bpm, 셔플 8분. 나무 칼림바 아르페지오 + 부드러운 피리 선율 + 브러시 셰이커 + 손으로 뜯는 낮은 베이스.
 * 정원 프리스핀(free)은 두 반음 위(G)로 올라가고, 윈드차임 대선율과 16분 셰이커가 얹혀 들뜬다.
 * 악보 데이터만 있다. 소리는 `bgmVoices.ts`의 `GARDEN_KIT`가 낸다.
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

export const GARDEN: BgmStyle = {
  seed: 71,
  bpm: 92,
  swing: 0.26,
  humanize: 0.014,
  strum: 0.025,
  key: 65,
  scale: [0, 2, 4, 5, 7, 9, 11],
  progression: [
    'F:maj7', 'A:m7', 'Bb:maj7', 'F:6', 'D:m7', 'G:m7', 'C:7', 'F:maj7',
    'Bb:maj7', 'F:maj7', 'G:m7', 'C:sus', 'A:m7', 'D:m7', 'G:m9', 'C:7',
    'F:maj9', 'E:m7', 'D:m7', 'G:m7', 'Bb:maj7', 'A:m7', 'G:m7', 'C:7sus',
    'F:6', 'D:m7', 'Bb:maj7', 'C:7', 'A:m7', 'Bb:maj7', 'G:m7', 'C:7',
  ],
  padLo: 53,
  keysLo: 60,
  arpLo: 65,
  bassLo: 41,
  freeArpShift: 12,
  freeTempo: 1.04,
  freeKeyShift: 2,
  lead: {
    lo: 72,
    hi: 86,
    rest: 0.28,
    cells: [
      [s(0, 1), s(1, 0.5), s(1.5, 0.5), s(2, 2)],
      [s(0.5, 1), s(1.5, 1), s(2.5, 1.5)],
      [s(0, 2), s(2.5, 0.5), s(3, 1)],
      [s(1, 0.5), s(1.5, 0.5), s(2, 1), s(3, 1)],
      [s(0, 0.5), s(0.5, 0.5), s(1, 2)],
    ],
  },
  keys: [
    [s(0, 1.5, 0.4, 3), s(2, 2, 0.36, 3)],
    [s(0.5, 1.5, 0.38, 3), s(2.5, 1.5, 0.34, 3)],
    [s(0, 1, 0.4, 3), s(1.5, 0.5, 0.32, 2), s(3, 1, 0.36, 3)],
  ],
  arp: [
    [a(0, 0, 0.5, 0.6), a(0.5, 2, 0.5, 0.4), a(1, 3, 0.5, 0.5), a(2, 1, 0.5, 0.55), a(2.5, 2, 0.5, 0.4), a(3, 4, 0.5, 0.5)],
    [a(0, 1, 0.5, 0.55), a(1, 2, 0.5, 0.45), a(1.5, 4, 0.5, 0.4), a(2.5, 3, 0.5, 0.5), a(3, 2, 0.5, 0.4), a(3.5, 4, 0.5, 0.35)],
    [a(0.5, 0, 0.5, 0.5), a(1.5, 3, 0.5, 0.45), a(2, 2, 0.5, 0.45), a(3, 4, 0.5, 0.4)],
  ],
  bass: [
    [bs(0, 'r', 0.9, 0.7), bs(1.5, '5', 0.5, 0.5), bs(2.5, 'r', 0.9, 0.6)],
    [bs(0, 'r', 0.9, 0.7), bs(1, '5', 0.5, 0.45), bs(2, '3', 0.9, 0.55), bs(3, 'o', 0.5, 0.5)],
  ],
  perc: [
    [...beats([0.5, 1, 1.5, 2.5, 3, 3.5], 'shaker', 0.2)],
    [p(0, 'kick', 0.26), ...beats([1, 3], 'wood', 0.24), ...beats([0.5, 1.5, 2.5, 3.5], 'shaker', 0.22)],
    [p(0, 'kick', 0.26), p(2.5, 'kick', 0.2), ...beats([1, 2, 3.5], 'wood', 0.24), ...beats([0.5, 1.5, 2.5, 3, 3.25, 3.5, 3.75], 'shaker', 0.24)],
  ],
  freePerc: [p(0, 'kick', 0.3), p(2, 'kick', 0.26), ...beats([1, 3], 'wood', 0.26), ...beats([0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2.25, 2.5, 2.75, 3.25, 3.5, 3.75], 'shaker', 0.2)],
  counter: {
    lo: 69,
    patterns: [
      [a(0.5, 4, 0.5, 0.5), a(1.5, 3, 0.5, 0.45), a(2.5, 4, 0.5, 0.5), a(3.5, 2, 0.5, 0.4)],
      [a(0.75, 3, 0.5, 0.45), a(1.25, 4, 0.5, 0.45), a(2.25, 3, 0.5, 0.5), a(3.25, 4, 0.5, 0.45)],
    ],
  },
}
