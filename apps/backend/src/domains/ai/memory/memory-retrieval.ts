/**
 * Memory retrieval — builds the `retrieved_memory` auxiliary prompt block.
 *
 * Flow: embed the query (done by the caller) → fetch nearest candidates by
 * cosine distance under RLS → delegate the ranking/threshold/CORE-inclusion
 * merge to the PURE `rankMemories` (unit-testable without a DB, AGENTS.md §19)
 * → best-effort TOUCH of the returned rows.
 *
 * Memory content originates from user text and is fenced as untrusted data by
 * the prompt composer — never trusted as instructions.
 */
import { and, eq, sql } from "drizzle-orm";
import { aiMemories } from "../../../db/schema";
import type { Tx } from "../../../types/db";
import { logger, hashIdentifier, issuesFromError } from "../../../platform/log";

/**
 * Structurally identical to the prompt layer's `RetrievedMemory`. Intentionally
 * NOT imported from prompt/ to keep the memory layer decoupled.
 */
export interface RetrievedMemory {
    id: string;
    content: string;
    type: "CORE" | "EPHEMERAL";
    salience: number;
}

export interface RetrievalOptions {
    /** Max memories returned. */
    k?: number;
    /** Cosine-distance ceiling; candidates above it are dropped, not padded. */
    distanceThreshold?: number;
    /** CORE memories at/above this salience are always included regardless of distance. */
    coreSalienceFloor?: number;
}

/** Raw nearest-neighbour candidate before ranking/merging. */
interface MemoryCandidate {
    id: string;
    content: string;
    type: "CORE" | "EPHEMERAL";
    salience: number;
    distance: number;
}

const DEFAULT_K = 6;
const DEFAULT_DISTANCE_THRESHOLD = 0.45;
const DEFAULT_CORE_SALIENCE_FLOOR = 0.5;

/** Token guard: cap each snippet so a long memory cannot blow the prompt budget. */
const MAX_SNIPPET_LENGTH = 280;
/** Over-fetch candidates so distance-filtered/merged set can still fill k. */
const CANDIDATE_FETCH_MULTIPLIER = 4;

function truncate(content: string): string {
    const trimmed = content.trim();
    return trimmed.length > MAX_SNIPPET_LENGTH
        ? `${trimmed.slice(0, MAX_SNIPPET_LENGTH - 1)}…`
        : trimmed;
}

/** Serialize a JS number[] into a pgvector literal string: `[v1,v2,...]`. */
function toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
}

/**
 * PURE ranking/merge/threshold/CORE-inclusion logic, extracted for unit tests.
 *
 * Rules:
 *  - Keep candidates within `distanceThreshold` (near hits).
 *  - ALWAYS keep CORE candidates at/above `coreSalienceFloor`, even if far —
 *    these are stable facts that should persist regardless of query similarity.
 *  - De-dupe by id (a CORE row can qualify via both paths).
 *  - Sort by distance ASC, then salience DESC.
 *  - Cap at k.
 */
export function rankMemories(
    candidates: MemoryCandidate[],
    opts: { k: number; distanceThreshold: number; coreSalienceFloor: number },
): RetrievedMemory[] {
    const { k, distanceThreshold, coreSalienceFloor } = opts;

    const kept = candidates.filter(
        (c) =>
            c.distance <= distanceThreshold ||
            (c.type === "CORE" && c.salience >= coreSalienceFloor),
    );

    // De-dupe by id, keeping the smallest distance seen for that id.
    const byId = new Map<string, MemoryCandidate>();
    for (const c of kept) {
        const existing = byId.get(c.id);
        if (!existing || c.distance < existing.distance) byId.set(c.id, c);
    }

    return Array.from(byId.values())
        .sort((a, b) => a.distance - b.distance || b.salience - a.salience)
        .slice(0, k)
        .map((c) => ({ id: c.id, content: c.content, type: c.type, salience: c.salience }));
}

/**
 * RLS-scoped similarity retrieval. The caller wraps in `withRls` and supplies
 * `tx`; this function never opens its own transaction.
 */
export async function retrieveMemories(
    tx: Tx,
    userId: string,
    queryEmbedding: number[],
    opts?: RetrievalOptions,
): Promise<RetrievedMemory[]> {
    const k = opts?.k ?? DEFAULT_K;
    const distanceThreshold = opts?.distanceThreshold ?? DEFAULT_DISTANCE_THRESHOLD;
    const coreSalienceFloor = opts?.coreSalienceFloor ?? DEFAULT_CORE_SALIENCE_FLOOR;

    const vectorLiteral = toVectorLiteral(queryEmbedding);
    const fetchLimit = k * CANDIDATE_FETCH_MULTIPLIER;

    // Over-fetch nearest neighbours plus high-salience CORE rows; the pure
    // ranker applies the threshold + CORE-inclusion merge. userId is filtered
    // defensively in addition to RLS.
    const distanceExpr = sql<number>`(${aiMemories.embedding} <=> ${vectorLiteral}::vector)`;
    const rows = await tx
        .select({
            id: aiMemories.id,
            content: aiMemories.content,
            type: aiMemories.type,
            salience: aiMemories.salience,
            distance: distanceExpr,
        })
        .from(aiMemories)
        .where(and(eq(aiMemories.userId, userId)))
        .orderBy(distanceExpr, sql`${aiMemories.salience} DESC`)
        .limit(fetchLimit);

    const candidates: MemoryCandidate[] = rows.map((r) => ({
        id: r.id,
        content: truncate(r.content),
        type: r.type,
        salience: r.salience,
        distance: Number(r.distance),
    }));

    const ranked = rankMemories(candidates, { k, distanceThreshold, coreSalienceFloor });

    // Best-effort TOUCH — bump accessCount + lastAccessedAt. Non-blocking: a
    // touch failure must never fail retrieval (pattern: platform/metrics.ts).
    if (ranked.length > 0) {
        try {
            const ids = ranked.map((m) => m.id);
            await tx
                .update(aiMemories)
                .set({
                    accessCount: sql`${aiMemories.accessCount} + 1`,
                    lastAccessedAt: sql`now()`,
                })
                .where(and(eq(aiMemories.userId, userId), sql`${aiMemories.id} = ANY(${ids})`));
        } catch (err) {
            logger.warn("ai", "memory_touch_failed", {
                userHash: await hashIdentifier(userId),
                count: ranked.length,
                issues: issuesFromError(err),
            });
        }
    }

    return ranked;
}
