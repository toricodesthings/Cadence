import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSectionReorder } from "../../../app/hooks/sections/use-section-reorder";

const mutate = vi.fn();
vi.mock("../../../app/hooks/sections/use-sections", () => ({ useUpdateSection: () => ({ mutate }) }));

const sections = (...orders: number[]) => orders.map((orderIndex, i) => ({ id: `s${i}`, name: `S${i}`, orderIndex })) as never;
beforeEach(() => vi.clearAllMocks());

describe("useSectionReorder", () => {
    it("moveTo writes one midpoint", () => {
        const { result } = renderHook(() => useSectionReorder("p1", sections(1, 2, 3)));
        result.current.moveTo("s2", 1);
        expect(mutate).toHaveBeenCalledOnce();
        expect(mutate).toHaveBeenCalledWith({ id: "s2", orderIndex: 1.5 });
    });

    it("move steps one place, and does nothing past the ends", () => {
        const { result } = renderHook(() => useSectionReorder("p1", sections(1, 2, 3)));
        result.current.move("s0", -1);
        result.current.move("s2", 1);
        expect(mutate).not.toHaveBeenCalled();
        result.current.move("s0", 1);
        expect(mutate).toHaveBeenCalledWith({ id: "s0", orderIndex: 2.5 });
    });

    it("lays everything out again when neighbours tie", () => {
        const { result } = renderHook(() => useSectionReorder("p1", sections(5, 5, 5)));
        result.current.moveTo("s2", 1);
        expect(mutate).toHaveBeenCalledTimes(3);
        expect(mutate).toHaveBeenCalledWith({ id: "s2", orderIndex: 2048 });
    });
});
