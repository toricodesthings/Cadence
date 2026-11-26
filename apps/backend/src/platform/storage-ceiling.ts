import { count, eq, sql } from "drizzle-orm";
import { aiConversations, habits, inboxItems, personalEvents, projects, tags, taskNotes, tasks } from "../db/schema";
import { AppError } from "./errors";
import type { Tx } from "../types/db";

export const ROW_CEILINGS = {
    tasks: { table: tasks, limit: 25_000, things: "tasks" },
    captures: { table: inboxItems, limit: 10_000, things: "captures" },
    conversations: { table: aiConversations, limit: 2_000, things: "conversations" },
    routines: { table: habits, limit: 1_000, things: "routines" },
    lists: { table: projects, limit: 1_000, things: "lists" },
    tags: { table: tags, limit: 1_000, things: "tags" },
    events: { table: personalEvents, limit: 1_000, things: "events" },
} as const;

export const LARGE_TEXT_CHARS = 2_000;
export const TEXT_CEILING_BYTES = 50 * 1024 * 1024;

const full = (things: string) =>
    new AppError(
        413,
        "STORAGE_FULL",
        `This account has reached its storage ceiling. Remove some ${things} to add more.`,
    );

export async function assertRowRoom(
    tx: Tx,
    userId: string,
    kind: keyof typeof ROW_CEILINGS,
    adding = 1,
    limit: number = ROW_CEILINGS[kind].limit,
): Promise<void> {
    const { table, things } = ROW_CEILINGS[kind];
    const [{ n }] = await tx.select({ n: count() }).from(table).where(eq(table.userId, userId));
    if (n + adding > limit) throw full(things);
}

export async function assertStorageRoom(
    tx: Tx,
    userId: string,
    texts: Array<string | null | undefined>,
    limitBytes: number = TEXT_CEILING_BYTES,
): Promise<void> {
    if (!texts.some((text) => (text?.length ?? 0) > LARGE_TEXT_CHARS)) return;
    const bytesOf = (column: typeof taskNotes.body | typeof tasks.content) =>
        sql<number>`coalesce(sum(octet_length(${column})), 0)`.mapWith(Number);
    const [[notes], [descriptions]] = await Promise.all([
        tx
            .select({ bytes: bytesOf(taskNotes.body) })
            .from(taskNotes)
            .where(eq(taskNotes.userId, userId)),
        tx
            .select({ bytes: bytesOf(tasks.content) })
            .from(tasks)
            .where(eq(tasks.userId, userId)),
    ]);
    const bytes = notes.bytes + descriptions.bytes;
    if (bytes > limitBytes) throw full("long notes");
}
