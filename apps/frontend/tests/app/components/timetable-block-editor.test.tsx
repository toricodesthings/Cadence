import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TimetableBlockEditor } from "../../../app/components/tasks/TimetableBlockEditor";
import { Provider } from "../../../app/components/primitives/Tooltip";
import { setUserZone } from "../../../app/lib/utils/user-zone";
import { stubTouch } from "../../helpers";

const mutate = vi.fn();
vi.mock("../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutate }) }));
stubTouch(true);

const task = {
    id: "task-1",
    scheduledStart: "2026-10-27T13:00:00.000Z",
    scheduledEnd: "2026-10-27T14:30:00.000Z",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
};

function setup(overrides: Partial<typeof task> = {}) {
    render(
        <Provider>
            <TimetableBlockEditor task={{ ...task, ...overrides }} />
        </Provider>,
    );
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
        fireEvent.change(screen.getByLabelText("Series start date"), { target: { value: "2026-11-03" } });
        expect(mutate).toHaveBeenCalledWith({
            id: "task-1",
            scheduledStart: "2026-11-03T14:00:00.000Z",
            scheduledEnd: "2026-11-03T15:30:00.000Z",
        });
    });
});
