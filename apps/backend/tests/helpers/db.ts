/**
 * Real Postgres for integration tests: PGlite (WASM Postgres, in-process) with
 * every journaled migration from `drizzle/` applied, so routes run their actual
 * SQL, RLS policies, constraints, idempotency, and ownership checks.
 *
 * Usage in an integration test file:
 *
 *     vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
 *     beforeAll(startTestDb);
 *
 * One database per test file. Tests stay independent by creating their own
 * users with `createUser()` rather than resetting tables between tests.
 */
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../../src/db/schema";

const MIGRATIONS_DIR = join(fileURLToPath(import.meta.url), "../../../drizzle");

let client: PGlite | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/** Applies migrations the way `drizzle-kit migrate` does: journal entries, in order. */
async function applyMigrations(pg: PGlite) {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
        // exec() runs multi-statement text; some hand-written migrations put several
        // statements in one breakpoint chunk, which drizzle's prepared-statement migrator rejects.
        await pg.exec(readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
    }
}

export async function startTestDb() {
    client = new PGlite({ extensions: { vector } });
    await client.exec("CREATE EXTENSION IF NOT EXISTS vector;");
    await applyMigrations(client);
    // Superusers bypass RLS. Run as a plain role so policies apply as in production,
    // and in UTC like Neon so timestamp text matches what production returns.
    await client.exec(`
        CREATE ROLE app_user NOLOGIN;
        GRANT USAGE ON SCHEMA public TO app_user;
        GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_user;
        SET ROLE app_user;
        SET TIME ZONE 'UTC';
    `);
    db = drizzle(client, { schema });
}

/** Stands in for `getDbClient(env)`; the drizzle API is the same across drivers. */
export function getTestDb(): any {
    if (!db) throw new Error("startTestDb() has not run — add `beforeAll(startTestDb)` to this file");
    return db;
}

/**
 * Runs SQL as the table owner, bypassing RLS — for seeding rows no route
 * creates (users) and for asserting on raw table state. Never use it for the
 * behavior under test.
 */
export async function asOwner<T>(fn: (pg: PGlite) => Promise<T>): Promise<T> {
    if (!client) throw new Error("startTestDb() has not run");
    await client.exec("RESET ROLE;");
    try {
        return await fn(client);
    } finally {
        await client.exec("SET ROLE app_user;");
    }
}

/** Inserts a fresh user (column defaults for settings) and returns its id. */
export async function createUser(settings?: Record<string, unknown>): Promise<string> {
    const id = crypto.randomUUID();
    await asOwner((pg) =>
        settings
            ? pg.query("INSERT INTO users (id, settings) VALUES ($1, $2)", [id, JSON.stringify(settings)])
            : pg.query("INSERT INTO users (id) VALUES ($1)", [id]),
    );
    return id;
}
