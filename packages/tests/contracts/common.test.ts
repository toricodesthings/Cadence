import { describe, expect, it } from "vitest";
import {
    apiErrorSchema,
    instantSchema,
    isoDateTimeSchema,
    legacyTimeInputSchema,
    localDateSchema,
    wallTimeSchema,
    zoneSchema,
    paginationSchema,
    uuidParamSchema,
} from "@cadence/contracts/common";

describe("timestamps", () => {
    it.each([
        ["2026-03-01T12:00:00.000Z", true],
        ["2026-03-01T12:00:00-05:00", true],
        ["2026-03-01T12:00:00", false], // no zone: ambiguous on the wire
        ["2026-03-01", false],
    ])("isoDateTimeSchema(%s) → %s", (value, ok) => {
        expect(isoDateTimeSchema.safeParse(value).success).toBe(ok);
    });

    it.each([
        ["2026-03-01", true],
        ["2026-02-30", false],
        ["2026-03-01T12:00:00.000Z", false],
        ["March 1", false],
    ])("localDateSchema(%s) → %s", (value, ok) => {
        expect(localDateSchema.safeParse(value).success).toBe(ok);
    });

    it.each([
        ["2026-03-01T12:00:00-05:00", true],
        ["2026-03-01", false],
        ["2026-03-01T12:00:00", false],
    ])("instantSchema(%s) → %s", (value, ok) => {
        expect(instantSchema.safeParse(value).success).toBe(ok);
    });

    it.each([
        ["09:05", true],
        ["23:59", true],
        ["24:00", false],
        ["9:05", false],
        ["09:05:00", false],
    ])("wallTimeSchema(%s) → %s", (value, ok) => {
        expect(wallTimeSchema.safeParse(value).success).toBe(ok);
    });

    it.each([
        ["America/Toronto", true],
        ["UTC", true],
        ["local", false],
        ["-04:00", false],
        ["Not/AZone", false],
    ])("zoneSchema(%s) → %s", (value, ok) => {
        expect(zoneSchema.safeParse(value).success).toBe(ok);
    });

    it("legacyTimeInputSchema accepts a day or an instant, nothing else", () => {
        expect(legacyTimeInputSchema.safeParse("2026-03-01").success).toBe(true);
        expect(legacyTimeInputSchema.safeParse("2026-03-01T12:00:00Z").success).toBe(true);
        expect(legacyTimeInputSchema.safeParse("March 1").success).toBe(false);
    });

    it("flexibleDateTimeSchema is gone from the contracts source", () => {
        // Vite's glob (no node types in this package).
        const files = (import.meta as unknown as { glob: (p: string, o: object) => Record<string, string> }).glob(
            "../../contracts/src/**/*.ts",
            { query: "?raw", import: "default", eager: true },
        );
        expect(Object.keys(files).length).toBeGreaterThan(5);
        const hits = Object.entries(files)
            .filter(([, src]) => /flexibleDateTimeSchema|normalizeStartBoundary|normalizeEndBoundary/.test(src))
            .map(([f]) => f);
        expect(hits).toEqual([]);
    });
});

describe("paginationSchema", () => {
    it("defaults to the first 50 rows", () => {
        expect(paginationSchema.parse({})).toEqual({ limit: 50, offset: 0 });
    });

    it("coerces query-string numbers", () => {
        expect(paginationSchema.parse({ limit: "10", offset: "20" })).toEqual({ limit: 10, offset: 20 });
    });

    it.each([{ limit: 0 }, { limit: 101 }, { offset: -1 }, { limit: 1.5 }])("rejects %j", (query) => {
        expect(paginationSchema.safeParse(query).success).toBe(false);
    });
});

describe("uuidParamSchema", () => {
    it("accepts a uuid and rejects anything else", () => {
        expect(uuidParamSchema.safeParse({ id: "22222222-2222-4222-8222-222222222222" }).success).toBe(true);
        expect(uuidParamSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    });
});

describe("apiErrorSchema", () => {
    const body = { code: "NOT_FOUND", message: "Task not found", status: 404, isRetryable: false, requestId: "req_1" };

    it("carries requestId at the top of the error", () => {
        expect(apiErrorSchema.parse({ error: body }).error.requestId).toBe("req_1");
    });

    it("rejects a code that isn't in ERROR_CODES", () => {
        expect(apiErrorSchema.safeParse({ error: { ...body, code: "INTERNAL_SERVER_ERROR" } }).success).toBe(false);
    });
});
