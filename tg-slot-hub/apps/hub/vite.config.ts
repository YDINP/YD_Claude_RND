import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { gamesAssetsPlugin } from './vite-plugins/gamesAssets.js'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version?: string
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // 설정 시트의 앱 버전 표시용 — 환경변수로 명시하지 않으면 package.json version을 심는다.
  const appVersion = env.VITE_APP_VERSION || pkg.version || 'dev'

  // 프로덕션 빌드에서 VITE_API_URL 누락 시 조용히 localhost로 폴백하면
  // 배포 후 "로그인 안 됨"만 보이고 원인 파악이 어려우므로 빌드 타임에 바로 막는다.
  // 개발(dev/test)에서는 sdk/api.ts의 localhost:8787 폴백을 그대로 쓴다.
  if (mode === 'production' && !env.VITE_API_URL) {
    throw new Error(
      '[apps/hub] VITE_API_URL이 설정되지 않았습니다. 프로덕션 빌드는 API 서버 주소가 필수입니다. ' +
        '.env.production 또는 배포 환경(Vercel 등)의 환경변수에 VITE_API_URL을 지정하세요.',
    )
  }

  // 브라우저 체험판: apps/api를 같은 탭 안에서 돌린다 (src/demo/server.ts). 서버·DB·봇 토큰이 필요 없다.
  // API 코드가 import하는 Node 모듈은 브라우저용 대체물로 바꿔 끼운다.
  const isBrowserDemo = mode === 'demo'
  const shim = (file: string): string => fileURLToPath(new URL(`./src/demo/shims/${file}`, import.meta.url))
  const demoAliases = isBrowserDemo
    ? [
        { find: /^node:crypto$/, replacement: shim('node-crypto.ts') },
        { find: /^node:(fs|path|url|os|child_process)$/, replacement: shim('node-stub.ts') },
        { find: /^@tgslot\/game-sdk\/node$/, replacement: shim('node-stub.ts') },
      ]
    : []
  const demoDefines = isBrowserDemo
    ? {
        'import.meta.env.VITE_BROWSER_DEMO': JSON.stringify('true'),
        'import.meta.env.VITE_DEV_MOCK_TMA': JSON.stringify('true'),
        // apps/api 라우트가 인라인으로 읽는다. 체험판은 결과 강제(debug spin)를 열지 않도록 production으로 둔다.
        'process.env.NODE_ENV': JSON.stringify('production'),
      }
    : {}

  return {
    plugins: [react(), gamesAssetsPlugin()],
    resolve: { alias: demoAliases },
    server: {
      port: 5173,
    },
    build: {
      target: 'esnext',
    },
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      ...demoDefines,
    },
  }
})
