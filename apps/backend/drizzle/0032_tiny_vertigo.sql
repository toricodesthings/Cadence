CREATE TABLE "personal_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"month_day" text NOT NULL,
	"emoji" text,
	"notify" boolean DEFAULT true NOT NULL,
	"started_on" date,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_events_label_len" CHECK (char_length("personal_events"."label") BETWEEN 1 AND 80),
	CONSTRAINT "personal_events_month_day" CHECK ("personal_events"."month_day" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
	CONSTRAINT "personal_events_emoji_len" CHECK ("personal_events"."emoji" IS NULL OR char_length("personal_events"."emoji") <= 4)
);
--> statement-breakpoint
ALTER TABLE "personal_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "personal_events" ADD CONSTRAINT "personal_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_events_user_id_idx" ON "personal_events" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "personal_events_owner_access" ON "personal_events" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));