import { tool } from "ai";
import { z } from "zod";
import { and, eq, ilike } from "drizzle-orm";
import { MEMORY_CONTENT_MAX, MEMORY_KINDS, MEMORY_LABEL_MAX, type MemoryReceipt } from "@cadence/contracts/memory";
import { localDateSchema } from "@cadence/contracts/common";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { logger, hashIdentifier, issuesFromError } from "../../../platform/log";
import { aiMemories } from "../../../db/schema";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, once } from "./index";
import { cleanText, isInstructionShaped } from "../memory/candidates";
import { fenceData, makeFenceNonce, sanitizeUntrusted } from "../safety/injection-policy";
import { embedTexts, getEmbeddingModelId } from "../memory/embedding";
import { consolidate } from "../memory/consolidate";
import { SAME_FACT_DISTANCE } from "../memory/learn";
import { isLearning, readMemoryState } from "../memory/memory-mode";
import { forgetFact, insertFact, nearestFacts, recallFacts, reinforceFact, searchPastChats, updateFact } from "../memory/memory-store";
import { atLocal, dayOf, type Zone } from "@cadence/domain/time";

/** Only what a person can say outright: patterns and durations are computed from activity. */
const SAYABLE_KINDS = MEMORY_KINDS.filter((kind) => kind !== "pattern" && kind !== "duration") as [string, ...string[]];

/** The most facts one topic search will name before the model has to ask which one. */
const TOPIC_MATCHES = 5;

/** What `remember` returns: a receipt, or why nothing changed (with the facts to choose from when a topic matched several). */
type Outcome = MemoryReceipt | { ok: false; error: string; matches?: { id: string; text: string }[] };

const off = { ok: false as const, error: "Memory is off. Tell the user they can turn it on in Settings → Assistant → Memory. Nothing was saved." };

