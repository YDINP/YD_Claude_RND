-- Custom SQL migration file, put your code below! --
-- 잭팟 시드를 50,000 -> 25,000으로 낮춘다 (src/economy/config.ts의 JACKPOT_SEED와 같아야 한다).
-- 시드는 잭팟의 RTP 기여를 정하는 값이다: 스핀당 기대 지급 = (SEED + 50,000) / 50,000 x 적립액.
-- 50,000이면 적립액의 2배(=베팅의 2%), 25,000이면 1.5배(=1.5%)다.
UPDATE "jackpot_pool" SET "seed" = 25000, "updated_at" = now() WHERE "id" = 1;
--> statement-breakpoint
-- 현재 풀도 같이 내린다. 단 **아직 아무도 돌리지 않은 초기 상태일 때만**이다.
-- 이미 적립이 쌓였거나 당첨 이력이 있으면 유저에게 보이던 풀을 깎는 셈이라 건드리지 않는다.
UPDATE "jackpot_pool"
SET "pool" = 25000, "updated_at" = now()
WHERE "id" = 1
  AND "pool" = 50000
  AND NOT EXISTS (SELECT 1 FROM "jackpot_hits");
