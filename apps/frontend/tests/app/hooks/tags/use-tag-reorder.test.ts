import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTagReorder } from "../../../../app/hooks/tags/use-tag-reorder";

const mutate = vi.fn();
vi.mock("../../../../app/hooks/tags/use-update-tag", () => ({ useUpdateTag: () => ({ mutate }) }));

const tags = [1000, 2000, 3000].map((sortOrder, i) => ({ id: `t${i}`, name: `T${i}`, sortOrder })) as never;
beforeEach(() => vi.clearAllMocks());

/** A dragover/drop at `clientX` over the chip for `id`, which spans x 100–200. */
const over = (id: string, clientX: number) => {
    const chip = document.createElement("button");
    chip.dataset.tagId = id;
    chip.getBoundingClientRect = () => ({ left: 100, width: 100 }) as DOMRect;
    return { target: chip, clientX, preventDefault: vi.fn(), dataTransfer: { dropEffect: "" } } as unknown as DragEvent;
};

describe("useTagReorder", () => {
    it("the others make room once the pointer crosses a chip's middle, and the drop writes one midpoint", () => {
        const { result } = renderHook(() => useTagReorder(tags));
        act(() => result.current.start("t2"));
        act(() => result.current.onDragOver(over("t0", 180)));
        expect(result.current.ordered.map((t) => t.id)).toEqual(["t0", "t1", "t2"]);
        act(() => result.current.onDragOver(over("t0", 120)));
        expect(result.current.ordered.map((t) => t.id)).toEqual(["t2", "t0", "t1"]);
        act(() => result.current.onDrop(over("t2", 150)));
        expect(mutate).toHaveBeenCalledExactlyOnceWith({ id: "t2", sortOrder: 999 });
    });

    it("a drag that ends anywhere else glides back and writes nothing", () => {
        const { result } = renderHook(() => useTagReorder(tags));
        act(() => result.current.start("t0"));
        act(() => result.current.onDragOver(over("t1", 180)));
        expect(result.current.ordered.map((t) => t.id)).toEqual(["t1", "t0", "t2"]);
        act(() => { window.dispatchEvent(new Event("dragend")); });
        expect(result.current.ordered.map((t) => t.id)).toEqual(["t0", "t1", "t2"]);
        expect(mutate).not.toHaveBeenCalled();
    });

    it("move steps one place", () => {
        const { result } = renderHook(() => useTagReorder(tags));
        result.current.move("t0", 1);
        expect(mutate).toHaveBeenCalledWith({ id: "t0", sortOrder: 2500 });
    });
});
