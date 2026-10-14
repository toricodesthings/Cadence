import { useCallback, useState } from "react";
import { wallTimeOf, type Instant, type LocalDate } from "@cadence/domain/time";
import type { CalendarEventInfo } from "../../components/calendar/CalendarEventPopover";
import { dayOfInstant, toTimeValue } from "../../lib/utils/date-format";
import { getUserZone } from "../../lib/utils/user-zone";
import { trackUsageEvent } from "../../lib/api/track-event";

interface ScheduleCreationState {
    info: CalendarEventInfo;
    tab: "task" | "event";
    draftPlacement: { dateStr: LocalDate; startMinute: number; endMinute: number } | null;
}
const anchor = () => ({ anchorX: window.innerWidth / 2, anchorY: 140 });

/** The draft highlight and popover open/close together. */
export function useScheduleCreation(currentDate: LocalDate) {
    const [creation, setCreation] = useState<ScheduleCreationState | null>(null);
    const close = useCallback(() => setCreation(null), []);
    const handleGridClick = useCallback((info: CalendarEventInfo) => {
        const startMinute = info.startHour * 60 + info.startMinute;
        setCreation({ info, tab: "task", draftPlacement: { dateStr: info.date, startMinute, endMinute: startMinute + 30 } });
    }, []);
    const handleAddAt = useCallback((start: Instant, minutes: number) => {
        const [hour, minute] = toTimeValue(start).split(":").map(Number);
        setCreation({ tab: "task", draftPlacement: null, info: {
            date: dayOfInstant(start), startHour: hour, startMinute: minute, durationMinutes: minutes, ...anchor(),
        } });
    }, []);
    const openTask = useCallback((track: boolean) => {
        const hour = Number(wallTimeOf(new Date(), getUserZone()).slice(0, 2));
        if (track) trackUsageEvent("schedule.quick_add_used", { surface: "schedule_toolbar", object_type: "task" });
        setCreation((previous) => ({ tab: "task", draftPlacement: previous?.draftPlacement ?? null, info: {
            date: currentDate, startHour: Math.min(23, hour + 1), startMinute: 0, ...anchor(),
        } }));
    }, [currentDate]);
    const handleAddTaskToolbar = useCallback(() => openTask(true), [openTask]);
    const handleAddTaskShortcut = useCallback(() => openTask(false), [openTask]);
    const handleAddEventToolbar = useCallback(() => {
        setCreation({ tab: "event", draftPlacement: null, info: {
            date: currentDate, startHour: 9, startMinute: 0, isAllDay: true, ...anchor(),
        } });
    }, [currentDate]);
    return { creation, close, handleGridClick, handleAddAt, handleAddTaskToolbar, handleAddTaskShortcut, handleAddEventToolbar };
}
export type ScheduleCreation = ReturnType<typeof useScheduleCreation>;
