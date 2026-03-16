CREATE TYPE "public"."task_interaction_mode" AS ENUM('task', 'timetable');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "interaction_mode" "task_interaction_mode" DEFAULT 'task' NOT NULL;
