import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

const MIGRATIONS_DIR = join(fileURLToPath(import.meta.url), "../../../drizzle");

declare module "vitest" {
    export interface ProvidedContext {
        testDbSnapshot: string;
    }
}

export default async function setup(project: TestProject) {
    const pg = new PGlite({ extensions: { vector, pg_trgm } });
    await pg.exec("CREATE ROLE api_worker NOLOGIN;");
    await pg.exec(
        'CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user" (id uuid PRIMARY KEY, name text, image text, email text);',
    );
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as {
        entries: { tag: string }[];
    };
    for (const { tag } of journal.entries) await pg.exec(readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), "utf8"));

    const dir = mkdtempSync(join(tmpdir(), "cadence-test-db-"));
    const snapshot = join(dir, "migrated.tar");
    writeFileSync(snapshot, Buffer.from(await (await pg.dumpDataDir("none")).arrayBuffer()));
    await pg.close();

    project.provide("testDbSnapshot", snapshot);
    return () => rmSync(dir, { recursive: true, force: true });
}
