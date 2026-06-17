/**
 * RLS-scoped repository for AI conversation / message persistence.
 *
 * Every function takes a `tx: Tx` — the CALLER (the route) wraps these in
 * `withRls` so they all compose inside a single RLS transaction. We never call
 * `withRls`/`getDbClient` here. Queries are additionally scoped with
 * `eq(table.userId, userId)` defensively, matching existing domain style, even
 * though RLS already enforces ownership.
 *
 * We persist UIMessage fidelity only (see message-mapper.ts) — never
 * ModelMessages. See docs/ai_upgrade/08.
 */
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { aiConversations, aiMessages } from "../../../db/schema";
import type { Tx } from "../../../types/db";
import { AppError } from "../../../platform/errors";
import { logger } from "../../../platform/log";
import {
    nextOrderIndex,
    uiMessageToRow,
    type MessageStatus,
    type StoredMessage,
} from "./message-mapper";

/** Default page size when loading a thread's messages. */
const DEFAULT_MESSAGE_LIMIT = 100;
/** Hard cap so a malicious/large `limit` cannot fetch an unbounded thread. */
const MAX_MESSAGE_LIMIT = 500;
/** Default page size when listing a user's conversations. */
const DEFAULT_CONVERSATION_LIMIT = 50;
/** Hard cap for conversation listing. */
const MAX_CONVERSATION_LIMIT = 100;

function clampLimit(requested: number | undefined, fallback: number, max: number): number {
    if (requested === undefined) return fallback;
    if (!Number.isFinite(requested) || requested <= 0) return fallback;
    return Math.min(Math.floor(requested), max);
}

/**
 * Resolve an existing conversation (asserting ownership) or create a new one.
 * Throws 404 if a provided `conversationId` does not resolve to an owned row.
 */
export async function resolveOrCreateConversation(
    tx: Tx,
    userId: string,
    args: { conversationId?: string; model?: string },
): Promise<{ id: string; created: boolean }> {
    if (args.conversationId) {
        const [existing] = await tx
            .select({ id: aiConversations.id })
            .from(aiConversations)
            .where(and(eq(aiConversations.id, args.conversationId), eq(aiConversations.userId, userId)));

        if (existing) return { id: existing.id, created: false };

        // Create-if-absent with the client-chosen id (still ownership-scoped by
        // userId) so the client can own the thread id — needed for the sidebar /
        // load-by-id flow where the frontend mints a UUID before the first turn.
        const [created] = await tx
            .insert(aiConversations)
            .values({ id: args.conversationId, userId, model: args.model ?? null })
            .onConflictDoNothing()
            .returning({ id: aiConversations.id });

        return { id: created?.id ?? args.conversationId, created: true };
    }

    const [row] = await tx
        .insert(aiConversations)
        .values({ userId, model: args.model ?? null })
        .returning({ id: aiConversations.id });

    return { id: row.id, created: true };
}

/**
 * Load a thread's messages ordered by `orderIndex` ASC, mapped to
 * StoredMessage. Paginates forward by `beforeOrderIndex` (exclusive). Applies a
 * sane default + max limit.
 */
export async function loadConversationMessages(
    tx: Tx,
    userId: string,
    conversationId: string,
    opts?: { limit?: number; beforeOrderIndex?: number },
): Promise<StoredMessage[]> {
    const limit = clampLimit(opts?.limit, DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT);

    const conditions = [
        eq(aiMessages.conversationId, conversationId),
        eq(aiMessages.userId, userId),
    ];
    if (opts?.beforeOrderIndex !== undefined) {
        conditions.push(lt(aiMessages.orderIndex, opts.beforeOrderIndex));
    }

    const rows = await tx
        .select({
            id: aiMessages.id,
            role: aiMessages.role,
            parts: aiMessages.parts,
            metadata: aiMessages.metadata,
            status: aiMessages.status,
            orderIndex: aiMessages.orderIndex,
        })
        .from(aiMessages)
        .where(and(...conditions))
        .orderBy(asc(aiMessages.orderIndex))
        .limit(limit);

    return rows.map((row) => ({
        id: row.id,
        role: row.role,
        parts: row.parts,
        metadata: row.metadata,
        status: row.status,
        orderIndex: row.orderIndex,
    }));
}

