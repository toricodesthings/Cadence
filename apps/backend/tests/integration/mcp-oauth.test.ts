import { beforeAll, describe, expect, it, vi } from "vitest";
import { asOwner, createUser, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import {
    approveConnectRequest,
    declineConnectUrl,
    liveConnectionIds,
    mcpProvider,
    oauthApi,
    readConnectRequest,
    revokeAllGrants,
    revokeConnection,
} from "../../src/domains/mcp/oauth";

beforeAll(startTestDb);

const ORIGIN = "https://mcp.example.test";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never;

const kvStore = () => {
    const map = new Map<string, string>();
    return {
        get: async (key: string, type?: string | { type?: string }) => {
            if (!map.has(key)) return null;
            return (typeof type === "string" ? type : type?.type) === "json" ? JSON.parse(map.get(key)!) : map.get(key);
        },
        put: async (key: string, value: string) => void map.set(key, value),
        delete: async (key: string) => void map.delete(key),
        list: async ({ prefix = "" }: { prefix?: string } = {}) => ({
            keys: [...map.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
            list_complete: true,
        }),
        map,
    };
};

const s256 = async (verifier: string) => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    return btoa(String.fromCharCode(...digest))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
};

async function setup() {
    const kv = kvStore();
    const env = { OAUTH_KV: kv, MCP_ORIGIN: ORIGIN, APP_ORIGIN: "https://app.example.test" } as any;
    const provider = mcpProvider(env);
    const client = await oauthApi(env).createClient({
        redirectUris: [REDIRECT],
        tokenEndpointAuthMethod: "none",
        clientName: "Claude",
    });
    const send = (url: string, init?: RequestInit) => provider.fetch(new Request(url, init), env, ctx);
    const verifier = "v".repeat(64);

    const authorize = async (over: Record<string, string> = {}) => {
        const url = new URL(`${ORIGIN}/authorize`);
        for (const [k, v] of Object.entries({
            response_type: "code",
            client_id: client.clientId,
            redirect_uri: REDIRECT,
            scope: "cadence:read",
            code_challenge: await s256(verifier),
            code_challenge_method: "S256",
            state: "client-state",
            resource: `${ORIGIN}/mcp`,
            ...over,
        }))
            url.searchParams.set(k, v);
        return send(url.href);
    };
    const callback = (state: string, cookie: string, approval?: string) =>
        send(`${ORIGIN}/oauth/callback?state=${encodeURIComponent(state)}${approval ? `&approval=${approval}` : ""}`, {
            headers: { cookie },
        });
    const token = (body: Record<string, string>) =>
        send(`${ORIGIN}/oauth/token`, {
            method: "POST",
            body: new URLSearchParams({ client_id: client.clientId, ...body }),
        });
    return { kv, env, client, verifier, authorize, callback, token };
}

function parseAuthorize(response: Response) {
    const location = new URL(response.headers.get("location")!);
    const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
    return { state: location.searchParams.get("request")!, cookie, location };
}

async function approved(t: Awaited<ReturnType<typeof setup>>, userId: string, scopes = ["cadence:read" as const]) {
    const { state, cookie } = parseAuthorize(await t.authorize());
    const redirectTo = new URL(await approveConnectRequest(t.env, userId, state, scopes));
    return { state, cookie, approval: redirectTo.searchParams.get("approval")! };
}

const rows = (userId: string) =>
    asOwner((pg) =>
        pg.query<{ id: string; scopes: string[]; revoked: boolean; client_id: string }>(
            "SELECT id, scopes, revoked_at IS NOT NULL AS revoked, client_id FROM mcp_connections WHERE user_id = $1 ORDER BY created_at",
            [userId],
        ),
    ).then((r) => r.rows);

describe("authorize", () => {
    it("binds the request to the browser and sends it to the app's consent page", async () => {
        const t = await setup();
        const response = await t.authorize();
        expect(response.status).toBe(302);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const { state, cookie, location } = parseAuthorize(response);
        expect(location.origin + location.pathname).toBe("https://app.example.test/connect");
        expect(cookie).toMatch(/^__Host-/);
        expect(await readConnectRequest(t.env, state)).toMatchObject({
            clientName: "Claude",
            publisher: null,
            redirectHost: "claude.ai",
            localRedirect: false,
        });
    });

    it("marks a loopback redirect as local", async () => {
        const t = await setup();
        const local = await oauthApi(t.env).createClient({
            redirectUris: ["http://127.0.0.1:5555/cb"],
            tokenEndpointAuthMethod: "none",
        });
        const { state } = parseAuthorize(
            await t.authorize({ client_id: local.clientId, redirect_uri: "http://127.0.0.1:5555/cb" }),
        );
        expect(await readConnectRequest(t.env, state)).toMatchObject({
            clientName: "An unnamed app",
            localRedirect: true,
        });
    });

    it.each([
        ["an unknown client", { client_id: "nope" }],
        ["a redirect that was never registered", { redirect_uri: "https://evil.example/cb" }],
    ])("shows a plain page, never a redirect, for %s", async (_name, over) => {
        const t = await setup();
        const response = await t.authorize(over);
        expect(response.status).toBe(400);
        expect(response.headers.get("location")).toBeNull();
        expect(await response.text()).toMatch(/Start connecting again|could not be verified|expired/);
    });

    it("redirects a bad request to the client's own redirect once that is validated", async () => {
        const t = await setup();
        const response = await t.authorize({ response_type: "token" });
        const location = new URL(response.headers.get("location")!);
        expect(response.status).toBe(302);
        expect(location.origin + location.pathname).toBe(REDIRECT);
        expect(location.searchParams.get("error")).toBeTruthy();
        expect(location.searchParams.get("state")).toBe("client-state");
    });

    it("answers 404 for other methods and paths on the MCP origin", async () => {
        const t = await setup();
        expect((await t.callback("x", "")).status).toBe(400);
        const post = await mcpProvider(t.env).fetch(new Request(`${ORIGIN}/authorize`, { method: "POST" }), t.env, ctx);
        expect([404, 405]).toContain(post.status);
    });
});

describe("Code Mode path", () => {
    it("/mcp/code is the same OAuth resource: unauthenticated → 401 pointing at the /mcp metadata, and a /mcp token works there", async () => {
        const t = await setup();
        const provider = mcpProvider(t.env);
        const bare = await provider.fetch(new Request(`${ORIGIN}/mcp/code`, { method: "POST" }), t.env, ctx);
        expect(bare.status).toBe(401);
        expect(bare.headers.get("www-authenticate")).toContain(
            `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
        );

        const userId = await createUser();
        const { state, cookie, approval } = await approved(t, userId);
        const back = new URL((await t.callback(state, cookie, approval)).headers.get("location")!);
        const issued = (await (
            await t.token({
                grant_type: "authorization_code",
                code: back.searchParams.get("code")!,
                redirect_uri: REDIRECT,
                code_verifier: t.verifier,
            })
        ).json()) as { access_token: string };
        const authed = await provider.fetch(
            new Request(`${ORIGIN}/mcp/code`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${issued.access_token}`,
                    "content-type": "application/json",
                    accept: "application/json, text/event-stream",
                },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
            }),
            t.env,
            ctx,
        );
        expect(authed.status).toBe(200);
    });
});

