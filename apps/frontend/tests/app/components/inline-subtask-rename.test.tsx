import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InlineSubtaskPanel } from "../../../app/components/tasks/InlineSubtasks";

const update = vi.fn();
vi.mock("../../../app/hooks/tasks/use-subtasks", () => ({
    useCreateSubtask: () => ({ mutate: vi.fn() }),
    useDeleteSubtask: () => ({ mutate: vi.fn() }),
    useReorderSubtasks: () => ({ mutate: vi.fn() }),
    useUpdateSubtask: () => ({ mutate: update }),
}));
vi.mock("../../../app/hooks/ai/use-suggest-steps", () => ({ useSuggestSteps: () => ({ draft: null, status: "idle" }) }));
vi.mock("../../../app/components/tasks/SuggestSteps", () => ({ SuggestedSteps: () => null, SuggestStepsButton: () => null }));
vi.mock("../../../app/components/tasks/TaskCheckbox", () => ({ TaskCheckbox: () => null }));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isTouch: false }) }));

const subtasks = [{ id: "s1", taskId: "t1", title: "Buy milk", isComplete: false, orderIndex: 0 }] as never;
const open = () => {
    render(<InlineSubtaskPanel taskId="t1" subtasks={subtasks} open adding={false} onAddingChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename subtask Buy milk" }));
    return screen.getByRole("textbox", { name: "Subtask name" });
};
beforeEach(() => vi.clearAllMocks());

describe("inline subtask rename", () => {
    it("click, type, Enter writes once", () => {
        const input = open();
        fireEvent.change(input, { target: { value: "  Buy oat milk " } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(update).toHaveBeenCalledOnce();
        expect(update).toHaveBeenCalledWith({ id: "s1", title: "Buy oat milk" });
    });

    it("Escape writes nothing", () => {
        const input = open();
        fireEvent.change(input, { target: { value: "Something else" } });
        fireEvent.keyDown(input, { key: "Escape" });
        expect(update).not.toHaveBeenCalled();
    });

    it("an empty title restores the old one and writes nothing", () => {
        const input = open();
        fireEvent.change(input, { target: { value: "   " } });
        fireEvent.blur(input);
        expect(update).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Rename subtask Buy milk" })).toBeTruthy();
    });
});
