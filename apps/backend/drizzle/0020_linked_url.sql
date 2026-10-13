ALTER TABLE "habits" ADD COLUMN "linked_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "linked_url" text;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_linked_url_check" CHECK (linked_url IS NULL OR (linked_url LIKE 'https://%' AND length(linked_url) <= 2048));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_linked_url_check" CHECK (linked_url IS NULL OR (linked_url LIKE 'https://%' AND length(linked_url) <= 2048));