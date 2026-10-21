import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testQueryClient, withClient } from "../../helpers";

const m = vi.hoisted(() => ({ post: vi.fn(), create: vi.fn(), remove: vi.fn(), undo: [] as (() => void)[] }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({ api: { ai: { steps: { $post: m.post } } } }) }));
vi.mock("../../../app/hooks/tasks/use-subtasks", () => ({ useCreateSubtask: () => ({ mutateAsync: m.create }), useDeleteSubtask: () => ({ mutate: m.remove }) }));
vi.mock("../../../app/lib/utils/undo-toast", () => ({ toastUndo: (_: string, onUndo: () => void) => m.undo.push(onUndo) }));

import { useSuggestSteps } from "../../../app/hooks/ai/use-suggest-steps";

const ok = (steps: string[]) => ({ ok: true, status: 200, json: async () => ({ data: { steps } }) });
const existing = [{ title: "Buy paint", orderIndex: 4 }];
const setup = () => renderHook(() => useSuggestSteps("task-1", existing), { wrapper: withClient(testQueryClient()) });

beforeEach(() => {
    vi.clearAllMocks();
    m.undo = [];
    m.create.mockResolvedValue({});
});

describe("useSuggestSteps", () => {
    it("drafts on a tap, all ticked, without steps the task already has", async () => {
        m.post.mockResolvedValue(ok(["buy paint", "Clear the hall", "Tape the edges", "clear the hall"]));
        const { result } = setup();
        expect(m.post).not.toHaveBeenCalled();
        await act(async () => { result.current.suggest(); });
        expect(m.post).toHaveBeenCalledWith({ json: { taskId: "task-1" } });
        expect(result.current.draft?.map((d) => [d.title, d.ticked])).toEqual([["Clear the hall", true], ["Tape the edges", true]]);
        expect(m.create).not.toHaveBeenCalled();
    });

    it("Keep adds the ticked, edited steps after the existing ones, with one Undo", async () => {
        m.post.mockResolvedValue(ok(["Clear the hall", "Tape the edges", "Lay sheets"]));
        const { result } = setup();
        await act(async () => { result.current.suggest(); });
        const [first, second] = result.current.draft!;
        act(() => { result.current.edit(second.key, { ticked: false }); result.current.edit(first.key, { title: "Clear the whole hall" }); });
        await act(async () => { result.current.keep(); });
        expect(m.create.mock.calls.map(([input]) => [input.title, input.orderIndex])).toEqual([["Clear the whole hall", 5], ["Lay sheets", 6]]);
        expect(result.current.draft).toBeNull();
        act(() => m.undo[0]());
        expect(m.remove).toHaveBeenCalledTimes(2);
    });

    it("Keep after a partial failure leaves only the failed steps, so Keep again never doubles one", async () => {
        m.post.mockResolvedValue(ok(["Clear the hall", "Tape the edges"]));
        m.create.mockResolvedValueOnce({}).mockRejectedValueOnce({ status: 500 });
        const { result } = setup();
        await act(async () => { result.current.suggest(); });
        await act(async () => { result.current.keep(); });
        expect(result.current.draft?.map((d) => d.title)).toEqual(["Tape the edges"]);
        act(() => m.undo[0]());
        expect(m.remove).toHaveBeenCalledTimes(1);
    });

    it("Try again repeats the request that failed", async () => {
        m.post.mockResolvedValueOnce(ok(["Sort the garage", "Sweep"])).mockResolvedValueOnce({ ok: false, status: 504, json: async () => ({ error: { code: "AI_TIMEOUT", message: "", status: 504, isRetryable: true } }) });
        const { result } = setup();
        await act(async () => { result.current.suggest(); });
        act(() => result.current.edit(result.current.draft![1].key, { ticked: false }));
        await act(async () => { result.current.smaller(); });
        expect(m.post).toHaveBeenLastCalledWith({ json: { taskId: "task-1", smaller: ["Sort the garage"] } });
        m.post.mockResolvedValueOnce(ok(["Open the door"]));
        await act(async () => { result.current.retry(); });
        expect(m.post).toHaveBeenLastCalledWith({ json: { taskId: "task-1", smaller: ["Sort the garage"] } });
    });

    it("Smaller asks once more with the draft, and × discards it", async () => {
        m.post.mockResolvedValue(ok(["Sort the garage", "Bin the rubbish", "Sweep"]));
        const { result } = setup();
        await act(async () => { result.current.suggest(); });
        await act(async () => { result.current.smaller(); });
        expect(m.post).toHaveBeenLastCalledWith({ json: { taskId: "task-1", smaller: ["Sort the garage", "Bin the rubbish", "Sweep"] } });
        expect(result.current.canSmaller).toBe(false);
        act(() => result.current.discard());
        expect(result.current.draft).toBeNull();
    });

    it("a failure offers Try again and drafts nothing; a deleted task closes quietly", async () => {
        m.post.mockResolvedValueOnce({ ok: false, status: 504, json: async () => ({ error: { code: "AI_TIMEOUT", message: "", status: 504, isRetryable: true } }) });
        const { result } = setup();
        await act(async () => { result.current.suggest(); });
        expect(result.current.status).toBe("failed");
        expect(result.current.draft).toBeNull();
        m.post.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { code: "NOT_FOUND", message: "", status: 404, isRetryable: false } }) });
        await act(async () => { result.current.suggest(); });
        expect(result.current.status).toBe("idle");
    });
});
