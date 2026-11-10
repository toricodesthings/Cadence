

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
 * - `/assets/*` reaches this worker only for a missing file (hashed assets are served
 *   directly, immutable via `_headers`): it answers 404, never the SPA shell.
 * - `/api/v1/*` goes to the backend Worker over the BACKEND service binding, so the
 *   app's API is same-origin (no CORS preflight per read, no second TLS handshake).
 * - `/api/auth/*` is a transparent proxy to Neon Auth. Cookie values are
 *   forwarded byte-for-byte; only Set-Cookie flags are rewritten for this origin.
 * - `/auth/callback?neon_auth_session_verifier=…` exchanges the single-use
 *   verifier once, on the navigation, then navigates (same-origin, via script)
 *   to the same URL without it, so the SPA never races duplicate exchanges.
 */

const AUTH_PROXY_PREFIX = "/api/auth/";
const API_PREFIX = "/api/v1/";
const AUTH_CALLBACK_PATH = "/auth/callback";
const NEON_COOKIE_PREFIX = "__Secure-neon-auth.";
const CHALLENGE_COOKIE_NAMES = [`${NEON_COOKIE_PREFIX}session_challenge`, `${NEON_COOKIE_PREFIX}session_challange`];
const VERIFIER_PARAM = "neon_auth_session_verifier";
const AUTH_ERROR_PARAM = "auth_error";
const REQUEST_HEADERS = ["authorization", "content-type", "referer", "user-agent"];
const RESPONSE_HEADERS = ["content-type", "location", "set-auth-jwt", "set-auth-token", "x-neon-ret-request-id"];

/** The Neon Auth cookies from the request, values untouched. */
function neonCookies(request: Request): string[] {
	return (request.headers.get("cookie") ?? "")
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part.startsWith(NEON_COOKIE_PREFIX));
}

/**
 * Rewrites an upstream Set-Cookie for this origin without touching its value.
 * Keeps Neon's SameSite=None; Secure policy on these first-party cookies.
 * Neon Auth validates Origin on state-changing requests.
 */
function firstPartyCookie(setCookie: string): string {
	const parts = setCookie
		.split(";")
		.map((part) => part.trim())
		.filter((part) => !/^(partitioned|domain=|samesite=|secure$)/i.test(part));
	return [...parts, "Secure", "SameSite=None"].join("; ");
}

async function fetchNeonAuth(env: Env, request: Request, path: string, search: string, origin: string, body?: ArrayBuffer): Promise<Response> {
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

	return fetch(upstream, { // nosemgrep
		method: request.method,
		headers,
		body: hasBody ? (body ?? await request.arrayBuffer()) : undefined,
		redirect: "manual",
	});
}

function appendCookies(target: Headers, upstream: Response) {
	for (const setCookie of upstream.headers.getSetCookie()) {
		target.append("set-cookie", firstPartyCookie(setCookie));
	}
}

/** Sign-in, sign-up, codes, resets: what a password guesser or a mail bomber would POST. */
const SENSITIVE_PATHS = ["sign-in/", "sign-up/", "email-otp/", "forget-password", "request-password-reset", "reset-password", "send-verification-email", "change-email", "change-password", "delete-user"];
/** The POSTs that send an email: also limited per address, whatever the IP. */
const MAIL_PATHS = ["sign-up/email", "email-otp/send-verification-otp", "forget-password", "request-password-reset", "send-verification-email", "sign-in/magic-link"];

function tooManyAttempts(): Response {
	return Response.json(
		{ code: "RATE_LIMITED", message: "Too many attempts. Try again in a minute." },
		{ status: 429, headers: { "retry-after": "60", "cache-control": "no-store", "x-content-type-options": "nosniff" } },
	);
}

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The lowercased `email` of a JSON body, if it has one. */
function emailOf(body: ArrayBuffer): string | undefined {
	try {
		const email = (JSON.parse(new TextDecoder().decode(body)) as { email?: unknown }).email;
		return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : undefined;
	} catch {
		return undefined;
	}
}

/**
 * True when this request is within the proxy's limits. Every request counts per IP (generously: sessions refresh
 * constantly and offices share an IP); sensitive POSTs count tighter; mail-sending POSTs also count per address.
 * A missing binding (local preview) never blocks.
 */
