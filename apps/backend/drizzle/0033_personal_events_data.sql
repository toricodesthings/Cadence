CREATE TEMP TABLE personal_event_moves AS
SELECT u.id AS user_id, e.item->>'id' AS old_id, uuidv7() AS new_id, e.item, e.ord
FROM users u
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(u.settings #> '{calendar,personalEvents,items}') = 'array'
         THEN u.settings #> '{calendar,personalEvents,items}' ELSE '[]'::jsonb END
) WITH ORDINALITY AS e(item, ord);
--> statement-breakpoint
INSERT INTO personal_events (id, user_id, label, month_day, emoji, notify, started_on, color, created_at, updated_at)
SELECT new_id, user_id, item->>'label', item->>'monthDay', NULLIF(item->>'emoji', ''),
       COALESCE((item->>'notify')::boolean, true), (item->>'startedOn')::date, item->>'color',
       now() + ord * interval '1 millisecond', now()
FROM personal_event_moves;
--> statement-breakpoint
UPDATE push_deliveries p
SET occurrence_key = replace(p.occurrence_key, 'personal-event::' || m.old_id || '::', 'personal-event::' || m.new_id || '::')
FROM personal_event_moves m
WHERE p.user_id = m.user_id AND p.occurrence_key LIKE 'personal-event::' || m.old_id || '::%';
--> statement-breakpoint
UPDATE users SET settings = settings #- '{calendar,personalEvents,items}'
WHERE settings #> '{calendar,personalEvents,items}' IS NOT NULL;
--> statement-breakpoint
DROP TABLE personal_event_moves;
