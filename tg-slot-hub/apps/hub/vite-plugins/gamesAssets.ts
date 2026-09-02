/**
 * `games/<id>/theme/**`(그리고 `games/<id>/thumb.*`, 있으면)를 hub가 직접 서빙하는 Vite 플러그인.
 *
 * dev 미들웨어는 반드시 "pre" 훅(configureServer에서 함수를 반환하지 않는 형태)으로 등록해야 한다.
 * Vite의 내장 SPA html-fallback 미들웨어는 Accept 헤더가 text/html이거나 와일드카드(모든 타입)인
 * 요청을 index.html로 돌려보내는데, fetch()의 기본 Accept가 그 와일드카드라서 "post" 훅으로
 * 등록하면(내장 미들웨어 다음에 실행) 우리 미들웨어에 도달하기 전에 index.html이 먼저 응답돼 버린다.
 * 재현: `curl http://host/games/classic-777/theme/theme.json` → `<!doctype html>`,
 *       `curl -H "Accept: application/json" ...` → 정상 JSON.
 * "pre" 훅으로 먼저 가로채되, `resolveGameAssetPath()`가 games/ 소스에 실제로 존재하는 파일일
 * 때만 응답하고 그 외엔 next()로 넘겨 `public/`의 기존 파일(예: thumb.svg)을 가리지 않는다.
 */
import { existsSync, statSync, mkdirSync, readdirSync, cpSync, createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** tg-slot-hub/games — 게임 팩 소스 디렉터리. */
export const GAMES_SRC_DIR = path.resolve(__dirname, '../../../games')
export const GAMES_URL_PREFIX = '/games/'

export const MIME_BY_EXT: Record<string, string> = {
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
}

/**
 * 요청 URL(`/games/<id>/...`)을 games 소스 디렉터리 안의 실제 파일 절대경로로 푼다.
 * - `/games/`로 시작하지 않으면 null
 * - 경로 순회(`..`)로 gamesRoot 밖을 가리키면 null
 * - 파일이 존재하지 않거나 디렉터리면 null
 *
 * gamesRoot를 주입 가능하게 해 테스트가 실제 games/ 디렉터리 상태에 의존하지 않게 한다.
 */
export function resolveGameAssetPath(urlPath: string, gamesRoot: string = GAMES_SRC_DIR): string | null {
  if (!urlPath.startsWith(GAMES_URL_PREFIX)) return null

  const relPath = decodeURIComponent(urlPath.slice(GAMES_URL_PREFIX.length).split('?')[0] ?? '')
  if (!relPath) return null

  const normalizedRoot = path.resolve(gamesRoot)
  const filePath = path.resolve(normalizedRoot, relPath)
  if (filePath !== normalizedRoot && !filePath.startsWith(normalizedRoot + path.sep)) return null

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return null
  return filePath
}

/** 확장자로 Content-Type을 고른다. 모르는 확장자는 옥텟 스트림으로 폴백한다. */
export function mimeTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/**
 * games 소스 디렉터리 바로 아래의 게임 팩 폴더 이름 목록.
 * `_`로 시작하는 폴더(`_template`)는 스캐폴드이므로 제외한다 — `apps/api/src/games/packs.ts`와 동일한 규칙.
 * gamesRoot를 주입 가능하게 해 테스트가 실제 games/ 디렉터리 상태에 의존하지 않게 한다.
 */
export function listGamePackIds(gamesRoot: string = GAMES_SRC_DIR): string[] {
  if (!existsSync(gamesRoot)) return []
  return readdirSync(gamesRoot).filter((name) => {
    if (name.startsWith('_')) return false
    return statSync(path.join(gamesRoot, name)).isDirectory()
  })
}

export function gamesAssetsPlugin(): Plugin {
  return {
    name: 'tgslot-games-assets',
    configureServer(server) {
      // "pre" 훅 — 함수를 반환하지 않아 Vite 내장 미들웨어(html-fallback 포함)보다 먼저 실행된다.
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        // 정적 자산 서빙이므로 GET/HEAD만 다룬다. 다른 메서드는 그대로 넘긴다.
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const filePath = resolveGameAssetPath(req.url)
        if (!filePath) return next()
        res.setHeader('Content-Type', mimeTypeFor(filePath))
        res.setHeader('Cache-Control', 'no-cache')
        const stream = createReadStream(filePath)
        // 스트리밍 도중 읽기 오류가 나면 응답이 조용히 끊기지 않도록 Vite 에러 오버레이로 넘긴다.
        stream.on('error', (err) => next(err))
        stream.pipe(res)
      })
    },
    closeBundle() {
      const outDir = path.resolve(__dirname, '../dist/games')

      for (const gameId of listGamePackIds()) {
        const gameDir = path.join(GAMES_SRC_DIR, gameId)

        const themeDir = path.join(gameDir, 'theme')
        if (existsSync(themeDir)) {
          const dest = path.join(outDir, gameId, 'theme')
          mkdirSync(dest, { recursive: true })
          cpSync(themeDir, dest, { recursive: true })
        }

        // 게임 소스 디렉터리에 thumb.*가 있으면 함께 복사한다 (public/의 기존 thumb.svg는 건드리지 않음).
        for (const file of readdirSync(gameDir)) {
          if (!file.startsWith('thumb.')) continue
          mkdirSync(path.join(outDir, gameId), { recursive: true })
          cpSync(path.join(gameDir, file), path.join(outDir, gameId, file))
        }
      }
    },
  }
}
