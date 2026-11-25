import { Hono } from "hono";
import { insertPersonalEventSchema, updatePersonalEventSchema } from "@cadence/contracts/personal-event";
import { uuidParamSchema } from "@cadence/contracts/common";
import { getIdempotencyKey } from "../../platform/idempotency";
import { withCallerRls } from "../../platform/caller-rls";
import { eventAccess, noteAudience, noteChange, requireOwner } from "../../platform/list-access";
import { apiValidator } from "../../platform/validation";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { replanReminders } from "../push/reminder-clock";
import {
    createEvent,
    deleteEvent,
    getEventForCaller,
    listEvents,
    setEventNotify,
    updateEvent,
} from "./personal-events.service";

const REMINDER_FIELDS = new Set(["label", "monthDay", "startedOn", "notify"]);

export const personalEventRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

    // ── Create ──
    .post("/", apiValidator("json", insertPersonalEventSchema), async (c) => {
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const data = await withCallerRls(c, (tx, userId) => createEvent(tx, userId, body, idempotencyKey));
        return c.json({ data }, 201);
    })

    // ── Update ──
    .patch(
        "/:id",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", updatePersonalEventSchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const body = c.req.valid("json");
            const { data, access } = await withCallerRls(c, async (tx, userId) => {
                const access = await eventAccess(tx, userId, id);
                if (access.role === "owner") {
                    const data =
                        Object.keys(body).length > 0
                            ? await updateEvent(tx, access.ownerId, id, body)
                            : await getEventForCaller(tx, userId, id);
                    return { data, access };
                }
                const { notify, ...rest } = body;
                if (notify !== undefined) await setEventNotify(tx, id, notify);
                if (Object.keys(rest).length > 0) await updateEvent(tx, access.ownerId, id, rest);
                const data = await getEventForCaller(tx, userId, id);
                return { data, access };
            });
            if (access.audience.length > 1) {
                noteAudience(c, access);
                noteChange(c, { type: "event" });
                if (Object.keys(body).some((k) => REMINDER_FIELDS.has(k))) {
                    for (const uid of access.audience) c.executionCtx.waitUntil(replanReminders(c.env, uid));
                }
            }
            return c.json({ data });
        },
    )

    // ── Read (List) ──
    .get("/", async (c) => {
        const data = await withCallerRls(c, listEvents);
        return c.json({ data });
    })

    // ── Delete ──
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        const { data, access } = await withCallerRls(c, async (tx, userId) => {
            const access = await eventAccess(tx, userId, id);
            requireOwner(access, "event");
            return { data: await deleteEvent(tx, userId, id), access };
        });
        if (access.audience.length > 1) {
            noteAudience(c, access);
            noteChange(c, { type: "event" });
            for (const uid of access.audience) c.executionCtx.waitUntil(replanReminders(c.env, uid));
        }
        return c.json({ data });
    });
