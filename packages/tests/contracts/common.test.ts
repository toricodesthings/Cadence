import { describe, expect, it } from "vitest";
import {
    apiErrorSchema,
    flexibleDateTimeSchema,
    isoDateTimeSchema,
    normalizeEndBoundary,
    normalizeStartBoundary,
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
        ["2026-03-01T12:00:00.000Z", true],
        ["2026-02-30", false],
        ["March 1", false],
    ])("flexibleDateTimeSchema(%s) → %s", (value, ok) => {
        expect(flexibleDateTimeSchema.safeParse(value).success).toBe(ok);
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

describe("range boundary normalization", () => {
    it("expands date-only boundaries to the inclusive start/end of that UTC day", () => {
        expect(normalizeStartBoundary("2026-03-01")).toBe("2026-03-01T00:00:00.000Z");
        expect(normalizeEndBoundary("2026-03-31")).toBe("2026-03-31T23:59:59.999Z");
    });

    it("passes full datetimes through unchanged", () => {
        const iso = "2026-03-01T12:30:00.000Z";
        expect(normalizeStartBoundary(iso)).toBe(iso);
        expect(normalizeEndBoundary(iso)).toBe(iso);
    });
});
