import { useMemo, useCallback } from "react";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { personalEventSchema, type PersonalEvent, type UpdatePersonalEvent } from "@cadence/contracts/personal-event";
import { useSettings, useUpdateSettings } from "../core/use-settings";
import { useApiClient } from "../auth/use-api-client";
import { useAuthedQuery } from "../auth/use-authed-query";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { newRowId } from "../../lib/api/optimistic-id";
import { toastError } from "../../lib/utils/error-toast";
import { toastName, undoWindow } from "../../lib/utils/undo-toast";
import { personalEventCache } from "./personal-event-cache";

const NO_EVENTS: PersonalEvent[] = [];

export function personalEventsQueryOptions(client: ApiClient) {
    return queryOptions({
        queryKey: queryKeys.personalEvents.all,
        staleTime: STALE_TIMES.EVENTS,
        queryFn: async () => unwrapResponse(await client.api["personal-events"].$get()),
    });
}

/**
 * Hook for reading and managing personal calendar events (`/personal-events`, online-only like settings).
 * Whether they show on the calendar (`enabled`) is a display preference kept in settings.
 *
 * @param year  — view year for computing event dates
 * @param month — optional 0-based month for filtering to a single month
 */
export function usePersonalEvents(year: number, month?: number) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const { data } = useAuthedQuery(personalEventsQueryOptions);

    const enabled = settings?.calendar?.personalEvents?.enabled ?? true;
    const items = data ?? NO_EVENTS;

    const add = useMutation({
        mutationFn: async (event: PersonalEvent) =>
            unwrapResponse(
                await client.api["personal-events"].$post(
                    { json: event },
                    { headers: { "Idempotency-Key": event.id } },
                ),
            ),
        onMutate: (event) => personalEventCache.edit(queryClient, (list) => [...list, event]),
        onError: (err, _event, context) => {
            if (context) personalEventCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't add event");
        },
        onSettled: () => personalEventCache.invalidate(queryClient),
    });

    const update = useMutation({
        mutationFn: async ({ id, patch }: { id: string; patch: UpdatePersonalEvent }) =>
            unwrapResponse(await client.api["personal-events"][":id"].$patch({ param: { id }, json: patch })),
        onMutate: ({ id, patch }) =>
            personalEventCache.edit(queryClient, (list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e))),
        onError: (err, _input, context) => {
            if (context) personalEventCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't save event");
        },
        onSettled: () => personalEventCache.invalidate(queryClient),
    });

    const remove = useMutation({
        // The event disappears at once; the server hears about it only once Undo's window closes.
        mutationFn: async ({ id, label }: { id: string; label: string }) => {
            await undoWindow(toastName(label), { description: "Deleted" });
            return unwrapResponse(await client.api["personal-events"][":id"].$delete({ param: { id } }));
        },
        onMutate: ({ id }) => personalEventCache.edit(queryClient, (list) => list.filter((e) => e.id !== id)),
        onError: (err, _input, context) => personalEventCache.undo(queryClient, err, context, "Couldn't delete event"),
        onSettled: () => personalEventCache.invalidate(queryClient),
    });

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
    const getEventsForDate = useCallback(
        (dateStr: string): PersonalEvent[] => {
            if (!enabled) return [];
            return eventsByDate.get(dateStr) ?? [];
        },
        [enabled, eventsByDate],
    );

    const addEvent = useCallback(
        (event: Omit<PersonalEvent, "id">) => {
            const newItem: PersonalEvent = { ...event, id: newRowId() };
            add.mutate(newItem);
            return newItem;
        },
        [add],
    );

    const updateEvent = useCallback(
        // Callers may pass a whole event (or view model); only the editable fields go out.
        (id: string, patch: Partial<Omit<PersonalEvent, "id">>) =>
            update.mutate({ id, patch: personalEventSchema.omit({ id: true }).partial().parse(patch) }),
        [update],
    );

    /** Removes the event and offers Undo, which cancels the delete before it is sent. */
    const removeEvent = useCallback(
        (id: string) => {
            const removed = items.find((e) => e.id === id);
            if (removed) remove.mutate({ id, label: removed.label });
        },
        [items, remove],
    );

    const setEnabled = useCallback(
        (value: boolean) => {
            updateSettings.mutate({
                calendar: {
                    personalEvents: { enabled: value },
                },
            });
        },
        [updateSettings],
    );

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
