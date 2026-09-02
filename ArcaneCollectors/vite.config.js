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

/**
 * T-04 — dev 서버가 없는 에셋에 index.html(200) 을 돌려주는 SPA 폴백을 차단한다.
 *
 * Vite 의 html 폴백은 /assets/foo.png 가 없어도 index.html 을 200 으로 준다.
 * 그러면 Phaser 로더는 "받긴 받았는데 이미지가 아니다" 상태가 되어 실패가 조용히 묻힌다.
 * /assets/ 아래의 없는 파일은 404 로 돌려 로드 실패를 즉시 표면화한다.
 * 정적 서빙보다 앞에 서므로 실제 존재하는 파일은 next() 로 그대로 흘려보낸다.
 */
function assetNotFoundGuard(rootDir) {
  const ASSET_PREFIX = '/assets/';
  const PUBLIC_DIR = 'public';

  return {
    name: 'asset-404-guard',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || '';
        if (!rawUrl.startsWith(ASSET_PREFIX)) return next();

        let pathname;
        try {
          pathname = decodeURIComponent(rawUrl.split('?')[0].split('#')[0]);
        } catch {
          pathname = rawUrl.split('?')[0].split('#')[0];
        }

        // public/ 과 프로젝트 루트 양쪽을 본다 (Vite 정적 서빙 경로와 동일)
        const candidates = [
          pathResolve(rootDir, PUBLIC_DIR, '.' + pathname),
          pathResolve(rootDir, '.' + pathname)
        ];
        if (candidates.some((candidate) => existsSync(candidate))) return next();

        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(`404 asset not found: ${pathname}`);
      });
    }
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    resolveJsToTs(),
    assetNotFoundGuard(__dirname),
    // 번들 분석 플러그인 (analyze 모드에서만)
    ...(mode === 'analyze' ? [
      {
        name: 'visualizer',
        apply: 'build',
        enforce: 'post',
        generateBundle() {
          import('rollup-plugin-visualizer').then(({ visualizer }) => {
            visualizer({
              open: true,
              gzipSize: true,
              brotliSize: true,
              filename: 'dist/stats.html'
            });
          });
        }
      }
    ] : [])
  ],
  resolve: {
    extensions: ['.ts', '.js', '.json']
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // INFRA-1: 프로덕션에서는 소스맵 비활성화 (배포 크기 절감)
    sourcemap: mode === 'development',
    // 프로덕션 빌드에서 console.log 제거 (console.warn/error는 유지)
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: true,
        passes: 2
      },
      format: {
        comments: false
      }
    },
    // INFRA-1: 청크 사이즈 경고 기준 최적화
    chunkSizeWarningLimit: 600,
    // INFRA-1: 에셋 최적화 - 10KB 이하는 인라인 base64
    assetsInlineLimit: 10240,
    rollupOptions: {
      output: {
        // INFRA-1: 코드 스플리팅 전략 개선
        manualChunks: (id) => {
          // Phaser 엔진 (가장 큰 의존성)
          if (id.includes('node_modules/phaser')) {
            return 'phaser';
          }
          // Supabase 클라이언트
          if (id.includes('node_modules/@supabase')) {
            return 'supabase';
          }
          // 기타 node_modules
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          // JSON 데이터 파일
          if (id.includes('/src/data/') && id.endsWith('.json')) {
            return 'game-data';
          }
          // 순환 참조를 피하기 위해 scenes와 systems를 하나의 청크로 통합
          if (id.includes('/src/systems/') || id.includes('/src/scenes/')) {
            return 'game-core';
          }
          // UI 컴포넌트
          if (id.includes('/src/ui/')) {
            return 'game-ui';
          }
        },
        // 청크 파일명 최적화
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
}));
