-- New accounts get a heads-up the day before a deadline (dueHeadsUpDays 1). Settings are stored sparse and read over the
-- defaults, so pin the old default (0) on every existing account that never chose one: nobody's alerts change under them.
UPDATE "users"
SET "settings" = "settings" || jsonb_build_object('notifications', COALESCE("settings"->'notifications', '{}'::jsonb) || '{"dueHeadsUpDays": 0}'::jsonb)
WHERE "settings" #> '{notifications,dueHeadsUpDays}' IS NULL;
