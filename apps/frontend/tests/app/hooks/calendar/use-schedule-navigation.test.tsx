import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useScheduleNavigation } from "../../../../app/hooks/calendar/use-schedule-navigation";

vi.mock("../../../../app/lib/utils/user-zone", async (original) => ({
    ...await original<typeof import("../../../../app/lib/utils/user-zone")>(),
    useToday: () => "2026-10-14", today: () => "2026-10-14",
}));
const desktop = { isPhone: false, isDesktop: true };
const phone = { isPhone: true, isDesktop: false };
const tablet = { isPhone: false, isDesktop: false };
function setup(shell = desktop, entry = "/schedule") {
    return renderHook(() => ({ ...useScheduleNavigation(shell), go: useNavigate() }), {
        wrapper: ({ children }: { children: ReactNode }) => createElement(MemoryRouter, { initialEntries: [entry] }, children),
    });
}
beforeEach(() => localStorage.clear());

describe("schedule navigation", () => {
    it.each([[desktop, "month"], [tablet, "week"], [phone, "day"]] as const)("uses the device default %s → %s", (shell, view) => {
        expect(setup(shell).result.current.viewMode).toBe(view);
    });
    it("gives URL state precedence and lets header navigation move away from that date", () => {
        localStorage.setItem("cadence-schedule-view-desktop", "year");
        const { result } = setup(desktop, "/schedule?date=2026-01-31&view=month");
        expect(result.current.currentDate).toBe("2026-01-31");
        expect(result.current.viewMode).toBe("month");
        act(() => result.current.handleNavigate(1));
        expect(result.current.currentDate).toBe("2026-02-28");
        act(() => result.current.go("?date=2027-06-14&view=day"));
        expect(result.current.currentDate).toBe("2027-06-14");
        expect(result.current.viewMode).toBe("day");
    });
    it("ignores invalid URL values and restores the saved device view", () => {
        localStorage.setItem("cadence-schedule-view-desktop", "week");
        const { result } = setup(desktop, "/schedule?date=2026-02-30&view=invalid");
        expect(result.current.currentDate).toBe("2026-10-14");
        expect(result.current.viewMode).toBe("week");
    });
    it("maps phone Week to Day while preserving the stored preference and zoom path", () => {
        const { result } = setup(phone, "/schedule?view=week");
        expect(result.current.viewMode).toBe("day");
        expect(result.current.isPhoneDay).toBe(true);
        expect(localStorage.getItem("cadence-schedule-view-phone")).toBe("week");
        act(() => result.current.handleViewMode("month"));
        expect(result.current.zoom).toBe(-1);
        act(() => result.current.openDay("2026-11-02"));
        expect(result.current.zoom).toBe(1);
        expect(result.current.currentDate).toBe("2026-11-02");
        act(() => result.current.selectStripDay("2026-11-01"));
        expect(result.current.zoom).toBe(0);
        expect(result.current.direction).toBe(-1);
        act(() => result.current.shiftStripWeek(1));
        expect(result.current.currentDate).toBe("2026-11-08");
    });
    it("opens a month in the viewed year and returns to today through the same navigation state", () => {
        const { result } = setup(desktop, "/schedule?view=year&date=2027-04-15");
        act(() => result.current.handleYearSelectMonth(6));
        expect(result.current.currentDate).toBe("2027-07-01");
        expect(result.current.viewMode).toBe("month");
        act(() => result.current.handleToday());
        expect(result.current.currentDate).toBe("2026-10-14");
        expect(result.current.isOffToday).toBe(false);
    });
});
