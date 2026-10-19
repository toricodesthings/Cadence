/**
 * Learning (Basic and Full): after a conversation has been idle, one extraction call reads
 * what the person wrote since `metadata.memoryCursor`, and each candidate is consolidated against what
 * is already known (repeat, update or new) before anything is written.
 *
 * The cursor moves in the same transaction as the fact writes, and `memoryEpoch` is checked there: a retry
 * re-reads from the cursor, and a job that started before a mode change writes nothing.
 * Nothing the person wrote is logged.
 */
// oxlint-disable-next-line triple-slash-reference -- the frontend typecheck compiles this file without backend src/types
/// <reference path="../../../types/text-modules.d.ts" />
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { textOf } from "./message-text";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { todayIn } from "@cadence/domain/time";
import { aiConversations, aiMessages } from "../../../db/schema";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { userZone } from "../../../platform/user-zone";
import { logger, hashIdentifier, issuesFromError } from "../../../platform/log";
import { getModelId } from "../model-router";
import { addStepSpend } from "../safety/rate-limit";
import type { Env } from "../../../types/env";
import type { Tx } from "../../../types/db";
import { acceptCandidates, extractReplySchema } from "./candidates";
import { consolidate } from "./consolidate";
import { embedTexts, getEmbeddingModelId } from "./embedding";
import { fenceMemoryState, isLearning, readMemoryState, type MemoryState } from "./memory-mode";
import { insertFact, isForgotten, nearestFacts, reinforceFact, updateFact, type NearFact } from "./memory-store";
import extractPrompt from "../../../prompts/memory/extract.md";

/** What the extraction call reads: about 6k tokens of the person's newest messages. */
const READ_CHAR_BUDGET = 24_000;
const EXTRACT_TIMEOUT_MS = 25_000;
/** A match this close in cosine distance is the same fact restated (reinforce); further is a changed one (update). */
export const SAME_FACT_DISTANCE = 0.08;

/** The user message texts, newest kept under the budget, labelled m1… in time order. */
export function buildReading(rows: { id: string; text: string }[]): { text: string; labels: Map<string, string> } {
    const kept: { id: string; text: string }[] = [];
    let used = 0;
    for (const row of [...rows].reverse()) {
        const text = row.text.slice(0, READ_CHAR_BUDGET);
        if (used + text.length > READ_CHAR_BUDGET) break;
        used += text.length;
        kept.unshift({ id: row.id, text });
    }
    const labels = new Map<string, string>();
    const lines = kept.map((row, i) => {
        labels.set(`m${i + 1}`, row.id);
        return `[m${i + 1}] ${row.text}`;
    });
    return { text: lines.join("\n\n"), labels };
}

export interface LearnResult {
    saved: number;
    reinforced: number;
    updated: number;
    skipped: boolean;
    /** The reading broke (model, embedding or database); the cursor stays for a retry. */
    failed?: boolean;
    /** The day's extraction budget was spent: nothing was read, and the reading waits for tomorrow. */
    capped?: boolean;
}

/** Spends one of the day's extractions; asked only once there is something new to read. */
export type Admit = () => Promise<boolean>;

const NONE: LearnResult = { saved: 0, reinforced: 0, updated: 0, skipped: true };

/** What was read, and where it came from. A chat's messages, a note's changed lines, or an old batch. */
export interface Reading {
    messages: { id: string; text: string }[];
    source: "chat" | "note" | "backfill";
    conversationId: string | null;
}

/**
 * The shared path for everything memory reads (a chat, a note, a backfill batch): one extraction call,
 * consolidation of each candidate against what is known, then one transaction that writes the facts and
 * calls `advance` (the cursor: it moves with the writes, so a retry re-reads and a stale job writes nothing),
 * fenced by `state.epoch`. `advance` moves the cursor only from where this reading started and returns false
 * when an overlapping run already moved it, so a reading is written once. `admit`, when given, is asked just
 * before the extraction call, so only readings with something new count against the day's budget. Never throws:
 * a failure leaves the cursor, and the next run retries.
 */
