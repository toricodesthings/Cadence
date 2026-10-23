import { tool } from "ai";
import { z } from "zod";
import { and, eq, ilike } from "drizzle-orm";
import { MEMORY_CONTENT_MAX, MEMORY_KINDS, MEMORY_LABEL_MAX, type MemoryMode, type MemoryReceipt } from "@cadence/contracts/memory";
import { localDateSchema } from "@cadence/contracts/common";
import { PLANNING_OFFERS, timeOfDaySchema } from "@cadence/contracts/planning";
import { getDbClient, type DbClient } from "../../../platform/db";
import type { Tx } from "../../../types/db";
import { withRls } from "../../../platform/rls";
import { withinDailyBudget } from "../../../platform/daily-budget";
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
import { type NearFact, UNDO_WINDOW_MINUTES, forgetFact, insertFact, isForgotten, nearestFacts, recallFacts, reinforceFact, searchPastChats, updateFact } from "../memory/memory-store";
import { scheduleScrub } from "../memory/queue";
import { atLocal, dayOf, type Zone } from "@cadence/domain/time";

/** Only what a person can say outright: patterns and durations are computed from activity. */
const SAYABLE_KINDS = MEMORY_KINDS.filter((kind) => kind !== "pattern" && kind !== "duration") as [string, ...string[]];

/** Saves and updates per person per day: each costs an embedding and a chat-model call, and a save is pinned for good. */
const DAILY_REMEMBERS = 50;

/** The most facts one topic search will name before the model has to ask which one. */
const TOPIC_MATCHES = 5;

/** What `remember` returns: a receipt, or why nothing changed (with the facts to choose from when a topic matched several). */
type Outcome = MemoryReceipt | { ok: false; error: string; matches?: { id: string; text: string }[] };

const off = { ok: false as const, error: "Memory is off. Tell the user they can turn it on in Settings → Assistant → Memory. Nothing was saved." };

const nothingChanged = (error: string) => ({ ok: false as const, error: `${error} Nothing was changed.` });

/** Runs `work` only while memory is learning; otherwise says it's off. */
async function whileLearning<T>(env: Env, userId: string, work: (db: DbClient, mode: MemoryMode) => Promise<T>): Promise<T | typeof off> {
    const db = getDbClient(env);
    const state = await withRls(db, userId, (tx) => readMemoryState(tx, userId));
    return isLearning(state.mode) ? work(db, state.mode) : off;
}

/** An embedding, or null when the call fails: words alone still work. */
async function embedOrNull(env: Env, text: string, onError?: (error: unknown) => void): Promise<number[] | null> {
    try {
        const [embedding] = await embedTexts(env, [text], { inTurn: true });
        return embedding;
    } catch (error) {
        onError?.(error);
        return null;
    }
}

const rememberInput = z.object({
    action: z.enum(["save", "update", "forget"]),
    kind: z.enum(SAYABLE_KINDS).optional().describe("save: preference, quirk, life, constraint or assist."),
    text: z.string().trim().min(3).max(MEMORY_CONTENT_MAX).optional().describe("save / update: the fact."),
    id: z.uuid().optional().describe("update / forget: the fact's id from the memory list."),
    topic: z.string().trim().min(2).max(MEMORY_LABEL_MAX).optional().describe("forget: a few words naming it, when there is no id. Never repeat a sensitive detail."),
    validThrough: localDateSchema.optional().describe("save / update: the last day it stays true, when it ends."),
    sensitive: z.boolean().optional().describe("save: health, money or relationship detail the user asked you to keep."),
    when: z.object({
        buckets: z.array(timeOfDaySchema).min(1).max(5).describe("early (before 9), morning, afternoon, evening, late (after 9 pm)."),
        about: z.string().trim().min(2).max(60).nullable().optional().describe("The kind of thing in a few words (study, gym); omit for everything."),
    }).optional().describe("save a preference kind fact about the time of day they like to do something (\"I study after dinner\")."),
    avoid: z.enum(PLANNING_OFFERS).optional().describe("save an assist kind fact when a kind of help doesn't work for them: steps (breaking a task into steps) or later (hiding a task until later)."),
});
type RememberInput = z.infer<typeof rememberInput>;
type Written = { result: Outcome; id: string };

/** Forget by id, or by a topic that names exactly one fact. */
async function forgetOne(tx: Tx, userId: string, input: RememberInput): Promise<Written> {
    let id = input.id;
    if (!id) {
        const words = (input.topic ?? "").replace(/[\\%_]/g, (ch) => `\\${ch}`);
        if (!words) return { result: nothingChanged("Say which one to forget (id or topic)."), id: userId };
        const found = await tx
            .select({ id: aiMemories.id, content: aiMemories.content })
            .from(aiMemories)
            .where(and(eq(aiMemories.userId, userId), eq(aiMemories.status, "active"), ilike(aiMemories.content, `%${words}%`)))
            .limit(TOPIC_MATCHES + 1);
        if (found.length === 0) return { result: nothingChanged("Nothing remembered matches that."), id: userId };
        if (found.length > 1) {
            return { result: { ok: false as const, error: "Several match. Ask which one; nothing was changed.", matches: found.map((f) => ({ id: f.id, text: f.content })) }, id: userId };
        }
        id = found[0].id;
    }
    const gone = await forgetFact(tx, userId, id, input.topic);
    if (!gone) return { result: nothingChanged("That isn't remembered."), id: userId };
    return { result: { ok: true, action: "forgot", id: gone.id, text: gone.content }, id: gone.id };
}

