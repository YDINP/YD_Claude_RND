/**
 * `pnpm setup:bot` — BotFather API를 통해 명령어/메뉴 버튼/설명을 en+ko로 설정한다.
 * 1회성 스크립트. 값이 바뀌면 다시 실행하면 된다.
 */
import { Bot } from 'grammy'
import { loadConfig } from './config.js'

async function main() {
  const config = loadConfig()
  const bot = new Bot(config.token)
  await bot.init()
  console.log(`[setup] connected as @${bot.botInfo.username}`)

  await bot.api.setMyCommands(
    [
      { command: 'start', description: 'Open the Slot Hub' },
      { command: 'help', description: 'Show help' },
    ],
    { language_code: 'en' },
  )
  await bot.api.setMyCommands(
    [
      { command: 'start', description: '슬롯 허브 열기' },
      { command: 'help', description: '도움말 보기' },
    ],
    { language_code: 'ko' },
  )
  console.log('[setup] setMyCommands 완료 (en, ko)')

  await bot.api.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Play', web_app: { url: config.miniAppUrl } },
  })
  console.log(`[setup] setChatMenuButton 완료 → ${config.miniAppUrl}`)

  await bot.api.setMyDescription(
    'Spin, win, and climb the leaderboard — all in one Telegram slot hub.',
    { language_code: 'en' },
  )
  await bot.api.setMyDescription(
    '한 곳에서 스핀하고, 승리하고, 리더보드에 올라보세요 — 텔레그램 슬롯 허브.',
    { language_code: 'ko' },
  )
  await bot.api.setMyShortDescription('Telegram slot hub — spin & win with friends.', {
    language_code: 'en',
  })
  await bot.api.setMyShortDescription('친구와 함께 즐기는 텔레그램 슬롯 허브.', {
    language_code: 'ko',
  })
  console.log('[setup] setMyDescription / setMyShortDescription 완료 (en, ko)')

  console.log(
    '\n[setup] 참고: t.me/<bot>/<app> 직접 링크가 필요하면 BotFather의 /newapp (또는 Menu Button 설정)을 ' +
      '별도로 1회 진행해야 합니다. 이 스크립트는 그 등록 자체는 대신하지 않습니다.',
  )
}

main().catch((err) => {
  console.error('[setup] 실패', err)
  process.exit(1)
})
