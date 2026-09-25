ALTER TABLE "habit_logs" ADD COLUMN "step_status" jsonb;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "steps" jsonb;