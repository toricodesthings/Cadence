import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { CalendarGrid } from "../../../app/components/calendar/CalendarGrid";
import { groupByDate } from "../../../app/lib/utils/calendar/schedule-day";
import { setUserZone } from "../../../app/lib/utils/user-zone";

vi.mock("../../../app/components/calendar/CalendarTaskChip", () => ({
    CalendarTaskChip: ({ task }: { task: Task }) => <span data-testid="chip">{task.title}</span>,
}));

const due = { id: "t1", title: "Pay rent", dueDate: "2026-10-05", endDate: null, scheduledStart: null, scheduledEnd: null } as unknown as Task;

describe("CalendarGrid", () => {
    afterEach(() => setUserZone("America/Toronto"));

    it.each(["Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Toronto"])("renders a task due 2026-10-05 in the 2026-10-05 cell for a user in %s", (zone) => {
        setUserZone(zone);
        const tasksByDay = Object.fromEntries(groupByDate([due]));
        const { container } = render(
            <CalendarGrid year={2026} month={9} selectedDate="2026-10-01" datesWithTasks={new Set(Object.keys(tasksByDay))} onSelectDate={() => {}} variant="full" tasksByDay={tasksByDay} />,
        );
        expect(container.querySelector('[data-day="2026-10-05"] [data-testid="chip"]')?.textContent).toBe("Pay rent");
        expect(container.querySelectorAll('[data-testid="chip"]')).toHaveLength(1);
    });

    it("lays the month out as LocalDate cells, selecting by LocalDate", () => {
        const onSelect = vi.fn();
        const { container } = render(<CalendarGrid year={2026} month={9} selectedDate="" datesWithTasks={new Set()} onSelectDate={onSelect} variant="compact" />);
        const buttons = [...container.querySelectorAll("button")];
        expect(buttons).toHaveLength(31);
        buttons[4].click();
        expect(onSelect).toHaveBeenCalledWith("2026-10-05");
    });
});
