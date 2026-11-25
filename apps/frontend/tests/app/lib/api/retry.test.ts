import { describe, expect, it } from "vitest";
import { shouldRetry } from "../../../../app/lib/api/retry";
import { UndoneError } from "../../../../app/lib/utils/undo-toast";

describe("shouldRetry", () => {
    it("never retries a write the person undid, so Undo can't re-run it behind a new toast", () => {
        expect(shouldRetry(0, new UndoneError(), 2, true)).toBe(false);
    });

    it("still retries a plain network failure up to the limit", () => {
        expect(shouldRetry(0, new TypeError("Failed to fetch"), 2, true)).toBe(true);
        expect(shouldRetry(2, new TypeError("Failed to fetch"), 2, true)).toBe(false);
    });
});
