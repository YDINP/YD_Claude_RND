import { defineConfig } from 'tsup'

/**
 * 번들에 박아 넣을 NODE_ENV. **명시하지 않으면 production으로 본다.**
 *
 * 이 값이 `'production'`이면 `routes/games.ts`의 `DEBUG_SPIN_COMPILED_IN`이 `false` 리터럴이
 * 되고, 디버그 시드 재추첨(`games/debugSpin.ts`의 `findDebugSeed`)이 죽은 코드가 되어
 * 번들에서 통째로 사라진다. 빌드 산출물은 배포용이므로 "빠뜨리면 안전한 쪽"이 기본값이다.
 * 디버그 프리셋이 필요한 QA 빌드는 `NODE_ENV=development pnpm --filter @tgslot/api build`로 만든다.
 * (개발 서버는 `tsx watch`라 이 설정을 타지 않는다 — 항상 포함된다.)
 */
const BUNDLED_NODE_ENV = process.env.NODE_ENV ?? 'production'

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
  // `loadConfig`는 `process.env` 객체를 통째로 받아 `env.NODE_ENV`로 읽으므로 이 치환에
  // 걸리지 않는다. 즉 부팅 시점의 프로덕션 판정은 여전히 **실제 환경변수**를 본다.
  define: { 'process.env.NODE_ENV': JSON.stringify(BUNDLED_NODE_ENV) },
  esbuildOptions(options) {
    // 상수 폴딩과 죽은 분기 제거를 켠다. `define`이 `if (false)`까지만 만들어 주고 블록 본문은
    // 그대로 두기 때문에, 이게 없으면 디버그 재추첨 호출부가 (도달 불가능한 채) 번들에 남는다.
    // 식별자 난독화·공백 제거(`minifyIdentifiers`/`minifyWhitespace`)는 켜지 않으므로
    // 스택 트레이스와 가독성은 그대로다.
    options.minifySyntax = true
  },
})
