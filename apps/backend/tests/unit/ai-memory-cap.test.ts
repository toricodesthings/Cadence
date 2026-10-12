import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ client: null as null | { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<unknown> } }));
vi.mock("../../src/platform/redis", () => ({ getRedis: () => null, getRateLimitRedis: () => redis.client }));

import { DAILY_EXTRACTIONS, withinDailyCap } from "../../src/domains/ai/memory/memory-job";

const USER = "11111111-1111-4111-8111-111111111111";
const env = {} as never;
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("withinDailyCap", () => {
    const counts = new Map<string, number>();
    beforeEach(() => {
        counts.clear();
        redis.client = {
            incr: async (key) => counts.set(key, (counts.get(key) ?? 0) + 1).get(key)!,
            expire: vi.fn(async () => 1),
        };
    });

    it("allows a day's budget, then stops, and starts over the next day", async () => {
        for (let i = 0; i < DAILY_EXTRACTIONS; i++) expect(await withinDailyCap(env, USER, day("2026-10-12"))).toBe(true);
        expect(await withinDailyCap(env, USER, day("2026-10-12"))).toBe(false);
        expect(await withinDailyCap(env, USER, day("2026-10-13"))).toBe(true);
    });

    it("counts each person on their own, and sets the key to expire on the first use", async () => {
        const other = "22222222-2222-4222-8222-222222222222";
        for (let i = 0; i < DAILY_EXTRACTIONS; i++) await withinDailyCap(env, USER, day("2026-10-12"));
        expect(await withinDailyCap(env, other, day("2026-10-12"))).toBe(true);
        expect(redis.client!.expire).toHaveBeenCalledTimes(2);
    });

    it("never blocks when there is no Redis, or when it fails", async () => {
        redis.client = null;
        expect(await withinDailyCap(env, USER, day("2026-10-12"))).toBe(true);
        redis.client = { incr: async () => { throw new Error("down"); }, expire: async () => 1 };
        expect(await withinDailyCap(env, USER, day("2026-10-12"))).toBe(true);
    });
});
