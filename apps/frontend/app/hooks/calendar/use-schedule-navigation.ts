import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { addDays, isLocalDate, type LocalDate } from "@cadence/domain/time";
import type { CalendarViewMode } from "../../components/calendar/ScheduleHeader";
import { today, useToday } from "../../lib/utils/user-zone";
import { addMonthsToDay, addYearsToDay, parseYMD } from "../../lib/utils/calendar/calendar-math";
import { isoMonthStart } from "../../lib/utils/date-format";
import { isCalendarViewModeValue } from "../../lib/utils/calendar/schedule-model";
import { useDeviceValue } from "../ui/use-device-flag";

export function useScheduleNavigation({ isPhone, isDesktop }: { isPhone: boolean; isDesktop: boolean }) {
    const [searchParams] = useSearchParams();
    const todayIso = useToday();
    const { y: year, m: month } = parseYMD(todayIso);
    // ── Persisted view mode per device class ────────────────────────────────
    const deviceClass = isPhone ? "phone" : isDesktop ? "desktop" : "tablet";
    const defaultView: CalendarViewMode = isPhone ? "day" : isDesktop ? "month" : "week";
    const [stored, store] = useDeviceValue(`cadence-schedule-view-${deviceClass}`);
    // A `?view=` link wins until the user picks a view.
    const [linkedView, setLinkedView] = useState(() => {
        const queryView = searchParams.get("view");
        return isCalendarViewModeValue(queryView) ? queryView : null;
    });
    const storedViewMode: CalendarViewMode = linkedView ?? (isCalendarViewModeValue(stored) ? stored : defaultView);
    // Phones zoom Day → Month → Year; Week's strip lives inside Day there.
    const viewMode: CalendarViewMode = isPhone && storedViewMode === "week" ? "day" : storedViewMode;
    const isPhoneDay = isPhone && viewMode === "day";
    const setViewMode = useCallback((mode: CalendarViewMode) => {
        setLinkedView(null);
        store(mode);
    }, [store]);

    const [currentDate, setCurrentDate] = useState<LocalDate>(() => {
        const queryDate = searchParams.get("date");
        return isLocalDate(queryDate) ? queryDate : todayIso;
    });
    const [direction, setDirection] = useState(0);
    /** 1 = zooming in (Year → Month → Day), -1 = out; phones only. */
    const [zoom, setZoom] = useState(0);
    useEffect(() => {
        const queryDate = searchParams.get("date");
        if (isLocalDate(queryDate)) {
            setCurrentDate(queryDate);
        }
    }, [searchParams]);

    useEffect(() => {
        const queryView = searchParams.get("view");
        if (isCalendarViewModeValue(queryView)) {
            setViewMode(queryView);
        }
    }, [searchParams, setViewMode]);

    const handleNavigate = useCallback((delta: number) => {
        setZoom(0);
        setDirection(delta);
        setCurrentDate((prev) => {
            switch (viewMode) {
                case "day": return addDays(prev, delta);
                case "week": return addDays(prev, delta * 7);
                case "month": return addMonthsToDay(prev, delta);
                case "year": return addYearsToDay(prev, delta);
            }
        });
    }, [viewMode]);

    const handleToday = useCallback(() => {
        setZoom(0);
        const todayStr = today();
        setDirection(todayStr > currentDate ? 1 : -1);
        setCurrentDate(todayStr);
    }, [currentDate]);

    const handleSelectDate = useCallback((day: LocalDate) => {
        setCurrentDate(day);
        setViewMode("day");
    }, [setViewMode]);

    // ── View mode change ────────────────────────────────────────────────────
    const handleViewMode = useCallback((mode: CalendarViewMode) => {
        const depth: Record<CalendarViewMode, number> = { day: 0, week: 1, month: 2, year: 3 };
        setZoom(isPhone ? Math.sign(depth[viewMode] - depth[mode]) : 0);
        setDirection(0);
        setViewMode(mode);
    }, [setViewMode, isPhone, viewMode]);

    /** Phone: open a day from Month or Year, zooming in. */
    const openDay = useCallback((iso: LocalDate) => {
        setCurrentDate(iso);
        handleViewMode("day");
    }, [handleViewMode]);

    const handleYearSelectMonth = useCallback((m: number) => {
        setCurrentDate(isoMonthStart(parseYMD(currentDate).y, m));
        setViewMode("month");
    }, [currentDate, setViewMode]);

    const viewed = parseYMD(currentDate);
    const isOffToday = viewMode === "year" ? viewed.y !== year
        : viewMode === "month" ? viewed.y !== year || viewed.m !== month : currentDate !== todayIso;
    const selectStripDay = (day: LocalDate) => {
        setZoom(0);
        setDirection(day > currentDate ? 1 : -1);
        setCurrentDate(day);
    };
    const shiftStripWeek = (delta: number) => {
        setZoom(0);
        setDirection(delta);
        setCurrentDate((prev) => addDays(prev, delta * 7));
    };
    const selectViewShortcut = useCallback((mode: CalendarViewMode) => {
        setDirection(0);
        setViewMode(mode);
    }, [setViewMode]);
    return {
        currentDate, setCurrentDate, todayIso, viewMode, isPhoneDay, direction, zoom, isOffToday,
        year: viewed.y, month: viewed.m,
        handleNavigate, handleToday, handleSelectDate, handleViewMode, openDay, handleYearSelectMonth,
        selectStripDay, shiftStripWeek, selectViewShortcut,
    };
}
export type ScheduleNavigation = ReturnType<typeof useScheduleNavigation>;
