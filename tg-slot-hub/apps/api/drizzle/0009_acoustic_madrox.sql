ALTER TABLE "game_states" ADD COLUMN "state" jsonb;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "multiplier" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "free_spins_summary" jsonb;--> statement-breakpoint
ALTER TABLE "game_states" DROP COLUMN IF EXISTS "free_spins";