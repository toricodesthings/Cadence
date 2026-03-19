CREATE TABLE "habit_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "settings" SET DEFAULT '{"tasks":{"defaultDueDate":null,"hideTrash":false,"hideCompleted":false,"quickAdd":{"preset":"planner","style":"label","actions":["date","priority","project"]}},"dateTime":{"weekStart":"Sunday","timezone":"local","timeDisplay":"12h"},"calendar":{"clutter":{"showAllDay":true,"showTimedTasks":true,"showHabitAnchors":true},"holidays":{"enabled":true,"usePreciseLocation":false,"locationMode":"auto","countryCode":null,"subdivisionCode":null,"promptDismissedAt":null}},"notifications":{"email":true,"browser":false,"taskReminders":true,"habitReminders":true,"dueDateAlerts":true},"shortcuts":{}}'::jsonb;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "target_mode" text DEFAULT 'AMBIENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "sort_order" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "paused_until" date;--> statement-breakpoint
ALTER TABLE "habit_tags" ADD CONSTRAINT "habit_tags_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_tags" ADD CONSTRAINT "habit_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_tags" ADD CONSTRAINT "habit_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "habit_tags_unique_pair" ON "habit_tags" USING btree ("habit_id","tag_id");--> statement-breakpoint
CREATE INDEX "habit_tags_tag_id_idx" ON "habit_tags" USING btree ("tag_id");--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "habit_logs_habit_date_unique" ON "habit_logs" USING btree ("habit_id","target_date");--> statement-breakpoint
CREATE INDEX "habits_project_id_idx" ON "habits" USING btree ("project_id");--> statement-breakpoint
CREATE POLICY "habit_tags_owner_access" ON "habit_tags" AS PERMISSIVE FOR ALL TO public USING ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)) WITH CHECK ((user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid));