/**
 * kraken-cove 배경음(`deepsea`): 바닷속 보물 동굴의 느긋한 들뜸.
 * D 믹솔리디안, 96bpm. 부드러운 패드 + 칼림바 아르페지오 + 둥근 종 선율 + 둥근 사인 베이스 + 셰이커와 물방울 타악.
 * 코인 리스핀(free)은 두 반음 위로 올라가고, 박마다 심장 같은 둥근 북 + 16분 하이햇 + 소나 대선율이 얹혀 긴장을 만든다.
 * 악보 데이터만 있다. 소리는 `bgmVoices.ts`의 `DEEPSEA_KIT`가 낸다.
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

export const DEEPSEA: BgmStyle = {
  seed: 53,
  bpm: 96,
  swing: 0.06,
  humanize: 0.012,
  strum: 0.03,
  key: 62,
  scale: [0, 2, 4, 5, 7, 9, 10],
  progression: [
    'D:9', 'C:maj7', 'G:maj7', 'D:9', 'D:9', 'C:maj7', 'G:maj9', 'A:m7',
    'E:m7', 'G:maj7', 'C:maj7', 'D:sus', 'B:m7', 'C:maj7', 'G:maj7', 'D:7',
    'G:maj7', 'A:m7', 'B:m7', 'C:maj7', 'D:9', 'E:m7', 'G:maj9', 'A:m7',
    'C:maj9', 'D:sus', 'G:maj7', 'B:m7', 'C:maj7', 'G:maj7', 'A:m7', 'D:7sus',
  ],
  padLo: 50,
  keysLo: 57,
  arpLo: 69,
  bassLo: 38,
  freeArpShift: 12,
  freeTempo: 1.06,
  freeKeyShift: 2,
  lead: {
    lo: 74,
    hi: 88,
    rest: 0.3,
    cells: [
      [s(0, 1.5), s(1.5, 0.5), s(2, 2)],
      [s(0.5, 1), s(1.5, 0.5), s(2.5, 1.5)],
      [s(0, 3)],
      [s(1, 1), s(2, 0.5), s(2.5, 0.5), s(3, 1)],
      [s(0, 0.5), s(0.5, 0.5), s(1, 1.5), s(3, 1)],
    ],
  },
  keys: [
    [s(0, 2, 0.5, 3), s(2, 2, 0.45, 3)],
    [s(0.5, 1.5, 0.45, 3), s(2.5, 1.5, 0.42, 3)],
    [s(0, 1.5, 0.5, 3), s(1.5, 0.5, 0.4, 2), s(3, 1, 0.42, 3)],
  ],
  arp: [
    [a(0, 2, 0.5, 0.6), a(0.5, 3, 0.5, 0.45), a(1, 4, 0.5, 0.5), a(1.5, 3, 0.5, 0.4), a(2, 2, 0.5, 0.55), a(2.5, 3, 0.5, 0.4), a(3, 4, 0.5, 0.5), a(3.5, 5, 0.5, 0.4)],
    [a(0, 0, 0.5, 0.55), a(1, 2, 0.5, 0.45), a(1.5, 3, 0.5, 0.5), a(2.5, 4, 0.5, 0.45), a(3, 3, 0.5, 0.4)],
    [a(0.5, 2, 0.5, 0.5), a(1.5, 4, 0.5, 0.45), a(2, 3, 0.5, 0.45), a(3, 5, 0.5, 0.4)],
  ],
  bass: [
    [bs(0, 'r', 1.8, 0.7), bs(2, '5', 1.6, 0.6)],
    [bs(0, 'r', 0.9, 0.7), bs(1.5, '5', 0.5, 0.5), bs(2, 'r', 0.9, 0.65), bs(3, 'o', 0.5, 0.5)],
  ],
  perc: [
    [...beats([0.5, 1.5, 2.5, 3.5], 'shaker', 0.2)],
    [p(0, 'kick', 0.3), ...beats([1, 3], 'wood', 0.3), ...beats([0.5, 1.5, 2.5, 3.5], 'shaker', 0.25)],
    [p(0, 'kick', 0.3), ...beats([1, 2, 3.5], 'wood', 0.3), ...beats([0.5, 1.5, 2.5, 3, 3.25, 3.5, 3.75], 'shaker', 0.25)],
  ],
  freePerc: [...beats([1, 2, 3], 'kick', 0.4), ...beats([0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75, 0.5, 1.5, 2.5, 3.5], 'hat', 0.22)],
  counter: {
    lo: 69,
    patterns: [
      [a(0.5, 2, 0.5, 0.6), a(1.5, 4, 0.5, 0.55), a(2.5, 3, 0.5, 0.55), a(3.5, 5, 0.5, 0.5)],
      [a(0.75, 3, 0.5, 0.55), a(1.75, 4, 0.5, 0.55), a(2.25, 2, 0.5, 0.5), a(3.25, 3, 0.5, 0.55)],
    ],
  },
}
