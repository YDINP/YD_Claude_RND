import { serve } from '@hono/node-server'
import { loadConfig } from './config.js'
import { createRepos } from './repos/index.js'
import { createApp } from './app.js'

const config = loadConfig()
const repos = createRepos(config)
const app = createApp({ config, repos })

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`)
})
