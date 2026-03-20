CREATE TABLE IF NOT EXISTS "task_notes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "task_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "body" text DEFAULT '' NOT NULL,
    "excerpt" text DEFAULT '' NOT NULL,
    "word_count" integer DEFAULT 0 NOT NULL,
    "heading_count" integer DEFAULT 0 NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "task_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "task_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_notes_task_id_idx" ON "task_notes" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_notes_user_id_idx" ON "task_notes" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "task_notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_notes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "task_notes_owner_access" ON "task_notes" AS PERMISSIVE FOR ALL
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
