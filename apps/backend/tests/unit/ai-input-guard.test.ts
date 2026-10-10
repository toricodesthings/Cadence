import { describe, expect, it } from "vitest";
import { AppError } from "../../src/platform/errors";
import {
    assertMessageWithinCaps,
    HISTORY_DROP_STEP,
    historyWindowStart,
    MAX_HISTORY_TURNS,
    MAX_MESSAGE_CHARS,
    MAX_PART_BYTES,
    MAX_PARTS_PER_MESSAGE,
    startAtUser,
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

describe("assertMessageWithinCaps — image file parts", () => {
    const id = "0b9f7a3e-2c4d-4e6f-8a1b-3c5d7e9f1a2b";
    const image = (over: Record<string, unknown> = {}) => ({ type: "file", mediaType: "image/webp", url: `cadence-image:${id}`, ...over });
    const send = (...parts: unknown[]) => () => assertMessageWithinCaps({ role: "user", parts });

    it("accepts cadence-image references up to the cap", () => {
        expect(send(image(), image(), image(), image(), { type: "text", text: "hi" })).not.toThrow();
    });

    it.each([
        ["a data URL", image({ url: "data:image/webp;base64,AAAA" })],
        ["an https URL", image({ url: "https://evil.example/x.webp" })],
        ["another media type", image({ mediaType: "image/png" })],
        ["a filename", image({ filename: "jane_passport.jpg" })],
    ])("rejects %s", (_label, part) => expectInvalidRequest(send(part)));

    it("rejects more images than the cap, which the server can lower", () => {
        expectInvalidRequest(send(image(), image(), image(), image(), image()));
        expectInvalidRequest(() => assertMessageWithinCaps({ role: "user", parts: [image(), image()] }, 1));
    });
});

describe("historyWindowStart", () => {
    it("replays the whole thread up to the cap", () => {
        expect(historyWindowStart(0)).toBe(0);
        expect(historyWindowStart(MAX_HISTORY_TURNS)).toBe(0);
    });

    it("drops rows in steps, so the window's start holds still between them", () => {
        const starts = Array.from({ length: 3 * HISTORY_DROP_STEP }, (_, i) => historyWindowStart(MAX_HISTORY_TURNS + 1 + i));
        expect(new Set(starts)).toEqual(new Set([HISTORY_DROP_STEP, 2 * HISTORY_DROP_STEP, 3 * HISTORY_DROP_STEP]));
        expect(starts.filter((s) => s === HISTORY_DROP_STEP)).toHaveLength(HISTORY_DROP_STEP);
    });

    it("never replays more than the cap", () => {
        for (let total = 0; total < 200; total++) {
            expect(total - historyWindowStart(total)).toBeLessThanOrEqual(MAX_HISTORY_TURNS);
            expect(historyWindowStart(total)).toBeGreaterThanOrEqual(0);
        }
    });
});

describe("startAtUser", () => {
    it("drops the leading rows a window cut into, without mutating", () => {
        const history = [{ role: "assistant" }, { role: "user" }, { role: "assistant" }];
        expect(startAtUser(history)).toEqual(history.slice(1));
        expect(history).toHaveLength(3);
    });
});
