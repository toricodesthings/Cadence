import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDbClient } from "../lib/db";
import { checkIdempotency, recordMutation } from "../lib/idempotency";
import { withRls } from "../lib/rls";
import { savedFocusViews, users } from "../db/schema";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { apiValidator } from "../lib/validation";
import {
    savedFocusViewInputSchema,
    savedFocusViewPatchSchema,
    settingsPatchSchema,
} from "../types/settings";
import { SETTINGS_DEFAULTS } from "../types/settings-defaults";

function isObject(item: any): item is Record<string, any> {
    return item && typeof item === "object" && !Array.isArray(item);
}

function deepMerge(target: any, source: any): any {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach((key) => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

/**
 * Normalize stored settings against canonical defaults.
 * - Merges in missing sections/keys from defaults
 * - Migrates legacy `preferredView` into `tasks.defaultView`
 */
export function normalizeSettings(stored: Record<string, any>): Record<string, any> {
    const merged = deepMerge(SETTINGS_DEFAULTS, stored);

    // Migrate legacy preferredView → tasks.defaultView
    if (stored.preferredView && !stored.tasks?.defaultView) {
        merged.tasks = { ...merged.tasks, defaultView: stored.preferredView };
    }

    return merged;
}

export const settingsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
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

        const normalized = normalizeSettings((user?.settings ?? {}) as Record<string, any>);
        return c.json({ data: normalized });
    })
    .patch("/", apiValidator("json", settingsPatchSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, async (tx) => {
            const [user] = await tx
                .select({ settings: users.settings })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            // Normalize stored settings first, then merge in patch
            const normalized = normalizeSettings((user?.settings || {}) as Record<string, any>);
            const merged = deepMerge(normalized, body);

            return tx
                .update(users)
                .set({
                    settings: merged,
                })
                .where(eq(users.id, userId))
                .returning({ settings: users.settings });
        });

        const normalizedResult = normalizeSettings((updated?.settings ?? {}) as Record<string, any>);
        return c.json({ data: normalizedResult });
    })
    .get("/focus-views", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(savedFocusViews)
                .where(eq(savedFocusViews.userId, userId))
                .orderBy(desc(savedFocusViews.isPinned), savedFocusViews.orderIndex, savedFocusViews.createdAt),
        );

        return c.json({ data: items });
    })
    .post("/focus-views", apiValidator("json", savedFocusViewInputSchema), async (c) => {
        const userId = c.get("userId");
        const { clientMutationId, ...body } = c.req.valid("json");
        const db = getDbClient(c.env);

        const view = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, clientMutationId);
            if (existingId) {
                const [existing] = await tx.select().from(savedFocusViews).where(and(eq(savedFocusViews.id, existingId), eq(savedFocusViews.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(savedFocusViews)
                .values({
                    ...body,
                    source: body.source ?? "manual",
                    userId,
                })
                .returning();

            await recordMutation(tx, userId, clientMutationId, row.id);
            return row;
        });

        return c.json({ data: view }, 201);
    })
    .patch("/focus-views/:id", apiValidator("param", z.object({ id: z.string().uuid() })), apiValidator("json", savedFocusViewPatchSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { clientMutationId, ...body } = c.req.valid("json");
        const db = getDbClient(c.env);

        const view = await withRls(db, userId, async (tx) => {
            const [existing] = await tx
                .select({ id: savedFocusViews.id })
                .from(savedFocusViews)
                .where(and(eq(savedFocusViews.id, id), eq(savedFocusViews.userId, userId)));
            if (!existing) return existing;

            const [row] = await tx
                .update(savedFocusViews)
                .set({ ...body, updatedAt: sql`NOW()` })
                .where(and(eq(savedFocusViews.id, id), eq(savedFocusViews.userId, userId)))
                .returning();

            if (clientMutationId) {
                await recordMutation(tx, userId, clientMutationId, row.id);
            }

            return row;
        });

        if (!view) {
            return c.notFound();
        }

        return c.json({ data: view });
    })
    .delete("/focus-views/:id", apiValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const [deleted] = await withRls(db, userId, (tx) =>
            tx
                .delete(savedFocusViews)
                .where(and(eq(savedFocusViews.id, id), eq(savedFocusViews.userId, userId)))
                .returning(),
        );

        if (!deleted) {
            return c.notFound();
        }

        return c.json({ data: deleted });
    });
