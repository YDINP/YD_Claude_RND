import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { GameManifestSchema, toGameSummary } from '@tgslot/game-sdk'
import type { GameManifest, GamePack as SdkGamePack } from '@tgslot/game-sdk'
import { listGamePackDirs, loadGamePack as loadSdkGamePack, resolveGamesDir } from '@tgslot/game-sdk/node'
import type { GameSummary } from '@tgslot/shared'

export { resolveGamesDir }

const MANIFEST_FILE = 'manifest.json'

/**
 * 디스크에서 읽어 검증까지 끝낸 게임 팩 1개.
 * 발견·파싱·검증은 전부 `@tgslot/game-sdk/node`가 하는 일이고, 여기서는 로비 요약만 얹는다.
 */
export interface GamePack extends SdkGamePack {
  summary: GameSummary
}

/**
 * 게임 팩 1개를 읽고 **서빙 단계**까지 검증한다 (SDK에 위임).
 *
 * 스키마, 폴더명=manifest.id=math.id 동일성, manifest↔math 합의, 런타임이 실제로 받아가는 자산의
 * 존재만 본다. 저작 파이프라인 위생(git 추적 여부·고아 파일·prompts.json 정합성 등)은 보지 않는다 —
 * 그건 `pnpm pack:check`(game-sdk의 저작 도구, `stage: 'authoring'`)의 몫이지 부팅을 막을 이유가
 * 아니다. 부팅 시점에 터지는 편이 잘못된 팩으로 스핀을 받는 것보다 낫다는 판단은 그대로 유지한다.
 */
export function loadGamePack(dir: string): GamePack {
  const pack = loadSdkGamePack(dir, { stage: 'serving' })
  return { ...pack, summary: toGameSummary(pack.manifest) }
}

/**
 * manifest.json이 있는 폴더인지. **아트만 있는 폴더와 진짜 게임 팩을 가르는 기준**이다.
 * 아트 파이프라인이 `games/<id>/art`와 `theme`를 수학 팩보다 며칠 먼저 만들기 때문에
 * 이 구분이 없으면 아트 생성만으로 서버 부팅과 테스트가 통째로 막힌다.
 */
function hasManifest(dir: string): boolean {
  return existsSync(join(dir, MANIFEST_FILE))
}

/**
 * `manifest.json`만 먼저 읽어 `status`를 판정한다. "이 팩이 깨졌을 때 던질지 건너뛸지"를 정하는
 * 데만 쓴다 — 실제 팩 로딩(스키마 + 서빙 검증)은 `loadGamePack`이 별도로, 온전히 다시 한다.
 * manifest 자체가 깨져 있으면 status를 알 수 없다는 뜻이므로 undefined를 돌려준다. 이 경우
 * `live`와 똑같이 "무조건 던진다" 쪽으로 취급하는 것이 안전하다.
 */
function readManifestStatus(dir: string): GameManifest['status'] | undefined {
  try {
    const json = JSON.parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8')) as unknown
    const parsed = GameManifestSchema.safeParse(json)
    return parsed.success ? parsed.data.status : undefined
  } catch {
    return undefined
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * games 디렉터리 전체를 읽는다.
 *
 * - `manifest.json`이 **아예 없는** 폴더는 아직 게임이 아니라고 보고 경고만 남기고 건너뛴다
 *   (아트가 먼저 생성된 폴더). 이것 때문에 부팅이나 테스트가 막히면 안 된다.
 * - `manifest.json`은 있는데 팩이 깨졌으면(math.json 없음/파싱 실패, 런타임 자산 누락 등):
 *   - `status: "hidden"`이면 **경고 로그만 남기고 건너뛴다.** `createGameRegistry`가 hidden 팩은
 *     로비 목록에도, 공개 조회(`getVisible`)에도 노출하지 않으니 — 어차피 아무도 서빙받지 않는
 *     팩이 "아직 다 안 그렸다"는 이유로 부팅 전체를 무너뜨릴 이유가 없다.
 *   - `live`/`soon`이면(또는 status를 알 수 없으면) **던진다.** 만들다 만 팩을 로비에 올리는 것이
 *     조용히 빠뜨리는 것보다 위험하다는 기존 판단을 그대로 유지한다.
 */
export function loadGamePacks(gamesDir: string = resolveGamesDir()): GamePack[] {
  const packs: GamePack[] = []
  for (const dir of listGamePackDirs(gamesDir)) {
    const id = basename(dir)
    if (!hasManifest(dir)) {
      console.warn(`[games] skipping incomplete pack ${id}`)
      continue
    }

    // 던질지 건너뛸지를 정하려면 status를 먼저 알아야 한다 — 실제 로딩보다 앞서 판정한다.
    const status = readManifestStatus(dir)
    try {
      packs.push(loadGamePack(dir))
    } catch (error) {
      if (status === 'hidden') {
        console.warn(`[games] skipping hidden pack ${id} (load failed): ${errorMessage(error)}`)
        continue
      }
      throw error
    }
  }
  return packs
}
