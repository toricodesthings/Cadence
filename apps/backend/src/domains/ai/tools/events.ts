import { tool } from "ai";
import { ACCENT_COLORS } from "@cadence/contracts/constants";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { users } from "../../../db/schema";
import { AppError } from "../../../platform/errors";
import { eventAccess } from "../../../platform/list-access";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, once } from "./index";
import { nextPersonalEventDay } from "@cadence/domain/reminders";
import { personalEventSchema, type PersonalEvent, type SharedEvent } from "@cadence/contracts/personal-event";
import {
    createEvent,
    deleteEvent,
    getEventForCaller,
    listEvents,
    setEventNotify,
    updateEvent,
} from "../../personal-events/personal-events.service";
import { broadcastLive } from "../../push/reminder-clock";
import { eventOwnerNames } from "../../sharing/sharing.service";

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

export function toMinimalEvent(event: PersonalEvent | SharedEvent, today: string, sharedBy?: string) {
    const next = nextPersonalEventDay(event.monthDay, today);
    const years = event.startedOn ? Number(next.slice(0, 4)) - Number(event.startedOn.slice(0, 4)) : undefined;
    const isShared = "access" in event && (event.members.length > 0 || event.access !== "owner");
    return {
        id: event.id,
        label: event.label,
        monthDay: event.monthDay,
        emoji: event.emoji ?? undefined,
        notify: event.notify ? undefined : false,
        startedOn: event.startedOn ?? undefined,
        color: event.color ?? undefined,
        shared: isShared ? true : undefined,
        sharedBy: isShared && "access" in event && event.access !== "owner" && sharedBy ? sharedBy : undefined,
        next,
        daysUntil: Math.round((Date.parse(next) - Date.parse(today)) / 86_400_000),
        years: years && years > 0 ? years : undefined,
    };
}

export function projectEvents(
    enabled: boolean,
    items: (PersonalEvent | SharedEvent)[],
    today: string,
    ownerNames?: Map<string, string>,
) {
    return {
        today,
        shownOnCalendar: enabled ? undefined : false,
        events: items
            .map((event) => toMinimalEvent(event, today, ownerNames?.get(event.id)))
            .sort((a, b) => a.daysUntil - b.daysUntil),
    };
}

export const eventTools = (env: Env, userId: string, ctx: AgentContext) => ({
    save_event: tool({
        description:
            "Adds or changes a yearly personal event (including shared events) on Events. Without eventId it adds an owned one " +
            "(label and monthDay needed); with eventId it changes only what the patch sends. Never shares events.",
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
            safeExecute("save_event", userId, async () => {
                let audience: string[] | undefined;
                const result = await withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        if (eventId === undefined) {
                            const row = await createEvent(tx, userId, {
                                label: patch.label!,
                                monthDay: patch.monthDay!,
                                emoji: patch.emoji,
                                notify: patch.notify,
                                startedOn: patch.startedOn,
                                color: patch.color,
                            });
                            return { result: toMinimalEvent(row, ctx.today), id: row.id };
                        }
                        const access = await eventAccess(tx, userId, eventId);
                        audience = access.audience;
                        if (access.role === "owner") {
                            const row =
                                Object.keys(patch).length > 0
                                    ? await updateEvent(tx, access.ownerId, eventId, patch)
                                    : await getEventForCaller(tx, userId, eventId);
                            return { result: toMinimalEvent(row, ctx.today), id: row.id };
                        }
                        const { notify, ...rest } = patch;
                        if (notify !== undefined) await setEventNotify(tx, eventId, notify);
                        if (Object.keys(rest).length > 0) await updateEvent(tx, access.ownerId, eventId, rest);
                        const row = await getEventForCaller(tx, userId, eventId);
                        return { result: toMinimalEvent(row, ctx.today), id: row.id };
                    }),
                );
                if (audience && audience.length > 1 && !(result as { deduped?: boolean }).deduped) {
                    ctx.waitUntil?.(broadcastLive(env, userId, audience, [{ type: "event" }]));
                }
                return result;
            }),
    }),

    get_events: tool({
        description:
            "The user's yearly personal events (including shared events with shared/sharedBy) from Events, soonest first, " +
            "each with its next date, daysUntil and, when it has a start date, the years it marks.",
        inputSchema: z.object({}),
        execute: async () =>
            safeExecute("get_events", userId, () =>
                withRls(getDbClient(env), userId, async (tx) => {
                    const [user] = await tx
                        .select({ settings: users.settings })
                        .from(users)
                        .where(eq(users.id, userId));
                    const enabled = user?.settings?.calendar?.personalEvents?.enabled ?? true;
                    const items = await listEvents(tx, userId);
                    const joinedIds = items.filter((item) => item.access !== "owner").map((item) => item.id);
                    const ownerNames = await eventOwnerNames(tx, joinedIds);
                    return projectEvents(enabled, items, ctx.today, ownerNames);
                }),
            ),
    }),

    delete_event: tool({
        description:
            "Deletes an unshared event the user owns for good (there is no Trash for events; shared events must be deleted from the Events page).",
        inputSchema: z.object({ eventId: z.uuid() }),
        execute: async ({ eventId }, { toolCallId }) =>
            safeExecute("delete_event", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const access = await eventAccess(tx, userId, eventId);
                        if (access.role !== "owner") throw new AppError(404, "NOT_FOUND", "Event not found");
                        if (access.audience.length > 1)
                            throw new AppError(
                                403,
                                "FORBIDDEN",
                                "This event is shared. Delete it from the Events page.",
                            );
                        const row = await deleteEvent(tx, userId, eventId);
                        return { result: { deleted: row.label }, id: row.id };
                    }),
                ),
            ),
    }),
});
