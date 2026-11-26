import { todayIn } from "@cadence/domain/time";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { userZone } from "../../../platform/user-zone";
import { logger, hashIdentifier, issuesFromError } from "../../../platform/log";
import { consolidate } from "./consolidate";
import type { Env } from "../../../types/env";
import { fenceMemoryState, isLearning, planningOn, readMemoryState } from "./memory-mode";
import {
    changedFacts,
    deleteDecayed,
    deleteExpired,
    dropOrphanedFacts,
    mergeFacts,
    nearestFacts,
    syncActivityFacts,
} from "./memory-store";
import {
    derivePatterns,
    deriveDurations,
    retentionCutoff,
    type DerivedFact,
    type ReportRow,
    type SignalRow,
} from "./signals";
import { prunePlanning, slotPatterns } from "./planning.service";
import { readReports } from "./duration";
import { embedTexts, getEmbeddingModelId } from "./embedding";
import { backfillForUser } from "./backfill";
import { aiMemorySignals } from "../../../db/schema";
import { MAX_SIGNALS_PER_DAY } from "./memory.service";

const MAX_SIGNALS_READ = MAX_SIGNALS_PER_DAY * 30;
import { and, desc, eq, gte, lt } from "drizzle-orm";

const NEAR_DUPLICATE_DISTANCE = 0.15;
const CHANGED_WITHIN_MS = 26 * 60 * 60 * 1000;
const MAX_PAIRS = 20;

export interface NightlyResult {
    expired: number;
    decayed: number;
    merged: number;
    activity: number;
}

export async function nightlyForUser(env: Env, userId: string, now: Date = new Date()): Promise<NightlyResult | null> {
    const db = getDbClient(env);
    const userHash = await hashIdentifier(userId);
    try {
        const plan = await withRls(db, userId, async (tx) => {
            const state = await readMemoryState(tx, userId);
            const today = todayIn(await userZone(tx, userId), now);
            const expired = await deleteExpired(tx, userId, today);
            const decayed = (await deleteDecayed(tx, userId, today)) + (await dropOrphanedFacts(tx, userId));
            await tx
                .delete(aiMemorySignals)
                .where(and(eq(aiMemorySignals.userId, userId), lt(aiMemorySignals.on, retentionCutoff(today))));
            await prunePlanning(tx, userId, today);
            if (!isLearning(state.mode))
                return {
                    state,
                    today,
                    expired,
                    decayed,
                    pairs: [],
                    signals: [] as SignalRow[],
                    reports: [] as ReportRow[],
                    slots: [] as DerivedFact[],
                };
            const since = new Date(now.getTime() - CHANGED_WITHIN_MS).toISOString();
            const pairs: { fact: string; other: string }[] = [];
            const seen = new Set<string>();
            for (const fact of (await changedFacts(tx, userId, since)).slice(0, MAX_PAIRS)) {
                const [near] = (
                    await nearestFacts(tx, userId, fact.embedding, fact.embeddingModel, fact.kind, 2)
                ).filter((n) => n.id !== fact.id);
                if (!near || near.distance > NEAR_DUPLICATE_DISTANCE) continue;
                const key = [fact.id, near.id].sort().join("|");
                if (seen.has(key)) continue;
                seen.add(key);
                pairs.push({ fact: fact.id, other: near.id });
            }
            const signals =
                state.mode === "full"
                    ? await tx
                          .select({
                              kind: aiMemorySignals.kind,
                              on: aiMemorySignals.on,
                              bucket: aiMemorySignals.bucket,
                              subject: aiMemorySignals.subject,
                          })
                          .from(aiMemorySignals)
                          .where(
                              and(eq(aiMemorySignals.userId, userId), gte(aiMemorySignals.on, retentionCutoff(today))),
                          )
                          .orderBy(desc(aiMemorySignals.on))
                          .limit(MAX_SIGNALS_READ)
                    : [];
            const reports: ReportRow[] = state.mode === "full" ? await readReports(tx, userId, today) : [];
            const slots = planningOn(state) ? await slotPatterns(tx, userId, today) : [];
            return { state, today, expired, decayed, pairs, signals: signals as SignalRow[], reports, slots };
        });

        const merges: { keep: string; drop: string }[] = [];
        if (plan.pairs.length > 0) {
            const contents = await withRls(db, userId, async (tx) => {
                const rows = await tx.query.aiMemories.findMany({
                    columns: { id: true, content: true, lastSeenOn: true },
                    where: (m, { and, eq, inArray }) =>
                        and(
                            eq(m.userId, userId),
                            inArray(
                                m.id,
                                plan.pairs.flatMap((p) => [p.fact, p.other]),
                            ),
                        ),
                });
                return new Map(rows.map((r) => [r.id, r]));
            });
            const pairs = plan.pairs.flatMap((pair) => {
                const a = contents.get(pair.fact);
                const b = contents.get(pair.other);
                return a && b ? [{ a, b }] : [];
            });
            const same = await consolidate(
                env,
                userHash,
                pairs.map(({ a, b }) => ({
                    content: a.content,
                    near: [{ id: b.id, kind: "life", content: b.content, distance: 0 }],
                })),
            );
            pairs.forEach(({ a, b }, i) => {
                if (same[i] !== b.id) return;
                merges.push(a.lastSeenOn >= b.lastSeenOn ? { keep: a.id, drop: b.id } : { keep: b.id, drop: a.id });
            });
        }

        const derived =
            plan.state.mode === "full"
                ? [
                      ...derivePatterns(plan.signals, plan.today),
                      ...deriveDurations(plan.reports, plan.today),
                      ...plan.slots,
                  ]
                : [];
        let vectors: (number[] | null)[] = derived.map(() => null);
        if (derived.length > 0) {
            try {
                vectors = await embedTexts(
                    env,
                    derived.map((d) => d.content),
                    { userHash },
                );
            } catch {}
        }
        const result: NightlyResult = { expired: plan.expired, decayed: plan.decayed, merged: 0, activity: 0 };
        await withRls(db, userId, async (tx) => {
            const current = await fenceMemoryState(tx, userId);
            if (current.epoch !== plan.state.epoch || !isLearning(current.mode)) return;
            for (const merge of merges) if (await mergeFacts(tx, userId, merge.keep, merge.drop)) result.merged++;
            if (current.mode === "full") {
                result.activity = await syncActivityFacts(
                    tx,
                    userId,
                    derived.map((d, i) => ({ ...d, embedding: vectors[i], embeddingModel: getEmbeddingModelId(env) })),
                    plan.today,
                );
            }
        });
        if (plan.state.mode === "full") await backfillForUser(env, userId, now);
        if (result.expired + result.decayed + result.merged + result.activity > 0)
            logger.info("ai", "ai_memory_nightly", { userHash, ...result });
        return result;
    } catch (error) {
        logger.warn("ai", "memory_nightly_failed", { userHash, issues: issuesFromError(error) });
        return null;
    }
}
