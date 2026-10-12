/**
 * The day-one effect. On choosing Full, the last 90 days of the person's chats and notes are read, newest
 * first, in batches of about 6k tokens, a few batches a night. Progress lives in
 * `users.settings.assistant.memoryBackfill` (server-owned). Chats the live job already covers (the last
 * 3 days, or anything behind a conversation's cursor) are skipped, so nothing is learned twice.
 */
import { and, desc, eq, gt, gte, isNull, lt, or, sql } from "drizzle-orm";
import { todayIn } from "@cadence/domain/time";
import { aiConversations, aiMemoryNotes, aiMessages, taskNotes, users } from "../../../db/schema";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { userZone } from "../../../platform/user-zone";
import { logger, hashIdentifier, issuesFromError } from "../../../platform/log";
import type { Tx } from "../../../types/db";
import type { Env } from "../../../types/env";
import { learnFromReading } from "./learn";
import { memoryStateOf } from "./memory-mode";
import { contentHash } from "./memory-store";

export const BACKFILL_DAYS = 90;
const READ_CHAR_BUDGET = 24_000;
const BATCHES_PER_NIGHT = 4;
/** The live job covers chats and notes this recent. */
const LIVE_DAYS = 3;
const MIN_LINE_CHARS = 12;

export interface Backfill {
    since: string;
    before: string;
    chats: "pending" | "done";
    notes: "pending" | "done";
}

export const newBackfill = (now: Date): Backfill => ({
    since: new Date(now.getTime() - BACKFILL_DAYS * 24 * 60 * 60_000).toISOString(),
    before: now.toISOString(),
    chats: "pending",
    notes: "pending",
});

export const isBackfilling = (backfill: Backfill | null | undefined): boolean => !!backfill && (backfill.chats === "pending" || backfill.notes === "pending");

const textOf = (parts: unknown): string =>
    (Array.isArray(parts) ? parts : [])
        .map((p) => (p && typeof p === "object" && (p as { type?: unknown }).type === "text" ? String((p as { text?: unknown }).text ?? "") : ""))
        .filter(Boolean)
        .join("\n")
        .trim();

async function saveBackfill(tx: Tx, userId: string, backfill: Backfill): Promise<void> {
    await tx
        .update(users)
        .set({ settings: sql`jsonb_set(${users.settings}, '{assistant,memoryBackfill}', ${JSON.stringify(backfill)}::jsonb, true)` })
        .where(eq(users.id, userId));
}

