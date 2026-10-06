-- 0004 time model, expand. Runs once (not re-runnable). Run against a Neon branch of prod first, compare the
-- counts from drizzle/verify/0004_time_model.sql, then apply to main. See the root AGENTS.md "Time" section.
--
-- Values: Instant = timestamptz, LocalDate = date, Zone = IANA text. With Z = users.time_zone:
--   A  all-day, anchor at 00:00 / 12:00 / 23:59:59.999 UTC        -> due_on = its UTC date
--   B  all-day, any other instant                                  -> due_on = its date in Z (what the app showed)
--   C  all-day with scheduled_end (multi-day)                      -> end_on by A/B; scheduled_end = NULL
--   D  all-day with scheduled_start                                -> due_on from coalesce(due_date, scheduled_start) by A/B; start = NULL
--   E  timed                                                       -> start/end unchanged, zone = Z, a deadline becomes due_on by A/B
--   F  not_before                                                  -> hidden_until = its date in Z
--   G  recurrence_rule UNTIL=...Z                                  -> UNTIL=YYYYMMDD in Z (the series zone)
--   H  task_metrics.first_scheduled, task_nlp_metadata.resolved_due_date -> date, by A/B
-- The old columns (is_all_day, due_date, not_before) are left as they were and kept in step by a trigger
-- until the contract migration drops them, so a rolled-back deploy still reads real values.
-- Old code cannot write through the trigger and checks below (it would lose its own date edits and fail
-- the zone check), so a code rollback first runs:
--   DROP TRIGGER "tasks_sync_legacy_time" ON "tasks"; DROP FUNCTION "tasks_sync_legacy_time"();
--   ALTER TABLE "tasks" DROP CONSTRAINT "tasks_timed_zone_check", DROP CONSTRAINT "tasks_end_needs_start_check",
--       DROP CONSTRAINT "tasks_end_on_check", DROP CONSTRAINT "tasks_timed_end_on_check";

