import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DurationReportView } from "@cadence/contracts/memory";
import { makeTask } from "../../helpers";

const mocks = vi.hoisted(() => ({
    reported: null as DurationReportView | null,
    save: { mutate: vi.fn(), isPending: false, isError: false, variables: undefined as unknown },
    guess: null as null | { state: "supported" | "tentative"; minutes: number; low: number; high: number; reports: number; days: number },
    update: vi.fn(),
    undo: vi.fn(),
}));
vi.mock("../../../app/hooks/ai/use-memory", () => ({
    useReportedDuration: (_id: string, _at: unknown, enabled: boolean) => ({ data: enabled ? mocks.reported : undefined }),
    useSetReportedDuration: () => mocks.save,
}));
vi.mock("../../../app/hooks/ai/use-duration-guess", () => ({ useDurationGuess: () => mocks.guess, useDurationGuesser: () => () => mocks.guess }));
vi.mock("../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutate: mocks.update }) }));
vi.mock("../../../app/lib/utils/undo-toast", () => ({ toastUndo: mocks.undo, toastName: (s: string) => s }));

import { TookRow } from "../../../app/components/tasks/TookRow";
import { TakesRow, hasTakesRow } from "../../../app/components/tasks/TakesRow";

beforeEach(() => {
    vi.clearAllMocks();
    mocks.reported = null;
    mocks.guess = null;
    Object.assign(mocks.save, { isPending: false, isError: false, variables: undefined });
});

describe("TookRow", () => {
    it("is absent outside Full, offers Add with no answer, and shows the stored answer", () => {
        const { rerender } = render(<TookRow taskId="t1" completedAt="2026-10-12T20:00:00.000Z" enabled={false} />);
        expect(screen.queryByText("Took")).toBeNull();
        rerender(<TookRow taskId="t1" completedAt="2026-10-12T20:00:00.000Z" enabled />);
        expect(screen.getByRole("button", { name: "How long did it take? Add" })).toBeTruthy();
        mocks.reported = { taskId: "t1", completedAt: "x", lowMinutes: 30, highMinutes: 60, anchored: false };
        rerender(<TookRow taskId="t1" completedAt="2026-10-12T20:00:00.000Z" enabled />);
        expect(screen.getByRole("button", { name: "Took 30–60 min. Change" })).toBeTruthy();
    });

    it("saves a chosen length through the confirmed mutation, and Clear only when there is an answer", () => {
        render(<TookRow taskId="t1" completedAt="2026-10-12T20:00:00.000Z" enabled />);
        fireEvent.click(screen.getByRole("button", { name: /Add/ }));
        expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "30 min" }));
        expect(mocks.save.mutate).toHaveBeenCalledWith({ value: { kind: "point", minutes: 30 }, anchored: false });
    });

    it("says Saving… while a change is on its way and Retry after a failure, keeping the choice", () => {
        Object.assign(mocks.save, { isPending: true });
        const { rerender } = render(<TookRow taskId="t1" completedAt={null} enabled />);
        expect(screen.getByRole("status").textContent).toBe("Saving…");
        const variables = { value: { kind: "point", minutes: 30 }, anchored: false };
        Object.assign(mocks.save, { isPending: false, isError: true, variables });
        rerender(<TookRow taskId="t1" completedAt={null} enabled />);
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(mocks.save.mutate).toHaveBeenCalledWith(variables);
        // A failed Clear (variables null) still offers Retry.
        Object.assign(mocks.save, { variables: null });
        rerender(<TookRow taskId="t1" completedAt={null} enabled />);
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(mocks.save.mutate).toHaveBeenLastCalledWith(null);
    });

    it("edits from the stored answer, never as an About right, and Clear has Undo", () => {
        mocks.reported = { taskId: "t1", completedAt: "x", lowMinutes: 45, highMinutes: 45, anchored: false };
        render(<TookRow taskId="t1" completedAt="2026-10-12T20:00:00.000Z" enabled />);
        fireEvent.click(screen.getByRole("button", { name: "Took 45 min. Change" }));
        expect(screen.queryByRole("button", { name: /About right/ })).toBeNull();
        expect(screen.getByRole("button", { name: "45 min" }).getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(mocks.save.mutate).toHaveBeenCalledWith(null);
        mocks.undo.mock.calls[0][1]();
        expect(mocks.save.mutate).toHaveBeenLastCalledWith({ value: { kind: "point", minutes: 45 }, anchored: false });
    });
});

describe("TakesRow", () => {
    const task = makeTask({ id: "t1", title: "Lab report" });
    const supported = { state: "supported" as const, minutes: 45, low: 30, high: 60, reports: 6, days: 4 };

    it("shows only on untimed, non-Fixed, not-done tasks", () => {
        expect(hasTakesRow(makeTask())).toBe(true);
        expect(hasTakesRow(makeTask({ scheduledStart: "2026-10-12T14:00:00.000Z" }))).toBe(false);
        expect(hasTakesRow(makeTask({ interactionMode: "timetable" }))).toBe(false);
        expect(hasTakesRow(makeTask({ state: "COMPLETE" }))).toBe(false);
    });

    it("shows a supported guess as a guess with no Use button, and any chip stores it with Undo", () => {
        mocks.guess = supported;
        render(<TakesRow task={task} />);
        const row = screen.getByRole("button", { name: /Takes about 45 min, a guess from 6 of your answers/ });
        expect(row.textContent).toBe("about 45 min");
        expect(screen.queryByRole("button", { name: /^Use/ })).toBeNull();
        fireEvent.click(row);
        const picked = screen.getByRole("button", { name: "45 min" });
        expect(picked.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(picked);
        expect(mocks.update).toHaveBeenCalledWith({ id: "t1", durationEstimate: 45 });
        expect(mocks.undo).toHaveBeenCalledWith("Takes 45 min", expect.any(Function));
        mocks.undo.mock.calls[0][1]();
        expect(mocks.update).toHaveBeenLastCalledWith({ id: "t1", durationEstimate: null });
    });

    it("shows a tentative guess with a ?, pre-selects nothing, and a chosen value hides the ghost", () => {
        mocks.guess = { ...supported, state: "tentative" };
        const { rerender } = render(<TakesRow task={task} />);
        expect(screen.getByRole("button", { name: /not yet sure/ }).textContent).toBe("about 45 min?");
        fireEvent.click(screen.getByRole("button", { name: /not yet sure/ }));
        expect(screen.queryByRole("button", { pressed: true })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        rerender(<TakesRow task={makeTask({ id: "t1", durationEstimate: 20 })} />);
        expect(screen.getByRole("button", { name: "Takes 20 min. Change" }).textContent).toBe("20 min");
    });

    it("says Not set with nothing to go on, and Clear removes a value", () => {
        const { rerender } = render(<TakesRow task={task} />);
        expect(screen.getByRole("button", { name: "How long will it take? Set" }).textContent).toBe("Not set");
        rerender(<TakesRow task={makeTask({ id: "t1", durationEstimate: 20 })} />);
        fireEvent.click(screen.getByRole("button", { name: /Takes 20 min/ }));
        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(mocks.update).toHaveBeenCalledWith({ id: "t1", durationEstimate: null });
        mocks.undo.mock.calls[0][1]();
        expect(mocks.update).toHaveBeenLastCalledWith({ id: "t1", durationEstimate: 20 });
    });
});
