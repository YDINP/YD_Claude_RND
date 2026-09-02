import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { gamesAssetsPlugin } from './vite-plugins/gamesAssets.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // 프로덕션 빌드에서 VITE_API_URL 누락 시 조용히 localhost로 폴백하면
  // 배포 후 "로그인 안 됨"만 보이고 원인 파악이 어려우므로 빌드 타임에 바로 막는다.
  // 개발(dev/test)에서는 sdk/api.ts의 localhost:8787 폴백을 그대로 쓴다.
  if (mode === 'production' && !env.VITE_API_URL) {
    throw new Error(
      '[apps/hub] VITE_API_URL이 설정되지 않았습니다. 프로덕션 빌드는 API 서버 주소가 필수입니다. ' +
        '.env.production 또는 배포 환경(Vercel 등)의 환경변수에 VITE_API_URL을 지정하세요.',
    )
  }

  return {
    plugins: [react(), gamesAssetsPlugin()],
    server: {
      port: 5173,
    },
    build: {
      target: 'esnext',
    },
  }
})
