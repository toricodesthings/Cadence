import { describe, expect, it, vi } from "vitest";
import { getRedis } from "../../src/platform/redis";
import { logger } from "../../src/platform/log";
import type { Env } from "../../src/types/env";

function envWith(overrides: Partial<Env>): Env {
    return {
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "test-token",
        ...overrides,
    } as Env;
}

describe("getRedis", () => {
    it("returns null when url or token is missing", () => {
        expect(getRedis(envWith({ UPSTASH_REDIS_REST_URL: undefined }))).toBeNull();
        expect(getRedis(envWith({ UPSTASH_REDIS_REST_TOKEN: undefined }))).toBeNull();
    });

    it("refuses a non-https endpoint and logs redis_insecure_url (§15.4)", () => {
        const spy = vi.spyOn(logger, "error");
        const client = getRedis(envWith({ UPSTASH_REDIS_REST_URL: "http://insecure.upstash.io" }));
        expect(client).toBeNull();
        expect(spy).toHaveBeenCalledWith("ai", "redis_insecure_url", {});
    });
});
