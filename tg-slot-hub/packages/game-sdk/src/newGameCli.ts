import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SCAFFOLD_FILES, TEMPLATE_ID, isValidGameId, scaffoldGamePack } from './scaffold.js'
import { resolveGamesDir } from './node.js'

/**
 * `pnpm new:game <id>` — `games/_template`에서 새 게임 팩을 찍어낸다.
 *
 * 코드는 한 줄도 만들지 않는다. 데이터 파일과 체크리스트만 만든다 —
 * "새 게임은 코드가 아니라 데이터 팩"이라는 이 저장소의 전제를 그대로 지킨다.
 */

const USAGE = `사용법: pnpm new:game <게임-id>

games/_template에서 games/<게임-id>를 만든다. id는 kebab-case여야 하고
이미 있는 폴더면 아무것도 하지 않는다.

만들어지는 파일: ${SCAFFOLD_FILES.join(', ')}

다음 순서로 채운다:
  1. math.json (심볼·스트립·페이테이블) → pnpm --filter @tgslot/rtp-sim sim <id> --exact
  2. art/prompts.json (컨셉·프롬프트) → pnpm --filter @tgslot/theme-gen gen games/<id>
  3. art/fx.json (심볼 승리 연출)
  4. pnpm pack:check <id>`

function readTemplate(templateDir: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const path of SCAFFOLD_FILES) {
    const full = join(templateDir, ...path.split('/'))
    if (existsSync(full)) files[path] = readFileSync(full, 'utf8')
  }
  return files
}

function main(): void {
  const args = process.argv.slice(2).filter((arg) => arg !== '')
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(USAGE)
    return
  }
  const id = args[0] as string
  if (!isValidGameId(id)) throw new Error(`게임 id는 kebab-case여야 한다: ${id}\n\n${USAGE}`)

  const gamesDir = resolveGamesDir()
  const target = join(gamesDir, id)
  if (existsSync(target)) throw new Error(`이미 있는 폴더다: ${target}`)

  const templateDir = join(gamesDir, TEMPLATE_ID)
  if (!existsSync(templateDir)) throw new Error(`템플릿을 찾지 못했다: ${templateDir}`)

  const { files, skipped } = scaffoldGamePack(id, readTemplate(templateDir))
  for (const [path, content] of Object.entries(files)) {
    const full = join(target, ...path.split('/'))
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content, 'utf8')
    console.log(`  + games/${id}/${path}`)
  }
  for (const path of skipped) {
    console.warn(`  ! 템플릿에 없어 건너뛴다: games/${TEMPLATE_ID}/${path}`)
  }

  console.log(`\ngames/${id} 생성 완료. 다음 순서로 채운다:`)
  console.log('  1. math.json → pnpm --filter @tgslot/rtp-sim sim ' + id + ' --exact')
  console.log('  2. art/prompts.json → pnpm --filter @tgslot/theme-gen gen games/' + id)
  console.log('  3. art/fx.json (심볼 승리 연출)')
  console.log('  4. pnpm pack:check ' + id)
  console.log(`\n체크리스트: games/${id}/CHECKLIST.md`)
}

try {
  main()
} catch (error) {
  console.error(`[new:game] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
