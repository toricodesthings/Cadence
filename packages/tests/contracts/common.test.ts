import { describe, expect, it } from "vitest";
import { flexibleDateTimeSchema, isoDateTimeSchema, paginationSchema, uuidParamSchema } from "@cadence/contracts/common";

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
