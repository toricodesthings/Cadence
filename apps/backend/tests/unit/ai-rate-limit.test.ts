import { describe, expect, it, beforeEach } from "vitest";
import { FakeRedis } from "../helpers/fake-redis";
import {
    resolveLimits,
    estimateReserve,
    admit,
    settle,
    readUsage,
    readTotalTokens,
    emptyUsage,
    type AiLimits,
} from "../../src/domains/ai/safety/rate-limit";
import { rlKeys, RL_NS } from "../../src/domains/ai/safety/rate-limit-keys";
import type { Env } from "../../src/types/env";

const USER_KEY = "deadbeefdeadbeef";

// Small, easy-to-breach limits so each cap can be driven independently.
const limits: AiLimits = {
    requests5h: 5,
    tokens5h: 10_000,
    requests7d: 20,
    tokens7d: 100_000,
    maxConcurrent: 3,
    reserve: 1_000,
    failClosed: false,
};

const k = rlKeys(USER_KEY);
const asRedis = (r: FakeRedis) => r as unknown as Parameters<typeof admit>[0];

describe("rate-limit-keys", () => {
    it("builds tenant-scoped keys under the namespace + userKey", () => {
        expect(k.req5h).toBe(`${RL_NS}:${USER_KEY}:5h:req`);
        expect(k.tok5h).toBe(`${RL_NS}:${USER_KEY}:5h:tok`);
        expect(k.req7d).toBe(`${RL_NS}:${USER_KEY}:7d:req`);
        expect(k.tok7d).toBe(`${RL_NS}:${USER_KEY}:7d:tok`);
        expect(k.inflight).toBe(`${RL_NS}:${USER_KEY}:inflight`);
    });

    it("never builds the same key across two different userKeys (§15.1)", () => {
        expect(rlKeys("aaaa").tok5h).not.toBe(rlKeys("bbbb").tok5h);
    });
});

describe("resolveLimits", () => {
    it("falls back to the §6 defaults when env is empty", () => {
        const l = resolveLimits({} as Env);
        expect(l).toMatchObject({
            requests5h: 150,
            tokens5h: 750_000,
            requests7d: 1_500,
            tokens7d: 6_000_000,
            maxConcurrent: 3,
            reserve: 6_000,
            failClosed: false,
        });
    });

    it("parses overrides and the fail-closed switch", () => {
        const l = resolveLimits({
            AI_RL_REQUESTS_5H: "10",
            AI_RL_TOKENS_5H: "2000",
            AI_RL_MAX_CONCURRENT: "1",
            AI_RATE_LIMIT_FAIL_MODE: "closed",
        } as Env);
        expect(l.requests5h).toBe(10);
        expect(l.tokens5h).toBe(2000);
        expect(l.maxConcurrent).toBe(1);
        expect(l.failClosed).toBe(true);
    });

    it("ignores non-positive / garbage values and keeps the default", () => {
        const l = resolveLimits({ AI_RL_REQUESTS_5H: "0", AI_RL_TOKENS_5H: "abc" } as Env);
        expect(l.requests5h).toBe(150);
        expect(l.tokens5h).toBe(750_000);
    });
});

describe("estimateReserve", () => {
    it("floors at the configured reserve for small input", () => {
        expect(estimateReserve(0, { ...limits, reserve: 50_000 })).toBe(50_000);
    });

    it("scales above the floor with input size and never drops below the reserve", () => {
        const small = estimateReserve(0, limits);
        const large = estimateReserve(400_000, limits);
        expect(large).toBeGreaterThan(small);
        expect(small).toBeGreaterThanOrEqual(limits.reserve);
    });
});

describe("readTotalTokens", () => {
    it("reads metadata.totalUsage.totalTokens", () => {
        expect(readTotalTokens({ metadata: { totalUsage: { totalTokens: 1500 } } })).toBe(1500);
    });

    it("falls back to inputTokens + outputTokens", () => {
        expect(readTotalTokens({ metadata: { totalUsage: { inputTokens: 200, outputTokens: 300 } } })).toBe(500);
    });

    it("returns 0 when usage is absent (errored/aborted turn → reservation refunded)", () => {
        expect(readTotalTokens({ metadata: {} })).toBe(0);
        expect(readTotalTokens(null)).toBe(0);
    });
});

