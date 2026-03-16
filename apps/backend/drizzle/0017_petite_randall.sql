ALTER TABLE "mutation_dedup" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mutation_dedup" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suggestions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mutation_dedup_owner_access" ON "mutation_dedup" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));--> statement-breakpoint
CREATE POLICY "suggestions_owner_access" ON "suggestions" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));--> statement-breakpoint
CREATE POLICY "usage_events_owner_access" ON "usage_events" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));