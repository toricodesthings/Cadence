-- push_subscriptions becomes devices: the same rows, now able to name themselves, be turned off from
-- another device, and hold a device with no Web Push at all (the desktop app, which alerts itself).
ALTER TABLE "push_subscriptions" RENAME TO "devices";--> statement-breakpoint
ALTER TABLE "devices" RENAME CONSTRAINT "push_subscriptions_user_id_users_id_fk" TO "devices_user_id_users_id_fk";--> statement-breakpoint
ALTER POLICY "push_subscriptions_owner_access" ON "devices" RENAME TO "devices_owner_access";--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "install_id" text;--> statement-breakpoint
-- A device registered before this release gets an identity now; it replaces it with its own on next load.
UPDATE "devices" SET "install_id" = gen_random_uuid()::text WHERE "install_id" IS NULL;--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "install_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "kind" text DEFAULT 'computer' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "label" text DEFAULT 'Earlier device' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "label" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "endpoint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "p256dh" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "auth" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "push_subscriptions_endpoint_unique";--> statement-breakpoint
DROP INDEX "push_subscriptions_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_install_unique" ON "devices" USING btree ("user_id","install_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_endpoint_unique" ON "devices" USING btree ("endpoint") WHERE "devices"."endpoint" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "push_deliveries" RENAME COLUMN "subscription_id" TO "device_id";--> statement-breakpoint
ALTER TABLE "push_deliveries" RENAME CONSTRAINT "push_deliveries_subscription_id_push_subscriptions_id_fk" TO "push_deliveries_device_id_devices_id_fk";--> statement-breakpoint
ALTER INDEX "push_deliveries_subscription_occurrence_unique" RENAME TO "push_deliveries_device_occurrence_unique";--> statement-breakpoint
-- The dispatcher's user list and the endpoint hand-over read the renamed table (the dispatcher filters out devices it cannot reach).
DROP FUNCTION IF EXISTS "push_user_ids"();--> statement-breakpoint
CREATE FUNCTION "push_user_ids"() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT user_id FROM devices
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "push_user_ids"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "push_user_ids"() TO api_worker;--> statement-breakpoint
DROP FUNCTION IF EXISTS "push_release_endpoint"(text, uuid);--> statement-breakpoint
CREATE FUNCTION "push_release_endpoint"(ep text, keep uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    DELETE FROM devices WHERE endpoint = ep AND user_id <> keep
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "push_release_endpoint"(text, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "push_release_endpoint"(text, uuid) TO api_worker;
