import { sql } from "drizzle-orm";
import { tracing } from "cloudflare:workers";
import type { DbClient } from "./db";
import type { Tx } from "../types/db";

/**
 * Wraps a database operation in a transaction where RLS context is set first.
 * This guarantees the SET CONFIG and query run atomically on the same connection,
 * preventing RLS context from leaking across Hyperdrive pool connections.
 */
export async function withRls<T>(
    db: DbClient,
    userId: string,
    fn: (tx: Tx) => Promise<T>,
): Promise<T> {
    return tracing.enterSpan("db.rls.transaction", async (span) => {
        const startedAt = Date.now();
        let workEndedAt: number | undefined;
        const result = await db.transaction(async (tx) => {
            // Automatic Hyperdrive spans stop at connect(), before the driver opens
            // the transaction. These timings expose that gap without SQL or identity.
            span.setAttribute("db.begin_ms", Date.now() - startedAt);
            await tracing.enterSpan("db.rls.context", () => tx.execute(
                sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`,
            ));
            const value = await tracing.enterSpan("db.rls.work", () => fn(tx));
            workEndedAt = Date.now();
            return value;
        });
        if (workEndedAt !== undefined) span.setAttribute("db.commit_ms", Date.now() - workEndedAt);
        return result;
    });
}
