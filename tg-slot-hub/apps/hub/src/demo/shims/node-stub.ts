/**
 * 체험판 전용 Node 모듈 빈 껍데기 (node:fs·node:path·node:url·node:os·@tgslot/game-sdk/node).
 * apps/api의 디스크 로딩 코드가 import는 하지만 체험판에서는 부르지 않는다. 부르면 바로 던진다.
 */
const fail = (name: string) => (): never => {
  throw new Error(`[demo] 브라우저 체험판에서는 ${name}을(를) 쓸 수 없다`)
}

export const existsSync = fail('fs.existsSync')
export const readFileSync = fail('fs.readFileSync')
export const readdirSync = fail('fs.readdirSync')
export const statSync = fail('fs.statSync')
export const basename = fail('path.basename')
export const dirname = fail('path.dirname')
export const join = fail('path.join')
export const resolve = fail('path.resolve')
export const fileURLToPath = fail('url.fileURLToPath')
export const homedir = fail('os.homedir')
export const tmpdir = fail('os.tmpdir')
export const listGamePackDirs = fail('listGamePackDirs')
export const loadGamePack = fail('loadGamePack')
export const resolveGamesDir = fail('resolveGamesDir')
export default {}
