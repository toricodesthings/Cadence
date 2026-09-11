CREATE TABLE "ai_title_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"template" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_title_prompts_locale_unique" ON "ai_title_prompts" USING btree ("locale");--> statement-breakpoint
INSERT INTO "ai_title_prompts" ("locale", "template", "notes") VALUES ('en', $tpl$You generate a short, human title for a conversation from the user's first message.

Rules:
- 3 to 6 words, in Title Case.
- Capture the core intent or topic of the message.
- No surrounding quotes, no trailing punctuation, no emojis.
- Do not answer, greet, or add commentary. Output ONLY the title text.$tpl$, 'seed: default conversation auto-title prompt') ON CONFLICT ("locale") DO NOTHING;