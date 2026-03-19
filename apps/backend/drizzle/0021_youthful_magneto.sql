ALTER TABLE "inbox_items" ADD COLUMN "capture_kind" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "capture_status" text DEFAULT 'clarifying' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "placed_task_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "ai_suggestion" text;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_placed_task_id_tasks_id_fk" FOREIGN KEY ("placed_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;