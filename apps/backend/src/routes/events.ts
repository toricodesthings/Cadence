import { Hono } from "hono";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { usageEvents, users } from "../db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { apiValidator } from "../lib/validation";
import type { DbClient } from "../lib/db";
import { trackEventSchema, trackBatchSchema } from "../types/event";

export const eventRoutes = new Hono<{
    Bindings: Env;
    Variables: AuthVariables;
}>();

// POST /api/events — record a single event
eventRoutes.post(
    "/",
    apiValidator("json", trackEventSchema),
    async (c) => {
        const userId = c.get("userId");
        const { event, metadata } = c.req.valid("json");

        // Check if user has opted into usage diagnostics
        const db = getDbClient(c.env);
        const allowed = await isTrackingAllowed(db, userId);
        if (!allowed) {
            return c.json({ data: { tracked: false } }, 200);
        }

        c.executionCtx.waitUntil(
            withRls(db, userId, async (tx) => {
                await tx.insert(usageEvents).values({ userId, event, metadata: metadata ?? null });
            }),
        );

        return c.json({ data: { tracked: true } }, 201);
    },
);

// POST /api/events/batch — record multiple events
eventRoutes.post(
    "/batch",
    apiValidator("json", trackBatchSchema),
    async (c) => {
        const userId = c.get("userId");
        const { events } = c.req.valid("json");

        const db = getDbClient(c.env);
        const allowed = await isTrackingAllowed(db, userId);
        if (!allowed) {
            return c.json({ data: { tracked: false } }, 200);
        }

        c.executionCtx.waitUntil(
            withRls(db, userId, async (tx) => {
                await tx.insert(usageEvents).values(
                    events.map((e) => ({
                        userId,
                        event: e.event,
                        metadata: e.metadata ?? null,
                    })),
                );
            }),
        );

        return c.json({ data: { tracked: true } }, 201);
    },
);

async function isTrackingAllowed(db: DbClient, userId: string): Promise<boolean> {
    const [user] = await db
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user?.settings) return false;
    return user.settings.privacy?.usageDiagnostics !== false;
}
