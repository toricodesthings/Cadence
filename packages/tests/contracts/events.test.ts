import { describe, expect, it } from "vitest";
import { TRACK_BATCH_MAX, trackBatchSchema, clientErrorBatchSchema, performanceBatchSchema } from "@cadence/contracts/events";

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

describe("frontend diagnostics privacy boundary", () => {
    const error = { kind: "render", name: "TypeError", route: "list", platform: "web", version: "1.0.0" };
    const sample = { phase: "reveal", route: "capture", duration_ms: 100, elapsed_ms: 100, cache: "warm", outcome: "ready", platform: "web", viewport: "wide" };
    it("rejects arbitrary error text, private paths and unknown fields", () => {
        expect(clientErrorBatchSchema.safeParse({ errors: [error] }).success).toBe(true);
        for (const unsafe of [{ ...error, message: "private" }, { ...error, route: "/project/private" }, { ...error, code: "arbitrary text" }, { ...error, version: "private" }]) {
            expect(clientErrorBatchSchema.safeParse({ errors: [unsafe] }).success).toBe(false);
        }
        expect(clientErrorBatchSchema.safeParse({ errors: Array(TRACK_BATCH_MAX + 1).fill(error) }).success).toBe(false);
    });
    it("bounds timings and rejects private dimensions", () => {
        expect(performanceBatchSchema.safeParse({ samples: [sample] }).success).toBe(true);
        for (const unsafe of [{ ...sample, duration_ms: Infinity }, { ...sample, duration_ms: -1 }, { ...sample, elapsed_ms: 600001 }, { ...sample, queryKey: ["tasks", "private"] }]) {
            expect(performanceBatchSchema.safeParse({ samples: [unsafe] }).success).toBe(false);
        }
    });
});
