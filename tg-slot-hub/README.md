# tg-slot-hub

텔레그램 미니앱 슬롯 허브. 설계: [../TELEGRAM_SLOT_HUB_PLAN.md](../TELEGRAM_SLOT_HUB_PLAN.md)

```
pnpm install
cp .env.example .env   # TELEGRAM_BOT_TOKEN, JWT_SECRET 채우기
pnpm dev               # hub(5173) + api(8787) + bot(long polling)
pnpm test
```

## RTP 검수

수학 모델을 뜯어보는 도구가 둘 있다. 계산은 `@tgslot/rtp-sim/audit` 한 곳에만 있고
CLI와 GUI가 그것을 같이 쓴다. 그래서 리포트 숫자와 화면 숫자가 어긋날 수 없다.

```
pnpm --filter @tgslot/rtp-sim run audit classic-777     # docs/RTP_AUDIT_classic-777.md 생성
pnpm --filter @tgslot/rtp-sim run audit fruit-fiesta    # 5릴 게임은 해석적 계산 + 표본
pnpm --filter @tgslot/sim dev                           # 검수 시뮬레이터 GUI (5180)
```

- [`tools/rtp-sim`](tools/rtp-sim/README.md) — 측정 CLI, 검수 리포트, CI 게이트 테스트
- [`apps/sim`](apps/sim/README.md) — 브라우저 검수 시뮬레이터 (차트·표·샘플 스핀·리포트 내보내기)