describe("approval and callback", () => {
    it("approve → callback → token with PKCE: one connection row, a working token", async () => {
        const t = await setup();
        const userId = await createUser();
        const { state, cookie, approval } = await approved(t, userId, ["cadence:read"]);

        const done = await t.callback(state, cookie, approval);
        expect(done.status).toBe(302);
        const back = new URL(done.headers.get("location")!);
        expect(back.origin + back.pathname).toBe(REDIRECT);
        expect(back.searchParams.get("state")).toBe("client-state");

        const [row] = await rows(userId);
        expect(row).toMatchObject({ scopes: ["cadence:read"], revoked: false, client_id: t.client.clientId });

        const issued = await t.token({
            grant_type: "authorization_code",
            code: back.searchParams.get("code")!,
            redirect_uri: REDIRECT,
            code_verifier: t.verifier,
        });
        expect(issued.status).toBe(200);
        expect(((await issued.json()) as any).access_token).toBeTruthy();
    });

    it("refuses a wrong PKCE verifier, and a used code can't be replayed", async () => {
        const t = await setup();
        const userId = await createUser();
        const { state, cookie, approval } = await approved(t, userId);
        const code = new URL((await t.callback(state, cookie, approval)).headers.get("location")!).searchParams.get(
            "code",
        )!;
        const exchange = (verifier: string) =>
            t.token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier });

        const wrong = await exchange("w".repeat(64));
        expect(wrong.status).toBe(400);
        expect(((await wrong.json()) as any).error).toBe("invalid_grant");
        expect((await exchange(t.verifier)).status).toBe(200);
        const replay = await exchange(t.verifier);
        expect(replay.status).toBe(400);
        expect(((await replay.json()) as any).error).toBe("invalid_grant");
    });

    it("only the browser that started the request can finish it", async () => {
        const t = await setup();
        const userId = await createUser();
        const { state, approval } = await approved(t, userId);
        const attacker = await t.callback(state, "__Host-other=forged", approval);
        expect(attacker.status).toBe(400);
        expect(attacker.headers.get("location")).toBeNull();
        expect(await rows(userId)).toEqual([]);
    });

    it("an approval can be used once: a replay finds it gone and the client is told no", async () => {
        const t = await setup();
        const userId = await createUser();
        const first = await approved(t, userId);
        expect((await t.callback(first.state, first.cookie, first.approval)).status).toBe(302);
        expect(await rows(userId)).toHaveLength(1);

        const replay = await t.callback(first.state, first.cookie, first.approval);
        expect(new URL(replay.headers.get("location") ?? REDIRECT).searchParams.get("code")).toBeNull();
        expect(await rows(userId)).toHaveLength(1);
    });

    it("an approval given for another request never completes this one", async () => {
        const t = await setup();
        const userId = await createUser();
        const mine = parseAuthorize(await t.authorize());
        const theirs = await approved(t, userId);
        const response = await t.callback(mine.state, mine.cookie, theirs.approval);
        const location = new URL(response.headers.get("location")!);
        expect(location.searchParams.get("error")).toBe("access_denied");
        expect(location.searchParams.get("code")).toBeNull();
        expect(await rows(userId)).toEqual([]);
    });

    it("declining tells the client access_denied, with its own state, and records nothing", async () => {
        const t = await setup();
        const userId = await createUser();
        const { state, cookie } = parseAuthorize(await t.authorize());
        const url = declineConnectUrl(t.env, state);
        expect(url).toBe(`${ORIGIN}/oauth/callback?state=${encodeURIComponent(state)}`);

        const response = await t.callback(state, cookie);
        const location = new URL(response.headers.get("location")!);
        expect(location.origin + location.pathname).toBe(REDIRECT);
        expect(location.searchParams.get("error")).toBe("access_denied");
        expect(location.searchParams.get("state")).toBe("client-state");
        expect(await rows(userId)).toEqual([]);
        expect(await readConnectRequest(t.env, state)).toBeNull();
    });

    it("an expired approval declines instead of granting", async () => {
        const t = await setup();
        const userId = await createUser();
        const { state, cookie, approval } = await approved(t, userId);
        t.kv.map.delete(`cadence:mcp-approval:${approval}`);
        const location = new URL((await t.callback(state, cookie, approval)).headers.get("location")!);
        expect(location.searchParams.get("error")).toBe("access_denied");
        expect(await rows(userId)).toEqual([]);
    });

    it("grants only scopes Cadence knows, even if an approval carries others", async () => {
        const t = await setup();
        const userId = await createUser();
        const { state, cookie } = parseAuthorize(await t.authorize());
        const { hashIdentifier } = await import("../../src/platform/log");
        t.kv.map.set(
            "cadence:mcp-approval:forged",
            JSON.stringify({
                userId,
                requestHash: await hashIdentifier(state),
                scopes: ["cadence:read", "admin:everything"],
            }),
        );
        const done = await t.callback(state, cookie, "forged");
        expect(done.status).toBe(302);
        expect((await rows(userId))[0].scopes).toEqual(["cadence:read"]);
    });

    it("reconnecting the same installation replaces the old row", async () => {
        const t = await setup();
        const userId = await createUser();
        for (let i = 0; i < 2; i++) {
            const a = await approved(t, userId);
            await t.callback(a.state, a.cookie, a.approval);
        }
        const all = await rows(userId);
        expect(all.map((r) => r.revoked)).toEqual([true, false]);
    });

    it("approving a request that expired or never existed is a 404, and writes no approval", async () => {
        const t = await setup();
        await expect(
            approveConnectRequest(t.env, await createUser(), "n".repeat(32), ["cadence:read"]),
        ).rejects.toMatchObject({
            statusCode: 404,
        });
        expect([...t.kv.map.keys()].some((k) => k.startsWith("cadence:mcp-approval:"))).toBe(false);
    });
});

