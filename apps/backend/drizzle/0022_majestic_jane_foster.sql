CREATE TABLE "saved_focus_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'preset' NOT NULL,
	"order_index" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_focus_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_nlp_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"parser_version" text DEFAULT '2.0.0' NOT NULL,
	"source_surface" text DEFAULT 'quick_add' NOT NULL,
	"raw_input" text NOT NULL,
	"cleaned_title" text NOT NULL,
	"parse_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_tier" text DEFAULT 'medium' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_nlp_metadata_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"parser_version" text DEFAULT '2.0.0' NOT NULL,
	"source_surface" text DEFAULT 'quick_add' NOT NULL,
	"raw_input" text NOT NULL,
	"cleaned_title" text NOT NULL,
	"parse_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_tier" text DEFAULT 'medium' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"heading_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "analysis_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "analysis_version" text;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "analysis_summary" text;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "source_surface" text DEFAULT 'inbox';--> statement-breakpoint
ALTER TABLE "saved_focus_views" ADD CONSTRAINT "saved_focus_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD CONSTRAINT "task_nlp_metadata_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD CONSTRAINT "task_nlp_metadata_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD CONSTRAINT "task_nlp_metadata_history_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD CONSTRAINT "task_nlp_metadata_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_focus_views_user_id_idx" ON "saved_focus_views" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_nlp_metadata_task_id_unique" ON "task_nlp_metadata" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_nlp_metadata_user_id_idx" ON "task_nlp_metadata" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_nlp_metadata_history_task_id_idx" ON "task_nlp_metadata_history" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_nlp_metadata_history_user_id_idx" ON "task_nlp_metadata_history" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_notes_task_id_idx" ON "task_notes" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_notes_user_id_idx" ON "task_notes" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "saved_focus_views_owner_access" ON "saved_focus_views" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));--> statement-breakpoint
CREATE POLICY "task_nlp_metadata_owner_access" ON "task_nlp_metadata" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));--> statement-breakpoint
CREATE POLICY "task_nlp_metadata_history_owner_access" ON "task_nlp_metadata_history" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));--> statement-breakpoint
CREATE POLICY "task_notes_owner_access" ON "task_notes" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));