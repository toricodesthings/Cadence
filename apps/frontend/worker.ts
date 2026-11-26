const AUTH_PROXY_PREFIX = "/api/auth/";
const API_PREFIX = "/api/v1/";
const AUTH_CALLBACK_PATH = "/auth/callback";
const NEON_COOKIE_PREFIX = "__Secure-neon-auth.";
const CHALLENGE_COOKIE_NAMES = [`${NEON_COOKIE_PREFIX}session_challenge`, `${NEON_COOKIE_PREFIX}session_challange`];
const VERIFIER_PARAM = "neon_auth_session_verifier";
const AUTH_ERROR_PARAM = "auth_error";
const REQUEST_HEADERS = ["authorization", "content-type", "referer", "user-agent"];
const RESPONSE_HEADERS = ["content-type", "location", "set-auth-jwt", "set-auth-token", "x-neon-ret-request-id"];

function neonCookies(request: Request): string[] {
    return (request.headers.get("cookie") ?? "")
        .split(";")
        .map((part) => part.trim())
        .filter((part) => part.startsWith(NEON_COOKIE_PREFIX));
}

function firstPartyCookie(setCookie: string): string {
    const parts = setCookie
        .split(";")
        .map((part) => part.trim())
        .filter((part) => !/^(partitioned|domain=|samesite=|secure$)/i.test(part));
    return [...parts, "Secure", "SameSite=None"].join("; ");
}

async function fetchNeonAuth(
    env: Env,
    request: Request,
    path: string,
    search: string,
    origin: string,
    body?: ArrayBuffer,
): Promise<Response> {
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
        body: hasBody ? (body ?? (await request.arrayBuffer())) : undefined,
        redirect: "manual",
    });
}

function appendCookies(target: Headers, upstream: Response) {
    for (const setCookie of upstream.headers.getSetCookie()) {
        target.append("set-cookie", firstPartyCookie(setCookie));
    }
}

const SENSITIVE_PATHS = [
    "sign-in/",
    "sign-up/",
    "email-otp/",
    "forget-password",
    "request-password-reset",
    "reset-password",
    "send-verification-email",
    "change-email",
    "change-password",
    "delete-user",
];
const MAIL_PATHS = [
    "sign-up/email",
    "email-otp/send-verification-otp",
    "forget-password",
    "request-password-reset",
    "send-verification-email",
    "sign-in/magic-link",
];

function tooManyAttempts(): Response {
    return Response.json(
        { code: "RATE_LIMITED", message: "Too many attempts. Try again in a minute." },
        {
            status: 429,
            headers: { "retry-after": "60", "cache-control": "no-store", "x-content-type-options": "nosniff" },
        },
    );
}

async function sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function emailOf(body: ArrayBuffer): string | undefined {
    try {
        const email = (JSON.parse(new TextDecoder().decode(body)) as { email?: unknown }).email;
        return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : undefined;
    } catch {
        return undefined;
    }
}

async function withinAuthLimits(
    env: Env,
    request: Request,
    path: string,
    body: ArrayBuffer | undefined,
): Promise<boolean> {
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

function continueTo(target: string, headers: Headers): Response {
    const href = JSON.stringify(target).replace(/</g, "\\u003c");
    const nonce = crypto.randomUUID().replace(/-/g, "");
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-content-type-options", "nosniff");
    headers.set(
        "content-security-policy",
        `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    );
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
        console.warn({ event: "auth_callback_failed", source: "auth", status: upstream.status, code });
        cleanUrl.searchParams.set(AUTH_ERROR_PARAM, code);
    }

    return continueTo(`${cleanUrl.pathname}${cleanUrl.search}`, headers);
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname.startsWith("/assets/")) {
            return new Response("Asset not found", { status: 404, headers: { "Cache-Control": "no-store" } });
        }

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
