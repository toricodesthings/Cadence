/**
 * Deployment stage determines which security policies are active.
 * - "production": strictest CORS, no debug routes, full JWT validation
 * - "staging": production-like but may allow staging origins
 * - "development": localhost origins permitted, debug routes opt-in
 */
export type DeploymentStage = "production" | "staging" | "development";

export interface Env {
    // ── Connection ──
    HYPERDRIVE: Hyperdrive;

    // ── Auth / JWT trust contract ──
    NEON_AUTH_JWKS_URL: string;
    /** Optional JWT issuer claim — when set, tokens with a different `iss` are rejected. */
    JWT_ISSUER?: string;
    /** Optional JWT audience claim — when set, tokens not minted for this API are rejected. */
    JWT_AUDIENCE?: string;

    // ── Deployment boundary ──
    /** Explicit deployment stage. Defaults to "production" if absent. */
    DEPLOYMENT_STAGE?: string;
    /** Comma-separated allowed CORS origins beyond the default production origin. */
    ALLOWED_ORIGINS?: string;

    // ── Admin surface ──
    /** Explicitly opt into admin debug routes (only honored in non-production stages). */
    ENABLE_DEBUG_ROUTES?: string;
    ADMIN_USER_IDS?: string;
    ADMIN_EMAILS?: string;

    // ── Rate limiting ──
    RATE_LIMITER: RateLimit;
    RATE_LIMITER_READ: RateLimit;
    RATE_LIMITER_WRITE: RateLimit;
    RATE_LIMITER_ADMIN: RateLimit;

    // ── AI ──
    OPENROUTER_API_KEY?: string;
    /** Chat model id (OpenAI-compatible via OpenRouter). Defaults to google/gemini-2.5-flash. */
    AI_CHAT_MODEL?: string;
    /** Master switch for the memory (pgvector RAG) layer. "true" enables retrieval/extraction. */
    AI_MEMORY_ENABLED?: string;
    /** Embedding model id — must output 1536 dims to match ai_memories.embedding. */
    AI_EMBEDDING_MODEL?: string;
    /** Optional dedicated embedding API key; falls back to OPENROUTER_API_KEY when unset. */
    AI_EMBEDDING_API_KEY?: string;
    /** Optional OpenAI-compatible base URL for embeddings; falls back to the OpenRouter base. */
    AI_EMBEDDING_BASE_URL?: string;

    // ── AI stream resumption (Upstash Redis, REST) ──
    /** Upstash Redis REST endpoint. When absent, resumption is disabled (streaming still works). */
    UPSTASH_REDIS_REST_URL?: string;
    /** Upstash Redis REST token. */
    UPSTASH_REDIS_REST_TOKEN?: string;
    /** Master switch for resumable streams + hard abort. "true" enables. Default off until rolled out. */
    AI_STREAM_RESUME_ENABLED?: string;

    // ── AI usage budget / rate limiting (reuses the Upstash REST client) ──
    // Always-on guardrail — there is NO enable flag. The 5-hour + 1-week × requests
    // + tokens budget is enforced whenever Upstash is reachable. All limits are
    // env-tunable so policy can be retuned per model cost without a code deploy
    // (docs/Update 4/06-16-2026_ai-rate-limiting-and-abuse-protection-plan.md §6).
    /** Max chat turns per 5h window. Default 150. */
    AI_RL_REQUESTS_5H?: string;
    /** Max tokens (reserved+settled) per 5h window. Default 750000. */
    AI_RL_TOKENS_5H?: string;
    /** Max chat turns per 1-week window. Default 1500. */
    AI_RL_REQUESTS_7D?: string;
    /** Max tokens per 1-week window. Default 6000000. */
    AI_RL_TOKENS_7D?: string;
    /** Max simultaneous open streams per user. Default 3. */
    AI_RL_MAX_CONCURRENT?: string;
    /** Per-turn token hold at admission, reconciled to actual on finish. Default 6000. */
    AI_RL_RESERVE_TOKENS?: string;
    /** "open" (allow on Redis outage, default) | "closed" (reject when the store is down). */
    AI_RATE_LIMIT_FAIL_MODE?: string;
}

/** Parse DEPLOYMENT_STAGE with safe fallback to "production". */
export function getDeploymentStage(env: Env): DeploymentStage {
    const raw = env.DEPLOYMENT_STAGE?.trim().toLowerCase();
    if (raw === "development" || raw === "staging") return raw;
    return "production";
}

/** Parse comma-separated origin allowlist from env. */
export function getAllowedOrigins(env: Env): string[] {
    if (!env.ALLOWED_ORIGINS) return [];
    return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
}
