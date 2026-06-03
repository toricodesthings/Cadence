DROP INDEX "user_metrics_user_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "user_metrics_user_id_unique" ON "user_metrics" USING btree ("user_id");