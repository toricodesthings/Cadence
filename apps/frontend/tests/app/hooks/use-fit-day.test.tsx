import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { atLocal } from "@cadence/domain/time";
import { makeTask, testQueryClient, withClient } from "../../helpers";

const zone = "America/Toronto";
const day = "2026-10-20";
const at = (time: string) => atLocal(day, time, zone);

const m = vi.hoisted(() => ({ post: vi.fn(), undo: [] as (() => void)[], message: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { message: m.message } }));
vi.mock("../../../app/lib/utils/undo-toast", () => ({ toastUndo: (_: string, onUndo: () => void) => m.undo.push(onUndo) }));
vi.mock("../../../app/lib/utils/error-toast", () => ({ toastError: m.error }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({ api: { tasks: { place: { $post: m.post } } } }) }));
vi.mock("../../../app/lib/utils/user-zone", () => ({ getUserZone: () => zone, today: () => day, useToday: () => day, useUserZone: () => zone }));

import { fitTodayReason, usePlaceTasks } from "../../../app/hooks/tasks/use-fit-day";

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });
const conflict = (ids: string[]) => ({ ok: false, status: 409, json: async () => ({ error: { code: "CONFLICT", message: "changed", status: 409, isRetryable: false, issues: ids.map((path) => ({ code: "conflict", message: "", path })) } }) });

const a = makeTask({ id: "a", title: "A", dueDate: day, updatedAt: "2026-10-20T10:00:00.000Z" });
const b = makeTask({ id: "b", title: "B", dueDate: day, updatedAt: "2026-10-20T10:00:00.000Z" });
const placed = [{ taskId: "a", start: at("09:00"), end: at("10:00") }, { taskId: "b", start: at("10:15"), end: at("10:45") }];
const answer = {
    tasks: [{ ...a, updatedAt: "v2a" }, { ...b, updatedAt: "v2b" }],
    previous: [{ id: "a", scheduledStart: null, scheduledEnd: null, dueDate: day, endDate: null, zone: null }, { id: "b", scheduledStart: null, scheduledEnd: null, dueDate: day, endDate: null, zone: null }],
};

beforeEach(() => {
    vi.clearAllMocks();
    m.undo = [];
});

describe("usePlaceTasks", () => {
    it("places the preview in one request with each version, then one Undo sends the values from before", async () => {
        m.post.mockResolvedValue(ok(answer));
        const { result } = renderHook(() => usePlaceTasks(), { wrapper: withClient(testQueryClient()) });
        await act(async () => { await result.current(placed, new Map([[a.id, a], [b.id, b]])); });
        expect(m.post.mock.calls[0][0].json.items).toEqual([
            { id: "a", scheduledStart: at("09:00"), scheduledEnd: at("10:00"), dueDate: null, endDate: null, expectedUpdatedAt: a.updatedAt },
            { id: "b", scheduledStart: at("10:15"), scheduledEnd: at("10:45"), dueDate: null, endDate: null, expectedUpdatedAt: b.updatedAt },
        ]);
        await act(async () => { m.undo[0](); });
        expect(m.post.mock.calls[1][0].json.items).toEqual(answer.previous.map((p) => ({ ...p, expectedUpdatedAt: p.id === "a" ? "v2a" : "v2b" })));
    });

    it("Undo after an edit puts back the rest, keeps the edit, and says so", async () => {
        m.post.mockResolvedValueOnce(ok(answer)).mockResolvedValueOnce(conflict(["b"])).mockResolvedValueOnce(ok({ tasks: [], previous: [] }));
        const { result } = renderHook(() => usePlaceTasks(), { wrapper: withClient(testQueryClient()) });
        await act(async () => { await result.current(placed, new Map([[a.id, a], [b.id, b]])); });
        await act(async () => { m.undo[0](); await new Promise((r) => setTimeout(r, 0)); });
        expect(m.post.mock.calls[2][0].json.items.map((i: { id: string }) => i.id)).toEqual(["a"]);
        expect(m.message).toHaveBeenCalledWith("1 changed since", expect.anything());
    });
});

describe("fitTodayReason", () => {
    const fit = (placedCount: number, notSized: number) => ({ ready: true, plan: () => ({ placed: Array(placedCount).fill(placed[0]), didntFit: [], notSized: Array(notSized).fill("x") }) }) as never;

    it("names why the menu item can't help, or nothing when it can", () => {
        const morning = new Date(at("09:00"));
        expect(fitTodayReason(fit(1, 0), [a], morning)).toBeNull();
        expect(fitTodayReason(fit(0, 1), [a], morning)).toBeNull();
        expect(fitTodayReason(fit(0, 0), [a], morning)).toBe("Nothing untimed fits today's gaps");
        expect(fitTodayReason(fit(1, 0), [makeTask({ id: "t", scheduledStart: at("09:00"), scheduledEnd: at("10:00") })], morning)).toBe("No untimed tasks on today");
        expect(fitTodayReason(fit(1, 0), [a], new Date(at("22:05")))).toBe("Today's gaps have passed");
    });
});
