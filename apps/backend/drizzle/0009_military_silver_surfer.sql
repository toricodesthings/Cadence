ALTER TABLE "user_metrics" ALTER COLUMN "current_burnout_index" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_metrics" ALTER COLUMN "current_burnout_index" DROP NOT NULL;