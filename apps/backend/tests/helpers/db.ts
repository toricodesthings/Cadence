import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { inject } from "vitest";
import * as schema from "../../src/db/schema";

let client: PGlite | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export async function startTestDb() {
    client = new PGlite({
        extensions: { vector, pg_trgm },
        loadDataDir: new Blob([readFileSync(inject("testDbSnapshot"))]),
    });
    db = drizzle(client, { schema });
    await client.exec("SET ROLE api_worker; SET TIME ZONE 'UTC';");
    const opened = client;
    return () => opened.close();
}

export function getTestDb(): any {
    if (!db) throw new Error("startTestDb() has not run — add `beforeAll(startTestDb)` to this file");
    return db;
}

export async function asOwner<T>(fn: (pg: PGlite) => Promise<T>): Promise<T> {
    if (!client) throw new Error("startTestDb() has not run");
    await client.exec("RESET ROLE;");
    try {
        return await fn(client);
    } finally {
        await client.exec("SET ROLE api_worker;");
    }
}

export async function createUser({
    settings,
    zone,
    name,
    image,
}: { settings?: Record<string, unknown>; zone?: string; name?: string; image?: string } = {}): Promise<string> {
    const id = crypto.randomUUID();
    await asOwner(async (pg) => {
        await pg.query("INSERT INTO users (id) VALUES ($1)", [id]);
        await pg.query('INSERT INTO neon_auth."user" (id, name, image, email) VALUES ($1, $2, $3, $4)', [
            id,
            name ?? "Test User",
            image ?? null,
            `${id}@example.test`,
        ]);
        await pg.query(
            "UPDATE users SET settings = COALESCE($2::jsonb, settings), time_zone = COALESCE($3, time_zone) WHERE id = $1",
            [id, settings ? JSON.stringify(settings) : null, zone ?? null],
        );
    });
    return id;
}
