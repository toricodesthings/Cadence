ALTER TABLE "saved_focus_views" ADD COLUMN "preset_key" text;--> statement-breakpoint
ALTER TABLE "saved_focus_views" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "saved_focus_views" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "saved_focus_views" ADD COLUMN "is_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_focus_views_user_preset_key_idx" ON "saved_focus_views" USING btree ("user_id","preset_key");