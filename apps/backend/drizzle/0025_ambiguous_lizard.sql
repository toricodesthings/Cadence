ALTER TABLE "inbox_items" ALTER COLUMN "source_surface" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "source_surface" SET DEFAULT 'inbox'::text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ALTER COLUMN "source_surface" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ALTER COLUMN "source_surface" SET DEFAULT 'quick_add'::text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ALTER COLUMN "source_surface" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ALTER COLUMN "source_surface" SET DEFAULT 'quick_add'::text;--> statement-breakpoint
DROP TYPE "public"."source_surface";--> statement-breakpoint
CREATE TYPE "public"."source_surface" AS ENUM('inline_add', 'quick_add', 'holding_capture', 'holding_clarify', 'clarify_sheet', 'task_edit_title', 'task_edit_note', 'focus_view_composer', 'inbox_card', 'inbox');--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "source_surface" SET DEFAULT 'inbox'::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "source_surface" SET DATA TYPE "public"."source_surface" USING "source_surface"::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ALTER COLUMN "source_surface" SET DEFAULT 'quick_add'::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ALTER COLUMN "source_surface" SET DATA TYPE "public"."source_surface" USING "source_surface"::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ALTER COLUMN "source_surface" SET DEFAULT 'quick_add'::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ALTER COLUMN "source_surface" SET DATA TYPE "public"."source_surface" USING "source_surface"::"public"."source_surface";