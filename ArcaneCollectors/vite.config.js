import { defineConfig } from 'vite';
import { existsSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Custom plugin to resolve .js imports to .ts files
function resolveJsToTs() {
  return {
    name: 'resolve-js-to-ts',
    resolveId(source, importer) {
      // Skip if not a relative import ending in .js
      if (!source.endsWith('.js') || !source.startsWith('.')) {
        return null;
      }

      // Get the directory of the importer
      const importerDir = importer ? dirname(importer) : __dirname;
      const jsPath = pathResolve(importerDir, source);
      const tsPath = jsPath.replace(/\.js$/, '.ts');

      // Check if .ts file exists instead of .js
      if (!existsSync(jsPath) && existsSync(tsPath)) {
        return tsPath;
      }

      return null;
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [resolveJsToTs()],
  resolve: {
    extensions: ['.ts', '.js', '.json']
  },
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
