CREATE TABLE "event_members" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "share_role" DEFAULT 'edit' NOT NULL,
	"invited_by" uuid,
	"notify" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_members_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "event_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_invites" DROP CONSTRAINT "share_invites_one_target";--> statement-breakpoint
ALTER TABLE "share_invites" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_event_id_personal_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."personal_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_members_user_id_idx" ON "event_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "share_invites" ADD CONSTRAINT "share_invites_event_id_personal_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."personal_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_invites_event_id_idx" ON "share_invites" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "share_invites" ADD CONSTRAINT "share_invites_one_target" CHECK (num_nonnulls(list_id, event_id) = 1);--> statement-breakpoint
-- Event sharing functions. SECURITY DEFINER so policies and the join/preview flow can read event_members and neon_auth without recursing into RLS.--> statement-breakpoint
CREATE FUNCTION "cadence_member_events"(min_role share_role) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT event_id FROM event_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid AND role >= min_role
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_join_event"(p_token_hash text) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
    WITH inv AS (
        SELECT i.event_id, i.role, i.created_by, e.user_id AS owner_id
        FROM share_invites i JOIN personal_events e ON e.id = i.event_id
        WHERE i.token_hash = p_token_hash AND i.expires_at > now()
    ), ins AS (
        INSERT INTO event_members (event_id, user_id, role, invited_by)
        SELECT event_id, (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid, role, created_by FROM inv
        WHERE owner_id <> (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        ON CONFLICT DO NOTHING
    )
    SELECT event_id FROM inv
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_event_invite_preview"(p_token_hash text)
RETURNS TABLE(event_id uuid, label text, emoji text, month_day text, started_on date, color text, owner_id uuid, owner_name text, owner_image text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT e.id, e.label, e.emoji, e.month_day, e.started_on, e.color, e.user_id, u.name, u.image
    FROM share_invites i
    JOIN personal_events e ON e.id = i.event_id
    LEFT JOIN neon_auth."user" u ON u.id = e.user_id
    WHERE i.token_hash = p_token_hash AND i.expires_at > now()
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_event_people"(p_event uuid)
RETURNS TABLE(user_id uuid, name text, image text, pronouns text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT e.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', 'owner'
    FROM personal_events e
    LEFT JOIN neon_auth."user" u ON u.id = e.user_id
    LEFT JOIN users cu ON cu.id = e.user_id
    WHERE e.id = p_event
      AND (e.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM event_members g WHERE g.event_id = e.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
    UNION ALL
    SELECT m.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', m.role::text
    FROM event_members m
    JOIN personal_events e ON e.id = m.event_id
    LEFT JOIN neon_auth."user" u ON u.id = m.user_id
    LEFT JOIN users cu ON cu.id = m.user_id
    WHERE m.event_id = p_event
      AND (e.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM event_members g WHERE g.event_id = e.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_event_join_counts"(p_event uuid) RETURNS TABLE(people bigint, joined bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT (SELECT count(*) FROM event_members WHERE event_id = p_event),
           (SELECT count(*) FROM event_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_set_event_notify"(p_event uuid, p_notify boolean) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
    WITH upd AS (
        UPDATE event_members SET notify = p_notify
        WHERE event_id = p_event
          AND user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd)
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_keep_owner"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.user_id := OLD.user_id;
    RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "personal_events_keep_owner" BEFORE UPDATE ON "personal_events" FOR EACH ROW EXECUTE FUNCTION "cadence_keep_owner"();--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_member_events"(share_role) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_member_events"(share_role) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_join_event"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_join_event"(text) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_event_invite_preview"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_event_invite_preview"(text) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_event_people"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_event_people"(uuid) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_event_join_counts"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_event_join_counts"(uuid) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_set_event_notify"(uuid, boolean) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_set_event_notify"(uuid, boolean) TO api_worker;--> statement-breakpoint
CREATE POLICY "personal_events_member_read" ON "personal_events" AS PERMISSIVE FOR SELECT TO public USING (id IN (select cadence_member_events('view'::share_role)));--> statement-breakpoint
CREATE POLICY "personal_events_member_update" ON "personal_events" AS PERMISSIVE FOR UPDATE TO public USING (id IN (select cadence_member_events('edit'::share_role))) WITH CHECK (id IN (select cadence_member_events('edit'::share_role)));--> statement-breakpoint
CREATE POLICY "event_members_read" ON "event_members" AS PERMISSIVE FOR SELECT TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR event_id IN (select cadence_member_events('view'::share_role))));--> statement-breakpoint
CREATE POLICY "event_members_owner_update" ON "event_members" AS PERMISSIVE FOR UPDATE TO public USING (event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK (event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "event_members_delete" ON "event_members" AS PERMISSIVE FOR DELETE TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));--> statement-breakpoint
ALTER POLICY "share_invites_owner_access" ON "share_invites" TO public USING ((list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)))) WITH CHECK ((list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));