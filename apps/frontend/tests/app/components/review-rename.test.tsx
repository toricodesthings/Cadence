import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { ReviewListItem } from "../../../app/components/weekly-review/steps/shared";

function row(onRename = vi.fn(async () => {})) {
    render(
        <TooltipProvider><ReviewListItem title="Book a haircut" actions={[]} pendingActionKey={null} actionKeyPrefix="t:1" actionError={null}
            onRunAction={(_key, fn) => void fn()} onRename={onRename} /></TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Rename Book a haircut" }));
    return { onRename, field: screen.getByRole("textbox", { name: "New name" }) as HTMLInputElement };
}

describe("Weekly Reset rename in place", () => {
    it("Enter saves the trimmed name", () => {
        const { onRename, field } = row();
        fireEvent.change(field, { target: { value: "  Book a haircut Fri  " } });
        fireEvent.submit(field.form!);
        expect(onRename).toHaveBeenCalledWith("Book a haircut Fri");
        expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("Escape and Cancel leave the name alone; an unchanged name saves nothing", () => {
        const { onRename, field } = row();
        fireEvent.change(field, { target: { value: "Something else" } });
        fireEvent.keyDown(field, { key: "Escape" });
        expect(screen.queryByRole("textbox")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Rename Book a haircut" }));
        fireEvent.click(screen.getByRole("button", { name: "Cancel rename" }));
        fireEvent.click(screen.getByRole("button", { name: "Rename Book a haircut" }));
        fireEvent.submit(screen.getByRole("textbox").closest("form")!);
        expect(onRename).not.toHaveBeenCalled();
    });
});
