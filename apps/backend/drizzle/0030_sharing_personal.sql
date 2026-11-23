CREATE TABLE "task_personal" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reminder_at" timestamp with time zone,
	"reminder_silenced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_personal_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_personal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "taken_by" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "taken_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_personal" ADD CONSTRAINT "task_personal_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_personal" ADD CONSTRAINT "task_personal_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_personal_user_id_idx" ON "task_personal" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_taken_by_users_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "task_tags_member_access" ON "task_tags" AS PERMISSIVE FOR ALL TO public USING ((tag_id IN (SELECT id FROM tags WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) AND task_id IN (SELECT id FROM tasks))) WITH CHECK ((tag_id IN (SELECT id FROM tags WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) AND task_id IN (SELECT id FROM tasks)));--> statement-breakpoint
CREATE POLICY "task_personal_access" ON "task_personal" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) AND task_id IN (SELECT id FROM tasks))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) AND task_id IN (SELECT id FROM tasks)));--> statement-breakpoint
ALTER POLICY "task_tags_owner_access" ON "task_tags" TO public USING ((EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) AND tag_id IN (SELECT id FROM tags WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)))) WITH CHECK ((EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) AND tag_id IN (SELECT id FROM tags WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));--> statement-breakpoint
-- Transfer list ownership to a current member. SECURITY DEFINER bypasses restrictive same_owner policies while verifying owner + membership.
CREATE FUNCTION "cadence_transfer_list"(p_list uuid, p_to_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_caller uuid := (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
BEGIN
    IF v_caller IS NULL OR p_to_user IS NULL OR v_caller = p_to_user THEN
        RETURN false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_list AND user_id = v_caller) THEN
        RETURN false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM list_members WHERE list_id = p_list AND user_id = p_to_user) THEN
        RETURN false;
    END IF;

    -- 1. Move old owner's reminders into task_personal and clear tasks.reminder_at.
    INSERT INTO task_personal (task_id, user_id, reminder_at, reminder_silenced)
    SELECT id, v_caller, reminder_at, reminder_silenced
    FROM tasks
    WHERE project_id = p_list AND reminder_at IS NOT NULL
    ON CONFLICT (task_id, user_id) DO UPDATE
    SET reminder_at = EXCLUDED.reminder_at,
        reminder_silenced = EXCLUDED.reminder_silenced;

    UPDATE tasks
    SET reminder_at = NULL, reminder_silenced = false
    WHERE project_id = p_list;

    -- 2. Promote new owner's task_personal reminders onto tasks, then delete those personal rows.
    UPDATE tasks t
    SET reminder_at = tp.reminder_at,
        reminder_silenced = tp.reminder_silenced
    FROM task_personal tp
    WHERE tp.task_id = t.id
      AND tp.user_id = p_to_user
      AND t.project_id = p_list;

    DELETE FROM task_personal
    WHERE user_id = p_to_user
      AND task_id IN (SELECT id FROM tasks WHERE project_id = p_list);

    -- 3. Re-own the list and all its rows.
    UPDATE projects SET user_id = p_to_user WHERE id = p_list;
    UPDATE task_sections SET user_id = p_to_user WHERE project_id = p_list;
    UPDATE tasks SET user_id = p_to_user WHERE project_id = p_list;
    UPDATE subtasks SET user_id = p_to_user WHERE task_id IN (SELECT id FROM tasks WHERE project_id = p_list);
    UPDATE task_notes SET user_id = p_to_user WHERE task_id IN (SELECT id FROM tasks WHERE project_id = p_list);

    -- 4. Drop old owner's personal learning rows about these tasks.
    DELETE FROM task_metrics
    WHERE user_id = v_caller
      AND task_id IN (SELECT id FROM tasks WHERE project_id = p_list);

    DELETE FROM task_nlp_metadata
    WHERE user_id = v_caller
      AND task_id IN (SELECT id FROM tasks WHERE project_id = p_list);

    DELETE FROM ai_memory_notes
    WHERE user_id = v_caller
      AND task_id IN (SELECT id FROM tasks WHERE project_id = p_list);

    -- 5. Swap membership: new owner leaves list_members; old owner becomes editor.
    DELETE FROM list_members WHERE list_id = p_list AND user_id = p_to_user;
    INSERT INTO list_members (list_id, user_id, role, invited_by)
    VALUES (p_list, v_caller, 'edit', p_to_user);

    -- 6. Revoke existing invite links minted by the old owner.
    DELETE FROM share_invites WHERE list_id = p_list;

    RETURN true;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_transfer_list"(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_transfer_list"(uuid, uuid) TO api_worker;
