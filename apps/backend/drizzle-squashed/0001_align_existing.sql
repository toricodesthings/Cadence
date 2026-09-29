-- Brings databases built by the old 0000-0040 chain to exactly what 0000_baseline builds. A no-op on a fresh database.
-- 0012 created this foreign key by hand, so Postgres named it; drizzle's snapshot expects its own name.
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_sections_project_id_fkey') THEN
		ALTER TABLE "task_sections" RENAME CONSTRAINT "task_sections_project_id_fkey" TO "task_sections_project_id_projects_id_fk";
	END IF;
END $$;--> statement-breakpoint
-- 0010 forced RLS on its tables by hand; drizzle can't express FORCE, so later tables never had it. It changes
-- nothing on Neon (the owner has BYPASSRLS, and the Worker's api_worker isn't the owner), so drop it everywhere.
ALTER TABLE "ai_memories" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "habit_logs" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "habits" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inbox_items" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inbox_sections" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mutation_dedup" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subtasks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suggestions" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tags" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_metrics" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_sections" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_tags" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_events" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_metrics" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;
