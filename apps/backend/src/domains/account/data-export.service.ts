import { and, eq, getTableColumns, getTableName, inArray, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../db/schema";
import { dataExports, tasks } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { hashIdentifier, issuesFromError, logger } from "../../platform/log";
import { withRls } from "../../platform/rls";
import type { Tx } from "../../types/db";
import type { Env } from "../../types/env";

const FROM = { email: "noreply@mail.cadenceapp.cloud", name: "Cadence" };

/** Email caps a message at 25 MiB, body included. ponytail: over this the export fails; zip it or link R2 if anyone gets here. */
const MAX_BYTES = 20 * 1024 * 1024;

/** Internal bookkeeping the person never wrote. Everything else with their id on it goes in the file. */
const SKIPPED_TABLES = new Set(["mutation_dedup"]);

/**
 * Every table holding the person's rows, as JSON. Driven by the schema, so a new table is exported without
 * anyone remembering to add it. Embedding vectors are left out (model internals, 1,536 numbers a row).
 */
export async function buildExport(tx: Tx, identity: { userId: string; email: string }): Promise<string> {
    const { userId } = identity;
    const data: Record<string, unknown[]> = {};
    for (const table of (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable))) {
        const name = getTableName(table);
        if (SKIPPED_TABLES.has(name)) continue;
        const all: Record<string, any> = getTableColumns(table);
        const columns = Object.fromEntries(Object.entries(all).filter(([, column]) => column.columnType !== "PgVector"));
        const scope =
            "userId" in all ? eq(all.userId, userId)
            : name === "users" ? eq(all.id, userId)
            // task_tags is the one table without a user id: owned through its task
            : "taskId" in all ? inArray(all.taskId, tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, userId)))
            : undefined;
        if (!scope) throw new Error(`data export doesn't know how to scope ${name}`);
        data[name] = await tx.select(columns as never).from(table as never).where(scope);
    }
    return JSON.stringify({ exportedAt: new Date().toISOString(), account: { id: userId, email: identity.email }, data }, null, 2);
}

/**
 * Builds the export and emails it, then records the outcome on the request row. Runs after the response
 * (`waitUntil`), so it never throws: a failure is logged and leaves the row `failed`.
 * ponytail: runs inside the request's waitUntil window; move to a Cloudflare Queue if exports outgrow it.
 */
export async function deliverExport(env: Env, request: { id: string; userId: string; email: string }, requestId: string): Promise<void> {
    const db = getDbClient(env);
    const { userId } = request;
    let bytes: number | null = null;
    let status: "sent" | "failed" = "failed";
    try {
        const json = await withRls(db, userId, (tx) => buildExport(tx, request));
        bytes = new TextEncoder().encode(json).byteLength;
        if (bytes > MAX_BYTES) throw new Error(`export is ${bytes} bytes, over the ${MAX_BYTES} email limit`);
        const day = new Date().toISOString().slice(0, 10);
        await env.EMAIL!.send({
            from: FROM,
            to: request.email,
            subject: "Your Cadence data export",
            text: "Your Cadence data is attached as a JSON file. It holds your tasks, routines, lists, tags, captures, notes, settings and assistant conversations. Photos you uploaded (a background, images sent to the assistant) are not included.\n\nIf you didn't ask for this, change your password and reply to let us know.",
            html: "<p>Your Cadence data is attached as a JSON file. It holds your tasks, routines, lists, tags, captures, notes, settings and assistant conversations. Photos you uploaded (a background, images sent to the assistant) are not included.</p><p>If you didn't ask for this, change your password and reply to let us know.</p>",
            attachments: [{ content: json, filename: `cadence-export-${day}.json`, type: "application/json", disposition: "attachment" }],
        });
        status = "sent";
    } catch (error) {
        logger.error("auth", "data_export_failed", { requestId, userHash: await hashIdentifier(userId), issues: issuesFromError(error) });
    }
    try {
        await withRls(db, userId, (tx) =>
            tx.update(dataExports).set({ status, bytes, completedAt: new Date().toISOString() }).where(and(eq(dataExports.id, request.id), eq(dataExports.userId, userId))));
    } catch (error) {
        // Still "pending" on the row; the hour's wait on POST /account/export frees it up again
        logger.error("auth", "data_export_record_failed", { requestId, userHash: await hashIdentifier(userId), issues: issuesFromError(error) });
    }
}
