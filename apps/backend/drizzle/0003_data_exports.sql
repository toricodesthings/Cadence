CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"bytes" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "data_exports_status_check" CHECK (status IN ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "data_exports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_exports_user_requested_idx" ON "data_exports" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE POLICY "data_exports_owner_access" ON "data_exports" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));