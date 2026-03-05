import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { users } from "../db/schema";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";

// Validated subset of settings — extensible for future prefs
const updateSettingsSchema = z.object({
    preferredView: z.enum(["list", "kanban"]).optional(),
}).passthrough(); // Allow unknown keys so we don't break old clients

export const settingsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // GET /api/settings — return current user settings
    .get("/", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const [user] = await withRls(db, userId, async (tx) =>
            tx
                .select({ settings: users.settings })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1)
        );

        return c.json({ data: (user?.settings ?? {}) as Record<string, unknown> });
    })
    // PATCH /api/settings — shallow merge into existing settings
    .patch("/", zValidator("json", updateSettingsSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, async (tx) =>
            tx
                .update(users)
                .set({
                    settings: sql`COALESCE(${users.settings}, '{}'::jsonb) || ${JSON.stringify(body)}::jsonb`,
                })
                .where(eq(users.id, userId))
                .returning({ settings: users.settings })
        );

        return c.json({ data: (updated?.settings ?? {}) as Record<string, unknown> });
    });
