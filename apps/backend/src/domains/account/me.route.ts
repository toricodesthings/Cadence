import { Hono } from "hono";
import { setTimeZoneSchema } from "@cadence/contracts/account";
import type { AuthVariables } from "../../platform/auth";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { syncUserZone } from "../../platform/user-zone";
import { apiValidator } from "../../platform/validation";
import type { Env } from "../../types/env";

export const meRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // The client calls this on start and when the zone really changes (not on every focus: a write wakes the database).
    .put("/time-zone", apiValidator("json", setTimeZoneSchema), async (c) => {
        const userId = c.get("userId");
        const { timeZone } = c.req.valid("json");
        const stored = await withRls(getDbClient(c.env), userId, (tx) => syncUserZone(tx, userId, timeZone));
        return c.json({ data: { timeZone: stored } });
    });
