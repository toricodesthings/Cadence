import {
    AuthorizationError,
    CimdFetchError,
    OAuthError,
    OAuthProvider,
    getOAuthApi,
    type AuthRequest,
    type OAuthProviderOptions,
} from "@cloudflare/workers-oauth-provider";
import { and, eq, isNull, sql } from "drizzle-orm";
import { MCP_SCOPES, type McpConnectRequest, type McpScope } from "@cadence/contracts/connections";
import { mcpConnections } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { AppError } from "../../platform/errors";
import { hashIdentifier, logger } from "../../platform/log";
import type { Env } from "../../types/env";
import { serveMcp } from "./server";

/**
 * Cadence as an OAuth authorization server for outside assistants (MCP clients).
 *
 * Neon Auth still signs the person in; it never issues these tokens. The flow:
 * 1. The client opens `/authorize` here. We validate it, bind the request to this
 *    browser (`beginUpstream`: a `__Host-` cookie + `state`), and send the browser
 *    to the web app's `/connect?request=<state>`.
 * 2. The signed-in person reviews and approves there; the app's JWT route
 *    (`connections.route.ts`) stores a five-minute approval and hands back
 *    `/oauth/callback?state=…&approval=…`, which the same browser opens.
 * 3. The callback needs that browser's cookie (`finishUpstream`), so an approval
 *    made through someone else's link can't finish in the attacker's browser.
 *    It records the connection row, then `completeAuthorization` issues the grant.
 */

export type McpProps = { userId: string; connectionId: string };

type Approval = { userId: string; requestHash: string; scopes: McpScope[]; timezone: string };

const DEFAULT_MCP_ORIGIN = "https://mcp.cadenceapp.cloud";
const DEFAULT_APP_ORIGIN = "https://dashboard.cadenceapp.cloud";
const REQUEST_TTL = 600; // matches the provider's binding cookie
const APPROVAL_TTL = 300;

// ── Utility ─────────────────────────────────────────────────────────────────

export const mcpOrigin = (env: Env) => (env.MCP_ORIGIN ?? DEFAULT_MCP_ORIGIN).replace(/\/$/, "");
export const appOrigin = (env: Env) => (env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN).replace(/\/$/, "");
const requestKey = (hash: string) => `cadence:mcp-request:${hash}`;
const approvalKey = (id: string) => `cadence:mcp-approval:${id}`;

function oauthOptions(env: Env): OAuthProviderOptions<Env> {
    const origin = mcpOrigin(env);
    return {
        apiRoute: "/mcp",
        apiHandler: { fetch: serveMcp as never },
        defaultHandler: { fetch: (request, handlerEnv) => authorizationPages(request, handlerEnv as Env) },
        authorizeEndpoint: "/authorize",
        tokenEndpoint: "/oauth/token",
        // Claude Code registers itself (DCR); claude.ai can also use CIMD.
        clientRegistrationEndpoint: "/oauth/register",
        clientIdMetadataDocumentEnabled: true,
        scopesSupported: [...MCP_SCOPES],
        resourceMetadata: {
            resource: `${origin}/mcp`,
            authorization_servers: [origin],
            scopes_supported: [...MCP_SCOPES],
            bearer_methods_supported: ["header"],
            resource_name: "Cadence",
        },
        // A connection lasts while it's used: each refresh moves expiry 30 days out.
        refreshTokenIdleTTL: 30 * 24 * 60 * 60,
        // Tokens are only issued while the connection row is active, so a disconnect whose KV
        // revoke was missed, or a deleted account, ends the grant at its next refresh.
        tokenExchangeCallback: async ({ userId, grantId, props }) => {
            const connectionId = (props as McpProps).connectionId;
            const [row] = await withRls(getDbClient(env), userId, (tx) =>
                tx
                    .select({ id: mcpConnections.id })
                    .from(mcpConnections)
                    .where(and(eq(mcpConnections.id, connectionId), eq(mcpConnections.userId, userId), isNull(mcpConnections.revokedAt))),
            );
            if (row) return;
            await oauthApi(env).revokeGrant(grantId, userId);
            throw new OAuthError("invalid_grant", { description: "This connection was disconnected." });
        },
        onError: ({ code, status, internal }) => {
            logger.warn("mcp", "oauth_error", { code, status, category: internal?.category, reason: internal?.reason });
        },
    };
}

const providers = new Map<string, OAuthProvider<Env>>();

/** The provider for this deployment's origin, built once per isolate. */
export function mcpProvider(env: Env): OAuthProvider<Env> {
    const origin = mcpOrigin(env);
    let provider = providers.get(origin);
    if (!provider) {
        provider = new OAuthProvider<Env>(oauthOptions(env));
        providers.set(origin, provider);
    }
    return provider;
}

export const oauthApi = (env: Env) => getOAuthApi(oauthOptions(env), env);