/** Highest `orderIndex` in a thread, or null when empty. */
export async function getLastOrderIndex(tx: Tx, conversationId: string): Promise<number | null> {
    const [row] = await tx
        .select({ orderIndex: aiMessages.orderIndex })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId))
        .orderBy(desc(aiMessages.orderIndex))
        .limit(1);

    return row?.orderIndex ?? null;
}

/**
 * Append an incoming user message idempotently. If a row with this `id` already
 * exists, the insert no-ops (onConflictDoNothing on the PK) and we return
 * `deduped: true` so retries don't duplicate. Status is 'complete'.
 */
export async function appendUserMessage(
    tx: Tx,
    userId: string,
    conversationId: string,
    msg: { id: string; role: string; parts?: unknown[]; metadata?: Record<string, unknown> },
    _opts: { clientMessageId?: string },
): Promise<{ id: string; deduped: boolean }> {
    const lastOrderIndex = await getLastOrderIndex(tx, conversationId);
    const row = uiMessageToRow(msg, {
        conversationId,
        userId,
        orderIndex: nextOrderIndex(lastOrderIndex),
        status: "complete",
    });

    const inserted = await tx
        .insert(aiMessages)
        .values(row)
        .onConflictDoNothing({ target: aiMessages.id })
        .returning({ id: aiMessages.id });

    // No row returned → the PK already existed → this is a deduped retry.
    return { id: msg.id, deduped: inserted.length === 0 };
}

/**
 * Upsert the assistant UIMessage row. onConflictDoUpdate on the PK allows status
 * transitions (streaming → complete/failed/aborted) and part/metadata refreshes
 * across `onFinish` saves. Order index is placed after the latest message.
 */
export async function saveAssistantMessage(
    tx: Tx,
    userId: string,
    conversationId: string,
    msg: { id: string; role: string; parts?: unknown[]; metadata?: Record<string, unknown> },
    opts: { status?: "complete" | "failed" | "aborted"; metadata?: Record<string, unknown> },
): Promise<void> {
    const status: MessageStatus = opts.status ?? "complete";
    const lastOrderIndex = await getLastOrderIndex(tx, conversationId);
    const row = uiMessageToRow(
        { ...msg, metadata: opts.metadata ?? msg.metadata },
        {
            conversationId,
            userId,
            orderIndex: nextOrderIndex(lastOrderIndex),
            status,
        },
    );

    await tx
        .insert(aiMessages)
        .values(row)
        .onConflictDoUpdate({
            target: aiMessages.id,
            // Keep the original orderIndex on update so a re-save (streaming →
            // complete) does not shuffle the message to the end of the thread.
            set: {
                parts: row.parts,
                metadata: row.metadata,
                status: row.status,
            },
        });
}

/**
 * Best-effort bump of conversation activity. Failures are logged (`ai_persist_failed`)
 * and swallowed — a touch failure must never break an already-streamed response.
 */
export async function touchConversation(
    tx: Tx,
    conversationId: string,
    opts?: {
        lastMessageAt?: string;
        title?: string;
        model?: string;
        metadataMerge?: Record<string, unknown>;
    },
): Promise<void> {
    try {
        const set: Record<string, unknown> = {
            lastMessageAt: opts?.lastMessageAt ?? sql`NOW()`,
            updatedAt: sql`NOW()`,
        };
        if (opts?.title !== undefined) set.title = opts.title;
        if (opts?.model !== undefined) set.model = opts.model;
        if (opts?.metadataMerge !== undefined) {
            set.metadata = sql`${aiConversations.metadata} || ${JSON.stringify(opts.metadataMerge)}::jsonb`;
        }

        await tx.update(aiConversations).set(set).where(eq(aiConversations.id, conversationId));
    } catch (error) {
        logger.warn("ai", "ai_persist_failed", { op: "touchConversation", conversationId, error });
    }
}

