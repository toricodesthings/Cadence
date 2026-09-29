/**
 * Real Postgres for integration tests: PGlite (WASM Postgres, in-process) migrated
 * by drizzle's own migrator from `drizzle/`, so routes run their actual SQL, RLS
 * policies, grants, constraints, idempotency, and ownership checks.
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
import { migrate } from "drizzle-orm/pglite/migrator";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../../src/db/schema";

const MIGRATIONS_DIR = join(fileURLToPath(import.meta.url), "../../../drizzle");

let client: PGlite | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export async function startTestDb() {
    client = new PGlite({ extensions: { vector } });
    // As on Neon, the worker's role exists before the first migration, which grants it table access.
    await client.exec("CREATE ROLE api_worker NOLOGIN;");
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    // Superusers bypass RLS. Run as the worker's role so policies and grants apply as in production,
    // and in UTC like Neon so timestamp text matches what production returns.
    await client.exec("SET ROLE api_worker; SET TIME ZONE 'UTC';");
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
        await client.exec("SET ROLE api_worker;");
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
