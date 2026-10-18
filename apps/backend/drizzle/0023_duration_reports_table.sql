CREATE TABLE "duration_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"low_minutes" integer NOT NULL,
	"high_minutes" integer NOT NULL,
	"anchored" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"project_id" uuid,
	"group_key" text NOT NULL,
	"said_on" date NOT NULL,
	"forgotten_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duration_reports_task_completed_unique" UNIQUE("task_id","completed_at"),
	CONSTRAINT "duration_reports_low_check" CHECK (low_minutes BETWEEN 1 AND 1440),
	CONSTRAINT "duration_reports_high_check" CHECK (high_minutes BETWEEN low_minutes AND 1440)
);
--> statement-breakpoint
ALTER TABLE "duration_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "ai_memory_signals_task_report_unique";--> statement-breakpoint
DROP INDEX "ai_memory_signals_habit_report_unique";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "duration_reports" ADD CONSTRAINT "duration_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duration_reports" ADD CONSTRAINT "duration_reports_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "duration_reports_user_said_idx" ON "duration_reports" USING btree ("user_id","said_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "duration_reports_user_group_idx" ON "duration_reports" USING btree ("user_id","group_key");--> statement-breakpoint
CREATE POLICY "duration_reports_owner_access" ON "duration_reports" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));

-- The moment a task entered Done. A trigger keeps it on every write path (routes, assistant, MCP, import, seeds):
-- set when the state becomes COMPLETE, kept while it stays COMPLETE, cleared on leaving, and leaving takes that
-- completion's "how long did it take?" answer with it. Milliseconds, like every instant the API serves, so a client can name it.
UPDATE tasks t SET completed_at = date_trunc('milliseconds', coalesce(m.completed_at, t.updated_at)) FROM task_metrics m WHERE m.task_id = t.id AND t.state = 'COMPLETE';--> statement-breakpoint
UPDATE tasks SET completed_at = date_trunc('milliseconds', updated_at) WHERE state = 'COMPLETE' AND completed_at IS NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_at_check" CHECK ((state = 'COMPLETE') = (completed_at IS NOT NULL));--> statement-breakpoint
CREATE FUNCTION "tasks_set_completed_at"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.state = 'COMPLETE' THEN
        NEW.completed_at := CASE WHEN TG_OP = 'UPDATE' AND OLD.state = 'COMPLETE' THEN OLD.completed_at ELSE date_trunc('milliseconds', now()) END;
    ELSE
        IF TG_OP = 'UPDATE' AND OLD.state = 'COMPLETE' THEN
            DELETE FROM duration_reports WHERE task_id = OLD.id AND completed_at = OLD.completed_at;
        END IF;
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "tasks_completed_at" BEFORE INSERT OR UPDATE ON "tasks" FOR EACH ROW EXECUTE FUNCTION "tasks_set_completed_at"();--> statement-breakpoint

-- Reports already given move to their own table. Only those tied to a task move; the newest one of a Done task takes
-- that completion's instant, older ones the instant they were given.
INSERT INTO duration_reports (user_id, task_id, completed_at, low_minutes, high_minutes, title, project_id, group_key, said_on, created_at)
SELECT s.user_id, s.task_id,
       CASE WHEN t.state = 'COMPLETE' AND s."on" = (SELECT max(s2."on") FROM ai_memory_signals s2
                 WHERE s2.task_id = s.task_id AND s2.kind = 'duration') THEN t.completed_at ELSE s.created_at END,
       s.minutes, s.minutes, left(t.title, 200), t.project_id, s.subject, s."on", s.created_at
FROM ai_memory_signals s JOIN tasks t ON t.id = s.task_id
WHERE s.kind = 'duration' AND s.minutes BETWEEN 1 AND 1440 AND s.subject IS NOT NULL
ON CONFLICT (task_id, completed_at) DO NOTHING;--> statement-breakpoint
DELETE FROM ai_memory_signals WHERE kind = 'duration';
