-- The assistant memory was a stub that never wrote a row (verified empty on production), so the table is emptied
-- before its columns become NOT NULL. The embedding column is replaced, not cast: vector(1536) -> halfvec(512).
DELETE FROM "ai_memories";--> statement-breakpoint
CREATE TYPE "public"."memory_confidence" AS ENUM('stated', 'observed', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."memory_kind" AS ENUM('preference', 'quirk', 'life', 'constraint', 'pattern', 'duration', 'assist');--> statement-breakpoint
CREATE TYPE "public"."memory_source" AS ENUM('explicit', 'chat', 'note', 'activity', 'backfill');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('active', 'forgotten');--> statement-breakpoint
DROP INDEX "ai_memories_user_type_idx";--> statement-breakpoint
DROP INDEX "ai_memories_expires_idx";--> statement-breakpoint
DROP INDEX "ai_memories_user_dedupe_unique";--> statement-breakpoint
DROP INDEX "ai_memories_embedding_hnsw_idx";--> statement-breakpoint
ALTER TABLE "ai_memories" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "embedding" halfvec(512);--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "kind" "memory_kind";--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "value" jsonb;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "said_on" date;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "last_seen_on" date;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "seen_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "valid_through" date;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "source" "memory_source";--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "confidence" "memory_confidence";--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "status" "memory_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "forgotten_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ai_memories_user_status_idx" ON "ai_memories" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_memories_user_hash_unique" ON "ai_memories" USING btree ("user_id","content_hash") WHERE "ai_memories"."status" = 'active';--> statement-breakpoint
CREATE INDEX "ai_memories_search_idx" ON "ai_memories" USING gin ("search");--> statement-breakpoint
ALTER TABLE "ai_memories" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ALTER COLUMN "said_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ALTER COLUMN "last_seen_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ALTER COLUMN "source" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ALTER COLUMN "confidence" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "ai_memories" DROP COLUMN "salience";--> statement-breakpoint
ALTER TABLE "ai_memories" DROP COLUMN "last_accessed_at";--> statement-breakpoint
ALTER TABLE "ai_memories" DROP COLUMN "access_count";--> statement-breakpoint
ALTER TABLE "ai_memories" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "ai_memories" DROP COLUMN "dedupe_hash";--> statement-breakpoint
DROP TYPE "public"."memory_type";
--> statement-breakpoint
-- Users the memory job has work for: a forgotten fact past its Undo window that still holds text, or (memory on) a
-- chat idle for 10 minutes whose newest messages are not learned from yet. The Worker connects as api_worker, which
-- RLS applies to, so it can't scan for them itself: ids only, each job then runs per user through withRls.
CREATE FUNCTION "memory_user_ids"(at timestamptz) RETURNS SETOF uuid
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
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "memory_user_ids"(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "memory_user_ids"(timestamptz) TO api_worker;
