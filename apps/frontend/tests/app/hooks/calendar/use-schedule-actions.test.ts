import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import type { DragEndEvent } from "@dnd-kit/core";
import { useScheduleDrag } from "../../../../app/hooks/calendar/use-schedule-drag";
import { useScheduleTaskActions } from "../../../../app/hooks/calendar/use-schedule-task-actions";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

const mocks = vi.hoisted(() => ({ update: vi.fn(), toast: vi.fn(), track: vi.fn(), queue: vi.fn(), resolve: vi.fn() }));
vi.mock("../../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutate: mocks.update }) }));
vi.mock("sonner", () => ({ toast: { message: mocks.toast } }));
vi.mock("../../../../app/lib/api/track-event", () => ({ trackUsageEvent: mocks.track }));
vi.mock("../../../../app/hooks/habits/use-resolve-habit", () => ({
    useResolveHabit: () => ({ mutateAsync: mocks.resolve }),
    timeAction: (time: string, status: string) => ({ time, status, at: "2026-11-02T14:30:00Z" }),
}));
vi.mock("../../../../app/stores/task-completion-store", () => ({
    useTaskCompletionStore: (select: (state: { queueCompletion: typeof mocks.queue }) => unknown) => select({ queueCompletion: mocks.queue }),
}));
const task = (patch: Partial<Task> = {}): Task => ({ id: "t", title: "Task", state: "ACTIVE", dueDate: "2026-10-30", endDate: null,
    scheduledStart: null, scheduledEnd: null, zone: null, durationEstimate: 60, ...patch }) as Task;
function dragEvent(id: string, target: string | null): DragEndEvent {
    return {
        activatorEvent: new Event("pointerdown"), collisions: [], delta: { x: 0, y: 0 },
        active: { id, data: { current: { taskId: id } }, rect: { current: { initial: null, translated: null } } },
        over: target ? { id: target, disabled: false, rect: new DOMRect(), data: { current: {} } } : null,
    };
}
beforeEach(() => { vi.clearAllMocks(); setUserZone("America/Toronto"); });

describe("schedule drag lifecycle", () => {
    it("previews the drop, writes its placement once, and restores every temporal field on Undo", () => {
        const original = task();
        const { result } = renderHook(() => useScheduleDrag(new Map([[original.id, original]])));
        const event = dragEvent("t", "slot-2026-11-02__570");
        act(() => result.current.handleDragStart(event));
        act(() => result.current.handleDragOver(event));
        expect(result.current.activeDropPreview).toMatchObject({ kind: "timed", dateStr: "2026-11-02", startMinutes: 570 });
        act(() => result.current.handleDragEnd(event));
        expect(result.current.activeDragTask).toBeNull();
        expect(result.current.activeDropPreview).toBeNull();
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "t", dueDate: null, scheduledStart: "2026-11-02T14:30:00.000Z" }));
        expect(mocks.track).toHaveBeenCalledWith("schedule.drop_completed", { input_method: "dnd", object_type: "task", outcome: "timed" });
        mocks.toast.mock.calls[0][1].action.onClick();
        expect(mocks.update).toHaveBeenLastCalledWith({ id: "t", dueDate: "2026-10-30", endDate: null, scheduledStart: null, scheduledEnd: null, zone: null });
    });
    it("retains the source task if changing views replaces the active query during a drag", () => {
        const original = task();
        const { result, rerender } = renderHook((tasks: Map<string, Task>) => useScheduleDrag(tasks),
            { initialProps: new Map([[original.id, original]]) });
        const event = dragEvent("t", "day-2026-11-02");
        act(() => result.current.handleDragStart(event));
        rerender(new Map());
        act(() => result.current.handleDragOver(event));
        expect(result.current.activeDropPreview).toMatchObject({ kind: "allday", dateStr: "2026-11-02" });
        act(() => result.current.handleDragEnd(event));
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "t", dueDate: "2026-11-02" }));
    });
    it("clears canceled previews and never writes unsupported routine/series targets", () => {
        const routine = task({ isHabit: true });
        const { result } = renderHook(() => useScheduleDrag(new Map([[routine.id, routine]])));
        const event = dragEvent("t", "day-2026-11-02");
        act(() => result.current.handleDragStart(event));
        act(() => result.current.handleDragOver(event));
        expect(result.current.activeDropPreview).toBeNull();
        act(() => result.current.handleDragEnd(event));
        act(() => result.current.handleDragCancel());
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.toast).not.toHaveBeenCalled();
    });
});

describe("schedule task and routine actions", () => {
    it("keeps ordinary phone completion cancellable until the queued commit", () => {
        const original = task();
        const { result } = renderHook(() => useScheduleTaskActions(new Map([[original.id, original]]), "2026-11-02", vi.fn()));
        act(() => { result.current.rowHandlers.onComplete(original); });
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({ taskId: "t" }));
        mocks.queue.mock.calls[0][0].onCommit();
        expect(mocks.update).toHaveBeenCalledWith({ id: "t", state: "COMPLETE" });
    });
    it("resolves a routine's selected time instead of completing its whole day", async () => {
        const routine = task({ id: "habit-r--2026-11-02--09:30", isHabit: true });
        const { result } = renderHook(() => useScheduleTaskActions(new Map([[routine.id, routine]]), "2026-11-02", vi.fn()));
        await act(async () => { await result.current.rowHandlers.onComplete(routine); });
        expect(mocks.resolve).toHaveBeenCalledWith({ habitId: "r", targetDate: "2026-11-02", time: "09:30", status: "COMPLETED", at: "2026-11-02T14:30:00Z" });
        expect(mocks.queue).not.toHaveBeenCalled();
    });
    it("offers one batch Undo when lightening today to no day", () => {
        const original = task();
        const { result } = renderHook(() => useScheduleTaskActions(new Map([[original.id, original]]), "2026-11-02", vi.fn()));
        act(() => result.current.lightenToday([original], "holding"));
        expect(mocks.update).toHaveBeenCalledWith({ id: "t", dueDate: null, endDate: null, scheduledStart: null, scheduledEnd: null, zone: null });
        expect(mocks.toast).toHaveBeenCalledTimes(1);
        mocks.toast.mock.calls[0][1].action.onClick();
        expect(mocks.update).toHaveBeenLastCalledWith({ id: "t", dueDate: "2026-10-30", endDate: null, scheduledStart: null, scheduledEnd: null, zone: null });
    });
    it("blocks series chip actions and keeps routine marks on the row path", () => {
        const series = task({ recurrenceRule: "FREQ=WEEKLY" });
        const { result } = renderHook(() => useScheduleTaskActions(new Map([[series.id, series]]), "2026-11-02", vi.fn()));
        act(() => result.current.handleCompleteTask("t"));
        act(() => result.current.handleArchiveTask("habit-r--2026-11-02"));
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.resolve).not.toHaveBeenCalled();
        expect(mocks.toast).toHaveBeenCalledWith("Recurring blocks are edited as a series.");
    });
});
