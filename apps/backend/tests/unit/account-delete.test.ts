import { afterEach, describe, expect, it, vi } from "vitest";

const budget = vi.hoisted(() => ({ within: true }));
vi.mock("../../src/platform/daily-budget", () => ({ withinDailyBudget: async () => budget.within }));

import { accountRoutes, deleteAuthUser, verifyPresence } from "../../src/domains/account/account.route";
import { createTestApp } from "../helpers/app";
import type { Env } from "../../src/types/env";

const env = { NEON_API_KEY: "k", NEON_PROJECT_ID: "p", NEON_BRANCH_ID: "b" } as Env;
const user = "11111111-1111-4111-8111-111111111111";

afterEach(() => vi.unstubAllGlobals());

describe("deleteAuthUser", () => {
    it("calls the Neon API with the user's id", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        await deleteAuthUser(env, user);
        expect(fetchMock).toHaveBeenCalledWith(
            `https://console.neon.tech/api/v2/projects/p/branches/b/auth/users/${user}`,
            expect.objectContaining({ method: "DELETE" }),
        );
    });

    it("treats an already-deleted identity as done, so a retry succeeds", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
        await expect(deleteAuthUser(env, user)).resolves.toBeUndefined();
    });

    it("never puts anything but a UUID into the admin URL", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await expect(deleteAuthUser(env, "../../other")).rejects.toMatchObject({ statusCode: 400 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fails on any other error and when it is not configured", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
        await expect(deleteAuthUser(env, user)).rejects.toMatchObject({ statusCode: 502 });
        await expect(deleteAuthUser({} as Env, user)).rejects.toMatchObject({ statusCode: 503 });
    });
});

describe("verifyPresence", () => {
    const authEnv = { NEON_AUTH_JWKS_URL: "https://auth.test/neondb/auth/.well-known/jwks.json" } as Env;
    const me = { userId: user, email: "me@test.dev" };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

    it("refuses a bare session with no password or code, without calling Neon Auth", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await expect(verifyPresence(authEnv, me, {})).rejects.toMatchObject({ statusCode: 403 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts a password only when it signs in to this same account", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ user: { id: user } }));
        vi.stubGlobal("fetch", fetchMock);
        await verifyPresence(authEnv, me, { password: "pw" });
        expect(fetchMock).toHaveBeenCalledWith("https://auth.test/neondb/auth/sign-in/email", expect.anything());

        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ user: { id: "someone-else" } })));
        await expect(verifyPresence(authEnv, me, { password: "pw" })).rejects.toMatchObject({ statusCode: 403 });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ message: "Invalid" }, 401)));
        await expect(verifyPresence(authEnv, me, { password: "wrong" })).rejects.toMatchObject({ statusCode: 403 });
    });

    it("accepts an emailed code only when Neon Auth confirms it", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: true })));
        await verifyPresence(authEnv, me, { otp: "123456" });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: false })));
        await expect(verifyPresence(authEnv, me, { otp: "000000" })).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("presence checks are bounded", () => {
    const authEnv = { NEON_AUTH_JWKS_URL: "https://auth.test/neondb/auth/.well-known/jwks.json" } as Env;
    const me = { userId: user, email: "me@test.dev" };

    it("signs the password check's session out again", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: user } }), { headers: { "set-auth-token": "sess-1" } }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        await verifyPresence(authEnv, me, { password: "pw" });
        expect(fetchMock).toHaveBeenLastCalledWith("https://auth.test/neondb/auth/sign-out", expect.objectContaining({
            method: "POST", headers: { Authorization: "Bearer sess-1" },
        }));
    });

    it("refuses past the day's tries without asking Neon Auth", async () => {
        budget.within = false;
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const app = createTestApp("/account", accountRoutes);
        const res = await app.request("/account/delete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirmation: "delete my account", password: "guess" }),
        }, { ...env, ...authEnv });
        expect(res.status).toBe(429);
        expect(fetchMock).not.toHaveBeenCalled();
        budget.within = true;
    });
});
