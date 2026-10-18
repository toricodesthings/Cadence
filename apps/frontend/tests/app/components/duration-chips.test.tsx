import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DurationReportView } from "@cadence/contracts/memory";

const toastMock = vi.hoisted(() => ({ dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { DurationChips } from "../../../app/components/assistant/DurationChips";

const view = (low: number, high = low): DurationReportView => ({ taskId: "t1", completedAt: "2026-10-12T20:00:00.000Z", lowMinutes: low, highMinutes: high, anchored: false });
const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
    return { promise, resolve, reject };
};
const setup = (onSave: (...args: any[]) => Promise<DurationReportView | null>, reference: number | null = null) => {
    const onShown = vi.fn();
    render(<DurationChips id="x" title="Lab report" reference={reference} onShown={onShown} onSave={onSave} />);
    return { onShown };
};

beforeEach(() => vi.clearAllMocks());

describe("DurationChips", () => {
    it("says Saving… first and Saved only once the server has stored it", async () => {
        const save = deferred<DurationReportView | null>();
        const onSave = vi.fn(() => save.promise);
        const { onShown } = setup(onSave);
        expect(onShown).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole("button", { name: "30 min" }));
        expect(onSave).toHaveBeenCalledWith({ kind: "point", minutes: 30 }, false);
        expect(screen.getByRole("status").textContent).toContain("Saving…");
        expect(screen.queryByText(/Saved/)).toBeNull();
        await act(async () => save.resolve(view(30)));
        expect(screen.getByRole("status").textContent).toMatch(/Saved · 30 min/);
        expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
    });

    it("keeps the value on failure and Retry repeats the same request", async () => {
        const onSave = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(view(30));
        setup(onSave);
        fireEvent.click(screen.getByRole("button", { name: "30 min" }));
        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Couldn’t save"));
        expect(screen.getByRole("status").textContent).toContain("30 min");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Saved · 30 min/));
        expect(onSave).toHaveBeenCalledTimes(2);
        expect(onSave.mock.calls[1]).toEqual(onSave.mock.calls[0]);
    });

    it("closes quietly when the task was reopened (409)", async () => {
        setup(vi.fn().mockRejectedValue(Object.assign(new Error("reopened"), { status: 409 })));
        fireEvent.click(screen.getByRole("button", { name: "30 min" }));
        await waitFor(() => expect(toastMock.dismiss).toHaveBeenCalledWith("x"));
        expect(screen.queryByText(/Couldn’t save/)).toBeNull();
    });

    it("never claims Saved when the server stored nothing", async () => {
        setup(vi.fn().mockResolvedValue(null));
        fireEvent.click(screen.getByRole("button", { name: "30 min" }));
        await waitFor(() => expect(toastMock.dismiss).toHaveBeenCalled());
        expect(screen.queryByText(/Saved/)).toBeNull();
    });

    it("pauses its countdown while saving and after a failure", async () => {
        vi.useFakeTimers();
        try {
            const save = deferred<DurationReportView | null>();
            setup(vi.fn(() => save.promise));
            fireEvent.click(screen.getByRole("button", { name: "30 min" }));
            await act(async () => void vi.advanceTimersByTime(60_000));
            expect(toastMock.dismiss).not.toHaveBeenCalled();
            await act(async () => save.reject(new Error("offline")));
            await act(async () => void vi.advanceTimersByTime(60_000));
            expect(toastMock.dismiss).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("saves a range from Other and shows it as 30–60 min", async () => {
        const onSave = vi.fn().mockResolvedValue(view(30, 60));
        setup(onSave);
        fireEvent.click(screen.getByRole("button", { name: "More…" }));
        fireEvent.click(screen.getByRole("button", { name: "Other" }));
        const field = screen.getByLabelText(/How long, for example/);
        fireEvent.change(field, { target: { value: "25h" } });
        expect(screen.getByText("Try 90 or 1h30")).toBeTruthy();
        fireEvent.change(field, { target: { value: "30-60" } });
        fireEvent.click(screen.getByRole("button", { name: "30–60 min" }));
        expect(onSave).toHaveBeenCalledWith({ kind: "range", lowMinutes: 30, highMinutes: 60 }, false);
        await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Saved · 30–60 min/));
    });

    it("marks an answer from the relative stage as anchored", async () => {
        const onSave = vi.fn().mockResolvedValue(view(45));
        setup(onSave, 45);
        fireEvent.click(screen.getByRole("button", { name: "About right" }));
        expect(onSave).toHaveBeenCalledWith({ kind: "point", minutes: 45 }, true);
    });

    it("gives touch users 44px targets", () => {
        setup(vi.fn());
        expect(screen.getByRole("button", { name: "30 min" }).className).toContain("pointer-coarse:min-h-11");
        expect(screen.getByRole("button", { name: "Skip" }).className).toContain("pointer-coarse:min-h-11");
    });
});
