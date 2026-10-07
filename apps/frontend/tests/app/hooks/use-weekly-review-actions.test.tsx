import { act, renderHook, configure } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@cadence/contracts/inbox";
import { useWeeklyReviewActions } from "../../../app/hooks/core/use-weekly-review-actions";
import { today } from "../../../app/lib/utils/user-zone";

// Real parser and real composers: under four parallel zone runs a wait needs more than the 1s default.
configure({ asyncUtilTimeout: 5000 });

const process = vi.fn();
const updateTask = vi.fn();
const deleteItem = vi.fn();
vi.mock("../../../app/hooks/inbox/use-inbox", () => ({ useInbox: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/inbox/use-delete-inbox-item", () => ({ useDeleteInboxItem: () => ({ mutateAsync: deleteItem }) }));
vi.mock("../../../app/hooks/inbox/use-process-inbox-to-task", () => ({ useProcessInboxToTask: () => ({ mutateAsync: process }) }));
vi.mock("../../../app/hooks/tasks/use-tasks", () => ({ useTasks: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutateAsync: updateTask }) }));
vi.mock("../../../app/hooks/tasks/use-archive-task", () => ({ useArchiveTask: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("../../../app/hooks/tasks/use-apply-instruction", () => ({ useApplyInstruction: () => ({ apply: vi.fn() }) }));
vi.mock("../../../app/hooks/habits/use-habits", () => ({ useHabitsRange: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/habits/use-pause-habit", () => ({ usePauseHabit: () => ({ pause: vi.fn() }) }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/tags/use-tags", () => ({ useTags: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { tasks: { intelligence: {} }, dateTime: { dateStyle: "mdy" } } }) }));

const capture = (rawText: string, createdAt = new Date().toISOString()) => ({ id: "cap-1", rawText, createdAt, analysis: null }) as unknown as InboxItem;

beforeEach(() => { vi.clearAllMocks(); process.mockResolvedValue({ id: "task-1" }); });

describe("Weekly Reset capture placement", () => {
    it("places through the one transactional path: no second task, nothing deleted", async () => {
        const { result } = renderHook(() => useWeeklyReviewActions(1));
        await act(() => result.current.handleInboxAction(capture("Call Sam p2"), "today"));
        expect(process).toHaveBeenCalledTimes(1);
        expect(process.mock.calls[0][0]).toMatchObject({ inboxItemId: "cap-1", title: "Call Sam", dueDate: today(), priority: 3, nlp: { resolved: true } });
        expect(deleteItem).not.toHaveBeenCalled();
    });

    it("keeps a day I chose over the day in the words, and cleans that phrase", async () => {
        const { result } = renderHook(() => useWeeklyReviewActions(1));
        await act(() => result.current.handleInboxAction(capture("Call Sam tomorrow"), "today"));
        expect(process.mock.calls[0][0]).toMatchObject({ title: "Call Sam", dueDate: today() });
    });

    it("keeps an earlier day's words literal: its 'tomorrow' is not today's", async () => {
        const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
        const { result } = renderHook(() => useWeeklyReviewActions(1));
        await act(() => result.current.handleInboxAction(capture("Call Sam tomorrow", old), "today"));
        expect(process.mock.calls[0][0]).toMatchObject({ title: "Call Sam tomorrow", dueDate: today() });
    });

    it("decide-later places then waitlists the new task, never a delete", async () => {
        const { result } = renderHook(() => useWeeklyReviewActions(1));
        await act(() => result.current.handleInboxAction(capture("Maybe learn Rust"), "someday"));
        expect(process.mock.calls[0][0].dueDate).toBeNull();
        expect(updateTask).toHaveBeenCalledWith({ id: "task-1", state: "WAITING" });
        expect(deleteItem).not.toHaveBeenCalled();
    });

    it("a typed change places a timed block with the estimate and a follow-up", async () => {
        const { result } = renderHook(() => useWeeklyReviewActions(1));
        await act(() => result.current.placeCapture(capture("Draft memo"), { patch: { scheduledStart: "2026-10-09T19:00:00.000Z", scheduledEnd: "2026-10-09T19:30:00.000Z", durationEstimate: 30, waitingReminder: "2026-10-13T13:00:00.000Z" } }));
        expect(process.mock.calls[0][0]).toMatchObject({ scheduledStart: "2026-10-09T19:00:00.000Z", durationEstimate: 30 });
        expect(updateTask).toHaveBeenCalledWith({ id: "task-1", waitingReminder: "2026-10-13T13:00:00.000Z" });
    });
});
