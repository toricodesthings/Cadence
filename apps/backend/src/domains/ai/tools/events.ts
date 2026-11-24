import { tool } from "ai";
import { ACCENT_COLORS } from "@cadence/contracts/constants";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { users } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, once } from "./index";
import { normalizeSettings } from "../../settings/settings.route";
import { nextPersonalEventDay } from "@cadence/domain/reminders";
import { personalEventSchema, type PersonalEvent } from "@cadence/contracts/personal-event";
import { createEvent, deleteEvent, listEvents, updateEvent } from "../../personal-events/personal-events.service";

const eventFields = personalEventSchema.omit({ id: true });
const eventInput = z.object({
    label: eventFields.shape.label,
    monthDay: eventFields.shape.monthDay.describe("The yearly date, MM-DD."),
    emoji: eventFields.shape.emoji.optional().describe("One emoji, or null for none."),
    notify: eventFields.shape.notify.optional().describe("Remind on the day. Default true."),
    startedOn: eventFields.shape.startedOn
        .optional()
        .describe("YYYY-MM-DD the first one happened (birth year, wedding day), to count years."),
    color: z.enum(ACCENT_COLORS).nullable().optional().describe("Its card tint; null = none."),
});

/** A row for the model: next date, days until it and, with startedOn, the year count it marks. */
export function toMinimalEvent(event: PersonalEvent, today: string) {
    const next = nextPersonalEventDay(event.monthDay, today);
    const years = event.startedOn ? Number(next.slice(0, 4)) - Number(event.startedOn.slice(0, 4)) : undefined;
    return {
        id: event.id,
        label: event.label,
        monthDay: event.monthDay,
        emoji: event.emoji ?? undefined,
        notify: event.notify ? undefined : false,
        startedOn: event.startedOn ?? undefined,
        color: event.color ?? undefined,
        next,
        daysUntil: Math.round((Date.parse(next) - Date.parse(today)) / 86_400_000),
        years: years && years > 0 ? years : undefined,
    };
}

/** Same event projection for fresh tool reads and the request's already-loaded snapshot. */
export function projectEvents(enabled: boolean, items: PersonalEvent[], today: string) {
    return {
        today,
        shownOnCalendar: enabled ? undefined : false,
        events: items.map((event) => toMinimalEvent(event, today)).sort((a, b) => a.daysUntil - b.daysUntil),
    };
}

export const eventTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── W ──────────────────────────────────────────────────────────────────
    save_event: tool({
        description:
            "Adds or changes a yearly personal event (birthday, anniversary) on Events. Without eventId it adds one " +
            "(label and monthDay needed); with eventId it changes only what the patch sends. Returns the event.",
        inputSchema: z
            .object({
                eventId: z.uuid().optional().describe("The event to change; omit to add one."),
                patch: eventInput.partial(),
            })
            .refine(
                (v) => v.eventId !== undefined || (v.patch.label !== undefined && v.patch.monthDay !== undefined),
                "A new event needs a label and monthDay",
            ),
        execute: async ({ eventId, patch }, { toolCallId }) =>
            safeExecute("save_event", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const row =
                            eventId === undefined
                                ? await createEvent(tx, userId, {
                                      label: patch.label!,
                                      monthDay: patch.monthDay!,
                                      emoji: patch.emoji,
                                      notify: patch.notify,
                                      startedOn: patch.startedOn,
                                      color: patch.color,
                                  })
                                : await updateEvent(tx, userId, eventId, patch);
                        return { result: toMinimalEvent(row, ctx.today), id: row.id };
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
            safeExecute("get_events", userId, () =>
                withRls(getDbClient(env), userId, async (tx) => {
                    const [user] = await tx
                        .select({ settings: users.settings })
                        .from(users)
                        .where(eq(users.id, userId));
                    const enabled = user?.settings?.calendar?.personalEvents?.enabled ?? true;
                    return projectEvents(enabled, await listEvents(tx, userId), ctx.today);
                }),
            ),
    }),

    // ── D ──────────────────────────────────────────────────────────────────
    delete_event: tool({
        description: "Deletes an event for good (there is no Trash for events).",
        inputSchema: z.object({ eventId: z.uuid() }),
        execute: async ({ eventId }, { toolCallId }) =>
            safeExecute("delete_event", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const row = await deleteEvent(tx, userId, eventId);
                        return { result: { deleted: row.label }, id: row.id };
                    }),
                ),
            ),
    }),
});
