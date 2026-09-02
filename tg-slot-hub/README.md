# tg-slot-hub

텔레그램 미니앱 슬롯 허브. 설계: [../TELEGRAM_SLOT_HUB_PLAN.md](../TELEGRAM_SLOT_HUB_PLAN.md)

```
pnpm install
cp .env.example .env   # TELEGRAM_BOT_TOKEN, JWT_SECRET 채우기
pnpm dev               # hub(5173) + api(8787) + bot(long polling)
pnpm test
```
