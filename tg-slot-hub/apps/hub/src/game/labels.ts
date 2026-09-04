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
 * 승리 라인 하나의 표시 "이름"만 돌려준다 — `group`으로 맞았으면 그룹 이름, 아니면 심볼 이름.
 * count/ways/금액은 여기서 붙이지 않는다: 지급 종류(라인/ways/그룹)마다 자연스러운 순서가
 * 달라서(예: ways는 "심볼 ×count · N ways · 금액"), 그 합성은 실제로 문구를 그리는 호출부
 * (GameScreen의 WinStrip 라인 문구)가 맡는다. 예전엔 이 함수가 ways를 "심볼 × N ways"로
 * 스스로 붙였는데, 호출부가 그 뒤에 다시 `×{count}`를 이어 붙이는 바람에 "판다 × 4 ways ×5"처럼
 * 이중으로 겹쳐 보이는 버그가 있었다 — 이제는 이름만 맡고 합성은 전부 호출부 책임이다.
 */
export function winLineLabel(math: GameMath, win: { symbol: string; group?: string }, locale: Locale): string {
  return win.group ? groupLabel(math, win.group, locale) : symbolLabel(math, win.symbol, locale)
}
