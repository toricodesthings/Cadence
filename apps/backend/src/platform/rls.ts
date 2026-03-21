import { sql } from "drizzle-orm";
import type { DbClient } from "./db";

/**
 * Wraps a database operation in a transaction where RLS context is set first.
 * This guarantees the SET CONFIG and query run atomically on the same connection,
 * preventing RLS context from leaking across Hyperdrive pool connections.
 */
export async function withRls<T>(
    db: DbClient,
    userId: string,
    fn: (tx: Parameters<Parameters<DbClient['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
    return db.transaction(async (tx) => {
        await tx.execute(
            sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`,
        );
        return fn(tx);
    });
}
