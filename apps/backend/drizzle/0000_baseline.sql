-- The whole schema as of v0.23.2 (squashed from migrations 0000-0040). Existing databases skip it:
-- its journal time equals 0040's, and the migrator only applies entries newer than the last one recorded.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."ai_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_message_status" AS ENUM('streaming', 'complete', 'failed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'parsed', 'reviewed', 'applied', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."capture_kind" AS ENUM('task', 'thought', 'reference', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."capture_status" AS ENUM('clarifying', 'placed', 'kept', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."confidence_tier" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."focus_view_source" AS ENUM('preset', 'composed', 'manual');--> statement-breakpoint
CREATE TYPE "public"."habit_status" AS ENUM('COMPLETED', 'SKIPPED', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('CORE', 'EPHEMERAL');--> statement-breakpoint
CREATE TYPE "public"."source_surface" AS ENUM('inline_add', 'quick_add', 'holding_capture', 'holding_clarify', 'clarify_sheet', 'task_edit_title', 'task_edit_note', 'focus_view_composer', 'inbox_card', 'inbox');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('PENDING', 'ACCEPTED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."suggestion_type" AS ENUM('lighten_today', 'suggested_cleanup', 'move_overdue');--> statement-breakpoint
CREATE TYPE "public"."task_interaction_mode" AS ENUM('task', 'timetable');--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('ACTIVE', 'WAITING', 'COMPLETE', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"model" text,
	"last_message_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active_stream_id" text,
	"last_stream_id" text,
	"last_stream_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"diagnostics_shared_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"type" "memory_type" DEFAULT 'EPHEMERAL' NOT NULL,
	"salience" real DEFAULT 0.5 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"access_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"source_conversation_id" uuid,
	"source_message_id" text,
	"embedding_model" text,
	"dedupe_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
CREATE TABLE "habit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "habit_status" DEFAULT 'PENDING' NOT NULL,
	"target_date" date NOT NULL,
	"completed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"step_status" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habit_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"recurrence_rule" text NOT NULL,
	"target_time" text,
	"target_times" jsonb,
	"emoji" text,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"project_id" uuid,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"paused_until" date,
	"total_completions" integer DEFAULT 0 NOT NULL,
	"total_skips" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"color_accent" text DEFAULT 'lantern' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"notes" text,
	"steps" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"section_id" uuid,
	"order_index" integer DEFAULT 0 NOT NULL,
	"raw_text" text NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"capture_kind" "capture_kind" DEFAULT 'unknown' NOT NULL,
	"capture_status" "capture_status" DEFAULT 'clarifying' NOT NULL,
	"placed_task_id" uuid,
	"ai_suggestion" text,
	"analysis_status" "analysis_status" DEFAULT 'pending',
	"analysis_version" text,
	"analysis_summary" text,
	"analysis" jsonb,
	"source_surface" "source_surface" DEFAULT 'inbox',
	"analysis_confidence_tier" "confidence_tier",
	"analysis_needs_review" boolean DEFAULT false NOT NULL,
	"analysis_review_reason" text,
	"analysis_entity_count" integer DEFAULT 0 NOT NULL,
	"clarified_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inbox_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mcp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" text[] NOT NULL,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mcp_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mutation_dedup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_mutation_id" text NOT NULL,
	"result_id" uuid,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mutation_dedup" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"trigger_id" text NOT NULL,
	"first_presented_at" timestamp with time zone,
	"last_presented_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"deferred_until" timestamp with time zone,
	"action_taken" text,
	"presentation_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color_accent" text DEFAULT 'luminous-amber',
	"emoji" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_focus_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"source" "focus_view_source" DEFAULT 'preset' NOT NULL,
	"order_index" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_focus_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"order_index" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subtasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "suggestion_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"status" "suggestion_status" DEFAULT 'PENDING' NOT NULL,
	"related_task_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'default',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reschedule_count" integer DEFAULT 0 NOT NULL,
	"delay_count" integer DEFAULT 0 NOT NULL,
	"created_to_done" integer,
	"first_scheduled" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_nlp_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"parser_version" text DEFAULT '2.0.0' NOT NULL,
	"source_surface" "source_surface" DEFAULT 'quick_add' NOT NULL,
	"raw_input" text NOT NULL,
	"cleaned_title" text NOT NULL,
	"parse_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_tier" "confidence_tier" DEFAULT 'medium' NOT NULL,
	"resolved_due_date" timestamp with time zone,
	"resolved_scheduled_start" timestamp with time zone,
	"resolved_scheduled_end" timestamp with time zone,
	"resolved_recurrence_rule" text,
	"resolved_project_id" uuid,
	"resolved_tag_ids" jsonb,
	"resolved_priority" text,
	"resolved_duration_minutes" integer,
	"resolved_waiting_on" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"entity_count" integer DEFAULT 0 NOT NULL,
	"high_confidence_entity_count" integer DEFAULT 0 NOT NULL,
	"medium_confidence_entity_count" integer DEFAULT 0 NOT NULL,
	"low_confidence_entity_count" integer DEFAULT 0 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_nlp_metadata_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"parser_version" text DEFAULT '2.0.0' NOT NULL,
	"source_surface" "source_surface" DEFAULT 'quick_add' NOT NULL,
	"raw_input" text NOT NULL,
	"cleaned_title" text NOT NULL,
	"parse_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_tier" "confidence_tier" DEFAULT 'medium' NOT NULL,
	"resolved_due_date" timestamp with time zone,
	"resolved_scheduled_start" timestamp with time zone,
	"resolved_scheduled_end" timestamp with time zone,
	"resolved_recurrence_rule" text,
	"resolved_project_id" uuid,
	"resolved_tag_ids" jsonb,
	"resolved_priority" text,
	"resolved_duration_minutes" integer,
	"resolved_waiting_on" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"entity_count" integer DEFAULT 0 NOT NULL,
	"high_confidence_entity_count" integer DEFAULT 0 NOT NULL,
	"medium_confidence_entity_count" integer DEFAULT 0 NOT NULL,
	"low_confidence_entity_count" integer DEFAULT 0 NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"heading_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"order_index" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"origin" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"section_id" uuid,
	"title" text NOT NULL,
	"content" text,
	"state" "task_state" DEFAULT 'ACTIVE' NOT NULL,
	"order_index" double precision NOT NULL,
	"is_all_day" boolean DEFAULT true NOT NULL,
	"due_date" timestamp with time zone,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"duration_estimate" integer,
	"timezone_locked" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"reminder_at" timestamp with time zone,
	"reminder_silenced" boolean DEFAULT false NOT NULL,
	"recurrence_rule" text,
	"interaction_mode" "task_interaction_mode" DEFAULT 'task' NOT NULL,
	"waiting_on" text,
	"waiting_reminder" timestamp with time zone,
	"effort" integer,
	"not_before" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_effort_check" CHECK (effort IS NULL OR effort BETWEEN 1 AND 3)
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event" text NOT NULL,
	"metadata" jsonb,
	"surface" text,
	"route" text,
	"input_method" text,
	"object_type" text,
	"confidence_tier" text,
	"outcome" text,
	"latency_ms" integer,
	"selection_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reschedule_velocity" real DEFAULT 0 NOT NULL,
	"current_burnout_index" integer DEFAULT 10 NOT NULL,
	"completion_ratio" real DEFAULT 0 NOT NULL,
	"overdue_carry_load" integer DEFAULT 0 NOT NULL,
	"habit_adherence_rate" real DEFAULT 0 NOT NULL,
	"schedule_density" real DEFAULT 0 NOT NULL,
	"last_calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb DEFAULT '{"tasks":{"defaultDueDate":null,"hideTrash":false,"hideCompleted":false,"quickAdd":{"preset":"planner","style":"label","actions":["date","priority","project"]}},"dateTime":{"weekStart":"Sunday","timezone":"local","timeDisplay":"12h"},"calendar":{"clutter":{"showAllDay":true,"showTimedTasks":true,"showHabitAnchors":true},"holidays":{"enabled":true}},"notifications":{"email":true,"browser":false,"taskReminders":true,"habitReminders":true,"dueDateAlerts":true},"shortcuts":{}}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_images" ADD CONSTRAINT "ai_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_source_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_tags" ADD CONSTRAINT "habit_tags_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_tags" ADD CONSTRAINT "habit_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_tags" ADD CONSTRAINT "habit_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_section_id_inbox_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."inbox_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_placed_task_id_tasks_id_fk" FOREIGN KEY ("placed_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_sections" ADD CONSTRAINT "inbox_sections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutation_dedup" ADD CONSTRAINT "mutation_dedup_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_state" ADD CONSTRAINT "notification_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_focus_views" ADD CONSTRAINT "saved_focus_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_metrics" ADD CONSTRAINT "task_metrics_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_metrics" ADD CONSTRAINT "task_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD CONSTRAINT "task_nlp_metadata_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD CONSTRAINT "task_nlp_metadata_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD CONSTRAINT "task_nlp_metadata_history_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD CONSTRAINT "task_nlp_metadata_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sections" ADD CONSTRAINT "task_sections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sections" ADD CONSTRAINT "task_sections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_section_id_task_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."task_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_metrics" ADD CONSTRAINT "user_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_user_id_idx" ON "ai_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_recent_idx" ON "ai_conversations" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_images_user_convo_hash_unique" ON "ai_images" USING btree ("user_id","conversation_id","content_hash");--> statement-breakpoint
CREATE INDEX "ai_images_last_used_idx" ON "ai_images" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "ai_memories_user_id_idx" ON "ai_memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_memories_user_type_idx" ON "ai_memories" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "ai_memories_expires_idx" ON "ai_memories" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_memories_user_dedupe_unique" ON "ai_memories" USING btree ("user_id","dedupe_hash");--> statement-breakpoint
CREATE INDEX "ai_memories_embedding_hnsw_idx" ON "ai_memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "ai_messages_convo_order_idx" ON "ai_messages" USING btree ("conversation_id","order_index");--> statement-breakpoint
CREATE INDEX "ai_messages_user_id_idx" ON "ai_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "habit_logs_habit_date_idx" ON "habit_logs" USING btree ("habit_id","target_date");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_logs_habit_date_unique" ON "habit_logs" USING btree ("habit_id","target_date");--> statement-breakpoint
CREATE INDEX "habit_logs_user_id_idx" ON "habit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_tags_unique_pair" ON "habit_tags" USING btree ("habit_id","tag_id");--> statement-breakpoint
CREATE INDEX "habit_tags_tag_id_idx" ON "habit_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "habits_user_id_idx" ON "habits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "habits_project_id_idx" ON "habits" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "inbox_items_user_id_idx" ON "inbox_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inbox_sections_user_id_idx" ON "inbox_sections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_connections_user_id_idx" ON "mcp_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mutation_dedup_user_mutation_idx" ON "mutation_dedup" USING btree ("user_id","client_mutation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_state_user_object_trigger_unique" ON "notification_state" USING btree ("user_id","object_id","trigger_id");--> statement-breakpoint
CREATE INDEX "notification_state_user_id_idx" ON "notification_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_state_deferred_until_idx" ON "notification_state" USING btree ("deferred_until");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_focus_views_user_id_idx" ON "saved_focus_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subtasks_task_id_idx" ON "subtasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "subtasks_user_id_idx" ON "subtasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "suggestions_user_id_idx" ON "suggestions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "suggestions_status_idx" ON "suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tags_user_id_idx" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_metrics_user_id_idx" ON "task_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_metrics_task_id_unique" ON "task_metrics" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_nlp_metadata_task_id_unique" ON "task_nlp_metadata" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_nlp_metadata_user_id_idx" ON "task_nlp_metadata" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_nlp_metadata_history_task_id_idx" ON "task_nlp_metadata_history" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_nlp_metadata_history_user_id_idx" ON "task_nlp_metadata_history" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_notes_task_id_idx" ON "task_notes" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_notes_user_id_idx" ON "task_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_sections_user_id_idx" ON "task_sections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_sections_project_id_idx" ON "task_sections" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_tags_unique_pair" ON "task_tags" USING btree ("task_id","tag_id");--> statement-breakpoint
CREATE INDEX "task_tags_tag_id_idx" ON "task_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_state_idx" ON "tasks" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "tasks_scheduled_start_idx" ON "tasks" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_state_idx" ON "tasks" USING btree ("state");--> statement-breakpoint
CREATE INDEX "tasks_sort_order_idx" ON "tasks" USING btree ("is_pinned","order_index");--> statement-breakpoint
CREATE INDEX "tasks_not_before_idx" ON "tasks" USING btree ("not_before");--> statement-breakpoint
CREATE INDEX "tasks_effort_idx" ON "tasks" USING btree ("effort");--> statement-breakpoint
CREATE INDEX "usage_events_user_id_idx" ON "usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_events_event_idx" ON "usage_events" USING btree ("event");--> statement-breakpoint
CREATE INDEX "usage_events_created_at_idx" ON "usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_metrics_user_id_unique" ON "user_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "ai_conversations_owner_access" ON "ai_conversations" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "ai_images_owner_access" ON "ai_images" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "ai_memories_owner_access" ON "ai_memories" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "ai_messages_owner_access" ON "ai_messages" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "habit_logs_owner_access" ON "habit_logs" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "habit_tags_owner_access" ON "habit_tags" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "habits_owner_access" ON "habits" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "inbox_items_owner_access" ON "inbox_items" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "inbox_sections_owner_access" ON "inbox_sections" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "mcp_connections_owner_access" ON "mcp_connections" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "mutation_dedup_owner_access" ON "mutation_dedup" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "notification_state_owner_access" ON "notification_state" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "projects_owner_access" ON "projects" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "saved_focus_views_owner_access" ON "saved_focus_views" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "subtasks_owner_access" ON "subtasks" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "suggestions_owner_access" ON "suggestions" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "tags_owner_access" ON "tags" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_metrics_owner_access" ON "task_metrics" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_nlp_metadata_owner_access" ON "task_nlp_metadata" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_nlp_metadata_history_owner_access" ON "task_nlp_metadata_history" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_notes_owner_access" ON "task_notes" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_sections_owner_access" ON "task_sections" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_tags_owner_access" ON "task_tags" AS PERMISSIVE FOR ALL TO public USING (EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK (EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "tasks_owner_access" ON "tasks" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "usage_events_owner_access" ON "usage_events" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "user_metrics_owner_access" ON "user_metrics" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "users_owner_access" ON "users" AS PERMISSIVE FOR ALL TO public USING ((id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
-- The Worker connects as api_worker (Hyperdrive), which RLS applies to. Create that role before migrating.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO api_worker;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO api_worker;
