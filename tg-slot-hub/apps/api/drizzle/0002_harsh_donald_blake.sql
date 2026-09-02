CREATE TABLE IF NOT EXISTS "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"bet" bigint NOT NULL,
	"win" bigint DEFAULT 0 NOT NULL,
	"stops" jsonb NOT NULL,
	"wins" jsonb NOT NULL,
	"seed" text NOT NULL,
	"seed_hash" text NOT NULL,
	"nonce" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rounds_user_id_idempotency_key_unique" UNIQUE("user_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "nonce" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rounds" ADD CONSTRAINT "rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
