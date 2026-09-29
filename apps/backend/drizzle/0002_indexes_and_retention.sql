DROP POLICY "suggestions_owner_access" ON "suggestions" CASCADE;--> statement-breakpoint
DROP TABLE "suggestions" CASCADE;--> statement-breakpoint
DROP POLICY "task_nlp_metadata_history_owner_access" ON "task_nlp_metadata_history" CASCADE;--> statement-breakpoint
DROP TABLE "task_nlp_metadata_history" CASCADE;--> statement-breakpoint
DROP INDEX "ai_conversations_user_id_idx";--> statement-breakpoint
DROP INDEX "ai_memories_user_id_idx";--> statement-breakpoint
DROP INDEX "habit_logs_habit_date_idx";--> statement-breakpoint
DROP INDEX "notification_state_user_id_idx";--> statement-breakpoint
DROP INDEX "tasks_user_id_idx";--> statement-breakpoint
DROP INDEX "tasks_user_state_idx";--> statement-breakpoint
DROP INDEX "tasks_scheduled_start_idx";--> statement-breakpoint
DROP INDEX "tasks_due_date_idx";--> statement-breakpoint
DROP INDEX "tasks_state_idx";--> statement-breakpoint
DROP INDEX "tasks_sort_order_idx";--> statement-breakpoint
DROP INDEX "tasks_not_before_idx";--> statement-breakpoint
DROP INDEX "tasks_effort_idx";--> statement-breakpoint
DROP INDEX "usage_events_event_idx";--> statement-breakpoint
CREATE INDEX "ai_memories_source_conversation_id_idx" ON "ai_memories" USING btree ("source_conversation_id") WHERE "ai_memories"."source_conversation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "habit_tags_user_id_idx" ON "habit_tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inbox_items_section_id_idx" ON "inbox_items" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "inbox_items_placed_task_id_idx" ON "inbox_items" USING btree ("placed_task_id") WHERE "inbox_items"."placed_task_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_user_list_idx" ON "tasks" USING btree ("user_id","state","is_pinned" DESC NULLS FIRST,"order_index");--> statement-breakpoint
CREATE INDEX "tasks_user_updated_idx" ON "tasks" USING btree ("user_id","state","updated_at","id");--> statement-breakpoint
CREATE INDEX "tasks_user_anchor_idx" ON "tasks" USING btree ("user_id",coalesce("scheduled_start", "due_date"));--> statement-breakpoint
CREATE INDEX "tasks_user_series_idx" ON "tasks" USING btree ("user_id") WHERE "tasks"."recurrence_rule" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_overdue_idx" ON "tasks" USING btree ("due_date") WHERE "tasks"."state" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "tasks_project_id_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_section_id_idx" ON "tasks" USING btree ("section_id");--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN "surface";--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN "route";--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN "input_method";--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN "object_type";--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN "confidence_tier";--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN "outcome";--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN "latency_ms";--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN "selection_count";--> statement-breakpoint
DROP TYPE "public"."suggestion_status";--> statement-breakpoint
DROP TYPE "public"."suggestion_type";