import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchSelect } from "../../../app/components/primitives/SearchSelect";

const options = [
    { value: "CA", label: "Canada" },
    { value: "TR", label: "Türkiye" },
    { value: "JP", label: "Japan" },
];
const pinned = [{ value: "__none__", label: "Use my time zone" }];

const setup = (value = "CA", onValueChange = vi.fn()) => {
    render(<SearchSelect value={value} onValueChange={onValueChange} options={options} pinned={pinned} ariaLabel="Country" searchLabel="Search countries" />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Country" }), { key: "Enter" });
    return onValueChange;
};

describe("SearchSelect", () => {
    beforeEach(() => {
        // jsdom has none of these; Radix Select reads them while opening.
        Element.prototype.scrollIntoView = vi.fn();
        Element.prototype.hasPointerCapture = vi.fn(() => false);
        Element.prototype.releasePointerCapture = vi.fn();
    });

    it("lists the pinned option first, then everything", () => {
        setup();
        expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Use my time zone", "Canada", "Türkiye", "Japan"]);
    });

    it("narrows as you type, ignoring accents, and keeps the chosen one", () => {
        setup();
        fireEvent.change(screen.getByLabelText("Search countries"), { target: { value: "turkiye" } });
        expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Canada", "Türkiye"]);
    });

    it("says so when nothing matches", () => {
        setup("__none__");
        fireEvent.change(screen.getByLabelText("Search countries"), { target: { value: "zzz" } });
        expect(screen.getByText("No matches")).toBeTruthy();
    });

    it("reports the picked value", () => {
        const onValueChange = setup();
        fireEvent.click(screen.getByRole("option", { name: "Japan" }));
        expect(onValueChange).toHaveBeenCalledWith("JP");
    });
});
