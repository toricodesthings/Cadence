DROP INDEX "ai_images_last_used_idx";--> statement-breakpoint
DROP INDEX "ai_memories_search_idx";--> statement-breakpoint
DROP INDEX "devices_user_idx";--> statement-breakpoint
DROP INDEX "notification_state_deferred_until_idx";--> statement-breakpoint
DROP INDEX "push_deliveries_created_idx";--> statement-breakpoint
DROP INDEX "usage_events_user_id_idx";--> statement-breakpoint
DROP INDEX "usage_events_created_at_idx";--> statement-breakpoint
CREATE INDEX "push_deliveries_user_created_idx" ON "push_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_user_created_idx" ON "usage_events" USING btree ("user_id","created_at");