/**
 * Memory write / extraction path.
 *
 *  - `upsertMemory` performs the RLS-scoped idempotent write (takes a `tx`).
 *  - `extractAndStoreMemories` is the FEATURE-FLAGGED post-turn background job
 *    (takes `env`, opens its own RLS scope) that runs in the route's
 *    `ctx.waitUntil` and NEVER blocks the stream.
 *
 * Dedupe keeps the pgvector index high-signal: near-duplicate content collapses
 * onto the existing row (bumping salience) instead of inserting a new vector.
 * Never log memory content/PII.
 */
import { sql } from "drizzle-orm";
import { aiMemories } from "../../../db/schema";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { logger, hashIdentifier, issuesFromError } from "../../../platform/log";
import type { Tx } from "../../../types/db";
import type { Env } from "../../../types/env";
import { isMemoryEnabled } from "./embedding";

/** Salience bump applied when an upsert hits an existing (deduped) row. */
const DEDUPE_SALIENCE_DELTA = 0.1;

export interface MemoryWriteInput {
    content: string;
    type: "CORE" | "EPHEMERAL";
    /** 0..1 importance; defaults to the column default (0.5) when omitted. */
    salience?: number;
    /** Precomputed 1536-dim embedding of `content`. */
    embedding: number[];
    /** Model id that produced `embedding` — stored for safe re-embed on swap. */
    embeddingModel: string;
    sourceConversationId?: string | null;
    sourceMessageId?: string | null;
    /** null for CORE; short TTL for EPHEMERAL. */
    expiresAt?: string | null;
}

/**
 * Deterministic dedupe hash of normalized content (lowercase, whitespace
 * collapsed, trimmed). Pure. Uses a fast stable string hash (FNV-1a, 32-bit)
 * rendered as hex — synchronous and dependency-free, sufficient for collapsing
 * near-identical phrasings within a single user's memory set.
 */
export function computeDedupeHash(content: string): string {
    const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
    // FNV-1a 32-bit.
    let hash = 0x811c9dc5;
    for (let i = 0; i < normalized.length; i++) {
        hash ^= normalized.charCodeAt(i);
        // Multiply by the FNV prime (16777619) with 32-bit overflow.
        hash = Math.imul(hash, 0x01000193);
    }
    // Unsigned 8-char hex.
    return (hash >>> 0).toString(16).padStart(8, "0");
}

/** pgvector literal: `[v1,v2,...]`. */
function toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
}

/**
 * RLS-scoped idempotent write. On `(user_id, dedupe_hash)` conflict, bumps
 * salience (capped at 1) and `updatedAt` instead of inserting a near-duplicate.
 * Caller wraps in `withRls` and supplies `tx`.
 */
export async function upsertMemory(
    tx: Tx,
    userId: string,
    input: MemoryWriteInput,
): Promise<{ id: string; deduped: boolean }> {
    const dedupeHash = computeDedupeHash(input.content);
    const vectorLiteral = toVectorLiteral(input.embedding);
    // CORE never expires; EPHEMERAL uses caller-supplied TTL.
    const expiresAt = input.type === "CORE" ? null : (input.expiresAt ?? null);

    const rows = await tx
        .insert(aiMemories)
        .values({
            userId,
            content: input.content,
            embedding: sql`${vectorLiteral}::vector`,
            type: input.type,
            salience: input.salience,
            embeddingModel: input.embeddingModel,
            dedupeHash,
            sourceConversationId: input.sourceConversationId ?? null,
            sourceMessageId: input.sourceMessageId ?? null,
            expiresAt,
        })
        .onConflictDoUpdate({
            target: [aiMemories.userId, aiMemories.dedupeHash],
            set: {
                salience: sql`least(1, ${aiMemories.salience} + ${DEDUPE_SALIENCE_DELTA})`,
                updatedAt: sql`now()`,
            },
        })
        .returning({ id: aiMemories.id, createdAt: aiMemories.createdAt, updatedAt: aiMemories.updatedAt });

    const row = rows[0];
    // On a fresh insert createdAt === updatedAt (both defaulted now); a conflict
    // update advances updatedAt past the original createdAt.
    const deduped = row.createdAt !== row.updatedAt;
    return { id: row.id, deduped };
}

/**
 * POST-TURN extraction — FEATURE-FLAGGED, background-job style.
 *
 * Runs inside the route's `ctx.waitUntil`, so it must NEVER throw into the
 * stream and NEVER block it. When the memory flag is off (default), it returns
 * immediately for zero added cost.
 *
 * SCAFFOLD: the durable-fact extraction heuristic is intentionally stubbed for
 * now — when enabled it would summarize the turn into CORE/EPHEMERAL facts
 * (embed each via `embedTexts`, classify, set TTLs) and persist them through
 * `withRls` + `upsertMemory`. Wiring + flag are in place; the extraction model
 * call is deferred until Phases A–E are stable. All work is wrapped so a
 * failure only warns.
 */
export async function extractAndStoreMemories(
    env: Env,
    userId: string,
    args: { conversationId: string; messages: unknown[] },
): Promise<void> {
    // Flag gate first — off = zero cost (no DB, no embedding calls).
    if (!isMemoryEnabled(env)) return;

    try {
        // --- SCAFFOLD ---------------------------------------------------------
        // Extraction pipeline (deferred): derive durable facts from
        // `args.messages`, classify CORE vs EPHEMERAL, embed via `embedTexts`,
        // then for each fact:
        //
        //   const db = getDbClient(env);
        //   await withRls(db, userId, (tx) => upsertMemory(tx, userId, {
        //       content, type, embedding, embeddingModel: getEmbeddingModelId(env),
        //       sourceConversationId: args.conversationId,
        //       sourceMessageId, expiresAt: type === "EPHEMERAL" ? ttl : null,
        //   }));
        //
        // No facts are extracted yet, so there is nothing to write. Referencing
        // the DB helpers keeps the gated write path type-checked and import-live.
        void getDbClient;
        void withRls;
        void args;
        return;
        // ---------------------------------------------------------------------
    } catch (err) {
        // Background job — never propagate into the stream.
        logger.warn("ai", "memory_extract_failed", {
            userHash: await hashIdentifier(userId),
            issues: issuesFromError(err),
        });
    }
}
