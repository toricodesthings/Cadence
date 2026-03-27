ALTER TYPE "public"."analysis_status" ADD VALUE 'dismissed';--> statement-breakpoint
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
ALTER TABLE "inbox_items" ADD COLUMN "analysis_confidence_tier" "confidence_tier";--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "analysis_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "analysis_review_reason" text;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "analysis_entity_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "clarified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "resolved_due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "resolved_scheduled_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "resolved_scheduled_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "resolved_recurrence_rule" text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "resolved_project_id" uuid;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "resolved_tag_ids" jsonb;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "resolved_priority" text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "resolved_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "resolved_waiting_on" text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "entity_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "high_confidence_entity_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "medium_confidence_entity_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata" ADD COLUMN "low_confidence_entity_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "resolved_due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "resolved_scheduled_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "resolved_scheduled_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "resolved_recurrence_rule" text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "resolved_project_id" uuid;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "resolved_tag_ids" jsonb;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "resolved_priority" text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "resolved_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "resolved_waiting_on" text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "entity_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "high_confidence_entity_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "medium_confidence_entity_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_nlp_metadata_history" ADD COLUMN "low_confidence_entity_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "surface" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "route" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "input_method" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "object_type" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "confidence_tier" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "selection_count" integer;--> statement-breakpoint
ALTER TABLE "notification_state" ADD CONSTRAINT "notification_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_state_user_object_trigger_unique" ON "notification_state" USING btree ("user_id","object_id","trigger_id");--> statement-breakpoint
CREATE INDEX "notification_state_user_id_idx" ON "notification_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_state_deferred_until_idx" ON "notification_state" USING btree ("deferred_until");--> statement-breakpoint
CREATE POLICY "notification_state_owner_access" ON "notification_state" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));