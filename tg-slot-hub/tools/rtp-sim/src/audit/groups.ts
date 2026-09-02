import type { GameMath } from '@tgslot/slot-engine'
import type { GroupInfo } from './types.js'

/**
 * `math.groups`를 방어적으로 읽는다.
 * 스키마가 아직 그룹을 모르는 버전이거나 모양이 바뀌어도 검수가 죽지 않아야 하므로
 * 레코드(`{ id: { name, members } }`)와 배열(`[{ id, name, symbols }]`) 양쪽을 모두 받는다.
 */
export function readGroups(math: GameMath): GroupInfo[] {
  const raw = (math as unknown as { groups?: unknown }).groups
  if (raw === undefined || raw === null) return []

  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.map((item, index) => [readId(item) ?? String(index), item])
    : typeof raw === 'object'
      ? Object.entries(raw as Record<string, unknown>)
      : []

  const groups: GroupInfo[] = []
  for (const [id, value] of entries) {
    groups.push({ id, label: readLabel(value, id), symbols: readMembers(value) })
  }
  return groups
}

function readId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const id = (value as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function readLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'object' || value === null) return fallback
  const name = (value as { name?: unknown }).name
  if (typeof name === 'string' && name.length > 0) return name
  if (typeof name === 'object' && name !== null) {
    const ko = (name as { ko?: unknown }).ko
    if (typeof ko === 'string' && ko.length > 0) return ko
    const en = (name as { en?: unknown }).en
    if (typeof en === 'string' && en.length > 0) return en
  }
  return fallback
}

function readMembers(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return []
  const holder = value as { members?: unknown; symbols?: unknown }
  const list = Array.isArray(holder.members) ? holder.members : Array.isArray(holder.symbols) ? holder.symbols : []
  return list.filter((item): item is string => typeof item === 'string')
}

/** 심볼 id -> 표시 이름 (ko 우선). 그룹 id도 함께 담는다. */
export function buildLabelMap(math: GameMath): Map<string, string> {
  const labels = new Map<string, string>()
  for (const symbol of math.symbols) {
    labels.set(symbol.id, symbol.name.ko ?? symbol.name.en)
  }
  for (const group of readGroups(math)) {
    labels.set(group.id, group.label)
  }
  return labels
}
