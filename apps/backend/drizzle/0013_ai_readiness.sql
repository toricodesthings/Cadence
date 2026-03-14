CREATE TYPE "public"."suggestion_status" AS ENUM('PENDING', 'ACCEPTED', 'DISMISSED');--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"status" "suggestion_status" DEFAULT 'PENDING' NOT NULL,
	"related_task_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_metrics" ADD COLUMN "completion_ratio" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_metrics" ADD COLUMN "overdue_carry_load" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_metrics" ADD COLUMN "habit_adherence_rate" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_metrics" ADD COLUMN "schedule_density" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestions_user_id_idx" ON "suggestions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "suggestions_status_idx" ON "suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "usage_events_user_id_idx" ON "usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_events_event_idx" ON "usage_events" USING btree ("event");--> statement-breakpoint
CREATE INDEX "usage_events_created_at_idx" ON "usage_events" USING btree ("created_at");