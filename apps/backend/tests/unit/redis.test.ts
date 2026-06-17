import { describe, expect, it, vi, afterEach } from "vitest";
import { getRedis, isResumeEnabled } from "../../src/platform/redis";
import { logger } from "../../src/platform/log";
import type { Env } from "../../src/types/env";

const HTTPS_URL = "https://example.upstash.io";
const TOKEN = "test-token";

function envWith(overrides: Partial<Env>): Env {
    return {
        AI_STREAM_RESUME_ENABLED: "true",
        UPSTASH_REDIS_REST_URL: HTTPS_URL,
        UPSTASH_REDIS_REST_TOKEN: TOKEN,
        ...overrides,
    } as Env;
}

describe("getRedis", () => {
    afterEach(() => vi.restoreAllMocks());

    it("returns null when the flag is off", () => {
        expect(getRedis(envWith({ AI_STREAM_RESUME_ENABLED: "false" }))).toBeNull();
        expect(getRedis(envWith({ AI_STREAM_RESUME_ENABLED: undefined }))).toBeNull();
    });

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

    it("never logs the url or token value", () => {
        const spy = vi.spyOn(logger, "error");
        getRedis(envWith({ UPSTASH_REDIS_REST_URL: "http://insecure.upstash.io" }));
        const logged = JSON.stringify(spy.mock.calls);
        expect(logged).not.toContain("insecure.upstash.io");
        expect(logged).not.toContain(TOKEN);
    });

    it("constructs a client when flag on + https url + token present", () => {
        const client = getRedis(envWith({}));
        expect(client).not.toBeNull();
        expect(isResumeEnabled(envWith({}))).toBe(true);
    });
});
