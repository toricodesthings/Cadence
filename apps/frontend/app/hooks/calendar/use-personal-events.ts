import { useMemo, useCallback } from "react";
import { useSettings, useUpdateSettings } from "../core/use-settings";
import type { PersonalEvent } from "../../types/settings";

const DEFAULT_PERSONAL_EVENTS = {
    enabled: true,
    items: [] as PersonalEvent[],
};

/**
 * Hook for reading and managing personal calendar events.
 * Events are stored in settings JSONB — no separate API route.
 *
 * @param year  — view year for computing event dates
 * @param month — optional 0-based month for filtering to a single month
 */
export function usePersonalEvents(year: number, month?: number) {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const personalEvents = settings?.calendar?.personalEvents ?? DEFAULT_PERSONAL_EVENTS;
    const enabled = personalEvents.enabled;
    const items = personalEvents.items ?? [];

    // Map of "YYYY-MM-DD" → PersonalEvent[] for the given year
    const eventsByDate = useMemo(() => {
        const map = new Map<string, PersonalEvent[]>();
        if (!enabled) return map;
        for (const event of items) {
            const [mm, dd] = event.monthDay.split("-");
            const dateStr = `${year}-${mm}-${dd}`;
            const existing = map.get(dateStr) ?? [];
            existing.push(event);
            map.set(dateStr, existing);
        }
        return map;
    }, [enabled, items, year]);

    // Set of day-of-month numbers that have events (for dot rendering in month view)
    const eventDays = useMemo(() => {
        const days = new Set<number>();
        if (!enabled || month === undefined) return days;
        const monthStr = String(month + 1).padStart(2, "0");
        for (const event of items) {
            const [mm, dd] = event.monthDay.split("-");
            if (mm === monthStr) {
                days.add(parseInt(dd, 10));
            }
        }
        return days;
    }, [enabled, items, month]);

    // ISO date set for year view
    const eventDateSet = useMemo(() => {
        const set = new Set<string>();
        if (!enabled) return set;
        for (const event of items) {
            const [mm, dd] = event.monthDay.split("-");
            set.add(`${year}-${mm}-${dd}`);
        }
        return set;
    }, [enabled, items, year]);

    // Get events for a specific date string "YYYY-MM-DD"
    const getEventsForDate = useCallback((dateStr: string): PersonalEvent[] => {
        if (!enabled) return [];
        return eventsByDate.get(dateStr) ?? [];
    }, [enabled, eventsByDate]);

    // CRUD operations via settings deep merge
    const addEvent = useCallback((event: Omit<PersonalEvent, "id">) => {
        const newItem: PersonalEvent = { ...event, id: crypto.randomUUID().slice(0, 12) };
        updateSettings.mutate({
            calendar: {
                personalEvents: {
                    items: [...items, newItem],
                },
            },
        });
        return newItem;
    }, [items, updateSettings]);

    const updateEvent = useCallback((id: string, patch: Partial<Omit<PersonalEvent, "id">>) => {
        updateSettings.mutate({
            calendar: {
                personalEvents: {
                    items: items.map((e) => e.id === id ? { ...e, ...patch } : e),
                },
            },
        });
    }, [items, updateSettings]);

    const removeEvent = useCallback((id: string) => {
        updateSettings.mutate({
            calendar: {
                personalEvents: {
                    items: items.filter((e) => e.id !== id),
                },
            },
        });
    }, [items, updateSettings]);

    const setEnabled = useCallback((value: boolean) => {
        updateSettings.mutate({
            calendar: {
                personalEvents: { enabled: value },
            },
        });
    }, [updateSettings]);

    return {
        enabled,
        items,
        eventsByDate,
        eventDays,
        eventDateSet,
        getEventsForDate,
        hasEvents: items.length > 0,
        addEvent,
        updateEvent,
        removeEvent,
        setEnabled,
    };
}
