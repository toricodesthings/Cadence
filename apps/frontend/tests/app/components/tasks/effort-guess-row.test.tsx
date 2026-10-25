import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EffortSuggestionRow } from "../../../../app/components/tasks/TaskWeightFields";

describe("Effort guess row", () => {
    it("announces the guess as a guess, uses it in one tap, and × dismisses it", () => {
        const onUse = vi.fn();
        const onDismiss = vi.fn();
        render(<EffortSuggestionRow suggestion={{ kind: "level", level: 3, support: 2 }} onUse={onUse} onDismiss={onDismiss} guess={{}} />);
        const group = screen.getByRole("group", { name: "Suggested effort" });
        expect(group.textContent).toContain("Effort guess: ~High");
        expect(group.querySelector('[aria-hidden="true"]:not(svg)')?.textContent).toBe("~");
        fireEvent.click(screen.getByRole("button", { name: "Use High effort" }));
        expect(onUse).toHaveBeenCalledWith(3);
        fireEvent.click(screen.getByRole("button", { name: "Dismiss suggested effort" }));
        expect(onDismiss).toHaveBeenCalled();
    });
});
