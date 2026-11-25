CREATE FUNCTION "cadence_move_routine_time_marks"(p_habit uuid, p_old text, p_new text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
    UPDATE habit_logs
    SET time_marks = (time_marks - p_old) || jsonb_build_object(p_new, time_marks -> p_old)
    WHERE habit_id = p_habit
      AND jsonb_exists(time_marks, p_old)
      AND (
          EXISTS (
              SELECT 1 FROM habits h
              WHERE h.id = p_habit
                AND h.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
          )
          OR EXISTS (
              SELECT 1 FROM routine_members m
              WHERE m.habit_id = p_habit
                AND m.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
                AND m.role = 'edit'
          )
      )
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_event_owner_names"(p_events uuid[]) RETURNS TABLE(event_id uuid, owner_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT e.id, u.name
    FROM personal_events e
    JOIN event_members m ON m.event_id = e.id
    LEFT JOIN neon_auth."user" u ON u.id = e.user_id
    WHERE e.id = ANY(p_events)
      AND m.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_routine_person_names"(p_users uuid[]) RETURNS TABLE(user_id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT u.id, u.name
    FROM neon_auth."user" u
    WHERE u.id = ANY(p_users)
      AND (
          EXISTS (
              SELECT 1 FROM habits h
              JOIN routine_members rm ON rm.habit_id = h.id
              WHERE (h.user_id = u.id AND rm.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
                 OR (h.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid AND rm.user_id = u.id)
          )
          OR EXISTS (
              SELECT 1 FROM routine_members m1
              JOIN routine_members m2 ON m1.habit_id = m2.habit_id
              WHERE m1.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
                AND m2.user_id = u.id
          )
      )
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_move_routine_time_marks"(uuid, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_move_routine_time_marks"(uuid, text, text) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_event_owner_names"(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_event_owner_names"(uuid[]) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_routine_person_names"(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_routine_person_names"(uuid[]) TO api_worker;
