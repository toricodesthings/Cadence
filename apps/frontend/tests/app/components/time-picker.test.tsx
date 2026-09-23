import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimePicker } from "../../../app/components/primitives/TimePicker";
import { setDateFormatConfig } from "../../../app/lib/utils/date-format";

vi.mock("../../../app/hooks/ui/use-coarse-pointer", () => ({ useIsCoarsePointer: () => false }));

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => setDateFormatConfig({ timeDisplay: "12h", dateStyle: "mdy", weekStartsOn: 1 }));

function typeAndEnter(value: string, typed: string) {
    const onChange = vi.fn();
    render(<TimePicker value={value} onChange={onChange} clearable />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.keyDown(input, { key: "Enter" });
    return onChange;
}

describe("TimePicker (desktop)", () => {
    it("commits typed text on Enter, not the highlighted suggestion", () => {
        setDateFormatConfig({ timeDisplay: "24h", dateStyle: "mdy", weekStartsOn: 1 });
        expect(typeAndEnter("09:00", "14:30")).toHaveBeenCalledWith("14:30");
    });

    it("commits typed text on Enter when the field starts empty", () => {
        setDateFormatConfig({ timeDisplay: "24h", dateStyle: "mdy", weekStartsOn: 1 });
        expect(typeAndEnter("", "14:30")).toHaveBeenCalledWith("14:30");
    });

    it("still commits an arrow-key pick on Enter", () => {
        const onChange = vi.fn();
        render(<TimePicker value="09:00" onChange={onChange} />);
        const input = screen.getByRole("combobox");
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onChange).toHaveBeenCalledWith("09:30");
    });
});
