-- Run after 0004_time_model_expand on a Neon branch of prod (then on main). As the table owner.

-- 1. BEFORE the migration (the branch as it was): rows per rule. Keep these numbers for 1b.
SELECT CASE
    WHEN is_all_day = false AND scheduled_start IS NOT NULL THEN 'E timed'
    WHEN due_date IS NULL AND scheduled_start IS NULL AND scheduled_end IS NULL THEN 'unscheduled'
    WHEN (coalesce(due_date, scheduled_start) AT TIME ZONE 'UTC')::time IN ('00:00:00', '12:00:00', '23:59:59.999') THEN 'A canonical anchor'
    ELSE 'B legacy instant'
END AS rule, count(*)
FROM tasks GROUP BY 1 ORDER BY 1;

-- 1b. AFTER: timed must equal "E timed", day must equal A + B, unscheduled must match.
SELECT CASE
    WHEN scheduled_start IS NOT NULL THEN 'timed'
    WHEN due_on IS NULL THEN 'unscheduled'
    ELSE 'day'
END AS shape, count(*)
FROM tasks GROUP BY 1 ORDER BY 1;

-- 2. Rows whose new day differs from the old UTC-sliced day. Expected: only rule B rows (legacy instants).
SELECT t.id, t.due_date, t.due_on, u.time_zone
FROM tasks t JOIN users u ON u.id = t.user_id
WHERE t.due_on IS NOT NULL AND t.due_date IS NOT NULL AND t.due_on <> (t.due_date AT TIME ZONE 'UTC')::date
ORDER BY t.due_date DESC LIMIT 50;

-- 3. A timed row with no zone, a day task still holding an instant, a bad end: all must be 0.
SELECT
    count(*) FILTER (WHERE scheduled_start IS NOT NULL AND zone IS NULL) AS timed_without_zone,
    count(*) FILTER (WHERE scheduled_start IS NULL AND (scheduled_end IS NOT NULL OR zone IS NOT NULL)) AS day_with_instants,
    count(*) FILTER (WHERE end_on IS NOT NULL AND (due_on IS NULL OR end_on < due_on)) AS bad_end
FROM tasks;

-- 4. UNTIL values still holding an instant: must be 0.
SELECT count(*) AS until_with_instant FROM tasks WHERE recurrence_rule ~ 'UNTIL=\d{8}T';

-- 5. Users left on UTC because nothing told us their zone (rule B rows of these users read in UTC).
SELECT count(*) AS users_on_utc FROM users WHERE time_zone = 'UTC';
