import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // 프로덕션 빌드에서 console.log 제거 (console.warn/error는 유지)
    esbuild: {
      pure: ['console.log']
    },
    // D-4.6: 청크 사이즈 경고 기준 (Phaser가 크므로 1MB로 상향)
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // D-4.2: 코드 스플리팅 - Phaser를 별도 vendor 청크로 분리
        manualChunks: {
          phaser: ['phaser'],
          data: [
            './src/data/characters.json',
            './src/data/enemies.json',
            './src/data/items.json',
            './src/data/stages.json',
            './src/data/synergies.json',
            './src/data/banners.json'
          ]
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
