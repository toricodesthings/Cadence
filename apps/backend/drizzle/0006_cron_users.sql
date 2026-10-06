-- The Worker connects as api_worker, which RLS applies to, so the cron can't see other users' rows. This lists
-- user ids only (all, or those whose local hour at `at` is `local_hour`); each job then runs per user through withRls.
CREATE FUNCTION "cron_user_ids"(at timestamptz, local_hour int) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id FROM users WHERE local_hour IS NULL OR extract(hour from timezone(time_zone, at)) = local_hour
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cron_user_ids"(timestamptz, int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cron_user_ids"(timestamptz, int) TO api_worker;
