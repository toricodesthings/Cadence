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
import { addDailySpend } from "../../../platform/daily-budget";
import type { Env } from "../../../types/env";
import type { Tx } from "../../../types/db";
import { acceptCandidates, extractReplySchema } from "./candidates";
import { consolidate } from "./consolidate";
import { embedTexts, getEmbeddingModelId } from "./embedding";
import { fenceMemoryState, isLearning, readMemoryState, type MemoryState } from "./memory-mode";
import { insertFact, isForgotten, nearestFacts, reinforceFact, updateFact, type NearFact } from "./memory-store";
import extractPrompt from "../../../prompts/memory/extract.md";

const READ_CHAR_BUDGET = 24_000;
const EXTRACT_TIMEOUT_MS = 25_000;
export const SAME_FACT_DISTANCE = 0.08;

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
    failed?: boolean;
    capped?: boolean;
}

export type Admit = () => Promise<boolean>;

const NONE: LearnResult = { saved: 0, reinforced: 0, updated: 0, skipped: true };

export interface Reading {
    messages: { id: string; text: string }[];
    source: "chat" | "note" | "backfill";
    conversationId: string | null;
}

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
        if (ctx.admit && !(await ctx.admit())) return { ...NONE, capped: true };
        const labelled = buildReading(reading.messages);
        const reply = await extract(env, userHash, today, labelled.text);
        const candidates = acceptCandidates(reply, labelled.labels);
        const facts = candidates;

        const model = getEmbeddingModelId(env);
        const vectors =
            facts.length > 0
                ? await embedTexts(
                      env,
                      facts.map((c) => c.content),
                      { userHash },
                  )
                : [];
        const near = await withRls(db, userId, (tx) =>
            Promise.all(
                facts.map((c, i) =>
                    vectors[i] ? nearestFacts(tx, userId, vectors[i]!, model, c.kind) : Promise.resolve<NearFact[]>([]),
                ),
            ),
        );
        const matches = await consolidate(
            env,
            userHash,
            facts.map((c, i) => ({ content: c.content, near: near[i] })),
        );

        const result: LearnResult = { saved: 0, reinforced: 0, updated: 0, skipped: false };
        await withRls(db, userId, async (tx) => {
            const current = await fenceMemoryState(tx, userId);
            if (current.epoch !== state.epoch || !isLearning(current.mode)) return;
            if (!(await advance(tx))) return;
            for (const [i, candidate] of facts.entries()) {
                const match = matches[i];
                if (match && near[i].find((n) => n.id === match)!.distance <= SAME_FACT_DISTANCE) {
                    await reinforceFact(tx, userId, match, today);
                    result.reinforced++;
                } else if (match) {
                    const ok = await updateFact(tx, userId, match, {
                        content: candidate.content,
                        ...(candidate.value && { value: candidate.value }),
                        embedding: vectors[i],
                        embeddingModel: model,
                        today,
                        validThrough: candidate.validThrough,
                    });
                    if (ok) result.updated++;
                } else {
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
                        confidence: reading.source === "chat" ? "stated" : "observed",
                        conversationId: reading.conversationId,
                        messageId: candidate.messageId,
                    });
                    if (saved?.created) result.saved++;
                }
            }
        });
        logger.info("ai", "ai_memory_learned", {
            userHash,
            source: reading.source,
            candidates: candidates.length,
            ...result,
        });
        return result;
    } catch (error) {
        logger.warn("ai", "memory_learn_failed", { userHash, issues: issuesFromError(error) });
        return { ...NONE, failed: true };
    }
}

export async function learnFromConversation(
    env: Env,
    userId: string,
    conversationId: string,
    now: Date = new Date(),
    admit?: Admit,
): Promise<LearnResult> {
    const db = getDbClient(env);
    try {
        const read = await withRls(db, userId, async (tx) => {
            const state = await readMemoryState(tx, userId);
            const [conversation] = await tx
                .select({
                    lastMessageAt: sql<string | null>`to_json(${aiConversations.lastMessageAt}) #>> '{}'`,
                    metadata: aiConversations.metadata,
                })
                .from(aiConversations)
                .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
            if (!conversation?.lastMessageAt) return null;
            const cursor =
                typeof conversation.metadata?.memoryCursor === "string" ? conversation.metadata.memoryCursor : null;
            const learn = isLearning(state.mode) && conversation.metadata?.learn !== false;
            const rows = learn
                ? await tx
                      .select({ id: aiMessages.id, parts: aiMessages.parts })
                      .from(aiMessages)
                      .where(
                          and(
                              eq(aiMessages.conversationId, conversationId),
                              eq(aiMessages.userId, userId),
                              eq(aiMessages.role, "user"),
                              cursor || state.notBefore
                                  ? gt(
                                        aiMessages.createdAt,
                                        sql`GREATEST(${cursor}::timestamptz, ${state.notBefore}::timestamptz)`,
                                    )
                                  : undefined,
                          ),
                      )
                      .orderBy(asc(aiMessages.orderIndex))
                : [];
            const zone = await userZone(tx, userId);
            return { state, cursor, upTo: conversation.lastMessageAt, learn, rows, zone };
        });
        if (!read) return NONE;
        const advance = async (tx: Tx) => {
            const moved = await tx
                .update(aiConversations)
                .set({
                    metadata: sql`${aiConversations.metadata} || ${JSON.stringify({ memoryCursor: read.upTo })}::jsonb`,
                })
                .where(
                    and(
                        eq(aiConversations.id, conversationId),
                        eq(aiConversations.userId, userId),
                        sql`${aiConversations.metadata} ->> 'memoryCursor' IS NOT DISTINCT FROM ${read.cursor}::text`,
                    ),
                )
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
        logger.warn("ai", "memory_learn_failed", {
            userHash: await hashIdentifier(userId),
            issues: issuesFromError(error),
        });
        return NONE;
    }
}

export async function extract(env: Env, userHash: string, today: string, reading: string): Promise<unknown> {
    if (!env.OPENROUTER_API_KEY) throw new Error("no model");
    const modelId = getModelId(env);
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    const startedAt = Date.now();
    const log = async (
        usage: { inputTokens?: number; outputTokens?: number } | undefined,
        step: { providerMetadata?: unknown; response?: { modelId?: string } },
    ) => {
        const spend = addStepSpend({}, step);
        logger.info("ai", "ai_memory_extract", {
            userHash,
            model: modelId,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            ms: Date.now() - startedAt,
            ...spend,
        });
        await addDailySpend(env, spend.costUsd);
    };
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
        await log(usage, { providerMetadata, response });
        return output;
    } catch (error) {
        if (!NoObjectGeneratedError.isInstance(error)) throw error;
        await log(error.usage, { response: error.response });
        return null;
    }
}
