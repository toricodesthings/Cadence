import { describe, expect, it } from "vitest";
import { TRACK_BATCH_MAX, trackBatchSchema } from "@cadence/contracts/events";

describe("trackBatchSchema", () => {
    const event = { event: "task.complete" as const };

    it(`accepts up to ${TRACK_BATCH_MAX} events`, () => {
        expect(trackBatchSchema.safeParse({ events: Array(TRACK_BATCH_MAX).fill(event) }).success).toBe(true);
        expect(trackBatchSchema.safeParse({ events: Array(TRACK_BATCH_MAX + 1).fill(event) }).success).toBe(false);
    });

    it("rejects an event name the API doesn't know", () => {
        expect(trackBatchSchema.safeParse({ events: [{ event: "task.teleport" }] }).success).toBe(false);
    });
});
