import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Habit } from "@cadence/contracts/habit";
import { RoutineMonthGrid } from "../../../../app/components/habits/RoutineMonthGrid";

vi.mock("../../../../app/components/habits/RoutineDayCell", () => ({ RoutineDayCell: ({ date }: { date: string }) => <span data-testid="cell">{date}</span> }));

// Runs under the four-zone matrix (`TZ=... vitest`): the grid is LocalDates, so the machine zone never shows.
describe("RoutineMonthGrid", () => {
    const habit = { id: "h", title: "Walk", colorAccent: null, createdAt: "2026-01-01T00:00:00Z", logs: [] } as unknown as Habit;

    it("lays out Oct 2026 as the same 31 days, Thursday first, in every zone", () => {
        render(<RoutineMonthGrid habit={habit} year={2026} month={9} weekStartsOn={0} today="2026-10-05" />);
        const days = screen.getAllByTestId("cell").map((cell) => cell.textContent);
        expect(days).toHaveLength(31);
        expect(days[0]).toBe("2026-10-01");
        expect(days[30]).toBe("2026-10-31");
        // Sunday-first: Oct 1 is a Thursday, so the first row holds four blank cells.
        expect(screen.getAllByRole("gridcell")[4].textContent).toBe("2026-10-01");
    });

    it("has a Feb 29 only in leap years", () => {
        const { unmount } = render(<RoutineMonthGrid habit={habit} year={2028} month={1} weekStartsOn={1} today="2028-02-01" />);
        expect(screen.getAllByTestId("cell")).toHaveLength(29);
        unmount();
        render(<RoutineMonthGrid habit={habit} year={2027} month={1} weekStartsOn={1} today="2027-02-01" />);
        expect(screen.getAllByTestId("cell")).toHaveLength(28);
    });
});
