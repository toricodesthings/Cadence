import { describe, expect, it, beforeEach } from "vitest";
import { FakeRedis } from "../helpers/fake-redis";
import {
    resolveLimits,
    estimateReserve,
    admit,
    settle,
    readUsage,
    readTotalTokens,
    addStepSpend,
    emptyUsage,
    type AiLimits,
} from "../../src/domains/ai/safety/rate-limit";
import { rlKeys } from "../../src/domains/ai/safety/rate-limit-keys";
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
    images24h: 3,
    imagesPerMessage: 4,
    imagesMaxPending: 8,
    failClosed: false,
};

const k = rlKeys(USER_KEY);
const asRedis = (r: FakeRedis) => r as unknown as Parameters<typeof admit>[0];

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

    it("reads the three image caps, with defaults", () => {
        expect(resolveLimits({} as Env)).toMatchObject({ images24h: 20, imagesPerMessage: 4, imagesMaxPending: 8 });
        const l = resolveLimits({ AI_RL_IMAGES_24H: "5", AI_IMAGES_PER_MESSAGE: "2", AI_IMAGES_MAX_PENDING: "3" } as Env);
        expect(l).toMatchObject({ images24h: 5, imagesPerMessage: 2, imagesMaxPending: 3 });
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

    it("holds tokens for each image", () => {
        const big = { ...limits, reserve: 1 };
        expect(estimateReserve(0, big, 2) - estimateReserve(0, big)).toBe(2_400);
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

describe("addStepSpend", () => {
    const step = (cost: unknown, modelId?: string) => ({
        providerMetadata: { openrouter: { usage: { cost } } },
        response: { modelId },
    });

    it("sums OpenRouter's cost across steps and keeps the last served model", () => {
        const spend = addStepSpend(addStepSpend({}, step(0.002, "google/gemini-3.8-flash")), step(0.0005, "google/gemini-3.7-flash"));
        expect(spend.costUsd).toBeCloseTo(0.0025);
        expect(spend.servedModel).toBe("google/gemini-3.7-flash");
    });

    it("leaves cost unset when no step reported one (unknown, not free)", () => {
        expect(addStepSpend({}, { providerMetadata: undefined }).costUsd).toBeUndefined();
        expect(addStepSpend({ costUsd: 0.001 }, step(undefined)).costUsd).toBe(0.001);
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

describe("admit — over each cap rejects", () => {
    it.each([
        ["5h request", () => k.req5h, limits.requests5h, "5h", "req"],
        ["5h token", () => k.tok5h, limits.tokens5h, "5h", "tok"],
        ["7d request", () => k.req7d, limits.requests7d, "7d", "req"],
        ["7d token", () => k.tok7d, limits.tokens7d, "7d", "tok"],
        ["concurrency", () => k.inflight, limits.maxConcurrent, undefined, "concurrency"],
    ] as const)("rejects on the %s cap", async (_label, key, cap, window, dimension) => {
        const redis = new FakeRedis();
        redis.strings.set(key(), String(cap));
        const res = await admit(asRedis(redis), USER_KEY, limits.reserve, limits);
        if (res.ok) throw new Error("expected reject");
        if (window) expect(res.window).toBe(window);
        expect(res.dimension).toBe(dimension);
    });
});

describe("admit — image quota", () => {
    let redis: FakeRedis;
    beforeEach(() => (redis = new FakeRedis()));

    it("counts new image sends and anchors the 24h window on the first one only", async () => {
        const a = await admit(asRedis(redis), USER_KEY, limits.reserve, limits, 0);
        expect(a.ok).toBe(true);
        expect(redis.strings.has(k.img24h)).toBe(false); // n = 0 never touches the quota

        await admit(asRedis(redis), USER_KEY, limits.reserve, limits, 2);
        expect(redis.strings.get(k.img24h)).toBe("2");
        redis.ttls.set(k.img24h, Date.now() + 5_000);
        const b = await admit(asRedis(redis), USER_KEY, limits.reserve, limits, 1);
        expect(redis.strings.get(k.img24h)).toBe("3");
        expect(await redis.pttl(k.img24h)).toBeLessThanOrEqual(5_000);
        if (b.ok) expect(b.remaining.img24h).toBe(0);
    });

    it("rejects past the cap without changing anything, as AI_IMAGE_LIMITED", async () => {
        redis.strings.set(k.img24h, "2");
        redis.ttls.set(k.img24h, Date.now() + 60_000);
        const res = await admit(asRedis(redis), USER_KEY, limits.reserve, limits, 2);
        if (res.ok) throw new Error("expected reject");
        expect(res).toMatchObject({ code: "AI_IMAGE_LIMITED", window: "24h", dimension: "img" });
        expect(res.retryAfterS).toBeLessThanOrEqual(60);
        expect(redis.strings.get(k.img24h)).toBe("2");
        expect(redis.strings.has(k.req5h)).toBe(false);
        expect(redis.strings.has(k.inflight)).toBe(false);
    });

    it("never trips on a text-only turn at the cap", async () => {
        redis.strings.set(k.img24h, String(limits.images24h));
        expect((await admit(asRedis(redis), USER_KEY, limits.reserve, limits, 0)).ok).toBe(true);
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
        expect(usage.images).toEqual({ used: 0, limit: limits.images24h, perMessage: limits.imagesPerMessage, resetEpoch: null });
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
