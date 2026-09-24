import { describe, expect, it } from "vitest";
import { useSubtaskOpenStore } from "../../../app/stores/subtask-open-store";

describe("useSubtaskOpenStore", () => {
    it("remembers open tasks in storage and forgets them when closed", () => {
        const { setOpen } = useSubtaskOpenStore.getState();

        setOpen("task-1", true);
        expect(useSubtaskOpenStore.getState().open).toEqual({ "task-1": true });
        expect(JSON.parse(localStorage.getItem("cadence-subtask-open")!).state.open).toEqual({ "task-1": true });

        setOpen("task-1", false);
        expect(useSubtaskOpenStore.getState().open).toEqual({});
    });
});
