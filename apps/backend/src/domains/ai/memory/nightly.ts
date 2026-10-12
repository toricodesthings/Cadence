/**
 * The nightly pass (the "sleep-time" consolidation), once per person in their local night. Expired and
 * unreinforced facts the person never said go, near-duplicates are merged, and the cap is enforced. Deterministic
 * except the merge, which asks consolidation over opaque keys and so can only name a real fact. No model call when
 * nothing changed. Stated and pinned facts never decay.
 */
import { todayIn } from "@cadence/domain/time";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { userZone } from "../../../platform/user-zone";
import { logger, hashIdentifier, issuesFromError } from "../../../platform/log";
import { consolidate } from "./consolidate";
import type { Env } from "../../../types/env";
import { fenceMemoryState, isLearning, readMemoryState } from "./memory-mode";
import { changedFacts, deleteDecayed, deleteExpired, evictOverCap, MEMORY_CAP, mergeFacts, nearestFacts, syncActivityFacts } from "./memory-store";
import { derivePatterns, deriveDurations, retentionCutoff, type SignalRow } from "./signals";
import { embedTexts, getEmbeddingModelId } from "./embedding";
import { backfillForUser } from "./backfill";
import { aiMemorySignals } from "../../../db/schema";
import { and, eq, gte, lt } from "drizzle-orm";

/** Two same-kind facts closer than this (cosine distance) are asked about, not merged blindly. */
const NEAR_DUPLICATE_DISTANCE = 0.15;
/** A pass looks at what changed in the last day (plus slack for the hourly cron's jitter). */
const CHANGED_WITHIN_MS = 26 * 60 * 60 * 1000;
const MAX_PAIRS = 20;

export interface NightlyResult {
    expired: number;
    decayed: number;
    merged: number;
    evicted: number;
    /** Full: patterns and durations added or removed. */
    activity: number;
}

export async function nightlyForUser(env: Env, userId: string, now: Date = new Date()): Promise<NightlyResult | null> {
    const db = getDbClient(env);
    const userHash = await hashIdentifier(userId);
    try {
        // 1 · What can go without asking anyone, and what might be a duplicate.
        const plan = await withRls(db, userId, async (tx) => {
            const state = await readMemoryState(tx, userId);
            const today = todayIn(await userZone(tx, userId), now);
            // Expiry and decay are plain deletion: they run whatever the mode.
            const expired = await deleteExpired(tx, userId, today);
            const decayed = await deleteDecayed(tx, userId, today);
            // Merging asks a model, and only makes sense while memory is on.
            // Signals are kept 90 days; Full reads them for patterns and durations below.
            await tx.delete(aiMemorySignals).where(and(eq(aiMemorySignals.userId, userId), lt(aiMemorySignals.on, retentionCutoff(today))));
            if (!isLearning(state.mode)) return { state, today, expired, decayed, pairs: [], signals: [] as SignalRow[] };
            const since = new Date(now.getTime() - CHANGED_WITHIN_MS).toISOString();
            const pairs: { fact: string; other: string }[] = [];
            const seen = new Set<string>();
            for (const fact of (await changedFacts(tx, userId, since)).slice(0, MAX_PAIRS)) {
                const [near] = (await nearestFacts(tx, userId, fact.embedding, fact.embeddingModel, fact.kind, 2)).filter((n) => n.id !== fact.id);
                if (!near || near.distance > NEAR_DUPLICATE_DISTANCE) continue;
                const key = [fact.id, near.id].sort().join("|");
                if (seen.has(key)) continue;
                seen.add(key);
                pairs.push({ fact: fact.id, other: near.id });
            }
            const signals: SignalRow[] = state.mode === "full"
                ? await tx
                      .select({ kind: aiMemorySignals.kind, on: aiMemorySignals.on, bucket: aiMemorySignals.bucket, subject: aiMemorySignals.subject, minutes: aiMemorySignals.minutes })
                      .from(aiMemorySignals)
                      .where(and(eq(aiMemorySignals.userId, userId), gte(aiMemorySignals.on, retentionCutoff(today))))
                : [];
            return { state, today, expired, decayed, pairs, signals };
        });

        // 2 · Ask the chat model about the pairs (outside any transaction).
        const merges: { keep: string; drop: string }[] = [];
        if (plan.pairs.length > 0) {
            const contents = await withRls(db, userId, async (tx) => {
                const rows = await tx.query.aiMemories.findMany({
                    columns: { id: true, content: true, lastSeenOn: true },
                    where: (m, { and, eq, inArray }) => and(eq(m.userId, userId), inArray(m.id, plan.pairs.flatMap((p) => [p.fact, p.other]))),
                });
                return new Map(rows.map((r) => [r.id, r]));
            });
            const pairs = plan.pairs.flatMap((pair) => {
                const a = contents.get(pair.fact);
                const b = contents.get(pair.other);
                return a && b ? [{ a, b }] : [];
            });
            // One call for every pair, as a chat's reading does.
            const same = await consolidate(env, userHash, pairs.map(({ a, b }) => ({ content: a.content, near: [{ id: b.id, kind: "life", content: b.content, distance: 0 }] })));
            pairs.forEach(({ a, b }, i) => {
                if (same[i] !== b.id) return;
                // The one seen more recently has the newer wording.
                merges.push(a.lastSeenOn >= b.lastSeenOn ? { keep: a.id, drop: b.id } : { keep: b.id, drop: a.id });
            });
        }

        // 3 · Apply, then enforce the cap. Fenced by the epoch, like every background write.
        // Full: what the person's own changes add up to. Deterministic; the only model call is the embedding of new text.
        const derived = plan.state.mode === "full" ? [...derivePatterns(plan.signals, plan.today), ...deriveDurations(plan.signals)] : [];
        let vectors: (number[] | null)[] = derived.map(() => null);
        if (derived.length > 0) {
            try {
                vectors = await embedTexts(env, derived.map((d) => d.content), { userHash });
            } catch {
                // saved without a vector: still found by words
            }
        }
        const result: NightlyResult = { expired: plan.expired, decayed: plan.decayed, merged: 0, evicted: 0, activity: 0 };
        await withRls(db, userId, async (tx) => {
            const current = await fenceMemoryState(tx, userId);
            if (current.epoch !== plan.state.epoch || !isLearning(current.mode)) return;
            for (const merge of merges) if (await mergeFacts(tx, userId, merge.keep, merge.drop)) result.merged++;
            if (current.mode === "full") {
                result.activity = await syncActivityFacts(tx, userId, derived.map((d, i) => ({ ...d, embedding: vectors[i], embeddingModel: getEmbeddingModelId(env) })), plan.today);
            }
            result.evicted = await evictOverCap(tx, userId, MEMORY_CAP[current.mode]);
        });
        // The catch-up after choosing Full (a few batches a night).
        if (plan.state.mode === "full") await backfillForUser(env, userId, now);
        if (result.expired + result.decayed + result.merged + result.evicted + result.activity > 0) logger.info("ai", "ai_memory_nightly", { userHash, ...result });
        return result;
    } catch (error) {
        logger.warn("ai", "memory_nightly_failed", { userHash, issues: issuesFromError(error) });
        return null;
    }
}
