import { Hono } from "hono";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
const redis = vi.hoisted(() => ({ tries: 0 }));
// Counts presence tries like the real budget does; `set` (the deleted-account flag) is best effort and absent here.
vi.mock("../../src/platform/redis", () => ({
    getRedis: () => null,
    getRateLimitRedis: () => ({ incr: async () => ++redis.tries, expire: async () => 1 }),
}));

import { accountRoutes } from "../../src/domains/account/account.route";

beforeAll(startTestDb);
afterEach(() => {
    vi.unstubAllGlobals();
    redis.tries = 0;
});

const AUTH = "https://auth.test/neondb/auth";
const env = {
    NEON_API_KEY: "k",
    NEON_PROJECT_ID: "p",
    NEON_BRANCH_ID: "b",
    NEON_AUTH_JWKS_URL: `${AUTH}/.well-known/jwks.json`,
};
const BODY = { confirmation: "delete my account", password: "pw" };

/** Neon Auth answers the password check as `signsInAs`; the Neon admin API answers `adminStatus`. */
function neon(signsInAs: string, adminStatus = 200) {
    const fetchMock = vi.fn(async (url: string) => {
        if (url.endsWith("/sign-in/email")) return Response.json({ user: { id: signsInAs } });
        if (url.includes("console.neon.tech")) return new Response(null, { status: adminStatus });
        return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

async function deleteAs(userId: string, body: unknown = BODY, withEnv: Record<string, unknown> = env) {
    const app = new Hono();
    app.use("*", async (c, next) => {
        c.set("userEmail" as never, "me@test.dev" as never);
        await next();
    });
    app.route("/", createTestApp("/account", accountRoutes, userId));
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {}, props: {} };
    const res = await app.request(
        "http://localhost/account/delete",
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        },
        withEnv,
        ctx as unknown as ExecutionContext,
    );
    await Promise.all(pending);
    return { status: res.status, body: (await res.json()) as any };
}

const count = async (table: string, userId: string) =>
    (
        await asOwner((pg) =>
            pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [userId]),
        )
    ).rows[0].n;
const userExists = async (id: string) =>
    (await asOwner((pg) => pg.query("SELECT 1 FROM users WHERE id = $1", [id]))).rows.length === 1;

async function withTask(userId: string) {
    await asOwner((pg) =>
        pg.query("INSERT INTO tasks (user_id, title, order_index) VALUES ($1, 'Keep me', 1)", [userId]),
    );
}

describe("POST /account/delete", () => {
    it("removes the workspace and everything under it, then the sign-in identity, and only that person's", async () => {
        const [me, other] = [await createUser(), await createUser()];
        await withTask(me);
        await withTask(other);
        const fetchMock = neon(me);

        const res = await deleteAs(me);

        expect(res).toMatchObject({ status: 200, body: { data: { deleted: true } } });
        expect(await userExists(me)).toBe(false);
        expect(await count("tasks", me)).toBe(0);
        expect(await userExists(other)).toBe(true);
        expect(await count("tasks", other)).toBe(1);
        expect(fetchMock).toHaveBeenLastCalledWith(
            `https://console.neon.tech/api/v2/projects/p/branches/b/auth/users/${me}`,
            expect.objectContaining({ method: "DELETE" }),
        );
    });

    it("refuses before touching anything when the identity step could not run", async () => {
        const me = await createUser();
        await withTask(me);
        const fetchMock = neon(me);

        const res = await deleteAs(me, BODY, { NEON_AUTH_JWKS_URL: env.NEON_AUTH_JWKS_URL });

        expect(res.status).toBe(503);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await count("tasks", me)).toBe(1);
    });

    it.each([
        ["a password that signs in as someone else", () => neon("someone-else"), BODY],
        ["a missing confirmation phrase", null, { confirmation: "yes", password: "pw" }],
        ["no password or code", null, { confirmation: "delete my account" }],
    ])("keeps the account on %s", async (_name, stub, body) => {
        const me = await createUser();
        await withTask(me);
        stub?.();
        if (!stub) vi.stubGlobal("fetch", vi.fn());

        const res = await deleteAs(me, body);

        expect([400, 403]).toContain(res.status);
        expect(await userExists(me)).toBe(true);
        expect(await count("tasks", me)).toBe(1);
    });

    it("stops guessing after the day's tries, without asking Neon Auth", async () => {
        const me = await createUser();
        const fetchMock = neon(me);
        redis.tries = 10;

        const res = await deleteAs(me);

        expect(res.status).toBe(429);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await userExists(me)).toBe(true);
    });

    it("says so when the identity can't be removed (the workspace is already gone, a retry finishes it)", async () => {
        const me = await createUser();
        neon(me, 500);

        const res = await deleteAs(me);

        expect(res.status).toBe(502);
        expect(res.body.error.isRetryable).toBe(true);
    });
});
