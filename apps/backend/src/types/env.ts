export interface Env {
    HYPERDRIVE: Hyperdrive; // Cloudflare Hyperdrive → pooled Neon connection
    NEON_AUTH_JWKS_URL: string; // Neon Auth JWKS endpoint (set via wrangler secret)
    RATE_LIMITER: RateLimit; // Cloudflare native rate limiting
    ADMIN_USER_IDS?: string; // Comma-separated Neon Auth user ids allowed to use admin-only tooling
    ADMIN_EMAILS?: string; // Comma-separated email addresses allowed to use admin-only tooling
}