/** Paths the MCP origin serves; everything else on the Worker is the app API. */
const MCP_PATH = /^\/(mcp(\/|$)|authorize$|oauth\/|\.well-known\/oauth-)/;

export function isMcpRequest(request: Request, env: Env): boolean {
    const url = new URL(request.url);
    return url.host === new URL(mcpOrigin(env)).host && MCP_PATH.test(url.pathname);
}

function requireKv(env: Env): KVNamespace {
    if (!env.OAUTH_KV) throw new AppError(503, "STORAGE_UNAVAILABLE", "Connecting assistants isn't available right now.");
    return env.OAUTH_KV;
}

const text = (message: string, status = 400) =>
    new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/** Expected OAuth failures: redirect only once the client's redirect URI is validated, else render. */
function authorizationFailure(error: unknown): Response {
    if (error instanceof AuthorizationError && error.redirectUri) {
        const redirect = new URL(error.redirectUri);
        redirect.searchParams.set("error", error.code);
        redirect.searchParams.set("error_description", error.description);
        if (error.state) redirect.searchParams.set("state", error.state);
        if (error.issuer) redirect.searchParams.set("iss", error.issuer);
        return Response.redirect(redirect.href, 302);
    }
    if (error instanceof AuthorizationError) {
        return text("This link expired, was already used, or was opened in a different browser. Start connecting again from your assistant.");
    }
    if (error instanceof CimdFetchError) return text("This app could not be verified.");
    throw error;
}

function declined(request: AuthRequest, headers: Headers): Response {
    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("state", request.state);
    if (request.issuer) redirect.searchParams.set("iss", request.issuer);
    headers.set("Location", redirect.href);
    return new Response(null, { status: 302, headers });
}

// ── Create ──────────────────────────────────────────────────────────────────

/** Store the person's approval for the callback; returns the URL their browser opens next. */
export async function approveConnectRequest(
    env: Env,
    userId: string,
    request: string,
    scopes: McpScope[],
    timezone: string,
): Promise<string> {
    const kv = requireKv(env);
    const requestHash = await hashIdentifier(request);
    if (!(await kv.get(requestKey(requestHash)))) throw new AppError(404, "NOT_FOUND", "Connection request not found");
    const id = crypto.randomUUID();
    const approval: Approval = { userId, requestHash, scopes, timezone };
    await kv.put(approvalKey(id), JSON.stringify(approval), { expirationTtl: APPROVAL_TTL });
    return `${mcpOrigin(env)}/oauth/callback?state=${encodeURIComponent(request)}&approval=${id}`;
}

/** Where the browser goes to tell the client "no": the callback without an approval. */
export const declineConnectUrl = (env: Env, request: string) =>
    `${mcpOrigin(env)}/oauth/callback?state=${encodeURIComponent(request)}`;

// ── Read ────────────────────────────────────────────────────────────────────

/** The consent page's view of a waiting request, or null once it expired or finished. */
export async function readConnectRequest(env: Env, request: string): Promise<McpConnectRequest | null> {
    return requireKv(env).get<McpConnectRequest>(requestKey(await hashIdentifier(request)), "json");
}

// ── Authorization pages (MCP origin, no app JWT) ────────────────────────────

async function authorizationPages(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
        if (pathname === "/authorize" && request.method === "GET") return await authorize(request, env);
        if (pathname === "/oauth/callback" && request.method === "GET") return await callback(request, env);
    } catch (error) {
        return authorizationFailure(error);
    }
    return text("Not found", 404);
}

async function authorize(request: Request, env: Env): Promise<Response> {
    const kv = requireKv(env);
    const oauth = oauthApi(env);
    const authRequest = await oauth.parseAuthRequest(request);
    const client = await oauth.lookupClient(authRequest.clientId);
    if (!client) return text("Unknown app. Start connecting again from your assistant.");

    const redirectHost = new URL(authRequest.redirectUri).hostname;
    const publisher = authRequest.clientId.startsWith("https://") ? new URL(authRequest.clientId).hostname : null;
    const view: McpConnectRequest = {
        clientName: client.clientName?.trim() || publisher || "An unnamed app",
        publisher,
        redirectHost,
        localRedirect: /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/.test(redirectHost),
        // Everything starts ticked (clients differ in what they ask for); the person unticks what they don't want.
        scopes: [...MCP_SCOPES],
    };

    // Consent happens in the web app before anything is issued; this only binds the
    // request to the browser so the callback can prove it's the same one.
    const { state, headers } = await oauth.beginUpstream(authRequest);
    await kv.put(requestKey(await hashIdentifier(state)), JSON.stringify(view), { expirationTtl: REQUEST_TTL });
    headers.set("Location", `${appOrigin(env)}/connect?request=${encodeURIComponent(state)}`);
    headers.set("Cache-Control", "no-store");
    return new Response(null, { status: 302, headers });
}

