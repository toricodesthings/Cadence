-- Merge duplicate task_metrics rows (one per task from here on) into each task's oldest row.
WITH merged AS (
	SELECT task_id,
		(array_agg(id ORDER BY created_at, id))[1] AS keep_id,
		max(reschedule_count) AS reschedule_count,
		max(delay_count) AS delay_count,
		min(first_scheduled) AS first_scheduled,
		max(completed_at) AS completed_at,
		max(created_to_done) AS created_to_done
	FROM task_metrics GROUP BY task_id HAVING count(*) > 1
), kept AS (
	UPDATE task_metrics t SET
		reschedule_count = m.reschedule_count, delay_count = m.delay_count, first_scheduled = m.first_scheduled,
		completed_at = m.completed_at, created_to_done = m.created_to_done
	FROM merged m WHERE t.id = m.keep_id
)
DELETE FROM task_metrics t USING merged m WHERE t.task_id = m.task_id AND t.id <> m.keep_id;--> statement-breakpoint
DROP INDEX "task_metrics_task_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "task_metrics_task_id_unique" ON "task_metrics" USING btree ("task_id");--> statement-breakpoint
ALTER POLICY "ai_conversations_owner_access" ON "ai_conversations" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "ai_images_owner_access" ON "ai_images" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "ai_memories_owner_access" ON "ai_memories" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "ai_messages_owner_access" ON "ai_messages" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "habit_logs_owner_access" ON "habit_logs" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "habit_tags_owner_access" ON "habit_tags" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "habits_owner_access" ON "habits" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "inbox_items_owner_access" ON "inbox_items" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "inbox_sections_owner_access" ON "inbox_sections" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "mutation_dedup_owner_access" ON "mutation_dedup" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "notification_state_owner_access" ON "notification_state" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "projects_owner_access" ON "projects" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "saved_focus_views_owner_access" ON "saved_focus_views" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "subtasks_owner_access" ON "subtasks" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "suggestions_owner_access" ON "suggestions" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "tags_owner_access" ON "tags" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "task_metrics_owner_access" ON "task_metrics" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "task_nlp_metadata_owner_access" ON "task_nlp_metadata" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "task_nlp_metadata_history_owner_access" ON "task_nlp_metadata_history" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "task_notes_owner_access" ON "task_notes" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "task_sections_owner_access" ON "task_sections" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "task_tags_owner_access" ON "task_tags" TO public USING (EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK (EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "tasks_owner_access" ON "tasks" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "usage_events_owner_access" ON "usage_events" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
ALTER POLICY "user_metrics_owner_access" ON "user_metrics" TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
-- 0010 created this policy by hand as users_self_access; align it with schema.ts.
ALTER POLICY "users_self_access" ON "users" RENAME TO "users_owner_access";--> statement-breakpoint
ALTER POLICY "users_owner_access" ON "users" TO public USING ((id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));