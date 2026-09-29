import { eq, and, sql } from "drizzle-orm";
import { mutationDedup } from "../db/schema";
import type { Tx } from "../types/db";
import type { Context } from "hono";
import { AppError } from "./errors";

/**
 * Extract the idempotency key from the Idempotency-Key request header.
 * Returns undefined when the header is absent — callers that already
 * accept `string | undefined` (e.g. checkIdempotency / recordMutation)
 * gracefully no-op.
 */
export function getIdempotencyKey(c: Context): string | undefined {
    return c.req.header("Idempotency-Key") ?? undefined;
}

/**
 * Check if a mutation has already been processed (idempotency guard).
 * Returns the result entity ID if the mutation was already handled.
 */
export async function checkIdempotency(
    tx: Tx,
    userId: string,
    idempotencyKey: string | undefined,
): Promise<string | null> {
    if (!idempotencyKey) return null;

    // Serialize retries of the same key until this transaction ends, so a
    // concurrent duplicate waits and then sees the first one's record.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${idempotencyKey}`}, 0))`);

    const [existing] = await tx
        .select({ resultId: mutationDedup.resultId })
        .from(mutationDedup)
        .where(
            and(
                eq(mutationDedup.userId, userId),
                eq(mutationDedup.clientMutationId, idempotencyKey),
            ),
        );

    return existing?.resultId ?? null;
}

/** What the first call under this key returned, when it was stored. */
export async function storedResult(tx: Tx, userId: string, idempotencyKey: string): Promise<unknown> {
    const [row] = await tx
        .select({ result: mutationDedup.result })
        .from(mutationDedup)
        .where(and(eq(mutationDedup.userId, userId), eq(mutationDedup.clientMutationId, idempotencyKey)));
    return row?.result ?? undefined;
}

/**
 * Record a mutation as processed for future dedup checks.
 */
export async function recordMutation(
    tx: Tx,
    userId: string,
    idempotencyKey: string | undefined,
    resultId: string,
    result?: unknown,
): Promise<void> {
    if (!idempotencyKey) return;

    await tx
        .insert(mutationDedup)
        .values({ userId, clientMutationId: idempotencyKey, resultId, result })
        .onConflictDoNothing();
}

/**
 * Run an insert that may carry a client-chosen id. Callers use that id as the
 * idempotency key, so a retry by the same user never gets here; an id already
 * taken can only be another account's row (RLS hides it), which answers 409.
 */
export async function insertWithClientId<T>(insert: () => Promise<T>): Promise<T> {
    try {
        return await insert();
    } catch (error) {
        const pg = ((error as { cause?: unknown }).cause ?? error) as { code?: string; constraint?: string; constraint_name?: string };
        if (pg.code === "23505" && /_pkey$/.test(pg.constraint_name ?? pg.constraint ?? "")) {
            throw new AppError(409, "CONFLICT", "That id is already in use");
        }
        throw error;
    }
}