async function callback(request: Request, env: Env): Promise<Response> {
    const kv = requireKv(env);
    const oauth = oauthApi(env);
    const url = new URL(request.url);
    const { request: authRequest, headers } = await oauth.finishUpstream(request);

    const requestHash = await hashIdentifier(url.searchParams.get("state") ?? "");
    const approvalId = url.searchParams.get("approval");
    const approval = approvalId ? await kv.get<Approval>(approvalKey(approvalId), "json") : null;
    await Promise.all([kv.delete(requestKey(requestHash)), approvalId && kv.delete(approvalKey(approvalId))]);
    if (!approval || approval.requestHash !== requestHash) return declined(authRequest, headers);

    const client = await oauth.lookupClient(authRequest.clientId);
    const scopes = approval.scopes.filter((s) => (MCP_SCOPES as readonly string[]).includes(s));
    const connectionId = await recordConnection(env, approval.userId, {
        clientId: authRequest.clientId,
        clientName: client?.clientName?.trim() || authRequest.clientId,
        redirectUri: authRequest.redirectUri,
        scopes,
        timezone: approval.timezone,
    });
    try {
        const props: McpProps = { userId: approval.userId, connectionId };
        const { redirectTo } = await oauth.completeAuthorization({
            request: authRequest,
            userId: approval.userId,
            metadata: { connectionId },
            scope: scopes,
            props,
        });
        headers.set("Location", redirectTo);
        return new Response(null, { status: 302, headers });
    } catch (error) {
        await revokeConnection(env, approval.userId, connectionId);
        throw error;
    }
}

/**
 * One active row per app installation: reconnecting replaces the old row, as the
 * provider replaces the old grant. A registered (DCR) client is one installation
 * whatever its redirect (Claude Code picks a new loopback port each time); a CIMD
 * client id (an https URL) is shared by every installation, told apart by redirect URI.
 */
async function recordConnection(
    env: Env,
    userId: string,
    values: { clientId: string; clientName: string; redirectUri: string; scopes: string[]; timezone: string },
): Promise<string> {
    const sharedClientId = values.clientId.startsWith("https://");
    return withRls(getDbClient(env), userId, async (tx) => {
        await tx
            .update(mcpConnections)
            .set({ revokedAt: sql`now()` })
            .where(and(
                eq(mcpConnections.userId, userId),
                eq(mcpConnections.clientId, values.clientId),
                sharedClientId ? eq(mcpConnections.redirectUri, values.redirectUri) : undefined,
                isNull(mcpConnections.revokedAt),
            ));
        const [row] = await tx.insert(mcpConnections).values({ userId, ...values }).returning({ id: mcpConnections.id });
        return row.id;
    });
}

// ── Read ────────────────────────────────────────────────────────────────────

/**
 * Connections that still hold a live grant, or null when KV can't say. A row can
 * outlive its grant (the client revoked its token, 30 idle days passed, it
 * re-registered, or consent never finished); only the grant proves it still works.
 */
export async function liveConnectionIds(env: Env, userId: string): Promise<Set<string> | null> {
    if (!env.OAUTH_KV) return null;
    try {
        const { items } = await oauthApi(env).listUserGrants(userId, { limit: 1000 });
        const now = Math.floor(Date.now() / 1000);
        return new Set(items.filter((grant) => !grant.expiresAt || grant.expiresAt > now).map((grant) => grant.metadata?.connectionId));
    } catch {
        return null;
    }
}

// ── Delete ──────────────────────────────────────────────────────────────────

/**
 * Disconnect. The row is what every MCP call checks, so this holds at once; the
 * KV grant is removed too so its tokens stop refreshing (best effort: KV is
 * eventually consistent, and the row already blocks them).
 */
export async function revokeConnection(env: Env, userId: string, connectionId: string): Promise<boolean> {
    const [row] = await withRls(getDbClient(env), userId, (tx) =>
        tx
            .update(mcpConnections)
            .set({ revokedAt: sql`now()` })
            .where(and(eq(mcpConnections.id, connectionId), eq(mcpConnections.userId, userId), isNull(mcpConnections.revokedAt)))
            .returning({ id: mcpConnections.id }),
    );
    if (env.OAUTH_KV) {
        try {
            const oauth = oauthApi(env);
            const { items } = await oauth.listUserGrants(userId, { limit: 1000 });
            await Promise.all(items
                .filter((grant) => grant.metadata?.connectionId === connectionId)
                .map((grant) => oauth.revokeGrant(grant.id, userId)));
        } catch (error) {
            logger.warn("mcp", "grant_revoke_failed", {
                userHash: await hashIdentifier(userId),
                code: error instanceof Error ? error.name : "UnknownError",
            });
        }
    }
    return Boolean(row);
}
