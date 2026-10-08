import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoutineTimes, listTimes } from "../../../app/components/habits/RoutineTimes";
import { routineAgendaItems } from "../../../app/components/shared/RoutineAgendaRow";
import { makeHabit } from "../../helpers";

window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;

describe("routine at set times", () => {
    it("lists times in the user's format", () => {
        expect(listTimes(["08:00", "14:00", "20:00"])).toMatch(/8:00 AM, 2:00 PM and 8:00 PM|08:00, 14:00 and 20:00/);
    });

    it("adds, keeps sorted, and removes times; says to check each off", () => {
        const onChange = vi.fn();
        const { rerender } = render(<RoutineTimes times={["09:00"]} onChange={onChange} />);
        fireEvent.click(screen.getByRole("button", { name: "Add time" }));
        expect(onChange).toHaveBeenLastCalledWith(["09:00", "13:00"]);

        rerender(<RoutineTimes times={["09:00", "13:00"]} onChange={onChange} />);
        expect(screen.getByText(/Check off each time separately/)).toBeTruthy();
        fireEvent.click(screen.getAllByRole("button", { name: /^Remove/ })[0]);
        expect(onChange).toHaveBeenLastCalledWith(["13:00"]);
    });

    it("shows the routine once on Today with its progress; Mark done targets the next open time", () => {
        const habit = makeHabit({
            id: "h", title: "Medication", times: ["00:00", "23:59"],
            logs: [{ id: "l", habitId: "h", status: "PENDING", targetDate: "2026-10-08", completedAt: null, userId: "u", timeMarks: { "00:00": { status: "COMPLETED", at: "2026-10-08T04:07:00.000Z" } } } as never],
        });
        const [item, ...rest] = routineAgendaItems([habit], "2026-10-08");
        expect(rest).toHaveLength(0);
        expect(item).toMatchObject({ timed: true, time: "23:59", progress: "1 of 2 done", done: false });
    });
});
