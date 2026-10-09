import { beforeEach, describe, expect, it, vi } from "vitest";
import { CADENCE_UNDO_DURATION } from "../../../../app/lib/utils/cadence-toast";
import { isUndone, toastUndo, undoWindow } from "../../../../app/lib/utils/undo-toast";

const { message } = vi.hoisted(() => ({ message: vi.fn() }));
vi.mock("sonner", () => ({ toast: { message } }));

const lastOptions = () => message.mock.calls.at(-1)![1];

describe("undo toasts", () => {
    beforeEach(() => message.mockClear());

    it("toastUndo shows a long-lived toast whose Undo runs the reversal", () => {
        const onUndo = vi.fn();
        toastUndo("Task moved to Trash", onUndo);
        expect(message).toHaveBeenCalledWith("Task moved to Trash", expect.objectContaining({ duration: CADENCE_UNDO_DURATION }));
        lastOptions().action.onClick();
        expect(onUndo).toHaveBeenCalledOnce();
    });

    it("undoWindow resolves when the window runs out", async () => {
        const closed = undoWindow("Deleted Groceries");
        lastOptions().onAutoClose();
        await expect(closed).resolves.toBeUndefined();
    });

    it("undoWindow resolves when the toast is swiped away", async () => {
        const closed = undoWindow("Deleted Groceries");
        lastOptions().onDismiss();
        await expect(closed).resolves.toBeUndefined();
    });

    it("undoWindow rejects with UndoneError on Undo, and a later close changes nothing", async () => {
        const closed = undoWindow("Deleted Groceries");
        lastOptions().action.onClick();
        lastOptions().onDismiss();
        const error = await closed.catch((caught: unknown) => caught);
        expect(isUndone(error)).toBe(true);
    });
});
