import { describe, expect, it, vi } from "vitest";
import { firstOpenFor, liveChat } from "../../../../app/lib/ai/live-chat";

describe("liveChat", () => {
    it("keeps the open thread's chat across remounts, and stops it only for another thread or account", () => {
        const account = {};
        const first = liveChat(account, "c1");
        const stop = vi.spyOn(first, "stop");
        expect(liveChat(account, "c1")).toBe(first);
        expect(stop).not.toHaveBeenCalled();

        const second = liveChat(account, "c2");
        expect(second).not.toBe(first);
        expect(stop).toHaveBeenCalledTimes(1);
        expect(liveChat({}, "c2")).not.toBe(second);
    });

    it("counts the first open once per account", () => {
        const account = {};
        expect(firstOpenFor(account)).toBe(true);
        expect(firstOpenFor(account)).toBe(false);
        expect(firstOpenFor({})).toBe(true);
    });
});
