import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("../../src/platform/redis", () => ({ getRedis: () => null, getRateLimitRedis: () => redis.client }));

import {
    addDailySpend,
    secondsToUtcMidnight,
    spendWithinCap,
    withinDailyBudget,
} from "../../src/platform/daily-budget";
import { logger } from "../../src/platform/log";
import { FakeRedis } from "../helpers/fake-redis";
import { DAILY_DECISIONS, decideChoice } from "../../src/domains/decisions/decision";
import { DAILY_EXTRACTIONS, withinDailyCap } from "../../src/domains/ai/memory/memory-job";

const env = { OPENROUTER_API_KEY: "k", AI_DECISION_MODEL: "vendor/model-1" } as never;

afterEach(() => vi.unstubAllGlobals());

describe("daily budget", () => {
    it("counts up to the limit, then refuses", async () => {
        let n = 0;
        redis.client = { incr: async () => ++n, expire: vi.fn(async () => 1) };
        expect(await withinDailyBudget(env, "x", "h", 2)).toBe(true);
        expect(await withinDailyBudget(env, "x", "h", 2)).toBe(true);
        expect(await withinDailyBudget(env, "x", "h", 2)).toBe(false);
    });

    it("fails closed on a Redis error, open with no Redis", async () => {
        redis.client = {
            incr: async () => {
                throw new Error("down");
            },
            expire: async () => 1,
        };
        expect(await withinDailyBudget(env, "x", "h", 2)).toBe(false);
        redis.client = null;
        expect(await withinDailyBudget(env, "x", "h", 2)).toBe(true);
    });

    it("sends no model call once a person is over their decisions", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        redis.client = { incr: async () => DAILY_DECISIONS + 1, expire: async () => 1 };
        const result = await decideChoice(env, {
            kind: "search",
            state: "x",
            instructions: "i",
            candidates: [{ id: "a", label: "A" }],
            userHash: "h",
        });
        expect(result).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe("global daily spend ceiling", () => {
    const now = new Date("2026-11-09T18:00:00.000Z");

    it("adds charges for the UTC day and refuses once the cap is reached, logging it once", async () => {
        const fake = new FakeRedis();
        redis.client = fake;
        const error = vi.spyOn(logger, "error").mockImplementation(() => {});
        const capped = { AI_DAILY_SPEND_CAP_USD: "0.01" } as never;
        expect(await spendWithinCap(capped, now)).toBe(true);
        await addDailySpend(capped, 0.006, now);
        expect(await spendWithinCap(capped, now)).toBe(true);
        await addDailySpend(capped, 0.006, now);
        await addDailySpend(capped, 0.006, now);
        expect(await spendWithinCap(capped, now)).toBe(false);
        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][1]).toBe("ai_spend_cap_reached");
        // The default cap (10) applies when the var is unset or unparseable.
        expect(await spendWithinCap({ AI_DAILY_SPEND_CAP_USD: "lots" } as never, now)).toBe(true);
        // Tomorrow starts again.
        expect(await spendWithinCap(capped, new Date("2026-11-10T00:00:01.000Z"))).toBe(true);
        error.mockRestore();
    });

    it("fails open on a Redis error and ignores empty charges", async () => {
        redis.client = {
            get: async () => {
                throw new Error("down");
            },
            incrbyfloat: vi.fn(),
        };
        expect(await spendWithinCap(env, now)).toBe(true);
        await addDailySpend(env, undefined, now);
        await addDailySpend(env, 0, now);
        expect((redis.client as { incrbyfloat: ReturnType<typeof vi.fn> }).incrbyfloat).not.toHaveBeenCalled();
    });

    it("counts down to the next UTC midnight", () => {
        expect(secondsToUtcMidnight(now)).toBe(6 * 60 * 60);
    });
});

// Same counter shape as withinDailyBudget, but the memory cap never blocks when the store is down (fails open).
describe("memory daily extraction cap", () => {
    const USER = "11111111-1111-4111-8111-111111111111";
    const OTHER = "22222222-2222-4222-8222-222222222222";
    const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
    const counts = new Map<string, number>();
    let expire: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        counts.clear();
        expire = vi.fn(async () => 1);
        redis.client = { incr: async (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1).get(key)!, expire };
    });

    it("allows a day's budget, then stops, and starts over the next day", async () => {
        for (let i = 0; i < DAILY_EXTRACTIONS; i++)
            expect(await withinDailyCap(env, USER, day("2026-10-12"))).toBe(true);
        expect(await withinDailyCap(env, USER, day("2026-10-12"))).toBe(false);
        expect(await withinDailyCap(env, USER, day("2026-10-13"))).toBe(true);
    });

    it("counts each person on their own, and sets the key to expire on the first use", async () => {
        for (let i = 0; i < DAILY_EXTRACTIONS; i++) await withinDailyCap(env, USER, day("2026-10-12"));
        expect(await withinDailyCap(env, OTHER, day("2026-10-12"))).toBe(true);
        expect(expire).toHaveBeenCalledTimes(2);
    });

    it("never blocks when there is no Redis, or when it fails", async () => {
        redis.client = null;
        expect(await withinDailyCap(env, USER, day("2026-10-12"))).toBe(true);
        redis.client = {
            incr: async () => {
                throw new Error("down");
            },
            expire: async () => 1,
        };
        expect(await withinDailyCap(env, USER, day("2026-10-12"))).toBe(true);
    });
});
