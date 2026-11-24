-- Move a caller-owned task (plus its subtasks and note) into a shared list where the caller has edit access.
-- SECURITY DEFINER bypasses restrictive same_owner policies while verifying task ownership and destination edit role.
CREATE FUNCTION "cadence_move_task_to_list"(p_task uuid, p_to_list uuid, p_to_section uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_caller uuid := (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    v_to_owner uuid;
BEGIN
    IF v_caller IS NULL OR p_task IS NULL OR p_to_list IS NULL THEN
        RETURN false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tasks WHERE id = p_task AND user_id = v_caller) THEN
        RETURN false;
    END IF;

    SELECT user_id INTO v_to_owner FROM projects WHERE id = p_to_list;
    IF v_to_owner IS NULL THEN
        RETURN false;
    END IF;

    IF v_to_owner <> v_caller AND NOT EXISTS (
        SELECT 1 FROM list_members WHERE list_id = p_to_list AND user_id = v_caller AND role = 'edit'
    ) THEN
        RETURN false;
    END IF;

    IF p_to_section IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM task_sections WHERE id = p_to_section AND project_id = p_to_list
    ) THEN
        RETURN false;
    END IF;

    IF v_to_owner <> v_caller THEN
        -- 1. Preserve caller's personal reminder in task_personal, then clear the owner reminder on tasks.
        INSERT INTO task_personal (task_id, user_id, reminder_at, reminder_silenced)
        SELECT id, v_caller, reminder_at, reminder_silenced
        FROM tasks
        WHERE id = p_task AND reminder_at IS NOT NULL
        ON CONFLICT (task_id, user_id) DO UPDATE
        SET reminder_at = EXCLUDED.reminder_at,
            reminder_silenced = EXCLUDED.reminder_silenced;

        -- 2. Re-own the task, its subtasks, and its note to the destination list owner.
        UPDATE tasks
        SET user_id = v_to_owner,
            project_id = p_to_list,
            section_id = p_to_section,
            reminder_at = NULL,
            reminder_silenced = false,
            taken_by = NULL,
            taken_at = NULL,
            created_by = COALESCE(created_by, v_caller),
            updated_by = v_caller,
            updated_at = NOW()
        WHERE id = p_task;

        UPDATE subtasks SET user_id = v_to_owner WHERE task_id = p_task;
        UPDATE task_notes SET user_id = v_to_owner WHERE task_id = p_task;
    ELSE
        UPDATE tasks
        SET project_id = p_to_list,
            section_id = p_to_section,
            updated_by = v_caller,
            updated_at = NOW()
        WHERE id = p_task;
    END IF;

    -- 3. Drop caller's personal learning rows about this task.
    DELETE FROM task_metrics WHERE user_id = v_caller AND task_id = p_task;
    DELETE FROM task_nlp_metadata WHERE user_id = v_caller AND task_id = p_task;
    DELETE FROM ai_memory_notes WHERE user_id = v_caller AND task_id = p_task;

    RETURN true;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_move_task_to_list"(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_move_task_to_list"(uuid, uuid, uuid) TO api_worker;
