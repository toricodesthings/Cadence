import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { aiConversations, aiImages, aiMessages } from "../../../db/schema";
import type { Tx } from "../../../types/db";
import type { ConversationDetail, ConversationListItem } from "@cadence/contracts/ai";
import { AppError } from "../../../platform/errors";
import { dropChatFacts } from "../memory/memory-store";
import { logger } from "../../../platform/log";
import { historyWindowStart, MAX_HISTORY_TURNS } from "../safety/input-guard";
import { nextOrderIndex, uiMessageToRow, type MessageStatus, type StoredMessage } from "./message-mapper";
import { assertRowRoom } from "../../../platform/storage-ceiling";

const DEFAULT_MESSAGE_LIMIT = 100;
const MAX_MESSAGE_LIMIT = 500;
const DEFAULT_CONVERSATION_LIMIT = 50;
const MAX_CONVERSATION_LIMIT = 100;

function clampLimit(requested: number | undefined, fallback: number, max: number): number {
    if (requested === undefined) return fallback;
    if (!Number.isFinite(requested) || requested <= 0) return fallback;
    return Math.min(Math.floor(requested), max);
}

export async function resolveOrCreateConversation(
    tx: Tx,
    userId: string,
    args: { conversationId?: string; model?: string },
): Promise<{ id: string; created: boolean; title: string | null; activeStreamId?: string | null }> {
    if (args.conversationId) {
        const [existing] = await tx
            .select({
                id: aiConversations.id,
                title: aiConversations.title,
                activeStreamId: aiConversations.activeStreamId,
            })
            .from(aiConversations)
            .where(and(eq(aiConversations.id, args.conversationId), eq(aiConversations.userId, userId)))
            .for("update");

        if (existing)
            return { id: existing.id, created: false, title: existing.title, activeStreamId: existing.activeStreamId };

        await assertRowRoom(tx, userId, "conversations");
        const [created] = await tx
            .insert(aiConversations)
            .values({ id: args.conversationId, userId, model: args.model ?? null })
            .onConflictDoNothing()
            .returning({ id: aiConversations.id });

        if (!created) throw new AppError(404, "NOT_FOUND", "Conversation not found");
        return { id: created.id, created: true, title: null, activeStreamId: null };
    }

    await assertRowRoom(tx, userId, "conversations");
    const [row] = await tx
        .insert(aiConversations)
        .values({ userId, model: args.model ?? null })
        .returning({ id: aiConversations.id });

    return { id: row.id, created: true, title: null, activeStreamId: null };
}

export async function lockActiveStream(tx: Tx, userId: string, conversationId: string): Promise<string | null> {
    const [row] = await tx
        .select({ activeStreamId: aiConversations.activeStreamId })
        .from(aiConversations)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
        .for("update");
    return row?.activeStreamId ?? null;
}

export async function loadConversationMessages(
    tx: Tx,
    userId: string,
    conversationId: string,
    opts?: { limit?: number; beforeOrderIndex?: number; historyWindow?: boolean },
): Promise<StoredMessage[]> {
    const conditions = [eq(aiMessages.conversationId, conversationId), eq(aiMessages.userId, userId)];
    if (opts?.beforeOrderIndex !== undefined) {
        conditions.push(lt(aiMessages.orderIndex, opts.beforeOrderIndex));
    }

    let limit = clampLimit(opts?.limit, DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT);
    let offset = 0;
    if (opts?.historyWindow) {
        const [counted] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(aiMessages)
            .where(and(...conditions));
        offset = historyWindowStart(counted?.n ?? 0);
        limit = MAX_HISTORY_TURNS;
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
        .limit(limit)
        .offset(offset);

    return rows.map((row) => ({
        id: row.id,
        role: row.role,
        parts: row.parts,
        metadata: row.metadata,
        status: row.status,
        orderIndex: row.orderIndex,
    }));
}

async function getLastOrderIndex(tx: Tx, conversationId: string): Promise<number | null> {
    const [row] = await tx
        .select({ orderIndex: aiMessages.orderIndex })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId))
        .orderBy(desc(aiMessages.orderIndex))
        .limit(1);

    return row?.orderIndex ?? null;
}

