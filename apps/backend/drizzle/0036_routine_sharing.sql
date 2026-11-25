CREATE TYPE "public"."routine_share_mode" AS ENUM('together', 'turns');--> statement-breakpoint
CREATE TABLE "routine_cheers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"habit_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"target_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routine_cheers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routine_members" (
	"habit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "share_role" NOT NULL,
	"invited_by" uuid,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"paused_until" date,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"total_completions" integer DEFAULT 0 NOT NULL,
	"total_skips" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_members_habit_id_user_id_pk" PRIMARY KEY("habit_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "routine_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_invites" DROP CONSTRAINT "share_invites_one_target";--> statement-breakpoint
DROP INDEX "habit_logs_habit_date_unique";--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "share_mode" "routine_share_mode";--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "turn_order" uuid[];--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "turns_from" date;--> statement-breakpoint
ALTER TABLE "share_invites" ADD COLUMN "routine_id" uuid;--> statement-breakpoint
ALTER TABLE "routine_cheers" ADD CONSTRAINT "routine_cheers_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_cheers" ADD CONSTRAINT "routine_cheers_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_cheers" ADD CONSTRAINT "routine_cheers_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_members" ADD CONSTRAINT "routine_members_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_members" ADD CONSTRAINT "routine_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_members" ADD CONSTRAINT "routine_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "routine_cheers_once" ON "routine_cheers" USING btree ("habit_id","from_user_id","to_user_id","target_date");--> statement-breakpoint
CREATE INDEX "routine_cheers_to_user_id_idx" ON "routine_cheers" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "routine_members_user_id_idx" ON "routine_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "share_invites" ADD CONSTRAINT "share_invites_routine_id_habits_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "habit_logs_habit_user_date_unique" ON "habit_logs" USING btree ("habit_id","user_id","target_date");--> statement-breakpoint
CREATE INDEX "share_invites_routine_id_idx" ON "share_invites" USING btree ("routine_id");--> statement-breakpoint
ALTER TABLE "share_invites" ADD CONSTRAINT "share_invites_one_target" CHECK (num_nonnulls(list_id, event_id, routine_id) = 1);--> statement-breakpoint
-- Routine sharing functions. SECURITY DEFINER so policies and the join/preview flow can read routine_members and neon_auth without recursing into RLS.--> statement-breakpoint
CREATE FUNCTION "cadence_member_routines"(min_role share_role) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT habit_id FROM routine_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid AND role >= min_role
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_join_routine"(p_token_hash text) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
    WITH inv AS (
        SELECT i.routine_id, i.role, i.created_by, h.user_id AS owner_id
        FROM share_invites i JOIN habits h ON h.id = i.routine_id
        WHERE i.token_hash = p_token_hash AND i.expires_at > now()
    ), ins AS (
        INSERT INTO routine_members (habit_id, user_id, role, invited_by)
        SELECT routine_id, (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid, role, created_by FROM inv
        WHERE owner_id <> (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        ON CONFLICT DO NOTHING
    )
    SELECT routine_id FROM inv
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_routine_invite_preview"(p_token_hash text)
RETURNS TABLE(routine_id uuid, title text, emoji text, color_accent text, recurrence_rule text, target_time text, times jsonb, link_role text, share_mode text, owner_id uuid, owner_name text, owner_image text, people jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT h.id, h.title, h.emoji, h.color_accent, h.recurrence_rule, h.target_time, h.times,
           i.role::text, h.share_mode::text, h.user_id, u.name, u.image,
           coalesce(
               (SELECT jsonb_agg(jsonb_build_object('name', u2.name, 'image', u2.image) ORDER BY m.joined_at)
                FROM routine_members m
                LEFT JOIN neon_auth."user" u2 ON u2.id = m.user_id
                WHERE m.habit_id = h.id AND m.role = 'edit'),
               '[]'::jsonb
           )
    FROM share_invites i
    JOIN habits h ON h.id = i.routine_id
    LEFT JOIN neon_auth."user" u ON u.id = h.user_id
    WHERE i.token_hash = p_token_hash AND i.expires_at > now()
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_routine_people"(p_habit uuid)
RETURNS TABLE(user_id uuid, name text, image text, pronouns text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT h.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', 'owner'
    FROM habits h
    LEFT JOIN neon_auth."user" u ON u.id = h.user_id
    LEFT JOIN users cu ON cu.id = h.user_id
    WHERE h.id = p_habit
      AND (h.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM routine_members g WHERE g.habit_id = h.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
    UNION ALL
    SELECT m.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', m.role::text
    FROM (
        SELECT * FROM routine_members WHERE habit_id = p_habit ORDER BY joined_at ASC
    ) m
    JOIN habits h ON h.id = m.habit_id
    LEFT JOIN neon_auth."user" u ON u.id = m.user_id
    LEFT JOIN users cu ON cu.id = m.user_id
    WHERE (h.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM routine_members g WHERE g.habit_id = h.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_routine_join_counts"(p_habit uuid) RETURNS TABLE(people bigint, joined bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT (SELECT count(*) FROM routine_members WHERE habit_id = p_habit),
           (SELECT count(*) FROM routine_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_set_routine_member_prefs"(
    p_habit uuid,
    p_set_reminder boolean, p_reminder boolean,
    p_set_sort boolean, p_sort double precision,
    p_set_paused boolean, p_paused date
) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
    WITH upd AS (
        UPDATE routine_members
        SET reminder_enabled = CASE WHEN p_set_reminder THEN p_reminder ELSE reminder_enabled END,
            sort_order = CASE WHEN p_set_sort THEN p_sort ELSE sort_order END,
            paused_until = CASE WHEN p_set_paused THEN p_paused ELSE paused_until END
        WHERE habit_id = p_habit
          AND user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd)
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_set_routine_member_stats"(
    p_habit uuid,
    p_current_streak integer,
    p_longest_streak integer,
    p_total_completions integer,
    p_total_skips integer
) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
    WITH upd AS (
        UPDATE routine_members
        SET current_streak = p_current_streak,
            longest_streak = p_longest_streak,
            total_completions = p_total_completions,
            total_skips = p_total_skips
        WHERE habit_id = p_habit
          AND user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd)
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_sync_routine_log_status"(p_log_id uuid, p_status habit_status, p_completed_at timestamptz) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
    WITH upd AS (
        UPDATE habit_logs l
        SET status = p_status, completed_at = p_completed_at
        WHERE l.id = p_log_id
          AND (
              l.habit_id IN (SELECT id FROM habits WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
              OR EXISTS (
                  SELECT 1 FROM routine_members m
                  WHERE m.habit_id = l.habit_id
                    AND m.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
                    AND m.role = 'edit'
              )
          )
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd)
$$;--> statement-breakpoint
CREATE TRIGGER "habits_keep_owner" BEFORE UPDATE ON "habits" FOR EACH ROW EXECUTE FUNCTION "cadence_keep_owner"();--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_member_routines"(share_role) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_member_routines"(share_role) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_join_routine"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_join_routine"(text) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_routine_invite_preview"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_routine_invite_preview"(text) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_routine_people"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_routine_people"(uuid) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_routine_join_counts"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_routine_join_counts"(uuid) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_set_routine_member_prefs"(uuid, boolean, boolean, boolean, double precision, boolean, date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_set_routine_member_prefs"(uuid, boolean, boolean, boolean, double precision, boolean, date) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_set_routine_member_stats"(uuid, integer, integer, integer, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_set_routine_member_stats"(uuid, integer, integer, integer, integer) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_sync_routine_log_status"(uuid, habit_status, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_sync_routine_log_status"(uuid, habit_status, timestamptz) TO api_worker;--> statement-breakpoint
CREATE POLICY "habit_logs_member_read" ON "habit_logs" AS PERMISSIVE FOR SELECT TO public USING ((habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR habit_id IN (select cadence_member_routines('view'::share_role))));--> statement-breakpoint
CREATE POLICY "habit_logs_owner_delete" ON "habit_logs" AS PERMISSIVE FOR DELETE TO public USING (habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "habit_logs_routine_write_insert" ON "habit_logs" AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR habit_id IN (select cadence_member_routines('edit'::share_role))));--> statement-breakpoint
CREATE POLICY "habit_logs_routine_write_update" ON "habit_logs" AS RESTRICTIVE FOR UPDATE TO public USING (true) WITH CHECK ((habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR habit_id IN (select cadence_member_routines('edit'::share_role))));--> statement-breakpoint
CREATE POLICY "habits_member_read" ON "habits" AS PERMISSIVE FOR SELECT TO public USING (id IN (select cadence_member_routines('view'::share_role)));--> statement-breakpoint
CREATE POLICY "habits_member_update" ON "habits" AS PERMISSIVE FOR UPDATE TO public USING (id IN (select cadence_member_routines('edit'::share_role))) WITH CHECK (id IN (select cadence_member_routines('edit'::share_role)));--> statement-breakpoint
CREATE POLICY "routine_cheers_read" ON "routine_cheers" AS PERMISSIVE FOR SELECT TO public USING ((from_user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR to_user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "routine_cheers_insert" ON "routine_cheers" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((from_user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) AND habit_id IN (SELECT id FROM habits)));--> statement-breakpoint
CREATE POLICY "routine_members_read" ON "routine_members" AS PERMISSIVE FOR SELECT TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR habit_id IN (select cadence_member_routines('view'::share_role))));--> statement-breakpoint
CREATE POLICY "routine_members_owner_update" ON "routine_members" AS PERMISSIVE FOR UPDATE TO public USING (habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK (habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "routine_members_delete" ON "routine_members" AS PERMISSIVE FOR DELETE TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));--> statement-breakpoint
ALTER POLICY "share_invites_owner_access" ON "share_invites" TO public USING ((list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR routine_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)))) WITH CHECK ((list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR routine_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));