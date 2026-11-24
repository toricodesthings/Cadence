import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { CreateTagInline } from "../../../app/components/sidebar/CreateTagInline";

const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock("../../../app/hooks/tags/use-create-tag", () => ({ useCreateTag: () => ({ mutateAsync }) }));

const setup = () => {
    const onCreated = vi.fn();
    const onCancel = vi.fn();
    render(
        <TooltipProvider>
            <CreateTagInline onCreated={onCreated} onCancel={onCancel} />
        </TooltipProvider>,
    );
    return { onCreated, onCancel, field: screen.getByLabelText("Tag name") };
};

describe("CreateTagInline", () => {
    it("focuses the name field on mount and disables Save while empty", () => {
        const { field } = setup();
        expect(document.activeElement).toBe(field);
        expect((screen.getByLabelText("Save tag") as HTMLButtonElement).disabled).toBe(true);
    });

    it("creates the tag on Enter", async () => {
        const { field, onCreated } = setup();
        fireEvent.change(field, { target: { value: "Errands" } });
        fireEvent.keyDown(field, { key: "Enter" });
        await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(mutateAsync).toHaveBeenCalledWith({ name: "Errands", color: "default" });
    });

    it("cancels on Escape", () => {
        const { field, onCancel } = setup();
        fireEvent.keyDown(field, { key: "Escape" });
        expect(onCancel).toHaveBeenCalled();
    });
});
