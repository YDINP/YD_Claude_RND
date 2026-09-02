import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const dirname = path.dirname(fileURLToPath(import.meta.url))
/** 모노레포 루트. games/*.json을 import.meta.glob으로 끌어오므로 dev 서버가 이 밖을 볼 수 있어야 한다. */
const workspaceRoot = path.resolve(dirname, '../..')

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    fs: { allow: [workspaceRoot] },
  },
  build: {
    target: 'esnext',
  },
  worker: {
    format: 'es',
  },
})