export async function learnFromReading(
    env: Env,
    userId: string,
    reading: Reading,
    ctx: { state: MemoryState; today: string; admit?: Admit },
    advance: (tx: Tx) => Promise<boolean>,
): Promise<LearnResult> {
    const db = getDbClient(env);
    const userHash = await hashIdentifier(userId);
    const { state, today } = ctx;
    try {
        // 1 · One extraction call (outside any transaction), if the day's budget allows it.
        if (ctx.admit && !(await ctx.admit())) return { ...NONE, capped: true };
        const labelled = buildReading(reading.messages);
        const reply = await extract(env, userHash, today, labelled.text);
        // How long things took comes only from the person's answers on a completion (`duration_reports`), not from chat.
        const candidates = acceptCandidates(reply, labelled.labels);
        const facts = candidates;

        // 2 · Consolidate each fact: embed, find the closest known facts, ask which one it repeats.
        const model = getEmbeddingModelId(env);
        let vectors: (number[] | null)[] = facts.map(() => null);
        if (facts.length > 0) {
            try {
                vectors = await embedTexts(env, facts.map((c) => c.content), { userHash });
            } catch (error) {
                logger.warn("ai", "memory_embed_failed", { userHash, issues: issuesFromError(error) });
            }
        }
        const near = await withRls(db, userId, (tx) =>
            Promise.all(facts.map((c, i) => (vectors[i] ? nearestFacts(tx, userId, vectors[i]!, model, c.kind) : Promise.resolve<NearFact[]>([])))),
        );
        const matches = await consolidate(env, userHash, facts.map((c, i) => ({ content: c.content, near: near[i] })));

        // 3 · Write, move the cursor, fenced by the epoch.
        const result: LearnResult = { saved: 0, reinforced: 0, updated: 0, skipped: false };
        await withRls(db, userId, async (tx) => {
            const current = await fenceMemoryState(tx, userId);
            if (current.epoch !== state.epoch || !isLearning(current.mode)) return; // the person changed the mode meanwhile
            // The cursor moves first: a run that overlapped this one and already moved it means this reading is written.
            if (!(await advance(tx))) return;
            for (const [i, candidate] of facts.entries()) {
                const match = matches[i];
                if (match && near[i].find((n) => n.id === match)!.distance <= SAME_FACT_DISTANCE) {
                    await reinforceFact(tx, userId, match, today);
                    result.reinforced++;
                } else if (match) {
                    const ok = await updateFact(tx, userId, match, { content: candidate.content, ...(candidate.value && { value: candidate.value }), embedding: vectors[i], embeddingModel: model, today, validThrough: candidate.validThrough });
                    if (ok) result.updated++;
                } else {
                    // The same thing in other words after the person asked to forget it stays forgotten.
                    if (await isForgotten(tx, userId, vectors[i], model, candidate.kind)) continue;
                    const saved = await insertFact(tx, userId, {
                        kind: candidate.kind,
                        content: candidate.content,
                        value: candidate.value,
                        embedding: vectors[i],
                        embeddingModel: model,
                        saidOn: today,
                        validThrough: candidate.validThrough,
                        source: reading.source,
                        // What they said in a chat is stated; what was read out of a note or an old batch is observed.
                        confidence: reading.source === "chat" ? "stated" : "observed",
                        conversationId: reading.conversationId,
                        messageId: candidate.messageId,
                    });
                    if (saved?.created) result.saved++;
                }
            }
        });
        logger.info("ai", "ai_memory_learned", { userHash, source: reading.source, candidates: candidates.length, ...result });
        return result;
    } catch (error) {
        logger.warn("ai", "memory_learn_failed", { userHash, issues: issuesFromError(error) });
        return { ...NONE, failed: true };
    }
}

/**
 * Learns from one conversation: what the person wrote since `metadata.memoryCursor`. Never throws into
 * the cron: a failure leaves the cursor where it was, so the next run retries the same messages.
 */
