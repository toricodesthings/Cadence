import { eq, and, sql } from "drizzle-orm";
import { mutationDedup } from "../db/schema";
import type { Tx } from "../types/db";
import type { Context } from "hono";
import { AppError, violatedUnique } from "./errors";

export function getIdempotencyKey(c: Context): string | undefined {
    return c.req.header("Idempotency-Key") ?? undefined;
}

export async function checkIdempotency(
    tx: Tx,
    userId: string,
    idempotencyKey: string | undefined,
): Promise<string | null> {
    if (!idempotencyKey) return null;

    const lockKey = `${userId}:${idempotencyKey}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const [existing] = await tx
        .select({ resultId: mutationDedup.resultId })
        .from(mutationDedup)
        .where(and(eq(mutationDedup.userId, userId), eq(mutationDedup.clientMutationId, idempotencyKey)));

    return existing?.resultId ?? null;
}

export async function storedResult(tx: Tx, userId: string, idempotencyKey: string): Promise<unknown> {
    const [row] = await tx
        .select({ result: mutationDedup.result })
        .from(mutationDedup)
        .where(and(eq(mutationDedup.userId, userId), eq(mutationDedup.clientMutationId, idempotencyKey)));
    return row?.result ?? undefined;
}

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

export async function insertWithClientId<T>(insert: () => Promise<T>): Promise<T> {
    try {
        return await insert();
    } catch (error) {
        if (violatedUnique(error)?.endsWith("_pkey")) {
            throw new AppError(409, "CONFLICT", "That id is already in use");
        }
        throw error;
    }
}

export async function createOnce<R extends { id: string }>(
    tx: Tx,
    userId: string,
    idempotencyKey: string | undefined,
    find: (id: string) => Promise<R[]>,
    insert: () => Promise<R[]>,
): Promise<R> {
    const existingId = await checkIdempotency(tx, userId, idempotencyKey);
    if (existingId) {
        const [existing] = await find(existingId);
        if (existing) return existing;
    }

    const [row] = await insertWithClientId(insert);
    await recordMutation(tx, userId, idempotencyKey, row.id);
    return row;
}
