ALTER TABLE "ai_images" ALTER COLUMN "width" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_images" ALTER COLUMN "height" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_images" ADD COLUMN "media_type" text DEFAULT 'image/webp' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_images" ADD COLUMN "pages" integer;--> statement-breakpoint
ALTER TABLE "ai_images" ADD CONSTRAINT "ai_images_media_type_check" CHECK ("ai_images"."media_type" in ('image/webp','application/pdf'));