export const memoryTools = (env: Env, userId: string, ctx: AgentContext) => {
    // The person's own words come back as data: fenced in the app (an outside model owns its own defence, as with notes).
    const nonce = ctx.nonce ?? makeFenceNonce();
    const asData = (kind: string, text: string) => (ctx.rawNotes ? text : fenceData({ nonce, kind, trust: "untrusted", content: sanitizeUntrusted(text, nonce) }));
    return {
    recall: tool({
        description:
            "Searches what you remember about the user, by words, when something they mention may connect to a fact that isn't in Memory above. " +
            "Each result has the day it was first said (saidOn): use it to say \"you mentioned in August…\". Never call it just to be thorough.",
        inputSchema: z.object({ query: z.string().trim().min(2).max(200).describe("A few words: the topic, person or place.") }),
        execute: async ({ query }) =>
            safeExecute("recall", userId, async () => {
                const db = getDbClient(env);
                const state = await withRls(db, userId, (tx) => readMemoryState(tx, userId));
                if (!isLearning(state.mode)) return off;
                let embedding: number[] | null = null;
                try {
                    [embedding] = await embedTexts(env, [query], { inTurn: true });
                } catch {
                    // words alone still work
                }
                const facts = await withRls(db, userId, (tx) =>
                    recallFacts(tx, userId, { text: query, embedding, model: getEmbeddingModelId(env), today: ctx.today, exclude: new Set() }),
                );
                return { ok: true as const, facts: facts.map((f) => ({ id: f.id, text: asData("memory", f.content), saidOn: f.saidOn, ...(f.sensitive && { sensitive: true }), ...(f.stale && { stale: true }) })) };
            }),
    }),

    search_past_chats: tool({
        description:
            "Searches what the user themselves said in past chats, by words (never your own replies). For \"what was that book I mentioned in March?\". " +
            "Results carry the day and the chat; after and before bound the days.",
        inputSchema: z.object({
            query: z.string().trim().min(2).max(200),
            after: localDateSchema.optional().describe("From this day on."),
            before: localDateSchema.optional().describe("Before this day."),
        }),
        execute: async ({ query, after, before }) =>
            safeExecute("search_past_chats", userId, async () => {
                const db = getDbClient(env);
                const state = await withRls(db, userId, (tx) => readMemoryState(tx, userId));
                if (!isLearning(state.mode)) return off;
                const zone = ctx.timezone as Zone;
                const hits = await withRls(db, userId, (tx) =>
                    searchPastChats(tx, userId, {
                        query,
                        after: after ? atLocal(after, "00:00", zone) : undefined,
                        before: before ? atLocal(before, "00:00", zone) : undefined,
                    }),
                );
                return {
                    ok: true as const,
                    chats: hits.map((h) => ({ conversationId: h.conversationId, title: h.title, day: dayOf(h.at, zone), snippet: asData("past_chat", h.snippet) })),
                };
            }),
    }),

    remember: tool({
        description:
            "Saves, updates or forgets one thing about the user, so they never repeat it. Use it when they say \"remember…\", correct something " +
            "you knew (\"I work mornings now\"), or say \"forget…\". Don't use it on your own: chats are learned from automatically. It applies at " +
            "once and the user sees \"Remembered: … · Undo\", so don't ask first. One fact per call, a short plain third-person sentence with any date " +
            "written out (2027-06-14). save needs kind and text. update needs id (from the memory list) and the new text. forget needs id, or topic " +
            "(a few words) when it isn't in the list; if several match you get them back to ask which.",
        inputSchema: z.object({
            action: z.enum(["save", "update", "forget"]),
            kind: z.enum(SAYABLE_KINDS).optional().describe("save: preference, quirk, life, constraint or assist."),
            text: z.string().trim().min(3).max(MEMORY_CONTENT_MAX).optional().describe("save / update: the fact."),
            id: z.uuid().optional().describe("update / forget: the fact's id from the memory list."),
            topic: z.string().trim().min(2).max(MEMORY_LABEL_MAX).optional().describe("forget: a few words naming it, when there is no id. Never repeat a sensitive detail."),
            validThrough: localDateSchema.optional().describe("save / update: the last day it stays true, when it ends."),
            sensitive: z.boolean().optional().describe("save: health, money or relationship detail the user asked you to keep."),
        }),
        execute: async (input, { toolCallId }) =>
            safeExecute("remember", userId, async () => {
                const db = getDbClient(env);
                const state = await withRls(db, userId, (tx) => readMemoryState(tx, userId));
                if (!isLearning(state.mode)) return off;
                const userHash = await hashIdentifier(userId);
                const bad = (error: string) => ({ ok: false as const, error: `${error} Nothing was changed.` });

                if (input.action === "forget") {
                    return withRls(db, userId, (tx) =>
                        once<Outcome>(tx, userId, toolCallId, async () => {
                            let id = input.id;
                            if (!id) {
                                const words = (input.topic ?? "").replace(/[\\%_]/g, (ch) => `\\${ch}`);
                                if (!words) return { result: bad("Say which one to forget (id or topic)."), id: userId };
                                const found = await tx
                                    .select({ id: aiMemories.id, content: aiMemories.content })
                                    .from(aiMemories)
                                    .where(and(eq(aiMemories.userId, userId), eq(aiMemories.status, "active"), ilike(aiMemories.content, `%${words}%`)))
                                    .limit(TOPIC_MATCHES + 1);
                                if (found.length === 0) return { result: bad("Nothing remembered matches that."), id: userId };
                                if (found.length > 1) {
                                    return { result: { ok: false as const, error: "Several match. Ask which one; nothing was changed.", matches: found.map((f) => ({ id: f.id, text: f.content })) }, id: userId };
                                }
                                id = found[0].id;
                            }
                            const gone = await forgetFact(tx, userId, id, input.topic);
                            if (!gone) return { result: bad("That isn't remembered."), id: userId };
                            const receipt: MemoryReceipt = { ok: true, action: "forgot", id: gone.id, text: gone.content };
                            return { result: receipt, id: gone.id };
                        }),
                    );
                }

                const text = cleanText(input.text ?? "");
                if (text.length < 3) return bad("Say what to remember.");
                if (isInstructionShaped(text)) return bad("That reads as an instruction to the assistant, not a fact about the user's life.");
                if (input.action === "update" && !input.id) return bad("Say which one to update (id).");
                if (input.action === "save" && !input.kind) return bad("Say what kind of fact this is.");

                // The embedding is an HTTP call: outside any transaction, and best-effort (the fact still saves).
                const model = getEmbeddingModelId(env);
                let embedding: number[] | null = null;
                try {
                    [embedding] = await embedTexts(env, [text], { inTurn: true });
                } catch (error) {
                    logger.warn("ai", "memory_embed_failed", { userHash, issues: issuesFromError(error) });
                }
                const near = embedding && input.action === "save"
                    ? await withRls(db, userId, (tx) => nearestFacts(tx, userId, embedding!, model, input.kind as never))
                    : [];
                const [match] = await consolidate(env, userHash, [{ content: text, near }]);

                return withRls(db, userId, (tx) =>
                    once<Outcome>(tx, userId, toolCallId, async () => {
                        if (input.action === "update" || match) {
                            const id = input.id ?? match!;
                            const same = !input.id && near.find((n) => n.id === id)!.distance <= SAME_FACT_DISTANCE;
                            if (same) {
                                await reinforceFact(tx, userId, id, ctx.today);
                                const receipt: MemoryReceipt = { ok: true, action: "kept", id, text };
                                return { result: receipt, id };
                            }
                            const ok = await updateFact(tx, userId, id, { content: text, embedding, embeddingModel: model, today: ctx.today, validThrough: input.validThrough });
                            if (!ok) return { result: bad("That isn't remembered."), id: userId };
                            const receipt: MemoryReceipt = { ok: true, action: "updated", id, text };
                            return { result: receipt, id };
                        }
                        const saved = await insertFact(tx, userId, {
                            kind: input.kind as never,
                            content: text,
                            embedding,
                            embeddingModel: model,
                            saidOn: ctx.today,
                            validThrough: input.validThrough,
                            source: "explicit",
                            confidence: "stated",
                            sensitive: input.sensitive,
                            pinned: true, // an explicit save never decays
                        });
                        if (!saved) return { result: bad("The user asked to forget that earlier; ask before saving it again."), id: userId };
                        // An exact repeat was already known: Undo must not delete the older fact.
                        const receipt: MemoryReceipt = { ok: true, action: saved.created ? "saved" : "kept", id: saved.id, text };
                        return { result: receipt, id: saved.id };
                    }),
                );
            }),
    }),
};
};
