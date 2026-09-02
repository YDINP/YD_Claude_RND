import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // 워크스페이스 패키지는 .ts 소스라 번들에 포함. 나머지 deps는 외부 유지.
  noExternal: ['@tgslot/shared'],
})
