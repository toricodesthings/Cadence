export interface Env {
    HYPERDRIVE: Hyperdrive; // Cloudflare Hyperdrive → pooled Neon connection
    NEON_AUTH_JWKS_URL: string; // Neon Auth JWKS endpoint (set via wrangler secret)
    RATE_LIMITER: RateLimit; // Cloudflare native rate limiting
}
