-- Backfill existing users whose notification settings are missing the new required fields.
-- Sets sensible defaults: browser=    false, taskReminders=true, habitReminders=true, dueDateAlerts=true.
UPDATE "users"
SET "settings" = jsonb_set(
    jsonb_set(
        jsonb_set(
            jsonb_set(
                "settings"::jsonb,
                '{notifications,browser}',
                'false',
                true
            ),
            '{notifications,taskReminders}',
            'true',
            true
        ),
        '{notifications,habitReminders}',
        'true',
        true
    ),
    '{notifications,dueDateAlerts}',
    'true',
    true
)
WHERE NOT ("settings"->'notifications' ? 'browser')
   OR NOT ("settings"->'notifications' ? 'taskReminders')
   OR NOT ("settings"->'notifications' ? 'habitReminders')
   OR NOT ("settings"->'notifications' ? 'dueDateAlerts');
