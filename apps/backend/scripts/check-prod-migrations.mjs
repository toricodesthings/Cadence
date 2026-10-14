// Pre-push guard: pushing main deploys the Worker, so prod must already have every migration in the journal.
// Code that needs a missing column fails every request until someone notices. Exits 1 with the one command to run.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const here = new URL("..", import.meta.url);
try { process.loadEnvFile(new URL(".dev.vars", here)); } catch { /* no .dev.vars: nothing to check against */ }
const url = process.env.PROD_MANAGEMENT_DATABASE_URL;
if (!url) {
    console.warn("check-prod-migrations: PROD_MANAGEMENT_DATABASE_URL unset in apps/backend/.dev.vars, skipping.");
    process.exit(0);
}

const journal = JSON.parse(readFileSync(new URL("drizzle/meta/_journal.json", here), "utf8")).entries;
const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => undefined });
try {
    // Same rule as drizzle's migrator: anything newer than the last applied entry is pending.
    const [row] = await sql`select max(created_at)::float8 as last from drizzle.__drizzle_migrations`;
    const behind = journal.filter((e) => e.when > (row?.last ?? 0)).map((e) => e.tag);
    if (behind.length) {
        console.error(`\nProd is missing ${behind.length === 1 ? "a migration" : `${behind.length} migrations`}: ${behind.join(", ")}.`);
        console.error("Pushing main deploys code that needs them. Run this, then push again:\n\n    pnpm db:migrate:prod\n");
        process.exitCode = 1;
    }
} catch (error) {
    // Can't reach prod (offline, Neon down): say so, don't block the push.
    console.warn(`check-prod-migrations: couldn't read prod (${error.message}), skipping.`);
} finally {
    await sql.end();
}
