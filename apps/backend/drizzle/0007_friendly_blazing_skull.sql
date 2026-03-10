CREATE TABLE "inbox_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "order_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "emoji" text;--> statement-breakpoint
ALTER TABLE "inbox_sections" ADD CONSTRAINT "inbox_sections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_section_id_inbox_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."inbox_sections"("id") ON DELETE set null ON UPDATE no action;