CREATE TYPE "public"."ai_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_message_status" AS ENUM('streaming', 'complete', 'failed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."ai_prompt_block_kind" AS ENUM('identity', 'safety', 'operating_principles', 'output_contract', 'tool_policy', 'runtime_context', 'human_metrics', 'persona_customization', 'retrieved_memory', 'workspace_snapshot', 'tone_neutral', 'tone_protective');--> statement-breakpoint
CREATE TYPE "public"."ai_prompt_layer" AS ENUM('base', 'auxiliary');--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"model" text,
	"last_message_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "ai_message_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "ai_message_status" DEFAULT 'complete' NOT NULL,
	"order_index" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_prompt_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "ai_prompt_block_kind" NOT NULL,
	"layer" "ai_prompt_layer" NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"order_index" integer NOT NULL,
	"template" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_revision" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "salience" real DEFAULT 0.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "last_accessed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "access_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "source_conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "source_message_id" text;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "dedupe_hash" text;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_user_id_idx" ON "ai_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_recent_idx" ON "ai_conversations" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "ai_messages_convo_order_idx" ON "ai_messages" USING btree ("conversation_id","order_index");--> statement-breakpoint
CREATE INDEX "ai_messages_user_id_idx" ON "ai_messages" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_blocks_active_kind_locale_unique" ON "ai_prompt_blocks" USING btree ("kind","locale");--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_source_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_memories_user_type_idx" ON "ai_memories" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "ai_memories_expires_idx" ON "ai_memories" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_memories_user_dedupe_unique" ON "ai_memories" USING btree ("user_id","dedupe_hash");--> statement-breakpoint
CREATE INDEX "ai_memories_embedding_hnsw_idx" ON "ai_memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE POLICY "ai_conversations_owner_access" ON "ai_conversations" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));--> statement-breakpoint
CREATE POLICY "ai_messages_owner_access" ON "ai_messages" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));