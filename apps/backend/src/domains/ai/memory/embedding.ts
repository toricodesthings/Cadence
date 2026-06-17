/**
 * Embedding client for the memory (pgvector RAG) layer.
 *
 * Edge-safe: every call is plain HTTP via the `ai` SDK (`embed`/`embedMany`)
 * over an OpenAI-compatible endpoint — no native deps, runs on Workers.
 *
 * The whole memory layer is feature-flagged. When disabled, callers must
 * short-circuit *before* reaching `embedText`/`embedTexts` so no embedding
 * request is ever issued (zero added cost/latency when off).
 */
import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { Env } from "../../../types/env";

/** Dimensionality of the `ai_memories.embedding` column — embeddings MUST match. */
export const EMBEDDING_DIMENSIONS = 1536;

/** 1536-dim default; configurable via AI_EMBEDDING_MODEL. */
const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

/**
 * Server flag AND per-user setting. Memory is only active when the server
 * master switch is on *and* the user has not opted out. Off = zero cost:
 * no embedding HTTP calls, no retrieval, no extraction.
 */
export function isMemoryEnabled(env: Env, perUserEnabled?: boolean): boolean {
    return env.AI_MEMORY_ENABLED === "true" && perUserEnabled !== false;
}

/** Configured embedding model id, or a 1536-dim default. */
export function getEmbeddingModelId(env: Env): string {
    return env.AI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

/**
 * Build an OpenAI-compatible embedding model handle. Mirrors `getModel` in
 * agent.ts: dedicated embedding key falls back to the OpenRouter key, and the
 * base URL falls back to the OpenRouter endpoint.
 */
function getEmbeddingModel(env: Env) {
    const apiKey = env.AI_EMBEDDING_API_KEY ?? env.OPENROUTER_API_KEY ?? "dummy";
    const baseURL = env.AI_EMBEDDING_BASE_URL ?? "https://openrouter.ai/api/v1";
    const provider = createOpenAI({ baseURL, apiKey });
    return provider.textEmbeddingModel(getEmbeddingModelId(env));
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

/**
 * Embed a single text. Returns a 1536-dim vector. Throws on failure or a
 * dimension mismatch — the caller (retrieval/extraction) decides whether to
 * swallow it (best-effort) or surface it.
 */
export async function embedText(env: Env, text: string): Promise<number[]> {
    const { embedding } = await embed({ model: getEmbeddingModel(env), value: text });
    return assertDimensions(embedding);
}

/** Batch embedding via `embedMany`. Each vector is validated to be 1536-dim. */
export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings } = await embedMany({ model: getEmbeddingModel(env), values: texts });
    return embeddings.map(assertDimensions);
}
