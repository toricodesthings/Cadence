/**
 * Full: learning from task notes. After a note has been quiet for 10 minutes, only the lines memory
 * has not read yet go through the same extraction as a chat; the note itself is never copied (only
 * a hash per line is kept, so an edit is learned from once). Plain-language facts about the person
 * only: the extraction prompt and the candidate filter are the chat's.
 */
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { todayIn } from "@cadence/domain/time";
import removeMarkdown from "remove-markdown";
import { aiMemoryNotes, taskNotes } from "../../../db/schema";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { userZone } from "../../../platform/user-zone";
import type { Tx } from "../../../types/db";
import type { Env } from "../../../types/env";
import { learnFromReading, type Admit, type LearnResult } from "./learn";
import { readMemoryState } from "./memory-mode";
import { contentHash } from "./memory-store";

/** Shorter lines are headings, bullets and fragments, not statements. */
const MIN_LINE_CHARS = 12;
/** What one reading takes: about 6k tokens. */
const READ_CHAR_BUDGET = 24_000;

/** The notes quiet for `idleMinutes` (and not older than `withinDays`) that memory hasn't read since their last save. */
export async function pendingNotes(tx: Tx, userId: string, now: Date, idleMinutes: number, withinDays: number, limit: number, notBefore: string | null = null): Promise<string[]> {
    const idleBefore = new Date(now.getTime() - idleMinutes * 60_000).toISOString();
    const recentAfter = new Date(now.getTime() - withinDays * 24 * 60 * 60_000).toISOString();
    const rows = await tx
        .select({ taskId: taskNotes.taskId })
        .from(taskNotes)
        .where(and(
            eq(taskNotes.userId, userId),
            lt(taskNotes.updatedAt, idleBefore),
            gt(taskNotes.updatedAt, recentAfter),
            notBefore ? gt(taskNotes.updatedAt, notBefore) : undefined,
            gt(taskNotes.wordCount, 3),
            sql`NOT EXISTS (SELECT 1 FROM ${aiMemoryNotes} n WHERE n.user_id = ${taskNotes.userId} AND n.task_id = ${taskNotes.taskId} AND n.read_at >= ${taskNotes.updatedAt})`,
        ))
        .orderBy(desc(taskNotes.updatedAt))
        .limit(limit);
    return rows.map((r) => r.taskId);
}

/** Lines of a note worth reading, as plain text. */
export const linesOf = (body: string) => body.split("\n").map((raw) => removeMarkdown(raw).trim()).filter((line) => line.length >= MIN_LINE_CHARS);

export async function learnFromNote(env: Env, userId: string, taskId: string, now: Date = new Date(), admit?: Admit): Promise<LearnResult | null> {
    const db = getDbClient(env);
    const read = await withRls(db, userId, async (tx) => {
        const state = await readMemoryState(tx, userId);
        if (state.mode !== "full") return null;
        const [note] = await tx.select({ body: taskNotes.body }).from(taskNotes).where(and(eq(taskNotes.userId, userId), eq(taskNotes.taskId, taskId)));
        const [seen] = await tx
            .select({ lineHashes: aiMemoryNotes.lineHashes, readAt: sql<string>`to_json(${aiMemoryNotes.readAt}) #>> '{}'` })
            .from(aiMemoryNotes)
            .where(and(eq(aiMemoryNotes.userId, userId), eq(aiMemoryNotes.taskId, taskId)));
        return { state, body: note?.body ?? "", seen: new Set(seen?.lineHashes ?? []), readAt: seen?.readAt ?? null, zone: await userZone(tx, userId) };
    });
    if (!read) return null;

    const lines = linesOf(read.body);
    const hashes = await Promise.all(lines.map((l) => contentHash(l)));
    const fresh = lines.filter((_, i) => !read.seen.has(hashes[i]));
    // Moves only from the read this started from: an overlapping run that already moved it wins, and this one writes nothing.
    const advance = async (tx: Tx) => {
        const moved = await tx
            .insert(aiMemoryNotes)
            .values({ userId, taskId, lineHashes: [...new Set(hashes)] })
            .onConflictDoUpdate({
                target: [aiMemoryNotes.userId, aiMemoryNotes.taskId],
                set: { lineHashes: [...new Set(hashes)], readAt: sql`now()` },
                setWhere: read.readAt ? sql`${aiMemoryNotes.readAt} = ${read.readAt}::timestamptz` : sql`false`,
            })
            .returning({ taskId: aiMemoryNotes.taskId });
        return moved.length > 0;
    };

    if (fresh.length === 0) {
        await withRls(db, userId, (tx) => advance(tx));
        return null;
    }
    return learnFromReading(
        env,
        userId,
        { messages: [{ id: taskId, text: fresh.join("\n").slice(0, READ_CHAR_BUDGET) }], source: "note", conversationId: null },
        { state: read.state, today: todayIn(read.zone, now), admit },
        advance,
    );
}