-- 1. users.time_zone: the pinned setting, else the newest connected assistant's zone, else UTC (the client
-- reports its device zone on its first request, and the app keeps it current from then on).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "time_zone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
UPDATE "users" u SET "time_zone" = z.name
FROM (
    SELECT u2.id,
        coalesce(
            (SELECT n.name FROM pg_timezone_names n WHERE n.name = u2.settings #>> '{dateTime,timezone}' LIMIT 1),
            (SELECT n.name FROM mcp_connections c JOIN pg_timezone_names n ON n.name = c.timezone
                WHERE c.user_id = u2.id AND c.revoked_at IS NULL ORDER BY c.created_at DESC LIMIT 1)
        ) AS name
    FROM "users" u2
) z
WHERE z.id = u.id AND z.name IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN RAISE NOTICE 'time_zone_defaulted (users left on UTC): %', (SELECT count(*) FROM "users" WHERE time_zone = 'UTC'); END $$;--> statement-breakpoint
UPDATE "users" SET "settings" = jsonb_set("settings", '{dateTime,timezone}', '"device"') WHERE "settings" #>> '{dateTime,timezone}' = 'local';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "settings" SET DEFAULT '{"tasks":{"defaultDueDate":null,"hideTrash":false,"hideCompleted":false,"quickAdd":{"preset":"planner","style":"label","actions":["date","priority","project"]}},"dateTime":{"weekStart":"Sunday","timezone":"device","timeDisplay":"12h"},"calendar":{"clutter":{"showAllDay":true,"showTimedTasks":true,"showHabitAnchors":true},"holidays":{"enabled":true}},"notifications":{"email":true,"browser":false,"taskReminders":true,"habitReminders":true,"dueDateAlerts":true},"shortcuts":{}}'::jsonb;--> statement-breakpoint

-- 2. The day an old value meant (rules A and B).
CREATE FUNCTION "legacy_day"(ts timestamptz, zone text) RETURNS date LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN ts IS NULL THEN NULL
        WHEN (ts AT TIME ZONE 'UTC')::time IN ('00:00:00', '12:00:00', '23:59:59.999') THEN (ts AT TIME ZONE 'UTC')::date
        ELSE (ts AT TIME ZONE coalesce(zone, 'UTC'))::date
    END
$$;--> statement-breakpoint

-- 3. Tasks: the new columns, then every row converted.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "end_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "zone" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "hidden_until" date;--> statement-breakpoint

-- E: timed tasks keep their instants and gain the zone; a deadline on one becomes a day.
UPDATE "tasks" t SET
    "zone" = u.time_zone,
    "due_on" = legacy_day(t.due_date, u.time_zone),
    "hidden_until" = (t.not_before AT TIME ZONE u.time_zone)::date
FROM "users" u
WHERE u.id = t.user_id AND t.is_all_day = false AND t.scheduled_start IS NOT NULL;--> statement-breakpoint

-- A, B, C, D: everything else is a day (an all-day task, or a timed one with no start).
UPDATE "tasks" t SET
    "due_on" = legacy_day(coalesce(t.due_date, t.scheduled_start), u.time_zone),
    "end_on" = CASE
        WHEN t.scheduled_end IS NOT NULL AND coalesce(t.due_date, t.scheduled_start) IS NOT NULL
             AND legacy_day(t.scheduled_end, u.time_zone) >= legacy_day(coalesce(t.due_date, t.scheduled_start), u.time_zone)
        THEN legacy_day(t.scheduled_end, u.time_zone)
    END,
    "hidden_until" = (t.not_before AT TIME ZONE u.time_zone)::date,
    "scheduled_start" = NULL,
    "scheduled_end" = NULL
FROM "users" u
WHERE u.id = t.user_id AND NOT (t.is_all_day = false AND t.scheduled_start IS NOT NULL);--> statement-breakpoint

-- G: an UNTIL instant becomes the series' last local day (a timed series in its zone; an all-day one by A/B).
UPDATE "tasks" t SET "recurrence_rule" = regexp_replace(
    t.recurrence_rule,
    'UNTIL=\d{8}T\d{6}Z?',
    'UNTIL=' || to_char(
        CASE
            WHEN t.scheduled_start IS NULL AND (substring(t.recurrence_rule from 'UNTIL=(\d{8}T\d{6})')::timestamp)::time IN ('00:00:00', '12:00:00', '23:59:59')
                THEN (substring(t.recurrence_rule from 'UNTIL=(\d{8}T\d{6})')::timestamp)::date
            ELSE ((substring(t.recurrence_rule from 'UNTIL=(\d{8}T\d{6})')::timestamp AT TIME ZONE 'UTC') AT TIME ZONE u.time_zone)::date
        END, 'YYYYMMDD')
)
FROM "users" u
WHERE u.id = t.user_id AND t.recurrence_rule ~ 'UNTIL=\d{8}T\d{6}Z?';--> statement-breakpoint

-- H: metrics and NLP snapshots keep a day, not an instant.
ALTER TABLE "task_metrics" ADD COLUMN "first_scheduled_day" date;--> statement-breakpoint
UPDATE "task_metrics" m SET "first_scheduled_day" = legacy_day(m.first_scheduled, u.time_zone) FROM "users" u WHERE u.id = m.user_id;--> statement-breakpoint
ALTER TABLE "task_metrics" DROP COLUMN "first_scheduled";--> statement-breakpoint
ALTER TABLE "task_metrics" RENAME COLUMN "first_scheduled_day" TO "first_scheduled";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "resolved_due_day" date;--> statement-breakpoint
UPDATE "task_nlp_metadata" m SET "resolved_due_day" = legacy_day(m.resolved_due_date, u.time_zone) FROM "users" u WHERE u.id = m.user_id;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" DROP COLUMN "resolved_due_date";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" RENAME COLUMN "resolved_due_day" TO "resolved_due_date";--> statement-breakpoint
DROP FUNCTION "legacy_day"(timestamptz, text);--> statement-breakpoint

-- 4. Constraints and indexes on the new columns.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_timed_zone_check" CHECK (scheduled_start IS NULL OR zone IS NOT NULL);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_end_needs_start_check" CHECK (scheduled_start IS NOT NULL OR scheduled_end IS NULL);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_end_on_check" CHECK (end_on IS NULL OR (due_on IS NOT NULL AND end_on >= due_on));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_timed_end_on_check" CHECK (scheduled_start IS NULL OR end_on IS NULL);--> statement-breakpoint
DROP INDEX "tasks_user_anchor_idx";--> statement-breakpoint
DROP INDEX "tasks_overdue_idx";--> statement-breakpoint
CREATE INDEX "tasks_user_due_idx" ON "tasks" USING btree ("user_id","due_on");--> statement-breakpoint
CREATE INDEX "tasks_user_start_idx" ON "tasks" USING btree ("user_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "tasks_overdue_idx" ON "tasks" USING btree ("due_on") WHERE "tasks"."state" = 'ACTIVE';--> statement-breakpoint

-- 5. Dual write: the old columns follow the new ones until the contract migration drops them.
-- (A multi-day all-day task's old scheduled_end is not kept: its end is end_on.)
CREATE FUNCTION "tasks_sync_legacy_time"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.is_all_day := NEW.scheduled_start IS NULL;
    NEW.due_date := CASE WHEN NEW.due_on IS NULL THEN NULL ELSE (NEW.due_on::text || 'T12:00:00Z')::timestamptz END;
    NEW.not_before := CASE WHEN NEW.hidden_until IS NULL THEN NULL
        ELSE NEW.hidden_until::timestamp AT TIME ZONE coalesce((SELECT time_zone FROM users WHERE id = NEW.user_id), 'UTC') END;
    RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "tasks_sync_legacy_time" BEFORE INSERT OR UPDATE ON "tasks" FOR EACH ROW EXECUTE FUNCTION "tasks_sync_legacy_time"();
