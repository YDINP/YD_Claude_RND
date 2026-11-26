/**
 * 도움말 «특수 기능» 탭의 규칙 카드. 팩의 math.json 값(뮤테이션·묶음 배당·더블업·와일드 릴)을
 * 읽어 문장을 만든다 — 팩마다 규칙 문구를 따로 쓰지 않아도 숫자와 설명이 어긋나지 않는다.
 */
import type { ReactNode } from 'react'
import { getWildIds, type GameMath } from '@tgslot/slot-engine'
import type { Locale } from '@tgslot/shared'
import type { TranslationKey } from '../../i18n'
import { groupLabel, groupMembers, symbolLabel } from '../../game/labels'

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string

export interface RuleSection {
  title: string
  lines: string[]
}

/** 0부터 센 릴 인덱스를 사람이 읽는 «2·3·4»로. */
function reelList(reels: readonly number[]): string {
  return [...reels]
    .sort((a, b) => a - b)
    .map((reel) => reel + 1)
    .join('·')
}

function percent(chance: number): string {
  return String(Math.round(chance * 1000) / 10)
}

/** 와일드가 스트립에 실제로 들어 있는 릴. 전 릴이면 null(따로 말할 게 없다). */
function wildReels(math: GameMath): number[] | null {
  const wilds = getWildIds(math)
  if (wilds.size === 0) return null
  const reels = math.strips.flatMap((strip, reel) => (strip.some((symbol) => wilds.has(symbol)) ? [reel] : []))
  return reels.length > 0 && reels.length < math.reels ? reels : null
}

/** 페이라인/웨이즈 탭 위에 붙는 지급 방식 규칙(왼쪽부터, 한 줄 한 배당). 클러스터는 ClusterHelp가 맡는다. */
export function payRuleLines(math: GameMath, t: Translate): string[] {
  if (math.payModel === 'lines') return [t('ruleLinesLeftToRight'), t('ruleHighestPerLine')]
  if (math.payModel === 'ways' && math.ways?.bothWays !== true) return [t('ruleWaysAdjacent')]
  return []
}

/** 순수 함수: 그릴 규칙 카드 목록. 비어 있으면 그릴 것이 없다. */
export function featureRuleSections(math: GameMath, locale: Locale, t: Translate): RuleSection[] {
  const sections: RuleSection[] = []
  const name = (id: string): string => symbolLabel(math, id, locale)
  const special = new Set<string>(getWildIds(math))
  if (math.scatter) special.add(math.scatter.symbol)

  const basics: string[] = []
  const onlyReels = wildReels(math)
  if (onlyReels !== null) basics.push(t('ruleWildReels', { reels: reelList(onlyReels) }))
  for (const groupId of Object.keys(math.groups ?? {})) {
    if (math.paytable[groupId] === undefined) continue
    const members = groupMembers(math, groupId).map(name).join('·')
    basics.push(t('ruleGroupMix', { group: groupLabel(math, groupId, locale), members }))
  }
  if (math.payModel === 'lines') {
    for (const [id, rule] of Object.entries(math.paytable)) {
      if (rule[1] !== undefined && rule[1] > 0) basics.push(t('ruleSingleOnReel1', { symbol: name(id) }))
    }
  }
  if (basics.length > 0) sections.push({ title: t('rulesTitle'), lines: basics })

  for (const mutation of math.mutations ?? []) {
    switch (mutation.type) {
      case 'mystery': {
        const lines = [t('mysteryRule')]
        if (!Object.keys(mutation.weights).some((id) => special.has(id))) lines.push(t('mysteryNoSpecial'))
        sections.push({ title: t('mysteryTitle'), lines })
        break
      }
      case 'expandWild': {
        const reels = reelList(mutation.reels ?? Array.from({ length: math.reels }, (_, i) => i))
        const lines = [
          mutation.minCount > 1
            ? t('expandWildRuleMin', { reels, min: mutation.minCount })
            : t('expandWildRule', { reels }),
        ]
        if (!mutation.coverScatter && math.scatter) lines.push(t('expandWildKeepsScatter'))
        sections.push({ title: t('expandWildTitle'), lines })
        break
      }
      case 'upgrade': {
        const line =
          mutation.chance === undefined
            ? t('upgradeRuleAlways', { min: mutation.minCount, from: name(mutation.from), to: name(mutation.to) })
            : t('upgradeRule', {
                min: mutation.minCount,
                from: name(mutation.from),
                to: name(mutation.to),
                chance: percent(mutation.chance),
              })
        // 승급 사다리는 단계마다 뮤테이션 하나다 — 같은 카드에 한 줄씩 모은다.
        const last = sections[sections.length - 1]
        if (last !== undefined && last.title === t('upgradeTitle')) last.lines.push(line)
        else sections.push({ title: t('upgradeTitle'), lines: [line] })
        break
      }
      case 'randomWild': {
        const counts = Object.keys(mutation.countWeights)
          .map(Number)
          .sort((a, b) => a - b)
        const min = counts[0] ?? 1
        const max = counts[counts.length - 1] ?? min
        const reels = reelList(mutation.reels ?? Array.from({ length: math.reels }, (_, i) => i))
        sections.push({
          title: t('randomWildTitle'),
          lines: [
            t('randomWildRule', {
              chance: percent(mutation.chance),
              count: min === max ? String(min) : `${min}~${max}`,
              reels,
            }),
          ],
        })
        break
      }
    }
  }

  // 승급은 엔진 계약상 상위 단부터 선언한다. 읽는 사람에게는 아래 단부터 올라가는 순서가 자연스럽다.
  const upgrade = sections.find((section) => section.title === t('upgradeTitle'))
  upgrade?.lines.reverse()

  if (math.gamble) {
    sections.push({
      title: t('gambleRulesTitle'),
      lines: [
        t('gambleRule', {
          payout: math.gamble.payout,
          percent: percent(math.gamble.chance),
          steps: math.gamble.maxSteps,
        }),
        t('gambleRuleKeep'),
      ],
    })
  }
  return sections
}

export function FeatureRules({ sections }: { sections: RuleSection[] }): ReactNode {
  return (
    <>
      {sections.map((section) => (
        <div key={section.title} className="hub-features__section">
          <h3 className="hub-sheet__subtitle">{section.title}</h3>
          <ul className="hub-features__rules">
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}
