import { beforeEach, describe, expect, it, vi } from "vitest";

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("sonner", () => ({ toast }));

import { toastError } from "../../../../app/lib/utils/error-toast";
import { errorRef } from "../../../../app/lib/log";
import { ApiErrorResponse } from "../../../../app/types/api";

const apiError = (status: number, code: string) =>
    new ApiErrorResponse({ status, code: code as never, message: "raw server text", requestId: "req-1" });

describe("errorRef", () => {
    it("carries the code and request id for API errors, the message for others", () => {
        expect(errorRef(apiError(500, "INTERNAL_ERROR"))).toMatch(/^INTERNAL_ERROR · req-1 · v/);
        expect(errorRef(new TypeError("x is undefined"))).toMatch(/^TypeError: x is undefined · v/);
    });
});

describe("toastError", () => {
    beforeEach(() => {
        toast.error.mockClear();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    const description = () => toast.error.mock.calls[0][1].description;

    it("says why in plain words, never the raw server text", () => {
        toastError(apiError(500, "INTERNAL_ERROR"), "Couldn't save");
        expect(toast.error).toHaveBeenCalledWith("Couldn't save", expect.objectContaining({ action: expect.anything() }));
        expect(description()).toBe("Something went wrong on our end. Try again.");
    });

    it("maps conflicts, missing items and dropped connections", () => {
        toastError(apiError(409, "CONFLICT"), "a");
        toastError(apiError(404, "NOT_FOUND"), "b");
        toastError(new TypeError("Failed to fetch"), "c");
        expect(toast.error.mock.calls.map((call) => call[1].description)).toEqual([
            "It was changed somewhere else. Showing the latest version.",
            "It may have been deleted.",
            "This needs a connection. Try again once you're back online.",
        ]);
    });

    it("shows one shared toast for rate limits", () => {
        toastError(apiError(429, "TOO_MANY_REQUESTS"), "Couldn't save");
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("too fast"), { id: "rate-limit" });
    });
});
