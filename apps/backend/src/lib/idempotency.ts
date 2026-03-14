import { eq, and } from "drizzle-orm";
import { mutationDedup } from "../db/schema";
import type { DbClient } from "./db";

/**
 * Check if a mutation has already been processed (idempotency guard).
 * Returns the result entity ID if the mutation was already handled.
 */
export async function checkIdempotency(
    tx: Parameters<Parameters<DbClient["transaction"]>[0]>[0],
    userId: string,
    clientMutationId: string | undefined,
): Promise<string | null> {
    if (!clientMutationId) return null;

    const [existing] = await tx
        .select({ resultId: mutationDedup.resultId })
        .from(mutationDedup)
        .where(
            and(
                eq(mutationDedup.userId, userId),
                eq(mutationDedup.clientMutationId, clientMutationId),
            ),
        );

    return existing?.resultId ?? null;
}

/**
 * Record a mutation as processed for future dedup checks.
 */
export async function recordMutation(
    tx: Parameters<Parameters<DbClient["transaction"]>[0]>[0],
    userId: string,
    clientMutationId: string | undefined,
    resultId: string,
): Promise<void> {
    if (!clientMutationId) return;

    await tx
        .insert(mutationDedup)
        .values({ userId, clientMutationId, resultId })
        .onConflictDoNothing();
}
