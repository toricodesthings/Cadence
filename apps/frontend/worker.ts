/// <reference types="@cloudflare/workers-types" />

/**
 * Cadence Frontend — Cloudflare Worker Entry Point
 *
 * Static assets (the SPA build) are served by the `assets` configuration in
 * wrangler.jsonc. Only paths listed in `assets.run_worker_first` reach this
 * worker first.
 *
 * Neon Auth is served from the app's own origin so its cookies are
 * first-party. Browsers that block third-party cookies (every iOS browser,
 * Safari, Firefox strict mode) otherwise drop the OAuth session challenge
 * cookie and sign-in never completes.
 *
 * - `/api/auth/*` is a transparent proxy to Neon Auth. Cookie values are
 *   forwarded byte-for-byte: the signed challenge cookie stops matching if it
 *   is decoded and re-encoded on the way through.
 * - `/auth/callback?neon_auth_session_verifier=…` exchanges the single-use
 *   verifier once, on the navigation, then redirects to the same URL without
 *   it, so the SPA never races duplicate exchanges.
 */

export interface Env {
	ASSETS: Fetcher;
	NEON_AUTH_BASE_URL: string;
}

const AUTH_PROXY_PREFIX = "/api/auth/";
const AUTH_CALLBACK_PATH = "/auth/callback";
const NEON_COOKIE_PREFIX = "__Secure-neon-auth.";
const CHALLENGE_COOKIE_NAMES = [`${NEON_COOKIE_PREFIX}session_challenge`, `${NEON_COOKIE_PREFIX}session_challange`];
const VERIFIER_PARAM = "neon_auth_session_verifier";
const REQUEST_HEADERS = ["authorization", "content-type", "referer", "user-agent"];
const RESPONSE_HEADERS = ["content-type", "location", "set-auth-jwt", "set-auth-token", "x-neon-ret-request-id"];

/** The Neon Auth cookies from the request, values untouched. */
function neonCookies(request: Request): string[] {
	return (request.headers.get("cookie") ?? "")
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part.startsWith(NEON_COOKIE_PREFIX));
}

/** Rewrites an upstream Set-Cookie for this origin without touching its value. */
function firstPartyCookie(setCookie: string): string {
	return setCookie
		.split(";")
		.map((part) => part.trim())
		.filter((part) => !/^(partitioned|domain=)/i.test(part))
		.map((part) => (/^samesite=/i.test(part) ? "SameSite=Lax" : part))
		.join("; ");
}

async function fetchNeonAuth(env: Env, request: Request, path: string, search: string, origin: string): Promise<Response> {
	const headers = new Headers();
	for (const name of REQUEST_HEADERS) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	headers.set("origin", origin);
	headers.set("x-neon-auth-middleware", "true");
	const cookies = neonCookies(request);
	if (cookies.length > 0) headers.set("cookie", cookies.join("; "));

	const upstream = new URL(`${env.NEON_AUTH_BASE_URL.replace(/\/$/, "")}/${path}`);
	upstream.search = search;
	const hasBody = request.method !== "GET" && request.method !== "HEAD";

	return fetch(upstream, {
		method: request.method,
		headers,
		body: hasBody ? await request.arrayBuffer() : undefined,
		redirect: "manual",
	});
}

function appendCookies(target: Headers, upstream: Response) {
	for (const setCookie of upstream.headers.getSetCookie()) {
		target.append("set-cookie", firstPartyCookie(setCookie));
	}
}

async function proxyAuth(request: Request, env: Env, url: URL): Promise<Response> {
	const origin = request.headers.get("origin") ?? url.origin;
	const upstream = await fetchNeonAuth(env, request, url.pathname.slice(AUTH_PROXY_PREFIX.length), url.search, origin);
	const headers = new Headers({ "cache-control": "no-store" });
	for (const name of RESPONSE_HEADERS) {
		const value = upstream.headers.get(name);
		if (value) headers.set(name, value);
	}
	appendCookies(headers, upstream);
	return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

async function exchangeVerifier(request: Request, env: Env, url: URL): Promise<Response> {
	const upstream = await fetchNeonAuth(env, request, "get-session", url.search, url.origin);
	const cleanUrl = new URL(url);
	cleanUrl.searchParams.delete(VERIFIER_PARAM);
	const headers = new Headers({ location: `${cleanUrl.pathname}${cleanUrl.search}`, "cache-control": "no-store" });

	if (upstream.ok) {
		appendCookies(headers, upstream);
		console.log("[cadence:auth-callback] verifier exchange succeeded", upstream.headers.getSetCookie().length, "cookies");
	} else {
		console.warn("[cadence:auth-callback] verifier exchange failed", upstream.status, await upstream.text());
	}

	return new Response(null, { status: 302, headers });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith(AUTH_PROXY_PREFIX)) {
			return proxyAuth(request, env, url);
		}

		const hasChallenge = neonCookies(request).some((cookie) =>
			CHALLENGE_COOKIE_NAMES.some((name) => cookie.startsWith(`${name}=`)),
		);
		if (url.pathname === AUTH_CALLBACK_PATH && url.searchParams.has(VERIFIER_PARAM) && hasChallenge) {
			return exchangeVerifier(request, env, url);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
