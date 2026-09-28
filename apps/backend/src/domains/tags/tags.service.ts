import { and, eq, inArray, sql } from "drizzle-orm";
import type { InsertTag, UpdateTag } from "@cadence/contracts/tag";
import { tags } from "../../db/schema";
import { throwIfNotFound } from "../../platform/errors";
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

/**
 * A tag id for each name, in order (blank names skipped): an existing tag matches
 * its name case-insensitively, a new name makes one tag even when repeated in
 * another case. Lets one write tag by name without a read first.
 */
export async function findOrCreateTags(tx: Tx, userId: string, names: string[]) {
    const wanted = new Map(names.map((name) => name.trim()).filter(Boolean).map((name) => [name.toLowerCase(), name]));
    if (!wanted.size) return [];
    const ids = new Map(
        (await tx
            .select({ id: tags.id, name: tags.name })
            .from(tags)
            .where(and(eq(tags.userId, userId), inArray(sql`lower(${tags.name})`, [...wanted.keys()]))))
            .map((tag) => [tag.name.toLowerCase(), tag.id]),
    );
    const missing = [...wanted].filter(([key]) => !ids.has(key));
    if (missing.length) {
        const rows = await tx.insert(tags).values(missing.map(([, name]) => ({ userId, name }))).returning({ id: tags.id, name: tags.name });
        for (const row of rows) ids.set(row.name.toLowerCase(), row.id);
    }
    return names.map((name) => name.trim()).filter(Boolean).map((name) => ids.get(name.toLowerCase())!);
}

/** Rename or recolour a tag. 404 when it isn't the caller's. */
export async function updateTag(tx: Tx, userId: string, id: string, body: UpdateTag) {
    const [row] = await tx
        .update(tags)
        .set(body)
        .where(and(eq(tags.id, id), eq(tags.userId, userId)))
        .returning();
    throwIfNotFound(row, "Tag");
    return row;
}

/** Delete a tag for good; it comes off every task and routine (the links cascade). */
export async function deleteTag(tx: Tx, userId: string, id: string) {
    const [row] = await tx
        .delete(tags)
        .where(and(eq(tags.id, id), eq(tags.userId, userId)))
        .returning();
    throwIfNotFound(row, "Tag");
    return row;
}