/** List a user's conversations, most recent first (nulls last), paginated. */
export async function listConversations(
    tx: Tx,
    userId: string,
    opts?: { limit?: number; cursor?: string },
): Promise<Array<{ id: string; title: string | null; lastMessageAt: string | null; archived: boolean }>> {
    const limit = clampLimit(opts?.limit, DEFAULT_CONVERSATION_LIMIT, MAX_CONVERSATION_LIMIT);

    const conditions = [eq(aiConversations.userId, userId)];
    // Cursor paginates by lastMessageAt (older than the cursor timestamp).
    if (opts?.cursor) {
        conditions.push(lt(aiConversations.lastMessageAt, opts.cursor));
    }

    return tx
        .select({
            id: aiConversations.id,
            title: aiConversations.title,
            lastMessageAt: aiConversations.lastMessageAt,
            archived: aiConversations.archived,
        })
        .from(aiConversations)
        .where(and(...conditions))
        .orderBy(sql`${aiConversations.lastMessageAt} DESC NULLS LAST`)
        .limit(limit);
}

/** Fetch a single owned conversation's metadata, or null if not found. */
export async function getConversation(
    tx: Tx,
    userId: string,
    conversationId: string,
): Promise<{
    id: string;
    title: string | null;
    model: string | null;
    lastMessageAt: string | null;
    archived: boolean;
    activeStreamId: string | null;
    lastStreamId: string | null;
    lastStreamStatus: string | null;
} | null> {
    const [row] = await tx
        .select({
            id: aiConversations.id,
            title: aiConversations.title,
            model: aiConversations.model,
            lastMessageAt: aiConversations.lastMessageAt,
            archived: aiConversations.archived,
            // The client's `resume` needs to know a stream is live.
            activeStreamId: aiConversations.activeStreamId,
            // …and the most recently finished stream, so a slightly-late re-attach can
            // grace-replay its still-alive chunk-log instead of popping in the DB text.
            lastStreamId: aiConversations.lastStreamId,
            lastStreamStatus: aiConversations.lastStreamStatus,
        })
        .from(aiConversations)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));

    return row ?? null;
}

/**
 * Mark a conversation as having a live producing stream. Set when production
 * starts so the resume GET can find the in-flight chunk-log (doc Update 4 §7.6).
 */
export async function setActiveStream(
    tx: Tx,
    userId: string,
    conversationId: string,
    streamId: string,
): Promise<void> {
    await tx
        .update(aiConversations)
        .set({ activeStreamId: streamId })
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
}

/**
 * Compare-and-finalize the active stream pointer: only acts if it still points at
 * *this* stream, so a producer finishing late never clobbers a newer turn's pointer
 * (doc Update 4 §7.6). In one UPDATE it clears `active_stream_id` AND records this
 * stream as `last_stream_id` + its terminal `last_stream_status`, so a slightly-late
 * re-attach can still grace-replay the just-finished chunk-log. The producer's
 * onFinish is the authoritative finalize.
 */
export async function finalizeActiveStream(
    tx: Tx,
    userId: string,
    conversationId: string,
    streamId: string,
    status: MessageStatus,
): Promise<void> {
    await tx
        .update(aiConversations)
        .set({ activeStreamId: null, lastStreamId: streamId, lastStreamStatus: status })
        .where(
            and(
                eq(aiConversations.id, conversationId),
                eq(aiConversations.userId, userId),
                eq(aiConversations.activeStreamId, streamId),
            ),
        );
}

/** Rename and/or archive a conversation. Throws 404 if not owned/found. */
export async function renameOrArchiveConversation(
    tx: Tx,
    userId: string,
    conversationId: string,
    patch: { title?: string; archived?: boolean },
): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: sql`NOW()` };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.archived !== undefined) set.archived = patch.archived;

    const updated = await tx
        .update(aiConversations)
        .set(set)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
        .returning({ id: aiConversations.id });

    if (updated.length === 0) throw new AppError(404, "NOT_FOUND", "Conversation not found");
}

/** Delete a conversation (messages cascade via FK). Throws 404 if not owned/found. */
export async function deleteConversation(
    tx: Tx,
    userId: string,
    conversationId: string,
): Promise<void> {
    const deleted = await tx
        .delete(aiConversations)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
        .returning({ id: aiConversations.id });

    if (deleted.length === 0) throw new AppError(404, "NOT_FOUND", "Conversation not found");
}
