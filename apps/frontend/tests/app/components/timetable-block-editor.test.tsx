import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TimetableBlockEditor } from "../../../app/components/tasks/TimetableBlockEditor";
import { Provider } from "../../../app/components/primitives/Tooltip";
import { setUserZone } from "../../../app/lib/utils/user-zone";

const mutate = vi.fn();
vi.mock("../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutate }) }));
vi.mock("../../../app/hooks/ui/use-coarse-pointer", () => ({ useIsCoarsePointer: () => true }));

// Tue 2026-10-27 09:00-10:30 EDT, weekly on Tuesdays.
const task = {
    id: "task-1",
    scheduledStart: "2026-10-27T13:00:00.000Z",
    scheduledEnd: "2026-10-27T14:30:00.000Z",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
};

function setup(overrides: Partial<typeof task> = {}) {
    render(<Provider><TimetableBlockEditor task={{ ...task, ...overrides }} /></Provider>);
}

describe("TimetableBlockEditor", () => {
    beforeEach(() => {
        mutate.mockReset();
        setUserZone("America/Toronto");
    });

    it("ends the series on a LocalDate UNTIL (YYYYMMDD, inclusive)", () => {
        setup();
        fireEvent.change(screen.getByLabelText("Series end date"), { target: { value: "2026-12-15" } });
        expect(mutate).toHaveBeenCalledWith({ id: "task-1", recurrenceRule: "FREQ=WEEKLY;BYDAY=TU;UNTIL=20261215" });
    });

    it("reads an existing UNTIL back as the series end day", () => {
        setup({ recurrenceRule: "FREQ=WEEKLY;BYDAY=TU;UNTIL=20261215" });
        expect((screen.getByLabelText("Series end date") as HTMLInputElement).value).toBe("2026-12-15");
    });

    it("moves the series start to a day and keeps its local time across DST", () => {
        setup();
        // US DST ends Sun 2026-11-01: 09:00 local is 13:00Z before it and 14:00Z after.
        fireEvent.change(screen.getByLabelText("Series start date"), { target: { value: "2026-11-03" } });
        expect(mutate).toHaveBeenCalledWith({
            id: "task-1",
            scheduledStart: "2026-11-03T14:00:00.000Z",
            scheduledEnd: "2026-11-03T15:30:00.000Z",
        });
    });
});
