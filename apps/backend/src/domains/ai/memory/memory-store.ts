/**
 * Memory facts: every read and write of `ai_memories`, RLS-scoped (the caller supplies `tx`).
 * One row per fact, free text (`content`); a typed `value` only where code computes with it.
 * Embeddings are produced by the caller, outside any transaction.
 *
 * Content is untrusted user text: the prompt composer fences it. Never log content.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, notInArray, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { daysBetween } from "@cadence/domain/time";
import { FULL_ONLY_KINDS, MEMORY_LABEL_MAX, MEMORY_PAGE_SIZE, type MemoryFact, type MemoryKind, type MemoryMode } from "@cadence/contracts/memory";
import { aiConversations, aiMemories, aiMessages, durationReports, planningRecords, taskNotes } from "../../../db/schema";
import type { Tx } from "../../../types/db";
import { hideGroupReports, showGroupReports } from "./duration";

/** How long a forgotten fact's text is kept so Undo can bring it back. */
export const UNDO_WINDOW_MINUTES = 10;

/** sha256 hex of the lowercased, whitespace-collapsed text: exact repeats, and a forgotten fact's tombstone. */
export async function contentHash(text: string): Promise<string> {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type FactRow = typeof aiMemories.$inferSelect;

export function toFact(row: Pick<FactRow, "id" | "kind" | "content" | "saidOn" | "lastSeenOn" | "seenCount" | "validThrough" | "source" | "confidence" | "sensitive" | "pinned" | "sourceConversationId">): MemoryFact {
    return {
        id: row.id,
        kind: row.kind,
        content: row.content,
        saidOn: row.saidOn,
        lastSeenOn: row.lastSeenOn,
        seenCount: row.seenCount,
        validThrough: row.validThrough,
        source: row.source,
        confidence: row.confidence,
        sensitive: row.sensitive,
        pinned: row.pinned,
        conversationId: row.sourceConversationId,
    };
}

const FACT_COLUMNS = {
    id: aiMemories.id,
    kind: aiMemories.kind,
    content: aiMemories.content,
    saidOn: aiMemories.saidOn,
    lastSeenOn: aiMemories.lastSeenOn,
    seenCount: aiMemories.seenCount,
    validThrough: aiMemories.validThrough,
    source: aiMemories.source,
    confidence: aiMemories.confidence,
    sensitive: aiMemories.sensitive,
    pinned: aiMemories.pinned,
    sourceConversationId: aiMemories.sourceConversationId,
};

const active = (userId: string) => and(eq(aiMemories.userId, userId), eq(aiMemories.status, "active"));

/** Sources and kinds Basic may read: only what the person said (or told the chat), never what Full learned from activity. */
const BASIC_SOURCES = ["explicit", "chat"] as const;

/**
 * The one predicate for what a mode may read. Full reads every active fact; Basic only what the person said.
 * What Full learned stays stored when the person returns to Basic: it is unused until they return to Full.
 */
export const usableBy = (userId: string, mode: MemoryMode | null) =>
    mode === "full" ? active(userId)
        : and(active(userId), inArray(aiMemories.source, [...BASIC_SOURCES]), notInArray(aiMemories.kind, [...FULL_ONLY_KINDS]));

/** `usableBy` as raw SQL for the profile's CTE. */
const usableSql = (mode: MemoryMode | null) =>
    mode === "full" ? sql`TRUE`
        : sql`source IN ('explicit', 'chat') AND kind NOT IN (${sql.join(FULL_ONLY_KINDS.map((k) => sql`${k}`), sql`, `)})`;

export interface NewFact {
    kind: MemoryKind;
    content: string;
    value?: Record<string, unknown> | null;
    /** From `embedText`; null when the embedding call failed (the fact is still saved and searchable by words). */
    embedding?: number[] | null;
    embeddingModel?: string | null;
    saidOn: string;
    validThrough?: string | null;
    source: FactRow["source"];
    confidence: FactRow["confidence"];
    sensitive?: boolean;
    pinned?: boolean;
    conversationId?: string | null;
    messageId?: string | null;
    /** Hashed instead of the text when the wording carries counts that change (patterns, durations). */
    key?: string;
}

/** The row a new fact inserts; optional fields default to empty. */
function newFactRow(userId: string, fact: NewFact, hash: string) {
    const { value = null, embedding = null, embeddingModel = null, validThrough = null, sensitive = false, pinned = false, conversationId = null, messageId = null } = fact;
    return {
        userId,
        kind: fact.kind,
        content: fact.content,
        value,
        embedding,
        embeddingModel: embedding ? embeddingModel : null,
        contentHash: hash,
        saidOn: fact.saidOn,
        lastSeenOn: fact.saidOn,
        validThrough,
        source: fact.source,
        confidence: fact.confidence,
        sensitive,
        pinned,
        sourceConversationId: conversationId,
        sourceMessageId: messageId,
    };
}

/**
 * Inserts a fact. An exact repeat (same normalized text) of an active fact reinforces it instead;
 * a repeat of a forgotten one is refused (`null`), so a forgotten thing isn't relearned.
 */
export async function insertFact(tx: Tx, userId: string, fact: NewFact): Promise<{ id: string; created: boolean } | null> {
    const hash = await contentHash(fact.key ?? fact.content);
    const [same] = await tx
        .select({ id: aiMemories.id, status: aiMemories.status })
        .from(aiMemories)
        .where(and(eq(aiMemories.userId, userId), eq(aiMemories.contentHash, hash)))
        .orderBy(asc(aiMemories.status)) // 'active' sorts before 'forgotten'
        .limit(1);
    if (same?.status === "forgotten") return null;
    if (same) {
        await reinforceFact(tx, userId, same.id, fact.saidOn);
        return { id: same.id, created: false };
    }
    const [row] = await tx
        .insert(aiMemories)
        .values(newFactRow(userId, fact, hash))
        // Two writers saving the same new words at once (a chat and a note, or `remember` and the job): the
        // second waits for the first to commit, inserts nothing, and reinforces the row the first one made.
        .onConflictDoNothing({ target: [aiMemories.userId, aiMemories.contentHash], where: sql`${aiMemories.status} = 'active'` })
        .returning({ id: aiMemories.id });
    if (row) return { id: row.id, created: true };
    const [winner] = await tx
        .select({ id: aiMemories.id })
        .from(aiMemories)
        .where(and(active(userId), eq(aiMemories.contentHash, hash)));
    if (!winner) return null;
    await reinforceFact(tx, userId, winner.id, fact.saidOn);
    return { id: winner.id, created: false };
}

/** A repeat: seen once more, today. No rewrite. */
export async function reinforceFact(tx: Tx, userId: string, id: string, today: string): Promise<void> {
    await tx
        .update(aiMemories)
        .set({ seenCount: sql`${aiMemories.seenCount} + 1`, lastSeenOn: today, updatedAt: sql`now()` })
        .where(and(eq(aiMemories.userId, userId), eq(aiMemories.id, id), eq(aiMemories.status, "active")));
}

/** An update: new wording or value, same `saidOn`, re-embedded. A correction is stated, so it is never inferred. */
export async function updateFact(
    tx: Tx,
    userId: string,
    id: string,
    patch: { content: string; value?: Record<string, unknown> | null; embedding?: number[] | null; embeddingModel?: string | null; today: string; validThrough?: string | null },
): Promise<boolean> {
    const hash = await contentHash(patch.content);
    // The new words are another row's (content_hash is unique among active facts): an active one is the same fact
    // seen again, so this one folds into it; forgotten words are never brought back.
    const [same] = await tx
        .select({ id: aiMemories.id, status: aiMemories.status })
        .from(aiMemories)
        .where(and(eq(aiMemories.userId, userId), eq(aiMemories.contentHash, hash), sql`${aiMemories.id} <> ${id}`))
        .orderBy(asc(aiMemories.status))
        .limit(1);
    if (same?.status === "forgotten") return false;
    if (same) {
        const gone = await tx.delete(aiMemories).where(and(active(userId), eq(aiMemories.id, id))).returning({ id: aiMemories.id });
        if (gone.length > 0) await reinforceFact(tx, userId, same.id, patch.today);
        return gone.length > 0;
    }
    const rows = await tx
        .update(aiMemories)
        .set({
            content: patch.content,
            contentHash: hash,
            ...(patch.value !== undefined && { value: patch.value }),
            ...(patch.validThrough !== undefined && { validThrough: patch.validThrough }),
            embedding: patch.embedding ?? null,
            embeddingModel: patch.embedding ? patch.embeddingModel ?? null : null,
            lastSeenOn: patch.today,
            seenCount: sql`${aiMemories.seenCount} + 1`,
            updatedAt: sql`now()`,
        })
        .where(and(eq(aiMemories.userId, userId), eq(aiMemories.id, id), eq(aiMemories.status, "active")))
        .returning({ id: aiMemories.id });
    return rows.length > 0;
}

/** The page's cursor: where the last fact shown sits in `lastSeenOn desc, createdAt desc, id desc`. */
const encodeCursor = (row: { lastSeenOn: string; createdAt: string; id: string }) => btoa(JSON.stringify([row.lastSeenOn, row.createdAt, row.id])).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
function decodeCursor(cursor: string): [string, string, string] | null {
    try {
        const parts = JSON.parse(atob(cursor.replaceAll("-", "+").replaceAll("_", "/")));
        return Array.isArray(parts) && parts.length === 3 && parts.every((p) => typeof p === "string") ? (parts as [string, string, string]) : null;
    } catch {
        return null;
    }
}

/** 30 of the person's active facts, newest mention first, after `cursor` (the end of the previous page). */
export async function listFacts(tx: Tx, userId: string, cursor?: string): Promise<{ facts: MemoryFact[]; nextCursor: string | null }> {
    const after = cursor ? decodeCursor(cursor) : null;
    // createdAt at full microsecond precision, or the cursor would sit just behind the row it names.
    const createdAt = sql<string>`to_json(${aiMemories.createdAt}) #>> '{}'`;
    const rows = await tx
        .select({ ...FACT_COLUMNS, createdAt })
        .from(aiMemories)
        .where(and(active(userId), after ? sql`(${aiMemories.lastSeenOn}, ${aiMemories.createdAt}, ${aiMemories.id}) < (${after[0]}::date, ${after[1]}::timestamptz, ${after[2]}::uuid)` : undefined))
        .orderBy(desc(aiMemories.lastSeenOn), desc(aiMemories.createdAt), desc(aiMemories.id))
        .limit(MEMORY_PAGE_SIZE + 1);
    const page = rows.slice(0, MEMORY_PAGE_SIZE);
    return { facts: page.map(toFact), nextCursor: rows.length > MEMORY_PAGE_SIZE ? encodeCursor(page[page.length - 1]) : null };
}

/** Forgotten items, as topic labels only (the text is scrubbed once the Undo window passes). */
export async function listForgotten(tx: Tx, userId: string): Promise<{ id: string; label: string }[]> {
    const rows = await tx
        .select({ id: aiMemories.id, content: aiMemories.content, kind: aiMemories.kind, forgottenAt: aiMemories.forgottenAt })
        .from(aiMemories)
        .where(and(eq(aiMemories.userId, userId), eq(aiMemories.status, "forgotten")))
        .orderBy(desc(aiMemories.forgottenAt));
    return rows.map((row) => ({ id: row.id, label: row.content }));
}

/** Forgets one fact now. Its text stays for the Undo window, then {@link scrubForgotten} reduces it to a label. */
export async function forgetFact(tx: Tx, userId: string, id: string, label?: string): Promise<{ id: string; content: string } | null> {
    const rows = await tx
        .update(aiMemories)
        .set({
            status: "forgotten",
            forgottenAt: sql`now()`,
            updatedAt: sql`now()`,
            // The model's topic, if it gave one: the scrub falls back to the kind's name.
            // A duration fact keeps its group, so Undo can bring its answers back with it.
            value: sql`NULLIF(CASE WHEN ${label ?? null}::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('label', ${label ?? null}::text) END || CASE WHEN ${aiMemories.value} ? 'group' THEN jsonb_build_object('group', ${aiMemories.value} -> 'group') ELSE '{}'::jsonb END, '{}'::jsonb)`,
        })
        .where(and(eq(aiMemories.userId, userId), eq(aiMemories.id, id), eq(aiMemories.status, "active")))
        .returning({ id: aiMemories.id, content: aiMemories.content, kind: aiMemories.kind, group: sql<string | null>`${aiMemories.value} ->> 'group'` });
    const row = rows[0];
    if (!row) return null;
    // Forgetting a duration hides the answers behind it too, until Undo's window ends (every caller: page, chat, MCP).
    if (row.kind === "duration" && row.group) await hideGroupReports(tx, userId, row.group);
    // So does forgetting a "when you plan" pattern: the choices it was counted from.
    if (row.kind === "pattern" && row.group?.startsWith("slot:")) await hidePlanningGroup(tx, userId, row.group);
    return { id: row.id, content: row.content };
}

/** Undo: back to active inside the window. Returns the fact, or null when it's gone or the window passed. */
export async function restoreFact(tx: Tx, userId: string, id: string): Promise<MemoryFact | null> {
    const rows = await tx
        .update(aiMemories)
        .set({ status: "active", forgottenAt: null, value: sql`NULLIF(${aiMemories.value} - 'label', '{}'::jsonb)`, updatedAt: sql`now()` })
        .where(and(
            eq(aiMemories.userId, userId),
            eq(aiMemories.id, id),
            eq(aiMemories.status, "forgotten"),
            sql`${aiMemories.forgottenAt} > now() - make_interval(mins => ${UNDO_WINDOW_MINUTES})`,
        ))
        .returning(FACT_COLUMNS);
    if (!rows[0]) return null;
    // Undo brings back what the fact was counted from: a duration's answers, a "when you plan" pattern's choices.
    const group = rows[0].kind === "duration" || rows[0].kind === "pattern" ? await groupOf(tx, userId, id) : null;
    if (group && rows[0].kind === "duration") await showGroupReports(tx, userId, group);
    if (group?.startsWith("slot:") && rows[0].kind === "pattern") await showPlanningGroup(tx, userId, group);
    return toFact(rows[0]);
}

/** The group a pattern or duration fact stands for (kept through Forget so Undo can restore what it was counted from). */
async function groupOf(tx: Tx, userId: string, id: string): Promise<string | null> {
    const [row] = await tx.select({ group: sql<string | null>`${aiMemories.value} ->> 'group'` }).from(aiMemories).where(and(eq(aiMemories.userId, userId), eq(aiMemories.id, id)));
    return row?.group ?? null;
}

/** The slot records a "when you plan" pattern was counted from: "slot:all" is every one, "slot:<list>" that list's. */
const slotRecords = (userId: string, group: string, extra: SQL) => {
    const list = group.slice("slot:".length);
    return and(eq(planningRecords.userId, userId), eq(planningRecords.kind, "slot"), list === "all" ? undefined : eq(planningRecords.projectId, list), extra);
};
async function hidePlanningGroup(tx: Tx, userId: string, group: string): Promise<void> {
    await tx.update(planningRecords).set({ forgottenAt: sql`now()` }).where(slotRecords(userId, group, sql`${planningRecords.forgottenAt} IS NULL`));
}
async function showPlanningGroup(tx: Tx, userId: string, group: string): Promise<void> {
    await tx.update(planningRecords).set({ forgottenAt: null }).where(slotRecords(userId, group, sql`${planningRecords.forgottenAt} IS NOT NULL`));
}

/** Undo for a save: the fact was new, so it goes. Only what was just created (the receipt's own id). */
export async function deleteFact(tx: Tx, userId: string, id: string): Promise<boolean> {
    const rows = await tx.delete(aiMemories).where(and(eq(aiMemories.userId, userId), eq(aiMemories.id, id))).returning({ id: aiMemories.id });
    return rows.length > 0;
}

/**
 * The chats' facts when their source goes (a chat deleted, or switched to "Don't learn from this chat"): what only
 * that chat taught goes with it; a fact seen again elsewhere (`seenCount > 1`) keeps its words and loses the link.
 * Called before the chat is deleted, while the link still exists.
 */
export async function dropChatFacts(tx: Tx, userId: string, conversations: string[] | SQLWrapper): Promise<void> {
    const from = inArray(aiMemories.sourceConversationId, conversations);
    await tx.delete(aiMemories).where(and(active(userId), eq(aiMemories.seenCount, 1), from));
    await tx.update(aiMemories).set({ sourceConversationId: null }).where(and(eq(aiMemories.userId, userId), from));
}

/**
 * Facts read from a task note, or from an old chat by the catch-up, whose source is gone (the note deleted, the chat deleted):
 * the ones nothing else repeated go. Nightly, whatever the mode. A note's facts carry its task id as their source id.
 */
export async function dropOrphanedFacts(tx: Tx, userId: string): Promise<number> {
    const rows = await tx
        .delete(aiMemories)
        .where(and(
            active(userId),
            eq(aiMemories.seenCount, 1),
            isNotNull(aiMemories.sourceMessageId),
            or(
                and(eq(aiMemories.source, "note"), sql`NOT EXISTS (SELECT 1 FROM ${taskNotes} n WHERE n.user_id = ${aiMemories.userId} AND n.task_id::text = ${aiMemories.sourceMessageId})`),
                and(eq(aiMemories.source, "backfill"), sql`NOT EXISTS (SELECT 1 FROM ${aiMessages} m WHERE m.id = ${aiMemories.sourceMessageId})`),
            ),
        ))
        .returning({ id: aiMemories.id });
    return rows.length;
}

/** Clear all: every fact, forgotten tombstones included. */
export async function clearFacts(tx: Tx, userId: string): Promise<number> {
    const rows = await tx.delete(aiMemories).where(eq(aiMemories.userId, userId)).returning({ id: aiMemories.id });
    return rows.length;
}

const KIND_LABEL: Record<MemoryKind, string> = {
    preference: "a preference",
    quirk: "a quirk",
    life: "something about your life",
    constraint: "protected time",
    pattern: "a pattern",
    duration: "how long something takes",
    assist: "what helps",
};

/**
 * Once the Undo window has passed, a forgotten fact keeps only a topic label: the model's topic, else the
 * kind's name. Its hash stays so the same words are never relearned, and so does its embedding, so a paraphrase
 * isn't either ({@link isForgotten}); its text and value are dropped.
 */
export async function scrubForgotten(tx: Tx, userId: string): Promise<number> {
    // The answers behind a forgotten duration fact, and the choices behind a forgotten pattern, go with it once Undo can no longer bring it back.
    await tx.delete(durationReports).where(and(
        eq(durationReports.userId, userId),
        sql`${durationReports.forgottenAt} <= now() - make_interval(mins => ${UNDO_WINDOW_MINUTES})`,
    ));
    await tx.delete(planningRecords).where(and(
        eq(planningRecords.userId, userId),
        sql`${planningRecords.forgottenAt} <= now() - make_interval(mins => ${UNDO_WINDOW_MINUTES})`,
    ));
    // A forgotten "when you plan" pattern leaves no tombstone: its choices are gone, so if the person keeps planning
    // that way it may be learned again from new ones (and forgotten again).
    const expired = sql`${aiMemories.forgottenAt} <= now() - make_interval(mins => ${UNDO_WINDOW_MINUTES})`;
    await tx.delete(aiMemories).where(and(eq(aiMemories.userId, userId), eq(aiMemories.status, "forgotten"), eq(aiMemories.kind, "pattern"), sql`${aiMemories.value} ->> 'group' LIKE 'slot:%'`, expired));
    const rows = await tx
        .select({ id: aiMemories.id, kind: aiMemories.kind, value: aiMemories.value })
        .from(aiMemories)
        .where(and(
            eq(aiMemories.userId, userId),
            eq(aiMemories.status, "forgotten"),
            expired,
            sql`${aiMemories.value} ->> 'scrubbed' IS DISTINCT FROM 'true'`,
        ));
    for (const row of rows) {
        const label = String((row.value as { label?: unknown } | null)?.label ?? KIND_LABEL[row.kind]).slice(0, MEMORY_LABEL_MAX);
        await tx
            .update(aiMemories)
            .set({ content: label, value: { scrubbed: true } })
            .where(and(eq(aiMemories.userId, userId), eq(aiMemories.id, row.id)));
    }
    return rows.length;
}

/** Which of these fact ids the mode may still read (active, and usable by it): replayed memory reads check them. */
export async function usableFactIds(tx: Tx, userId: string, mode: MemoryMode, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const rows = await tx.select({ id: aiMemories.id }).from(aiMemories).where(and(usableBy(userId, mode), inArray(aiMemories.id, ids)));
    return rows.map((r) => r.id);
}

/** Active facts, newest wording first, that have an embedding and changed since `since`: the nightly merge's candidates. */
export async function changedFacts(tx: Tx, userId: string, since: string): Promise<{ id: string; kind: MemoryKind; embedding: number[]; embeddingModel: string }[]> {
    const rows = await tx
        .select({ id: aiMemories.id, kind: aiMemories.kind, embedding: aiMemories.embedding, embeddingModel: aiMemories.embeddingModel })
        .from(aiMemories)
        .where(and(active(userId), gt(aiMemories.updatedAt, since), sql`${aiMemories.embedding} IS NOT NULL`, sql`${aiMemories.embeddingModel} IS NOT NULL`));
    return rows.map((r) => ({ id: r.id, kind: r.kind, embedding: r.embedding!, embeddingModel: r.embeddingModel! }));
}

/**
 * Folds `dropId` into `keepId` (the one seen more recently): the first mention and the counts survive,
 * the repeat goes. Both must still be active; returns whether it merged.
 */
export async function mergeFacts(tx: Tx, userId: string, keepId: string, dropId: string): Promise<boolean> {
    const rows = await tx
        .select({ id: aiMemories.id, saidOn: aiMemories.saidOn, seenCount: aiMemories.seenCount, pinned: aiMemories.pinned })
        .from(aiMemories)
        .where(and(active(userId), inArray(aiMemories.id, [keepId, dropId])));
    const keep = rows.find((r) => r.id === keepId);
    const drop = rows.find((r) => r.id === dropId);
    if (!keep || !drop) return false;
    await tx.delete(aiMemories).where(and(eq(aiMemories.userId, userId), eq(aiMemories.id, dropId)));
    await tx
        .update(aiMemories)
        .set({
            saidOn: [keep.saidOn, drop.saidOn].sort()[0],
            seenCount: keep.seenCount + drop.seenCount,
            pinned: keep.pinned || drop.pinned,
            updatedAt: sql`now()`,
        })
        .where(and(eq(aiMemories.userId, userId), eq(aiMemories.id, keepId)));
    return true;
}

/**
 * Makes the activity-learned facts (patterns and durations) equal what the signals say now: those no
 * longer true are removed, new ones added, and one whose counts moved is reworded in place. Each is
 * identified by its `key`, not its wording, so a pattern the person forgot is never added back (its
 * tombstone hash holds) however its numbers change. Capped at 60 between them. Returns how many changed.
 */
export async function syncActivityFacts(
    tx: Tx,
    userId: string,
    derived: { kind: "pattern" | "duration"; key: string; content: string; value: Record<string, unknown>; embedding: number[] | null; embeddingModel: string }[],
    today: string,
): Promise<number> {
    const wanted = derived.slice(0, 60);
    const hashes = await Promise.all(wanted.map((d) => contentHash(d.key)));
    const current = await tx
        .select({ id: aiMemories.id, contentHash: aiMemories.contentHash, content: aiMemories.content })
        .from(aiMemories)
        .where(and(active(userId), eq(aiMemories.source, "activity"), inArray(aiMemories.kind, ["pattern", "duration"])));
    const keep = new Set(hashes);
    const stale = current.filter((row) => !row.contentHash || !keep.has(row.contentHash));
    let changed = 0;
    if (stale.length) {
        await tx.delete(aiMemories).where(and(eq(aiMemories.userId, userId), inArray(aiMemories.id, stale.map((r) => r.id))));
        changed += stale.length;
    }
    const have = new Map(current.map((r) => [r.contentHash, r]));
    for (const [i, fact] of wanted.entries()) {
        const row = have.get(hashes[i]);
        if (row) {
            if (row.content === fact.content) continue;
            await tx
                .update(aiMemories)
                .set({ content: fact.content, value: fact.value, embedding: fact.embedding, embeddingModel: fact.embedding ? fact.embeddingModel : null, lastSeenOn: today, updatedAt: sql`now()` })
                .where(and(eq(aiMemories.userId, userId), eq(aiMemories.id, row.id)));
            changed++;
            continue;
        }
        const saved = await insertFact(tx, userId, {
            kind: fact.kind,
            key: fact.key,
            content: fact.content,
            value: fact.value,
            embedding: fact.embedding,
            embeddingModel: fact.embeddingModel,
            saidOn: today,
            source: "activity",
            confidence: "observed",
        });
        if (saved?.created) changed++;
    }
    return changed;
}

/** Inferred facts nobody reinforced for 60 days are dropped; stated and pinned facts never decay. */
export async function deleteDecayed(tx: Tx, userId: string, today: string): Promise<number> {
    // Anything the person didn't say outright; activity facts are re-derived nightly instead.
    const rows = await tx
        .delete(aiMemories)
        .where(and(active(userId), ne(aiMemories.confidence, "stated"), ne(aiMemories.source, "activity"), eq(aiMemories.pinned, false), lt(aiMemories.lastSeenOn, sql`(${today}::date - 60)`)))
        .returning({ id: aiMemories.id });
    return rows.length;
}

/** Facts whose `validThrough` has passed (a day's grace) are dropped. */
export async function deleteExpired(tx: Tx, userId: string, today: string): Promise<number> {
    const rows = await tx
        .delete(aiMemories)
        .where(and(eq(aiMemories.userId, userId), eq(aiMemories.status, "active"), lt(aiMemories.validThrough, sql`(${today}::date - 1)`)))
        .returning({ id: aiMemories.id });
    return rows.length;
}

export interface NearFact {
    id: string;
    kind: MemoryKind;
    content: string;
    distance: number;
}

/** The closest active facts (of one kind, or any) by cosine distance: an exact scan over one person's few hundred small vectors. */
export async function nearestFacts(tx: Tx, userId: string, embedding: number[], embeddingModel: string, kind: MemoryKind | null, limit = 8, mode?: MemoryMode | null): Promise<NearFact[]> {
    const distance = sql<number>`(${aiMemories.embedding} <=> ${`[${embedding.join(",")}]`}::halfvec)`;
    const rows = await tx
        .select({ id: aiMemories.id, kind: aiMemories.kind, content: aiMemories.content, distance })
        .from(aiMemories)
        .where(and(mode === undefined ? active(userId) : usableBy(userId, mode), kind ? eq(aiMemories.kind, kind) : undefined, eq(aiMemories.embeddingModel, embeddingModel)))
        .orderBy(distance)
        .limit(limit);
    return rows.map((row) => ({ ...row, distance: Number(row.distance) }));
}

/**
 * Is this (a paraphrase of) something the person asked to forget? A forgotten fact keeps its embedding after the
 * scrub, so a statement within {@link FORGOTTEN_DISTANCE} of a tombstone of the same kind and model is the same thing
 * said again and is not learned (the tombstone's id comes back). Without an embedding the exact-text tombstone (`content_hash`) still applies.
 */
export const FORGOTTEN_DISTANCE = 0.15;
export async function isForgotten(tx: Tx, userId: string, embedding: number[] | null, embeddingModel: string, kind: MemoryKind): Promise<string | null> {
    if (!embedding) return null;
    const distance = sql<number>`(${aiMemories.embedding} <=> ${`[${embedding.join(",")}]`}::halfvec)`;
    const [row] = await tx
        .select({ id: aiMemories.id, distance })
        .from(aiMemories)
        .where(and(eq(aiMemories.userId, userId), eq(aiMemories.status, "forgotten"), eq(aiMemories.kind, kind), eq(aiMemories.embeddingModel, embeddingModel), sql`${aiMemories.embedding} IS NOT NULL`))
        .orderBy(distance)
        .limit(1);
    return row && Number(row.distance) <= FORGOTTEN_DISTANCE ? row.id : null;
}

/** About 500 tokens each for the profile that rides along every turn and for what recall adds. */
export const PROFILE_CHAR_BUDGET = 2_000;
/** Life facts whose last relevant day falls inside this window are in the profile; the rest wait for recall. */
const PROFILE_LIFE_WINDOW_DAYS = 30;
/** A stated fact not seen for this long gets one gentle "still true?" the next time it matters. */
const STALE_AFTER_DAYS = 365;

export interface ProfileLine {
    id: string;
    content: string;
    saidOn: string;
    sensitive: boolean;
    /** Last mentioned over a year ago: ask once, in passing, before relying on it. */
    stale?: boolean;
}

/**
 * The always-present profile: pinned facts, preferences, quirks and constraints, and life facts dated
 * within the next 30 days, newest mention first. Any budget left (a person with a small memory has plenty)
 * is filled with their other life facts and what helped, newest first, so the model simply knows them.
 * Patterns and durations are never in it: they come through recall. Built deterministically with no model call.
 */
export async function loadProfile(tx: Tx, userId: string, today: string, mode: MemoryMode | null): Promise<ProfileLine[]> {
    return (await loadProfileCoverage(tx, userId, today, mode)).lines;
}

type ProfileRow = Pick<FactRow, "id" | "content" | "saidOn" | "lastSeenOn" | "sensitive">;

/** Profile and exact recall coverage from ONE statement snapshot, under the caller's RLS identity. */
export async function loadProfileCoverage(tx: Tx, userId: string, today: string, mode: MemoryMode | null): Promise<{ lines: ProfileLine[]; hasRecallCandidates: boolean }> {
    const fields = sql`jsonb_build_object('id', id, 'content', content, 'saidOn', said_on, 'lastSeenOn', last_seen_on, 'sensitive', sensitive)`;
    const [row] = await tx.select({ core: sql<ProfileRow[]>`core`, rest: sql<ProfileRow[]>`rest`, eligible_count: sql<number>`eligible_count` }).from(sql`(
        WITH eligible AS MATERIALIZED (
            SELECT id, kind, pinned, content, said_on, last_seen_on, sensitive, valid_through
            FROM ${aiMemories}
            WHERE user_id = ${userId} AND status = 'active' AND ${usableSql(mode)}
                AND (valid_through IS NULL OR valid_through >= ${today}::date)
        ), core AS (
            SELECT * FROM eligible
            WHERE pinned OR kind IN ('preference', 'quirk', 'constraint')
                OR (kind = 'life' AND valid_through <= ${today}::date + ${PROFILE_LIFE_WINDOW_DAYS}::int)
            ORDER BY pinned DESC, last_seen_on DESC
        ), rest AS (
            SELECT * FROM eligible WHERE kind IN ('life', 'assist')
            ORDER BY last_seen_on DESC LIMIT 60
        )
        SELECT
            (SELECT coalesce(jsonb_agg(${fields} ORDER BY pinned DESC, last_seen_on DESC), '[]'::jsonb) FROM core) AS core,
            (SELECT coalesce(jsonb_agg(${fields} ORDER BY last_seen_on DESC), '[]'::jsonb) FROM rest) AS rest,
            (SELECT count(*)::int FROM eligible) AS eligible_count
    ) AS coverage`);
    const lines = withinBudget(row.core, today);
    const used = lines.reduce((n, l) => n + l.content.length, 0);
    if (used < PROFILE_CHAR_BUDGET) {
        // Exclude all core rows, including those too large to fit: retain existing selection semantics.
        const taken = new Set(row.core.map((r) => r.id));
        lines.push(...withinBudget(row.rest.filter((r) => !taken.has(r.id)), today, PROFILE_CHAR_BUDGET - used));
    }
    return { lines, hasRecallCandidates: row.eligible_count > lines.length };
}

/** Revalidate only the facts a stored context actually used; additions do not invalidate its prefix. */
export async function loadContextFacts(tx: Tx, userId: string, ids: string[], today: string, mode: MemoryMode | null): Promise<ProfileLine[]> {
    if (!ids.length) return [];
    const rows = await tx.select({ id: aiMemories.id, content: aiMemories.content, saidOn: aiMemories.saidOn,
        lastSeenOn: aiMemories.lastSeenOn, sensitive: aiMemories.sensitive }).from(aiMemories)
        .where(and(usableBy(userId, mode), inArray(aiMemories.id, ids),
            or(isNull(aiMemories.validThrough), sql`${aiMemories.validThrough} >= ${today}::date`)));
    return withinBudget(rows, today, Number.POSITIVE_INFINITY);
}

function withinBudget(rows: { id: string; content: string; saidOn: string; lastSeenOn: string; sensitive: boolean }[], today: string, budget = PROFILE_CHAR_BUDGET): ProfileLine[] {
    const lines: ProfileLine[] = [];
    let used = 0;
    for (const row of rows) {
        if (used + row.content.length > budget) continue;
        used += row.content.length;
        lines.push({
            id: row.id,
            content: row.content,
            saidOn: row.saidOn,
            sensitive: row.sensitive,
            ...(daysBetween(row.lastSeenOn, today) > STALE_AFTER_DAYS && { stale: true }),
        });
    }
    return lines;
}

const RRF_K = 60;
const FUSED_FROM_EACH = 20;

/**
 * Hybrid recall: Postgres full-text and exact cosine over this person's facts, fused with reciprocal
 * rank fusion (k = 60) and nudged by how often a fact was seen and by life facts about to matter.
 * Returns up to `limit` facts not already in the profile, within the character budget.
 * `embedding` is null when the query couldn't be embedded: words alone still work.
 */
export async function recallFacts(
    tx: Tx,
    userId: string,
    input: { text: string; embedding: number[] | null; model: string; today: string; exclude: ReadonlySet<string>; mode: MemoryMode | null; limit?: number },
): Promise<ProfileLine[]> {
    const { text, embedding, model, today, exclude, mode, limit = 8 } = input;
    // A turn is a sentence, not a search box: any shared word counts (OR), ranked by how many. Letters and digits only,
    // so the text can never be tsquery syntax.
    const terms = [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 24).join(" | ");
    const words = terms
        ? await tx
              .select({ id: aiMemories.id })
              .from(aiMemories)
              .where(and(usableBy(userId, mode), sql`${aiMemories.search} @@ to_tsquery('english', ${terms})`))
              .orderBy(sql`ts_rank(${aiMemories.search}, to_tsquery('english', ${terms})) DESC`)
              .limit(FUSED_FROM_EACH)
        : [];
    const dense = embedding ? await nearestFacts(tx, userId, embedding, model, null, FUSED_FROM_EACH, mode) : [];

    const score = new Map<string, number>();
    const add = (ids: string[]) => ids.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
    add(words.map((w) => w.id));
    add(dense.map((d) => d.id));
    const ids = [...score.keys()].filter((id) => !exclude.has(id));
    if (ids.length === 0) return [];

    const rows = await tx
        .select({
            id: aiMemories.id,
            content: aiMemories.content,
            saidOn: aiMemories.saidOn,
            lastSeenOn: aiMemories.lastSeenOn,
            sensitive: aiMemories.sensitive,
            seenCount: aiMemories.seenCount,
            validThrough: aiMemories.validThrough,
        })
        .from(aiMemories)
        .where(and(usableBy(userId, mode), inArray(aiMemories.id, ids), or(isNull(aiMemories.validThrough), sql`${aiMemories.validThrough} >= ${today}::date`)));
    const boosted = rows.map((row) => {
        const soon = row.validThrough && daysBetween(today, row.validThrough) <= PROFILE_LIFE_WINDOW_DAYS ? 0.01 : 0;
        return { row, score: (score.get(row.id) ?? 0) + Math.min(row.seenCount, 5) * 0.001 + soon };
    });
    boosted.sort((a, b) => b.score - a.score);
    return withinBudget(boosted.slice(0, limit).map((b) => b.row), today);
}

export interface PastChatHit {
    conversationId: string;
    title: string | null;
    /** When it was said (an instant): the caller names the day in the person's zone. */
    at: string;
    snippet: string;
}

/**
 * The person's own words in past chats, by words (Postgres full-text on `search_text`; messages are
 * never embedded). `after` / `before` bound when it was said.
 */
export async function searchPastChats(
    tx: Tx,
    userId: string,
    input: { query: string; after?: string; before?: string; excludeConversationId?: string; limit?: number },
): Promise<PastChatHit[]> {
    const query = sql`websearch_to_tsquery('english', ${input.query})`;
    // The expression the GIN index is built on (migration 0016).
    const document = sql`to_tsvector('english', coalesce(${aiMessages.searchText}, ''))`;
    const rows = await tx
        .select({
            conversationId: aiMessages.conversationId,
            title: aiConversations.title,
            at: aiMessages.createdAt,
            snippet: sql<string>`ts_headline('english', ${aiMessages.searchText}, ${query}, 'StartSel=, StopSel=, MaxWords=35, MinWords=12')`,
        })
        .from(aiMessages)
        .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
        .where(and(
            eq(aiMessages.userId, userId),
            eq(aiMessages.role, "user"),
            sql`${document} @@ ${query}`,
            input.after ? gte(aiMessages.createdAt, input.after) : undefined,
            input.before ? lt(aiMessages.createdAt, input.before) : undefined,
        ))
        .orderBy(sql`ts_rank(${document}, ${query}) DESC`, desc(aiMessages.createdAt))
        .limit(input.limit ?? 8);
    return rows;
}
