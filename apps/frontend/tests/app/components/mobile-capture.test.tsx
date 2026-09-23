import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCaptureComposer } from "../../../app/components/holding/CaptureInput";
import { Composer } from "../../../app/components/shared/Composer";

const mutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false }));
vi.mock("../../../app/hooks/inbox/use-create-inbox-item", () => ({ useCreateInboxItem: () => mutation }));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: true, isPhone: true, isWide: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

function Host({ onSaved = vi.fn() }: { onSaved?: () => void }) {
    const { reset: _reset, ...draft } = useCaptureComposer({ onSaved });
    return <Composer open inline onClose={() => {}} {...draft} />;
}

beforeEach(() => { mutation.mutate.mockReset(); mutation.isPending = false; mutation.isError = false; });

describe("Capture composer", () => {
    it("keeps Enter for multiline text and clears the draft only after a successful save", () => {
        const onSaved = vi.fn();
        render(<Host onSaved={onSaved} />);
        const input = screen.getByRole("textbox", { name: "What's on your mind?" });
        fireEvent.change(input, { target: { value: "Call Maya\nAbout the checklist" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(mutation.mutate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Capture" }));
        expect(mutation.mutate).toHaveBeenCalledWith("Call Maya\nAbout the checklist", expect.any(Object));
        expect((input as HTMLTextAreaElement).value).toContain("Call Maya");
        expect(onSaved).not.toHaveBeenCalled();
        // A mutation failure leaves the draft untouched; success owns dismissal.
        act(() => mutation.mutate.mock.calls[0][1].onSuccess());
        expect((input as HTMLTextAreaElement).value).toBe("");
        expect(onSaved).toHaveBeenCalledOnce();
    });

    it("shows a retained-draft error and prevents duplicate submissions while saving", () => {
        mutation.isError = true;
        const { rerender } = render(<Host />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep this thought" } });
        expect(screen.getByRole("alert").textContent).toContain("Your draft is still here");
        mutation.isPending = true;
        rerender(<Host />);
        expect((screen.getByRole("button", { name: "Capturing…" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true });
        expect(mutation.mutate).not.toHaveBeenCalled();
    });
});
