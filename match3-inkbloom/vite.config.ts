import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: { emptyOutDir: false },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
