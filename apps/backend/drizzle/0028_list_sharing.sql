CREATE TYPE "public"."share_role" AS ENUM('view', 'edit');--> statement-breakpoint
CREATE TABLE "list_members" (
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "share_role" DEFAULT 'view' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_members_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "list_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "share_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"role" "share_role" DEFAULT 'view' NOT NULL,
	"list_id" uuid,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "share_invites_one_target" CHECK (num_nonnulls(list_id) = 1)
);
--> statement-breakpoint
ALTER TABLE "share_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subtasks" ADD COLUMN "created_by" uuid DEFAULT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;--> statement-breakpoint
ALTER TABLE "task_notes" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "task_sections" ADD COLUMN "created_by" uuid DEFAULT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_by" uuid DEFAULT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_id_projects_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_invites" ADD CONSTRAINT "share_invites_list_id_projects_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_invites" ADD CONSTRAINT "share_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_members_user_id_idx" ON "list_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_invites_list_id_idx" ON "share_invites" USING btree ("list_id");--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sections" ADD CONSTRAINT "task_sections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- List sharing functions. SECURITY DEFINER so policies and the join/preview flow can read list_members and neon_auth without recursing into RLS.--> statement-breakpoint
CREATE FUNCTION "cadence_member_lists"(min_role share_role) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT list_id FROM list_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid AND role >= min_role
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_set_updated_by"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_by := (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "tasks_set_updated_by" BEFORE UPDATE ON "tasks" FOR EACH ROW EXECUTE FUNCTION "cadence_set_updated_by"();--> statement-breakpoint
CREATE TRIGGER "task_notes_set_updated_by" BEFORE UPDATE ON "task_notes" FOR EACH ROW EXECUTE FUNCTION "cadence_set_updated_by"();--> statement-breakpoint
CREATE FUNCTION "cadence_join_list"(p_token_hash text) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
    WITH inv AS (
        SELECT i.list_id, i.role, i.created_by, p.user_id AS owner_id
        FROM share_invites i JOIN projects p ON p.id = i.list_id
        WHERE i.token_hash = p_token_hash AND i.expires_at > now()
    ), ins AS (
        INSERT INTO list_members (list_id, user_id, role, invited_by)
        SELECT list_id, (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid, role, created_by FROM inv
        WHERE owner_id <> (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        ON CONFLICT DO NOTHING
    )
    SELECT list_id FROM inv
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_invite_preview"(p_token_hash text)
RETURNS TABLE(list_id uuid, name text, emoji text, color_accent text, owner_id uuid, owner_name text, owner_image text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p.emoji, p.color_accent, p.user_id, u.name, u.image
    FROM share_invites i
    JOIN projects p ON p.id = i.list_id
    LEFT JOIN neon_auth."user" u ON u.id = p.user_id
    WHERE i.token_hash = p_token_hash AND i.expires_at > now()
$$;--> statement-breakpoint
CREATE FUNCTION "cadence_list_people"(p_list uuid)
RETURNS TABLE(user_id uuid, name text, image text, pronouns text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', 'owner'
    FROM projects p
    LEFT JOIN neon_auth."user" u ON u.id = p.user_id
    LEFT JOIN users cu ON cu.id = p.user_id
    WHERE p.id = p_list
      AND (p.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM list_members g WHERE g.list_id = p.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
    UNION ALL
    SELECT m.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', m.role::text
    FROM list_members m
    JOIN projects p ON p.id = m.list_id
    LEFT JOIN neon_auth."user" u ON u.id = m.user_id
    LEFT JOIN users cu ON cu.id = m.user_id
    WHERE m.list_id = p_list
      AND (p.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM list_members g WHERE g.list_id = p.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_member_lists"(share_role) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_member_lists"(share_role) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_join_list"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_join_list"(text) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_invite_preview"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_invite_preview"(text) TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_list_people"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_list_people"(uuid) TO api_worker;--> statement-breakpoint
CREATE FUNCTION "cadence_join_counts"(p_list uuid) RETURNS TABLE(people bigint, joined bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT (SELECT count(*) FROM list_members WHERE list_id = p_list),
           (SELECT count(*) FROM list_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_join_counts"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_join_counts"(uuid) TO api_worker;--> statement-breakpoint
CREATE POLICY "projects_member_read" ON "projects" AS PERMISSIVE FOR SELECT TO public USING (id IN (select cadence_member_lists('view'::share_role)));--> statement-breakpoint
CREATE POLICY "subtasks_same_owner_insert" ON "subtasks" AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "subtasks_same_owner_update" ON "subtasks" AS RESTRICTIVE FOR UPDATE TO public USING (true) WITH CHECK ((user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "subtasks_member_read" ON "subtasks" AS PERMISSIVE FOR SELECT TO public USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('view'::share_role))));--> statement-breakpoint
CREATE POLICY "subtasks_member_insert" ON "subtasks" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role))) AND user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "subtasks_member_update" ON "subtasks" AS PERMISSIVE FOR UPDATE TO public USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role)))) WITH CHECK ((task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role))) AND user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "subtasks_member_delete" ON "subtasks" AS PERMISSIVE FOR DELETE TO public USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role))));--> statement-breakpoint
CREATE POLICY "task_notes_same_owner_insert" ON "task_notes" AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "task_notes_same_owner_update" ON "task_notes" AS RESTRICTIVE FOR UPDATE TO public USING (true) WITH CHECK ((user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "task_notes_member_read" ON "task_notes" AS PERMISSIVE FOR SELECT TO public USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('view'::share_role))));--> statement-breakpoint
CREATE POLICY "task_notes_member_insert" ON "task_notes" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role))) AND user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "task_notes_member_update" ON "task_notes" AS PERMISSIVE FOR UPDATE TO public USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role)))) WITH CHECK ((task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role))) AND user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "task_sections_same_owner_insert" ON "task_sections" AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((project_id IS NULL OR user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "task_sections_same_owner_update" ON "task_sections" AS RESTRICTIVE FOR UPDATE TO public USING (true) WITH CHECK ((project_id IS NULL OR user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "task_sections_member_read" ON "task_sections" AS PERMISSIVE FOR SELECT TO public USING (project_id IN (select cadence_member_lists('view'::share_role)));--> statement-breakpoint
CREATE POLICY "task_sections_member_insert" ON "task_sections" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((project_id IN (select cadence_member_lists('edit'::share_role)) AND user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "task_sections_member_update" ON "task_sections" AS PERMISSIVE FOR UPDATE TO public USING (project_id IN (select cadence_member_lists('edit'::share_role))) WITH CHECK ((project_id IN (select cadence_member_lists('edit'::share_role)) AND user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "tasks_same_owner_insert" ON "tasks" AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((project_id IS NULL OR user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "tasks_same_owner_update" ON "tasks" AS RESTRICTIVE FOR UPDATE TO public USING (true) WITH CHECK ((project_id IS NULL OR user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "tasks_member_read" ON "tasks" AS PERMISSIVE FOR SELECT TO public USING (project_id IN (select cadence_member_lists('view'::share_role)));--> statement-breakpoint
CREATE POLICY "tasks_member_insert" ON "tasks" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((project_id IN (select cadence_member_lists('edit'::share_role)) AND user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "tasks_member_update" ON "tasks" AS PERMISSIVE FOR UPDATE TO public USING (project_id IN (select cadence_member_lists('edit'::share_role))) WITH CHECK ((project_id IN (select cadence_member_lists('edit'::share_role)) AND user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "list_members_read" ON "list_members" AS PERMISSIVE FOR SELECT TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR list_id IN (select cadence_member_lists('view'::share_role))));--> statement-breakpoint
CREATE POLICY "list_members_owner_update" ON "list_members" AS PERMISSIVE FOR UPDATE TO public USING (list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK (list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "list_members_delete" ON "list_members" AS PERMISSIVE FOR DELETE TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));--> statement-breakpoint
CREATE POLICY "share_invites_owner_access" ON "share_invites" AS PERMISSIVE FOR ALL TO public USING (list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK (list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));