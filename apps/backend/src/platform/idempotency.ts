import { eq, and } from "drizzle-orm";
import { mutationDedup } from "../db/schema";
import type { Tx } from "../types/db";
import type { Context } from "hono";

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

/**
 * Record a mutation as processed for future dedup checks.
 */
export async function recordMutation(
    tx: Tx,
    userId: string,
    idempotencyKey: string | undefined,
    resultId: string,
): Promise<void> {
    if (!idempotencyKey) return;

    await tx
        .insert(mutationDedup)
        .values({ userId, clientMutationId: idempotencyKey, resultId })
        .onConflictDoNothing();
}
