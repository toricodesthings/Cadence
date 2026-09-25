import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { users } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import { AppError, throwIfNotFound } from "../../../platform/errors";
import type { Env } from "../../../types/env";
import type { Tx } from "../../../types/db";
import type { AgentContext } from "./index";
import { safeExecute, once } from "./index";
import { normalizeSettings } from "../../settings/settings.route";
import { personalEventSchema, type PersonalEvent } from "@cadence/contracts/settings";

/** The /events page's cap (`calendar.personalEvents.items`). */
const MAX_EVENTS = 50;

const eventFields = personalEventSchema.omit({ id: true });
const eventInput = z.object({
    label: eventFields.shape.label,
    monthDay: eventFields.shape.monthDay.describe("The yearly date, MM-DD."),
    emoji: eventFields.shape.emoji.optional().describe("One emoji, or null for none."),
    notify: eventFields.shape.notify.optional().describe("Remind on the day. Default true."),
    startedOn: eventFields.shape.startedOn.optional().describe("YYYY-MM-DD the first one happened (birth year, wedding day), to count years."),
});

/** The event's next date on or after `today` (local YYYY-MM-DD); Feb 29 falls back to Feb 28. */
export function nextOccurrence(monthDay: string, today: string) {
    const [month, day] = monthDay.split("-").map(Number);
    const on = (year: number) => {
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
    };
    const year = Number(today.slice(0, 4));
    return on(year) >= today ? on(year) : on(year + 1);
}

/** A row for the model: next date, days until it and, with startedOn, the year count it marks. */
export function toMinimalEvent(event: PersonalEvent, today: string) {
    const next = nextOccurrence(event.monthDay, today);
    const years = event.startedOn ? Number(next.slice(0, 4)) - Number(event.startedOn.slice(0, 4)) : undefined;
    return {
        id: event.id,
        label: event.label,
        monthDay: event.monthDay,
        emoji: event.emoji ?? undefined,
        notify: event.notify ? undefined : false,
        startedOn: event.startedOn ?? undefined,
        next,
        daysUntil: Math.round((Date.parse(next) - Date.parse(today)) / 86_400_000),
        years: years && years > 0 ? years : undefined,
    };
}

async function readSettings(tx: Tx, userId: string) {
    const [user] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
    return normalizeSettings((user?.settings ?? {}) as Record<string, any>);
}

/** Rewrite the user's event list inside `tx`; `change` gets the current items and returns the new ones. */
async function writeEvents(tx: Tx, userId: string, change: (items: PersonalEvent[]) => PersonalEvent[]) {
    const settings = await readSettings(tx, userId);
    const personalEvents = settings.calendar.personalEvents;
    const items = change(personalEvents.items ?? []);
    if (items.length > MAX_EVENTS) throw new AppError(400, "VALIDATION_ERROR", `Events hold at most ${MAX_EVENTS}`);
    await tx
        .update(users)
        .set({ settings: { ...settings, calendar: { ...settings.calendar, personalEvents: { ...personalEvents, items } } } })
        .where(eq(users.id, userId));
}

function findEvent(items: PersonalEvent[], id: string) {
    const event = items.find((item) => item.id === id);
    throwIfNotFound(event, "Event");
    return event;
}

export const eventTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── W ──────────────────────────────────────────────────────────────────
    create_event: tool({
        description:
            "Adds a yearly personal event (birthday, anniversary) to Events. Returns its eventId.",
        inputSchema: eventInput,
        execute: async (input, { toolCallId }) =>
            safeExecute("create_event", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const event: PersonalEvent = {
                            id: crypto.randomUUID().slice(0, 12),
                            label: input.label,
                            monthDay: input.monthDay,
                            emoji: input.emoji ?? null,
                            notify: input.notify ?? true,
                            startedOn: input.startedOn ?? null,
                        };
                        await writeEvents(tx, userId, (items) => [...items, event]);
                        // The dedup row points at the user: events live in their settings.
                        return { result: { eventId: event.id, next: nextOccurrence(event.monthDay, ctx.today) }, id: userId };
                    }),
                ),
            ),
    }),

    // ── U ──────────────────────────────────────────────────────────────────
    update_event: tool({
        description: "Changes an event's label, date, emoji (null removes it), reminder or start date. Send only what changes.",
        inputSchema: z.object({
            eventId: z.string().min(1).max(24),
            patch: eventInput.partial(),
        }),
        execute: async ({ eventId, patch }, { toolCallId }) =>
            safeExecute("update_event", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        let updated!: PersonalEvent;
                        await writeEvents(tx, userId, (items) => {
                            updated = { ...findEvent(items, eventId), ...patch };
                            return items.map((item) => (item.id === eventId ? updated : item));
                        });
                        return { result: toMinimalEvent(updated, ctx.today), id: userId };
                    }),
                ),
            ),
    }),

    // ── R ──────────────────────────────────────────────────────────────────
    get_events: tool({
        description:
            "The user's yearly personal events from Events, soonest first, each with its next date, daysUntil and, " +
            "when it has a start date, the years it marks. shownOnCalendar:false when the user hid them from the calendar.",
        inputSchema: z.object({}),
        execute: async () =>
            safeExecute("get_events", userId, async () => {
                const settings = await withRls(getDbClient(env), userId, (tx) => readSettings(tx, userId));
                const { enabled, items } = settings.calendar.personalEvents;
                return {
                    today: ctx.today,
                    shownOnCalendar: enabled ? undefined : false,
                    events: (items as PersonalEvent[]).map((event) => toMinimalEvent(event, ctx.today)).sort((a, b) => a.daysUntil - b.daysUntil),
                };
            }),
    }),

    // ── D ──────────────────────────────────────────────────────────────────
    delete_event: tool({
        description: "Deletes an event for good (there is no Trash for events).",
        inputSchema: z.object({ eventId: z.string().min(1).max(24) }),
        execute: async ({ eventId }, { toolCallId }) =>
            safeExecute("delete_event", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        let label = "";
                        await writeEvents(tx, userId, (items) => {
                            label = findEvent(items, eventId).label;
                            return items.filter((item) => item.id !== eventId);
                        });
                        return { result: { deleted: label }, id: userId };
                    }),
                ),
            ),
    }),
});
