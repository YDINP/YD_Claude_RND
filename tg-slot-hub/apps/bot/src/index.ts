import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { webhookCallback, type Bot } from 'grammy'
import { loadConfig, type BotConfig } from './config.js'
import { createBot } from './bot.js'

async function main() {
  const config = loadConfig()
  const bot = createBot(config)

  if (config.webhookUrl) {
    await startWebhookServer(bot, config)
  } else {
    await startPolling(bot)
  }
}

async function startPolling(bot: Bot) {
  await bot.init()
  console.log(`[bot] polling mode. logged in as @${bot.botInfo.username}`)

  const stop = (signal: NodeJS.Signals) => {
    console.log(`[bot] received ${signal}, stopping polling...`)
    bot.stop()
  }
  process.once('SIGINT', () => stop('SIGINT'))
  process.once('SIGTERM', () => stop('SIGTERM'))

  await bot.start({
    onStart: (info) => console.log(`[bot] started as @${info.username}`),
  })
}

async function startWebhookServer(bot: Bot, config: BotConfig) {
  await bot.init()

  // config.webhookSecret은 loadConfig()가 webhookUrl과 함께 필수(16자 이상)로 강제한다.
  // Node의 내장 http 모듈(IncomingMessage/ServerResponse)용 어댑터.
  const handleUpdate = webhookCallback(bot, 'http', {
    secretToken: config.webhookSecret,
  })

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    if (req.method === 'POST' && req.url === '/telegram/webhook') {
      try {
        await handleUpdate(req, res)
      } catch (err) {
        console.error('[bot] webhook handling error', err)
        if (!res.headersSent) {
          res.writeHead(500)
          res.end()
        }
      }
      return
    }

    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve) => server.listen(config.port, resolve))
  console.log(
    `[bot] webhook mode listening on :${config.port} (public url: ${config.webhookUrl}/telegram/webhook)`,
  )

  const stop = (signal: NodeJS.Signals) => {
    console.log(`[bot] received ${signal}, closing webhook server...`)
    server.close(() => process.exit(0))
  }
  process.once('SIGINT', () => stop('SIGINT'))
  process.once('SIGTERM', () => stop('SIGTERM'))
}

main().catch((err) => {
  console.error('[bot] fatal error during startup', err)
  process.exit(1)
})