/** Why this save or update can't go ahead as given, if it can't. */
function factProblem(input: RememberInput, text: string): string | null {
    if (text.length < 3) return "Say what to remember.";
    if (isInstructionShaped(text)) return "That reads as an instruction to the assistant, not a fact about the user's life.";
    if (input.action === "update" && !input.id) return "Say which one to update (id).";
    if (input.action === "save" && !input.kind) return "Say what kind of fact this is.";
    return null;
}

/** The fact as it will be written: its words, embedding, and the nearest fact it may repeat. */
type Fact = { text: string; embedding: number[] | null; model: string; near: NearFact[]; match: string | null | undefined };

/** What code computes with: a stated time of day, or an offer that doesn't help. Everything else is just words. */
const valueOf = (input: RememberInput) =>
    input.when ? { when: { buckets: input.when.buckets, about: input.when.about ?? null } }
    : input.avoid ? { avoid: input.avoid }
    : null;

/** Keep a repeat, update the named or matched fact, or insert a new pinned one. */
async function writeFact(tx: Tx, userId: string, input: RememberInput, today: string, fact: Fact): Promise<Written> {
    const { text, embedding, model, near, match } = fact;
    if (input.action === "update" || match) {
        const id = input.id ?? match!;
        const same = !input.id && near.find((n) => n.id === id)!.distance <= SAME_FACT_DISTANCE;
        if (same) {
            await reinforceFact(tx, userId, id, today);
            return { result: { ok: true, action: "kept", id, text }, id };
        }
        const ok = await updateFact(tx, userId, id, { content: text, ...(valueOf(input) && { value: valueOf(input) }), embedding, embeddingModel: model, today, validThrough: input.validThrough });
        if (!ok) return { result: nothingChanged("That isn't remembered."), id: userId };
        return { result: { ok: true, action: "updated", id, text }, id };
    }
    // The same thing said again in other words after Forget: it stays forgotten, and the chat can say so.
    const forgotten = await isForgotten(tx, userId, embedding, model, input.kind as never);
    if (forgotten) return { result: { ok: true, action: "kept", id: forgotten, text: "You asked me to forget this" }, id: forgotten };
    const saved = await insertFact(tx, userId, {
        kind: input.kind as never,
        content: text,
        value: valueOf(input),
        embedding,
        embeddingModel: model,
        saidOn: today,
        validThrough: input.validThrough,
        source: "explicit",
        confidence: "stated",
        sensitive: input.sensitive,
        pinned: true, // an explicit save never decays
    });
    if (!saved) return { result: nothingChanged("The user asked to forget that earlier; ask before saving it again."), id: userId };
    // An exact repeat was already known: Undo must not delete the older fact.
    return { result: { ok: true, action: saved.created ? "saved" : "kept", id: saved.id, text }, id: saved.id };
}

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
            safeExecute("recall", userId, () => whileLearning(env, userId, async (db, mode) => {
                const embedding = await embedOrNull(env, query);
                const facts = await withRls(db, userId, (tx) =>
                    recallFacts(tx, userId, { text: query, embedding, model: getEmbeddingModelId(env), today: ctx.today, exclude: new Set(), mode }),
                );
                return { ok: true as const, facts: facts.map((f) => ({ id: f.id, text: asData("memory", f.content), saidOn: f.saidOn, ...(f.sensitive && { sensitive: true }), ...(f.stale && { stale: true }) })) };
            })),
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
            safeExecute("search_past_chats", userId, () => whileLearning(env, userId, async (db) => {
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
            })),
    }),

    remember: tool({
        description:
            "Saves, updates or forgets one thing about the user, so they never repeat it. Use it when they say \"remember…\", correct something " +
            "you knew (\"I work mornings now\"), or say \"forget…\". Don't use it on your own: chats are learned from automatically. It applies at " +
            "once and the user sees \"Remembered: … · Undo\", so don't ask first. One fact per call, a short plain third-person sentence with any date " +
            "written out (2027-06-14). save needs kind and text. update needs id (from the memory list) and the new text. forget needs id, or topic " +
            "(a few words) when it isn't in the list; if several match you get them back to ask which.",
        inputSchema: rememberInput,
        execute: async (input, { toolCallId }) =>
            safeExecute("remember", userId, () => whileLearning(env, userId, async (db) => {
                if (input.action === "forget") {
                    const outcome = await withRls(db, userId, (tx) => once<Outcome>(tx, userId, toolCallId, () => forgetOne(tx, userId, input)));
                    if ("ok" in outcome && outcome.ok) ctx.waitUntil?.(scheduleScrub(env, userId, UNDO_WINDOW_MINUTES));
                    return outcome;
                }
                const text = cleanText(input.text ?? "");
                const problem = factProblem(input, text);
                if (problem) return nothingChanged(problem);

                // The abuse guard, before any model spend. Memory has no size cap: a day's saves are bounded here and a day's extractions in the job.
                const userHash = await hashIdentifier(userId);
                if (!(await withinDailyBudget(env, "remember", userHash, DAILY_REMEMBERS))) return nothingChanged("Too many saves today; try again tomorrow.");

                // The embedding is an HTTP call: outside any transaction, and best-effort (the fact still saves).
                const model = getEmbeddingModelId(env);
                const embedding = await embedOrNull(env, text, (error) => logger.warn("ai", "memory_embed_failed", { userHash, issues: issuesFromError(error) }));
                const near = embedding && input.action === "save"
                    ? await withRls(db, userId, (tx) => nearestFacts(tx, userId, embedding, model, input.kind as never))
                    : [];
                const [match] = await consolidate(env, userHash, [{ content: text, near }]);
                return withRls(db, userId, (tx) =>
                    once<Outcome>(tx, userId, toolCallId, () => writeFact(tx, userId, input, ctx.today, { text, embedding, model, near, match })),
                );
            })),
    }),
};
};
