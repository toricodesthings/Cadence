import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Habit } from "@cadence/contracts/habit";
import { HabitEditor } from "../../../app/components/habits/HabitEditor";
import { Provider } from "../../../app/components/primitives/Tooltip";

const { update, remove, pause, resume, close, resolve } = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), pause: vi.fn(), resume: vi.fn(), close: vi.fn(), resolve: vi.fn() }));
vi.mock("../../../app/hooks/ui/use-coarse-pointer", () => ({ useIsCoarsePointer: () => true }));
vi.mock("../../../app/hooks/habits/use-update-habit", () => ({ useUpdateHabit: () => ({ mutate: update }) }));
vi.mock("../../../app/hooks/habits/use-delete-habit", () => ({ useDeleteHabit: () => ({ mutate: remove }) }));
vi.mock("../../../app/hooks/habits/use-pause-habit", () => ({ usePauseHabit: () => ({ pause }), useResumeHabit: () => ({ resume }) }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [{ id: "project-1", name: "Health" }] }) }));
vi.mock("../../../app/hooks/tags/use-tags", () => ({ useTags: () => ({ data: [{ id: "tag-1", name: "Daily" }] }) }));
vi.mock("../../../app/hooks/tags/use-create-tag", () => ({ useCreateTag: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }) }));
const settings = vi.hoisted(() => ({ current: { tasks: { showStreaks: true } } }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: settings.current }) }));
const { routineToTask } = vi.hoisted(() => ({ routineToTask: vi.fn(() => Promise.resolve()) }));
vi.mock("../../../app/hooks/habits/use-convert-repeat", () => ({ useConvertRepeat: () => ({ routineToTask, taskToRoutine: vi.fn(), isPending: false }) }));
vi.mock("../../../app/hooks/habits/use-resolve-habit", () => ({ useResolveHabit: () => ({ mutate: resolve }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
// Every range query answers with the routine due yesterday (open) and today (done).
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const logs = [
    { id: "a", habitId: "habit-1", status: "PENDING", targetDate: day(-1), completedAt: null },
    { id: "b", habitId: "habit-1", status: "COMPLETED", targetDate: day(0), completedAt: null },
];
vi.mock("../../../app/hooks/habits/use-habits", () => ({ useHabitsRange: () => ({ data: [{ ...habit, logs }] }) }));
const habit = { id: "habit-1", title: "Walk", description: "Fresh air", notes: "Morning", recurrenceRule: "FREQ=DAILY", targetTime: "09:00", reminderEnabled: true, projectId: null, tagIds: ["tag-1"], pausedUntil: null, archived: false, totalCompletions: 8, currentStreak: 2, longestStreak: 5, createdAt: "2026-09-01T00:00:00Z" } as Habit;
function setup(value = habit) { return render(<Provider><HabitEditor habit={value} onClose={close} /></Provider>); }
beforeEach(() => {
    vi.clearAllMocks();
    settings.current = { tasks: { showStreaks: true } };
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("HabitEditor", () => {
    it("saves titles and notes on blur without a settings form", () => {
        setup();
        fireEvent.change(screen.getByLabelText("Routine title"), { target: { value: "Walk outside" } });
        fireEvent.blur(screen.getByLabelText("Routine title"));
        expect(update).toHaveBeenCalledWith({ id: habit.id, title: "Walk outside" });
        fireEvent.change(screen.getByLabelText("Routine notes"), { target: { value: "After lunch" } });
        fireEvent.blur(screen.getByLabelText("Routine notes"));
        expect(update).toHaveBeenCalledWith({ id: habit.id, notes: "After lunch" });
        expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    });
    it("retains purpose, cadence, time, reminders, project and pause controls", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: /^Details/ }));
        fireEvent.change(screen.getByLabelText("Routine purpose"), { target: { value: "Stay active" } });
        fireEvent.blur(screen.getByLabelText("Routine purpose"));
        expect(update).toHaveBeenCalledWith({ id: habit.id, description: "Stay active" });
        fireEvent.click(screen.getByRole("radio", { name: "Mon–Fri" }));
        expect(update).toHaveBeenCalledWith({ id: habit.id, recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" });
        fireEvent.change(screen.getByLabelText("Routine usual time"), { target: { value: "10:30" } });
        expect(update).toHaveBeenCalledWith({ id: habit.id, targetTime: "10:30" });
        fireEvent.click(screen.getByRole("switch", { name: "Routine reminder" }));
        expect(update).toHaveBeenCalledWith({ id: habit.id, reminderEnabled: false });
        fireEvent.change(screen.getByRole("combobox", { name: "List" }), { target: { value: "project-1" } });
        expect(update).toHaveBeenCalledWith({ id: habit.id, projectId: "project-1" });
        expect(screen.getByRole("button", { name: "Remove tag Daily" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "1 week" }));
        expect(pause).toHaveBeenCalledWith(habit.id, expect.any(Date));
        fireEvent.click(screen.getByRole("radio", { name: "Violet" }));
        expect(update).toHaveBeenCalledWith({ id: habit.id, colorAccent: "violet" });
    });
    it("keeps history and stats available", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: /^History/ }));
        expect(screen.getByText("Total check-ins")).toBeTruthy();
        expect(screen.getByText("Longest run")).toBeTruthy();
        // Any past day in the month can be logged from here.
        const history = screen.getByRole("grid");
        fireEvent.click(within(history).getByRole("button", { name: /: not logged$/ }));
        expect(resolve).toHaveBeenCalledWith({ targetDate: day(-1), status: "COMPLETED" });
        fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
        fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    });
    it("hides streaks when the setting is off", () => {
        settings.current = { tasks: { showStreaks: false } };
        setup();
        fireEvent.click(screen.getByRole("button", { name: /^History/ }));
        expect(screen.getByText("Total check-ins")).toBeTruthy();
        expect(screen.queryByText("Longest run")).toBeNull();
    });
    it("turns a routine into a task from the if-you-miss-one choice", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: /^Details/ }));
        fireEvent.click(screen.getByRole("radio", { name: /Still owed/ }));
        expect(routineToTask).toHaveBeenCalledWith(habit, "task");
    });
    it("sets a different time for one weekday", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: /^Details/ }));
        fireEvent.click(screen.getByRole("button", { name: "Different times on some days" }));
        fireEvent.change(screen.getByLabelText("Sat time"), { target: { value: "11:00" } });
        expect(update).toHaveBeenCalledWith({ id: habit.id, targetTimes: { SA: "11:00" } });
    });
    it("checks off this week's days from the top card, the one strip overlays keep", () => {
        setup();
        const week = screen.getByRole("group", { name: "This week" });
        fireEvent.click(within(week).getByRole("button", { name: /: done$/ }));
        expect(resolve).toHaveBeenCalledWith({ targetDate: day(0), status: "PENDING" });
    });
    it("resumes a paused routine", () => {
        setup({ ...habit, pausedUntil: "2099-12-31" });
        fireEvent.click(screen.getByRole("button", { name: /^Details/ }));
        fireEvent.click(screen.getByRole("button", { name: "Resume today" }));
        expect(resume).toHaveBeenCalledWith(habit.id);
    });
    it("restores an archived routine", () => {
        setup({ ...habit, archived: true });
        fireEvent.click(screen.getByRole("button", { name: "Restore routine" }));
        expect(update).toHaveBeenCalledWith({ id: habit.id, archived: false });
        expect(close).toHaveBeenCalledOnce();
    });
    it("requires confirmation before permanent deletion", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Delete routine" }));
        expect(remove).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(remove).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Delete routine" }));
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete routine" }));
        expect(remove).toHaveBeenCalledWith(habit.id);
        expect(close).toHaveBeenCalledOnce();
    });
});
