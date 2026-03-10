/// <reference types="@cloudflare/workers-types" />

/**
 * Cadence Frontend — Cloudflare Worker Entry Point
 *
 * Static assets (the SPA build) are served automatically by the
 * `assets` configuration in wrangler.jsonc. This worker handles
 * any requests that fall through the static asset layer.
 *
 * Extend this file for server-side logic such as:
 *  - API proxying / edge middleware
 *  - Custom response headers (CSP, CORS, etc.)
 *  - A/B testing or feature flags at the edge
 *  - Server-side redirects
 */

export interface Env {
	VITE_NEON_AUTH_URL: string;
	VITE_API_BASE_URL: string;
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		// The assets layer handles all static files and SPA fallback.
		// If a request reaches here, it wasn't matched by any static asset.
		// Add custom server-side logic above this fallback as needed.
		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
