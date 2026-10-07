import { act, fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCaptureComposer } from "../../../app/components/holding/CaptureInput";
import { Composer } from "../../../app/components/shared/Composer";

// Real parser and real composers: under four parallel zone runs a wait needs more than the 1s default.
configure({ asyncUtilTimeout: 5000 });
const { create, process } = vi.hoisted(() => ({ create: vi.fn(), process: vi.fn() }));
vi.mock("../../../app/hooks/inbox/use-create-inbox-item", () => ({ useCreateInboxItem: () => ({ mutateAsync: create }) }));
vi.mock("../../../app/hooks/inbox/use-process-inbox-to-task", () => ({ useProcessInboxToTask: () => ({ mutateAsync: process }) }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/tags/use-tags", () => ({ useTags: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: true, isPhone: true, isWide: false }) }));
function Host({ onSaved = vi.fn() }: { onSaved?: () => void }) {
    const { reset: _reset, ...draft } = useCaptureComposer({ onSaved });
    return <Composer open inline onClose={() => {}} {...draft} />;
}
beforeEach(() => { vi.clearAllMocks(); });
describe("Capture composer", () => {
    it("saves with Enter, waits for success, and stays ready for another thought", async () => {
        const { promise, resolve } = Promise.withResolvers();
        create.mockReturnValue(promise);
        const onSaved = vi.fn();
        render(<Host onSaved={onSaved} />);
        const input = screen.getByRole("textbox") as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: "Call Maya\nAbout the checklist" } });
        fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
        expect(create).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: "Enter" });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(create).toHaveBeenCalledTimes(1);
        expect(input.value).toContain("Call Maya");
        await act(async () => resolve({ id: "saved" }));
        expect(input.value).toBe("");
        expect(onSaved).toHaveBeenCalledOnce();
        expect(screen.getByRole("status").textContent).toBe("1 captured");
        expect(document.activeElement).toBe(input);
    });
    it("retains the draft on server failure and on Escape", async () => {
        create.mockRejectedValue(new Error("Unavailable"));
        render(<Host />);
        const input = screen.getByRole("textbox") as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: "Keep this thought" } });
        fireEvent.keyDown(input, { key: "Escape" });
        expect(input.value).toBe("Keep this thought");
        fireEvent.keyDown(input, { key: "Enter" });
        await screen.findByRole("alert");
        expect(input.value).toBe("Keep this thought");
    });
    it("splits pasted lines and retains only unsaved lines after a partial failure", async () => {
        create.mockResolvedValueOnce({ id: "one" }).mockRejectedValueOnce(new Error("Unavailable"));
        render(<Host />);
        const input = screen.getByRole("textbox") as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: "- First\n- Second\n- Third" } });
        fireEvent.paste(input, { clipboardData: { getData: () => "- First\n- Second\n- Third" } });
        fireEvent.click(screen.getByRole("button", { name: "Add as 3 thoughts?" }));
        await screen.findByRole("alert");
        expect(input.value).toBe("Second\nThird");
        expect(create.mock.calls.map(c => c[0].rawText)).toEqual(["First", "Second"]);
    });
    it("retries a failed task conversion without creating a second capture", async () => {
        create.mockResolvedValue({ id: "one" });
        process.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce({ id: "task" });
        render(<Host />);
        const input = screen.getByRole("textbox") as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: "Call Maya tomorrow" } });
        fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
        await screen.findByRole("alert");
        fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
        await waitFor(() => expect(input.value).toBe(""));
        expect(create).toHaveBeenCalledTimes(1);
        expect(process).toHaveBeenCalledTimes(2);
    });
    it("converts with the understood fields, resolved, so the server does not re-read the words", async () => {
        create.mockResolvedValue({ id: "one" });
        process.mockResolvedValue({ id: "task" });
        render(<Host />);
        const input = screen.getByRole("textbox") as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: "Call Maya tomorrow p2" } });
        fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
        await waitFor(() => expect(process).toHaveBeenCalled());
        expect(process.mock.calls[0][0]).toMatchObject({ title: "Call Maya", priority: 3, nlp: { resolved: true } });
        expect(process.mock.calls[0][0].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
