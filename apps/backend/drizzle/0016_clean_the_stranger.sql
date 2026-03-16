CREATE INDEX "habit_logs_user_id_idx" ON "habit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inbox_items_user_id_idx" ON "inbox_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inbox_sections_user_id_idx" ON "inbox_sections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tags_user_id_idx" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_tags_unique_pair" ON "task_tags" USING btree ("task_id","tag_id");--> statement-breakpoint
CREATE INDEX "task_tags_tag_id_idx" ON "task_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tasks_user_state_idx" ON "tasks" USING btree ("user_id","state");