ALTER TABLE "ai_messages" ADD COLUMN "search_text" text;--> statement-breakpoint
-- Existing messages: the text parts of the person's own turns, so search_past_chats reaches back from day one.
UPDATE "ai_messages" SET "search_text" = (
    SELECT string_agg(part ->> 'text', ' ') FROM jsonb_array_elements("parts") AS part WHERE part ->> 'type' = 'text'
) WHERE "role" = 'user';--> statement-breakpoint
CREATE INDEX "ai_messages_search_idx" ON "ai_messages" USING gin (to_tsvector('english', coalesce("search_text", '')));