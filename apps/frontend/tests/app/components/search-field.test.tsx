import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchField, SearchTrigger } from "../../../app/components/primitives/SearchField";

function Harness({ initial = "", onClear, loading }: { initial?: string; onClear?: () => void; loading?: boolean }) {
    const [value, setValue] = useState(initial);
    return <SearchField aria-label="Search things" value={value} onValueChange={setValue} onClear={onClear} loading={loading} />;
}

describe("SearchField", () => {
    it("is a labelled searchbox that reports what is typed", () => {
        render(<Harness />);
        const box = screen.getByRole("searchbox", { name: "Search things" }) as HTMLInputElement;
        fireEvent.change(box, { target: { value: "milk" } });
        expect(box.value).toBe("milk");
    });

    it("offers Clear only while there is text, then empties and refocuses", () => {
        const onClear = vi.fn();
        render(<Harness onClear={onClear} />);
        expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
        const box = screen.getByRole("searchbox") as HTMLInputElement;
        fireEvent.change(box, { target: { value: "milk" } });
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(box.value).toBe("");
        expect(document.activeElement).toBe(box);
        expect(onClear).toHaveBeenCalledOnce();
    });

    it("swaps Clear for a spinner while a lookup runs", () => {
        render(<Harness initial="paris" loading />);
        expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    });
});

describe("SearchTrigger", () => {
    it("is a button that looks like a search box and opens search", () => {
        const onClick = vi.fn();
        render(<SearchTrigger aria-label="Search workspace" onClick={onClick} />);
        fireEvent.click(screen.getByRole("button", { name: "Search workspace" }));
        expect(onClick).toHaveBeenCalledOnce();
    });
});