export async function appendUserMessage(
    tx: Tx,
    userId: string,
    conversationId: string,
    msg: { id: string; role: string; parts?: unknown[]; metadata?: Record<string, unknown> },
    opts: { clientMessageId?: string },
): Promise<{ id: string; deduped: boolean }> {
    const lastOrderIndex = await getLastOrderIndex(tx, conversationId);
    const row = uiMessageToRow(
        { ...msg, metadata: opts.clientMessageId ? { clientMessageId: opts.clientMessageId } : {} },
        {
            conversationId,
            userId,
            orderIndex: nextOrderIndex(lastOrderIndex),
            status: "complete",
        },
    );

    const inserted = await tx
        .insert(aiMessages)
        .values(row)
        .onConflictDoNothing({ target: aiMessages.id })
        .returning({ id: aiMessages.id });

    return { id: msg.id, deduped: inserted.length === 0 };
}

export async function setTurnContext(
    tx: Tx,
    userId: string,
    conversationId: string,
    messageId: string,
    turnContext: string,
): Promise<void> {
    await tx
        .update(aiMessages)
        .set({ metadata: sql`${aiMessages.metadata} || ${JSON.stringify({ turnContext })}::jsonb` })
        .where(
            and(
                eq(aiMessages.id, messageId),
                eq(aiMessages.conversationId, conversationId),
                eq(aiMessages.userId, userId),
                eq(aiMessages.role, "user"),
            ),
        );
}

export async function truncateMessagesAfter(
    tx: Tx,
    userId: string,
    conversationId: string,
    messageId: string,
): Promise<boolean> {
    const [anchor] = await tx
        .select({ orderIndex: aiMessages.orderIndex })
        .from(aiMessages)
        .where(
            and(
                eq(aiMessages.id, messageId),
                eq(aiMessages.conversationId, conversationId),
                eq(aiMessages.userId, userId),
            ),
        )
        .limit(1);
    if (!anchor) return false;

    await tx
        .delete(aiMessages)
        .where(
            and(
                eq(aiMessages.conversationId, conversationId),
                eq(aiMessages.userId, userId),
                gt(aiMessages.orderIndex, anchor.orderIndex),
            ),
        );
    return true;
}

export async function deleteAllMessages(tx: Tx, userId: string, conversationId: string): Promise<void> {
    await tx
        .delete(aiMessages)
        .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.userId, userId)));
}

export async function saveAssistantMessage(
    tx: Tx,
    userId: string,
    conversationId: string,
    msg: { id: string; role: string; parts?: unknown[]; metadata?: Record<string, unknown> },
    opts: { status?: "complete" | "failed" | "aborted"; metadata?: Record<string, unknown>; onlyIfAbsent?: boolean },
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

    if (opts.onlyIfAbsent) {
        await tx.insert(aiMessages).values(row).onConflictDoNothing({ target: aiMessages.id });
        return;
    }

    await tx
        .insert(aiMessages)
        .values(row)
        .onConflictDoUpdate({
            target: aiMessages.id,
            set: {
                parts: row.parts,
                metadata: row.metadata,
                status: row.status,
            },
        });
}

export async function touchConversation(
    tx: Tx,
    userId: string,
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

        await tx
            .update(aiConversations)
            .set(set)
            .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
    } catch (error) {
        logger.warn("ai", "ai_persist_failed", { op: "touchConversation", conversationId, error });
    }
}

export async function setTitleIfEmpty(tx: Tx, userId: string, conversationId: string, title: string): Promise<void> {
    await tx
        .update(aiConversations)
        .set({ title, updatedAt: sql`NOW()` })
        .where(
            and(
                eq(aiConversations.id, conversationId),
                eq(aiConversations.userId, userId),
                isNull(aiConversations.title),
            ),
        );
}

export async function listConversations(
    tx: Tx,
    userId: string,
    opts?: { limit?: number; cursor?: string },
): Promise<ConversationListItem[]> {
    const limit = clampLimit(opts?.limit, DEFAULT_CONVERSATION_LIMIT, MAX_CONVERSATION_LIMIT);

    const conditions = [eq(aiConversations.userId, userId)];
    if (opts?.cursor) {
        conditions.push(lt(aiConversations.lastMessageAt, opts.cursor));
    }

    return tx
        .select({
            id: aiConversations.id,
            title: aiConversations.title,
            lastMessageAt: aiConversations.lastMessageAt,
            archived: aiConversations.archived,
            learn: sql<boolean>`coalesce(${aiConversations.metadata} ->> 'learn', 'true') <> 'false'`,
        })
        .from(aiConversations)
        .where(and(...conditions))
        .orderBy(sql`${aiConversations.lastMessageAt} DESC NULLS LAST`)
        .limit(limit);
}

