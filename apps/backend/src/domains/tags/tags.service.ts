import { and, eq, inArray, max, sql } from "drizzle-orm";
import { TAG_PALETTE } from "@cadence/contracts/constants";
import type { InsertTag, UpdateTag } from "@cadence/contracts/tag";
import { tags } from "../../db/schema";
import { AppError, throwIfNotFound, violatedUnique } from "../../platform/errors";
import { createOnce } from "../../platform/idempotency";
import type { Tx } from "../../types/db";
import { assertRowRoom } from "../../platform/storage-ceiling";

/** A palette colour for a tag nobody coloured (index 0 is the grey "default"). */
const randomTagColor = () => TAG_PALETTE[1 + Math.floor(Math.random() * (TAG_PALETTE.length - 1))];

/** Where a new tag goes: after the person's last one. */
async function nextSortOrder(tx: Tx, userId: string) {
    const [row] = await tx
        .select({ last: max(tags.sortOrder) })
        .from(tags)
        .where(eq(tags.userId, userId));
    return (row?.last ?? 0) + 1000;
}

/** One name, one tag (any case): a create or rename onto a name already used is refused. */
async function oneTagPerName<T>(write: () => Promise<T>): Promise<T> {
    try {
        return await write();
    } catch (error) {
        if (violatedUnique(error) === "tags_user_name_unique")
            throw new AppError(409, "CONFLICT", "You already have a tag with that name");
        throw error;
    }
}

/** Create a tag. A replayed idempotency key returns the first one. */
export async function createTag(tx: Tx, userId: string, body: InsertTag, idempotencyKey?: string) {
    return createOnce(
        tx,
        userId,
        idempotencyKey,
        (id) =>
            tx
                .select()
                .from(tags)
                .where(and(eq(tags.id, id), eq(tags.userId, userId))),
        async () => {
            await assertRowRoom(tx, userId, "tags");
            const sortOrder = body.sortOrder ?? (await nextSortOrder(tx, userId));
            return oneTagPerName(() =>
                tx
                    .insert(tags)
                    .values({ ...body, color: body.color ?? randomTagColor(), sortOrder, userId })
                    .returning(),
            );
        },
    );
}

/**
 * A tag id for each name, in order (blank names skipped): an existing tag matches
 * its name case-insensitively, a new name makes one tag even when repeated in
 * another case. Lets one write tag by name without a read first.
 */
export async function findOrCreateTags(tx: Tx, userId: string, names: string[]) {
    const wanted = new Map(
        names
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => [name.toLowerCase(), name]),
    );
    if (!wanted.size) return [];
    const ids = new Map<string, string>();
    const findByName = async (keys: string[]) => {
        const found = await tx
            .select({ id: tags.id, name: tags.name })
            .from(tags)
            .where(and(eq(tags.userId, userId), inArray(sql`lower(${tags.name})`, keys)));
        for (const tag of found) ids.set(tag.name.toLowerCase(), tag.id);
    };
    await findByName([...wanted.keys()]);
    const missing = [...wanted].filter(([key]) => !ids.has(key));
    if (missing.length) {
        await assertRowRoom(tx, userId, "tags", missing.length);
        const first = await nextSortOrder(tx, userId);
        // A concurrent writer may make the same name first: the unique index skips ours, the re-read finds theirs.
        await tx
            .insert(tags)
            .values(
                missing.map(([, name], i) => ({ userId, name, color: randomTagColor(), sortOrder: first + i * 1000 })),
            )
            .onConflictDoNothing();
        await findByName(missing.map(([key]) => key));
    }
    return names
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ids.get(name.toLowerCase())!);
}

/** Rename, recolour or move a tag. 404 when it isn't the caller's. */
export async function updateTag(tx: Tx, userId: string, id: string, body: UpdateTag) {
    const [row] = await oneTagPerName(() =>
        tx
            .update(tags)
            .set(body)
            .where(and(eq(tags.id, id), eq(tags.userId, userId)))
            .returning(),
    );
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

// Auto-tag: the only door for other domains.
export { placeTagIds, retagForMove } from "./auto-tag";
