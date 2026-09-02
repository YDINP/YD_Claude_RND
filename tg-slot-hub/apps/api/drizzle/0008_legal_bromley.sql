CREATE TABLE IF NOT EXISTS "game_states" (
	"user_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"free_spins" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_states_user_id_game_id_pk" PRIMARY KEY("user_id","game_id")
);
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "is_free_spin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "features" jsonb;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "free_spins_after" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_states" ADD CONSTRAINT "game_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
