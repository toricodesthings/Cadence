import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { atLocal } from "@cadence/domain/time";
import { testQueryClient, withClient, makeTask } from "../../helpers";

const zone = "America/Toronto";
const day = "2026-10-20";
const at = (time: string) => atLocal(day, time, zone);

const m = vi.hoisted(() => ({
    mutateAsync: vi.fn(),
    mutate: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
    openSheet: vi.fn(),
    dayTasks: [] as unknown[],
}));

vi.mock("sonner", () => ({ toast: { custom: m.custom, dismiss: m.dismiss, message: vi.fn() } }));
vi.mock("../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutateAsync: m.mutateAsync, mutate: m.mutate }) }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({}) }));
vi.mock("../../../app/hooks/ai/use-duration-guess", () => ({ useDurationGuesser: () => () => null }));
vi.mock("../../../app/hooks/ai/use-planning-evidence", () => ({ usePlanningEvidence: () => undefined }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { calendar: { timelineStartHour: 7 } } }) }));
vi.mock("../../../app/hooks/tasks/use-tasks", () => ({ tasksQueryOptions: () => ({ queryKey: ["tasks", "day"], queryFn: async () => m.dayTasks }) }));
vi.mock("../../../app/stores/find-time-store", () => ({ useFindTimeStore: (select: (s: unknown) => unknown) => select({ open: m.openSheet }) }));
vi.mock("../../../app/lib/utils/user-zone", () => ({ getUserZone: () => zone, today: () => "2026-10-19", useUserZone: () => zone }));

import { useFindTime, useLaterToday } from "../../../app/hooks/tasks/use-find-time";

beforeEach(() => {
    vi.clearAllMocks();
    m.dayTasks = [];
    m.mutateAsync.mockResolvedValue({});
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(atLocal("2026-10-19", "08:00", zone)));
});

const setup = () => renderHook(() => useFindTime(), { wrapper: withClient(testQueryClient()) });
const task = makeTask({ id: "lab", title: "Lab report", durationEstimate: 45, dueDate: day });

describe("useFindTime.run", () => {
    it("writes the first gap at once (place first), as a Cadence proposal, and shows the toast", async () => {
        const { result } = setup();
        await act(async () => { await result.current.run(task); });
        expect(m.mutateAsync).toHaveBeenCalledTimes(1);
        expect(m.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
            id: "lab", dueDate: null, endDate: null, scheduledStart: at("07:00"), scheduledEnd: at("07:45"), findTime: { shown: ["early"] },
        }));
        expect(m.custom).toHaveBeenCalledTimes(1);
        expect(m.openSheet).not.toHaveBeenCalled();
    });

    it("keeps clear of the day's other blocks, with the buffer", async () => {
        m.dayTasks = [makeTask({ id: "class", scheduledStart: at("07:00"), scheduledEnd: at("09:00") })];
        const { result } = setup();
        await act(async () => { await result.current.run(task); });
        expect(m.mutateAsync.mock.calls[0][0].scheduledStart).toBe(at("09:15"));
    });

    it("with no gap writes nothing and opens the sheet on that day", async () => {
        m.dayTasks = [makeTask({ id: "all", scheduledStart: at("06:00"), scheduledEnd: at("22:00") })];
        const { result } = setup();
        await act(async () => { await result.current.run(task); });
        expect(m.mutateAsync).not.toHaveBeenCalled();
        expect(m.custom).not.toHaveBeenCalled();
        expect(m.openSheet).toHaveBeenCalledWith({ taskId: "lab", day, anchorDay: day, reason: "no-gap" });
    });

    it("Undo puts the task back as it was, in one write that tells the server to forget the choice", async () => {
        const { result } = setup();
        await act(async () => { await result.current.run(task); });
        const element = m.custom.mock.calls[0][0]("toast-id");
        await act(async () => { element.props.onUndo(); });
        expect(m.mutateAsync).toHaveBeenLastCalledWith({
            id: "lab", dueDate: day, endDate: null, scheduledStart: null, scheduledEnd: null, zone: null, findTime: { undo: true },
        });
    });

    it("Another time writes the next gap with every time of day seen so far", async () => {
        const { result } = setup();
        await act(async () => { await result.current.run(task); });
        const element = m.custom.mock.calls[0][0]("toast-id");
        await act(async () => { await element.props.onApply(1); });
        const second = m.mutateAsync.mock.calls[1][0];
        expect(second.scheduledStart).not.toBe(at("07:00"));
        expect(second.findTime.shown.length).toBeGreaterThanOrEqual(1);
        expect(second.findTime.shown).toContain("early");
    });

    it("Other day puts the task back first, then opens the sheet on the same day", async () => {
        const { result } = setup();
        await act(async () => { await result.current.run(task); });
        m.mutateAsync.mockClear();
        await act(async () => { m.custom.mock.calls[0][0]("toast-id").props.onOtherDay(); });
        expect(m.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: "lab", findTime: { undo: true } }));
        expect(m.openSheet).toHaveBeenCalledWith({ taskId: "lab", day, anchorDay: day });
    });

    it("still opens the sheet when putting it back fails (the write said why)", async () => {
        const { result } = setup();
        await act(async () => { await result.current.run(task); });
        m.mutateAsync.mockRejectedValueOnce(new Error("offline"));
        await act(async () => { m.custom.mock.calls[0][0]("toast-id").props.onOtherDay(); });
        expect(m.openSheet).toHaveBeenCalled();
    });

    it("looks again after a conflict and says the calendar changed", async () => {
        m.mutateAsync.mockRejectedValueOnce(Object.assign(new Error("conflict"), { status: 409 })).mockResolvedValue({});
        const { result } = setup();
        await act(async () => { await result.current.run(task); });
        expect(m.dismiss).toHaveBeenCalled();
        expect(m.custom).toHaveBeenCalledTimes(2);
        expect(m.custom.mock.calls[1][0]("t2").props.prefix).toBe("Your calendar changed");
    });

    it("closes the offer when the first write fails", async () => {
        m.mutateAsync.mockRejectedValueOnce(new Error("boom"));
        const { result } = setup();
        await act(async () => { await result.current.run(task); });
        expect(m.dismiss).toHaveBeenCalled();
    });
});

describe("useFindTime.placeLater", () => {
    it("writes the gap as Cadence's choice (nothing to learn from it) and offers Undo", async () => {
        const { toast } = await import("sonner");
        const { result } = setup();
        const plan = result.current.planWith(task, "2026-10-19", []);
        await act(async () => { await result.current.placeLater(task, plan.proposals[0]); });
        expect(m.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ findTime: { shown: [plan.proposals[0].bucket] } }));
        expect((toast.message as any)).toHaveBeenCalled();
    });
});

describe("useLaterToday", () => {
    const today = "2026-10-19";
    const later = (t: ReturnType<typeof makeTask>) =>
        renderHook(() => useLaterToday(today, [t], true), { wrapper: withClient(testQueryClient()) }).result.current(t);

    it("offers the first gap for an untimed task and for a block whose time has passed", () => {
        expect(later(makeTask({ id: "a", title: "Call", durationEstimate: 30, dueDate: today }))).not.toBeNull();
        expect(later(makeTask({ id: "b", title: "Run", scheduledStart: atLocal(today, "06:00", zone), scheduledEnd: atLocal(today, "07:00", zone) }))).not.toBeNull();
    });

    it("offers nothing for a block still ahead today: its own slot would be the nearest gap", () => {
        expect(later(makeTask({ id: "c", title: "Gym", scheduledStart: atLocal(today, "15:00", zone), scheduledEnd: atLocal(today, "16:00", zone) }))).toBeNull();
    });
});
