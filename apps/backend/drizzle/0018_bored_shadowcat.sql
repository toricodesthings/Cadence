ALTER TABLE "habit_logs" ALTER COLUMN "target_date" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "subtasks" ALTER COLUMN "order_index" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "task_sections" ALTER COLUMN "order_index" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "order_index" SET DATA TYPE double precision;