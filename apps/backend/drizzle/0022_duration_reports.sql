ALTER TABLE "ai_memory_signals" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_memory_signals" ADD COLUMN "habit_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_memory_signals" ADD CONSTRAINT "ai_memory_signals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_signals" ADD CONSTRAINT "ai_memory_signals_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_memory_signals_task_report_unique" ON "ai_memory_signals" USING btree ("user_id","task_id","on") WHERE "ai_memory_signals"."kind" = 'duration' AND "ai_memory_signals"."task_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_memory_signals_habit_report_unique" ON "ai_memory_signals" USING btree ("user_id","habit_id","on") WHERE "ai_memory_signals"."kind" = 'duration' AND "ai_memory_signals"."habit_id" IS NOT NULL;--> statement-breakpoint
-- Reports already given get their task back: exactly one of the person's tasks was completed within 60 s before the
-- report, with the same old group (lower-cased words, first four). Zero or several matches stay null: they still count
-- for their group but can't be edited from a task. One report per (task, day), so a second candidate stays null too.
WITH old_group AS (
    SELECT s.id AS signal_id, s.user_id, s."on", m.task_id, s.created_at
    FROM ai_memory_signals s
    JOIN task_metrics m ON m.user_id = s.user_id
        AND m.completed_at BETWEEN s.created_at - interval '60 seconds' AND s.created_at
    JOIN tasks t ON t.id = m.task_id
    WHERE s.kind = 'duration' AND s.task_id IS NULL
      AND array_to_string((string_to_array(trim(regexp_replace(regexp_replace(lower(t.title), '[^[:alnum:][:space:]]', ' ', 'g'), '\s+', ' ', 'g')), ' '))[1:4], ' ') = s.subject
), single AS (
    SELECT signal_id, user_id, "on", task_id, created_at FROM old_group
    WHERE signal_id IN (SELECT signal_id FROM old_group GROUP BY signal_id HAVING count(*) = 1)
), newest AS (
    SELECT DISTINCT ON (user_id, task_id, "on") signal_id, task_id FROM single ORDER BY user_id, task_id, "on", created_at DESC
)
UPDATE ai_memory_signals s SET task_id = n.task_id FROM newest n WHERE s.id = n.signal_id;--> statement-breakpoint
-- The day's budget carries over, so deploy day doesn't ask a second time.
UPDATE users u SET settings = jsonb_set(
    u.settings, '{assistant,durationAsk}',
    jsonb_build_object('lastOn', last.on_day, 'misses', 0), true)
FROM (SELECT user_id, max("on")::text AS on_day FROM ai_memory_signals WHERE kind = 'duration' GROUP BY user_id) last
WHERE last.user_id = u.id AND u.settings -> 'assistant' ->> 'memoryMode' = 'full';
