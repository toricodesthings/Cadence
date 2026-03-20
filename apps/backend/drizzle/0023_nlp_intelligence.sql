-- 0023: NLP Intelligence (Update 2)
-- Adds task NLP metadata, saved focus views, and inbox analysis columns.

-- ── Task NLP Metadata ──
-- Stores the parse result snapshot for each task created via NLP capture.
CREATE TABLE IF NOT EXISTS "task_nlp_metadata" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "parser_version" text NOT NULL DEFAULT '2.0.0',
    "source_surface" text NOT NULL DEFAULT 'quick_add',
    "raw_input" text NOT NULL,
    "cleaned_title" text NOT NULL,
    "parse_result" jsonb NOT NULL DEFAULT '{}',
    "confidence_tier" text NOT NULL DEFAULT 'medium',
    "is_current" boolean NOT NULL DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "task_nlp_metadata_task_id_idx" ON "task_nlp_metadata" ("task_id");
CREATE INDEX IF NOT EXISTS "task_nlp_metadata_user_id_idx" ON "task_nlp_metadata" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "task_nlp_metadata_task_id_unique" ON "task_nlp_metadata" ("task_id");

ALTER TABLE "task_nlp_metadata" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_nlp_metadata_owner_access" ON "task_nlp_metadata"
    AS PERMISSIVE FOR ALL
    USING (user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK (user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);

-- ── Task NLP Metadata History ──
-- Append-only history of prior parse snapshots for auditability.
CREATE TABLE IF NOT EXISTS "task_nlp_metadata_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "parser_version" text NOT NULL DEFAULT '2.0.0',
    "source_surface" text NOT NULL DEFAULT 'quick_add',
    "raw_input" text NOT NULL,
    "cleaned_title" text NOT NULL,
    "parse_result" jsonb NOT NULL DEFAULT '{}',
    "confidence_tier" text NOT NULL DEFAULT 'medium',
    "is_current" boolean NOT NULL DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "task_nlp_metadata_history_task_id_idx" ON "task_nlp_metadata_history" ("task_id");
CREATE INDEX IF NOT EXISTS "task_nlp_metadata_history_user_id_idx" ON "task_nlp_metadata_history" ("user_id");

ALTER TABLE "task_nlp_metadata_history" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_nlp_metadata_history_owner_access" ON "task_nlp_metadata_history"
    AS PERMISSIVE FOR ALL
    USING (user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK (user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);

-- ── Saved Focus Views ──
-- User-created or pinned focus view definitions.
CREATE TABLE IF NOT EXISTS "saved_focus_views" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "definition" jsonb NOT NULL DEFAULT '{}',
    "is_pinned" boolean NOT NULL DEFAULT false,
    "source" text NOT NULL DEFAULT 'preset',
    "order_index" double precision NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "saved_focus_views_user_id_idx" ON "saved_focus_views" ("user_id");

ALTER TABLE "saved_focus_views" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_focus_views_owner_access" ON "saved_focus_views"
    AS PERMISSIVE FOR ALL
    USING (user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)
    WITH CHECK (user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid);

-- ── Inbox Analysis Columns ──
-- Add NLP analysis metadata to inbox items.
ALTER TABLE "inbox_items" ADD COLUMN IF NOT EXISTS "analysis_status" text DEFAULT 'pending';
ALTER TABLE "inbox_items" ADD COLUMN IF NOT EXISTS "analysis_version" text;
ALTER TABLE "inbox_items" ADD COLUMN IF NOT EXISTS "analysis_summary" text;
ALTER TABLE "inbox_items" ADD COLUMN IF NOT EXISTS "analysis" jsonb;
ALTER TABLE "inbox_items" ADD COLUMN IF NOT EXISTS "source_surface" text DEFAULT 'inbox';
