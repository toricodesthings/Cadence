import { Hono } from "hono";
import { insertPersonalEventSchema, updatePersonalEventSchema } from "@cadence/contracts/personal-event";
import { uuidParamSchema } from "@cadence/contracts/common";
import { getIdempotencyKey } from "../../platform/idempotency";
import { withCallerRls } from "../../platform/caller-rls";
import { apiValidator } from "../../platform/validation";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { createEvent, deleteEvent, listEvents, updateEvent } from "./personal-events.service";

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
            const data = await withCallerRls(c, (tx, userId) => updateEvent(tx, userId, id, body));
            return c.json({ data });
        },
    )

    // ── Read (List) ──
    .get("/", async (c) => {
        const data = await withCallerRls(c, listEvents);
        return c.json({ data });
    })

    // ── Delete ──
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) =>
        c.json({ data: await withCallerRls(c, (tx, userId) => deleteEvent(tx, userId, c.req.valid("param").id)) }),
    );
