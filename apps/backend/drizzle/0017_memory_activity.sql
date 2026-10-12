CREATE TYPE "public"."memory_signal_kind" AS ENUM('reschedule', 'complete', 'routine', 'duration');--> statement-breakpoint
CREATE TABLE "ai_memory_notes" (
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"line_hashes" text[] NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_memory_notes_user_id_task_id_pk" PRIMARY KEY("user_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "ai_memory_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_memory_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "memory_signal_kind" NOT NULL,
	"on" date NOT NULL,
	"bucket" text NOT NULL,
	"subject" text,
	"minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_memory_signals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_memory_notes" ADD CONSTRAINT "ai_memory_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_notes" ADD CONSTRAINT "ai_memory_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_signals" ADD CONSTRAINT "ai_memory_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_memory_signals_user_kind_idx" ON "ai_memory_signals" USING btree ("user_id","kind","on");--> statement-breakpoint
CREATE POLICY "ai_memory_notes_owner_access" ON "ai_memory_notes" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "ai_memory_signals_owner_access" ON "ai_memory_signals" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
-- The memory job's work list also covers Full people with a task note quiet for 10 minutes that memory hasn't read
-- since its last save. (Replaces the function from 0015; ids only, as before.)
CREATE OR REPLACE FUNCTION "memory_user_ids"(at timestamptz) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT u.id FROM users u
    WHERE EXISTS (
            SELECT 1 FROM ai_memories m
            WHERE m.user_id = u.id AND m.status = 'forgotten' AND m.forgotten_at <= at - interval '10 minutes'
              AND m.value ->> 'scrubbed' IS DISTINCT FROM 'true')
       OR (u.settings -> 'assistant' ->> 'memoryMode' IN ('basic', 'full') AND EXISTS (
            SELECT 1 FROM ai_conversations c
            WHERE c.user_id = u.id AND c.last_message_at < at - interval '10 minutes'
              AND c.last_message_at > at - interval '3 days'
              AND (c.metadata ->> 'memoryCursor' IS NULL OR (c.metadata ->> 'memoryCursor')::timestamptz < c.last_message_at)
              AND COALESCE(c.metadata ->> 'learn', 'true') <> 'false'))
       OR (u.settings -> 'assistant' ->> 'memoryMode' = 'full' AND EXISTS (
            SELECT 1 FROM task_notes t
            WHERE t.user_id = u.id AND t.updated_at < at - interval '10 minutes' AND t.updated_at > at - interval '3 days'
              AND t.word_count > 3
              AND NOT EXISTS (SELECT 1 FROM ai_memory_notes n WHERE n.user_id = t.user_id AND n.task_id = t.task_id AND n.read_at >= t.updated_at)))
$$;
