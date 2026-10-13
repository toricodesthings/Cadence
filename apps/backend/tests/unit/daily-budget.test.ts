import { afterEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ client: null as null | { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<unknown> } }));
vi.mock("../../src/platform/redis", () => ({ getRedis: () => null, getRateLimitRedis: () => redis.client }));

import { withinDailyBudget } from "../../src/platform/daily-budget";
import { DAILY_DECISIONS, decideChoice } from "../../src/domains/decisions/decision";

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
        redis.client = { incr: async () => { throw new Error("down"); }, expire: async () => 1 };
        expect(await withinDailyBudget(env, "x", "h", 2)).toBe(false);
        redis.client = null;
        expect(await withinDailyBudget(env, "x", "h", 2)).toBe(true);
    });

    it("sends no model call once a person is over their decisions", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        redis.client = { incr: async () => DAILY_DECISIONS + 1, expire: async () => 1 };
        const result = await decideChoice(env, { kind: "search", state: "x", instructions: "i", candidates: [{ id: "a", label: "A" }], userHash: "h" });
        expect(result).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
