/// <reference types="@cloudflare/workers-types" />

/**
 * Cadence Frontend — Cloudflare Worker Entry Point
 *
 * Static assets (the SPA build) are served automatically by the
 * `assets` configuration in wrangler.jsonc. Only paths listed in
 * `assets.run_worker_first` reach this worker before the asset layer.
 *
 * `/api/auth/*` proxies Neon Auth on the app's own origin so auth cookies
 * are first-party. Browsers that block third-party cookies (every iOS
 * browser, Safari, Firefox strict mode) otherwise drop the OAuth session
 * challenge cookie and sign-in never completes.
 */

import { handleAuthProxyRequest } from "@neondatabase/auth/server";

export interface Env {
	NEON_AUTH_BASE_URL: string;
	NEON_AUTH_COOKIE_SECRET: string;
}

const AUTH_PROXY_PREFIX = "/api/auth/";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith(AUTH_PROXY_PREFIX)) {
			if (!env.NEON_AUTH_BASE_URL || !env.NEON_AUTH_COOKIE_SECRET) {
				console.error("[cadence:auth-proxy] NEON_AUTH_BASE_URL or NEON_AUTH_COOKIE_SECRET is not configured");
				return Response.json({ error: "Auth proxy is not configured" }, { status: 500 });
			}

			return handleAuthProxyRequest({
				request,
				path: url.pathname.slice(AUTH_PROXY_PREFIX.length),
				baseUrl: env.NEON_AUTH_BASE_URL.replace(/\/$/, ""),
				cookieSecret: env.NEON_AUTH_COOKIE_SECRET,
			});
		}

		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
