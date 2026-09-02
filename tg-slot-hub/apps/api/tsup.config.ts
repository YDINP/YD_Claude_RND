import { defineConfig } from 'tsup'

export default defineConfig({
  // 서버 본체 + 원장 불변식 검사 CLI. 후자는 배포 환경에서 devDependency(tsx) 없이
  // `node dist/scripts/checkLedger.js`로 돌 수 있어야 해서 빌드 산출물에 포함한다.
  entry: ['src/index.ts', 'src/scripts/checkLedger.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // 워크스페이스 패키지는 .ts 소스라 번들에 포함. 나머지 deps는 외부 유지.
  noExternal: ['@tgslot/shared', '@tgslot/slot-engine', '@tgslot/game-sdk'],
})
