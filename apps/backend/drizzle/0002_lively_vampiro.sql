-- CREATE TYPE "public"."habit_status" AS ENUM('COMPLETED', 'SKIPPED', 'PENDING');--> statement-breakpoint
CREATE TABLE "habit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "habit_status" DEFAULT 'PENDING' NOT NULL,
	"target_date" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"recurrence_rule" text NOT NULL,
	"target_time" text,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"total_completions" integer DEFAULT 0 NOT NULL,
	"total_skips" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"color_accent" text DEFAULT 'lantern' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_logs_habit_date_idx" ON "habit_logs" USING btree ("habit_id","target_date");--> statement-breakpoint
CREATE INDEX "habits_user_id_idx" ON "habits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_memories_user_id_idx" ON "ai_memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_scheduled_start_idx" ON "tasks" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_state_idx" ON "tasks" USING btree ("state");--> statement-breakpoint
CREATE INDEX "tasks_sort_order_idx" ON "tasks" USING btree ("is_pinned","order_index");--> statement-breakpoint
CREATE INDEX "user_metrics_user_id_idx" ON "user_metrics" USING btree ("user_id");