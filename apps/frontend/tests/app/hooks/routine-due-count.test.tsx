import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useRoutineDueCount } from "../../../app/hooks/habits/use-routine-due-count";

const state = vi.hoisted(() => ({
    enabled: true,
    routines: [] as { logs?: { targetDate: string; status: string }[] }[],
    weekly: vi.fn(),
}));
vi.mock("../../../app/hooks/habits/use-habits", () => ({ useHabitsRange: (args: unknown) => { state.weekly(args); return { data: state.routines }; } }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { notifications: { showHabitNavDueCount: state.enabled } } }) }));
vi.mock("../../../app/hooks/ui/use-realtime-clock", () => ({ useMinuteClock: () => new Date(2026, 8, 23, 12) }));
beforeEach(() => { state.enabled = true; state.routines = []; vi.clearAllMocks(); });

it("counts scheduled pending routines today, excluding yesterday and unscheduled routines", () => {
    state.routines = [
        { logs: [{ targetDate: "2026-09-23", status: "PENDING" }] },
        { logs: [{ targetDate: "2026-09-22", status: "PENDING" }] },
        { logs: [{ targetDate: "2026-09-23", status: "COMPLETED" }] },
        { logs: [{ targetDate: "2026-09-23", status: "SKIPPED" }] },
        { logs: [] },
    ];
    const { result } = renderHook(useRoutineDueCount);
    expect(result.current).toBe(1);
    expect(state.weekly).toHaveBeenCalledWith({ start: "2026-09-23", end: "2026-09-23", enabled: true });
});

it("decreases for completed and skipped routines, restores on undo, and reaches zero", () => {
    state.routines = ["PENDING", "PENDING"].map(status => ({ logs: [{ targetDate: "2026-09-23", status }] }));
    const { result, rerender } = renderHook(useRoutineDueCount);
    expect(result.current).toBe(2);
    state.routines[0].logs![0].status = "COMPLETED";
    rerender(); expect(result.current).toBe(1);
    state.routines[1].logs![0].status = "SKIPPED";
    rerender(); expect(result.current).toBe(0);
    state.routines[0].logs![0].status = "PENDING";
    rerender(); expect(result.current).toBe(1);
    state.enabled = false;
    rerender(); expect(result.current).toBe(0);
    expect(state.weekly).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
});
