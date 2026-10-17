import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "../../../app/components/primitives/SegmentedControl";

vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { appearance: { motion: "reduced" } } }) }));

const OPTIONS = [{ value: "1", label: "One" }, { value: "2", label: "Two" }, { value: "3", label: "Three" }] as const;
const at = (el: Element, left: number, width: number) => Object.assign(el, { getBoundingClientRect: () => ({ left, width, right: left + width, top: 0, bottom: 36, height: 36 }) });

describe("SegmentedControl", () => {
    it("keeps radio semantics and taps choose", () => {
        const onChange = vi.fn();
        render(<SegmentedControl ariaLabel="Pick" value="1" onChange={onChange} options={OPTIONS} />);
        expect(screen.getByRole("radio", { name: "One" }).getAttribute("aria-checked")).toBe("true");
        fireEvent.click(screen.getByRole("radio", { name: "Two" }));
        expect(onChange).toHaveBeenCalledWith("2");
    });

    it("a touch scrub from the first segment to the third chooses the third", () => {
        const onChange = vi.fn();
        render(<SegmentedControl ariaLabel="Pick" value="1" onChange={onChange} options={OPTIONS} />);
        at(screen.getByRole("radiogroup"), 0, 300);
        screen.getAllByRole("radio").forEach((radio, i) => at(radio, i * 100, 100));
        const first = screen.getByRole("radio", { name: "One" });
        const touch = (type: "pointerDown" | "pointerMove" | "pointerUp", clientX: number) => fireEvent[type](first, { pointerType: "touch", pointerId: 1, isPrimary: true, clientX });
        touch("pointerDown", 50);
        touch("pointerMove", 150);
        touch("pointerMove", 250);
        touch("pointerUp", 250);
        fireEvent.click(first);
        expect(onChange.mock.calls).toEqual([["3"]]);
    });
});
