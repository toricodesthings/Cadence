CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"order_index" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "tasks" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "state" SET DEFAULT 'ACTIVE'::text;--> statement-breakpoint
UPDATE "tasks" SET "state" = 'COMPLETE' WHERE "state" = 'DONE';--> statement-breakpoint
DROP TYPE "public"."task_state";--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('ACTIVE', 'WAITING', 'COMPLETE', 'ARCHIVED');--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "state" SET DEFAULT 'ACTIVE'::"public"."task_state";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "state" SET DATA TYPE "public"."task_state" USING "state"::"public"."task_state";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "waiting_on" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "waiting_reminder" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "effort" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "not_before" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_metrics" ADD CONSTRAINT "task_metrics_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_metrics" ADD CONSTRAINT "task_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_effort_check" CHECK (effort IS NULL OR effort BETWEEN 1 AND 3);--> statement-breakpoint
CREATE INDEX "subtasks_task_id_idx" ON "subtasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "subtasks_user_id_idx" ON "subtasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_metrics_user_id_idx" ON "task_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_metrics_task_id_idx" ON "task_metrics" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_not_before_idx" ON "tasks" USING btree ("not_before");--> statement-breakpoint
CREATE INDEX "tasks_effort_idx" ON "tasks" USING btree ("effort");