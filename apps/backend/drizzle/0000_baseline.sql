-- The whole schema, squashed from migrations 0000-0038. Existing databases skip it:
-- its journal time equals 0038's, and the migrator only applies entries newer than the last one recorded.
-- The Worker connects as api_worker (Hyperdrive), which RLS applies to. Create that role before migrating.
-- neon_auth."user" (Neon Auth) must exist: the sharing functions read name and image from it.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."ai_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_message_status" AS ENUM('streaming', 'complete', 'failed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'parsed', 'reviewed', 'applied', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."capture_kind" AS ENUM('task', 'thought', 'reference', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."capture_status" AS ENUM('clarifying', 'placed', 'kept', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."confidence_tier" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."focus_view_source" AS ENUM('preset', 'composed', 'manual');--> statement-breakpoint
CREATE TYPE "public"."habit_status" AS ENUM('COMPLETED', 'SKIPPED', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."memory_confidence" AS ENUM('stated', 'observed', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."memory_kind" AS ENUM('preference', 'quirk', 'life', 'constraint', 'pattern', 'duration', 'assist');--> statement-breakpoint
CREATE TYPE "public"."memory_signal_kind" AS ENUM('reschedule', 'complete', 'routine', 'duration');--> statement-breakpoint
CREATE TYPE "public"."memory_source" AS ENUM('explicit', 'chat', 'note', 'activity', 'backfill');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('active', 'forgotten');--> statement-breakpoint
CREATE TYPE "public"."routine_share_mode" AS ENUM('together', 'turns');--> statement-breakpoint
CREATE TYPE "public"."share_role" AS ENUM('view', 'edit');--> statement-breakpoint
CREATE TYPE "public"."source_surface" AS ENUM('inline_add', 'quick_add', 'holding_capture', 'holding_clarify', 'clarify_sheet', 'task_edit_title', 'task_edit_note', 'focus_view_composer', 'inbox_card', 'inbox');--> statement-breakpoint
CREATE TYPE "public"."task_interaction_mode" AS ENUM('task', 'timetable');--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('ACTIVE', 'WAITING', 'COMPLETE', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "event_members" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "share_role" DEFAULT 'edit' NOT NULL,
	"invited_by" uuid,
	"notify" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_members_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "event_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"habit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "habit_status" DEFAULT 'PENDING' NOT NULL,
	"target_date" date NOT NULL,
	"completed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"step_status" jsonb,
	"time_marks" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habit_tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"habit_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
	"times" jsonb,
	"linked_app_id" text,
	"linked_url" text,
	"share_mode" "routine_share_mode",
	"turn_order" uuid[],
	"turns_from" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habits_linked_url_check" CHECK (linked_url IS NULL OR (linked_url LIKE 'https://%' AND length(linked_url) <= 2048))
);
--> statement-breakpoint
ALTER TABLE "habits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "list_members" (
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "share_role" DEFAULT 'view' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_members_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "list_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "personal_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"month_day" text NOT NULL,
	"emoji" text,
	"notify" boolean DEFAULT true NOT NULL,
	"started_on" date,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_events_label_len" CHECK (char_length("personal_events"."label") BETWEEN 1 AND 80),
	CONSTRAINT "personal_events_month_day" CHECK ("personal_events"."month_day" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
	CONSTRAINT "personal_events_emoji_len" CHECK ("personal_events"."emoji" IS NULL OR char_length("personal_events"."emoji") <= 4)
);
--> statement-breakpoint
ALTER TABLE "personal_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color_accent" text DEFAULT 'luminous-amber',
	"emoji" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routine_cheers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"habit_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"target_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routine_cheers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routine_members" (
	"habit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "share_role" NOT NULL,
	"invited_by" uuid,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"paused_until" date,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"total_completions" integer DEFAULT 0 NOT NULL,
	"total_skips" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_members_habit_id_user_id_pk" PRIMARY KEY("habit_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "routine_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "share_invites" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token_hash" text NOT NULL,
	"role" "share_role" DEFAULT 'view' NOT NULL,
	"list_id" uuid,
	"event_id" uuid,
	"routine_id" uuid,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "share_invites_one_target" CHECK (num_nonnulls(list_id, event_id, routine_id) = 1)
);
--> statement-breakpoint
ALTER TABLE "share_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"order_index" double precision NOT NULL,
	"created_by" uuid DEFAULT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subtasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'default',
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_metrics" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reschedule_count" integer DEFAULT 0 NOT NULL,
	"delay_count" integer DEFAULT 0 NOT NULL,
	"created_to_done" integer,
	"first_scheduled" date,
	"completed_at" timestamp with time zone,
	"last_rescheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"heading_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_personal" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reminder_at" timestamp with time zone,
	"reminder_silenced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_personal_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_personal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_sections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"order_index" double precision NOT NULL,
	"created_by" uuid DEFAULT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"task_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"origin" text,
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"section_id" uuid,
	"title" text NOT NULL,
	"content" text,
	"state" "task_state" DEFAULT 'ACTIVE' NOT NULL,
	"order_index" double precision NOT NULL,
	"due_on" date,
	"end_on" date,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"zone" text,
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
	"effort_origin" text,
	"effort_chosen_at" timestamp with time zone,
	"effort_guess" integer,
	"effort_guess_source" text,
	"effort_guess_at" timestamp with time zone,
	"hidden_until" date,
	"linked_app_id" text,
	"linked_url" text,
	"completed_at" timestamp with time zone,
	"taken_by" uuid,
	"taken_at" timestamp with time zone,
	"created_by" uuid DEFAULT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_linked_url_check" CHECK (linked_url IS NULL OR (linked_url LIKE 'https://%' AND length(linked_url) <= 2048)),
	CONSTRAINT "tasks_completed_at_check" CHECK ((state = 'COMPLETE') = (completed_at IS NOT NULL)),
	CONSTRAINT "tasks_effort_check" CHECK (effort IS NULL OR effort BETWEEN 1 AND 3),
	CONSTRAINT "tasks_effort_origin_check" CHECK (effort_origin IS NULL OR (effort IS NOT NULL AND effort_origin IN ('manual', 'accepted'))),
	CONSTRAINT "tasks_effort_guess_check" CHECK (effort_guess IS NULL OR effort_guess BETWEEN 1 AND 3),
	CONSTRAINT "tasks_effort_guess_source_check" CHECK (effort_guess_source IS NULL OR effort_guess_source IN ('model', 'dismissed')),
	CONSTRAINT "tasks_timed_zone_check" CHECK (scheduled_start IS NULL OR zone IS NOT NULL),
	CONSTRAINT "tasks_end_needs_start_check" CHECK (scheduled_start IS NOT NULL OR scheduled_end IS NULL),
	CONSTRAINT "tasks_end_on_check" CHECK (end_on IS NULL OR (due_on IS NOT NULL AND end_on >= due_on)),
	CONSTRAINT "tasks_timed_end_on_check" CHECK (scheduled_start IS NULL OR end_on IS NULL)
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_metrics" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"reschedule_velocity" real DEFAULT 0 NOT NULL,
	"current_burnout_index" integer,
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
	"settings" jsonb DEFAULT '{"tasks":{"defaultDueDate":null,"hideTrash":false,"hideCompleted":false,"quickAdd":{"preset":"planner","style":"label","actions":["date","priority","project"]}},"dateTime":{"weekStart":"Sunday","timezone":"device","timeDisplay":"12h"},"calendar":{"clutter":{"showAllDay":true,"showTimedTasks":true,"showHabitAnchors":true},"holidays":{"enabled":true}},"notifications":{"email":true,"browser":false,"taskReminders":true,"habitReminders":true,"dueDateAlerts":true},"shortcuts":{}}'::jsonb NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"bytes" integer NOT NULL,
	"media_type" text DEFAULT 'image/webp' NOT NULL,
	"pages" integer,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"diagnostics_shared_at" timestamp with time zone,
	CONSTRAINT "ai_images_media_type_check" CHECK ("ai_images"."media_type" in ('image/webp','application/pdf'))
);
--> statement-breakpoint
ALTER TABLE "ai_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_memories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "memory_kind" NOT NULL,
	"content" text NOT NULL,
	"value" jsonb,
	"embedding" halfvec(512),
	"embedding_model" text,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
	"content_hash" text,
	"said_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"valid_through" date,
	"source" "memory_source" NOT NULL,
	"confidence" "memory_confidence" NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" "memory_status" DEFAULT 'active' NOT NULL,
	"forgotten_at" timestamp with time zone,
	"source_conversation_id" uuid,
	"source_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "memory_signal_kind" NOT NULL,
	"on" date NOT NULL,
	"bucket" text NOT NULL,
	"subject" text,
	"minutes" integer,
	"task_id" uuid,
	"habit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_memory_signals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "ai_message_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "ai_message_status" DEFAULT 'complete' NOT NULL,
	"order_index" double precision NOT NULL,
	"search_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "duration_reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"completed_at" timestamp with time zone,
	"habit_id" uuid,
	"target_date" date,
	"wall_time" text,
	"low_minutes" integer NOT NULL,
	"high_minutes" integer NOT NULL,
	"anchored" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"project_id" uuid,
	"group_key" text NOT NULL,
	"said_on" date NOT NULL,
	"forgotten_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duration_reports_task_completed_unique" UNIQUE("task_id","completed_at"),
	CONSTRAINT "duration_reports_low_check" CHECK (low_minutes BETWEEN 1 AND 1440),
	CONSTRAINT "duration_reports_high_check" CHECK (high_minutes BETWEEN low_minutes AND 1440),
	CONSTRAINT "duration_reports_subject_check" CHECK ((task_id IS NOT NULL AND completed_at IS NOT NULL AND habit_id IS NULL AND target_date IS NULL) OR (habit_id IS NOT NULL AND target_date IS NOT NULL AND task_id IS NULL AND completed_at IS NULL))
);
--> statement-breakpoint
ALTER TABLE "duration_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mcp_connections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mcp_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "planning_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"kind" text NOT NULL,
	"project_id" uuid,
	"chosen" text,
	"feasible" text[],
	"suggested" boolean NOT NULL,
	"outcome" text NOT NULL,
	"fingerprint" text,
	"said_on" date NOT NULL,
	"forgotten_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_records_kind_check" CHECK (kind IN ('slot', 'steps', 'later')),
	CONSTRAINT "planning_records_outcome_check" CHECK (outcome IN ('chosen', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "planning_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"bytes" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "data_exports_status_check" CHECK (status IN ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "data_exports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"install_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"endpoint" text,
	"p256dh" text,
	"auth" text,
	"last_seen_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mutation_dedup" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_mutation_id" text NOT NULL,
	"result_id" uuid,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mutation_dedup" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_state" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
CREATE TABLE "push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"occurrence_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_focus_views" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"source" "focus_view_source" DEFAULT 'preset' NOT NULL,
	"order_index" double precision DEFAULT 0 NOT NULL,
	"preset_key" text,
	"icon" text,
	"color" text,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_focus_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_nlp_metadata" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"parser_version" text DEFAULT '2.0.0' NOT NULL,
	"source_surface" "source_surface" DEFAULT 'quick_add' NOT NULL,
	"raw_input" text NOT NULL,
	"cleaned_title" text NOT NULL,
	"parse_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_tier" "confidence_tier" DEFAULT 'medium' NOT NULL,
	"resolved_due_date" date,
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
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"event" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_event_id_personal_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."personal_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_id_projects_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_events" ADD CONSTRAINT "personal_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_cheers" ADD CONSTRAINT "routine_cheers_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_cheers" ADD CONSTRAINT "routine_cheers_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_cheers" ADD CONSTRAINT "routine_cheers_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_members" ADD CONSTRAINT "routine_members_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_members" ADD CONSTRAINT "routine_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_members" ADD CONSTRAINT "routine_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_invites" ADD CONSTRAINT "share_invites_list_id_projects_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_invites" ADD CONSTRAINT "share_invites_event_id_personal_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."personal_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_invites" ADD CONSTRAINT "share_invites_routine_id_habits_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_invites" ADD CONSTRAINT "share_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_metrics" ADD CONSTRAINT "task_metrics_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_metrics" ADD CONSTRAINT "task_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_personal" ADD CONSTRAINT "task_personal_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_personal" ADD CONSTRAINT "task_personal_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sections" ADD CONSTRAINT "task_sections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sections" ADD CONSTRAINT "task_sections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sections" ADD CONSTRAINT "task_sections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_section_id_task_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."task_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_taken_by_users_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_metrics" ADD CONSTRAINT "user_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_images" ADD CONSTRAINT "ai_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_source_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_notes" ADD CONSTRAINT "ai_memory_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_notes" ADD CONSTRAINT "ai_memory_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_signals" ADD CONSTRAINT "ai_memory_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_signals" ADD CONSTRAINT "ai_memory_signals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_signals" ADD CONSTRAINT "ai_memory_signals_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duration_reports" ADD CONSTRAINT "duration_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duration_reports" ADD CONSTRAINT "duration_reports_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duration_reports" ADD CONSTRAINT "duration_reports_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_records" ADD CONSTRAINT "planning_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_records" ADD CONSTRAINT "planning_records_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutation_dedup" ADD CONSTRAINT "mutation_dedup_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_state" ADD CONSTRAINT "notification_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_focus_views" ADD CONSTRAINT "saved_focus_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD CONSTRAINT "task_nlp_metadata_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD CONSTRAINT "task_nlp_metadata_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_members_user_id_idx" ON "event_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_logs_habit_user_date_unique" ON "habit_logs" USING btree ("habit_id","user_id","target_date");--> statement-breakpoint
CREATE INDEX "habit_logs_user_id_idx" ON "habit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_tags_unique_pair" ON "habit_tags" USING btree ("habit_id","tag_id");--> statement-breakpoint
CREATE INDEX "habit_tags_tag_id_idx" ON "habit_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "habit_tags_user_id_idx" ON "habit_tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "habits_user_id_idx" ON "habits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "habits_project_id_idx" ON "habits" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "inbox_items_user_id_idx" ON "inbox_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inbox_items_section_id_idx" ON "inbox_items" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "inbox_items_placed_task_id_idx" ON "inbox_items" USING btree ("placed_task_id") WHERE "inbox_items"."placed_task_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "inbox_sections_user_id_idx" ON "inbox_sections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "list_members_user_id_idx" ON "list_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "personal_events_user_id_idx" ON "personal_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_cheers_once" ON "routine_cheers" USING btree ("habit_id","from_user_id","to_user_id","target_date");--> statement-breakpoint
CREATE INDEX "routine_cheers_to_user_id_idx" ON "routine_cheers" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "routine_members_user_id_idx" ON "routine_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_invites_list_id_idx" ON "share_invites" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "share_invites_event_id_idx" ON "share_invites" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "share_invites_routine_id_idx" ON "share_invites" USING btree ("routine_id");--> statement-breakpoint
CREATE INDEX "subtasks_task_id_idx" ON "subtasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "subtasks_user_id_idx" ON "subtasks" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_unique" ON "tags" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "task_metrics_user_id_idx" ON "task_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_metrics_task_id_unique" ON "task_metrics" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_notes_task_id_idx" ON "task_notes" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_notes_user_id_idx" ON "task_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_personal_user_id_idx" ON "task_personal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_sections_user_id_idx" ON "task_sections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_sections_project_id_idx" ON "task_sections" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_tags_unique_pair" ON "task_tags" USING btree ("task_id","tag_id");--> statement-breakpoint
CREATE INDEX "task_tags_tag_id_idx" ON "task_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tasks_user_list_idx" ON "tasks" USING btree ("user_id","state","is_pinned" DESC NULLS FIRST,"order_index");--> statement-breakpoint
CREATE INDEX "tasks_user_updated_idx" ON "tasks" USING btree ("user_id","state","updated_at","id");--> statement-breakpoint
CREATE INDEX "tasks_user_due_idx" ON "tasks" USING btree ("user_id","due_on");--> statement-breakpoint
CREATE INDEX "tasks_user_start_idx" ON "tasks" USING btree ("user_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "tasks_user_series_idx" ON "tasks" USING btree ("user_id") WHERE "tasks"."recurrence_rule" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_overdue_idx" ON "tasks" USING btree ("due_on") WHERE "tasks"."state" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "tasks_project_id_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_section_id_idx" ON "tasks" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "tasks_user_effort_idx" ON "tasks" USING btree ("user_id","effort_chosen_at" DESC NULLS LAST) WHERE "tasks"."effort_origin" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_metrics_user_id_unique" ON "user_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_recent_idx" ON "ai_conversations" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_images_user_convo_hash_unique" ON "ai_images" USING btree ("user_id","conversation_id","content_hash");--> statement-breakpoint
CREATE INDEX "ai_memories_user_status_idx" ON "ai_memories" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_memories_user_hash_unique" ON "ai_memories" USING btree ("user_id","content_hash") WHERE "ai_memories"."status" = 'active';--> statement-breakpoint
CREATE INDEX "ai_memories_source_conversation_id_idx" ON "ai_memories" USING btree ("source_conversation_id") WHERE "ai_memories"."source_conversation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_memory_signals_user_kind_idx" ON "ai_memory_signals" USING btree ("user_id","kind","on");--> statement-breakpoint
CREATE INDEX "ai_messages_convo_order_idx" ON "ai_messages" USING btree ("conversation_id","order_index");--> statement-breakpoint
CREATE INDEX "ai_messages_user_id_idx" ON "ai_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_messages_search_idx" ON "ai_messages" USING gin (to_tsvector('english', coalesce("search_text", '')));--> statement-breakpoint
CREATE UNIQUE INDEX "duration_reports_habit_occurrence_unique" ON "duration_reports" USING btree ("habit_id","target_date",coalesce("wall_time", ''));--> statement-breakpoint
CREATE INDEX "duration_reports_user_said_idx" ON "duration_reports" USING btree ("user_id","said_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "duration_reports_user_group_idx" ON "duration_reports" USING btree ("user_id","group_key");--> statement-breakpoint
CREATE INDEX "mcp_connections_user_id_idx" ON "mcp_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "planning_records_user_kind_idx" ON "planning_records" USING btree ("user_id","kind","said_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "planning_records_task_idx" ON "planning_records" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "data_exports_user_requested_idx" ON "data_exports" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_install_unique" ON "devices" USING btree ("user_id","install_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_endpoint_unique" ON "devices" USING btree ("endpoint") WHERE "devices"."endpoint" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mutation_dedup_user_mutation_idx" ON "mutation_dedup" USING btree ("user_id","client_mutation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_state_user_object_trigger_unique" ON "notification_state" USING btree ("user_id","object_id","trigger_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_deliveries_device_occurrence_unique" ON "push_deliveries" USING btree ("device_id","occurrence_key");--> statement-breakpoint
CREATE INDEX "push_deliveries_user_created_idx" ON "push_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "saved_focus_views_user_id_idx" ON "saved_focus_views" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_focus_views_user_preset_key_idx" ON "saved_focus_views" USING btree ("user_id","preset_key");--> statement-breakpoint
CREATE UNIQUE INDEX "task_nlp_metadata_task_id_unique" ON "task_nlp_metadata" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_nlp_metadata_user_id_idx" ON "task_nlp_metadata" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_events_user_created_idx" ON "usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE FUNCTION cadence_event_invite_preview(p_token_hash text)
 RETURNS TABLE(event_id uuid, label text, emoji text, month_day text, started_on date, color text, owner_id uuid, owner_name text, owner_image text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT e.id, e.label, e.emoji, e.month_day, e.started_on, e.color, e.user_id, u.name, u.image
    FROM share_invites i
    JOIN personal_events e ON e.id = i.event_id
    LEFT JOIN neon_auth."user" u ON u.id = e.user_id
    WHERE i.token_hash = p_token_hash AND i.expires_at > now()
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_event_join_counts(p_event uuid)
 RETURNS TABLE(people bigint, joined bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT (SELECT count(*) FROM event_members WHERE event_id = p_event),
           (SELECT count(*) FROM event_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_event_owner_names(p_events uuid[])
 RETURNS TABLE(event_id uuid, owner_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT e.id, u.name
    FROM personal_events e
    JOIN event_members m ON m.event_id = e.id
    LEFT JOIN neon_auth."user" u ON u.id = e.user_id
    WHERE e.id = ANY(p_events)
      AND m.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_event_people(p_event uuid)
 RETURNS TABLE(user_id uuid, name text, image text, pronouns text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT e.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', 'owner'
    FROM personal_events e
    LEFT JOIN neon_auth."user" u ON u.id = e.user_id
    LEFT JOIN users cu ON cu.id = e.user_id
    WHERE e.id = p_event
      AND (e.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM event_members g WHERE g.event_id = e.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
    UNION ALL
    SELECT m.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', m.role::text
    FROM event_members m
    JOIN personal_events e ON e.id = m.event_id
    LEFT JOIN neon_auth."user" u ON u.id = m.user_id
    LEFT JOIN users cu ON cu.id = m.user_id
    WHERE m.event_id = p_event
      AND (e.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM event_members g WHERE g.event_id = e.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_invite_preview(p_token_hash text)
 RETURNS TABLE(list_id uuid, name text, emoji text, color_accent text, owner_id uuid, owner_name text, owner_image text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT p.id, p.name, p.emoji, p.color_accent, p.user_id, u.name, u.image
    FROM share_invites i
    JOIN projects p ON p.id = i.list_id
    LEFT JOIN neon_auth."user" u ON u.id = p.user_id
    WHERE i.token_hash = p_token_hash AND i.expires_at > now()
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_join_counts(p_list uuid)
 RETURNS TABLE(people bigint, joined bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT (SELECT count(*) FROM list_members WHERE list_id = p_list),
           (SELECT count(*) FROM list_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_join_event(p_token_hash text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH inv AS (
        SELECT i.event_id, i.role, i.created_by, e.user_id AS owner_id
        FROM share_invites i JOIN personal_events e ON e.id = i.event_id
        WHERE i.token_hash = p_token_hash AND i.expires_at > now()
    ), ins AS (
        INSERT INTO event_members (event_id, user_id, role, invited_by)
        SELECT event_id, (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid, role, created_by FROM inv
        WHERE owner_id <> (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        ON CONFLICT DO NOTHING
    )
    SELECT event_id FROM inv
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_join_list(p_token_hash text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH inv AS (
        SELECT i.list_id, i.role, i.created_by, p.user_id AS owner_id
        FROM share_invites i JOIN projects p ON p.id = i.list_id
        WHERE i.token_hash = p_token_hash AND i.expires_at > now()
    ), ins AS (
        INSERT INTO list_members (list_id, user_id, role, invited_by)
        SELECT list_id, (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid, role, created_by FROM inv
        WHERE owner_id <> (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        ON CONFLICT DO NOTHING
    )
    SELECT list_id FROM inv
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_join_routine(p_token_hash text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH inv AS (
        SELECT i.routine_id, i.role, i.created_by, h.user_id AS owner_id
        FROM share_invites i JOIN habits h ON h.id = i.routine_id
        WHERE i.token_hash = p_token_hash AND i.expires_at > now()
    ), ins AS (
        INSERT INTO routine_members (habit_id, user_id, role, invited_by)
        SELECT routine_id, (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid, role, created_by FROM inv
        WHERE owner_id <> (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        ON CONFLICT DO NOTHING
    )
    SELECT routine_id FROM inv
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_keep_owner()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.user_id := OLD.user_id;
    RETURN NEW;
END
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_list_people(p_list uuid)
 RETURNS TABLE(user_id uuid, name text, image text, pronouns text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT p.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', 'owner'
    FROM projects p
    LEFT JOIN neon_auth."user" u ON u.id = p.user_id
    LEFT JOIN users cu ON cu.id = p.user_id
    WHERE p.id = p_list
      AND (p.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM list_members g WHERE g.list_id = p.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
    UNION ALL
    SELECT m.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', m.role::text
    FROM list_members m
    JOIN projects p ON p.id = m.list_id
    LEFT JOIN neon_auth."user" u ON u.id = m.user_id
    LEFT JOIN users cu ON cu.id = m.user_id
    WHERE m.list_id = p_list
      AND (p.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM list_members g WHERE g.list_id = p.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_member_events(min_role share_role)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT event_id FROM event_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid AND role >= min_role
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_member_lists(min_role share_role)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT list_id FROM list_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid AND role >= min_role
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_member_routines(min_role share_role)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT habit_id FROM routine_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid AND role >= min_role
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_move_routine_time_marks(p_habit uuid, p_old text, p_new text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    UPDATE habit_logs
    SET time_marks = (time_marks - p_old) || jsonb_build_object(p_new, time_marks -> p_old)
    WHERE habit_id = p_habit
      AND jsonb_exists(time_marks, p_old)
      AND (
          EXISTS (
              SELECT 1 FROM habits h
              WHERE h.id = p_habit
                AND h.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
          )
          OR EXISTS (
              SELECT 1 FROM routine_members m
              WHERE m.habit_id = p_habit
                AND m.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
                AND m.role = 'edit'
          )
      )
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_move_task_to_list(p_task uuid, p_to_list uuid, p_to_section uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller uuid := (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    v_to_owner uuid;
BEGIN
    IF v_caller IS NULL OR p_task IS NULL OR p_to_list IS NULL THEN
        RETURN false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tasks WHERE id = p_task AND user_id = v_caller) THEN
        RETURN false;
    END IF;

    SELECT user_id INTO v_to_owner FROM projects WHERE id = p_to_list;
    IF v_to_owner IS NULL THEN
        RETURN false;
    END IF;

    IF v_to_owner <> v_caller AND NOT EXISTS (
        SELECT 1 FROM list_members WHERE list_id = p_to_list AND user_id = v_caller AND role = 'edit'
    ) THEN
        RETURN false;
    END IF;

    IF p_to_section IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM task_sections WHERE id = p_to_section AND project_id = p_to_list
    ) THEN
        RETURN false;
    END IF;

    IF v_to_owner <> v_caller THEN
        -- 1. Preserve caller's personal reminder in task_personal, then clear the owner reminder on tasks.
        INSERT INTO task_personal (task_id, user_id, reminder_at, reminder_silenced)
        SELECT id, v_caller, reminder_at, reminder_silenced
        FROM tasks
        WHERE id = p_task AND reminder_at IS NOT NULL
        ON CONFLICT (task_id, user_id) DO UPDATE
        SET reminder_at = EXCLUDED.reminder_at,
            reminder_silenced = EXCLUDED.reminder_silenced;

        -- 2. Re-own the task, its subtasks, and its note to the destination list owner.
        UPDATE tasks
        SET user_id = v_to_owner,
            project_id = p_to_list,
            section_id = p_to_section,
            reminder_at = NULL,
            reminder_silenced = false,
            taken_by = NULL,
            taken_at = NULL,
            created_by = COALESCE(created_by, v_caller),
            updated_by = v_caller,
            updated_at = NOW()
        WHERE id = p_task;

        UPDATE subtasks SET user_id = v_to_owner WHERE task_id = p_task;
        UPDATE task_notes SET user_id = v_to_owner WHERE task_id = p_task;
    ELSE
        UPDATE tasks
        SET project_id = p_to_list,
            section_id = p_to_section,
            updated_by = v_caller,
            updated_at = NOW()
        WHERE id = p_task;
    END IF;

    -- 3. Drop caller's personal learning rows about this task.
    DELETE FROM task_metrics WHERE user_id = v_caller AND task_id = p_task;
    DELETE FROM task_nlp_metadata WHERE user_id = v_caller AND task_id = p_task;
    DELETE FROM ai_memory_notes WHERE user_id = v_caller AND task_id = p_task;

    RETURN true;
END
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_routine_invite_preview(p_token_hash text)
 RETURNS TABLE(routine_id uuid, title text, emoji text, color_accent text, recurrence_rule text, target_time text, times jsonb, link_role text, share_mode text, owner_id uuid, owner_name text, owner_image text, people jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT h.id, h.title, h.emoji, h.color_accent, h.recurrence_rule, h.target_time, h.times,
           i.role::text, h.share_mode::text, h.user_id, u.name, u.image,
           coalesce(
               (SELECT jsonb_agg(jsonb_build_object('name', u2.name, 'image', u2.image) ORDER BY m.joined_at)
                FROM routine_members m
                LEFT JOIN neon_auth."user" u2 ON u2.id = m.user_id
                WHERE m.habit_id = h.id AND m.role = 'edit'),
               '[]'::jsonb
           )
    FROM share_invites i
    JOIN habits h ON h.id = i.routine_id
    LEFT JOIN neon_auth."user" u ON u.id = h.user_id
    WHERE i.token_hash = p_token_hash AND i.expires_at > now()
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_routine_join_counts(p_habit uuid)
 RETURNS TABLE(people bigint, joined bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT (SELECT count(*) FROM routine_members WHERE habit_id = p_habit),
           (SELECT count(*) FROM routine_members WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_routine_people(p_habit uuid)
 RETURNS TABLE(user_id uuid, name text, image text, pronouns text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT h.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', 'owner'
    FROM habits h
    LEFT JOIN neon_auth."user" u ON u.id = h.user_id
    LEFT JOIN users cu ON cu.id = h.user_id
    WHERE h.id = p_habit
      AND (h.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM routine_members g WHERE g.habit_id = h.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
    UNION ALL
    SELECT m.user_id, u.name, u.image, cu.settings -> 'profile' ->> 'pronouns', m.role::text
    FROM (
        SELECT * FROM routine_members WHERE habit_id = p_habit ORDER BY joined_at ASC
    ) m
    JOIN habits h ON h.id = m.habit_id
    LEFT JOIN neon_auth."user" u ON u.id = m.user_id
    LEFT JOIN users cu ON cu.id = m.user_id
    WHERE (h.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid OR EXISTS (SELECT 1 FROM routine_members g WHERE g.habit_id = h.id AND g.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid))
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_routine_person_names(p_users uuid[])
 RETURNS TABLE(user_id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT u.id, u.name
    FROM neon_auth."user" u
    WHERE u.id = ANY(p_users)
      AND (
          EXISTS (
              SELECT 1 FROM habits h
              JOIN routine_members rm ON rm.habit_id = h.id
              WHERE (h.user_id = u.id AND rm.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
                 OR (h.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid AND rm.user_id = u.id)
          )
          OR EXISTS (
              SELECT 1 FROM routine_members m1
              JOIN routine_members m2 ON m1.habit_id = m2.habit_id
              WHERE m1.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
                AND m2.user_id = u.id
          )
      )
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_set_event_notify(p_event uuid, p_notify boolean)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH upd AS (
        UPDATE event_members SET notify = p_notify
        WHERE event_id = p_event
          AND user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd)
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_set_routine_member_prefs(p_habit uuid, p_set_reminder boolean, p_reminder boolean, p_set_sort boolean, p_sort double precision, p_set_paused boolean, p_paused date)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH upd AS (
        UPDATE routine_members
        SET reminder_enabled = CASE WHEN p_set_reminder THEN p_reminder ELSE reminder_enabled END,
            sort_order = CASE WHEN p_set_sort THEN p_sort ELSE sort_order END,
            paused_until = CASE WHEN p_set_paused THEN p_paused ELSE paused_until END
        WHERE habit_id = p_habit
          AND user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd)
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_set_routine_member_stats(p_habit uuid, p_current_streak integer, p_longest_streak integer, p_total_completions integer, p_total_skips integer)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH upd AS (
        UPDATE routine_members
        SET current_streak = p_current_streak,
            longest_streak = p_longest_streak,
            total_completions = p_total_completions,
            total_skips = p_total_skips
        WHERE habit_id = p_habit
          AND user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd)
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_set_updated_by()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_by := (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    RETURN NEW;
END
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_sync_routine_log_status(p_log_id uuid, p_status habit_status, p_completed_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH upd AS (
        UPDATE habit_logs l
        SET status = p_status, completed_at = p_completed_at
        WHERE l.id = p_log_id
          AND (
              l.habit_id IN (SELECT id FROM habits WHERE user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
              OR EXISTS (
                  SELECT 1 FROM routine_members m
                  WHERE m.habit_id = l.habit_id
                    AND m.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
                    AND m.role = 'edit'
              )
          )
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd)
$function$;
--> statement-breakpoint
CREATE FUNCTION cadence_transfer_list(p_list uuid, p_to_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller uuid := (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
BEGIN
    IF v_caller IS NULL OR p_to_user IS NULL OR v_caller = p_to_user THEN
        RETURN false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_list AND user_id = v_caller) THEN
        RETURN false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM list_members WHERE list_id = p_list AND user_id = p_to_user) THEN
        RETURN false;
    END IF;

    -- 1. Move old owner's reminders into task_personal and clear tasks.reminder_at.
    INSERT INTO task_personal (task_id, user_id, reminder_at, reminder_silenced)
    SELECT id, v_caller, reminder_at, reminder_silenced
    FROM tasks
    WHERE project_id = p_list AND reminder_at IS NOT NULL
    ON CONFLICT (task_id, user_id) DO UPDATE
    SET reminder_at = EXCLUDED.reminder_at,
        reminder_silenced = EXCLUDED.reminder_silenced;

    UPDATE tasks
    SET reminder_at = NULL, reminder_silenced = false
    WHERE project_id = p_list;

    -- 2. Promote new owner's task_personal reminders onto tasks, then delete those personal rows.
    UPDATE tasks t
    SET reminder_at = tp.reminder_at,
        reminder_silenced = tp.reminder_silenced
    FROM task_personal tp
    WHERE tp.task_id = t.id
      AND tp.user_id = p_to_user
      AND t.project_id = p_list;

    DELETE FROM task_personal
    WHERE user_id = p_to_user
      AND task_id IN (SELECT id FROM tasks WHERE project_id = p_list);

    -- 3. Re-own the list and all its rows.
    UPDATE projects SET user_id = p_to_user WHERE id = p_list;
    UPDATE task_sections SET user_id = p_to_user WHERE project_id = p_list;
    UPDATE tasks SET user_id = p_to_user WHERE project_id = p_list;
    UPDATE subtasks SET user_id = p_to_user WHERE task_id IN (SELECT id FROM tasks WHERE project_id = p_list);
    UPDATE task_notes SET user_id = p_to_user WHERE task_id IN (SELECT id FROM tasks WHERE project_id = p_list);

    -- 4. Drop old owner's personal learning rows about these tasks.
    DELETE FROM task_metrics
    WHERE user_id = v_caller
      AND task_id IN (SELECT id FROM tasks WHERE project_id = p_list);

    DELETE FROM task_nlp_metadata
    WHERE user_id = v_caller
      AND task_id IN (SELECT id FROM tasks WHERE project_id = p_list);

    DELETE FROM ai_memory_notes
    WHERE user_id = v_caller
      AND task_id IN (SELECT id FROM tasks WHERE project_id = p_list);

    -- 5. Swap membership: new owner leaves list_members; old owner becomes editor.
    DELETE FROM list_members WHERE list_id = p_list AND user_id = p_to_user;
    INSERT INTO list_members (list_id, user_id, role, invited_by)
    VALUES (p_list, v_caller, 'edit', p_to_user);

    -- 6. Revoke existing invite links minted by the old owner.
    DELETE FROM share_invites WHERE list_id = p_list;

    RETURN true;
END
$function$;
--> statement-breakpoint
CREATE FUNCTION cron_user_ids(at timestamp with time zone, local_hour integer)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT id FROM users WHERE local_hour IS NULL OR extract(hour from timezone(time_zone, at)) = local_hour
$function$;
--> statement-breakpoint
CREATE FUNCTION memory_user_ids(at timestamp with time zone)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT u.id FROM users u
    WHERE EXISTS (
            SELECT 1 FROM ai_memories m
            WHERE m.user_id = u.id AND m.status = 'forgotten' AND m.forgotten_at <= at - interval '10 minutes'
              AND m.value ->> 'scrubbed' IS DISTINCT FROM 'true')
       OR (COALESCE(u.settings -> 'assistant' ->> 'memoryMode', 'basic') IN ('basic', 'full') AND EXISTS (
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
$function$;
--> statement-breakpoint
CREATE FUNCTION push_release_endpoint(ep text, keep uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DELETE FROM devices WHERE endpoint = ep AND user_id <> keep RETURNING user_id
$function$;
--> statement-breakpoint
CREATE FUNCTION push_user_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT DISTINCT user_id FROM devices
$function$;
--> statement-breakpoint
CREATE FUNCTION tasks_set_completed_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.state = 'COMPLETE' THEN
        NEW.completed_at := CASE WHEN TG_OP = 'UPDATE' AND OLD.state = 'COMPLETE' THEN OLD.completed_at ELSE date_trunc('milliseconds', now()) END;
    ELSE
        IF TG_OP = 'UPDATE' AND OLD.state = 'COMPLETE' THEN
            DELETE FROM duration_reports WHERE task_id = OLD.id AND completed_at = OLD.completed_at;
        END IF;
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END $function$;
--> statement-breakpoint
CREATE TRIGGER habits_keep_owner BEFORE UPDATE ON habits FOR EACH ROW EXECUTE FUNCTION cadence_keep_owner();
--> statement-breakpoint
CREATE TRIGGER personal_events_keep_owner BEFORE UPDATE ON personal_events FOR EACH ROW EXECUTE FUNCTION cadence_keep_owner();
--> statement-breakpoint
CREATE TRIGGER task_notes_set_updated_by BEFORE UPDATE ON task_notes FOR EACH ROW EXECUTE FUNCTION cadence_set_updated_by();
--> statement-breakpoint
CREATE TRIGGER tasks_completed_at BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION tasks_set_completed_at();
--> statement-breakpoint
CREATE TRIGGER tasks_set_updated_by BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION cadence_set_updated_by();
--> statement-breakpoint
CREATE POLICY "event_members_read" ON "event_members" AS PERMISSIVE FOR SELECT TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR event_id IN (select cadence_member_events('view'::share_role))));--> statement-breakpoint
CREATE POLICY "event_members_owner_update" ON "event_members" AS PERMISSIVE FOR UPDATE TO public USING (event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK (event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "event_members_delete" ON "event_members" AS PERMISSIVE FOR DELETE TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));--> statement-breakpoint
CREATE POLICY "habit_logs_owner_access" ON "habit_logs" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "habit_logs_member_read" ON "habit_logs" AS PERMISSIVE FOR SELECT TO public USING ((habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR habit_id IN (select cadence_member_routines('view'::share_role))));--> statement-breakpoint
CREATE POLICY "habit_logs_owner_delete" ON "habit_logs" AS PERMISSIVE FOR DELETE TO public USING (habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "habit_logs_routine_write_insert" ON "habit_logs" AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR habit_id IN (select cadence_member_routines('edit'::share_role))));--> statement-breakpoint
CREATE POLICY "habit_logs_routine_write_update" ON "habit_logs" AS RESTRICTIVE FOR UPDATE TO public USING (true) WITH CHECK ((habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR habit_id IN (select cadence_member_routines('edit'::share_role))));--> statement-breakpoint
CREATE POLICY "habit_tags_owner_access" ON "habit_tags" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "habits_owner_access" ON "habits" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "habits_member_read" ON "habits" AS PERMISSIVE FOR SELECT TO public USING (id IN (select cadence_member_routines('view'::share_role)));--> statement-breakpoint
CREATE POLICY "habits_member_update" ON "habits" AS PERMISSIVE FOR UPDATE TO public USING (id IN (select cadence_member_routines('edit'::share_role))) WITH CHECK (id IN (select cadence_member_routines('edit'::share_role)));--> statement-breakpoint
CREATE POLICY "inbox_items_owner_access" ON "inbox_items" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "inbox_sections_owner_access" ON "inbox_sections" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "list_members_read" ON "list_members" AS PERMISSIVE FOR SELECT TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR list_id IN (select cadence_member_lists('view'::share_role))));--> statement-breakpoint
CREATE POLICY "list_members_owner_update" ON "list_members" AS PERMISSIVE FOR UPDATE TO public USING (list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK (list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "list_members_delete" ON "list_members" AS PERMISSIVE FOR DELETE TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));--> statement-breakpoint
CREATE POLICY "personal_events_owner_access" ON "personal_events" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "personal_events_member_read" ON "personal_events" AS PERMISSIVE FOR SELECT TO public USING (id IN (select cadence_member_events('view'::share_role)));--> statement-breakpoint
CREATE POLICY "personal_events_member_update" ON "personal_events" AS PERMISSIVE FOR UPDATE TO public USING (id IN (select cadence_member_events('edit'::share_role))) WITH CHECK (id IN (select cadence_member_events('edit'::share_role)));--> statement-breakpoint
CREATE POLICY "projects_owner_access" ON "projects" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "projects_member_read" ON "projects" AS PERMISSIVE FOR SELECT TO public USING (id IN (select cadence_member_lists('view'::share_role)));--> statement-breakpoint
CREATE POLICY "routine_cheers_read" ON "routine_cheers" AS PERMISSIVE FOR SELECT TO public USING ((from_user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR to_user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "routine_cheers_insert" ON "routine_cheers" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((from_user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) AND habit_id IN (SELECT id FROM habits)));--> statement-breakpoint
CREATE POLICY "routine_members_read" ON "routine_members" AS PERMISSIVE FOR SELECT TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR habit_id IN (select cadence_member_routines('view'::share_role))));--> statement-breakpoint
CREATE POLICY "routine_members_owner_update" ON "routine_members" AS PERMISSIVE FOR UPDATE TO public USING (habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK (habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "routine_members_delete" ON "routine_members" AS PERMISSIVE FOR DELETE TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) OR habit_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));--> statement-breakpoint
CREATE POLICY "share_invites_owner_access" ON "share_invites" AS PERMISSIVE FOR ALL TO public USING ((list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR routine_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)))) WITH CHECK ((list_id IN (SELECT id FROM projects WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR event_id IN (SELECT id FROM personal_events WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) OR routine_id IN (SELECT id FROM habits WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));--> statement-breakpoint
CREATE POLICY "subtasks_owner_access" ON "subtasks" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "subtasks_same_owner_insert" ON "subtasks" AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "subtasks_same_owner_update" ON "subtasks" AS RESTRICTIVE FOR UPDATE TO public USING (true) WITH CHECK ((user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "subtasks_member_read" ON "subtasks" AS PERMISSIVE FOR SELECT TO public USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('view'::share_role))));--> statement-breakpoint
CREATE POLICY "subtasks_member_insert" ON "subtasks" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role))) AND user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "subtasks_member_update" ON "subtasks" AS PERMISSIVE FOR UPDATE TO public USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role)))) WITH CHECK ((task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role))) AND user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "subtasks_member_delete" ON "subtasks" AS PERMISSIVE FOR DELETE TO public USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role))));--> statement-breakpoint
CREATE POLICY "tags_owner_access" ON "tags" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_metrics_owner_access" ON "task_metrics" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_notes_owner_access" ON "task_notes" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_notes_same_owner_insert" ON "task_notes" AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "task_notes_same_owner_update" ON "task_notes" AS RESTRICTIVE FOR UPDATE TO public USING (true) WITH CHECK ((user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "task_notes_member_read" ON "task_notes" AS PERMISSIVE FOR SELECT TO public USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('view'::share_role))));--> statement-breakpoint
CREATE POLICY "task_notes_member_insert" ON "task_notes" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role))) AND user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "task_notes_member_update" ON "task_notes" AS PERMISSIVE FOR UPDATE TO public USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role)))) WITH CHECK ((task_id IN (SELECT id FROM tasks WHERE project_id IN (select cadence_member_lists('edit'::share_role))) AND user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id)));--> statement-breakpoint
CREATE POLICY "task_personal_access" ON "task_personal" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) AND task_id IN (SELECT id FROM tasks))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid) AND task_id IN (SELECT id FROM tasks)));--> statement-breakpoint
CREATE POLICY "task_sections_owner_access" ON "task_sections" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_sections_same_owner_insert" ON "task_sections" AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((project_id IS NULL OR user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "task_sections_same_owner_update" ON "task_sections" AS RESTRICTIVE FOR UPDATE TO public USING (true) WITH CHECK ((project_id IS NULL OR user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "task_sections_member_read" ON "task_sections" AS PERMISSIVE FOR SELECT TO public USING (project_id IN (select cadence_member_lists('view'::share_role)));--> statement-breakpoint
CREATE POLICY "task_sections_member_insert" ON "task_sections" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((project_id IN (select cadence_member_lists('edit'::share_role)) AND user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "task_sections_member_update" ON "task_sections" AS PERMISSIVE FOR UPDATE TO public USING (project_id IN (select cadence_member_lists('edit'::share_role))) WITH CHECK ((project_id IN (select cadence_member_lists('edit'::share_role)) AND user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "task_tags_owner_access" ON "task_tags" AS PERMISSIVE FOR ALL TO public USING ((EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) AND tag_id IN (SELECT id FROM tags WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)))) WITH CHECK ((EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) AND tag_id IN (SELECT id FROM tags WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))));--> statement-breakpoint
CREATE POLICY "task_tags_member_access" ON "task_tags" AS PERMISSIVE FOR ALL TO public USING ((tag_id IN (SELECT id FROM tags WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) AND task_id IN (SELECT id FROM tasks))) WITH CHECK ((tag_id IN (SELECT id FROM tags WHERE user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) AND task_id IN (SELECT id FROM tasks)));--> statement-breakpoint
CREATE POLICY "tasks_owner_access" ON "tasks" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "tasks_same_owner_insert" ON "tasks" AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((project_id IS NULL OR user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "tasks_same_owner_update" ON "tasks" AS RESTRICTIVE FOR UPDATE TO public USING (true) WITH CHECK ((project_id IS NULL OR user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "tasks_member_read" ON "tasks" AS PERMISSIVE FOR SELECT TO public USING (project_id IN (select cadence_member_lists('view'::share_role)));--> statement-breakpoint
CREATE POLICY "tasks_member_insert" ON "tasks" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((project_id IN (select cadence_member_lists('edit'::share_role)) AND user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "tasks_member_update" ON "tasks" AS PERMISSIVE FOR UPDATE TO public USING (project_id IN (select cadence_member_lists('edit'::share_role))) WITH CHECK ((project_id IN (select cadence_member_lists('edit'::share_role)) AND user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id)));--> statement-breakpoint
CREATE POLICY "user_metrics_owner_access" ON "user_metrics" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "users_owner_access" ON "users" AS PERMISSIVE FOR ALL TO public USING ((id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "ai_conversations_owner_access" ON "ai_conversations" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "ai_images_owner_access" ON "ai_images" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "ai_memories_owner_access" ON "ai_memories" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "ai_memory_notes_owner_access" ON "ai_memory_notes" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "ai_memory_signals_owner_access" ON "ai_memory_signals" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "ai_messages_owner_access" ON "ai_messages" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "duration_reports_owner_access" ON "duration_reports" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "mcp_connections_owner_access" ON "mcp_connections" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "planning_records_owner_access" ON "planning_records" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "data_exports_owner_access" ON "data_exports" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "devices_owner_access" ON "devices" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "mutation_dedup_owner_access" ON "mutation_dedup" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "notification_state_owner_access" ON "notification_state" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "push_deliveries_owner_access" ON "push_deliveries" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "saved_focus_views_owner_access" ON "saved_focus_views" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "task_nlp_metadata_owner_access" ON "task_nlp_metadata" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));--> statement-breakpoint
CREATE POLICY "usage_events_owner_access" ON "usage_events" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid))) WITH CHECK ((user_id = (select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO api_worker;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO api_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_event_invite_preview"(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_event_invite_preview"(text) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_event_join_counts"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_event_join_counts"(uuid) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_event_owner_names"(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_event_owner_names"(uuid[]) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_event_people"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_event_people"(uuid) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_invite_preview"(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_invite_preview"(text) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_join_counts"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_join_counts"(uuid) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_join_event"(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_join_event"(text) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_join_list"(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_join_list"(text) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_join_routine"(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_join_routine"(text) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_list_people"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_list_people"(uuid) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_member_events"(share_role) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_member_events"(share_role) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_member_lists"(share_role) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_member_lists"(share_role) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_member_routines"(share_role) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_member_routines"(share_role) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_move_routine_time_marks"(uuid,text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_move_routine_time_marks"(uuid,text,text) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_move_task_to_list"(uuid,uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_move_task_to_list"(uuid,uuid,uuid) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_routine_invite_preview"(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_routine_invite_preview"(text) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_routine_join_counts"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_routine_join_counts"(uuid) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_routine_people"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_routine_people"(uuid) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_routine_person_names"(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_routine_person_names"(uuid[]) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_set_event_notify"(uuid,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_set_event_notify"(uuid,boolean) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_set_routine_member_prefs"(uuid,boolean,boolean,boolean,double precision,boolean,date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_set_routine_member_prefs"(uuid,boolean,boolean,boolean,double precision,boolean,date) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_set_routine_member_stats"(uuid,integer,integer,integer,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_set_routine_member_stats"(uuid,integer,integer,integer,integer) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_sync_routine_log_status"(uuid,habit_status,timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_sync_routine_log_status"(uuid,habit_status,timestamp with time zone) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cadence_transfer_list"(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cadence_transfer_list"(uuid,uuid) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "cron_user_ids"(timestamp with time zone,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cron_user_ids"(timestamp with time zone,integer) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "memory_user_ids"(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "memory_user_ids"(timestamp with time zone) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "push_release_endpoint"(text,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "push_release_endpoint"(text,uuid) TO api_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "push_user_ids"() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "push_user_ids"() TO api_worker;
