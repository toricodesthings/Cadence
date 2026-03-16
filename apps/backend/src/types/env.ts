export interface Env {
    HYPERDRIVE: Hyperdrive; // Cloudflare Hyperdrive → pooled Neon connection
    NEON_AUTH_JWKS_URL: string; // Neon Auth JWKS endpoint (set via wrangler secret)
    ENABLE_DEBUG_ROUTES?: string; // Explicitly opt into admin debug routes outside production
    RATE_LIMITER: RateLimit; // IP-based global abuse protection
    RATE_LIMITER_READ: RateLimit; // User-scoped read throttle
    RATE_LIMITER_WRITE: RateLimit; // User-scoped mutation throttle
    RATE_LIMITER_ADMIN: RateLimit; // User-scoped admin route throttle
    ADMIN_USER_IDS?: string; // Comma-separated Neon Auth user ids allowed to use admin-only tooling
    ADMIN_EMAILS?: string; // Comma-separated email addresses allowed to use admin-only tooling
}
