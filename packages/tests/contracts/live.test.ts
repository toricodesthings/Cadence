import { describe, expect, it } from "vitest";
import { liveChangeSchema, liveMessageSchema } from "@cadence/contracts/live";

describe("live contracts", () => {
    it("accepts event and routine live changes", () => {
        expect(liveChangeSchema.parse({ type: "event" })).toEqual({ type: "event" });
        expect(liveChangeSchema.parse({ type: "routine" })).toEqual({ type: "routine" });
        expect(liveMessageSchema.parse({ v: 1, changes: [{ type: "event" }, { type: "routine" }] })).toEqual({
            v: 1,
            changes: [{ type: "event" }, { type: "routine" }],
        });
    });
});
