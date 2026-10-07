-- Effort chosen before provenance was recorded. Only tasks created in the app's own composers carry an NLP record
-- (the assistant and imports never write one), so their Effort was most likely the person's. It is still unproven,
-- so it counts as 'accepted' (half a direct choice), dated by the task's last change so it ages out like any other.
UPDATE "tasks" AS t
SET "effort_origin" = 'accepted', "effort_chosen_at" = t."updated_at"
WHERE t."effort" IS NOT NULL
  AND t."effort_origin" IS NULL
  AND EXISTS (SELECT 1 FROM "task_nlp_metadata" AS m WHERE m."task_id" = t."id");
