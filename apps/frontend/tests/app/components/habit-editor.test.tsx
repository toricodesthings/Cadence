import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Habit } from "@cadence/contracts/habit";
import { HabitEditor } from "../../../app/components/habits/HabitEditor";
import { Provider } from "../../../app/components/primitives/Tooltip";

const { update, remove, pause, resume, close } = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), pause: vi.fn(), resume: vi.fn(), close: vi.fn() }));
vi.mock("../../../app/hooks/habits/use-update-habit", () => ({ useUpdateHabit: () => ({ mutate: update }) }));
vi.mock("../../../app/hooks/habits/use-delete-habit", () => ({ useDeleteHabit: () => ({ mutate: remove }) }));
vi.mock("../../../app/hooks/habits/use-pause-habit", () => ({ usePauseHabit: () => ({ pause }), useResumeHabit: () => ({ resume }) }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [{ id: "project-1", name: "Health" }] }) }));
vi.mock("../../../app/hooks/tags/use-tags", () => ({ useTags: () => ({ data: [{ id: "tag-1", name: "Daily" }] }) }));
vi.mock("../../../app/hooks/habits/use-habit-monthly", () => ({ useHabitMonthly: () => ({ data: { scheduledDays: [1], logsByDay: { 1: "COMPLETED" } }, isLoading: false }) }));
const habit = { id: "habit-1", title: "Walk", description: "Fresh air", notes: "Morning", recurrenceRule: "FREQ=DAILY", targetTime: "09:00", reminderEnabled: true, projectId: null, tagIds: ["tag-1"], pausedUntil: null, archived: false, totalCompletions: 8, currentStreak: 2, longestStreak: 5, createdAt: "2026-09-01T00:00:00Z" } as Habit;
function setup(value = habit) { return render(<Provider><HabitEditor habit={value} onClose={close} /></Provider>); }
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("HabitEditor", () => {
    it("saves titles and notes on blur without a settings form", () => {
        setup();
        fireEvent.change(screen.getByLabelText("Habit title"), { target: { value: "Walk outside" } });
        fireEvent.blur(screen.getByLabelText("Habit title"));
        expect(update).toHaveBeenCalledWith({ id: habit.id, title: "Walk outside" });
        fireEvent.change(screen.getByLabelText("Habit notes"), { target: { value: "After lunch" } });
        fireEvent.blur(screen.getByLabelText("Habit notes"));
        expect(update).toHaveBeenCalledWith({ id: habit.id, notes: "After lunch" });
        expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    });
    it("retains purpose, cadence, time, reminders, project and pause controls", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: /^Details/ }));
        fireEvent.change(screen.getByLabelText("Habit purpose"), { target: { value: "Stay active" } });
        fireEvent.blur(screen.getByLabelText("Habit purpose"));
        expect(update).toHaveBeenCalledWith({ id: habit.id, description: "Stay active" });
        fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
        expect(update).toHaveBeenCalledWith({ id: habit.id, recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" });
        fireEvent.change(screen.getByLabelText("Habit target time"), { target: { value: "10:30" } });
        expect(update).toHaveBeenCalledWith({ id: habit.id, targetTime: "10:30" });
        fireEvent.click(screen.getByRole("switch", { name: "Habit reminder" }));
        expect(update).toHaveBeenCalledWith({ id: habit.id, reminderEnabled: false });
        fireEvent.change(screen.getByLabelText("Habit project"), { target: { value: "project-1" } });
        expect(update).toHaveBeenCalledWith({ id: habit.id, projectId: "project-1" });
        expect(screen.getByText("Daily")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Pause for 7 days" }));
        expect(pause).toHaveBeenCalledWith(habit.id);
    });
    it("keeps history and stats available", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: /^History/ }));
        expect(screen.getByText("Total check-ins")).toBeTruthy();
        expect(screen.getByText("Longest streak")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
        fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    });
    it("supports resuming and restoring an archived habit", () => {
        setup({ ...habit, archived: true, pausedUntil: "2099-12-31" });
        fireEvent.click(screen.getByRole("button", { name: /^Details/ }));
        fireEvent.click(screen.getByRole("button", { name: "Resume habit" }));
        expect(resume).toHaveBeenCalledWith(habit.id);
        fireEvent.click(screen.getByRole("button", { name: "Restore habit" }));
        expect(update).toHaveBeenCalledWith({ id: habit.id, archived: false });
        expect(close).toHaveBeenCalledOnce();
    });
    it("requires confirmation before permanent deletion", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Delete habit" }));
        expect(remove).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(remove).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Delete habit" }));
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete habit" }));
        expect(remove).toHaveBeenCalledWith(habit.id);
        expect(close).toHaveBeenCalledOnce();
    });
});
