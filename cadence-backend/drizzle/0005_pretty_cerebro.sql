CREATE TABLE "task_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_index" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "task_sections" ADD CONSTRAINT "task_sections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_sections_user_id_idx" ON "task_sections" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_section_id_task_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."task_sections"("id") ON DELETE set null ON UPDATE no action;