describe("without storage", () => {
    it("every entry point says it's unavailable instead of throwing a 500", async () => {
        const env = { MCP_ORIGIN: ORIGIN } as any;
        await expect(readConnectRequest(env, "x")).rejects.toMatchObject({
            statusCode: 503,
            code: "STORAGE_UNAVAILABLE",
        });
        await expect(approveConnectRequest(env, "u", "x", [])).rejects.toMatchObject({ statusCode: 503 });
        expect(await liveConnectionIds(env, "u")).toBeNull();
        await expect(revokeAllGrants(env, "u")).resolves.toBeUndefined();
    });
});

describe("grants after connecting", () => {
    it("liveConnectionIds lists the grant's connection, then drops it once disconnected", async () => {
        const t = await setup();
        const userId = await createUser();
        const a = await approved(t, userId);
        await t.callback(a.state, a.cookie, a.approval);
        const [{ id }] = await rows(userId);

        expect([...(await liveConnectionIds(t.env, userId))!]).toEqual([id]);
        expect(await revokeConnection(t.env, userId, id)).toBe(true);
        expect([...(await liveConnectionIds(t.env, userId))!]).toEqual([]);
        expect(await revokeConnection(t.env, userId, id)).toBe(false);
        expect((await rows(userId))[0].revoked).toBe(true);
    });

    it("disconnecting one connection leaves another person's, and revokeAllGrants clears every one", async () => {
        const t = await setup();
        const [alice, bob] = [await createUser(), await createUser()];
        for (const u of [alice, bob]) {
            const a = await approved(t, u);
            await t.callback(a.state, a.cookie, a.approval);
        }
        const [mine] = await rows(alice);
        const [theirs] = await rows(bob);

        expect(await revokeConnection(t.env, alice, theirs.id)).toBe(false);
        expect((await rows(bob))[0].revoked).toBe(false);
        expect([...(await liveConnectionIds(t.env, bob))!]).toEqual([theirs.id]);

        await revokeAllGrants(t.env, alice);
        expect([...(await liveConnectionIds(t.env, alice))!]).toEqual([]);
        expect([...(await liveConnectionIds(t.env, bob))!]).toEqual([theirs.id]);
        expect(mine.id).not.toBe(theirs.id);
    });

    it("a KV failure while listing is reported as unknown, and a failed revoke never throws", async () => {
        const kv = kvStore();
        const broken = { ...kv, list: async () => Promise.reject(new Error("kv down")) };
        const env = { OAUTH_KV: broken, MCP_ORIGIN: ORIGIN } as any;
        expect(await liveConnectionIds(env, "u")).toBeNull();
        await expect(revokeAllGrants(env, "u")).resolves.toBeUndefined();
    });
});
