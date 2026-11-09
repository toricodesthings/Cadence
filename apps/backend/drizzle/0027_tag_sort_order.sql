ALTER TABLE "tags" ADD COLUMN "sort_order" double precision DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Keep today's alphabetical order so nothing moves when the column arrives.
UPDATE "tags" t SET "sort_order" = r.n * 1000 FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY lower(name), id) AS n FROM "tags") r WHERE r.id = t.id;
