import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTagReorder } from "../../../../app/hooks/tags/use-tag-reorder";

const mutate = vi.fn();
vi.mock("../../../../app/hooks/tags/use-update-tag", () => ({ useUpdateTag: () => ({ mutate }) }));

const tags = [1000, 2000, 3000].map((sortOrder, i) => ({ id: `t${i}`, name: `T${i}`, sortOrder })) as never;
beforeEach(() => vi.clearAllMocks());

describe("useTagReorder", () => {
    it("a drop after another tag writes one midpoint sortOrder", () => {
        const { result } = renderHook(() => useTagReorder(tags));
        result.current.dropNear("t2", "t0", "after");
        expect(mutate).toHaveBeenCalledOnce();
        expect(mutate).toHaveBeenCalledWith({ id: "t2", sortOrder: 1500 });
    });

    it("a drop before the first goes ahead of it", () => {
        const { result } = renderHook(() => useTagReorder(tags));
        result.current.dropNear("t2", "t0", "before");
        expect(mutate).toHaveBeenCalledWith({ id: "t2", sortOrder: 999 });
    });

    it("move steps one place", () => {
        const { result } = renderHook(() => useTagReorder(tags));
        result.current.move("t0", 1);
        expect(mutate).toHaveBeenCalledWith({ id: "t0", sortOrder: 2500 });
    });
});
