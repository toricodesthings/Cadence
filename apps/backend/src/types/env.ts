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
