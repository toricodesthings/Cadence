import { beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => ({ custom: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { offerDuration, type DurationApi } from "../../../../app/lib/ai/duration-prompt";

const api = (ask: Awaited<ReturnType<DurationApi["ask"]>>): DurationApi => ({
    ask: vi.fn().mockResolvedValue(ask),
    shown: vi.fn().mockResolvedValue(undefined),
    report: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => vi.clearAllMocks());

describe("offerDuration", () => {
    const task = { id: "t1", title: "Lab report" };

    it("asks the server only in Full", async () => {
        const a = api({ ask: true, token: "t1:2026-10-12", reference: null });
        for (const mode of ["basic", "off", null]) await offerDuration(task, mode, a);
        expect(a.ask).not.toHaveBeenCalled();
        expect(toastMock.custom).not.toHaveBeenCalled();
    });

    it("shows the toast only when the server says ask, and keeps it open for the toast to close", async () => {
        await offerDuration(task, "full", api({ ask: false }));
        expect(toastMock.custom).not.toHaveBeenCalled();

        await offerDuration(task, "full", api({ ask: true, token: "t1:2026-10-12", reference: 45 }));
        expect(toastMock.custom).toHaveBeenCalledTimes(1);
        expect(toastMock.custom.mock.calls[0][1]).toEqual({ duration: Infinity });
    });

    it("stays silent when the server can't be reached", async () => {
        const a = api({ ask: false });
        a.ask = vi.fn().mockRejectedValue(new Error("offline"));
        await expect(offerDuration(task, "full", a)).resolves.toBeUndefined();
        expect(toastMock.custom).not.toHaveBeenCalled();
    });
});
