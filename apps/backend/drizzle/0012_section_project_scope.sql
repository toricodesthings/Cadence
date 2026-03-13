-- Add project_id to task_sections so sections are per-project
ALTER TABLE "task_sections" ADD COLUMN "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE;
CREATE INDEX "task_sections_project_id_idx" ON "task_sections" ("project_id");
