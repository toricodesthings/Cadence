/**
 * Embedding client for the memory (pgvector RAG) layer.
 *
 * Edge-safe: every call is plain HTTP via the `ai` SDK (`embed`/`embedMany`)
 * through OpenRouter — no native deps, runs on Workers.
 *
 * Callers check the person's mode (memory-mode.ts) first, so Off issues no embedding request.
 */
import { embed, embedMany } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { logger } from "../../../platform/log";
import { addStepSpend, type TurnSpend } from "../safety/rate-limit";
import type { Env } from "../../../types/env";

/** Dimensionality of the `ai_memories.embedding` column (halfvec) — embeddings MUST match. */
const EMBEDDING_DIMENSIONS = 512;

/** An embedding sits in front of a chat turn (recall): a slow provider costs the lookup, never the reply. */
const EMBED_TIMEOUT_MS = 5_000;

/** Qwen3 truncates by Matryoshka to {@link EMBEDDING_DIMENSIONS}; configurable via AI_EMBEDDING_MODEL. */
const DEFAULT_EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";

/** Configured embedding model id, or a default. */
export function getEmbeddingModelId(env: Env): string {
    return env.AI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

/**
 * OpenRouter embedding model, mirroring `getModel` in agent.ts. Qwen3 embeds at
 * 4096 dims natively; `dimensions` truncates (Matryoshka) to the column's size, and
 * `require_parameters` keeps OpenRouter off any upstream that would ignore it.
 */
function getEmbeddingModel(env: Env, userHash?: string) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY || "dummy" });
    return openrouter.textEmbeddingModel(getEmbeddingModelId(env), {
        user: userHash,
        provider: { require_parameters: true },
        extraBody: { dimensions: EMBEDDING_DIMENSIONS },
    });
}

/** Guard that an embedding matches the column dimensionality. */
function assertDimensions(vector: number[]): number[] {
    if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
            `embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${vector.length}`,
        );
    }
    return vector;
}

/** What an embedding call cost, logged as `ai_embedding`. */
export type EmbeddingSpend = TurnSpend & { model: string; inputTokens?: number };

/**
 * Embed a single text. Returns a vector of {@link EMBEDDING_DIMENSIONS} plus what the call cost. Throws on failure or a
 * dimension mismatch — the caller (recall/learning) decides whether to
 * swallow it (best-effort) or surface it.
 */
export async function embedText(
    env: Env,
    text: string,
    ctx: { requestId?: string; userHash?: string } = {},
): Promise<{ embedding: number[]; spend: EmbeddingSpend }> {
    const { embedding, usage, providerMetadata, response } = await embed({
        model: getEmbeddingModel(env, ctx.userHash),
        value: text,
        abortSignal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    // Same fields as `ai_turn` / `ai_title`, so all OpenRouter spend filters alike.
    const spend: EmbeddingSpend = {
        model: getEmbeddingModelId(env),
        inputTokens: usage?.tokens,
        ...addStepSpend({}, { providerMetadata, response: { modelId: (response?.body as { model?: string } | undefined)?.model } }),
    };
    logger.info("ai", "ai_embedding", { ...ctx, ...spend });
    return { embedding: assertDimensions(embedding), spend };
}

/** Batch embedding via `embedMany`, logged as one `ai_embedding` line. Each vector is validated against the column size. */
export async function embedTexts(env: Env, texts: string[], ctx: { userHash?: string } = {}): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings, usage, providerMetadata } = await embedMany({ model: getEmbeddingModel(env, ctx.userHash), values: texts, abortSignal: AbortSignal.timeout(EMBED_TIMEOUT_MS) });
    const spend = addStepSpend({}, { providerMetadata });
    logger.info("ai", "ai_embedding", { ...ctx, model: getEmbeddingModelId(env), inputTokens: usage?.tokens, texts: texts.length, costUsd: spend.costUsd });
    return embeddings.map(assertDimensions);
}
