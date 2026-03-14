import { Hono } from "hono";
import { z } from "zod";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { usageEvents, users } from "../db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { apiValidator } from "../lib/validation";

const ALLOWED_EVENTS = [
    "task.complete",
    "task.reschedule",
    "task.create",
    "task.reorder",
    "habit.complete",
    "habit.skip",
    "inbox.capture",
    "inbox.process",
    "schedule.open",
    "schedule.drag",
    "search.query",
    "export.request",
] as const;

const trackEventSchema = z.object({
    event: z.enum(ALLOWED_EVENTS),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

const trackBatchSchema = z.object({
    events: z.array(trackEventSchema).min(1).max(50),
});

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
            return c.json({ ok: true, tracked: false }, 200);
        }

        c.executionCtx.waitUntil(
            withRls(db, userId, async (tx) => {
                await tx.insert(usageEvents).values({ userId, event, metadata: metadata ?? null });
            }),
        );

        return c.json({ ok: true, tracked: true }, 201);
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
            return c.json({ ok: true, tracked: false }, 200);
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

        return c.json({ ok: true, tracked: true }, 201);
    },
);

async function isTrackingAllowed(db: ReturnType<typeof getDbClient>, userId: string): Promise<boolean> {
    const [user] = await db
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user?.settings) return false;
    return user.settings.privacy?.usageDiagnostics !== false;
}
