import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureInput } from "../../../app/components/holding/CaptureInput";

const mutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false }));
vi.mock("../../../app/hooks/inbox/use-create-inbox-item", () => ({ useCreateInboxItem: () => mutation }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

function Composer({ onCaptured }: { onCaptured: () => void }) {
    const [draft, setDraft] = useState("");
    return <CaptureInput mobile draft={draft} onDraftChange={setDraft} onCaptured={onCaptured} />;
}

beforeEach(() => { mutation.mutate.mockReset(); mutation.isPending = false; mutation.isError = false; });

describe("Mobile capture", () => {
    it("keeps Enter for multiline text and clears the draft only after a successful save", () => {
        const onCaptured = vi.fn();
        render(<Composer onCaptured={onCaptured} />);
        const input = screen.getByRole("textbox", { name: "What's on your mind?" });
        fireEvent.change(input, { target: { value: "Call Maya\nAbout the checklist" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(mutation.mutate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Capture" }));
        expect(mutation.mutate).toHaveBeenCalledWith("Call Maya\nAbout the checklist", expect.any(Object));
        expect((input as HTMLTextAreaElement).value).toContain("Call Maya");
        expect(onCaptured).not.toHaveBeenCalled();
        // A mutation failure leaves the controlled draft untouched; success owns dismissal.
        act(() => mutation.mutate.mock.calls[0][1].onSuccess());
        expect((input as HTMLTextAreaElement).value).toBe("");
        expect(onCaptured).toHaveBeenCalledOnce();
    });

    it("shows a retained-draft error and prevents duplicate submissions while saving", () => {
        mutation.isError = true;
        const { rerender } = render(<CaptureInput mobile draft="Keep this thought" onDraftChange={vi.fn()} />);
        expect(screen.getByRole("alert").textContent).toContain("Your draft is still here");
        expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep this thought");
        mutation.isPending = true;
        rerender(<CaptureInput mobile draft="Keep this thought" onDraftChange={vi.fn()} />);
        expect((screen.getByRole("button", { name: "Capturing…" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true });
        expect(mutation.mutate).not.toHaveBeenCalled();
    });
});