describe("admit — under cap", () => {
    let redis: FakeRedis;
    beforeEach(() => (redis = new FakeRedis()));

    it("admits, increments requests, reserves tokens, and bumps inflight", async () => {
        const res = await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.reserved).toBe(limits.reserve);
        expect(redis.strings.get(k.req5h)).toBe("1");
        expect(redis.strings.get(k.req7d)).toBe("1");
        expect(redis.strings.get(k.tok5h)).toBe(String(limits.reserve));
        expect(redis.strings.get(k.tok7d)).toBe(String(limits.reserve));
        expect(redis.strings.get(k.inflight)).toBe("1");
    });

    it("reports remaining headroom and a future reset epoch", async () => {
        const res = await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        if (!res.ok) throw new Error("expected admit");
        expect(res.remaining.req5h).toBe(limits.requests5h - 1);
        expect(res.remaining.tok5h).toBe(limits.tokens5h - limits.reserve);
        expect(res.remaining.reset5hEpoch).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("is a single billed command / round-trip — one atomic EVAL (§15.3)", async () => {
        const before = redis.requests;
        await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        expect(redis.requests - before).toBe(1); // one EVAL; no rollback round-trip
        expect(redis.commandLog.filter((c) => c === "eval").length).toBe(1);
    });
});

describe("admit — over each cap rejects and rolls back (budget-neutral)", () => {
    let redis: FakeRedis;
    beforeEach(() => (redis = new FakeRedis()));

    async function expectRollbackNeutral(seed: Record<string, string>) {
        for (const [key, val] of Object.entries(seed)) redis.strings.set(key, val);
        const snapshot = { ...seed };
        const res = await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        expect(res.ok).toBe(false);
        // Every seeded counter is back to its pre-attempt value (rollback is budget-neutral).
        for (const [key, val] of Object.entries(snapshot)) expect(redis.strings.get(key)).toBe(val);
        // The concurrency slot this attempt took is released back to its pre-attempt value.
        const expectedInflight = Number(snapshot[k.inflight] ?? "0");
        expect(Number(redis.strings.get(k.inflight) ?? "0")).toBe(expectedInflight);
        return res;
    }

    it("rejects on the 5h request cap", async () => {
        const res = await expectRollbackNeutral({ [k.req5h]: String(limits.requests5h) });
        if (res.ok) throw new Error("expected reject");
        expect(res.window).toBe("5h");
        expect(res.dimension).toBe("req");
        expect(res.retryAfterS).toBeGreaterThan(0);
    });

    it("rejects on the 5h token cap", async () => {
        const res = await expectRollbackNeutral({ [k.tok5h]: String(limits.tokens5h) });
        if (res.ok) throw new Error("expected reject");
        expect(res.window).toBe("5h");
        expect(res.dimension).toBe("tok");
    });

    it("rejects on the 7d request cap", async () => {
        const res = await expectRollbackNeutral({ [k.req7d]: String(limits.requests7d) });
        if (res.ok) throw new Error("expected reject");
        expect(res.window).toBe("7d");
        expect(res.dimension).toBe("req");
    });

    it("rejects on the 7d token cap", async () => {
        const res = await expectRollbackNeutral({ [k.tok7d]: String(limits.tokens7d) });
        if (res.ok) throw new Error("expected reject");
        expect(res.window).toBe("7d");
        expect(res.dimension).toBe("tok");
    });

    it("rejects on the concurrency cap", async () => {
        const res = await expectRollbackNeutral({ [k.inflight]: String(limits.maxConcurrent) });
        if (res.ok) throw new Error("expected reject");
        expect(res.dimension).toBe("concurrency");
        expect(res.retryAfterS).toBeGreaterThan(0);
    });
});

describe("admit — anchor-on-first-write window TTL", () => {
    it("does not extend the window TTL on a later admit (EXPIRE … NX)", async () => {
        const redis = new FakeRedis();
        await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        // Simulate the window having mostly elapsed.
        redis.ttls.set(k.req5h, Date.now() + 1_234);
        await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        // NX kept the original (short) TTL — it was NOT reset back up to the full window.
        expect(await redis.pttl(k.req5h)).toBeLessThanOrEqual(1_234);
    });
});

describe("settle — reconcile to actual + release concurrency", () => {
    let redis: FakeRedis;
    beforeEach(() => (redis = new FakeRedis()));

    it("is a single billed command / round-trip — one atomic EVAL", async () => {
        await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        const before = redis.requests;
        await settle(asRedis(redis), USER_KEY, limits.reserve, 1_500);
        expect(redis.requests - before).toBe(1);
        expect(redis.commandLog.filter((c) => c === "eval").length).toBe(2); // admit + settle
    });

    it("tops up when actual exceeds the reserve (under-estimate)", async () => {
        await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        await settle(asRedis(redis), USER_KEY, limits.reserve, 1_500);
        expect(redis.strings.get(k.tok5h)).toBe("1500");
        expect(redis.strings.get(k.tok7d)).toBe("1500");
        expect(redis.strings.get(k.inflight)).toBe("0");
    });

    it("refunds the unused hold when actual is below the reserve", async () => {
        await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        await settle(asRedis(redis), USER_KEY, limits.reserve, 200);
        expect(redis.strings.get(k.tok5h)).toBe("200");
        expect(redis.strings.get(k.inflight)).toBe("0");
    });

    it("floors inflight at 0 — a stray release can never drive concurrency negative", async () => {
        // No prior admit, so inflight starts at 0; settle's DECR must not go to -1.
        await settle(asRedis(redis), USER_KEY, limits.reserve, 200);
        expect(redis.strings.get(k.inflight)).toBe("0");
    });
});

describe("readUsage / emptyUsage", () => {
    it("reflects a completed admit→settle cycle as actual usage", async () => {
        const redis = new FakeRedis();
        await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        await settle(asRedis(redis), USER_KEY, limits.reserve, 1_500);

        const usage = await readUsage(asRedis(redis), USER_KEY, limits);
        expect(usage.enabled).toBe(true);
        expect(usage.windows["5h"].requests).toEqual({ used: 1, limit: limits.requests5h });
        expect(usage.windows["5h"].tokens).toEqual({ used: 1_500, limit: limits.tokens5h });
        expect(usage.windows["5h"].resetEpoch).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("emptyUsage is a disabled, zero-used placeholder carrying the limits", () => {
        const u = emptyUsage(limits);
        expect(u.enabled).toBe(false);
        expect(u.windows["5h"]).toEqual({
            requests: { used: 0, limit: limits.requests5h },
            tokens: { used: 0, limit: limits.tokens5h },
            resetEpoch: null,
        });
    });
});

describe("concurrency cap end-to-end", () => {
    it("admits up to maxConcurrent, rejects the next, and reopens a slot on settle", async () => {
        const redis = new FakeRedis();
        const small = { ...limits, maxConcurrent: 2 };
        const a = await admit(asRedis(redis), USER_KEY, small.reserve, small);
        const b = await admit(asRedis(redis), USER_KEY, small.reserve, small);
        const c = await admit(asRedis(redis), USER_KEY, small.reserve, small);
        expect([a.ok, b.ok, c.ok]).toEqual([true, true, false]);
        if (!c.ok) expect(c.dimension).toBe("concurrency");

        // Releasing one in-flight turn frees a slot for the next admit.
        await settle(asRedis(redis), USER_KEY, small.reserve, 100);
        const d = await admit(asRedis(redis), USER_KEY, small.reserve, small);
        expect(d.ok).toBe(true);
    });
});