export async function learnFromConversation(env: Env, userId: string, conversationId: string, now: Date = new Date(), admit?: Admit): Promise<LearnResult> {
    const db = getDbClient(env);
    try {
        const read = await withRls(db, userId, async (tx) => {
            const state = await readMemoryState(tx, userId);
            const [conversation] = await tx
                .select({
                    // Full microseconds (the column's own precision): a cursor rounded to milliseconds would sit just
                    // behind `last_message_at` and the chat would look unread forever.
                    lastMessageAt: sql<string | null>`to_json(${aiConversations.lastMessageAt}) #>> '{}'`,
                    metadata: aiConversations.metadata,
                })
                .from(aiConversations)
                .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
            if (!conversation?.lastMessageAt) return null;
            const cursor = typeof conversation.metadata?.memoryCursor === "string" ? conversation.metadata.memoryCursor : null;
            const learn = isLearning(state.mode) && conversation.metadata?.learn !== false;
            const rows = learn
                ? await tx
                      .select({ id: aiMessages.id, parts: aiMessages.parts })
                      .from(aiMessages)
                      .where(and(
                          eq(aiMessages.conversationId, conversationId),
                          eq(aiMessages.userId, userId),
                          eq(aiMessages.role, "user"),
                          // After the cursor, and after the boundary Clear (or the release that made Basic the default) drew.
                          cursor || state.notBefore ? gt(aiMessages.createdAt, sql`GREATEST(${cursor}::timestamptz, ${state.notBefore}::timestamptz)`) : undefined,
                      ))
                      .orderBy(asc(aiMessages.orderIndex))
                : [];
            const zone = await userZone(tx, userId);
            return { state, cursor, upTo: conversation.lastMessageAt, learn, rows, zone };
        });
        if (!read) return NONE;
        const advance = async (tx: Tx) => {
            const moved = await tx
                .update(aiConversations)
                .set({ metadata: sql`${aiConversations.metadata} || ${JSON.stringify({ memoryCursor: read.upTo })}::jsonb` })
                .where(and(
                    eq(aiConversations.id, conversationId),
                    eq(aiConversations.userId, userId),
                    sql`${aiConversations.metadata} ->> 'memoryCursor' IS NOT DISTINCT FROM ${read.cursor}::text`,
                ))
                .returning({ id: aiConversations.id });
            return moved.length > 0;
        };

        const messages = read.rows.map((r) => ({ id: r.id, text: textOf(r.parts) })).filter((m) => m.text);
        if (!read.learn || messages.length === 0) {
            await withRls(db, userId, (tx) => advance(tx));
            return NONE;
        }
        return learnFromReading(
            env,
            userId,
            { messages, source: "chat", conversationId },
            { state: read.state, today: todayIn(read.zone, now), admit },
            advance,
        );
    } catch (error) {
        logger.warn("ai", "memory_learn_failed", { userHash: await hashIdentifier(userId), issues: issuesFromError(error) });
        return NONE;
    }
}

/** The model's structured reply for these messages (null when it produced nothing readable: nothing is learned, the cursor moves). Timeouts and network errors throw, so the reading is retried. */
export async function extract(env: Env, userHash: string, today: string, reading: string): Promise<unknown> {
    if (!env.OPENROUTER_API_KEY) throw new Error("no model");
    const modelId = getModelId(env);
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    const startedAt = Date.now();
    const log = (usage: { inputTokens?: number; outputTokens?: number } | undefined, step: { providerMetadata?: unknown; response?: { modelId?: string } }) =>
        logger.info("ai", "ai_memory_extract", {
            userHash,
            model: modelId,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            ms: Date.now() - startedAt,
            ...addStepSpend({}, step),
        });
    try {
        const { output, usage, providerMetadata, response } = await generateText({
            model: openrouter(modelId, { user: userHash }),
            instructions: extractPrompt.trimEnd(),
            prompt: `Today is ${today}.\n\n${reading}`,
            output: Output.object({ schema: extractReplySchema }),
            temperature: 0,
            maxOutputTokens: 1_200,
            maxRetries: 1,
            abortSignal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
        });
        log(usage, { providerMetadata, response });
        return output;
    } catch (error) {
        if (!NoObjectGeneratedError.isInstance(error)) throw error;
        log(error.usage, { response: error.response });
        return null;
    }
}
