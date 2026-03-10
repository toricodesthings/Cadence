ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY "users_self_access" ON "users"
    USING ("id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "user_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_metrics" FORCE ROW LEVEL SECURITY;
CREATE POLICY "user_metrics_owner_access" ON "user_metrics"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "ai_memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_memories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ai_memories_owner_access" ON "ai_memories"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "task_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_sections" FORCE ROW LEVEL SECURITY;
CREATE POLICY "task_sections_owner_access" ON "task_sections"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "projects_owner_access" ON "projects"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tasks_owner_access" ON "tasks"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tags_owner_access" ON "tags"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "task_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_tags" FORCE ROW LEVEL SECURITY;
CREATE POLICY "task_tags_owner_access" ON "task_tags"
    USING (
        EXISTS (
            SELECT 1
            FROM "tasks"
            WHERE "tasks"."id" = "task_tags"."task_id"
              AND "tasks"."user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM "tasks"
            JOIN "tags" ON "tags"."id" = "task_tags"."tag_id"
            WHERE "tasks"."id" = "task_tags"."task_id"
              AND "tasks"."user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid
              AND "tags"."user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid
        )
    );
--> statement-breakpoint
ALTER TABLE "inbox_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_sections" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inbox_sections_owner_access" ON "inbox_sections"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "inbox_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inbox_items_owner_access" ON "inbox_items"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "habits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "habits" FORCE ROW LEVEL SECURITY;
CREATE POLICY "habits_owner_access" ON "habits"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "habit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "habit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "habit_logs_owner_access" ON "habit_logs"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "subtasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subtasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subtasks_owner_access" ON "subtasks"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
--> statement-breakpoint
ALTER TABLE "task_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_metrics" FORCE ROW LEVEL SECURITY;
CREATE POLICY "task_metrics_owner_access" ON "task_metrics"
    USING ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK ("user_id" = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);
