-- 0005 time model, contract: drops what 0004 kept for the old code (the legacy task columns, their sync
-- trigger) and the connection's copy of the zone (users.time_zone is the source).
DROP TRIGGER IF EXISTS "tasks_sync_legacy_time" ON "tasks";--> statement-breakpoint
DROP FUNCTION IF EXISTS "tasks_sync_legacy_time"();--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "is_all_day";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "due_date";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "not_before";--> statement-breakpoint
ALTER TABLE "mcp_connections" DROP COLUMN "timezone";
