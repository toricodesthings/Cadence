ALTER TABLE "tasks" ADD COLUMN "effort_origin" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "effort_chosen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tasks_user_effort_idx" ON "tasks" USING btree ("user_id","effort_chosen_at" DESC NULLS LAST) WHERE "tasks"."effort_origin" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_effort_origin_check" CHECK (effort_origin IS NULL OR (effort IS NOT NULL AND effort_origin IN ('manual', 'accepted')));