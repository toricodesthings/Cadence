import { Hono, type Context } from "hono";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { usageEvents, users } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { apiValidator } from "../../platform/validation";
import type { DbClient } from "../../platform/db";
import {
    trackEventSchema,
    trackBatchSchema,
    performanceBatchSchema,
    clientErrorBatchSchema,
} from "@cadence/contracts/events";
import { logger } from "../../platform/log";
import { getRequestId } from "../../platform/request-log";

async function isTrackingAllowed(
    db: DbClient,
    userId: string,
    setting: "usageDiagnostics" | "crashReports" = "usageDiagnostics",
): Promise<boolean> {
    const [user] = await withRls(db, userId, async (tx) =>
        tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1),
    );

    if (!user?.settings) return false;
    return user.settings.privacy?.[setting] !== false;
}

async function recordUsage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    c: Context<{ Bindings: Env; Variables: AuthVariables }, any, any>,
    events: { event: string; metadata?: Record<string, unknown> | null }[],
) {
    const userId = c.get("userId");
    const db = getDbClient(c.env);
    if (!(await isTrackingAllowed(db, userId))) {
        return c.json({ data: { tracked: false } }, 200);
    }

    c.executionCtx.waitUntil(
        withRls(db, userId, async (tx) => {
            await tx
                .insert(usageEvents)
                .values(events.map((e) => ({ userId, event: e.event, metadata: e.metadata ?? null })));
        }),
    );

    return c.json({ data: { tracked: true } }, 201);
}

export const eventRoutes = new Hono<{
    Bindings: Env;
    Variables: AuthVariables;
}>()
    .post("/errors", apiValidator("json", clientErrorBatchSchema), async (c) => {
        if (!(await isTrackingAllowed(getDbClient(c.env), c.get("userId"), "crashReports"))) {
            return c.json({ data: { tracked: false } }, 200);
        }
        for (const error of c.req.valid("json").errors) {
            logger.error("frontend", "frontend_error", {
                ...error,
                origin: "frontend",
                schema: 1,
                requestId: getRequestId(c),
            });
        }
        return c.json({ data: { tracked: true } }, 201);
    })
    .post("/performance", apiValidator("json", performanceBatchSchema), async (c) => {
        const db = getDbClient(c.env);
        if (!(await isTrackingAllowed(db, c.get("userId")))) {
            return c.json({ data: { tracked: false } }, 200);
        }
        for (const sample of c.req.valid("json").samples) {
            logger.info("frontend", "frontend_startup", {
                ...sample,
                origin: "frontend",
                metric: "startup",
                schema: 1,
                requestId: getRequestId(c),
            });
        }
        return c.json({ data: { tracked: true } }, 201);
    })
    .post("/", apiValidator("json", trackEventSchema), async (c) => {
        const { event, metadata } = c.req.valid("json");
        return recordUsage(c, [{ event, metadata }]);
    })
    .post("/batch", apiValidator("json", trackBatchSchema), async (c) => {
        const { events } = c.req.valid("json");
        return recordUsage(c, events);
    });
