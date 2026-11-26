import { sql } from "drizzle-orm";
import { tracing } from "cloudflare:workers";
import type { DbClient } from "./db";
import type { Tx } from "../types/db";

export async function withRls<T>(db: DbClient, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return tracing.enterSpan("db.rls.transaction", async (span) => {
        const startedAt = Date.now();
        let workEndedAt: number | undefined;
        const result = await db.transaction(async (tx) => {
            span.setAttribute("db.begin_ms", Date.now() - startedAt);
            await tracing.enterSpan("db.rls.context", async () =>
                tx.execute(sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`),
            );
            const value = await tracing.enterSpan("db.rls.work", async () => fn(tx));
            workEndedAt = Date.now();
            return value;
        });
        if (workEndedAt !== undefined) span.setAttribute("db.commit_ms", Date.now() - workEndedAt);
        return result;
    });
}