async function withinAuthLimits(env: Env, request: Request, path: string, body: ArrayBuffer | undefined): Promise<boolean> {
	const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
	const checks = [env.AUTH_LIMITER?.limit({ key: ip })];
	if (request.method === "POST" && SENSITIVE_PATHS.some((prefix) => path.startsWith(prefix))) {
		checks.push(env.AUTH_SENSITIVE_LIMITER?.limit({ key: ip }));
		const email = body && MAIL_PATHS.some((prefix) => path.startsWith(prefix)) ? emailOf(body) : undefined;
		if (email) checks.push(env.AUTH_EMAIL_LIMITER?.limit({ key: await sha256Hex(email) }));
	}
	return (await Promise.all(checks)).every((result) => !result || result.success);
}

async function proxyAuth(request: Request, env: Env, url: URL): Promise<Response> {
	const origin = request.headers.get("origin") ?? url.origin;
	const path = url.pathname.slice(AUTH_PROXY_PREFIX.length);
	const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
	if (!(await withinAuthLimits(env, request, path, body))) return tooManyAttempts();
	const upstream = await fetchNeonAuth(env, request, path, url.search, origin, body);
	const headers = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
	for (const name of RESPONSE_HEADERS) {
		const value = upstream.headers.get(name);
		if (value) headers.set(name, value);
	}
	appendCookies(headers, upstream);
	return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

/**
 * Leaves the callback with a same-origin, script-initiated navigation instead
 * of a 302, so the SPA document is not the end of the cross-site redirect
 * chain (Google → Neon → here).
 */
function continueTo(target: string, headers: Headers): Response {
	const href = JSON.stringify(target).replace(/</g, "\\u003c");
	const nonce = crypto.randomUUID().replace(/-/g, "");
	headers.set("content-type", "text/html; charset=utf-8");
	headers.set("referrer-policy", "no-referrer");
	headers.set("x-content-type-options", "nosniff");
	headers.set("content-security-policy", `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
	return new Response(
		`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Signing in…</title>` +
			`<script nonce="${nonce}">location.replace(${href})</script>` +
			`<noscript><a href=${href}>Continue to Cadence</a></noscript>`,
		{ status: 200, headers },
	);
}

async function exchangeVerifier(request: Request, env: Env, url: URL): Promise<Response> {
	const upstream = await fetchNeonAuth(env, request, "get-session", url.search, url.origin);
	const cleanUrl = new URL(url);
	cleanUrl.searchParams.delete(VERIFIER_PARAM);
	const headers = new Headers({ "cache-control": "no-store" });

	if (upstream.ok) {
		appendCookies(headers, upstream);
	} else {
		const body = await upstream.text();
		const code = /"code"\s*:\s*"([A-Z_]+)"/.exec(body)?.[1] ?? `HTTP_${upstream.status}`;
		// An object, like the backend logger, so Workers Logs indexes each field.
		console.warn({ event: "auth_callback_failed", source: "auth", status: upstream.status, code });
		cleanUrl.searchParams.set(AUTH_ERROR_PARAM, code);
	}

	return continueTo(`${cleanUrl.pathname}${cleanUrl.search}`, headers);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		// Only a missing file gets here (see the header): a 404, never the SPA shell cached as a chunk.
		if (url.pathname.startsWith("/assets/")) {
			return new Response("Asset not found", { status: 404, headers: { "Cache-Control": "no-store" } });
		}

		// Untouched: headers (CF-Connecting-IP for rate limits), body and Server-Timing pass through.
		if (url.pathname.startsWith(API_PREFIX)) return env.BACKEND.fetch(request);

		if (url.pathname.startsWith(AUTH_PROXY_PREFIX)) {
			return proxyAuth(request, env, url);
		}

		if (url.pathname === AUTH_CALLBACK_PATH && url.searchParams.has(VERIFIER_PARAM)) {
			const hasChallenge = neonCookies(request).some((cookie) =>
				CHALLENGE_COOKIE_NAMES.some((name) => cookie.startsWith(`${name}=`)),
			);
			if (hasChallenge) {
				return exchangeVerifier(request, env, url);
			}
			console.warn({ event: "auth_callback_no_challenge", source: "auth" });
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
