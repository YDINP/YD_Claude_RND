CREATE TABLE IF NOT EXISTS "bonus_claims" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"streak_day" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jackpot_hits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"round_id" uuid,
	"amount" bigint NOT NULL,
	"won_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jackpot_pool" (
	"id" integer PRIMARY KEY NOT NULL,
	"pool" bigint NOT NULL,
	"seed" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leaderboard_weekly" (
	"user_id" uuid NOT NULL,
	"week" text NOT NULL,
	"total_win" bigint DEFAULT 0 NOT NULL,
	"best_multiplier" double precision DEFAULT 0 NOT NULL,
	"spins" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_weekly_user_id_week_pk" PRIMARY KEY("user_id","week")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mission_progress" (
	"user_id" uuid NOT NULL,
	"day" text NOT NULL,
	"mission_id" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mission_progress_user_id_day_mission_id_pk" PRIMARY KEY("user_id","day","mission_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "xp" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bonus_claims" ADD CONSTRAINT "bonus_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jackpot_hits" ADD CONSTRAINT "jackpot_hits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboard_weekly" ADD CONSTRAINT "leaderboard_weekly_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bonus_claims_user_kind_claimed_at_idx" ON "bonus_claims" USING btree ("user_id","kind","claimed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaderboard_weekly_week_total_win_idx" ON "leaderboard_weekly" USING btree ("week","total_win");--> statement-breakpoint
-- 손으로 덧붙인 시드 행. drizzle-kit generate는 데이터를 만들지 않는다.
-- 잭팟 풀은 항상 id=1 한 행이며, 값은 src/economy/config.ts의 JACKPOT_SEED와 같아야 한다.
INSERT INTO "jackpot_pool" ("id", "pool", "seed") VALUES (1, 50000, 50000) ON CONFLICT ("id") DO NOTHING;
