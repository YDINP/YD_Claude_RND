import { COLORS, N } from './constants'
import { NO_FLOOR } from './types'

const ALBUM_KEY = 'inkbloom.album'
const ENCODE_OFFSET = 2

export interface AlbumEntry { stars: number; score: number; floor: string; at: number }
export type Album = Partial<Record<string, AlbumEntry>>

export function encodeFloor(floor: ArrayLike<number>): string {
  const chars: string[] = []
  for (let i = 0; i < N; i++) chars.push(String.fromCharCode(97 + (floor[i]! + ENCODE_OFFSET)))
  return chars.join('')
}

export function decodeFloor(s: string): Int8Array {
  const arr = new Int8Array(N).fill(NO_FLOOR)
  for (let i = 0; i < N && i < s.length; i++) {
    const v = s.charCodeAt(i) - 97 - ENCODE_OFFSET
    arr[i] = v >= 0 && v < COLORS ? v : NO_FLOOR
  }
  return arr
}

export function mergeEntry(existing: AlbumEntry | undefined, next: AlbumEntry): AlbumEntry {
  if (!existing) return next
  if (next.stars > existing.stars) return next
  if (next.stars === existing.stars && next.score > existing.score) return next
  return existing
}

const isEntry = (v: unknown): v is AlbumEntry => {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.stars === 'number' && typeof e.score === 'number' && typeof e.floor === 'string' && typeof e.at === 'number'
}

export function parseAlbum(raw: string | null): Album {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Album = {}
    for (const [k, v] of Object.entries(parsed)) if (isEntry(v)) out[k] = v
    return out
  } catch {
    return {}
  }
}

export function loadAlbum(): Album {
  try {
    return parseAlbum(localStorage.getItem(ALBUM_KEY))
  } catch {
    return {}
  }
}

export function saveAlbum(album: Album): void {
  try {
    localStorage.setItem(ALBUM_KEY, JSON.stringify(album))
  } catch {
    return
  }
}
