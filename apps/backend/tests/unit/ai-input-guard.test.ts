import { describe, expect, it } from "vitest";
import { AppError } from "../../src/platform/errors";
import {
    assertMessageWithinCaps,
    clampHistory,
    MAX_HISTORY_TURNS,
    MAX_MESSAGE_CHARS,
    MAX_PART_BYTES,
    MAX_PARTS_PER_MESSAGE,
} from "../../src/domains/ai/safety/input-guard";

function expectInvalidRequest(fn: () => void) {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.code).toBe("INVALID_REQUEST");
        expect(appError.statusCode).toBe(400);
        return;
    }
    throw new Error("expected assertMessageWithinCaps to throw");
}

describe("assertMessageWithinCaps", () => {
    it("accepts a message within all caps", () => {
        expect(() =>
            assertMessageWithinCaps({ role: "user", parts: [{ type: "text", text: "hello" }] }),
        ).not.toThrow();
    });

    it("accepts a message with no parts (legacy content-only shape)", () => {
        expect(() => assertMessageWithinCaps({ role: "user" })).not.toThrow();
    });

    it("rejects too many parts", () => {
        const parts = Array.from({ length: MAX_PARTS_PER_MESSAGE + 1 }, () => ({ type: "text", text: "x" }));
        expectInvalidRequest(() => assertMessageWithinCaps({ role: "user", parts }));
    });

    it("rejects an oversized total character count", () => {
        const parts = [{ type: "text", text: "x".repeat(MAX_MESSAGE_CHARS + 1) }];
        expectInvalidRequest(() => assertMessageWithinCaps({ role: "user", parts }));
    });

    it("sums text across multiple parts for the char cap", () => {
        const half = Math.ceil(MAX_MESSAGE_CHARS / 2) + 1;
        const parts = [
            { type: "text", text: "x".repeat(half) },
            { type: "text", text: "y".repeat(half) },
        ];
        expectInvalidRequest(() => assertMessageWithinCaps({ role: "user", parts }));
    });

    it("rejects an oversized single part by byte size", () => {
        const parts = [{ type: "blob", data: "z".repeat(MAX_PART_BYTES + 1) }];
        expectInvalidRequest(() => assertMessageWithinCaps({ role: "user", parts }));
    });
});

describe("clampHistory", () => {
    it("returns all items when under the limit", () => {
        const history = [1, 2, 3];
        expect(clampHistory(history)).toEqual([1, 2, 3]);
    });

    it("bounds to the last MAX_HISTORY_TURNS items", () => {
        const history = Array.from({ length: MAX_HISTORY_TURNS + 10 }, (_, i) => i);
        const clamped = clampHistory(history);
        expect(clamped.length).toBe(MAX_HISTORY_TURNS);
        expect(clamped[0]).toBe(10);
        expect(clamped[clamped.length - 1]).toBe(MAX_HISTORY_TURNS + 9);
    });

    it("does not mutate the input array", () => {
        const history = [1, 2, 3];
        clampHistory(history);
        expect(history).toEqual([1, 2, 3]);
    });
});
