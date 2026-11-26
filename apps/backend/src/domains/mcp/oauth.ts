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
import { appOrigin, type Env } from "../../types/env";
import { forgetCodeMode } from "./code-mode";
import { serveMcp } from "./server";

export type McpProps = { userId: string; connectionId: string };

type Approval = { userId: string; requestHash: string; scopes: McpScope[] };

const DEFAULT_MCP_ORIGIN = "https://mcp.cadenceapp.cloud";
const REQUEST_TTL = 600;
const APPROVAL_TTL = 300;

export const mcpOrigin = (env: Env) => (env.MCP_ORIGIN ?? DEFAULT_MCP_ORIGIN).replace(/\/$/, "");
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
        clientRegistrationTTL: 90 * 24 * 60 * 60,
        refreshTokenIdleTTL: 30 * 24 * 60 * 60,
        tokenExchangeCallback: async ({ userId, grantId, props }) => {
            const connectionId = (props as McpProps).connectionId;
            const [row] = await withRls(getDbClient(env), userId, (tx) =>
                tx
                    .select({ id: mcpConnections.id })
                    .from(mcpConnections)
                    .where(
                        and(
                            eq(mcpConnections.id, connectionId),
                            eq(mcpConnections.userId, userId),
                            isNull(mcpConnections.revokedAt),
                        ),
                    ),
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

const MCP_PATH = /^\/(mcp(\/|$)|authorize$|oauth\/|\.well-known\/oauth-)/;

export function isMcpRequest(request: Request, env: Env): boolean {
    const url = new URL(request.url);
    return url.host === new URL(mcpOrigin(env)).host && MCP_PATH.test(url.pathname);
}

function requireKv(env: Env): KVNamespace {
    if (!env.OAUTH_KV)
        throw new AppError(503, "STORAGE_UNAVAILABLE", "Connecting assistants isn't available right now.");
    return env.OAUTH_KV;
}

const text = (message: string, status = 400) =>
    new Response(message, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });

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
        return text(
            "This link expired, was already used, or was opened in a different browser. Start connecting again from your assistant.",
        );
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

export async function approveConnectRequest(
    env: Env,
    userId: string,
    request: string,
    scopes: McpScope[],
): Promise<string> {
    const kv = requireKv(env);
    const requestHash = await hashIdentifier(request);
    if (!(await kv.get(requestKey(requestHash)))) throw new AppError(404, "NOT_FOUND", "Connection request not found");
    const id = crypto.randomUUID();
    const approval: Approval = { userId, requestHash, scopes };
    await kv.put(approvalKey(id), JSON.stringify(approval), { expirationTtl: APPROVAL_TTL });
    return `${mcpOrigin(env)}/oauth/callback?state=${encodeURIComponent(request)}&approval=${id}`;
}

export const declineConnectUrl = (env: Env, request: string) =>
    `${mcpOrigin(env)}/oauth/callback?state=${encodeURIComponent(request)}`;

export async function readConnectRequest(env: Env, request: string): Promise<McpConnectRequest | null> {
    return requireKv(env).get<McpConnectRequest>(requestKey(await hashIdentifier(request)), "json");
}

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
        scopes: [...MCP_SCOPES],
    };

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

async function recordConnection(
    env: Env,
    userId: string,
    values: { clientId: string; clientName: string; redirectUri: string; scopes: string[] },
): Promise<string> {
    const sharedClientId = values.clientId.startsWith("https://");
    return withRls(getDbClient(env), userId, async (tx) => {
        await tx
            .update(mcpConnections)
            .set({ revokedAt: sql`now()` })
            .where(
                and(
                    eq(mcpConnections.userId, userId),
                    eq(mcpConnections.clientId, values.clientId),
                    sharedClientId ? eq(mcpConnections.redirectUri, values.redirectUri) : undefined,
                    isNull(mcpConnections.revokedAt),
                ),
            );
        const [row] = await tx
            .insert(mcpConnections)
            .values({ userId, ...values })
            .returning({ id: mcpConnections.id });
        return row.id;
    });
}

export async function liveConnectionIds(env: Env, userId: string): Promise<Set<string> | null> {
    if (!env.OAUTH_KV) return null;
    try {
        const { items } = await oauthApi(env).listUserGrants(userId, { limit: 1000 });
        const now = Math.floor(Date.now() / 1000);
        return new Set(
            items
                .filter((grant) => !grant.expiresAt || grant.expiresAt > now)
                .map((grant) => grant.metadata?.connectionId),
        );
    } catch {
        return null;
    }
}

export async function revokeAllGrants(env: Env, userId: string): Promise<void> {
    await revokeGrants(env, userId, () => true);
}

async function revokeGrants(
    env: Env,
    userId: string,
    which: (grant: { metadata?: { connectionId?: unknown } }) => boolean,
): Promise<void> {
    if (!env.OAUTH_KV) return;
    try {
        const oauth = oauthApi(env);
        const { items } = await oauth.listUserGrants(userId, { limit: 1000 });
        await Promise.all(items.filter(which).map((grant) => oauth.revokeGrant(grant.id, userId)));
    } catch (error) {
        logger.warn("mcp", "grant_revoke_failed", {
            userHash: await hashIdentifier(userId),
            code: error instanceof Error ? error.name : "UnknownError",
        });
    }
}

export async function revokeConnection(env: Env, userId: string, connectionId: string): Promise<boolean> {
    const [row] = await withRls(getDbClient(env), userId, (tx) =>
        tx
            .update(mcpConnections)
            .set({ revokedAt: sql`now()` })
            .where(
                and(
                    eq(mcpConnections.id, connectionId),
                    eq(mcpConnections.userId, userId),
                    isNull(mcpConnections.revokedAt),
                ),
            )
            .returning({ id: mcpConnections.id }),
    );
    await revokeGrants(env, userId, (grant) => grant.metadata?.connectionId === connectionId);
    if (row) await forgetCodeMode(env, userId, connectionId);
    return Boolean(row);
}
