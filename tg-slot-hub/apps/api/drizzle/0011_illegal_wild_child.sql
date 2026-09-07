-- M-1 / M-4: 멱등키 게임 스코프 + 지갑/원장 DB 레벨 방어
--
-- 1) rounds 유니크에 game_id 추가
--    (user_id, idempotency_key) -> (user_id, game_id, idempotency_key)
--    더 넓은 키로 가는 것이라 기존 데이터와 충돌할 수 없다. 무조건 성공한다.
--
-- 2) ledger (reason, ref_id) 유니크
--    !! 기존 DB에 같은 (reason, ref_id) 행이 있으면 이 문장은 실패한다 — 의도된 동작이다.
--    실패하면 데이터가 이미 오염된 것이므로 먼저 찾아서 정리해야 한다:
--        pnpm --filter @tgslot/api check:ledger      (ledger_duplicate_ref 행을 찍는다)
--    ref_id가 NULL인 행(보너스·미션 보상 등 정상적으로 반복되는 사유)은 Postgres UNIQUE가
--    NULL을 서로 다르게 보므로 걸리지 않는다.
--
-- 3) wallets.coins / wallets.gems CHECK >= 0
--    !! 이미 음수 잔액이 있으면 실패한다 — 이것도 의도된 동작이다. 먼저 확인:
--        select user_id, coins, gems from wallets where coins < 0 or gems < 0;
--
-- 적용 전 위 두 질의를 프리플라이트로 돌려 볼 것. 깨끗하면 그대로 통과한다.

ALTER TABLE "rounds" DROP CONSTRAINT "rounds_user_id_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_reason_ref_id_unique" UNIQUE("reason","ref_id");--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_user_id_game_id_idempotency_key_unique" UNIQUE("user_id","game_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_coins_non_negative" CHECK ("wallets"."coins" >= 0);--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_gems_non_negative" CHECK ("wallets"."gems" >= 0);