/** Runs up to a night's batches. Returns how many batches read something. */
export async function backfillForUser(env: Env, userId: string, now: Date = new Date()): Promise<number> {
    const db = getDbClient(env);
    const userHash = await hashIdentifier(userId);
    let batches = 0;
    try {
        for (let i = 0; i < BATCHES_PER_NIGHT; i++) {
            const step = await withRls(db, userId, async (tx) => {
                const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId));
                const state = memoryStateOf(row?.settings);
                const backfill = (row?.settings?.assistant?.memoryBackfill ?? null) as Backfill | null;
                if (state.mode !== "full" || !isBackfilling(backfill)) return null;
                const zone = await userZone(tx, userId);
                const today = todayIn(zone, now);
                const liveFrom = new Date(now.getTime() - LIVE_DAYS * 24 * 60 * 60_000).toISOString();

                if (backfill!.chats === "pending") {
                    const rows = await tx
                        .select({ id: aiMessages.id, parts: aiMessages.parts, at: aiMessages.createdAt })
                        .from(aiMessages)
                        .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
                        .where(and(
                            eq(aiMessages.userId, userId),
                            eq(aiMessages.role, "user"),
                            gte(aiMessages.createdAt, backfill!.since),
                            lt(aiMessages.createdAt, backfill!.before),
                            lt(aiConversations.lastMessageAt, liveFrom),
                            sql`coalesce(${aiConversations.metadata} ->> 'learn', 'true') <> 'false'`,
                            or(isNull(sql`${aiConversations.metadata} ->> 'memoryCursor'`), sql`${aiMessages.createdAt} > (${aiConversations.metadata} ->> 'memoryCursor')::timestamptz`),
                        ))
                        .orderBy(desc(aiMessages.createdAt))
                        .limit(300);
                    const taken: { id: string; text: string; at: string }[] = [];
                    let used = 0;
                    for (const r of rows) {
                        const text = textOf(r.parts);
                        if (!text) continue;
                        if (used + text.length > READ_CHAR_BUDGET && taken.length > 0) break;
                        used += text.length;
                        taken.push({ id: r.id, text: text.slice(0, READ_CHAR_BUDGET), at: r.at });
                    }
                    if (taken.length === 0) {
                        await saveBackfill(tx, userId, { ...backfill!, chats: "done" });
                        return { kind: "advanced" as const };
                    }
                    const oldest = taken.at(-1)!.at;
                    return {
                        kind: "read" as const,
                        state,
                        today,
                        messages: taken.map(({ id, text }) => ({ id, text })),
                        source: "backfill" as const,
                        // Once a night per person (the hourly cron's 03:00 run), so no run overlaps it: always moves.
                        advance: async (t: Tx): Promise<boolean> => {
                            await saveBackfill(t, userId, { ...backfill!, before: oldest });
                            return true;
                        },
                    };
                }

                // Notes: ones outside the live window that memory hasn't read at all, newest first.
                const notes = await tx
                    .select({ taskId: taskNotes.taskId, body: taskNotes.body })
                    .from(taskNotes)
                    .where(and(
                        eq(taskNotes.userId, userId),
                        gte(taskNotes.updatedAt, backfill!.since),
                        lt(taskNotes.updatedAt, liveFrom),
                        gt(taskNotes.wordCount, 3),
                        sql`NOT EXISTS (SELECT 1 FROM ${aiMemoryNotes} n WHERE n.user_id = ${taskNotes.userId} AND n.task_id = ${taskNotes.taskId})`,
                    ))
                    .orderBy(desc(taskNotes.updatedAt))
                    .limit(40);
                const taken: { taskId: string; text: string; hashes: string[] }[] = [];
                let used = 0;
                for (const note of notes) {
                    const lines = note.body.split("\n").map((l) => l.replace(/^[\s>#*\-\d.)]+/, "").trim()).filter((l) => l.length >= MIN_LINE_CHARS);
                    const text = lines.join("\n");
                    const hashes = await Promise.all(lines.map((l) => contentHash(l)));
                    // A note with nothing to read is still marked read, so it isn't offered again.
                    if (used + text.length > READ_CHAR_BUDGET && taken.length > 0) break;
                    used += text.length;
                    taken.push({ taskId: note.taskId, text: text.slice(0, READ_CHAR_BUDGET), hashes });
                }
                if (taken.length === 0) {
                    await saveBackfill(tx, userId, { ...backfill!, notes: "done" });
                    return { kind: "advanced" as const };
                }
                return {
                    kind: "read" as const,
                    state,
                    today,
                    messages: taken.filter((n) => n.text).map((n) => ({ id: n.taskId, text: n.text })),
                    source: "note" as const,
                    advance: async (t: Tx): Promise<boolean> => {
                        for (const n of taken) {
                            await t
                                .insert(aiMemoryNotes)
                                .values({ userId, taskId: n.taskId, lineHashes: [...new Set(n.hashes)] })
                                .onConflictDoNothing();
                        }
                        return true;
                    },
                };
            });
            if (!step) break;
            if (step.kind === "advanced") continue;
            if (step.messages.length === 0) {
                await withRls(db, userId, (tx) => step.advance(tx));
                continue;
            }
            const result = await learnFromReading(env, userId, { messages: step.messages, source: step.source, conversationId: null }, { state: step.state, today: step.today }, step.advance);
            // A failed read leaves the cursor: stop for tonight and retry on the next pass.
            if (result.skipped) break;
            batches++;
        }
        if (batches > 0) logger.info("ai", "ai_memory_backfill", { userHash, batches });
    } catch (error) {
        logger.warn("ai", "memory_backfill_failed", { userHash, issues: issuesFromError(error) });
    }
    return batches;
}
