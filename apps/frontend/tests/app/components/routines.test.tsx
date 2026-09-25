import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Habit } from "@cadence/contracts/habit";
import { CadencePicker } from "../../../app/components/habits/CadencePicker";
import { Provider } from "../../../app/components/primitives/Tooltip";
import { monthStats } from "../../../app/components/habits/RoutineMonthGrid";
import { openOnCardClick } from "../../../app/components/habits/RoutineWeekRow";
import { isRoutinePaused, routineTone } from "../../../app/lib/utils/habits";
import { toISODate, weekdayLabels } from "../../../app/lib/utils/date-format";

const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return toISODate(d); };

describe("isRoutinePaused", () => {
    it("covers today through pausedUntil and never the days before", () => {
        const habit = { pausedUntil: day(3) };
        expect(isRoutinePaused(habit)).toBe(true);
        expect(isRoutinePaused(habit, day(3))).toBe(true);
        expect(isRoutinePaused(habit, day(4))).toBe(false);
        expect(isRoutinePaused(habit, day(-1))).toBe(false);
        expect(isRoutinePaused({ pausedUntil: null })).toBe(false);
    });
});

describe("routineTone", () => {
    it("uses the picked colour, else moonlit", () => {
        expect(routineTone("violet")).toBe("var(--color-violet)");
        expect(routineTone("lantern")).toBe("var(--color-moonlit)");
    });
});

describe("monthStats", () => {
    it("counts check-ins and the longest run up to today, never misses", () => {
        const log = (offset: number, status: "COMPLETED" | "SKIPPED" | "PENDING") => ({ id: String(offset), habitId: "h", status, targetDate: day(offset), completedAt: null });
        const habit = { logs: [log(-5, "COMPLETED"), log(-4, "COMPLETED"), log(-3, "PENDING"), log(-2, "COMPLETED"), log(0, "COMPLETED"), log(1, "COMPLETED")] } as Habit;
        expect(monthStats(habit, day(0))).toEqual({ checkIns: 4, longest: 2 });
    });
});

describe("weekdayLabels", () => {
    it("starts on the week start the user picked", () => {
        expect(weekdayLabels(2, 0)[0]).toBe("Su");
        expect(weekdayLabels(2, 1)[0]).toBe("Mo");
        expect(weekdayLabels(2, 6)).toEqual(["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"]);
    });
});

describe("openOnCardClick", () => {
    it("opens on the card's background, never on its own buttons", () => {
        const onSelect = vi.fn();
        render(<section data-testid="card" onClick={openOnCardClick(onSelect)}><span>Walk</span><button type="button">Mon</button></section>);
        fireEvent.click(screen.getByRole("button", { name: "Mon" }));
        expect(onSelect).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText("Walk"));
        expect(onSelect).toHaveBeenCalledOnce();
    });
});

describe("CadencePicker", () => {
    it("builds every-N-days and every-other-week rules", () => {
        const onChange = vi.fn();
        const { rerender } = render(<Provider><CadencePicker value="FREQ=DAILY;INTERVAL=2" onChange={onChange} /></Provider>);
        expect(screen.getByText("Every 2 days")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "More days between" }));
        expect(onChange).toHaveBeenLastCalledWith("FREQ=DAILY;INTERVAL=3");
        fireEvent.click(screen.getByRole("button", { name: "Fewer days between" }));
        expect(onChange).toHaveBeenLastCalledWith("FREQ=DAILY");

        rerender(<Provider><CadencePicker value="FREQ=WEEKLY;BYDAY=MO,WE" onChange={onChange} /></Provider>);
        fireEvent.click(screen.getByRole("switch", { name: "Every other week" }));
        expect(onChange).toHaveBeenLastCalledWith("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
    });
});