export async function getConversation(
    tx: Tx,
    userId: string,
    conversationId: string,
): Promise<ConversationDetail | null> {
    const [row] = await tx
        .select({
            id: aiConversations.id,
            title: aiConversations.title,
            model: aiConversations.model,
            lastMessageAt: aiConversations.lastMessageAt,
            archived: aiConversations.archived,
            activeStreamId: aiConversations.activeStreamId,
            lastStreamId: aiConversations.lastStreamId,
            lastStreamStatus: aiConversations.lastStreamStatus,
            learn: sql<boolean>`coalesce(${aiConversations.metadata} ->> 'learn', 'true') <> 'false'`,
        })
        .from(aiConversations)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));

    return row ?? null;
}

export async function listConversationImageIds(tx: Tx, userId: string, conversationId: string) {
    return tx
        .select({ id: aiImages.id, mediaType: aiImages.mediaType })
        .from(aiImages)
        .where(and(eq(aiImages.userId, userId), eq(aiImages.conversationId, conversationId)));
}

const archivedIds = (tx: Tx, userId: string) =>
    tx
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(and(eq(aiConversations.userId, userId), eq(aiConversations.archived, true)));

export async function listArchivedImageIds(tx: Tx, userId: string) {
    return tx
        .select({ id: aiImages.id, mediaType: aiImages.mediaType })
        .from(aiImages)
        .where(and(eq(aiImages.userId, userId), inArray(aiImages.conversationId, archivedIds(tx, userId))));
}

export async function setActiveStream(tx: Tx, userId: string, conversationId: string, streamId: string): Promise<void> {
    await tx
        .update(aiConversations)
        .set({ activeStreamId: streamId })
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
}

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

export async function renameOrArchiveConversation(
    tx: Tx,
    userId: string,
    conversationId: string,
    patch: { title?: string; archived?: boolean; learn?: boolean },
): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: sql`NOW()` };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.archived !== undefined) set.archived = patch.archived;
    if (patch.learn !== undefined)
        set.metadata = sql`${aiConversations.metadata} || ${JSON.stringify({ learn: patch.learn })}::jsonb`;

    const updated = await tx
        .update(aiConversations)
        .set(set)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
        .returning({ id: aiConversations.id });

    if (updated.length === 0) throw new AppError(404, "NOT_FOUND", "Conversation not found");
    if (patch.learn === false) await dropChatFacts(tx, userId, [conversationId]);
}

export async function deleteConversation(tx: Tx, userId: string, conversationId: string): Promise<void> {
    await dropChatFacts(tx, userId, [conversationId]);
    await tx.delete(aiImages).where(and(eq(aiImages.userId, userId), eq(aiImages.conversationId, conversationId)));
    const deleted = await tx
        .delete(aiConversations)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
        .returning({ id: aiConversations.id });

    if (deleted.length === 0) throw new AppError(404, "NOT_FOUND", "Conversation not found");
}

export async function deleteArchivedConversations(tx: Tx, userId: string): Promise<number> {
    await dropChatFacts(tx, userId, archivedIds(tx, userId));
    await tx
        .delete(aiImages)
        .where(and(eq(aiImages.userId, userId), inArray(aiImages.conversationId, archivedIds(tx, userId))));
    const deleted = await tx
        .delete(aiConversations)
        .where(and(eq(aiConversations.userId, userId), eq(aiConversations.archived, true)))
        .returning({ id: aiConversations.id });
    return deleted.length;
}

export async function lastUserTexts(tx: Tx, userId: string, conversationId: string, count = 1): Promise<string[]> {
    const rows = await tx
        .select({ text: aiMessages.searchText })
        .from(aiMessages)
        .where(
            and(
                eq(aiMessages.userId, userId),
                eq(aiMessages.conversationId, conversationId),
                eq(aiMessages.role, "user"),
            ),
        )
        .orderBy(desc(aiMessages.orderIndex))
        .limit(count);
    return rows.flatMap((r) => (r.text ? [r.text] : [])).reverse();
}
