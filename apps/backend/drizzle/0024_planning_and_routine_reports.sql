CREATE TABLE "planning_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"kind" text NOT NULL,
	"project_id" uuid,
	"chosen" text,
	"feasible" text[],
	"suggested" boolean NOT NULL,
	"outcome" text NOT NULL,
	"fingerprint" text,
	"said_on" date NOT NULL,
	"forgotten_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_records_kind_check" CHECK (kind IN ('slot', 'steps', 'later')),
	CONSTRAINT "planning_records_outcome_check" CHECK (outcome IN ('chosen', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "planning_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "duration_reports" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "duration_reports" ALTER COLUMN "completed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "duration_reports" ADD COLUMN "habit_id" uuid;--> statement-breakpoint
ALTER TABLE "duration_reports" ADD COLUMN "target_date" date;--> statement-breakpoint
ALTER TABLE "duration_reports" ADD COLUMN "wall_time" text;--> statement-breakpoint
ALTER TABLE "planning_records" ADD CONSTRAINT "planning_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_records" ADD CONSTRAINT "planning_records_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planning_records_user_kind_idx" ON "planning_records" USING btree ("user_id","kind","said_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "planning_records_task_idx" ON "planning_records" USING btree ("task_id");--> statement-breakpoint
ALTER TABLE "duration_reports" ADD CONSTRAINT "duration_reports_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duration_reports_habit_occurrence_unique" ON "duration_reports" USING btree ("habit_id","target_date",coalesce("wall_time", ''));--> statement-breakpoint
ALTER TABLE "duration_reports" ADD CONSTRAINT "duration_reports_subject_check" CHECK ((task_id IS NOT NULL AND completed_at IS NOT NULL AND habit_id IS NULL AND target_date IS NULL) OR (habit_id IS NOT NULL AND target_date IS NOT NULL AND task_id IS NULL AND completed_at IS NULL));--> statement-breakpoint
CREATE POLICY "planning_records_owner_access" ON "planning_records" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
-- Basic is on for anyone who hasn't chosen (0.37.0): the memory job's work list treats an unchosen memory as Basic.
-- (Replaces the function from 0017; ids only, as before.)
CREATE OR REPLACE FUNCTION "memory_user_ids"(at timestamptz) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT u.id FROM users u
    WHERE EXISTS (
            SELECT 1 FROM ai_memories m
            WHERE m.user_id = u.id AND m.status = 'forgotten' AND m.forgotten_at <= at - interval '10 minutes'
              AND m.value ->> 'scrubbed' IS DISTINCT FROM 'true')
       OR (COALESCE(u.settings -> 'assistant' ->> 'memoryMode', 'basic') IN ('basic', 'full') AND EXISTS (
            SELECT 1 FROM ai_conversations c
            WHERE c.user_id = u.id AND c.last_message_at < at - interval '10 minutes'
              AND c.last_message_at > at - interval '3 days'
              AND (c.metadata ->> 'memoryCursor' IS NULL OR (c.metadata ->> 'memoryCursor')::timestamptz < c.last_message_at)
              AND COALESCE(c.metadata ->> 'learn', 'true') <> 'false'))
       OR (u.settings -> 'assistant' ->> 'memoryMode' = 'full' AND EXISTS (
            SELECT 1 FROM task_notes t
            WHERE t.user_id = u.id AND t.updated_at < at - interval '10 minutes' AND t.updated_at > at - interval '3 days'
              AND t.word_count > 3
              AND NOT EXISTS (SELECT 1 FROM ai_memory_notes n WHERE n.user_id = t.user_id AND n.task_id = t.task_id AND n.read_at >= t.updated_at)))
$$;--> statement-breakpoint
-- Anyone who never chose becomes Basic from this release, reading only what is said after it: older chats are not read back.
UPDATE users SET settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb), '{assistant}',
    COALESCE(settings -> 'assistant', '{}'::jsonb) || jsonb_build_object('memoryLearningNotBefore', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
WHERE settings -> 'assistant' ->> 'memoryMode' IS NULL;
