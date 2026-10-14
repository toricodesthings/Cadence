import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useScheduleCreation } from "../../../../app/hooks/calendar/use-schedule-creation";
import { useScheduleShortcuts } from "../../../../app/hooks/calendar/use-schedule-shortcuts";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

const track = vi.hoisted(() => vi.fn());
vi.mock("../../../../app/lib/api/track-event", () => ({ trackUsageEvent: track }));
beforeEach(() => { vi.clearAllMocks(); setUserZone("America/Toronto"); });

describe("schedule creation", () => {
    it("opens and closes a grid draft and its highlight together", () => {
        const { result } = renderHook(() => useScheduleCreation("2026-11-02"));
        act(() => result.current.handleGridClick({ date: "2026-11-02", startHour: 9, startMinute: 30, anchorX: 100, anchorY: 140 }));
        expect(result.current.creation).toMatchObject({ tab: "task", draftPlacement: { dateStr: "2026-11-02", startMinute: 570, endMinute: 600 } });
        act(() => result.current.close());
        expect(result.current.creation).toBeNull();
    });
    it("opens a suggested free gap at its local time and clears any old highlight", () => {
        const { result } = renderHook(() => useScheduleCreation("2026-11-02"));
        act(() => result.current.handleAddAt("2026-11-02T14:30:00.000Z", 45));
        expect(result.current.creation).toMatchObject({ tab: "task", draftPlacement: null,
            info: { date: "2026-11-02", startHour: 9, startMinute: 30, durationMinutes: 45 } });
        act(() => result.current.handleAddEventToolbar());
        expect(result.current.creation).toMatchObject({ tab: "event", draftPlacement: null, info: { isAllDay: true } });
    });
    it("tracks toolbar creation without introducing analytics for the keyboard shortcut", () => {
        const { result } = renderHook(() => useScheduleCreation("2026-11-02"));
        act(() => result.current.handleAddTaskShortcut());
        expect(track).not.toHaveBeenCalled();
        act(() => result.current.handleAddTaskToolbar());
        expect(track).toHaveBeenCalledTimes(1);
    });
});

describe("schedule shortcuts", () => {
    it("shares creation/navigation actions and ignores editing fields and modifier chords", () => {
        const view = vi.fn(), navigate = vi.fn(), closeDetails = vi.fn();
        const { result } = renderHook(() => {
            const creation = useScheduleCreation("2026-11-02");
            useScheduleShortcuts({ selectViewShortcut: view, handleToday: vi.fn(), handleNavigate: navigate },
                creation, { selectedTaskId: "task", setSelectedTaskId: closeDetails });
            return creation;
        });
        act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" })));
        expect(result.current.creation?.tab).toBe("task");
        act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
        expect(result.current.creation).toBeNull();
        expect(closeDetails).not.toHaveBeenCalled();
        act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
        expect(closeDetails).toHaveBeenCalledWith(null);
        act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" })));
        expect(view).toHaveBeenCalledWith("week");
        act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
        expect(navigate).toHaveBeenCalledWith(1);
        view.mockClear();
        const field = document.createElement("textarea");
        document.body.appendChild(field);
        act(() => field.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true })));
        act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", ctrlKey: true })));
        expect(view).not.toHaveBeenCalled();
        field.remove();
    });
});
