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
        const a = api({ ask: true, token: "tok", completedAt: "2026-10-12T20:00:00.000Z", reference: null });
        for (const mode of ["basic", "off", null]) await offerDuration(task, mode, a);
        expect(a.ask).not.toHaveBeenCalled();
        expect(toastMock.custom).not.toHaveBeenCalled();
    });

    it("shows the toast only when the server says ask, and keeps it open for the toast to close", async () => {
        await offerDuration(task, "full", api({ ask: false }));
        expect(toastMock.custom).not.toHaveBeenCalled();

        await offerDuration(task, "full", api({ ask: true, token: "tok", completedAt: "2026-10-12T20:00:00.000Z", reference: 45 }));
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

describe("offerDuration: what the toast is given", () => {
    const task = { id: "t1", title: "Lab report" };
    const shown = async (reference: number | null, guess: number | null = null) => {
        const a = api({ ask: true, token: "tok", completedAt: "2026-10-12T20:00:00.000Z", reference });
        await offerDuration(task, "full", a, guess);
        return toastMock.custom.mock.calls.at(-1)![0]("toast-id");
    };

    it("answers with the completion's instant and the question's token", async () => {
        const a = api({ ask: true, token: "tok", completedAt: "2026-10-12T20:00:00.000Z", reference: null });
        await offerDuration(task, "full", a);
        const element = toastMock.custom.mock.calls[0][0]("id");
        await element.props.onSave({ kind: "point", minutes: 45 }, false);
        expect(a.report).toHaveBeenCalledWith({ taskId: "t1", completedAt: "2026-10-12T20:00:00.000Z", value: { kind: "point", minutes: 45 }, anchored: false, token: "tok" });
    });

    it("keeps Cadence's own number out of the question (D7)", async () => {
        expect((await shown(45)).props.reference).toBe(45);
        expect((await shown(60)).props.reference).toBeNull(); // the default block
        expect((await shown(45, 45)).props.reference).toBeNull(); // Cadence's own guess
        expect((await shown(null, 45)).props.reference).toBeNull();
    });
});
