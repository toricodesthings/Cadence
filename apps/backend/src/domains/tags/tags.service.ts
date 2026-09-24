import { and, eq } from "drizzle-orm";
import type { InsertTag } from "@cadence/contracts/tag";
import { tags } from "../../db/schema";
import { checkIdempotency, recordMutation } from "../../platform/idempotency";
import type { Tx } from "../../types/db";

/** Create a tag. A replayed idempotency key returns the first one. */
export async function createTag(tx: Tx, userId: string, body: InsertTag, idempotencyKey?: string) {
    const existingId = await checkIdempotency(tx, userId, idempotencyKey);
    if (existingId) {
        const [existing] = await tx.select().from(tags).where(and(eq(tags.id, existingId), eq(tags.userId, userId)));
        if (existing) return existing;
    }

    const [row] = await tx
        .insert(tags)
        .values({ ...body, userId })
        .returning();

    await recordMutation(tx, userId, idempotencyKey, row.id);
    return row;
}
