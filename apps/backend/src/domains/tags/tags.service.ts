import { and, eq, inArray, max, sql } from "drizzle-orm";
import { TAG_PALETTE } from "@cadence/contracts/constants";
import type { InsertTag, UpdateTag } from "@cadence/contracts/tag";
import { tags } from "../../db/schema";
import { AppError, throwIfNotFound, violatedUnique } from "../../platform/errors";
import { createOnce } from "../../platform/idempotency";
import type { Tx } from "../../types/db";
import { assertRowRoom } from "../../platform/storage-ceiling";

const randomTagColor = () => TAG_PALETTE[1 + Math.floor(Math.random() * (TAG_PALETTE.length - 1))];

async function nextSortOrder(tx: Tx, userId: string) {
    const [row] = await tx
        .select({ last: max(tags.sortOrder) })
        .from(tags)
        .where(eq(tags.userId, userId));
    return (row?.last ?? 0) + 1000;
}

async function oneTagPerName<T>(write: () => Promise<T>): Promise<T> {
    try {
        return await write();
    } catch (error) {
        if (violatedUnique(error) === "tags_user_name_unique")
            throw new AppError(409, "CONFLICT", "You already have a tag with that name");
        throw error;
    }
}

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
        const rows = missing.map(([, name], i) => sql`(${userId}, ${name}, ${randomTagColor()}, ${first + i * 1000})`);
        const result = await tx.execute<{ id: string; name: string }>(sql`
            INSERT INTO tags (user_id, name, color, sort_order) VALUES ${sql.join(rows, sql`, `)}
            ON CONFLICT (user_id, lower(name)) DO SELECT RETURNING id, name`);
        const made = Array.isArray(result) ? result : (result as unknown as { rows: typeof result }).rows;
        for (const tag of made) ids.set(tag.name.toLowerCase(), tag.id);
    }
    return names
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ids.get(name.toLowerCase())!);
}

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

export async function deleteTag(tx: Tx, userId: string, id: string) {
    const [row] = await tx
        .delete(tags)
        .where(and(eq(tags.id, id), eq(tags.userId, userId)))
        .returning();
    throwIfNotFound(row, "Tag");
    return row;
}

export { placeTagIds, retagForMove } from "./auto-tag";
