import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { Task } from "@cadence/contracts/task";
import { useApplyInstruction } from "../../../app/hooks/tasks/use-apply-instruction";
import { queryKeys } from "../../../app/lib/api/query-keys";
import { testQueryClient, withClient } from "../../helpers";

const updateAsync = vi.fn();
const updateMutate = vi.fn();
vi.mock("../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutateAsync: updateAsync, mutate: updateMutate, isPending: false }) }));
vi.mock("../../../app/hooks/tags/use-task-tags", () => ({ useAddTaskTag: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const task = (id: string, dueDate: string | null = null) => ({ id, dueDate, tagIds: [] }) as unknown as Task;

beforeEach(() => vi.clearAllMocks());

describe("useApplyInstruction", () => {
    it("reports each task, so a retry touches only the one that failed", async () => {
        updateAsync.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce({});
        const { result } = renderHook(() => useApplyInstruction(), { wrapper: withClient() });

        let out: Awaited<ReturnType<typeof result.current.apply>>;
        await act(async () => { out = await result.current.apply([task("a"), task("b"), task("c")], { dueDate: "2026-10-12" }, "Updated 3 tasks"); });
        expect(out!).toEqual({ ok: ["a", "c"], failed: ["b"] });
        expect(updateAsync).toHaveBeenCalledTimes(3);
        expect((toast.success as any).mock.calls[0][0]).toMatch(/2 done, 1 didn't save/);
    });

    it("undoes only fields still holding what it wrote", async () => {
        updateAsync.mockResolvedValue({});
        const client = testQueryClient();
        const { result } = renderHook(() => useApplyInstruction(), { wrapper: withClient(client) });
        await act(async () => { await result.current.apply([task("a", "2026-10-08"), task("b", "2026-10-08")], { dueDate: "2026-10-12" }, "Updated"); });

        // "a" still holds what we wrote; on "b" someone has since moved the day.
        client.setQueryData([...queryKeys.tasks.all, "list"], [task("a", "2026-10-12"), task("b", "2026-10-20")]);
        ((toast.success as any).mock.calls[0][1].action.onClick as () => void)();

        expect(updateMutate).toHaveBeenCalledTimes(1);
        expect(updateMutate).toHaveBeenCalledWith({ id: "a", dueDate: "2026-10-08" });
    });

    it("never touches more than the batch bound", async () => {
        updateAsync.mockResolvedValue({});
        const { result } = renderHook(() => useApplyInstruction(), { wrapper: withClient() });
        const many = Array.from({ length: 40 }, (_, i) => task(`t${i}`));
        await act(async () => { await result.current.apply(many, { dueDate: "2026-10-12" }, "Updated"); });
        expect(updateAsync).toHaveBeenCalledTimes(25);
    });
});
