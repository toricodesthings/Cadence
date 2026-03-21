CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'parsed', 'reviewed', 'applied');--> statement-breakpoint
CREATE TYPE "public"."capture_kind" AS ENUM('task', 'thought', 'reference', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."capture_status" AS ENUM('clarifying', 'placed', 'kept', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."confidence_tier" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."focus_view_source" AS ENUM('preset', 'composed', 'manual');--> statement-breakpoint
CREATE TYPE "public"."source_surface" AS ENUM('inline-add', 'inline_add', 'quick-add-task', 'quick_add', 'holding-capture', 'holding-clarify', 'clarify_sheet', 'task-edit-title', 'task-edit-note', 'focus-view-composer', 'inbox_card', 'inbox');--> statement-breakpoint
CREATE TYPE "public"."suggestion_type" AS ENUM('lighten_today', 'suggested_cleanup', 'move_overdue');--> statement-breakpoint
CREATE TYPE "public"."target_mode" AS ENUM('AMBIENT', 'ANCHOR', 'BLOCK');--> statement-breakpoint
ALTER TABLE "habits" ALTER COLUMN "target_mode" SET DEFAULT 'AMBIENT'::"public"."target_mode";--> statement-breakpoint
ALTER TABLE "habits" ALTER COLUMN "target_mode" SET DATA TYPE "public"."target_mode" USING "target_mode"::"public"."target_mode";--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "capture_kind" SET DEFAULT 'unknown'::"public"."capture_kind";--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "capture_kind" SET DATA TYPE "public"."capture_kind" USING "capture_kind"::"public"."capture_kind";--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "capture_status" SET DEFAULT 'clarifying'::"public"."capture_status";--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "capture_status" SET DATA TYPE "public"."capture_status" USING "capture_status"::"public"."capture_status";--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "analysis_status" SET DEFAULT 'pending'::"public"."analysis_status";--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "analysis_status" SET DATA TYPE "public"."analysis_status" USING "analysis_status"::"public"."analysis_status";--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "source_surface" SET DEFAULT 'inbox'::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "source_surface" SET DATA TYPE "public"."source_surface" USING "source_surface"::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "saved_focus_views" ALTER COLUMN "source" SET DEFAULT 'preset'::"public"."focus_view_source";--> statement-breakpoint
ALTER TABLE "saved_focus_views" ALTER COLUMN "source" SET DATA TYPE "public"."focus_view_source" USING "source"::"public"."focus_view_source";--> statement-breakpoint
ALTER TABLE "suggestions" ALTER COLUMN "type" SET DATA TYPE "public"."suggestion_type" USING "type"::"public"."suggestion_type";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ALTER COLUMN "source_surface" SET DEFAULT 'quick_add'::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ALTER COLUMN "source_surface" SET DATA TYPE "public"."source_surface" USING "source_surface"::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ALTER COLUMN "confidence_tier" SET DEFAULT 'medium'::"public"."confidence_tier";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ALTER COLUMN "confidence_tier" SET DATA TYPE "public"."confidence_tier" USING "confidence_tier"::"public"."confidence_tier";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ALTER COLUMN "source_surface" SET DEFAULT 'quick_add'::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ALTER COLUMN "source_surface" SET DATA TYPE "public"."source_surface" USING "source_surface"::"public"."source_surface";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ALTER COLUMN "confidence_tier" SET DEFAULT 'medium'::"public"."confidence_tier";--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ALTER COLUMN "confidence_tier" SET DATA TYPE "public"."confidence_tier" USING "confidence_tier"::"public"."confidence_tier";