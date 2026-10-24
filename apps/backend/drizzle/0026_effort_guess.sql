ALTER TABLE "tasks" ADD COLUMN "effort_guess" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "effort_guess_source" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "effort_guess_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_effort_guess_check" CHECK (effort_guess IS NULL OR effort_guess BETWEEN 1 AND 3);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_effort_guess_source_check" CHECK (effort_guess_source IS NULL OR effort_guess_source IN ('model', 'dismissed'));