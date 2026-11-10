/**
 * Abuse ceilings on what one account stores, far above anything a person reaches (Manifesto §8): they keep
 * one script from filling the database for everyone. Never a tier, never a nudge; when met, a calm 413.
 */
import { count, eq, sql } from "drizzle-orm";
import { aiConversations, habits, inboxItems, projects, tags, taskNotes, tasks } from "../db/schema";
import { AppError } from "./errors";
import type { Tx } from "../types/db";

/** Rows an account may hold per kind. */
export const ROW_CEILINGS = {
    tasks: { table: tasks, limit: 25_000, things: "tasks" },
    captures: { table: inboxItems, limit: 10_000, things: "captures" },
    conversations: { table: aiConversations, limit: 2_000, things: "conversations" },
    routines: { table: habits, limit: 1_000, things: "routines" },
    lists: { table: projects, limit: 1_000, things: "lists" },
    tags: { table: tags, limit: 1_000, things: "tags" },
} as const;

/** Only a write carrying more text than this is checked against the text ceiling. */
export const LARGE_TEXT_CHARS = 2_000;
/** Task descriptions plus notes, per account. */
export const TEXT_CEILING_BYTES = 50 * 1024 * 1024;

const full = (things: string) =>
    new AppError(413, "STORAGE_FULL", `This account has reached its storage ceiling. Remove some ${things} to add more.`);

/**
 * Refuses a new row once the account holds `limit` of that kind (`adding` > 1 for a batch).
 * ponytail: one count(*) per create; keep a per-user counter if it ever shows in traces.
 */
export async function assertRowRoom(tx: Tx, userId: string, kind: keyof typeof ROW_CEILINGS, adding = 1, limit: number = ROW_CEILINGS[kind].limit): Promise<void> {
    const { table, things } = ROW_CEILINGS[kind];
    const [{ n }] = await tx.select({ n: count() }).from(table).where(eq(table.userId, userId));
    if (n + adding > limit) throw full(things);
}

/**
 * Refuses a large text write once the account's task descriptions and notes pass the ceiling.
 * Small writes are never checked, so everyday edits cost nothing.
 * ponytail: an aggregate per large write; add a cached per-user counter if it ever shows in traces.
 */
export async function assertStorageRoom(tx: Tx, userId: string, texts: Array<string | null | undefined>, limitBytes: number = TEXT_CEILING_BYTES): Promise<void> {
    if (!texts.some((text) => (text?.length ?? 0) > LARGE_TEXT_CHARS)) return;
    const bytesOf = (column: typeof taskNotes.body | typeof tasks.content) => sql<number>`coalesce(sum(octet_length(${column})), 0)`.mapWith(Number);
    const [[notes], [descriptions]] = await Promise.all([
        tx.select({ bytes: bytesOf(taskNotes.body) }).from(taskNotes).where(eq(taskNotes.userId, userId)),
        tx.select({ bytes: bytesOf(tasks.content) }).from(tasks).where(eq(tasks.userId, userId)),
    ]);
    const bytes = notes.bytes + descriptions.bytes;
    if (bytes > limitBytes) throw full("long notes");
}
