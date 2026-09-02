/**
 * math.json 심볼/그룹 이름을 로케일에 맞춰 고르는 공용 헬퍼.
 * store/game.ts(승리 라인 명판, renderer의 formatLineLabel)와
 * components/game/GameScreen.tsx(배당표 시트)가 함께 쓴다.
 *
 * "그룹"은 페이테이블 항목 하나가 여러 심볼을 한데 묶어 배당하는 것이다
 * (예: `anybar: { 3: 5 }` — bar1/bar2/bar3 중 아무 조합이나 맞아도 지급).
 * `WinLine.group`이 있으면 `WinLine.symbol`은 그룹 id를 담는다.
 */
import type { GameMath } from '@tgslot/slot-engine'
import type { LocalizedString, Locale } from '@tgslot/shared'

/** `{en, ko?}` 형태의 이름을 현재 로케일에 맞춰 고른다. ko 번역이 없으면 en으로 폴백한다. */
export function localizedName(name: LocalizedString, locale: Locale): string {
  if (locale === 'ko' && name.ko) return name.ko
  return name.en
}

/** `math.symbols[id].name`을 로케일에 맞춰 고른다. 선언되지 않은 id면 그대로 돌려준다. */
export function symbolLabel(math: GameMath, symbolId: string, locale: Locale): string {
  const symbol = math.symbols.find((s) => s.id === symbolId)
  return symbol ? localizedName(symbol.name, locale) : symbolId
}

/** `math.groups[id].name`을 로케일에 맞춰 고른다. 선언되지 않은 id면 그대로 돌려준다. */
export function groupLabel(math: GameMath, groupId: string, locale: Locale): string {
  const group = math.groups?.[groupId]
  return group ? localizedName(group.name, locale) : groupId
}

/** `math.groups[id]`의 구성원 심볼 id 목록. 그룹이 아니거나 없으면 빈 배열. */
export function groupMembers(math: GameMath, groupId: string): string[] {
  return math.groups?.[groupId]?.members ?? []
}

/**
 * 승리 라인 하나의 표시 이름. `group`으로 맞았으면 그룹 이름, 아니면 심볼 이름.
 * ways 지급(`win.ways`가 있음)이면 "심볼 × N ways"로 붙인다 — "ways"는 장르 용어라 로케일과
 * 무관하게 영어 그대로 둔다(렌더러 팀 예시 문구도 한국어 라벨에서 "ways"를 그대로 썼다).
 * 라인 게임은 라인 1개당 배당이라 경로 수 개념이 없으므로 `ways`가 없으면 이름만 돌려준다.
 */
export function winLineLabel(
  math: GameMath,
  win: { symbol: string; group?: string; ways?: number },
  locale: Locale,
): string {
  const label = win.group ? groupLabel(math, win.group, locale) : symbolLabel(math, win.symbol, locale)
  return win.ways ? `${label} × ${win.ways} ways` : label
}
