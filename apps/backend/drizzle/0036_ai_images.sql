CREATE TABLE "ai_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"diagnostics_shared_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_images" ADD CONSTRAINT "ai_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_images_user_convo_hash_unique" ON "ai_images" USING btree ("user_id","conversation_id","content_hash");--> statement-breakpoint
CREATE INDEX "ai_images_last_used_idx" ON "ai_images" USING btree ("last_used_at");--> statement-breakpoint
CREATE POLICY "ai_images_owner_access" ON "ai_images" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));